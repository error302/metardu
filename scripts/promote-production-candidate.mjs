// Planned app-only promotion after actual recovery, migration and source proof.
// Does not run with --execute until the single candidate image is built.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import pg from 'pg'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure, collectFileMigrations, computeDrift } from './verify-migrations.mjs'

const evidence='test-results/production-upgrade'
const source=JSON.parse(readFileSync(`${evidence}/candidate-build.json`,'utf8'))
const recovery=JSON.parse(readFileSync('test-results/recovery-proof/verification.json','utf8'))
const expectedOldImage='sha256:d2b47891fb9fac7064cc446709a1d2cd3fb684d13c6f126c1aae39628f626fc0'
const report={scope:'Existing production application only; supporting services and volumes preserved',status:'preparing',phases:[],productionWritesThroughApplication:false}
function docker(args,timeout=30_000){const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:5*1024*1024});if(r.error||r.status!==0)throw new Error(`Docker ${args[0]} failed (exit ${r.status}); sensitive diagnostics suppressed.`);return r.stdout.trim()}
function phase(name,detail={}){report.phases.push({name,passed:true,...detail});console.log(`PASS ${name}`);save()}
function save(){mkdirSync(evidence,{recursive:true});writeFileSync(`${evidence}/promotion.json`,JSON.stringify(report,null,2)+'\n')}
const envOf=container=>Object.fromEntries(container.Config.Env.map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}))
const services=['metardu-app','metardu-postgres','metardu-redis','metardu-worker','metardu-collaboration','metardu-ntrip','metardu-backup']
let migrationClient,restrictedClient
function currentSourceHash(){
  const hash=createHash('sha256')
  function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(entry.isFile()&&!/\.(test|spec)\./.test(entry.name)){hash.update(path.replaceAll('\\','/'));hash.update(readFileSync(path))}}}
  walk('src');for(const file of ['package.json','package-lock.json','Dockerfile','docker-entrypoint.sh','next.config.js']){hash.update(file);hash.update(readFileSync(file))}
  return hash.digest('hex')
}
const qid=value=>`"${value.replaceAll('"','""')}"`
const qstr=value=>`'${value.replaceAll("'","''")}'`
const tableCatalog=`SELECT c.relname AS name,array_agg(a.attname::text ORDER BY a.attnum) AS columns
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND c.relname<>'schema_migrations'
 AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
 GROUP BY c.oid,c.relname ORDER BY c.relname`
async function snapshot(client,catalog,toleranceIds){
  const rows=[];await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try{
    for(const table of catalog){
      const filter=toleranceIds && table.name==='tolerance_profiles'?`WHERE id::text=ANY(ARRAY[${toleranceIds.map(qstr).join(',')}]::text[])`:''
      const sql=`SELECT ${qstr(table.name)} AS name,count(*)::integer AS rows,
       md5(COALESCE(string_agg(md5(payload::text),'' ORDER BY md5(payload::text)),'')) AS fingerprint
       FROM (SELECT (SELECT jsonb_object_agg(j.key,CASE WHEN jsonb_typeof(j.value)='number'
        THEN to_jsonb(trim_scale((j.value #>> '{}')::numeric)) ELSE j.value END ORDER BY j.key)
        FROM jsonb_each(to_jsonb(t)) j WHERE j.key=ANY(ARRAY[${table.columns.map(qstr).join(',')}])) AS payload
        FROM public.${qid(table.name)} t ${filter}) rows`
      rows.push((await client.query(sql)).rows[0])
    }
    await client.query('COMMIT');return rows
  }catch(error){await client.query('ROLLBACK');throw error}
}
try {
  assert.equal(source.status,'built','Packaging must be verified first.')
  assert.equal(currentSourceHash(),source.sourceSha256,'Source changed after the candidate build; rebuild the reusable tag first.')
  assert.equal(recovery.status,'passed','Actual recovery proof is required.')
  assert.ok(Object.values(recovery.cleanup).every(value=>value===true),'Temporary recovery copies must be removed.')
  const prior=JSON.parse(docker(['inspect',...services]))
  const app=prior.find(c=>c.Name==='/metardu-app'),postgres=prior.find(c=>c.Name==='/metardu-postgres')
  assert.equal(app.Image,expectedOldImage,'Running image changed; review before promotion.')
  assert.equal(docker(['image','inspect','metardu-metardu-app:rollback-20261010','--format','{{.Id}}']),expectedOldImage)
  const candidate=JSON.parse(docker(['image','inspect','metardu-metardu-app:candidate']))[0]
  assert.equal(candidate.Id,source.imageId)
  const config=JSON.parse(docker(['compose','-f','docker-compose.yml','config','--format','json']))
  const next=config.services['metardu-app'].environment,admin=config.services['metardu-postgres'].environment,old=envOf(app),oldPostgres=envOf(postgres)
  assert.equal(old.AUTH_SECRET,next.AUTH_SECRET)
  assert.equal(old.WORKER_SECRET,next.WORKER_SECRET)
  assert.equal(old.NEXTAUTH_URL,next.NEXTAUTH_URL)
  assert.equal(old.NEXT_PUBLIC_APP_URL,next.NEXT_PUBLIC_APP_URL)
  assert.equal(oldPostgres.POSTGRES_PASSWORD,admin.POSTGRES_PASSWORD)
  assert.equal(oldPostgres.POSTGRES_DB,admin.POSTGRES_DB)
  assert.notEqual(next.DB_USER,admin.POSTGRES_USER)
  assert.ok(next.DB_PASSWORD && next.DB_PASSWORD!==admin.POSTGRES_PASSWORD)
  report.before=prior.map(c=>({name:c.Name.slice(1),id:c.Id,image:c.Image,startedAt:c.State.StartedAt,mounts:c.Mounts.map(m=>({type:m.Type,name:m.Name,source:m.Source,destination:m.Destination,rw:m.RW}))}))
  report.candidate={imageId:candidate.Id,sourceSha256:source.sourceSha256}
  const override='.cache/release-verify/production-promotion.override.yml'
  writeFileSync(override,`services:\n  metardu-app:\n    image: metardu-metardu-app:candidate\n    environment:\n      METARDU_BUILD_SHA: working-tree-${source.sourceSha256.slice(0,16)}\n`)
  const configDb={host:'127.0.0.1',port:5432,database:admin.POSTGRES_DB,user:admin.POSTGRES_USER,password:admin.POSTGRES_PASSWORD,connectionTimeoutMillis:10_000}
  const port=postgres.NetworkSettings.Ports['5432/tcp']
  assert.deepEqual(port,[{HostIp:'127.0.0.1',HostPort:'5432'}])
  migrationClient=new pg.Client(configDb);await migrationClient.connect()
  const ledger=(await migrationClient.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  const files=collectFileMigrations()
  const drift=computeDrift(files,ledger)
  assert.equal(drift.mutated.length,0)
  assert.equal(drift.ghost.length,0)
  assert.equal(ledger.length,69)
  assert.equal(drift.missing.length,40)
  report.migrationStateBefore={applied:ledger.length,pending:drift.missing.length,hashDrift:0}
  report.activeJobCounts=(await migrationClient.query(`SELECT
    (SELECT count(*)::integer FROM public.background_jobs WHERE status='running') AS background,
    (SELECT count(*)::integer FROM public.render_jobs WHERE status='running') AS render,
    (SELECT count(*)::integer FROM public.drone_processing_tasks WHERE status IN ('uploading','running','importing')) AS drone`)).rows[0]
  assert.ok(Object.values(report.activeJobCounts).every(count=>count===0),'Active processing must finish before application maintenance.')
  await migrationClient.end();migrationClient=null
  phase('candidate, rollback, configuration continuity and exact migration baseline validated')
  report.rollbackPlan={image:'metardu-metardu-app:rollback-20261010',recoveryArchives:recovery.archiveSha256,
    note:'Security/evidence constraints are forward-only. Do not restore the old image blindly after schema changes or restore old database data over new customer writes. On a failed migration/startup keep the application stopped, preserve its logs/data and perform a reviewed forward fix or isolated restored-database cutover. Supporting services remain running.'}
  if(!process.argv.includes('--execute')){report.status='prepared';save();console.log('Prepared only. --execute is required for coordinated migration and app replacement.');process.exit(0)}
  // Halt the one application writer before taking the promotion checkpoint.
  docker(['stop','--timeout','20','metardu-app'],40_000)
  report.applicationStopped=true;phase('only existing application stopped for coordinated maintenance')
  const priorLogs=spawnSync('docker',['logs','--timestamps','metardu-app'],{encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:10*1024*1024})
  assert.equal(priorLogs.status,0,'Preserve previous application logs before replacement.')
  const logArchive='/backups/app_before_upgrade_20261010.log'
  const archived=spawnSync('docker',['exec','-i','metardu-backup','bash','-c',`set -o noclobber; umask 077; cat > ${logArchive}`],{input:priorLogs.stdout+priorLogs.stderr,encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:1024*1024})
  assert.equal(archived.status,0,'Never overwrite an existing private log archive.')
  report.previousApplicationLogArchive={path:logArchive,storedOnlyInExistingBackupVolume:true,privateMode:'0600',payloadPrinted:false}
  phase('previous application logs preserved privately without workspace copying or output')
  const backup=docker(['exec','-e','BACKUP_RETENTION=36500','metardu-backup','/app/scripts/backup.sh'],60_000)
  assert.ok(backup.includes('Backup integrity verified.') && backup.includes('Backup complete.'))
  report.promotionCheckpoint={database:backup.match(/Database backup: (\/backups\/db_[0-9_]+\.sql\.gz)/)?.[1],uploads:backup.match(/Uploads backup: (\/backups\/uploads_[0-9_]+\.tar\.gz)/)?.[1],existingArchivesRetained:true}
  assert.ok(report.promotionCheckpoint.database && report.promotionCheckpoint.uploads)
  phase('fresh database/upload checkpoint completed with existing archives retained')
  migrationClient=new pg.Client(configDb);await migrationClient.connect()
  const customerCatalog=(await migrationClient.query(tableCatalog)).rows
  const toleranceIds=(await migrationClient.query('SELECT id::text FROM public.tolerance_profiles')).rows.map(row=>row.id)
  const customersBefore=await snapshot(migrationClient,customerCatalog)
  await migrationClient.end();migrationClient=null
  phase('maintenance snapshot captured without logging customer rows or identities',{tableCount:customerCatalog.length})
  const migrationEnv={...process.env,MIGRATION_DB_HOST:'127.0.0.1',MIGRATION_DB_PORT:'5432',MIGRATION_DB_NAME:admin.POSTGRES_DB,MIGRATION_DB_USER:admin.POSTGRES_USER,MIGRATION_DB_PASSWORD:admin.POSTGRES_PASSWORD,
    APP_DB_HOST:'127.0.0.1',APP_DB_PORT:'5432',APP_DB_NAME:admin.POSTGRES_DB,APP_DB_USER:next.DB_USER,APP_DB_PASSWORD:next.DB_PASSWORD,NODE_ENV:'production',DATABASE_URL:''}
  const migration=spawnSync(process.execPath,['scripts/provision-runtime-db-role.mjs'],{env:migrationEnv,encoding:'utf8',windowsHide:true,timeout:120_000,maxBuffer:5*1024*1024})
  if(migration.error||migration.status!==0){report.migrationFailure={exit:migration.status,lastMigration:migration.stdout?.match(/Applying: ([0-9]+_[a-z_]+)/g)?.at(-1)??null};throw new Error('Production migration/role provisioner stopped; application remains stopped; sensitive diagnostics suppressed.')}
  phase('ordinary migration/role provisioner completed against production')
  migrationClient=new pg.Client(configDb);await migrationClient.connect()
  const customersAfter=await snapshot(migrationClient,customerCatalog,toleranceIds)
  report.customerPreservation={tableCount:customerCatalog.length,differences:customersBefore.filter((row,i)=>JSON.stringify(row)!==JSON.stringify(customersAfter[i])).map(row=>row.name),payloadLogged:false}
  assert.equal(report.customerPreservation.differences.length,0,'Existing customer records changed during migration; review before opening the application.')
  assert.equal((await migrationClient.query('SELECT count(*)::integer AS count FROM public.tolerance_profiles WHERE NOT(id::text=ANY($1::text[]))',[toleranceIds])).rows[0].count,1)
  await migrationClient.end();migrationClient=null
  phase('all original customer columns and rows preserved during actual production migration',{tableCount:customerCatalog.length,expectedAddedReferenceProfiles:1})
  restrictedClient=new pg.Client({...configDb,user:next.DB_USER,password:next.DB_PASSWORD});await restrictedClient.connect()
  const identity=(await restrictedClient.query(RUNTIME_ROLE_QUERY)).rows[0]
  assert.equal(runtimeDatabaseRoleFailure(identity),null)
  const afterLedger=(await restrictedClient.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  assert.ok(computeDrift(files,afterLedger).ok)
  const byVersion=new Map(afterLedger.map(row=>[row.version,row.checksum]))
  assert.ok(ledger.every(row=>byVersion.get(row.version)===row.checksum))
  report.runtimeIdentity=identity;report.migrationStateAfter={applied:afterLedger.length,historicalChecksumsPreserved:true}
  await restrictedClient.end();restrictedClient=null
  phase('production restricted login and all 109 migration hashes verified')
  docker(['compose','-f','docker-compose.yml','-f',override,'up','-d','--no-deps','--no-build','--force-recreate','--wait','--wait-timeout','120','metardu-app'],150_000)
  const after=JSON.parse(docker(['inspect',...services]))
  const updated=after.find(c=>c.Name==='/metardu-app')
  assert.equal(updated.Image,candidate.Id)
  assert.equal(updated.State.Health.Status,'healthy')
  for(const original of prior.filter(c=>c.Name!=='/metardu-app')){
    const kept=after.find(c=>c.Name===original.Name)
    assert.equal(kept.Id,original.Id);assert.equal(kept.Image,original.Image);assert.equal(kept.State.StartedAt,original.State.StartedAt)
    const byDestination=(left,right)=>left.Destination.localeCompare(right.Destination)
    assert.deepEqual([...kept.Mounts].sort(byDestination),[...original.Mounts].sort(byDestination))
  }
  assert.deepEqual(updated.Mounts.map(m=>({type:m.Type,name:m.Name,source:m.Source,destination:m.Destination,rw:m.RW})),report.before.find(c=>c.name==='metardu-app').mounts)
  report.applicationAfter={id:updated.Id,image:updated.Image,startedAt:updated.State.StartedAt,health:updated.State.Health.Status}
  phase('one existing application replaced; supporting identities and all data mounts preserved')
  const health=await fetch('http://127.0.0.1:3000/api/public/health',{signal:AbortSignal.timeout(15_000)})
  const body=await health.json();assert.equal(health.status,200);assert.equal(body.status,'healthy');assert.equal(body.checks.database.status,'ok');assert.equal(body.checks.redis.status,'ok')
  phase('new production HTTP/database/Redis health verified')
  docker(['image','tag',candidate.Id,'metardu-metardu-app:latest'])
  report.status='promoted';report.productionWritesThroughApplication=true
  report.applicationStopped=false
}catch(error){report.status=report.applicationStopped?'maintenance-failure':'blocked-before-mutation';report.failure={name:error.name,message:error instanceof assert.AssertionError?'Promotion precondition/assertion failed; inspect structured phase evidence.':error.message};console.error(report.failure.message);process.exitCode=1}
finally{try{await migrationClient?.end()}catch{}try{await restrictedClient?.end()}catch{}save()}
