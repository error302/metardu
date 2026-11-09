// Promote a pinned, committed release into the one existing production stack.
// Never exports credentials, clones customer databases, or creates preview services.
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, createWriteStream, statfsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import pg from 'pg'
import {assertSurveyPushEnvironment} from './survey-push-environment.mjs'
import {readScheduleSchemaContract,assertScheduleSchemaContract} from './schedule-schema-contract.mjs'
import {SCHEDULE_UPGRADE_VERSION} from './schedule-upgrade-contract.mjs'
import { computeDrift, migrationChecksums, RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'
import { rehearsalDatabaseConfig, pinnedRehearsalIdentity } from './rehearsal-database.mjs'
import { pinnedReleaseArguments, assertSurveyReleaseDrift, compatibleRollbackRegistry, rollbackService, forwardPromotionService, deployedAppRevision, assertBuildSpace, assertSyntheticUpgradeProof, assertCandidateBuildAdmission } from './release-plan.mjs'
import { verifyRollbackRegistry } from './verify-rollback-registry.mjs'
import { commandFailureDetails, collectFailedAppDiagnostics } from './release-failure-diagnostics.mjs'
import { readImportSchemaContract, assertImportSchemaContract, OBSERVATION_COMPATIBILITY_VERSION } from './import-schema-contract.mjs'
import { readFieldObservationContract, assertFieldObservationContract, FIELD_OBSERVATION_VERSION } from './field-observation-contract.mjs'
import { snapshotExistingRows } from './release-row-snapshot.mjs'
import { withExclusiveCandidateBuild } from './release-build-lock.mjs'
import { assertRuntimeMigrationContainer } from './runtime-artifact.mjs'
import { COLLABORATION_UPGRADE_VERSIONS } from './collaboration-upgrade-contract.mjs'
import { assertHealthProbeOnlyChange, buildCollaborationCandidate, checkRoomRoute, collaborationCandidateTag, collaborationConfiguration, collaborationHealthProbe, collaborationRollbackTag } from './collaboration-release.mjs'
import { snapshotCollaborationRows, collaborationPolicies, seedCollaborationUpgrade, checkCollaborationRuntime } from './check-collaboration-upgrade.mjs'

const resuming = process.argv[2]==='resume'
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
function stageMigrations(files, name='migration-source') {
  const staging=join(directory,name)
  for(const file of files){const destination=join(staging,file.path);mkdirSync(resolve(destination,'..'),{recursive:true});writeFileSync(destination,file.content)}
  for(const name of ['migrate-unified.mjs','verify-migrations.mjs','provision-runtime-db-role.mjs']){mkdirSync(join(staging,'scripts'),{recursive:true});writeFileSync(join(staging,'scripts',name),git(['show',`${revision}:scripts/${name}`],{rawOutput:true}))}
  return staging
}
function runMigrations(staging, databaseUrl) {
  return spawnSync(process.execPath,[join(staging,'scripts/migrate-unified.mjs')],{cwd:staging,env:{...process.env,DATABASE_URL:databaseUrl},encoding:'utf8',windowsHide:true,timeout:180_000,maxBuffer:8*1024*1024})
}
function runProvisionedMigrations(staging,adminUrl,runtimeUrl) {
  const admin=new URL(adminUrl),runtime=new URL(runtimeUrl)
  assert.equal(admin.hostname,runtime.hostname);assert.equal(admin.port,runtime.port);assert.equal(admin.pathname,runtime.pathname)
  assert.notEqual(admin.username,runtime.username,'Use a separate restricted runtime login')
  const config=(prefix,url)=>Object.fromEntries(Object.entries({HOST:url.hostname,PORT:url.port||'5432',NAME:decodeURIComponent(url.pathname.slice(1)),USER:decodeURIComponent(url.username),PASSWORD:decodeURIComponent(url.password)}).map(([key,value])=>[prefix+key,value]))
  return spawnSync(process.execPath,[join(staging,'scripts/provision-runtime-db-role.mjs')],{cwd:staging,env:{...process.env,DATABASE_URL:'',MIGRATIONS_DIR:'',...config('MIGRATION_DB_',admin),...config('APP_DB_',runtime),NODE_ENV:'production'},encoding:'utf8',windowsHide:true,timeout:180_000,maxBuffer:8*1024*1024})
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
function composeConfig() {
  if (resuming) {
    const head=git(['rev-parse','HEAD'])
    assert.equal(head,git(['rev-parse','@{u}']),'The operational correction must be committed and pushed.')
    const allowed=new Set(['docker-compose.yml','scripts/promote-auth-release.mjs','scripts/release-plan.mjs','scripts/collaboration-release.mjs','tests/collaboration-release.test.mjs'])
    const changed=git(['diff','--name-only',revision,head]).split('\n').filter(Boolean)
    assert.ok(changed.includes('docker-compose.yml')&&changed.every(file=>allowed.has(file)),'Application source changed since the candidate was built.')
    assert.equal(git(['diff','--name-only',head,'--',...allowed]),'','Use the committed operational correction.')
    assertHealthProbeOnlyChange(git(['show',revision+':docker-compose.yml'],{rawOutput:true}),readFileSync('docker-compose.yml','utf8'))
  } else if (!legacy) {
    assert.equal(git(['diff','--name-only',revision,'--','docker-compose.yml']),'','Compose source must match the pinned release.')
  }
  return JSON.parse(docker(['compose','-f','docker-compose.yml','config','--format','json']))
}
function assertCollaborationPlan(receipt) {
  assert.equal(Boolean(receipt.collaboration),receipt.pending.some(version=>COLLABORATION_UPGRADE_VERSIONS.includes(version)),
    'A collaboration schema upgrade requires its coordinated service plan.')
}
function assertEnvironment(before, config) {
  const old=envOf(before.find(c=>c.Name==='/metardu-app')), next=config.services['metardu-app'].environment
  return assertSurveyPushEnvironment(old,next)
}
async function plan() {
  if(existsSync(receiptPath)) throw new Error('A release receipt already exists. Inspect its status before changing or resuming this release.')
  assert.equal(git(['rev-parse',revision]),revision)
  const before=inspect();validateContainers(before)
  assert.notEqual(envOf(before.find(c=>c.Name==='/metardu-app')).METARDU_BUILD_SHA,revision,'This release is already promoted; use read-only verification')
  const config=composeConfig();const pushEnvironment=assertEnvironment(before,config)
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
    pushEnvironment,migrationBefore:applied,pending:drift.missing,rollbackImage:image,priorRevision:rollbackIdentity.revision,rollbackIdentity,
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
    result.compatibility.scheduleContract=await withAdmin(before,async client=>assertScheduleSchemaContract(await readScheduleSchemaContract(client,envOf(before.find(c=>c.Name==='/metardu-app')).DB_USER),{pending:drift.missing.includes(SCHEDULE_UPGRADE_VERSION)}))
    if (drift.missing.some(version=>COLLABORATION_UPGRADE_VERSIONS.includes(version))) {
      const collab=before.find(c=>c.Name==='/metardu-collaboration')
      result.collaboration={...collaborationConfiguration(envOf(app),envOf(collab),config.services['metardu-collaboration'].environment),
        previousImage:collab.Image,previousContainer:collab.Id}
    }
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
function priorBuildProcessesAbsent(receipt) {
  for(const attempt of receipt.buildAttempts??[])for(const key of ['builderPid','archivePid']) {
    const pid=attempt[key]
    assert.ok(Number.isSafeInteger(pid)&&pid>0,'Prior process identity must be known.')
    try {process.kill(pid,0);return false}
    catch(error) {if(error.code!=='ESRCH')throw new Error('Unable to prove prior build process is absent.')}
  }
  return true
}
async function build(retry=false) {
  await withExclusiveCandidateBuild(resolve('.cache/release-verify/candidate-build.lock'),()=>buildCandidate(retry))
}
async function buildCandidate(retry) {
  const receipt=load()
  assertCollaborationPlan(receipt)
  assertCandidateBuildAdmission(receipt,revision,{retry,priorProcessesAbsent:retry&&priorBuildProcessesAbsent(receipt)})
  let retryAdmission
  if(retry) {
    const retainedLogs=(receipt.buildAttempts??[]).map((attempt,index)=>{
      const expected=join(directory,`build-${index+1}.log`)
      assert.equal(resolve(attempt.log),resolve(expected),'Prior log must stay in this exact release directory.')
      return {log:expected,sha256:createHash('sha256').update(readFileSync(expected)).digest('hex')}
    })
    retryAdmission={checkedAt:new Date().toISOString(),priorProcessesAbsent:true,retainedLogs,runnerSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex')}
  }
  assert.equal(receipt.rehearsal?.passed,true,'Pending SQL must first succeed on the existing synthetic database')
  if(!legacy){const proof=JSON.parse(readFileSync(join(directory,'source-checks.json'),'utf8'));assert.equal(proof.revision,revision);assert.equal(proof.status,'passed');receipt.sourceChecks=proof.checks}
  if(!legacy)assert.equal(receipt.rehearsal.rollbackVerifier?.passed,true,'The current image startup verifier must accept the pinned forward registry in the existing synthetic database.')
  if(!legacy&&receipt.pending.length){const proof=JSON.parse(readFileSync(join(directory,'upgrade-checks.json'),'utf8'));assertSyntheticUpgradeProof(proof,revision,{pending:receipt.pending,sourceRegistry:receipt.sourceRegistry});receipt.syntheticUpgrade=proof}
  else if(!legacy){
    assert.equal(receipt.rehearsal.applied,receipt.migrationBefore.length,'A no-SQL release must match the complete applied registry in both plan and rehearsal.')
    receipt.syntheticUpgrade={notRequired:true,reason:'No pending SQL; full applied registry matched production and synthetic rehearsal.'}
  }
  const before=inspect();validateContainers(before)
  assert.equal(before.find(c=>c.Name==='/metardu-app').Image,receipt.rollbackImage)
  if(retry) {
    const app=before.find(c=>c.Name==='/metardu-app')
    const identity=deployedAppRevision(app,JSON.parse(docker(['image','inspect',app.Image]))[0])
    assert.equal(identity.revision,receipt.priorRevision,'Production identity changed after the failed build.')
    const files=sourceMigrations(),applied=await withAdmin(before,ledger)
    assert.deepEqual(files.map(file=>({version:file.version,checksum:file.checksum})),receipt.sourceRegistry,'Pinned source registry differs from planned evidence.')
    assert.deepEqual(applied,receipt.migrationBefore,'Production migration ledger changed after the failed build.')
    assert.deepEqual(assertSurveyReleaseDrift(files,applied).missing,receipt.pending)
    retryAdmission.productionImage=app.Image
    retryAdmission.productionRevision=identity.revision
    retryAdmission.applied=applied.length
  }
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
  const config=composeConfig();assert.deepEqual(assertEnvironment(before,config),receipt.pushEnvironment,'Reviewed push setup changed after planning')
  if (receipt.collaboration) {
    const app=before.find(c=>c.Name==='/metardu-app'), collab=before.find(c=>c.Name==='/metardu-collaboration')
    assert.equal(collab.Image,receipt.collaboration.previousImage)
    assert.equal(collab.Id,receipt.collaboration.previousContainer)
    assert.deepEqual(collaborationConfiguration(envOf(app),envOf(collab),config.services['metardu-collaboration'].environment),
      {origin:receipt.collaboration.origin,protocolVersion:receipt.collaboration.protocolVersion})
    assertBuildSpace(hostFreeBytes())
    receipt.collaboration.candidateImage=buildCollaborationCandidate({revision,docker})
    save(receipt)
    assertBuildSpace(hostFreeBytes())
  }
  const args=['build','--builder','desktop-linux','--progress=plain','--tag',candidateTag,'--label',`org.opencontainers.image.revision=${revision}`,
    '--build-arg',`NEXT_PUBLIC_APP_URL=${config.services['metardu-app'].environment.NEXT_PUBLIC_APP_URL}`,
    '--build-arg',`NEXT_PUBLIC_PAYPAL_CLIENT_ID=${config.services['metardu-app'].build.args.NEXT_PUBLIC_PAYPAL_CLIENT_ID||''}`,'-']
  const archive=spawn('git',['-c','core.fsmonitor=false','archive','--format=tar',revision],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  const logPath=join(directory,`build-${(receipt.buildAttempts?.length??0)+1}.log`),log=createWriteStream(logPath,{flags:'wx'})
  const builder=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']})
  builder.stdout.pipe(log,{end:false});builder.stderr.pipe(log,{end:false})
  const attempt={startedAt:new Date().toISOString(),builderPid:builder.pid,archivePid:archive.pid,log:logPath,status:'running',...(retryAdmission?{retryAdmission}:{})}
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
async function verifyRehearsedSchema(receipt,client,runtimeRole) {
  receipt.rehearsal.importContract=assertImportSchemaContract(await readImportSchemaContract(client,runtimeRole))
  receipt.rehearsal.fieldContract=assertFieldObservationContract(await readFieldObservationContract(client,runtimeRole))
  receipt.rehearsal.scheduleContract=assertScheduleSchemaContract(await readScheduleSchemaContract(client,runtimeRole))
  await client.query('SELECT capture_snapshot,client_reading_id FROM verticality_readings WHERE false')
  const constraints=await client.query("SELECT conname,convalidated FROM pg_constraint WHERE (conrelid='public.setout_observations'::regclass AND conname='setout_capture_snapshot_shape') OR (conrelid='public.verticality_readings'::regclass AND conname='verticality_capture_snapshot_shape') ORDER BY conname")
  assert.equal(constraints.rows.length,2);assert.ok(constraints.rows.every(row=>row.convalidated))
  receipt.rehearsal.constraints=constraints.rows
}

async function rehearseIsolatedBaseline(receipt,owned,settings) {
  const upgrading = receipt.pending.length > 0
  if (upgrading) assert.deepEqual(receipt.pending,COLLABORATION_UPGRADE_VERSIONS,'This isolated upgrade expects exactly the two collaboration migrations.')
  assert.equal(owned.Config.Labels['metardu.purpose'],'schema-rehearsal')
  const identity=pinnedRehearsalIdentity(revision)
  const controlAddress=new URL(settings.adminUrl)
  assert.equal(controlAddress.hostname,'127.0.0.1');assert.equal(controlAddress.port,'55433')
  controlAddress.pathname='/metardu_runtime_verify'
  const control=new pg.Client({connectionString:controlAddress.href,connectionTimeoutMillis:5000})
  const admin=new URL(controlAddress);admin.pathname=`/${identity.database}`
  const runtime=new URL(admin);runtime.username=identity.runtimeRole;runtime.password=randomBytes(32).toString('hex')
  const files=sourceMigrations()
  assert.deepEqual(files.map(file=>({version:file.version,checksum:file.checksum})),receipt.sourceRegistry)
  const baseline = compatibleRollbackRegistry(files,receipt.migrationBefore)
  assert.deepEqual(computeDrift(files,receipt.migrationBefore).missing,receipt.pending)
  if (upgrading) {
    assert.equal(baseline.length,129)
    assert.equal(files.length,131)
  }
  const proof = upgrading ? {revision,status:'checking',sourceBaseline:baseline.length,targetLedgerCount:files.length,pending:receipt.pending,
    sourceRegistry:receipt.sourceRegistry,customerDataCopied:false,productionMutated:false,newContainer:false,checks:[],cleanup:{}} : null
  const check = name => {
    proof.checks.push({name,passed:true})
    console.log('PASS '+name)
  }
  let created=false,client
  await control.connect()
  const readMarker=async database=>(await control.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",[database])).rows[0]?.marker
  try {
    assert.equal(await readMarker('metardu_runtime_verify'),'METARDU synthetic beacon verification only 2026-10-08')
    assert.equal((await control.query('SELECT 1 FROM pg_database WHERE datname=$1',[identity.database])).rowCount,0,'Inspect any existing rehearsal artifact before reuse.')
    assert.equal((await control.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[identity.runtimeRole])).rowCount,0)
    receipt.rehearsal={database:identity.database,customerDataCopied:false,existingContainer:true,isolatedBaseline:true,pending:receipt.pending,passed:false}
    save(receipt)
    await control.query(`CREATE DATABASE "${identity.database}" TEMPLATE template0`);created=true
    await control.query(`COMMENT ON DATABASE "${identity.database}" IS '${identity.marker}'`)
    assert.equal(await readMarker(identity.database),identity.marker)
    const provision = (stage, phase) => {
      const result = runProvisionedMigrations(stage,admin.href,runtime.href)
      if (result.error || result.status!==0) {
        receipt.rehearsal.failedAt=(result.stdout||'').match(/Applying: ([^\r\n]+)/g)?.at(-1)||'preflight'
        receipt.rehearsal.errorCode=(result.stderr||'').match(/code: ['"]([A-Z0-9]+)['"]/)?.[1]||null
        throw new Error('Isolated '+phase+' failed at '+receipt.rehearsal.failedAt+'.')
      }
    }
    const staging=stageMigrations(files)
    provision(upgrading ? stageMigrations(baseline,'migration-baseline') : staging,'baseline')
    client=new pg.Client({connectionString:admin.href,connectionTimeoutMillis:5000});await client.connect()
    const before=await ledger(client)
    if (upgrading) {
      assert.equal(before.length,129)
      assert.ok(computeDrift(baseline,before).ok)
      check('baseline')
      const fixture = await seedCollaborationUpgrade(client)
      const original = await snapshotExistingRows(client)
      const originalCollaboration = await snapshotCollaborationRows(client)
      const originalPolicies = await collaborationPolicies(client)
      await client.query('BEGIN')
      try {
        await client.query('ALTER TABLE public.survey_points DISABLE ROW LEVEL SECURITY')
        const sharedRead = files.find(file=>file.version===COLLABORATION_UPGRADE_VERSIONS[1])
        await assert.rejects(() => client.query(sharedRead.content.split(/^--\s*DOWN:/m)[0]), /must already have RLS enabled/)
      } finally { await client.query('ROLLBACK') }
      assert.deepEqual(await ledger(client),before)
      check('unsafe-shared-schema-rejected')
      provision(staging,'forward upgrade')
      const after=await ledger(client)
      assert.ok(computeDrift(files,after).ok)
      assert.equal(after.length,131)
      assert.deepEqual(after.filter(row=>before.some(old=>old.version===row.version)),before)
      check('forward')
      assert.deepEqual((await snapshotExistingRows(client,original.catalog)).rows,original.rows)
      assert.deepEqual(await snapshotCollaborationRows(client),originalCollaboration)
      const newPolicies = new Set(['survey_points_shared_project_read','fieldbook_shared_project_read'])
      const policies = await collaborationPolicies(client)
      assert.deepEqual(policies.filter(row=>!newPolicies.has(row.policyname)),originalPolicies)
      assert.equal(policies.filter(row=>newPolicies.has(row.policyname)&&row.cmd==='SELECT').length,2)
      check('original-rows-and-policies')
      provision(staging,'idempotent rerun')
      assert.deepEqual(await ledger(client),after)
      check('idempotent')
      await checkCollaborationRuntime(runtime.href,fixture,check)
    } else {
      assert.deepEqual(before,receipt.migrationBefore,'The isolated registry must exactly match production before promotion.')
    }
    await verifyRehearsedSchema(receipt,client,identity.runtimeRole)
    receipt.rehearsal.rollbackVerifier=verifyRollbackRegistry({app:inspect().find(c=>c.Name==='/metardu-app'),fixture:JSON.parse(docker(['inspect',owned.Id]))[0],
      registry:join(staging,'src/lib/db/migrations'),revision,runtimeUrl:runtime.href,isolatedBaseline:true})
    receipt.rehearsal.applied=(await ledger(client)).length
    if (upgrading) check('previous-image-startup')
  }finally{
    try{
      if(client)await client.end()
      if(created){
        assert.equal(await readMarker(identity.database),identity.marker,'Refusing to remove a fixture without its exact marker.')
        await control.query(`DROP DATABASE "${identity.database}"`)
        await control.query(`DROP ROLE IF EXISTS "${identity.runtimeRole}"`)
        if(receipt.rehearsal)receipt.rehearsal.isolatedFixtureRemoved=true
        if (proof) {
          proof.cleanup.syntheticDatabaseRemoved=await readMarker(identity.database)===undefined
          proof.cleanup.syntheticRoleRemoved=(await control.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[identity.runtimeRole])).rowCount===0
        }
      }
    }finally{await control.end();if(receipt.rehearsal)save(receipt)}
  }
  if (proof) {
    proof.status='passed'
    assertSyntheticUpgradeProof(proof,revision,{pending:receipt.pending,sourceRegistry:receipt.sourceRegistry})
    writeFileSync(join(directory,'upgrade-checks.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'})
  }
  receipt.rehearsal.passed=true;save(receipt);console.log(JSON.stringify(receipt.rehearsal))
}

async function rehearse() {
  const receipt=load();assert.equal(receipt.status,'planned')
  const owned=JSON.parse(docker(['inspect','metardu-schema-rehearsal-20261008']))[0]
  assert.equal(owned.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
  assert.deepEqual(owned.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
  const settings=rehearsalDatabaseConfig()
  if(process.env.METARDU_REHEARSE_PINNED_BASELINE==='1'||receipt.pending.some(version=>COLLABORATION_UPGRADE_VERSIONS.includes(version))){
    assert.equal(process.argv[4],'--unified','An isolated baseline requires the unified release namespace.')
    await rehearseIsolatedBaseline(receipt,owned,settings);return
  }
  const address=new URL(settings.adminUrl)
  assert.equal(address.port,'55433')
  address.pathname='/metardu_runtime_verify'
  const url=address.toString()
  const runtimeAddress=new URL(settings.runtimeUrl);runtimeAddress.pathname=address.pathname
  const client=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});await client.connect()
  const files=sourceMigrations()
  try {
    const marker=(await client.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker
    assert.equal(marker,'METARDU synthetic beacon verification only 2026-10-08')
    const drift=computeDrift(files,await ledger(client));assert.equal(drift.mutated.length,0);assert.equal(drift.ghost.length,0)
    receipt.rehearsal={database:'metardu_runtime_verify',pending:drift.missing,customerDataCopied:false,existingContainer:true}
    const result=legacy?runMigrations(stageMigrations(files),url):runProvisionedMigrations(stageMigrations(files),url,runtimeAddress.href)
    if(result.error||result.status!==0) {
      receipt.rehearsal.failedAt=(result.stdout||'').match(/Applying: ([^\r\n]+)/g)?.at(-1)||'preflight'
      receipt.rehearsal.errorCode=(result.stderr||'').match(/code: ['"]([A-Z0-9]+)['"]/)?.[1]||null
      save(receipt);throw new Error(`Synthetic migration rehearsal failed: ${receipt.rehearsal.failedAt}`)
    }
    const after=await ledger(client);assert.ok(computeDrift(files,after).ok)
    await verifyRehearsedSchema(receipt,client,settings.runtimeRole)
    if(!legacy)receipt.rehearsal.rollbackVerifier=verifyRollbackRegistry({app:inspect().find(c=>c.Name==='/metardu-app'),fixture:JSON.parse(docker(['inspect',owned.Id]))[0],
      registry:join(stageMigrations(files),'src/lib/db/migrations'),revision,runtimeUrl:runtimeAddress.href})
    receipt.rehearsal.passed=true;receipt.rehearsal.applied=after.length;save(receipt)
    console.log(JSON.stringify(receipt.rehearsal))
  }finally{await client.end()}
}
async function migrateAndPromote() {
  const receipt=load()
  if (resuming) {
    assert.ok(receipt.status==='maintenance-failure'||(receipt.status==='rolled-back'&&receipt.firstCutover&&receipt.rollbackHealthy===true),
      'Resume requires a recorded cutover failure and verified recovery.')
  } else {
    assert.equal(receipt.status,'built')
  }
  assertCollaborationPlan(receipt)
  if (resuming) {
    assert.ok(receipt.collaboration&&receipt.existingRecordsPreserved&&receipt.collaboration.originalRecordsAndPoliciesPreserved)
    assert.equal(receipt.migrationAfter.length,131)
    const appRecovery=JSON.parse(readFileSync(join(directory,'emergency-app-rollback.json'),'utf8'))
    assert.equal(appRecovery.status,'healthy')
    assert.equal(appRecovery.image,receipt.rollbackImage)
    assert.equal(appRecovery.revision,receipt.priorRevision)
    assert.equal(appRecovery.migrationCount,131)
    const roomRecovery=JSON.parse(readFileSync(join(directory,'collaboration-ipv4-recovery.json'),'utf8'))
    assert.equal(roomRecovery.status,'healthy')
    assert.equal(roomRecovery.image,receipt.collaboration.candidateImage)
    assert.equal(roomRecovery.revision,revision)
    assert.equal(receipt.buildAttempts.at(-1).status,'passed')
    receipt.firstCutover??={failure:receipt.failure,automaticRollbackFailure:receipt.rollbackFailure,
      checkpoint:receipt.checkpoint,appRecovery,roomRecovery}
    receipt.operationalRevision=git(['rev-parse','HEAD'])
    receipt.resumeAttempts=[...(receipt.resumeAttempts??[]),{startedAt:new Date().toISOString(),
      priorStatus:receipt.status,priorFailure:receipt.failure,operationalRevision:receipt.operationalRevision}]
  }
  const before=inspect();validateContainers(before)
  const app=before.find(c=>c.Name==='/metardu-app'),oldEnv=envOf(app)
  assert.equal(app.Image,receipt.rollbackImage)
  assert.equal(docker(['image','inspect',rollbackTag,'--format','{{.Id}}']),receipt.rollbackImage)
  assert.equal(docker(['image','inspect',candidateTag,'--format','{{.Id}}']),receipt.candidateImage)
  assert.deepEqual(assertEnvironment(before,composeConfig()),receipt.pushEnvironment,'Reviewed push setup changed after planning')
  const files=sourceMigrations()
  const applied=await withAdmin(before,ledger)
  if(!legacy)assertSurveyReleaseDrift(files,applied)
  assert.deepEqual(applied,resuming?receipt.migrationAfter:receipt.migrationBefore)
  receipt.importContractBefore=await withAdmin(before,async client=>assertImportSchemaContract(await readImportSchemaContract(client,oldEnv.DB_USER),{allowPendingObservationExtension:receipt.pending.includes(OBSERVATION_COMPATIBILITY_VERSION)}))
  receipt.fieldContractBefore=await withAdmin(before,async client=>assertFieldObservationContract(await readFieldObservationContract(client,oldEnv.DB_USER),{pending:receipt.pending.includes(FIELD_OBSERVATION_VERSION)}))
  receipt.scheduleContractBefore=await withAdmin(before,async client=>assertScheduleSchemaContract(await readScheduleSchemaContract(client,oldEnv.DB_USER),{pending:receipt.pending.includes(SCHEDULE_UPGRADE_VERSION)}))
  const jobs=await withAdmin(before,async client=>(await client.query(`SELECT
    (SELECT count(*)::integer FROM background_jobs WHERE status='running') AS background,
    (SELECT count(*)::integer FROM render_jobs WHERE status='running') AS render,
    (SELECT count(*)::integer FROM drone_processing_tasks WHERE status IN ('uploading','running','importing')) AS drone`)).rows[0])
  assert.ok(Object.values(jobs).every(value=>value===0),'Wait for active jobs before maintenance')
  const staging=stageMigrations(files)
  const override=join(directory,'promotion.override.yml')
  const services={'metardu-app':forwardPromotionService(candidateTag,revision,app)}
  const collaboration=receipt.collaboration
  const previousCollaboration=before.find(c=>c.Name==='/metardu-collaboration')
  let collaborationReplacementAttempted=false
  let migrationServiceReplacementAttempted=false
  const recreateMigrationService = overridePath => docker(['compose','-p',receipt.project,'-f','docker-compose.yml','-f',overridePath,
    'up','--no-deps','--no-build','--pull','never','--force-recreate','--exit-code-from','metardu-db-migrate','metardu-db-migrate'],{timeout:120000})
  const currentMigrationService = () => JSON.parse(docker(['inspect','metardu-db-migrate']))[0]
  if (collaboration) {
    if (resuming) {
      assert.equal(app.State.Health.Status,'healthy')
      assert.equal(previousCollaboration.Id,receipt.firstCutover.roomRecovery.room)
      assert.equal(previousCollaboration.Image,collaboration.candidateImage)
      assert.equal(previousCollaboration.State.Health.Status,'healthy')
      assert.deepEqual(previousCollaboration.Config.Healthcheck.Test,collaborationHealthProbe)
      assert.equal(docker(['image','inspect',collaborationRollbackTag,'--format','{{.Id}}']),collaboration.previousImage)
    } else {
      assert.equal(previousCollaboration.Id,collaboration.previousContainer)
      assert.equal(previousCollaboration.Image,collaboration.previousImage)
      assert.equal(previousCollaboration.Config.Image,'metardu-metardu-collaboration')
    }
    assert.equal(docker(['image','inspect',collaborationCandidateTag,'--format','{{.Id}}']),collaboration.candidateImage)
    assert.deepEqual(collaborationConfiguration(oldEnv,envOf(previousCollaboration),composeConfig().services['metardu-collaboration'].environment),
      {origin:collaboration.origin,protocolVersion:collaboration.protocolVersion})
    const existing=spawnSync('docker',['image','inspect',collaborationRollbackTag,'--format','{{.Id}}'],{encoding:'utf8',windowsHide:true,timeout:30000})
    assert.ok(existing.status!==0||existing.stdout.trim()===collaboration.previousImage,'Preserve the previous collaboration rollback image first.')
    docker(['image','tag',collaboration.previousImage,collaborationRollbackTag])
    assertRuntimeMigrationContainer(app,currentMigrationService())
    services['metardu-collaboration']={image:collaborationCandidateTag}
    services['metardu-db-migrate']={image:candidateTag}
  }
  writeFileSync(override,JSON.stringify({services},null,2))
  receipt.status='maintenance';save(receipt)
  docker(['stop','--timeout','20','metardu-app'],{timeout:40_000})
  try {
    const priorLogs=spawnSync('docker',['logs','--timestamps','metardu-app'],{encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:16*1024*1024})
    assert.equal(priorLogs.status,0,'Preserve the previous application logs before replacement')
    const logArchive='/backups/app-before-auth-'+revision.slice(0,8)+(resuming?'-resume-'+receipt.resumeAttempts.length:'')+'.log'
    docker(['exec','-i','metardu-backup','bash','-c',`set -o noclobber; umask 077; cat > ${logArchive}`],{input:priorLogs.stdout+priorLogs.stderr})
    receipt.previousApplicationLogArchive=logArchive;save(receipt)
    const backup=docker(['exec','-e','BACKUP_RETENTION=36500','metardu-backup','/app/scripts/backup.sh'],{timeout:120_000})
    assert.ok(backup.includes('Backup integrity verified.') && backup.includes('Backup complete.'))
    receipt.checkpoint={database:backup.match(/Database backup: (\/backups\/db_[0-9_]+\.sql\.gz)/)?.[1],uploads:backup.match(/Uploads backup: (\/backups\/uploads_[0-9_]+\.tar\.gz)/)?.[1]}
    assert.ok(receipt.checkpoint.database&&receipt.checkpoint.uploads);save(receipt)
    console.log('Fresh database and upload checkpoint verified; existing archives preserved.')
    receipt.existingRecordsBefore=await withAdmin(before,client=>snapshotExistingRows(client))
    const collaborationRowsBefore=collaboration ? await withAdmin(before,snapshotCollaborationRows) : null
    const collaborationPoliciesBefore=collaboration ? await withAdmin(before,collaborationPolicies) : null
    save(receipt)
    if (!resuming) {
      const config=databaseConfig(before)
      const address=new URL('postgresql://localhost');address.hostname=config.host;address.port=String(config.port);address.username=config.user;address.password=config.password;address.pathname='/'+config.database
      const runtimeAddress=new URL(address);runtimeAddress.username=oldEnv.DB_USER;runtimeAddress.password=oldEnv.DB_PASSWORD
      const result=legacy?runMigrations(staging,address.toString()):runProvisionedMigrations(staging,address.href,runtimeAddress.href)
      receipt.migrationExit=result.status
      receipt.migrationSummary=(result.stdout||'').split('\n').filter(line=>/Applying:|Applied |All migrations|up to date|pending|successfully/i.test(line));save(receipt)
      if(result.error||result.status!==0) throw new Error('Migration runner failed; inspect the bounded migration summary.')
    }
    const afterLedger=await withAdmin(before,ledger)
    assert.ok(computeDrift(files,afterLedger).ok)
    assert.ok(applied.every(row=>afterLedger.some(next=>next.version===row.version&&next.checksum===row.checksum)))
    const recordsAfter=await withAdmin(before,client=>snapshotExistingRows(client,receipt.existingRecordsBefore.catalog))
    assert.deepEqual(recordsAfter.rows,receipt.existingRecordsBefore.rows,'Original recorded values must survive migration unchanged')
    receipt.existingRecordsPreserved=true
    if (collaboration) {
      assert.deepEqual(await withAdmin(before,snapshotCollaborationRows),collaborationRowsBefore)
      const newPolicies=new Set(['survey_points_shared_project_read','fieldbook_shared_project_read'])
      const policies=await withAdmin(before,collaborationPolicies)
      assert.deepEqual(resuming?policies:policies.filter(row=>!newPolicies.has(row.policyname)),collaborationPoliciesBefore)
      assert.equal(policies.filter(row=>newPolicies.has(row.policyname)&&row.cmd==='SELECT').length,2)
      collaboration.originalRecordsAndPoliciesPreserved=true
    }
    receipt.importContractAfter=await withAdmin(before,async client=>assertImportSchemaContract(await readImportSchemaContract(client,oldEnv.DB_USER)))
    receipt.fieldContractAfter=await withAdmin(before,async client=>assertFieldObservationContract(await readFieldObservationContract(client,oldEnv.DB_USER)))
    receipt.scheduleContractAfter=await withAdmin(before,async client=>assertScheduleSchemaContract(await readScheduleSchemaContract(client,oldEnv.DB_USER)))
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
    if (collaboration && !resuming) {
      collaborationReplacementAttempted=true
      docker(['compose','-p',receipt.project,'-f','docker-compose.yml','-f',override,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','60','metardu-collaboration'],{timeout:90000})
      const room=JSON.parse(docker(['exec','metardu-collaboration','wget','-qO-','http://127.0.0.1:3001/health']))
      assert.equal(room.status,'healthy')
      assert.equal(room.protocolVersion,collaboration.protocolVersion)
    }
    docker(['compose','-p',receipt.project,'-f','docker-compose.yml','-f',override,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','120','metardu-app'],{timeout:150_000})
    const after=inspect(),updated=after.find(c=>c.Name==='/metardu-app')
    assert.equal(updated.Image,receipt.candidateImage);assert.equal(updated.State.Health.Status,'healthy')
    for (const prior of before) {
      const kept=after.find(c=>c.Name===prior.Name)
      assert.deepEqual(mounts(kept),mounts(prior))
      if (collaboration && prior.Name==='/metardu-collaboration') {
        assert.equal(kept.Image,collaboration.candidateImage)
        assert.equal(kept.State.Health.Status,'healthy')
        assert.equal(Object.values(kept.NetworkSettings.Ports).some(Boolean),false,'Room backend must remain private.')
      } else if (prior.Name!=='/metardu-app') {
        assert.equal(kept.Id,prior.Id)
        assert.equal(kept.State.StartedAt,prior.State.StartedAt)
      }
    }
    if (collaboration) {
      const publicSocket=collaboration.origin.replace(/^https:/,'wss:')
      collaboration.routes={
        origin:await checkRoomRoute('ws://127.0.0.1:3000',collaboration.origin),
        public:await checkRoomRoute(publicSocket,collaboration.origin),
      }
    }
    assert.equal(envOf(updated).METARDU_BUILD_SHA,revision)
    const appClient=new pg.Client({...databaseConfig(before),user:oldEnv.DB_USER,password:oldEnv.DB_PASSWORD});await appClient.connect()
    try{assert.equal(runtimeDatabaseRoleFailure((await appClient.query(RUNTIME_ROLE_QUERY)).rows[0]),null)}finally{await appClient.end()}
    if (collaboration) {
      migrationServiceReplacementAttempted=true
      recreateMigrationService(override)
      const migration=currentMigrationService()
      assertRuntimeMigrationContainer(updated,migration)
      assert.deepEqual(await withAdmin(before,ledger),afterLedger)
      assert.deepEqual(await withAdmin(before,snapshotCollaborationRows),collaborationRowsBefore)
      receipt.migrationService={image:migration.Image,exitCode:migration.State.ExitCode,ledgerPreserved:true}
      docker(['image','tag',collaboration.candidateImage,'metardu-metardu-collaboration'])
    }
    docker(['image','tag',receipt.candidateImage,'metardu-metardu-app:latest'])
    receipt.after=after.map(describe);receipt.status='promoted';if(resuming){delete receipt.failure;delete receipt.rollbackFailure};save(receipt)
    console.log(JSON.stringify({status:receipt.status,revision,image:updated.Image,migrations:afterLedger.length,requiredServicesPreserved:true,collaborationPromoted:Boolean(collaboration),uploadsPreserved:true}))
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
      if (collaborationReplacementAttempted) {
        const collabRollback=join(directory,'collaboration-rollback.override.yml')
        writeFileSync(collabRollback,JSON.stringify({services:{'metardu-collaboration':{image:collaborationRollbackTag,
          environment:{COLLAB_ALLOWED_ORIGINS:envOf(previousCollaboration).COLLAB_ALLOWED_ORIGINS??null}}}},null,2))
        docker(['compose','-p',receipt.project,'-f','docker-compose.yml','-f',collabRollback,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','60','metardu-collaboration'],{timeout:90000})
        docker(['image','tag',collaboration.previousImage,previousCollaboration.Config.Image])
      }
      const restored=inspect();assert.equal(restored.find(c=>c.Name==='/metardu-app').Image,receipt.rollbackImage)
      if (migrationServiceReplacementAttempted) {
        // The older provisioner predates append-only review grants. Verify the
        // forward schema with its real runtime verifier and make no grants.
        const migrationRollback=join(directory,'migration-rollback.override.yml')
        const service=rollbackService(rollbackTag,receipt.priorRevision,receipt.rollbackRegistry.directory)
        const verify="const u=new URL('postgresql://localhost');u.hostname=process.env.APP_DB_HOST;u.port=process.env.APP_DB_PORT;u.pathname='/'+process.env.APP_DB_NAME;u.username=process.env.APP_DB_USER;u.password=process.env.APP_DB_PASSWORD;const r=require('node:child_process').spawnSync(process.execPath,['/app/verify-migrations.mjs'],{stdio:'inherit',env:{...process.env,DATABASE_URL:u.href}});process.exit(r.status??1)"
        writeFileSync(migrationRollback,JSON.stringify({services:{'metardu-db-migrate':{...service,command:['-e',verify]}}},null,2))
        recreateMigrationService(migrationRollback)
        assertRuntimeMigrationContainer(restored.find(c=>c.Name==='/metardu-app'),currentMigrationService())
      }
      assert.equal(restored.find(c=>c.Name==='/metardu-app').State.Health.Status,'healthy')
      for (const prior of before.filter(c=>c.Name!=='/metardu-app')) {
        const kept=restored.find(c=>c.Name===prior.Name)
        assert.deepEqual(mounts(kept),mounts(prior))
        if (collaborationReplacementAttempted && prior.Name==='/metardu-collaboration') {
          assert.equal(kept.Image,prior.Image)
          assert.equal(kept.State.Health.Status,'healthy')
        } else {
          assert.equal(kept.Id,prior.Id)
          assert.equal(kept.State.StartedAt,prior.State.StartedAt)
        }
      }
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
  else if(action==='retry-build') await build(true)
  else if(action==='promote'||action==='resume') await migrateAndPromote()
  else if(action==='status') console.log(JSON.stringify(load(),null,2))
  else throw new Error('Use plan, rehearse, build, retry-build, promote, or resume')
}catch(error){console.error(error instanceof assert.AssertionError ? `Release guard failed: ${error.message.split('\n')[0]}` : error.message);process.exitCode=1}
