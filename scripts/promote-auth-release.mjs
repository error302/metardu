// Promote a pinned, committed release into the one existing production stack.
// Never exports credentials, clones customer databases, or creates preview services.
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import pg from 'pg'
import { computeDrift, migrationChecksums, RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const directory = resolve('.cache/release-verify/auth-release')
const receiptPath = join(directory, 'promotion.json')
const revision = 'c1591bda793e415d300f7f58176e1ced8c020f6b'
const candidateTag = 'metardu-metardu-app:candidate'
const rollbackTag = 'metardu-metardu-app:rollback-current'
const names = ['metardu-app','metardu-postgres','metardu-redis','metardu-worker','metardu-collaboration','metardu-ntrip','metardu-backup']
mkdirSync(directory, { recursive: true })
function command(binary,args,options={}) {
  const { rawOutput = false, ...spawnOptions } = options
  const result = spawnSync(binary,args,{encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:16*1024*1024,...spawnOptions})
  if(result.error || result.status!==0) throw new Error(`${binary} ${args[0]} failed (exit ${result.status}); credential-bearing diagnostics suppressed`)
  return rawOutput ? result.stdout : result.stdout.trim()
}
const docker = (args,options) => command('docker',args,options)
const git = (args,options) => command('git',['-c','core.fsmonitor=false',...args],options)
const envOf = container => Object.fromEntries(container.Config.Env.map(value => {const i=value.indexOf('=');return[value.slice(0,i),value.slice(i+1)]}))
const mounts = c => c.Mounts.map(m=>({type:m.Type,name:m.Name??null,source:m.Source,destination:m.Destination,rw:m.RW})).sort((a,b)=>a.destination.localeCompare(b.destination))
const describe = c => ({name:c.Name.slice(1),id:c.Id,image:c.Image,startedAt:c.State.StartedAt,mounts:mounts(c)})
const save = receipt => writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n')
const load = () => JSON.parse(readFileSync(receiptPath,'utf8'))
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
async function snapshotExistingRows(client, catalog) {
  const tables=catalog || (await client.query(`SELECT table_name AS name,array_agg(column_name::text ORDER BY ordinal_position) AS columns
    FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN ('setout_points','setout_observations','verticality_readings','user_consents')
    GROUP BY table_name ORDER BY table_name`)).rows
  const rows=[]
  const literal=value=>`'${value.replaceAll("'","''")}'`
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    for(const table of tables) {
      assert.ok(['setout_points','setout_observations','verticality_readings','user_consents'].includes(table.name))
      const result=await client.query(`SELECT count(*)::integer AS rows,
        md5(COALESCE(string_agg(md5(payload::text),'' ORDER BY md5(payload::text)),'')) AS fingerprint
        FROM (SELECT (SELECT jsonb_object_agg(j.key,CASE WHEN jsonb_typeof(j.value)='number'
          THEN to_jsonb(trim_scale((j.value #>> '{}')::numeric)) ELSE j.value END ORDER BY j.key)
          FROM jsonb_each(to_jsonb(t)) j WHERE j.key=ANY(ARRAY[${table.columns.map(literal).join(',')}]::text[])) AS payload
          FROM public."${table.name}" t) normalized`)
      rows.push({name:table.name,...result.rows[0]})
    }
    await client.query('COMMIT');return {catalog:tables,rows}
  }catch(error){await client.query('ROLLBACK');throw error}
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
  assert.equal(git(['rev-parse',revision]),revision)
  const before=inspect();validateContainers(before)
  assert.notEqual(envOf(before.find(c=>c.Name==='/metardu-app')).METARDU_BUILD_SHA,revision,'This release is already promoted; use read-only verification')
  const config=composeConfig();assertEnvironment(before,config)
  const files=sourceMigrations()
  const applied=await withAdmin(before,ledger)
  const drift=computeDrift(files,applied)
  assert.equal(drift.mutated.length,0,'Applied migration hashes must remain unchanged')
  assert.equal(drift.ghost.length,0,'No applied migration may be omitted')
  const recovery=JSON.parse(readFileSync('test-results/recovery-proof/verification.json','utf8'))
  assert.equal(recovery.status,'passed')
  assert.ok(Object.values(recovery.cleanup).every(value=>value===true))
  const image=before.find(c=>c.Name==='/metardu-app').Image
  const result={revision,status:'planned',candidateTag,rollbackTag,before:before.map(describe),project:before.find(c=>c.Name==='/metardu-app').Config.Labels['com.docker.compose.project'],
    migrationBefore:applied,pending:drift.missing,rollbackImage:image,recoveryEvidence:{status:recovery.status,archiveSha256:recovery.archiveSha256,cleanup:recovery.cleanup},phases:[]}
  save(result)
  console.log(JSON.stringify({revision,image,applied:applied.length,pending:drift.missing,configurationPreserved:true,priorRecoveryProof:true,oneApplication:true}))
}
async function build() {
  const receipt=load();assert.equal(receipt.status,'planned')
  assert.equal(receipt.rehearsal?.passed,true,'Pending SQL must first succeed on the existing synthetic database')
  const before=inspect();assert.equal(before.find(c=>c.Name==='/metardu-app').Image,receipt.rollbackImage)
  docker(['image','tag',receipt.rollbackImage,rollbackTag])
  assert.equal(docker(['image','inspect',rollbackTag,'--format','{{.Id}}']),receipt.rollbackImage)
  const config=composeConfig();assertEnvironment(before,config)
  const args=['build','--progress=plain','--tag',candidateTag,'--label',`org.opencontainers.image.revision=${revision}`,
    '--build-arg',`NEXT_PUBLIC_APP_URL=${config.services['metardu-app'].environment.NEXT_PUBLIC_APP_URL}`,
    '--build-arg',`NEXT_PUBLIC_PAYPAL_CLIENT_ID=${config.services['metardu-app'].build.args.NEXT_PUBLIC_PAYPAL_CLIENT_ID||''}`,'-']
  const archive=spawn('git',['-c','core.fsmonitor=false','archive','--format=tar',revision],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  const builder=spawn('docker',args,{windowsHide:true,stdio:['pipe','inherit','inherit']})
  archive.stdout.pipe(builder.stdin)
  builder.stdin.on('error',()=>{})
  const archiveDone=new Promise((resolve,reject)=>{archive.once('error',reject);archive.once('exit',code=>code===0?resolve():reject(new Error('Committed build archive failed')))})
  const buildDone=new Promise((resolve,reject)=>{builder.once('error',reject);builder.once('exit',code=>code===0?resolve():reject(new Error(`Candidate build failed: ${code}`)))})
  await Promise.all([archiveDone,buildDone])
  receipt.candidateImage=docker(['image','inspect',candidateTag,'--format','{{.Id}}'])
  assert.equal(JSON.parse(docker(['image','inspect',candidateTag]))[0].Config.Labels['org.opencontainers.image.revision'],revision)
  receipt.status='built';save(receipt)
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
    await client.query('SELECT capture_snapshot,client_reading_id FROM verticality_readings WHERE false')
    const constraints=await client.query("SELECT conname,convalidated FROM pg_constraint WHERE conname IN ('setout_capture_snapshot_shape','verticality_capture_snapshot_shape') ORDER BY conname")
    assert.equal(constraints.rows.length,2);assert.ok(constraints.rows.every(row=>row.convalidated))
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
  assert.deepEqual(applied,receipt.migrationBefore)
  const jobs=await withAdmin(before,async client=>(await client.query(`SELECT
    (SELECT count(*)::integer FROM background_jobs WHERE status='running') AS background,
    (SELECT count(*)::integer FROM render_jobs WHERE status='running') AS render,
    (SELECT count(*)::integer FROM drone_processing_tasks WHERE status IN ('uploading','running','importing')) AS drone`)).rows[0])
  assert.ok(Object.values(jobs).every(value=>value===0),'Wait for active jobs before maintenance')
  const staging=stageMigrations(files)
  const override=join(directory,'promotion.override.yml')
  writeFileSync(override,`services:\n  metardu-app:\n    image: ${candidateTag}\n    environment:\n      METARDU_BUILD_SHA: ${revision}\n`)
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
    const access=await withAdmin(before,async client=>(await client.query(`SELECT
      has_table_privilege($1,'public.marketing_email_deliveries','SELECT') AS can_read,
      has_table_privilege($1,'public.marketing_email_deliveries','INSERT') AS can_insert,
      has_table_privilege($1,'public.marketing_email_deliveries','UPDATE') AS can_update,
      has_table_privilege($1,'public.marketing_email_deliveries','DELETE') AS can_delete`,[oldEnv.DB_USER])).rows[0])
    assert.ok(Object.values(access).every(Boolean),'Runtime must receive its ordinary privileges on the new table')
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
    receipt.status='failed';receipt.failure=error.message;save(receipt)
    // Do not restore database archives over customer data or reverse forward-only migrations.
    // Keep the original app available when migration failed before replacement.
    const current=JSON.parse(docker(['inspect','metardu-app']))[0]
    if(current.Image===receipt.rollbackImage&&!current.State.Running){docker(['start','metardu-app']);receipt.originalAppRestarted=true;save(receipt)}
    throw error
  }
}
try {
  const action=process.argv[2]
  if(action==='plan') await plan()
  else if(action==='rehearse') await rehearse()
  else if(action==='build') await build()
  else if(action==='promote') await migrateAndPromote()
  else throw new Error('Use plan, rehearse, build, or promote')
}catch(error){console.error(error instanceof assert.AssertionError ? `Release guard failed: ${error.message.split('\n')[0]}` : error.message);process.exitCode=1}
