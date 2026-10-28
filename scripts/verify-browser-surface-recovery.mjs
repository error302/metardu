const declaredFixtureCrs21037 = 'EPSG:21037'
// Read-only DB corroboration of the exact command observed in Chrome/CUA.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
const phase=process.argv[2];assert.ok(['before','after'].includes(phase));assert.ok([3,4].includes(process.argv.length))
const fixture=JSON.parse(readFileSync('.cache/topographic/isolated-browser.json','utf8')),requestId=process.argv[3]??'cdb486cf-54e1-4733-872f-107f745f52de'
assert.match(requestId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
assert.equal(fixture.userId,'99f15c47-7a36-43c4-b98c-1171da777039');assert.equal(fixture.projectId,'474f92f6-0e90-4129-83fb-d514db596876');assert.equal(fixture.sourceOnly,true)
const info=JSON.parse(execFileSync('docker',['inspect','--format','{"Id":{{json .Id}},"Purpose":{{json (index .Config.Labels "metardu.purpose")}},"Ports":{{json .NetworkSettings.Ports}}}','metardu-schema-rehearsal-20261008'],{encoding:'utf8',timeout:30000,windowsHide:true}))
assert.equal(info.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0');assert.equal(info.Purpose,'schema-rehearsal');assert.deepEqual(info.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const client=new pg.Client({connectionString:'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify',connectionTimeoutMillis:5000,statement_timeout:10000})
await client.connect()
try{
  await client.query('BEGIN READ ONLY')
  assert.equal((await client.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  const project=(await client.query('SELECT user_id,name FROM projects WHERE id=$1',[fixture.projectId])).rows[0];assert.equal(project.user_id,fixture.userId);assert.equal(project.name,fixture.projectName)
  const source=(await client.query('SELECT point_name,easting::float8,northing::float8,elevation::float8,horizontal_crs,vertical_datum FROM survey_points WHERE project_id=$1 ORDER BY point_name',[fixture.projectId])).rows
  assert.deepEqual(source.map(point=>[point.point_name,point.easting,point.northing,point.elevation]),[['P1',500000,9850000,-2],['P2',500020,9850000,0],['P3',500020,9850020,2],['P4',500000,9850020,0],['P5',500010,9850010,0]])
  assert.ok(source.every(point=>point.horizontal_crs===declaredFixtureCrs21037&&point.vertical_datum==='Synthetic local benchmark - no field evidence'))
  const rows=(await client.query(`SELECT s.id surface_id,s.name,r.id revision_id,r.revision,r.input_hash,r.result,c.lines
    FROM surface_revisions r JOIN surfaces s ON s.id=r.surface_id JOIN contour_sets c ON c.surface_revision_id=r.id AND c.surface_id=s.id
    WHERE s.project_id=$1 AND r.result#>>'{snapshot,request,id}'=$2 AND r.result#>>'{snapshot,request,userId}'=$3`,[fixture.projectId,requestId,fixture.userId])).rows
  assert.ok(rows.length<=1)
  if(phase==='after')assert.equal(rows.length,1,'Recovery must acknowledge exactly one retained revision')
  if(rows.length){assert.equal(rows[0].name,'SYNTHETIC browser request-recovery - not field evidence');assert.ok(Number.isSafeInteger(rows[0].revision)&&rows[0].revision>=1);assert.equal(rows[0].result.snapshot.fieldVerified,false);assert.equal(rows[0].result.snapshot.observations.length,5);assert.equal(rows[0].lines.length,3)}
  const subscriptions=(await client.query('SELECT id FROM user_subscriptions WHERE user_id=$1',[fixture.userId])).rows;assert.equal(subscriptions.length,0)
  assert.equal((await client.query('SELECT role FROM users WHERE id=$1',[fixture.userId])).rows[0].role,'user')
  const ledger116=(await client.query("SELECT version FROM schema_migrations WHERE version LIKE '116%'")).rows
  const requestIndexes=(await client.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('idx_surface_revision_request_identity','idx_surface_export_request_identity')")).rows
  assert.equal(ledger116.length,0);assert.equal(requestIndexes.length,0)
  const report={status:'passed',phase,readOnly:true,requestId,projectId:fixture.projectId,userId:fixture.userId,requestCommitted:rows.length===1,
    ...(rows.length?{revisionId:rows[0].revision_id,surfaceId:rows[0].surface_id,revision:rows[0].revision,requestHash:rows[0].result.snapshot.request.payloadHash}:{}),revisionCount:rows.length,
    fiveOriginalMeasurementsAndReferencesPreserved:true,ordinaryRoleAndFreeEntitlementPreserved:true,newMigrationAppliedToPublicSyntheticLedger:false,productionProof:false,fieldProof:false}
  await client.query('COMMIT');writeFileSync(`.cache/surface-request-recovery/browser-db-${process.argv[3]?requestId+'-':''}${phase}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
}finally{await client.end()}
