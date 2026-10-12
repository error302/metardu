// Verification only after the app switch: no stop, restart or migration.
// Docker mount inventory order is not stable; compare canonical mount sets.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import pg from 'pg'
import {RUNTIME_ROLE_QUERY,runtimeDatabaseRoleFailure,collectFileMigrations,computeDrift} from './verify-migrations.mjs'
const file='test-results/production-upgrade/promotion.json'
const report=JSON.parse(readFileSync(file,'utf8'))
const candidate=JSON.parse(readFileSync('test-results/production-upgrade/candidate-build.json','utf8'))
assert.equal(report.status,'maintenance-failure')
assert.equal(report.failure.name,'AssertionError')
assert.ok(report.phases.some(phase=>phase.name==='production restricted login and all 109 migration hashes verified' && phase.passed))
assert.equal(report.customerPreservation.differences.length,0)
writeFileSync('test-results/production-upgrade/promotion-mount-order-failure.json',JSON.stringify(report,null,2)+'\n')
function docker(args){const result=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:5*1024*1024});assert.equal(result.status,0,'Docker command failed; sensitive details suppressed');return result.stdout.trim()}
const canonical=mounts=>mounts.map(m=>({type:m.Type,name:m.Name??null,source:m.Source,destination:m.Destination,rw:m.RW})).sort((a,b)=>a.destination.localeCompare(b.destination))
const sorted=mounts=>mounts.map(m=>({...m,name:m.name??null})).sort((a,b)=>a.destination.localeCompare(b.destination))
const after=JSON.parse(docker(['inspect',...report.before.map(c=>c.name)]))
const app=after.find(c=>c.Name==='/metardu-app')
assert.equal(candidate.status,'built');assert.equal(app.Image,candidate.imageId);assert.equal(app.Image,report.candidate.imageId);assert.equal(app.Config.Image,candidate.imageTag)
assert.equal(app.State.Health.Status,'healthy')
for(const prior of report.before){
  const current=after.find(c=>c.Name==='/'+prior.name)
  if(prior.name!=='metardu-app'){assert.equal(current.Id,prior.id);assert.equal(current.Image,prior.image);assert.equal(current.State.StartedAt,prior.startedAt)}
  assert.deepEqual(canonical(current.Mounts),sorted(prior.mounts))
}
assert.equal(docker(['image','inspect','metardu-metardu-app:rollback-20261010','--format','{{.Id}}']),report.before.find(c=>c.name==='metardu-app').image)
const env=Object.fromEntries(app.Config.Env.map(value=>{const i=value.indexOf('=');return[value.slice(0,i),value.slice(i+1)]}))
assert.equal(env.METARDU_BUILD_SHA,`working-tree-${candidate.sourceSha256.slice(0,16)}`)
const client=new pg.Client({host:'127.0.0.1',port:5432,user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,connectionTimeoutMillis:10_000})
await client.connect()
try{
  report.runtimeIdentity=(await client.query(RUNTIME_ROLE_QUERY)).rows[0];assert.equal(runtimeDatabaseRoleFailure(report.runtimeIdentity),null)
  const ledger=(await client.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  assert.equal(ledger.length,109);assert.ok(computeDrift(collectFileMigrations(),ledger).ok)
}finally{await client.end()}
const health=await fetch('http://127.0.0.1:3000/api/public/health',{signal:AbortSignal.timeout(15_000)}),body=await health.json()
assert.equal(health.status,200);assert.equal(body.status,'healthy');assert.equal(body.checks.database.status,'ok');assert.equal(body.checks.redis.status,'ok')
docker(['image','tag',app.Image,'metardu-metardu-app:latest'])
report.verificationCorrection={cause:'Docker returned unchanged backup mounts in a different array order',canonicalMountSetsPreserved:true,noServiceRestartOrMigrationRepeated:true}
delete report.failure
report.applicationAfter={id:app.Id,image:app.Image,startedAt:app.State.StartedAt,health:app.State.Health.Status}
report.applicationStopped=false;report.status='promoted';report.productionWritesThroughApplication=true
report.phases.push({name:'canonical mount sets, supporting identities, restricted role and production HTTP/database/Redis health verified',passed:true})
writeFileSync(file,JSON.stringify(report,null,2)+'\n')
console.log('PASS upgraded application, 109 migration hashes, restricted login, supporting identities, canonical mounts and HTTP/database/Redis health. No restart or migration repeated.')
