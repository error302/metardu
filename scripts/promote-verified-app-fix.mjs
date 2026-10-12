// App-only correction on the already migrated 109-entry production schema.
// Never invokes a migration/provisioner or restarts supporting services.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import pg from 'pg'
import {collectFileMigrations,computeDrift,RUNTIME_ROLE_QUERY,runtimeDatabaseRoleFailure} from './verify-migrations.mjs'
const root='test-results/production-upgrade'
const previous=JSON.parse(readFileSync(`${root}/promotion.json`,'utf8'))
const candidate=JSON.parse(readFileSync(`${root}/candidate-build.json`,'utf8'))
const result={scope:'Existing application correction only; zero migrations or supporting-service restarts',status:'preparing',phases:[]}
const names=previous.before.map(c=>c.name)
const canonical=mounts=>mounts.map(m=>({type:m.Type,name:m.Name??null,source:m.Source,destination:m.Destination,rw:m.RW})).sort((a,b)=>a.destination.localeCompare(b.destination))
function docker(args,input,timeout=30_000){const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout,maxBuffer:10*1024*1024});if(r.error||r.status!==0)throw new Error(`Docker ${args[0]} failed; sensitive diagnostics suppressed`);return r.stdout.trim()}
function save(){writeFileSync(`${root}/application-fix.json`,JSON.stringify(result,null,2)+'\n')}
function phase(name){result.phases.push({name,passed:true});save();console.log(`PASS ${name}`)}
function sourceHash(){const hash=createHash('sha256');function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(entry.isFile()&&!/\.(test|spec)\./.test(entry.name)){hash.update(path.replaceAll('\\','/'));hash.update(readFileSync(path))}}}walk('src');for(const f of ['package.json','package-lock.json','Dockerfile','docker-entrypoint.sh','next.config.js']){hash.update(f);hash.update(readFileSync(f))}return hash.digest('hex')}
const envOf=c=>Object.fromEntries(c.Config.Env.map(value=>{const i=value.indexOf('=');return[value.slice(0,i),value.slice(i+1)]}))
let client
try{
  assert.equal(previous.status,'promoted');assert.equal(candidate.status,'built');assert.equal(sourceHash(),candidate.sourceSha256)
  const before=JSON.parse(docker(['inspect',...names])),old=before.find(c=>c.Name==='/metardu-app')
  assert.equal(old.Image,previous.applicationAfter.image);assert.equal(old.State.Health.Status,'healthy');assert.notEqual(old.Image,candidate.imageId)
  assert.equal(docker(['image','inspect','metardu-metardu-app:rollback-current','--format','{{.Id}}']),old.Image)
  assert.equal(docker(['image','inspect',candidate.imageTag,'--format','{{.Id}}']),candidate.imageId)
  const config=JSON.parse(docker(['compose','-f','docker-compose.yml','config','--format','json']))
  const oldEnv=envOf(old),next=config.services['metardu-app'].environment
  for(const key of ['AUTH_SECRET','WORKER_SECRET','NEXTAUTH_URL','NEXT_PUBLIC_APP_URL','DB_USER','DB_PASSWORD','DB_NAME'])assert.equal(next[key],oldEnv[key])
  client=new pg.Client({host:'127.0.0.1',port:5432,user:oldEnv.DB_USER,password:oldEnv.DB_PASSWORD,database:oldEnv.DB_NAME,connectionTimeoutMillis:10_000});await client.connect()
  const ledger=(await client.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  assert.equal(ledger.length,109);assert.ok(computeDrift(collectFileMigrations(),ledger).ok)
  assert.equal(runtimeDatabaseRoleFailure((await client.query(RUNTIME_ROLE_QUERY)).rows[0]),null)
  await client.end();client=null
  const jobSql=`BEGIN READ ONLY; SELECT jsonb_build_object(
    'background',(SELECT count(*) FROM background_jobs WHERE status='running'),
    'render',(SELECT count(*) FROM render_jobs WHERE status='running'),
    'drone',(SELECT count(*) FROM drone_processing_tasks WHERE status IN ('uploading','running','importing'))); ROLLBACK;`
  result.activeJobs=JSON.parse(docker(['exec','-i','metardu-postgres','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],jobSql))
  assert.ok(Object.values(result.activeJobs).every(count=>count===0))
  result.beforeImage=old.Image;result.candidate=candidate;result.schemaEntries=109
  phase('verified candidate, schema, restricted role, rollback and configuration continuity')
  const override='.cache/release-verify/production-app-fix.override.yml'
  writeFileSync(override,`services:\n  metardu-app:\n    image: metardu-metardu-app:candidate\n    environment:\n      METARDU_BUILD_SHA: working-tree-${candidate.sourceSha256.slice(0,16)}\n`)
  if(!process.argv.includes('--execute')){result.status='prepared';save();console.log('Prepared only; --execute is required for the app-only correction.');process.exit(0)}
  docker(['stop','--timeout','20','metardu-app'],undefined,40_000);result.applicationStopped=true
  const log=spawnSync('docker',['logs','--timestamps','metardu-app'],{encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:10*1024*1024});assert.equal(log.status,0)
  docker(['exec','-i','metardu-backup','bash','-c','set -o noclobber; umask 077; cat > /backups/app_before_exportfix_20261010.log'],log.stdout+log.stderr)
  const backup=docker(['exec','-e','BACKUP_RETENTION=36500','metardu-backup','/app/scripts/backup.sh'],undefined,60_000)
  assert.ok(backup.includes('Backup integrity verified.')&&backup.includes('Backup complete.'))
  result.checkpoint={database:backup.match(/Database backup: (\/backups\/db_[0-9_]+\.sql\.gz)/)?.[1],uploads:backup.match(/Uploads backup: (\/backups\/uploads_[0-9_]+\.tar\.gz)/)?.[1],originalArchivesPreserved:true}
  assert.ok(result.checkpoint.database&&result.checkpoint.uploads)
  phase('only application stopped; private logs and fresh checkpoint preserved')
  docker(['compose','-f','docker-compose.yml','-f',override,'up','-d','--no-deps','--no-build','--force-recreate','--wait','--wait-timeout','120','metardu-app'],undefined,150_000)
  const after=JSON.parse(docker(['inspect',...names])),app=after.find(c=>c.Name==='/metardu-app')
  assert.equal(app.Image,candidate.imageId);assert.equal(app.State.Health.Status,'healthy')
  for(const prior of before){const current=after.find(c=>c.Name===prior.Name);if(prior.Name!=='/metardu-app'){assert.equal(current.Id,prior.Id);assert.equal(current.Image,prior.Image);assert.equal(current.State.StartedAt,prior.State.StartedAt)}assert.deepEqual(canonical(current.Mounts),canonical(prior.Mounts))}
  client=new pg.Client({host:'127.0.0.1',port:5432,user:oldEnv.DB_USER,password:oldEnv.DB_PASSWORD,database:oldEnv.DB_NAME,connectionTimeoutMillis:10_000});await client.connect()
  assert.deepEqual((await client.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows,ledger)
  result.runtimeIdentity=(await client.query(RUNTIME_ROLE_QUERY)).rows[0];assert.equal(runtimeDatabaseRoleFailure(result.runtimeIdentity),null)
  await client.end();client=null
  const health=await fetch('http://127.0.0.1:3000/api/public/health',{signal:AbortSignal.timeout(15_000)}),body=await health.json()
  assert.equal(health.status,200);assert.equal(body.status,'healthy');assert.equal(body.checks.database.status,'ok');assert.equal(body.checks.redis.status,'ok')
  docker(['image','tag',app.Image,'metardu-metardu-app:latest'])
  result.applicationStopped=false;result.status='promoted';result.applicationAfter={id:app.Id,image:app.Image,startedAt:app.State.StartedAt,health:app.State.Health.Status}
  phase('app-only correction healthy; 109 ledger entries, restricted role, support identities and mounts unchanged')
  previous.previousApplicationImage=previous.applicationAfter.image;previous.applicationAfter=result.applicationAfter;previous.candidate={imageId:candidate.imageId,sourceSha256:candidate.sourceSha256}
  previous.applicationFix={reason:'Use canonical survey_points.is_control, not nonexistent point_type',schemaUnchanged:true,evidence:'application-fix.json'}
  writeFileSync(`${root}/promotion.json`,JSON.stringify(previous,null,2)+'\n')
}catch(error){result.status=result.applicationStopped?'maintenance-failure':'blocked-before-mutation';result.failure={name:error.name,message:error instanceof assert.AssertionError?'App correction assertion failed; inspect phase evidence':error.message};console.error(result.failure.message);process.exitCode=1}
finally{try{await client?.end()}catch{}save()}
