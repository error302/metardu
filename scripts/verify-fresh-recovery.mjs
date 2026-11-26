// Explicitly requested recovery proof. Restores the named customer archives ONLY
// in the existing owned rehearsal service, then removes the temporary copies.
// No SQL/customer file content, filenames, credentials or row identities are logged.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { rehearsalDatabaseConfig, parseRehearsalServiceIdentity, assertRehearsalServiceIdentity, parseRecoveryArchivePair, recoveryArchiveRoleDefinitions, expectedToleranceProfileAdditions, createRecoveryRoleOwnership, ownRecoveryRole, recoveryRolesForCleanup, recoveryProofSourceHashes, recoveryMigrationsDirectory, recoveryChildEnvironment, recoveryStatusAfterCleanup, resolveRecoveryPython, RECOVERY_PROOF_SOURCE_FILES, RECOVERY_REPORT_SCOPE } from './rehearsal-database.mjs'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure, collectFileMigrations, migrationChecksums, migrationSourcePaths } from './verify-migrations.mjs'

const rehearsalIdentityPath=resolve(process.env.METARDU_REHEARSAL_IDENTITY_FILE || '.cache/release-verify/rehearsal-service.json')
const recoveryArchivesPath=resolve(process.env.METARDU_RECOVERY_ARCHIVE_PAIR_FILE || '.cache/release-verify/recovery-archives.json')
const revisionIndex=process.argv.indexOf('--revision')
const revision=revisionIndex>=0?process.argv[revisionIndex+1]:null
assert.match(revision??'',/^[a-f0-9]{40}$/,'Supply the exact candidate revision with --revision.')
const service=parseRehearsalServiceIdentity(JSON.parse(readFileSync(rehearsalIdentityPath,'utf8')))
const {databaseArchive:dbArchive,uploadsArchive:uploadsArchive}=parseRecoveryArchivePair(JSON.parse(readFileSync(recoveryArchivesPath,'utf8')))
const database='metardu_recovery_verify'
const roleOwnership=createRecoveryRoleOwnership(randomUUID().replaceAll('-',''))
const runtimeRole=roleOwnership.runtimeRole
const uploadsDirectory=`/tmp/metardu-recovery-uploads-${randomUUID()}`
const marker='METARDU fresh-archive recovery verification 2026-10-10'
const qid=value=>`"${value.replaceAll('"','""')}"`
const qstr=value=>`'${value.replaceAll("'","''")}'`
function gitText(args) {
  const result=spawnSync('git',['-c','core.fsmonitor=false',...args],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024})
  assert.equal(result.status,0,'Git source inspection failed; diagnostics suppressed.')
  return result.stdout
}
function sourceRegistryForRevision(candidateRevision) {
  assert.equal(gitText(['rev-parse',candidateRevision]).trim(),candidateRevision,'The candidate revision must exist in this repository.')
  return migrationSourcePaths(gitText(['ls-tree','-r','--name-only',candidateRevision,'src/lib/db/migrations']).split('\n').map(path=>path.trim()).filter(Boolean)).map(path=>{
    const content=gitText(['show',`${candidateRevision}:${path}`])
    return {version:path.split('/').at(-1).replace(/\.sql$/,''),checksum:migrationChecksums(Buffer.from(content)).checksum}
  })
}
function proofSourceHashesForRevision(candidateRevision) {
  const contents={}
  for(const file of RECOVERY_PROOF_SOURCE_FILES)contents[file]=gitText(['show',`${candidateRevision}:${file}`])
  return recoveryProofSourceHashes(contents)
}
function workingTreeProofSourceHashes() {
  const contents={}
  for(const file of RECOVERY_PROOF_SOURCE_FILES)contents[file]=readFileSync(file)
  return recoveryProofSourceHashes(contents)
}
function assertCandidateCheckout(candidateRevision,sourceRegistry,expectedProofSourceSha256) {
  const diff=spawnSync('git',['-c','core.fsmonitor=false','diff','--quiet',candidateRevision,'--','src/lib/db/migrations'],{windowsHide:true})
  assert.equal(diff.status,0,'Recovery migration files must match the exact candidate revision.')
  assert.deepEqual(workingTreeProofSourceHashes(),expectedProofSourceSha256,'Recovery proof source files must match the exact candidate revision.')
  const working=collectFileMigrations(recoveryMigrationsDirectory())
  assert.deepEqual(working.map(file=>file.version),sourceRegistry.map(file=>file.version))
  for(const [index,file] of working.entries()) {
    const candidateChecksum=sourceRegistry[index].checksum
    assert.ok([file.checksum,...file.equivalentChecksums].includes(candidateChecksum),'Recovery migration checksum differs from the candidate revision.')
  }
}
const sourceRegistry=sourceRegistryForRevision(revision)
const sourceRegistrySha256=createHash('sha256').update(JSON.stringify(sourceRegistry)).digest('hex')
const proofSourceSha256=proofSourceHashesForRevision(revision)
const report={scope:RECOVERY_REPORT_SCOPE,revision,sourceRegistry,sourceRegistrySha256,proofSourceSha256,customerPayloadLogged:false,customerFilesWrittenToWorkspace:false,checks:[],cleanup:{},status:'prepared'}
let createdDatabase=false, createdUploadsDirectory=false, recoveryNetworkConnected=false, runtimeClient
let originalToleranceIds
const config=rehearsalDatabaseConfig()
assert.equal(config.database,service.database,'The recovery database configuration must match the inspected rehearsal service.')
const adminAddress=new URL(config.adminUrl)
assert.equal(adminAddress.hostname,'127.0.0.1')
assert.equal(adminAddress.port,'55433')
const admin=new pg.Client({connectionString:new URL('postgres',adminAddress).href,connectionTimeoutMillis:5000})
const recoveryAddress=new URL(database,adminAddress).href
function docker(args,input,encoding='utf8') {
  const result=spawnSync('docker',args,{input,encoding,windowsHide:true,timeout:30_000,maxBuffer:10*1024*1024})
  if(result.error || result.status!==0) throw new Error(`Docker ${args[0]} operation failed; sensitive output suppressed (exit ${result.status}).`)
  return result.stdout
}
function checked(name,detail={}) { report.checks.push({name,passed:true,...detail}); console.log(`PASS ${name}`) }
function save() { mkdirSync('test-results/recovery-proof',{recursive:true});writeFileSync('test-results/recovery-proof/verification.json',JSON.stringify(report,null,2)+'\n') }
const tableCatalog=`SELECT c.relname AS name,array_agg(a.attname::text ORDER BY a.attnum) AS columns
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
 AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
 GROUP BY c.oid,c.relname ORDER BY c.relname`
function fingerprintQuery(table,originalRowsOnly=false) {
  const keys=table.columns.map(qstr).join(',')
  const originalFilter=originalRowsOnly && table.name==='tolerance_profiles'
    ? `WHERE id::text=ANY(ARRAY[${originalToleranceIds.map(qstr).join(',')}]::text[])` : ''
  return `SELECT ${qstr(table.name)} AS name,count(*)::integer AS rows,
   md5(COALESCE(string_agg(md5(payload::text),'' ORDER BY md5(payload::text)),'')) AS fingerprint
   FROM (SELECT (SELECT jsonb_object_agg(j.key,CASE WHEN jsonb_typeof(j.value)='number'
        THEN to_jsonb(trim_scale((j.value #>> '{}')::numeric)) ELSE j.value END ORDER BY j.key)
        FROM jsonb_each(to_jsonb(t)) j WHERE j.key=ANY(ARRAY[${keys}])) AS payload
        FROM public.${qid(table.name)} t ${originalFilter}) rows`
}
async function snapshot(client,catalog,originalRowsOnly=false) {
  const rows=[]
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try { for(const table of catalog) rows.push((await client.query(fingerprintQuery(table,originalRowsOnly))).rows[0]);await client.query('COMMIT');return rows }
  catch(error){await client.query('ROLLBACK');throw error}
}
function productionSnapshot(catalog) {
  const sql='BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'+catalog.map(t=>`SELECT row_to_json(result) FROM (${fingerprintQuery(t)}) result;`).join('\n')+'\nROLLBACK;'
  return docker(['exec','-i','metardu-postgres','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],sql).trim().split('\n').filter(Boolean).map(JSON.parse)
}
function runSource(script,env) {
  const result=spawnSync(process.execPath,[script],{env:recoveryChildEnvironment(env),encoding:'utf8',windowsHide:true,timeout:120_000,maxBuffer:5*1024*1024})
  if(result.error || result.status!==0) {
    const migration=result.stdout?.match(/Applying: (\d+_[a-z_]+)/g)?.at(-1) ?? null
    const diagnostics=result.stderr ?? ''
    report.failedSourceCheck={script,exit:result.status,migration,
      permissionObject:diagnostics.match(/permission denied for (?:table|schema|relation|function) ([a-z_]+)/)?.[0] ?? null,
      violatedConstraint:diagnostics.match(/violates (?:foreign key|check|unique) constraint "([a-z_]+)"/)?.[1] ?? null,
      assertionTitle:diagnostics.match(/AssertionError \[ERR_ASSERTION\]: ([^\r\n]+)/)?.[1] ?? null,
      sourceLocation:diagnostics.match(/file:\/\/\/[^\r\n]*verify-organization-project-rls\.mjs:\d+/)?.[0] ?? null}
    throw new Error(`Source verification failed: ${script}; sensitive diagnostics suppressed.`)
  }
}
async function restoreDatabase() {
  // Use the existing matching 16.11 client. Do not strip the dump's \restrict
  // safety directives to accommodate the older 15.4 client in rehearsal.
  const backupBefore=JSON.parse(docker(['inspect','metardu-backup']))[0]
  assert.ok(!backupBefore.NetworkSettings.Networks[service.network])
  docker(['network','connect',service.network,'metardu-backup']);recoveryNetworkConnected=true
  const target=spawn('docker',['exec','-e',`PGPASSWORD=${decodeURIComponent(adminAddress.password)}`,'metardu-backup','bash','-o','pipefail','-c',`gzip -dc ${dbArchive} | psql -X -q -v ON_ERROR_STOP=1 --single-transaction -h ${service.container} -p 5432 -U ${decodeURIComponent(adminAddress.username)} -d ${database}`],{windowsHide:true,stdio:['ignore','ignore','pipe']})
  let targetDiagnostics=''
  target.stderr.on('data',chunk=>{if(targetDiagnostics.length<16384) targetDiagnostics+=chunk.toString()})
  const targetExit=new Promise((resolve,reject)=>{target.on('error',reject);target.on('close',resolve)})
  const timer=setTimeout(()=>target.kill(),60_000)
  let status
  try{status=await targetExit}finally{clearTimeout(timer);docker(['network','disconnect',service.network,'metardu-backup']);recoveryNetworkConnected=false}
  const backupAfter=JSON.parse(docker(['inspect','metardu-backup']))[0]
  assert.deepEqual(backupAfter.NetworkSettings.Networks,backupBefore.NetworkSettings.Networks)
  report.restoreClient='existing backup psql 16.11, unchanged archive safety directives'
  report.restoreExitCodes={archiveReaderAndPsql:status}
  report.backupOriginalNetworksRestored=true
  report.restoreDiagnostics={unsupportedRestrictCommand:/invalid command \\(?:un)?restrict/.test(targetDiagnostics),missingOwnerRole:/role .* does not exist/.test(targetDiagnostics)}
  if(status!==0) throw new Error('Archive restore failed and transaction rolled back; sensitive SQL diagnostics suppressed.')
}

try {
  const container=JSON.parse(docker(['inspect',service.container]))[0]
  assertRehearsalServiceIdentity(service,container)
  checked('existing rehearsal identity, loopback port and isolated mount')
  assertCandidateCheckout(revision,sourceRegistry,proofSourceSha256)
  checked('candidate revision, proof-source closure and migration registry match executed source',{sourceRegistrySha256,proofSourceFiles:RECOVERY_PROOF_SOURCE_FILES.length})
  report.archiveSha256={database:docker(['exec','metardu-backup','sha256sum',dbArchive]).split(/\s/)[0],uploads:docker(['exec','metardu-backup','sha256sum',uploadsArchive]).split(/\s/)[0]}
  const uploads= docker(['exec','metardu-backup','cat',uploadsArchive],undefined,null)
  const recoveryPython=resolveRecoveryPython()
  const manifestResult=spawnSync(recoveryPython,['scripts/recovery-archive-manifest.py'],{input:uploads,encoding:'utf8',windowsHide:true,maxBuffer:1024*1024})
  assert.equal(manifestResult.status,0,'Native archive inspection must pass; diagnostics intentionally suppressed.')
  const manifest=JSON.parse(manifestResult.stdout)
  checked('native upload archive path/type validation',{fileCount:Object.keys(manifest).length})
  if(!process.argv.includes('--execute')) { report.status='prepared';save();console.log('Prepared only. --execute is required for the explicitly requested recovery copy.');process.exit(0) }
  await admin.connect()
  const controlMarker=(await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",[service.database])).rows[0]?.marker
  assert.equal(controlMarker,service.marker,'The rehearsal control database marker does not match the inspected identity.')
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount,0,'Never overwrite an existing database.')
  assert.equal((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[runtimeRole])).rowCount,0,'Never overwrite an existing role.')
  for(const definition of recoveryArchiveRoleDefinitions()) {
    const existing=await admin.query('SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[definition.name])
    if(existing.rowCount===0) {
      const attributes=definition.superuser
        ? 'NOLOGIN SUPERUSER'
        : 'NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
      await admin.query(`CREATE ROLE ${qid(definition.name)} ${attributes}`)
      ownRecoveryRole(roleOwnership,definition.name)
    } else {
      const role=existing.rows[0]
      assert.equal(role.rolcanlogin,definition.login,`Recovery compatibility role ${definition.name} must not be a login.`)
      assert.equal(role.rolsuper,definition.superuser,`Recovery compatibility role ${definition.name} has unexpected superuser attributes.`)
      assert.equal(role.rolbypassrls,definition.bypassRls,`Recovery compatibility role ${definition.name} has unexpected RLS bypass attributes.`)
    }
  }
  checked('archive compatibility roles have the reviewed non-login attributes')
  await admin.query(`CREATE DATABASE ${qid(database)} TEMPLATE template0`);createdDatabase=true
  await admin.query(`COMMENT ON DATABASE ${qid(database)} IS ${qstr(marker)}`)
  await admin.query(`REVOKE ALL ON DATABASE ${qid(database)} FROM PUBLIC`)
  checked('new temporary database refuses public connections and preserves existing databases')
  await restoreDatabase()
  checked('actual named database archive restored atomically')
  runtimeClient=new pg.Client({connectionString:recoveryAddress,connectionTimeoutMillis:5000});await runtimeClient.connect()
  const catalog=(await runtimeClient.query(tableCatalog)).rows
  const restored=await snapshot(runtimeClient,catalog)
  const live=productionSnapshot(catalog)
  const liveBy=new Map(live.map(t=>[t.name,t]))
  const restoreDifferences=restored.filter(t=>JSON.stringify(t)!==JSON.stringify(liveBy.get(t.name))).map(t=>t.name)
  report.restoreTableCount=restored.length
  report.restoredRowCount=restored.reduce((n,t)=>n+t.rows,0)
  report.restoreComparedToCurrentProduction={differences:restoreDifferences,tableCount:restored.length}
  assert.equal(restoreDifferences.length,0,'Recovery versus current production content fingerprints differ; review timing/data before promotion.')
  checked('all restored application-table counts and content fingerprints match production',{tableCount:restored.length})
  assert.match(uploadsDirectory,/^\/tmp\/metardu-recovery-uploads-[0-9a-f-]{36}$/)
  docker(['exec','metardu-backup','mkdir','-m','700',uploadsDirectory]);createdUploadsDirectory=true
  docker(['exec','metardu-backup','tar','-xzf',uploadsArchive,'-C',uploadsDirectory])
  const actual=docker(['exec','metardu-backup','find',uploadsDirectory,'-type','f','-exec','sha256sum','{}','+']).trim().split('\n').filter(Boolean)
  const actualHashes=new Map(actual.map(line=>[line.slice(66).slice(uploadsDirectory.length+1),line.slice(0,64)]))
  assert.equal(actualHashes.size,Object.keys(manifest).length)
  for(const [name,value] of Object.entries(manifest)) assert.equal(actualHashes.get(name),value.sha256,'Recovered upload digest differs; filename suppressed.')
  checked('actual uploads extracted and every file SHA-256 matches native archive content',{fileCount:actualHashes.size,totalBytes:Object.values(manifest).reduce((n,f)=>n+f.bytes,0)})
  const beforeLedger=(await runtimeClient.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  originalToleranceIds=(await runtimeClient.query('SELECT id::text FROM public.tolerance_profiles')).rows.map(row=>row.id)
  await runtimeClient.end();runtimeClient=null
  const runtimePassword=randomBytes(32).toString('hex')
  const env={MIGRATION_DB_HOST:'127.0.0.1',MIGRATION_DB_PORT:'55433',MIGRATION_DB_NAME:database,MIGRATION_DB_USER:decodeURIComponent(adminAddress.username),MIGRATION_DB_PASSWORD:decodeURIComponent(adminAddress.password),APP_DB_HOST:'127.0.0.1',APP_DB_PORT:'55433',APP_DB_NAME:database,APP_DB_USER:runtimeRole,APP_DB_PASSWORD:runtimePassword,NODE_ENV:'production',DATABASE_URL:'',MIGRATIONS_DIR:''}
  ownRecoveryRole(roleOwnership,runtimeRole)
  runSource('scripts/provision-runtime-db-role.mjs',env)
  checked('ordinary source migration/role provisioner succeeds on actual restored records')
  runtimeClient=new pg.Client({connectionString:recoveryAddress});await runtimeClient.connect()
  const afterLedger=(await runtimeClient.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  const afterMap=new Map(afterLedger.map(r=>[r.version,r.checksum]))
  assert.ok(beforeLedger.every(r=>afterMap.get(r.version)===r.checksum),'Applied historical migration hashes must be unchanged.')
  const customerCatalog=catalog.filter(table=>table.name!=='schema_migrations')
  const originalCustomerRows=restored.filter(table=>table.name!=='schema_migrations')
  const upgraded=await snapshot(runtimeClient,customerCatalog,true)
  const newToleranceRows=(await runtimeClient.query('SELECT count(*)::integer AS count FROM public.tolerance_profiles WHERE NOT(id::text=ANY($1::text[]))',[originalToleranceIds])).rows[0].count
  const expectedAddedReferenceProfiles=expectedToleranceProfileAdditions(
    collectFileMigrations(recoveryMigrationsDirectory()).map(file=>file.version),
    beforeLedger.map(row=>row.version),
  )
  assert.equal(newToleranceRows,expectedAddedReferenceProfiles,'Unexpected reference-profile seed rows were added during the upgrade.')
  report.upgradePreservation={differences:originalCustomerRows.filter((t,i)=>JSON.stringify(t)!==JSON.stringify(upgraded[i])).map(t=>t.name),tableCount:customerCatalog.length,historicalHashesUnchanged:true,expectedAddedMigrationRows:afterLedger.length-beforeLedger.length,expectedAddedReferenceProfiles}
  assert.equal(report.upgradePreservation.differences.length,0,'Historical customer columns changed; investigate before promotion.')
  checked('historical customer-column counts/fingerprints and applied hashes survive upgrade',{appliedBefore:beforeLedger.length,appliedAfter:afterLedger.length,pendingApplied:afterLedger.length-beforeLedger.length})
  const roleAddress=new URL(recoveryAddress);roleAddress.username=runtimeRole;roleAddress.password=runtimePassword
  const restricted=new pg.Client({connectionString:roleAddress.href});await restricted.connect()
  try{report.runtimeIdentity=(await restricted.query(RUNTIME_ROLE_QUERY)).rows[0];assert.equal(runtimeDatabaseRoleFailure(report.runtimeIdentity),null)}finally{await restricted.end()}
  checked('actual restricted runtime login has no ownership, bypass, DDL or ledger-write privilege')
  await runtimeClient.end();runtimeClient=null
  runSource('scripts/verify-organization-project-rls.mjs',{DATABASE_URL:recoveryAddress,RUNTIME_DB_ROLE:runtimeRole})
  checked('organization owner/member/viewer/revocation and audit RLS rollback checks pass')
  report.status='passed'
} catch(error) {
  report.status='failed';report.failure={name:error.name,code:error.code ?? null,message:error instanceof assert.AssertionError ? 'Recovery assertion failed; inspect structured failed-stage evidence, not customer data.' : error.message}
  console.error(`Recovery check stopped: ${report.failure.message}`)
  process.exitCode=1
} finally {
  if(recoveryNetworkConnected) { try{docker(['network','disconnect',service.network,'metardu-backup']);report.cleanup.backupNetworkDisconnected=true}catch{report.cleanup.backupNetworkDisconnected=false;process.exitCode=1} }
  try{if(runtimeClient) await runtimeClient.end()}catch{}
  if(createdDatabase) {
    try {
      const target=(await admin.query('SELECT shobj_description(oid,\'pg_database\') AS marker FROM pg_database WHERE datname=$1',[database])).rows[0]
      assert.equal(target?.marker,marker)
      await admin.query(`DROP DATABASE ${qid(database)}`)
      report.cleanup.databaseRemoved=(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount===0
    }catch{report.cleanup.databaseRemoved=false;process.exitCode=1}
  }
  for(const role of recoveryRolesForCleanup(roleOwnership,{databaseCreated:createdDatabase,databaseRemoved:report.cleanup.databaseRemoved===true})) {
    try {
      await admin.query(`DROP ROLE IF EXISTS ${qid(role)}`)
      report.cleanup[`${role}Removed`]=(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount===0
    }catch{report.cleanup[`${role}Removed`]=false;process.exitCode=1}
  }
  try{await admin.end()}catch{}
  if(createdUploadsDirectory) {
    try{assert.match(uploadsDirectory,/^\/tmp\/metardu-recovery-uploads-[0-9a-f-]{36}$/);docker(['exec','metardu-backup','rm','-rf','--',uploadsDirectory]);docker(['exec','metardu-backup','test','!','-e',uploadsDirectory]);report.cleanup.uploadsCopyRemoved=true}catch{report.cleanup.uploadsCopyRemoved=false;process.exitCode=1}
  }
  report.status=recoveryStatusAfterCleanup(report.status,report.cleanup)
  save()
}
