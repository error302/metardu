// Promote a pinned, committed release into the one existing production stack.
// Never exports credentials, clones customer databases, or creates preview services.
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, createWriteStream, statfsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import pg from 'pg'
import { computeDrift, migrationChecksums, RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
import { pinnedReleaseArguments, assertSurveyReleaseDrift, compatibleRollbackRegistry, rollbackService, forwardPromotionService, deployedAppRevision, assertBuildSpace, assertSyntheticUpgradeProof } from './release-plan.mjs'
import { verifyRollbackRegistry } from './verify-rollback-registry.mjs'
import { commandFailureDetails, collectFailedAppDiagnostics } from './release-failure-diagnostics.mjs'
import { readImportSchemaContract, assertImportSchemaContract, OBSERVATION_COMPATIBILITY_VERSION } from './import-schema-contract.mjs'
import { readFieldObservationContract, assertFieldObservationContract, FIELD_OBSERVATION_VERSION } from './field-observation-contract.mjs'
import { snapshotExistingRows } from './release-row-snapshot.mjs'

const legacy = process.argv.length === 3
const requested = legacy ? { revision:'c1591bda793e415d300f7f58176e1ced8c020f6b',directory:resolve('.cache/release-verify/auth-release') }
  : pinnedReleaseArguments(process.argv.slice(2),process.cwd())
const directory = requested.directory
const receiptPath = join(directory, 'promotion.json')
const revision = requested.revision
const candidateTag = 'metardu-metardu-app:candidate'
const rollbackTag = 'metardu-metardu-app:rollback-current'
const names = ['metardu-app','metardu-postgres','metardu-redis','metardu-worker','metardu-collaboration','metardu-ntrip','metardu-backup']
mkdirSync(directory, { recursive: true })
function command(binary,args,options={}) {
  const { rawOutput = false, ...spawnOptions } = options
  const result = spawnSync(binary,args,{encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:16*1024*1024,...spawnOptions})
  if(result.error || result.status!==0) {
    const error=new Error(`${binary} ${args[0]} failed (exit ${result.status}); credential-bearing diagnostics suppressed`)
    error.commandFailure=commandFailureDetails(binary,args[0],result,spawnOptions.timeout??30000)
    throw error
  }
  return rawOutput ? result.stdout : result.stdout.trim()
}
const docker = (args,options) => command('docker',args,options)
const git = (args,options) => command('git',['-c','core.fsmonitor=false',...args],options)
const envOf = container => Object.fromEntries(container.Config.Env.map(value => {const i=value.indexOf('=');return[value.slice(0,i),value.slice(i+1)]}))
const mounts = c => c.Mounts.map(m=>({type:m.Type,name:m.Name??null,source:m.Source,destination:m.Destination,rw:m.RW})).sort((a,b)=>a.destination.localeCompare(b.destination))
const describe = c => ({name:c.Name.slice(1),id:c.Id,image:c.Image,startedAt:c.State.StartedAt,mounts:mounts(c)})
const save = receipt => writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n')
const load = () => { const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));assert.equal(receipt.revision,revision,'The receipt belongs to a different pinned source revision.');return receipt }
const inspect = () => JSON.parse(docker(['inspect',...names]))
function stageMigrations(files) {
  const staging=join(directory,'migration-source')
  for(const file of files){const destination=join(staging,file.path);mkdirSync(resolve(destination,'..'),{recursive:true});writeFileSync(destination,file.content)}
  for(const name of ['migrate-unified.mjs','verify-migrations.mjs']){mkdirSync(join(staging,'scripts'),{recursive:true});writeFileSync(join(staging,'scripts',name),git(['show',`${revision}:scripts/${name}`],{rawOutput:true}))}
  return staging
}
function runMigrations(staging, databaseUrl) {
  return spawnSync(process.execPath,[join(staging,'scripts/migrate-unified.mjs')],{cwd:staging,env:{...process.env,DATABASE_URL:databaseUrl},encoding:'utf8',windowsHide:true,timeout:180_000,maxBuffer:8*1024*1024})
}
function sourceMigrations() {
  return git(['ls-tree','-r','--name-only',revision,'src/lib/db/migrations']).split('\n').filter(p=>p.endsWith('.sql')).sort().map(path=>{
    const content=git(['show',`${revision}:${path}`],{rawOutput:true})
    return {version:path.split('/').at(-1).replace(/\.sql$/,''),path,content,...migrationChecksums(Buffer.from(content))}
  })
}
function databaseConfig(containers) {
  const postgres=containers.find(c=>c.Name==='/metardu-postgres'), environment=envOf(postgres)
  assert.deepEqual(postgres.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'5432'}])
  return {host:'127.0.0.1',port:5432,database:environment.POSTGRES_DB,user:environment.POSTGRES_USER,password:environment.POSTGRES_PASSWORD,connectionTimeoutMillis:5000,statement_timeout:60000}
}
async function withAdmin(containers,work) {
  const client=new pg.Client(databaseConfig(containers));await client.connect()
  try{return await work(client)}finally{await client.end()}
}
const ledger = async client => (await client.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
function validateContainers(before) {
  for(const container of before) assert.ok(container.State.Running,`${container.Name} must be running`)
  assert.equal(before.find(c=>c.Name==='/metardu-app').State.Health.Status,'healthy')
  const applications=docker(['ps','-a','--format','{{json .}}']).split('\n').map(line=>line.trim()).filter(Boolean).map(line=>JSON.parse(line)).filter(c=>c.Labels?.includes('com.docker.compose.service=metardu-app'))
  assert.equal(applications.length,1,'Exactly one application container is required')
}
function composeConfig() {return JSON.parse(docker(['compose','-f','docker-compose.yml','config','--format','json']))}
function assertEnvironment(before, config) {
  const old=envOf(before.find(c=>c.Name==='/metardu-app')), next=config.services['metardu-app'].environment
  for(const [key,value] of Object.entries(next)) if(key!=='METARDU_BUILD_SHA') assert.equal(String(value??''),String(old[key]??''),`Review runtime setting before changing it: ${key}`)
}
async function plan() {
  if(existsSync(receiptPath)) throw new Error('A release receipt already exists. Inspect its status before changing or resuming this release.')
  assert.equal(git(['rev-parse',revision]),revision)
  const before=inspect();validateContainers(before)
  assert.notEqual(envOf(before.find(c=>c.Name==='/metardu-app')).METARDU_BUILD_SHA,revision,'This release is already promoted; use read-only verification')
  const config=composeConfig();assertEnvironment(before,config)
  const files=sourceMigrations()
  const applied=await withAdmin(before,ledger)
  const drift=legacy?computeDrift(files,applied):assertSurveyReleaseDrift(files,applied)
  assert.equal(drift.mutated.length,0,'Applied migration hashes must remain unchanged')
  assert.equal(drift.ghost.length,0,'No applied migration may be omitted')
  const recovery=JSON.parse(readFileSync('test-results/recovery-proof/verification.json','utf8'))
  assert.equal(recovery.status,'passed')
  assert.ok(Object.values(recovery.cleanup).every(value=>value===true))
  const app=before.find(c=>c.Name==='/metardu-app'), image=app.Image
  const rollbackIdentity=deployedAppRevision(app,JSON.parse(docker(['image','inspect',image]))[0])
  assert.equal(git(['rev-parse',rollbackIdentity.revision]),rollbackIdentity.revision,'The rollback revision must exist in this repository.')
  const result={revision,status:'planned',candidateTag,rollbackTag,before:before.map(describe),project:before.find(c=>c.Name==='/metardu-app').Config.Labels['com.docker.compose.project'],
    migrationBefore:applied,pending:drift.missing,rollbackImage:image,priorRevision:rollbackIdentity.revision,rollbackIdentity,
    sourceRegistry:files.map(file=>({version:file.version,checksum:file.checksum})),
    recoveryEvidence:{status:recovery.status,archiveSha256:recovery.archiveSha256,cleanup:recovery.cleanup},phases:[]}
  if(!legacy) {
    assertBuildSpace(hostFreeBytes())
    const parsed=await withAdmin(before,async client=>{
      const rows=(await client.query('SELECT cross_section_template::text AS value FROM road_alignments WHERE cross_section_template IS NOT NULL')).rows
      for(const row of rows){try{JSON.parse(row.value)}catch{throw new Error('An existing template is invalid JSON; reconcile that legacy record before promotion. Diagnostic payload suppressed.')}}
      return rows.length
    })
    result.compatibility={existingTemplatesParseAsJson:true,templateRows:parsed,reviewedPendingVersions:drift.missing}
    result.compatibility.importContract=await withAdmin(before,async client=>assertImportSchemaContract(await readImportSchemaContract(client,envOf(before.find(c=>c.Name==='/metardu-app')).DB_USER),{allowPendingObservationExtension:drift.missing.includes(OBSERVATION_COMPATIBILITY_VERSION)}))
    result.compatibility.fieldContract=await withAdmin(before,async client=>assertFieldObservationContract(await readFieldObservationContract(client,envOf(before.find(c=>c.Name==='/metardu-app')).DB_USER),{pending:drift.missing.includes(FIELD_OBSERVATION_VERSION)}))
    result.hostFreeBytes=hostFreeBytes()
  }
  save(result)
  console.log(JSON.stringify({revision,image,applied:applied.length,pending:drift.missing,configurationPreserved:true,priorRecoveryProof:true,oneApplication:true}))
}
function hostFreeBytes(){const stats=statfsSync(process.cwd());return stats.bavail*stats.bsize}
function rollbackRegistry(receipt,files,applied){
  const selected=compatibleRollbackRegistry(files,applied)
  const key=createHash('sha256').update(JSON.stringify(applied)).digest('hex').slice(0,16)
  const target=join(directory,'rollback-registry',key);mkdirSync(target,{recursive:true})
  for(const file of selected)writeFileSync(join(target,file.path.split('/').at(-1)),file.content)
  return {directory:target,versions:selected.map(file=>file.version),strictVerification:true,originalHashesPreserved:true}
}
async function build() {
  const receipt=load();assert.equal(receipt.status,'planned')
  assert.equal(receipt.rehearsal?.passed,true,'Pending SQL must first succeed on the existing synthetic database')
  if(!legacy){const proof=JSON.parse(readFileSync(join(directory,'source-checks.json'),'utf8'));assert.equal(proof.revision,revision);assert.equal(proof.status,'passed');receipt.sourceChecks=proof.checks}
  if(!legacy)assert.equal(receipt.rehearsal.rollbackVerifier?.passed,true,'The current image startup verifier must accept the pinned forward registry in the existing synthetic database.')
  if(!legacy&&receipt.pending.length){const proof=JSON.parse(readFileSync(join(directory,'upgrade-checks.json'),'utf8'));assertSyntheticUpgradeProof(proof,revision,{pending:receipt.pending,sourceRegistry:receipt.sourceRegistry});receipt.syntheticUpgrade=proof}
  else if(!legacy){
    assert.equal(receipt.rehearsal.applied,receipt.migrationBefore.length,'A no-SQL release must match the complete applied registry in both plan and rehearsal.')
    receipt.syntheticUpgrade={notRequired:true,reason:'No pending SQL; full applied registry matched production and synthetic rehearsal.'}
  }
  const before=inspect();assert.equal(before.find(c=>c.Name==='/metardu-app').Image,receipt.rollbackImage)
  assertBuildSpace(hostFreeBytes())
  const priorTag=JSON.parse(docker(['image','inspect',rollbackTag]))[0].Id
  if(priorTag!==receipt.rollbackImage){
    // Preserve the previous rollback by content, without overwriting the older
    // rollback-prior-current alias or allocating another image layer.
    const alias=`metardu-metardu-app:rollback-${priorTag.replace('sha256:','').slice(0,16)}`
    const probe=spawnSync('docker',['image','inspect',alias,'--format','{{.Id}}'],{encoding:'utf8',windowsHide:true})
    assert.ok(probe.status!==0||probe.stdout.trim()===priorTag,'Preserve an existing prior rollback alias before reusing it.')
    docker(['image','tag',priorTag,alias]);receipt.preservedPriorRollback={image:priorTag,tag:alias}
  }
  docker(['image','tag',receipt.rollbackImage,rollbackTag])
  assert.equal(docker(['image','inspect',rollbackTag,'--format','{{.Id}}']),receipt.rollbackImage)
  const config=composeConfig();assertEnvironment(before,config)
  const args=['build','--builder','desktop-linux','--progress=plain','--tag',candidateTag,'--label',`org.opencontainers.image.revision=${revision}`,
    '--build-arg',`NEXT_PUBLIC_APP_URL=${config.services['metardu-app'].environment.NEXT_PUBLIC_APP_URL}`,
    '--build-arg',`NEXT_PUBLIC_PAYPAL_CLIENT_ID=${config.services['metardu-app'].build.args.NEXT_PUBLIC_PAYPAL_CLIENT_ID||''}`,'-']
  const archive=spawn('git',['-c','core.fsmonitor=false','archive','--format=tar',revision],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  const logPath=join(directory,`build-${(receipt.buildAttempts?.length??0)+1}.log`),log=createWriteStream(logPath,{flags:'wx'})
  const builder=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']})
  builder.stdout.pipe(log,{end:false});builder.stderr.pipe(log,{end:false})
  const attempt={startedAt:new Date().toISOString(),builderPid:builder.pid,archivePid:archive.pid,log:logPath,status:'running'}
  receipt.buildAttempts=[...(receipt.buildAttempts??[]),attempt];receipt.status='building';save(receipt)
  let spaceFailure=false
  const monitor=setInterval(()=>{try{assertBuildSpace(hostFreeBytes())}catch{spaceFailure=true;builder.kill('SIGTERM');archive.kill('SIGTERM')}},5000)
  archive.stdout.pipe(builder.stdin)
  builder.stdin.on('error',()=>{})
  const archiveDone=new Promise((resolve,reject)=>{archive.once('error',reject);archive.once('exit',code=>code===0?resolve():reject(new Error('Committed build archive failed')))})
  const buildDone=new Promise((resolve,reject)=>{builder.once('error',reject);builder.once('exit',code=>code===0?resolve():reject(new Error(`Candidate build failed: ${code}`)))})
  try{await Promise.all([archiveDone,buildDone]);assert.ok(!spaceFailure,'Build cancelled at the host free-space reserve.')}
  catch(error){builder.kill('SIGTERM');archive.kill('SIGTERM');await Promise.allSettled([archiveDone,buildDone]);attempt.status='failed';attempt.reason=spaceFailure?'host-space-reserve':error.message;receipt.status='build-failed';save(receipt);throw error}
  finally{clearInterval(monitor);await new Promise(resolve=>log.end(resolve))}
  receipt.candidateImage=docker(['image','inspect',candidateTag,'--format','{{.Id}}'])
  assert.equal(JSON.parse(docker(['image','inspect',candidateTag]))[0].Config.Labels['org.opencontainers.image.revision'],revision)
  attempt.status='passed';receipt.status='built';save(receipt)
  console.log(JSON.stringify({status:receipt.status,image:receipt.candidateImage,revision}))
}
async function rehearse() {
  const receipt=load();assert.equal(receipt.status,'planned')
  const owned=JSON.parse(docker(['inspect','metardu-schema-rehearsal-20261008']))[0]
  assert.equal(owned.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
  assert.deepEqual(owned.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
  const address=new URL(rehearsalDatabaseConfig().adminUrl)
  assert.equal(address.port,'55433')
  address.pathname='/metardu_runtime_verify'
  const url=address.toString()
  const client=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});await client.connect()
  const files=sourceMigrations()
  try {
    const marker=(await client.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker
    assert.equal(marker,'METARDU synthetic beacon verification only 2026-10-08')
    const drift=computeDrift(files,await ledger(client));assert.equal(drift.mutated.length,0);assert.equal(drift.ghost.length,0)
    receipt.rehearsal={database:'metardu_runtime_verify',pending:drift.missing,customerDataCopied:false,existingContainer:true}
    const result=runMigrations(stageMigrations(files),url)
    if(result.error||result.status!==0) {
      receipt.rehearsal.failedAt=(result.stdout||'').match(/Applying: ([^\r\n]+)/g)?.at(-1)||'preflight'
      receipt.rehearsal.errorCode=(result.stderr||'').match(/code: ['"]([A-Z0-9]+)['"]/)?.[1]||null
      save(receipt);throw new Error(`Synthetic migration rehearsal failed: ${receipt.rehearsal.failedAt}`)
    }
    const after=await ledger(client);assert.ok(computeDrift(files,after).ok)
    receipt.rehearsal.importContract=assertImportSchemaContract(await readImportSchemaContract(client,rehearsalDatabaseConfig().runtimeRole))
    receipt.rehearsal.fieldContract=assertFieldObservationContract(await readFieldObservationContract(client,rehearsalDatabaseConfig().runtimeRole))
    await client.query('SELECT capture_snapshot,client_reading_id FROM verticality_readings WHERE false')
    const constraints=await client.query("SELECT conname,convalidated FROM pg_constraint WHERE conname IN ('setout_capture_snapshot_shape','verticality_capture_snapshot_shape') ORDER BY conname")
    assert.equal(constraints.rows.length,2);assert.ok(constraints.rows.every(row=>row.convalidated))
    if(!legacy)receipt.rehearsal.rollbackVerifier=verifyRollbackRegistry({app:inspect().find(c=>c.Name==='/metardu-app'),fixture:JSON.parse(docker(['inspect',owned.Id]))[0],
      registry:join(stageMigrations(files),'src/lib/db/migrations'),revision,runtimeUrl:rehearsalDatabaseConfig().runtimeUrl})
    receipt.rehearsal.passed=true;receipt.rehearsal.applied=after.length;receipt.rehearsal.constraints=constraints.rows;save(receipt)
    console.log(JSON.stringify(receipt.rehearsal))
  }finally{await client.end()}
}
async function migrateAndPromote() {
  const receipt=load();assert.equal(receipt.status,'built')
  const before=inspect();validateContainers(before)
  const app=before.find(c=>c.Name==='/metardu-app'),oldEnv=envOf(app)
  assert.equal(app.Image,receipt.rollbackImage)
  assert.equal(docker(['image','inspect',rollbackTag,'--format','{{.Id}}']),receipt.rollbackImage)
  assert.equal(docker(['image','inspect',candidateTag,'--format','{{.Id}}']),receipt.candidateImage)
  assertEnvironment(before,composeConfig())
  const files=sourceMigrations()
  const applied=await withAdmin(before,ledger)
  if(!legacy)assertSurveyReleaseDrift(files,applied)
  assert.deepEqual(applied,receipt.migrationBefore)
  receipt.importContractBefore=await withAdmin(before,async client=>assertImportSchemaContract(await readImportSchemaContract(client,oldEnv.DB_USER),{allowPendingObservationExtension:receipt.pending.includes(OBSERVATION_COMPATIBILITY_VERSION)}))
  receipt.fieldContractBefore=await withAdmin(before,async client=>assertFieldObservationContract(await readFieldObservationContract(client,oldEnv.DB_USER),{pending:receipt.pending.includes(FIELD_OBSERVATION_VERSION)}))
  const jobs=await withAdmin(before,async client=>(await client.query(`SELECT
    (SELECT count(*)::integer FROM background_jobs WHERE status='running') AS background,
    (SELECT count(*)::integer FROM render_jobs WHERE status='running') AS render,
    (SELECT count(*)::integer FROM drone_processing_tasks WHERE status IN ('uploading','running','importing')) AS drone`)).rows[0])
  assert.ok(Object.values(jobs).every(value=>value===0),'Wait for active jobs before maintenance')
  const staging=stageMigrations(files)
  const override=join(directory,'promotion.override.yml')
  writeFileSync(override,JSON.stringify({services:{'metardu-app':forwardPromotionService(candidateTag,revision,app)}},null,2))
  receipt.status='maintenance';save(receipt)
  docker(['stop','--timeout','20','metardu-app'],{timeout:40_000})
  try {
    const priorLogs=spawnSync('docker',['logs','--timestamps','metardu-app'],{encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:16*1024*1024})
    assert.equal(priorLogs.status,0,'Preserve the previous application logs before replacement')
    const logArchive=`/backups/app-before-auth-${revision.slice(0,8)}.log`
    docker(['exec','-i','metardu-backup','bash','-c',`set -o noclobber; umask 077; cat > ${logArchive}`],{input:priorLogs.stdout+priorLogs.stderr})
    receipt.previousApplicationLogArchive=logArchive;save(receipt)
    const backup=docker(['exec','-e','BACKUP_RETENTION=36500','metardu-backup','/app/scripts/backup.sh'],{timeout:120_000})
    assert.ok(backup.includes('Backup integrity verified.') && backup.includes('Backup complete.'))
    receipt.checkpoint={database:backup.match(/Database backup: (\/backups\/db_[0-9_]+\.sql\.gz)/)?.[1],uploads:backup.match(/Uploads backup: (\/backups\/uploads_[0-9_]+\.tar\.gz)/)?.[1]}
    assert.ok(receipt.checkpoint.database&&receipt.checkpoint.uploads);save(receipt)
    console.log('Fresh database and upload checkpoint verified; existing archives preserved.')
    receipt.existingRecordsBefore=await withAdmin(before,client=>snapshotExistingRows(client));save(receipt)
    const config=databaseConfig(before)
    const address=new URL('postgresql://localhost');address.hostname=config.host;address.port=String(config.port);address.username=config.user;address.password=config.password;address.pathname='/'+config.database
    const result=runMigrations(staging,address.toString())
    receipt.migrationExit=result.status
    receipt.migrationSummary=(result.stdout||'').split('\n').filter(line=>/Applying:|Applied |All migrations|up to date|pending|successfully/i.test(line));save(receipt)
    if(result.error||result.status!==0) throw new Error(`Migration runner failed at ${(result.stdout||'').match(/Applying: ([^\r\n]+)/g)?.at(-1)||'preflight'}; database diagnostic payload suppressed`)
    const afterLedger=await withAdmin(before,ledger)
    assert.ok(computeDrift(files,afterLedger).ok)
    assert.ok(applied.every(row=>afterLedger.some(next=>next.version===row.version&&next.checksum===row.checksum)))
    const recordsAfter=await withAdmin(before,client=>snapshotExistingRows(client,receipt.existingRecordsBefore.catalog))
    assert.deepEqual(recordsAfter.rows,receipt.existingRecordsBefore.rows,'Original recorded values must survive migration unchanged')
    receipt.existingRecordsPreserved=true
    receipt.importContractAfter=await withAdmin(before,async client=>assertImportSchemaContract(await readImportSchemaContract(client,oldEnv.DB_USER)))
    receipt.fieldContractAfter=await withAdmin(before,async client=>assertFieldObservationContract(await readFieldObservationContract(client,oldEnv.DB_USER)))
    assert.equal(receipt.fieldContractAfter.restrictivePolicyHash,receipt.fieldContractBefore.restrictivePolicyHash,'Existing restrictive field policies must remain unchanged.')
    const access=await withAdmin(before,async client=>(await client.query(`SELECT
      has_table_privilege($1,$2,'SELECT') AS can_read,
      has_table_privilege($1,$2,'INSERT') AS can_insert`,[oldEnv.DB_USER,legacy?'public.marketing_email_deliveries':'public.pipeline_asbuilt_batches'])).rows[0])
    assert.ok(Object.values(access).every(Boolean),'Runtime must receive its ordinary privileges on the new table')
    if(legacy) {
      const mutable=await withAdmin(before,async client=>(await client.query(`SELECT
        has_table_privilege($1,'public.marketing_email_deliveries','UPDATE') AS can_update,
        has_table_privilege($1,'public.marketing_email_deliveries','DELETE') AS can_delete`,[oldEnv.DB_USER])).rows[0])
      assert.ok(Object.values(mutable).every(Boolean),'Preserve the earlier release runtime privilege checks')
    }
    receipt.migrationAfter=afterLedger;receipt.status='migrated';save(receipt)
    console.log(`Production migrations verified: ${afterLedger.length} entries; historical hashes unchanged.`)
    docker(['compose','-p',receipt.project,'-f','docker-compose.yml','-f',override,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','120','metardu-app'],{timeout:150_000})
    const after=inspect(),updated=after.find(c=>c.Name==='/metardu-app')
    assert.equal(updated.Image,receipt.candidateImage);assert.equal(updated.State.Health.Status,'healthy')
    for(const prior of before){const kept=after.find(c=>c.Name===prior.Name);assert.deepEqual(mounts(kept),mounts(prior));if(prior.Name!=='/metardu-app'){assert.equal(kept.Id,prior.Id);assert.equal(kept.State.StartedAt,prior.State.StartedAt)}}
    assert.equal(envOf(updated).METARDU_BUILD_SHA,revision)
    const appClient=new pg.Client({...databaseConfig(before),user:oldEnv.DB_USER,password:oldEnv.DB_PASSWORD});await appClient.connect()
    try{assert.equal(runtimeDatabaseRoleFailure((await appClient.query(RUNTIME_ROLE_QUERY)).rows[0]),null)}finally{await appClient.end()}
    docker(['image','tag',receipt.candidateImage,'metardu-metardu-app:latest'])
    receipt.after=after.map(describe);receipt.status='promoted';save(receipt)
    console.log(JSON.stringify({status:receipt.status,revision,image:updated.Image,migrations:afterLedger.length,requiredServicesPreserved:true,uploadsPreserved:true}))
  }catch(error){
    receipt.status='failed';receipt.failure=error.message
    if(error.commandFailure)receipt.commandFailure=error.commandFailure
    // Capture the failed candidate before Compose removes it for rollback.
    // Only bounded, credential-redacted evidence is retained locally.
    receipt.failedStartup=collectFailedAppDiagnostics(receipt.candidateImage,oldEnv)
    save(receipt)
    // Do not restore database archives over customer data or reverse forward-only migrations.
    // Keep the original app available when migration failed before replacement.
    try{
      const actual=await withAdmin(before,ledger)
      receipt.rollbackRegistry=rollbackRegistry(receipt,files,actual)
      const rollbackOverride=join(directory,'rollback.override.yml')
      writeFileSync(rollbackOverride,JSON.stringify({services:{'metardu-app':rollbackService(rollbackTag,receipt.priorRevision,receipt.rollbackRegistry.directory)}},null,2))
      docker(['compose','-p',receipt.project,'-f','docker-compose.yml','-f',rollbackOverride,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','120','metardu-app'],{timeout:150_000})
      const restored=inspect();assert.equal(restored.find(c=>c.Name==='/metardu-app').Image,receipt.rollbackImage)
      assert.equal(restored.find(c=>c.Name==='/metardu-app').State.Health.Status,'healthy')
      for(const prior of before.filter(c=>c.Name!=='/metardu-app')){const kept=restored.find(c=>c.Name===prior.Name);assert.equal(kept.Id,prior.Id);assert.equal(kept.State.StartedAt,prior.State.StartedAt);assert.deepEqual(mounts(kept),mounts(prior))}
      receipt.status='rolled-back';receipt.rollbackHealthy=true;save(receipt)
    }catch(rollbackError){receipt.status='maintenance-failure';receipt.rollbackFailure=rollbackError.message;save(receipt)}
    throw error
  }
}
try {
  const action=process.argv[2]
  if(action==='plan') await plan()
  else if(action==='rehearse') await rehearse()
  else if(action==='build') await build()
  else if(action==='promote') await migrateAndPromote()
  else if(action==='status') console.log(JSON.stringify(load(),null,2))
  else throw new Error('Use plan, rehearse, build, or promote')
}catch(error){console.error(error instanceof assert.AssertionError ? `Release guard failed: ${error.message.split('\n')[0]}` : error.message);process.exitCode=1}
