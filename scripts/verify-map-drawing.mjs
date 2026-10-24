// Actual map drawing handler and PostgreSQL in an exact, owned rehearsal schema.
// Authentication is a bounded adapter; this does not prove production HTTP or RLS.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const service = JSON.parse(execFileSync('docker', ['inspect', '--format', '{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}', 'metardu-schema-rehearsal-20261008'], { encoding: 'utf8', windowsHide: true, timeout: 30000 }))
assert.equal(service.Id, 'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
assert.equal(service.Labels['metardu.purpose'], 'schema-rehearsal'); assert.equal(service.Running, true)
assert.deepEqual(service.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55433' }])
const token = randomUUID(), schema = `metardu_map_drawing_${token.replaceAll('-', '')}`
assert.match(schema, /^metardu_map_drawing_[a-f0-9]{32}$/)
const marker = `METARDU owned map drawing fixture ${token}`
const options = { connectionString: 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify', connectionTimeoutMillis: 5000, statement_timeout: 8000, application_name: `metardu-map-drawing-${token}` }
const admin = new pg.Client(options)
const pool = new pg.Pool({ ...options, max: 2, options: `-c search_path=${schema},public` })
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript'), originalLoad = Module._load
const leased = new Set()
let fault = 'none', beforeClient = null, beforeRead = null, acquired = 0
const database = {
  query: async (sql, values) => { if(beforeRead) { const hook=beforeRead;beforeRead=null;await hook() };return pool.query(sql,values) },
  getClient: async () => {
    if(beforeClient) { const hook=beforeClient;beforeClient=null;await hook() }
    const client=await pool.connect();leased.add(client);acquired++
    return {query:async(sql,values)=>{
      if(sql==='ROLLBACK'&&fault==='rollback') throw new Error('Owned synthetic rollback failure')
      const result=await client.query(sql,values)
      if(sql==='BEGIN') await client.query("SELECT set_config('metardu_fixture.drawing_fault',$1,true)",[fault])
      return result
    },release:error=>{assert.ok(leased.delete(client));client.release(error)}}
  },
}
Module._load = function (request, parent, ...rest) {
  if (request === '@/lib/db') return {db:database,setRlsContext:async()=>{}}
  if (request === '@/lib/cache/memory-cache') return {CacheKeys:{project:id=>id},projectCache:{invalidate(){}}}
  if (request === '@/lib/auth/ownership') return {requireProjectReadAccess:async(id,user)=>{
    const row=(await pool.query('SELECT user_id FROM projects WHERE id=$1',[id])).rows[0]
    return row&&row.user_id===user ? {ok:true,projectUserId:row.user_id} : {ok:false,error:Response.json({error:'Fixture access denied'},{status:403})}
  }}
  if (request === '@/lib/apiHandler') return {apiHandler:(_options,handler)=>async(req,userId)=>{
    if(!userId) return Response.json({error:'Unauthenticated fixture caller'},{status:401})
    try{return await handler(req,{userId,params:{id:projectId},body:req.method==='PUT'?await req.json():undefined})}
    catch{return Response.json({error:'Fixture drawing request failed'},{status:500})}
  }}
  return originalLoad.call(this,request.startsWith('@/')?path.join(process.cwd(),'src',request.slice(2)):request,parent,...rest)
}
Module._extensions['.ts']=function(module,filename){module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename)}
const {GET,PUT}=require('../src/app/api/project/[id]/map-drawing/route.ts')
const {buildProjectReferenceSystem,toReferenceSystemRow}=require('../src/lib/spatial/projectReferenceSystem.ts')
const {transformPoint}=require('../src/lib/spatial/projectCrs.ts')
const {NextRequest}=require('next/server')
const owner=randomUUID(),other=randomUUID(),projectId=randomUUID(),crs='EPSG:32737'
const ring=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(([e,n])=>transformPoint(e,n,crs,'EPSG:4326'))
const features={type:'FeatureCollection',features:[
  {type:'Feature',id:0,geometry:{type:'Polygon',coordinates:[ring(500000,9800000,100,50),ring(500010,9800010,20,10)]},properties:{name:'SYNTHETIC hole',nested:{retain:[0,null,'text']}}},
  {type:'Feature',id:0,geometry:{type:'LineString',coordinates:[[500000,9800000],[500003,9800004]].map(([e,n])=>transformPoint(e,n,crs,'EPSG:4326'))},properties:null},
]}
const empty={type:'FeatureCollection',features:[]}
const read=(user=owner,original=false)=>GET(new NextRequest(`http://127.0.0.1:3021/api/project/${projectId}/map-drawing${original?'?download=original':''}`),user)
const write=(version,data=features,user=owner,expected=user)=>PUT(new NextRequest(`http://127.0.0.1:3021/api/project/${projectId}/map-drawing`,{method:'PUT',headers:{'Content-Type':'application/json','X-Metardu-Expected-User':expected??''},body:JSON.stringify({baseVersion:version,features:data})}),user)
const state=async()=>(await pool.query('SELECT * FROM projects WHERE id=$1',[projectId])).rows[0]
const version=async()=>(await(await read()).json()).version
const files=['scripts/verify-map-drawing.mjs','src/app/api/project/[id]/map-drawing/route.ts','src/lib/mapDrawing/snapshot.ts','src/lib/mapDrawing/metrics.ts','src/lib/mapDrawing/wire.ts','src/lib/validation/mapDrawing.ts','src/lib/provenance/canonicalJson.ts']
const hashes=()=>Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]))
const report={checkedAt:new Date().toISOString(),source:hashes(),fixtureSchema:schema,authentication:'bounded adapter; not ordinary-account HTTP',rls:'isolated fixture tables; not RLS acceptance',checks:[]}
const root='.cache/map-drawing';mkdirSync(root,{recursive:true})
const save=()=>writeFileSync(`${root}/native.json`,JSON.stringify(report,null,2)+'\n')
const fingerprint=async()=>{const result={};for(const table of ['projects','project_reference_systems','setout_definitions','setout_points','setout_observations','tolerance_profiles'])result[table]=(await admin.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(record)::text,E'\n' ORDER BY row_to_json(record)::text),'')) hash FROM public.${table} record`)).rows[0];return result}
async function reset(){
  fault='none';beforeClient=null;beforeRead=null
  await pool.query('TRUNCATE project_reference_systems,projects')
  await pool.query('INSERT INTO projects(id,user_id,name,datum,utm_zone,hemisphere,boundary_data) VALUES($1,$2,$3,$4,37,$5,$6::jsonb)',[projectId,owner,'SYNTHETIC map drawing only','WGS84','S',JSON.stringify({source:'field-to-finish',coordinateCrs:'EPSG:4326',drawnFeatures:features,cad_document:{signature:'RETAIN SYNTHETIC CAD'},adjustedStations:[{pointName:'RETAIN CONTROL'}]})])
  const row=toReferenceSystemRow(projectId,{prs:buildProjectReferenceSystem({datum:'WGS84',utmZone:37,hemisphere:'S',verticalDatum:'SYNTHETIC BM'})},owner)
  const keys=Object.keys(row),values=Object.values(row)
  await pool.query(`INSERT INTO project_reference_systems(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,values)
}
async function check(name,run){try{await reset();await run();report.checks.push({name,passed:true})}catch(error){report.checks.push({name,passed:false,error:error.message})}finally{for(const client of leased)client.release(true);leased.clear()}save()}
let created=false,original,ledger
await admin.connect()
try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  original=await fingerprint();ledger=(await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  report.originalRecordsBefore=original;report.originalMigrationCount=ledger.length
  await admin.query(`CREATE SCHEMA ${schema}`);created=true;await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`)
  assert.equal((await pool.query('SELECT current_schema() name')).rows[0].name,schema)
  await pool.query(`CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid,name text,datum text,utm_zone int,hemisphere text,boundary_data jsonb);
    CREATE TABLE project_reference_systems(LIKE public.project_reference_systems INCLUDING ALL);
    CREATE FUNCTION drawing_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('metardu_fixture.drawing_fault',true)='suppress' THEN RETURN NULL; END IF;
      IF current_setting('metardu_fixture.drawing_fault',true)='rewrite' THEN NEW.boundary_data=NEW.boundary_data-'cad_document'; END IF;
      IF current_setting('metardu_fixture.drawing_fault',true) IN ('raise','rollback') THEN RAISE EXCEPTION 'owned drawing rejection'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER drawing_fault BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION drawing_fault();`)
  await check('complete GET snapshot is private and includes exact retained feature IDs and properties',async()=>{const response=await read();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual((await response.json()).features,features)})
  await check('save computes holes/line metrics and preserves CAD/control/source evidence',async()=>{
    const before=await state(),response=await write(await version());assert.equal(response.status,200)
    const body=await response.json();assert.deepEqual(body.features,features);assert.ok(Math.abs(body.metrics.areaSqM-4800)<0.001);assert.ok(Math.abs(body.metrics.totalLengthM-365)<0.001)
    const after=await state();assert.deepEqual(after.boundary_data.cad_document,before.boundary_data.cad_document);assert.deepEqual(after.boundary_data.adjustedStations,before.boundary_data.adjustedStations);assert.equal(after.boundary_data.source,before.boundary_data.source)
  })
  await check('two simultaneous edits based on one version admit one and refuse the other',async()=>{
    const initial=await version(),a=structuredClone(features),b=structuredClone(features);a.features[0].properties.name='SYNTHETIC A';b.features[0].properties.name='SYNTHETIC B'
    const results=await Promise.all([write(initial,a),write(initial,b)]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,1)
    const saved=(await state()).boundary_data.drawnFeatures;assert.ok(['SYNTHETIC A','SYNTHETIC B'].includes(saved.features[0].properties.name));assert.equal(saved.features.length,2)
  })
  await check('changed declared reference invalidates an earlier drawing version',async()=>{
    const initial=await version();beforeClient=()=>admin.query(`UPDATE ${schema}.project_reference_systems SET vertical_datum='NEW SYNTHETIC BM' WHERE project_id=$1`,[projectId]);assert.equal((await write(initial)).status,409)
  })
  await check('ownership change is refused at the locked write boundary',async()=>{
    const initial=await version();beforeClient=()=>admin.query(`UPDATE ${schema}.projects SET user_id=$1 WHERE id=$2`,[other,projectId]);assert.equal((await write(initial)).status,403)
  })
  for(const mode of ['suppress','rewrite','raise','rollback'])await check(`${mode}: no partial drawing save or false acknowledgement`,async()=>{
    const initial=await version(),before=await state();fault=mode;assert.equal((await write(initial,empty)).status,500);fault='none';assert.deepEqual(await state(),before);assert.equal(leased.size,0)
  })
  await check('concurrent unrelated CAD updates survive a drawing save',async()=>{
    const initial=await version();beforeClient=()=>admin.query(`UPDATE ${schema}.projects SET boundary_data=jsonb_set(boundary_data,'{cad_document,signature}','"NEW RETAINED SYNTHETIC CAD"') WHERE id=$1`,[projectId]);assert.equal((await write(initial)).status,200);assert.equal((await state()).boundary_data.cad_document.signature,'NEW RETAINED SYNTHETIC CAD')
  })
  await check('clearing drawn features preserves the CAD document and control evidence',async()=>{
    const before=await state();assert.equal((await write(await version(),empty)).status,200);const after=await state();assert.deepEqual(after.boundary_data.drawnFeatures,empty);assert.deepEqual(after.boundary_data.cad_document,before.boundary_data.cad_document);assert.deepEqual(after.boundary_data.adjustedStations,before.boundary_data.adjustedStations)
  })
  await check('missing declaration preserves geometry with unavailable metrics, never successful zeros',async()=>{
    await pool.query('DELETE FROM project_reference_systems WHERE project_id=$1',[projectId]);const response=await write(await version());assert.equal(response.status,200);const body=await response.json();assert.deepEqual(body.features,features);assert.equal(body.referenceSource,'legacy');assert.equal(body.metrics.status,'unavailable');assert.equal(body.metrics.areaSqM,null);assert.equal(body.metrics.totalLengthM,null)
  })
  await check('malformed saved data can be downloaded unchanged but not interpreted as survey geometry',async()=>{
    const raw={type:'FeatureCollection',features:[{invalid:'RETAIN ORIGINAL'}]};await pool.query("UPDATE projects SET boundary_data=jsonb_set(boundary_data,'{drawnFeatures}',$1::jsonb) WHERE id=$2",[JSON.stringify(raw),projectId]);assert.equal((await read()).status,422);const download=await read(owner,true);assert.equal(download.status,200);assert.deepEqual(await download.json(),raw)
  })
  await check('account switch and anonymous admission refuse before taking a write connection',async()=>{
    const before=acquired,initial=await version();assert.equal((await write(initial,features,owner,other)).status,403);assert.equal((await write(initial,features,null)).status,401);assert.equal(acquired,before)
  })
  await check('owner transfer between read authorization and snapshot does not leak the drawing',async()=>{
    beforeRead=()=>admin.query(`UPDATE ${schema}.projects SET user_id=$1 WHERE id=$2`,[other,projectId]);assert.equal((await read()).status,404)
  })
  await check('retained display circles round-trip without fabricated survey-circle measurements',async()=>{
    const circle={type:'FeatureCollection',features:[{type:'Feature',id:0,geometry:null,properties:{role:'SYNTHETIC circle'},metarduDisplayGeometry:{type:'Circle',coordinateCrs:'EPSG:3857',center:[100,200,0],radius:10}}]};const response=await write(await version(),circle);assert.equal(response.status,200);const body=await response.json();assert.deepEqual(body.features,circle);assert.equal(body.metrics.status,'unavailable');assert.equal(body.metrics.areaSqM,null)
  })
  await check('an unknown stored coordinate CRS is downloadable and never silently assumed',async()=>{
    await pool.query("UPDATE projects SET boundary_data=(boundary_data-'coordinateCrs') WHERE id=$1",[projectId]);assert.equal((await read()).status,422);assert.equal((await read(owner,true)).status,200)
  })
  await check('reserved metadata is included in the version hash',async()=>{
    const data=JSON.parse(JSON.stringify(features));data.features[0].properties=JSON.parse('{"__proto__":{"retain":0}}');await pool.query("UPDATE projects SET boundary_data=jsonb_set(boundary_data,'{drawnFeatures}',$1::jsonb) WHERE id=$2",[JSON.stringify(data),projectId]);const initial=await version();data.features[0].properties.__proto__.retain=1;await pool.query("UPDATE projects SET boundary_data=jsonb_set(boundary_data,'{drawnFeatures}',$1::jsonb) WHERE id=$2",[JSON.stringify(data),projectId]);assert.notEqual(await version(),initial);assert.equal((await write(initial)).status,409)
  })
  await check('twenty-five complete saves return every fixture connection to the bounded pool',async()=>{
    for(let i=0;i<25;i++)assert.equal((await write(await version())).status,200);assert.equal(leased.size,0);assert.equal(pool.waitingCount,0);assert.equal(pool.idleCount,pool.totalCount)
  })
}finally{
  for(const client of leased)client.release(true);leased.clear();await pool.end()
  try{
    if(created){assert.equal((await admin.query("SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1",[schema])).rows[0].marker,marker);await admin.query(`DROP SCHEMA ${schema} CASCADE`);assert.equal((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount,0);report.ownedFixtureRemoved=true}
    if(original){assert.deepEqual(await fingerprint(),original);report.originalRecordsPreserved=true}
    if(ledger){assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows,ledger);report.migrationLedgerPreserved=true}
    assert.deepEqual(hashes(),report.source);report.sourcePreserved=true
    report.status=report.checks.length===19&&report.checks.every(item=>item.passed)&&report.ownedFixtureRemoved&&report.originalRecordsPreserved&&report.migrationLedgerPreserved?'passed':'failed';save()
  }finally{await admin.end()}
}
console.log(JSON.stringify({status:report.status,checks:report.checks,preserved:report.originalRecordsPreserved,fixtureRemoved:report.ownedFixtureRemoved},null,2));process.exitCode=report.status==='passed'?0:1
