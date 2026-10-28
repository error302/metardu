const declaredFixtureCrs32632 = 'EPSG:32632'
// Actual source handler and survey engines, real SQL, uniquely owned schema.
// The HTTP/session/RLS wrapper is adapted here; it needs separate HTTP proof.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const phase=process.argv[2]
assert.ok(['red','green'].includes(phase));assert.equal(process.argv.length,3)
const serviceId='ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0'
const service=JSON.parse(execFileSync('docker',['inspect','--format','{"Id":{{json .Id}},"Purpose":{{json (index .Config.Labels "metardu.purpose")}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}','metardu-schema-rehearsal-20261008'],{encoding:'utf8',timeout:30000,windowsHide:true}))
assert.equal(service.Id,serviceId);assert.equal(service.Purpose,'schema-rehearsal');assert.equal(service.Running,true)
assert.deepEqual(service.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const connectionString='postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify'
const token=randomUUID(),schema=`metardu_surface_verify_${token.replaceAll('-','')}`,marker=`METARDU owned surface fixture ${token}`,applicationName=`metardu-surface-native-${token}`
assert.match(schema,/^metardu_surface_verify_[a-f0-9]{32}$/)
const pool=new pg.Pool({connectionString,max:5,connectionTimeoutMillis:15000,statement_timeout:10000,application_name:applicationName,options:`-c search_path=${schema},public`})
const admin=new pg.Client({connectionString,connectionTimeoutMillis:5000,statement_timeout:10000})
const files=['src/app/api/project/[id]/surfaces/route.ts','src/lib/topo/breaklineTIN.ts','src/lib/topo/constrainedTIN.ts','src/lib/topo/tinContours.ts','src/lib/db/migrations/065_project_reference_systems.sql','src/lib/db/migrations/074_topo_surface_persistence.sql','src/lib/db/migrations/116_surface_request_recovery.sql']
const hashes=()=>Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]))
const before=hashes(),root='.cache/terrain-domain'
mkdirSync(root,{recursive:true})
const storageRoot=path.resolve(root,`owned-storage-${token}`)
assert.equal(path.dirname(storageRoot),path.resolve(root));mkdirSync(storageRoot)
writeFileSync(path.join(storageRoot,'ownership.txt'),marker)
process.env.STORAGE_ROOT=storageRoot
// Only this isolated verifier process selects local storage; no provider calls.
process.env.GCS_PROJECT_ID='';process.env.GCS_BUCKET_NAME=''
let featureAllowed=true
let loseCommitAcknowledgement=false
const report={phase,serviceId,schema,source:before,checks:[],status:'running',productionChanged:false,publicSchemaChanged:false,containerLifecycleChanged:false,httpAuthProof:false,rlsProof:false,fieldProof:false}
const save=()=>writeFileSync(`${root}/${phase}.json`,JSON.stringify(report,null,2)+'\n')
const database={query:(sql,values)=>pool.query(sql,values),transaction:async work=>{
  const client=await pool.connect()
  try {await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');if(loseCommitAcknowledgement){loseCommitAcknowledgement=false;throw new Error('Owned lost COMMIT acknowledgement fixture')}return result}
  catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}}
const require=createRequire(import.meta.url),Module=require('node:module'),ts=require('typescript'),originalLoad=Module._load
const compiledSource={}
Module._load=function(request,parent,...rest){
  if(request==='@/lib/db')return {db:database}
  if(request==='@/lib/subscription/subscriptionEngine')return {checkFeatureAccess:async()=>({allowed:featureAllowed,reason:'Native plan fixture denied'})}
  if(request==='@/lib/logger')return {logger:{error(){},warn(){},info(){}}}
  if(request==='@/lib/enterprise/auditTrail')return {logAuditEvent:async()=>undefined}
  if(request==='@/lib/auth/ownership')return {requireProjectOwnership:async()=>({ok:true}),requireProjectReadAccess:async()=>({ok:true})}
  if(request==='@/lib/apiHandler')return {apiHandler:(options,handler)=>async(projectId,body,userId)=>handler({nextUrl:new URL(body?.nativeUrl??'http://127.0.0.1/native-surface-check')},{params:{id:projectId},body:options.schema?.parse(body),userId})}
  const resolved=request.startsWith('@/')?path.join(process.cwd(),'src',request.slice(2)):request
  return originalLoad.call(this,resolved,parent,...rest)
}
Module._extensions['.ts']=function(module,filename){
  const source=readFileSync(filename,'utf8'),relative=path.relative(process.cwd(),filename).replaceAll('\\','/')
  if(relative.startsWith('src/'))compiledSource[relative]=createHash('sha256').update(source).digest('hex')
  module._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,filename)
}
const {POST:create}=require('../src/app/api/project/[id]/surfaces/route.ts')
const {GET:readSurface}=require('../src/app/api/project/[id]/surfaces/route.ts')
const {POST:exportDxf}=require('../src/app/api/topo/export/dxf/route.ts')
const {GET:recoverDxf}=require('../src/app/api/topo/export/dxf/route.ts')
const {loadSurfaceRevision}=require('../src/lib/topo/surfaceRevision.ts')
const {GET:downloadStorage}=require('../src/app/api/storage/route.ts')
const {buildProjectReferenceSystem,toReferenceSystemRow}=require('../src/lib/spatial/projectReferenceSystem.ts')
const {pointImportReferenceHash}=require('../src/lib/import/pointImportServer.ts')
const {canonicalJson}=require('../src/lib/provenance/canonicalJson.ts')
report.instantiatedSourceHashes=compiledSource
const owner=randomUUID(),other=randomUUID(),CRS='EPSG:21037'
async function seed(){
  const id=randomUUID()
  await pool.query('INSERT INTO projects(id,user_id) VALUES($1,$2)',[id,owner])
  const row=toReferenceSystemRow(id,{prs:buildProjectReferenceSystem({datum:'ARC1960',utmZone:37,hemisphere:'S',verticalDatum:'Synthetic BM',verticalReference:'local',distanceMode:'grid',coordinatePrecision:3})},owner)
  const keys=Object.keys(row)
  await pool.query(`INSERT INTO project_reference_systems(${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row))
  const xyz=[[500000,9850000,-2],[500020,9850000,0],[500020,9850020,2],[500000,9850020,0],[500010,9850010,0]],ids=[]
  for(let index=0;index<xyz.length;index++){
    const pointId=randomUUID();ids.push(pointId)
    await pool.query('INSERT INTO survey_points(id,project_id,point_name,easting,northing,elevation,horizontal_crs,vertical_datum,code,source,observer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[pointId,id,`P${index+1}`,...xyz[index],CRS,'Synthetic BM','SPOT','synthetic_native',owner])
  }
  const reference=(await pool.query('SELECT * FROM project_reference_systems WHERE project_id=$1',[id])).rows[0]
  return {id,ids,xyz,referenceHash:pointImportReferenceHash(reference)}
}
const reviewedHash=(fixture,ids=fixture.ids)=>createHash('sha256').update(canonicalJson({version:1,referenceHash:fixture.referenceHash,
  points:fixture.ids.map((id,i)=>({id,pointName:`P${i+1}`,x:fixture.xyz[i][0],y:fixture.xyz[i][1],z:fixture.xyz[i][2],code:'SPOT',horizontalCrs:CRS,verticalDatum:'Synthetic BM'})).filter(point=>ids.includes(point.id)).sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex')
const body=(fixture,extra={})=>({requestId:randomUUID(),expectedUserId:owner,name:'SYNTHETIC native surface - not field evidence',pointIds:fixture.ids,
  expectedReferenceHash:fixture.referenceHash,expectedSourceHash:reviewedHash(fixture,extra.pointIds??fixture.ids),interval:1,resolution:2,useStoredBreaklines:false,...extra})
async function invoke(fixture,extra={},actor=owner){
  try {const response=await create(fixture.id,body(fixture,extra),actor);return {status:response.status,json:await response.json()}}
  catch(error){return {status:error.statusCode??500,error:error.message}}
}
async function state(id){
  const result={}
  for(const table of ['survey_points','project_reference_systems','breaklines','surfaces'])result[table]=(await pool.query(`SELECT * FROM ${table} WHERE project_id=$1 ORDER BY id`,[id])).rows
  result.revisions=(await pool.query('SELECT r.* FROM surface_revisions r JOIN surfaces s ON s.id=r.surface_id WHERE s.project_id=$1 ORDER BY r.id',[id])).rows
  result.contours=(await pool.query('SELECT c.* FROM contour_sets c JOIN surfaces s ON s.id=c.surface_id WHERE s.project_id=$1 ORDER BY c.id',[id])).rows
  return result
}
async function noMutation(fixture,extra,status){const before=await state(fixture.id),response=await invoke(fixture,extra);assert.equal(response.status,status,response.error||response.json?.error||'Unexpected handler status');assert.deepEqual(await state(fixture.id),before)}
async function check(name,work){try{await work();report.checks.push({name,passed:true});console.log('PASS '+name)}catch(error){report.checks.push({name,passed:false,error:error.message});console.log('FAIL '+name+': '+error.message)}save()}
let created=false
await admin.connect()
try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  report.ledgerBefore=(await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  await admin.query(`CREATE SCHEMA ${schema}`);created=true;await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`)
  await pool.query('CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid REFERENCES users(id))')
  await pool.query('INSERT INTO users VALUES($1),($2)',[owner,other])
  await pool.query(readFileSync('src/lib/db/migrations/065_project_reference_systems.sql','utf8'))
  await pool.query(readFileSync('src/lib/db/migrations/074_topo_surface_persistence.sql','utf8'))
  const registerMigration=readFileSync('src/lib/db/migrations/072_deliverables_computations_qa.sql','utf8')
  const registerEnd=registerMigration.indexOf('-- ─── computation_runs:');assert.ok(registerEnd>0)
  await pool.query(registerMigration.slice(0,registerEnd))
  await pool.query(readFileSync('src/lib/db/migrations/116_surface_request_recovery.sql','utf8'))
  const consolidated=readFileSync('src/lib/db/migrations/035_consolidated_missing_tables.sql','utf8')
  const uploadStart=consolidated.indexOf('CREATE TABLE IF NOT EXISTS file_uploads ('),uploadEnd=consolidated.indexOf('-- ─── 17.',uploadStart)
  assert.ok(uploadStart>0&&uploadEnd>uploadStart);await pool.query(consolidated.slice(uploadStart,uploadEnd))
  await pool.query(`CREATE TABLE evidence_events(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),project_id uuid REFERENCES projects(id),entity_type text,
    entity_id uuid,event_type text,details jsonb,user_id uuid REFERENCES users(id),event_hash text,previous_hash text,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE export_faults(project_id uuid PRIMARY KEY,stage text);
    CREATE FUNCTION owned_export_event_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM export_faults WHERE project_id=NEW.project_id AND stage='event') THEN RAISE EXCEPTION 'owned export event fault'; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER owned_export_event_fault BEFORE INSERT ON evidence_events FOR EACH ROW EXECUTE FUNCTION owned_export_event_fault();
    CREATE FUNCTION owned_export_file_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM export_faults WHERE project_id=NEW.project_id AND stage='file') THEN RETURN NULL; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER owned_export_file_fault BEFORE INSERT ON file_uploads FOR EACH ROW EXECUTE FUNCTION owned_export_file_fault()`)
  await pool.query(`CREATE TABLE survey_points(id uuid PRIMARY KEY,project_id uuid REFERENCES projects(id),point_name text,easting numeric,northing numeric,elevation numeric,
    horizontal_crs text,vertical_datum text,code text,source text,observer_id uuid,instrument_id uuid,import_session_id uuid,observation_date timestamptz,updated_at timestamptz DEFAULT NOW(),deleted_at timestamptz);
    CREATE FUNCTION owned_surface_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='silent-surface' THEN RETURN NULL; END IF; RETURN NEW; END $$;
    CREATE TRIGGER owned_surface_fault BEFORE INSERT ON surfaces FOR EACH ROW EXECUTE FUNCTION owned_surface_fault();
    CREATE FUNCTION owned_revision_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM surfaces WHERE id=NEW.surface_id AND name='silent-revision') THEN RETURN NULL; END IF; RETURN NEW; END $$;
    CREATE TRIGGER owned_revision_fault BEFORE INSERT ON surface_revisions FOR EACH ROW EXECUTE FUNCTION owned_revision_fault();
    CREATE FUNCTION owned_contour_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM surfaces WHERE id=NEW.surface_id AND name='silent-contours') THEN RETURN NULL; END IF; RETURN NEW; END $$;
    CREATE TRIGGER owned_contour_fault BEFORE INSERT ON contour_sets FOR EACH ROW EXECUTE FUNCTION owned_contour_fault();
    CREATE FUNCTION owned_pointer_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.name='silent-pointer' THEN RETURN NULL; END IF; RETURN NEW; END $$;
    CREATE TRIGGER owned_pointer_fault BEFORE UPDATE ON surfaces FOR EACH ROW EXECUTE FUNCTION owned_pointer_fault()`)

  await check('known plane retains five original XYZ measurements and exact reference provenance',async()=>{
    const fixture=await seed(),response=await invoke(fixture)
    assert.equal(response.status,201,JSON.stringify(response))
    const saved=await state(fixture.id);assert.equal(saved.revisions.length,1);assert.equal(saved.contours.length,1)
    const revision=saved.revisions[0],snapshot=revision.result.snapshot
    assert.equal(snapshot.schemaVersion,2);assert.equal(snapshot.referenceHash,fixture.referenceHash);assert.equal(snapshot.fieldVerified,false)
    assert.deepEqual(snapshot.observations.map(point=>[point.x,point.y,point.z]).sort(),fixture.xyz.slice().sort())
    assert.ok(snapshot.observations.every(point=>point.horizontalCrs===CRS&&point.verticalDatum==='Synthetic BM'&&point.source==='synthetic_native'&&point.observerId===owner))
    assert.equal(saved.surfaces[0].current_revision_id,revision.id);assert.equal(response.json.data.inputHash,revision.input_hash)
    assert.equal(snapshot.hashAlgorithm,'sha256-canonical-json-v1')
    assert.equal(createHash('sha256').update(canonicalJson(snapshot)).digest('hex'),revision.input_hash,'Retained JSONB including timestamps must verify after object key reordering')
    const contours=saved.contours[0].lines;assert.deepEqual(contours.map(line=>line.elevation).sort((a,b)=>a-b),[-1,0,1])
    for(const line of contours)for(const ring of line.coordinates)for(const [e,n]of ring)assert.ok(Math.abs(line.elevation-(-2+0.1*(e-500000)+0.1*(n-9850000)))<1e-8)
  })
  await check('unknown active heights block an all-source computation without filtering',async()=>{
    const fixture=await seed();await pool.query('UPDATE survey_points SET elevation=NULL WHERE id=$1',[fixture.ids[1]])
    await noMutation(fixture,{},400)
  })
  for(const [name,column,value]of [['missing CRS','horizontal_crs',null],['mixed CRS','horizontal_crs','EPSG:32632'],['missing height basis','vertical_datum',null],['mixed height basis','vertical_datum','Other BM']])await check(`${name} refuses a mislabeled surface`,async()=>{
    const fixture=await seed();assert.ok(['horizontal_crs','vertical_datum'].includes(column));await pool.query(`UPDATE survey_points SET ${column}=$1 WHERE id=$2`,[value,fixture.ids[1]]);await noMutation(fixture,{},400)
  })
  await check('missing declared height reference is not inferred',async()=>{
    const fixture=await seed();await pool.query('UPDATE project_reference_systems SET vertical_datum=NULL WHERE project_id=$1',[fixture.id]);await noMutation(fixture,{},400)
  })
  await check('soft-deleted points cannot silently re-enter a surface',async()=>{
    const fixture=await seed();await pool.query('INSERT INTO survey_points(id,project_id,point_name,easting,northing,elevation,horizontal_crs,vertical_datum,deleted_at) VALUES($1,$2,$3,500030,9850030,999,$4,$5,NOW())',[randomUUID(),fixture.id,'DELETED',CRS,'Synthetic BM'])
    const response=await invoke(fixture);assert.equal(response.status,201,JSON.stringify(response));assert.equal(response.json.data.pointCount,5)
  })
  await check('explicit source selection excludes an unknown-height record by declared identity',async()=>{
    const fixture=await seed();await pool.query('INSERT INTO survey_points(id,project_id,point_name,easting,northing,elevation,horizontal_crs,vertical_datum) VALUES($1,$2,$3,500030,9850030,NULL,$4,NULL)',[randomUUID(),fixture.id,'UNKNOWN',CRS])
    const response=await invoke(fixture);assert.equal(response.status,201,JSON.stringify(response));assert.equal(response.json.data.pointCount,5)
    const saved=await state(fixture.id);assert.equal(saved.survey_points.length,6);assert.equal(saved.revisions[0].result.snapshot.sourceSelection.mode,'explicit_point_ids')
  })
  await check('a selected foreign-project point cannot be substituted or imported',async()=>{
    const fixture=await seed(),foreign=await seed();await noMutation(fixture,{pointIds:[fixture.ids[0],fixture.ids[1],foreign.ids[2]]},409)
  })
  await check('a changed reference review preserves all prior source and revision records',async()=>{const fixture=await seed();await noMutation(fixture,{expectedReferenceHash:'f'.repeat(64)},409)})
  await check('transactional ownership refuses a different actor even if the wrapper is permissive',async()=>{
    const fixture=await seed(),before=await state(fixture.id),response=await invoke(fixture,{expectedUserId:other},other);assert.equal(response.status,403);assert.deepEqual(await state(fixture.id),before)
  })
  await check('unreferenced original breaklines refuse automatic reuse and remain intact',async()=>{
    const fixture=await seed();await pool.query('INSERT INTO breaklines(project_id,name,coordinates) VALUES($1,$2,$3)',[fixture.id,'Original evidence',JSON.stringify(fixture.xyz.slice(0,2).map(([x,y,z])=>({x,y,z})))])
    await noMutation(fixture,{useStoredBreaklines:true},400)
  })
  await check('explicit breaklines are snapshotted without deleting original line evidence',async()=>{
    const fixture=await seed();await pool.query('INSERT INTO breaklines(project_id,name,coordinates) VALUES($1,$2,$3)',[fixture.id,'Original evidence','[]'])
    const before=(await state(fixture.id)).breaklines
    const line={name:'Reviewed constraint',type:'hard',points:[fixture.xyz[0],fixture.xyz[3]].map(([x,y,z])=>({x,y,z}))}
    const response=await invoke(fixture,{breaklines:[line],breaklineReference:{horizontalCrs:CRS,verticalDatum:'Synthetic BM',units:'metres'}})
    assert.equal(response.status,201,JSON.stringify(response));const saved=await state(fixture.id);assert.deepEqual(saved.breaklines,before);assert.deepEqual(saved.revisions[0].result.snapshot.breaklines,[line])
  })
  for(const name of ['silent-surface','silent-revision','silent-contours','silent-pointer'])await check(`${name} rolls back every new record`,async()=>{const fixture=await seed();await noMutation(fixture,{name},500)})
  await check('the real database prevents duplicate named surface headers',async()=>{
    const fixture=await seed();await pool.query("INSERT INTO surfaces(project_id,name,created_by) VALUES($1,'unique-name',$2)",[fixture.id,owner]);const before=await state(fixture.id)
    await assert.rejects(pool.query("INSERT INTO surfaces(project_id,name,created_by) VALUES($1,'unique-name',$2)",[fixture.id,owner]),error=>error.code==='23505');assert.deepEqual(await state(fixture.id),before)
  })
  await check('a mismatched historical head is preserved for review',async()=>{
    const fixture=await seed(),first=await invoke(fixture,{name:'first'});assert.equal(first.status,201)
    await pool.query("INSERT INTO surfaces(project_id,name,current_revision_id,created_by) VALUES($1,'bad-head',$2,$3)",[fixture.id,first.json.data.revisionId,owner]);await noMutation(fixture,{name:'bad-head'},409)
  })
  await check('simultaneous computations serialize into one ordered immutable chain',async()=>{
    const fixture=await seed(),lock=await pool.connect();let work
    try{
      await lock.query('BEGIN');await lock.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[fixture.id])
      work=Promise.all([invoke(fixture),invoke(fixture)])
      let bothWaiting=false
      for(let attempt=0;attempt<50;attempt++){
        const waiting=await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%SELECT id, user_id FROM projects%FOR UPDATE%'",[applicationName])
        if(waiting.rows[0].n>=2){bothWaiting=true;break}await new Promise(resolve=>setTimeout(resolve,25))
      }
      assert.equal(bothWaiting,true,'Both real transactions must be observed waiting on the same parent row')
      await lock.query('COMMIT')
      const responses=await work;assert.ok(responses.every(response=>response.status===201),JSON.stringify(responses))
      const saved=await state(fixture.id);assert.equal(saved.surfaces.length,1);assert.deepEqual(saved.revisions.map(row=>row.revision).sort(),[1,2]);assert.equal(saved.contours.length,2)
      const latest=saved.revisions.find(row=>row.revision===2);assert.equal(saved.surfaces[0].current_revision_id,latest.id)
      await assert.rejects(pool.query('UPDATE surface_revisions SET algorithm_version=$1 WHERE id=$2',['changed',latest.id]),/append-only/)
    }finally{await lock.query('ROLLBACK');lock.release();if(work)await work}
  })
  await check('historical reads and retained DXF use R1 after present-day measurements and the current head change',async()=>{
    const fixture=await seed(),first=await invoke(fixture);assert.equal(first.status,201)
    const revisionId=first.json.data.revisionId,original=await loadSurfaceRevision(fixture.id,revisionId)
    await pool.query('UPDATE survey_points SET elevation=elevation+10 WHERE project_id=$1',[fixture.id])
    assert.equal((await invoke(fixture,{expectedSourceHash:reviewedHash({...fixture,xyz:fixture.xyz.map(([x,y,z])=>[x,y,z+10])})})).status,201)
    assert.deepEqual(await loadSurfaceRevision(fixture.id,revisionId),original)
    const response=await exportDxf(fixture.id,{expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:revisionId,requestId:randomUUID()},owner)
    assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer())
    assert.equal(response.headers.get('X-Metardu-Surface-Revision'),revisionId)
    const records=(await pool.query('SELECT r.*,d.status FROM deliverable_revisions r JOIN deliverables d ON d.id=r.deliverable_id WHERE d.project_id=$1',[fixture.id])).rows
    assert.equal(records.length,1);const record=records[0]
    assert.equal(record.source_revision,revisionId);assert.equal(record.manifest.surface_revision,1);assert.equal(record.status,'IN_REVIEW')
    assert.equal(record.manifest.field_verified,false);assert.equal(record.manifest.professional_approval,false)
    assert.equal(record.content_hash,createHash('sha256').update(bytes).digest('hex'))
    assert.deepEqual(readFileSync(path.join(storageRoot,record.storage_path)),bytes)
    const downloadRequest={nativeUrl:`http://127.0.0.1/api/storage?path=${encodeURIComponent(record.storage_path)}`}
    const recovered=await downloadStorage(undefined,downloadRequest,owner)
    assert.equal(recovered.status,200);assert.deepEqual(Buffer.from(await recovered.arrayBuffer()),bytes)
    assert.equal((await downloadStorage(undefined,downloadRequest,other)).status,403)
    writeFileSync(path.join(storageRoot,record.storage_path),'owned corruption fixture')
    assert.equal((await downloadStorage(undefined,downloadRequest,owner)).status,409)
    writeFileSync(path.join(storageRoot,record.storage_path),bytes)
    assert.equal((await pool.query('SELECT count(*)::int n FROM file_uploads WHERE project_id=$1 AND storage_path=$2',[fixture.id,record.storage_path])).rows[0].n,1)
    assert.equal((await pool.query('SELECT count(*)::int n FROM evidence_events WHERE project_id=$1',[fixture.id])).rows[0].n,1)
    writeFileSync(`${root}/retained-r1.dxf`,bytes);report.exportArtifact={path:`${root}/retained-r1.dxf`,hash:record.content_hash,sourceRevision:revisionId,synthetic:true,positivePlanCheckAdapted:true}
  })
  await check('a foreign revision has no fallback to this project current head',async()=>{
    const left=await seed(),right=await seed(),first=await invoke(left)
    await assert.rejects(loadSurfaceRevision(right.id,first.json.data.revisionId),error=>error.statusCode===404)
  })
  await check('duplicate contour bindings cannot be read as an arbitrary first result',async()=>{
    const fixture=await seed(),first=await invoke(fixture),saved=await state(fixture.id),line=saved.contours[0]
    await pool.query('INSERT INTO contour_sets(surface_id,surface_revision_id,interval,crs,lines) VALUES($1,$2,1,$3,$4)',[line.surface_id,line.surface_revision_id,line.crs,JSON.stringify(line.lines)])
    await assert.rejects(loadSurfaceRevision(fixture.id,first.json.data.revisionId),error=>error.statusCode===409)
  })
  await check('unverified legacy outputs are retained but cannot be treated as verified drafts',async()=>{
    const fixture=await seed();await pool.query("INSERT INTO surfaces(project_id,name,created_by) VALUES($1,'Legacy',$2)",[fixture.id,owner])
    const surface=(await state(fixture.id)).surfaces[0]
    const revision=(await pool.query("INSERT INTO surface_revisions(surface_id,revision,algorithm,algorithm_version,parameters,point_count,crs,input_hash,result) VALUES($1,1,'legacy','1','{}',5,$2,'legacy','{}') RETURNING id",[surface.id,CRS])).rows[0]
    await pool.query('INSERT INTO contour_sets(surface_id,surface_revision_id,interval,crs,lines) VALUES($1,$2,1,$3,$4)',[surface.id,revision.id,CRS,'[]'])
    const before=await state(fixture.id);await assert.rejects(loadSurfaceRevision(fixture.id,revision.id),error=>error.statusCode===409);assert.deepEqual(await state(fixture.id),before)
  })
  const storageFiles=()=>Object.fromEntries(readdirSync(storageRoot,{recursive:true,withFileTypes:true}).filter(item=>item.isFile()).map(item=>{const full=path.join(item.parentPath,item.name);return[path.relative(storageRoot,full),createHash('sha256').update(readFileSync(full)).digest('hex')]}))
  const exportState=async id=>({files:(await pool.query('SELECT * FROM file_uploads WHERE project_id=$1 ORDER BY id',[id])).rows,
    documents:(await pool.query('SELECT * FROM deliverables WHERE project_id=$1 ORDER BY id',[id])).rows,
    revisions:(await pool.query('SELECT r.* FROM deliverable_revisions r JOIN deliverables d ON d.id=r.deliverable_id WHERE d.project_id=$1 ORDER BY r.id',[id])).rows,
    events:(await pool.query('SELECT * FROM evidence_events WHERE project_id=$1 ORDER BY id',[id])).rows})
  for(const stage of ['file','event'])await check(`export ${stage} failure rolls back metadata/register/evidence and removes only its new artifact`,async()=>{
    const fixture=await seed(),first=await invoke(fixture),before=await exportState(fixture.id),filesBefore=storageFiles()
    await pool.query('INSERT INTO export_faults VALUES($1,$2)',[fixture.id,stage])
    await assert.rejects(exportDxf(fixture.id,{expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId:randomUUID()},owner))
    assert.deepEqual(await exportState(fixture.id),before);assert.deepEqual(storageFiles(),filesBefore)
  })
  await check('the denied plan path does not write storage or a document',async()=>{
    const fixture=await seed(),first=await invoke(fixture),before=await exportState(fixture.id),filesBefore=storageFiles()
    featureAllowed=false
    try{await assert.rejects(exportDxf(fixture.id,{expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId:randomUUID()},owner),error=>error.statusCode===403)}finally{featureAllowed=true}
    assert.deepEqual(await exportState(fixture.id),before);assert.deepEqual(storageFiles(),filesBefore)
  })
  await check('client geometry is rejected rather than replacing retained source',async()=>{
    const fixture=await seed(),first=await invoke(fixture),before=await exportState(fixture.id),filesBefore=storageFiles()
    await assert.rejects(exportDxf(fixture.id,{expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId:randomUUID(),contours:[],spotHeights:[]},owner))
    assert.deepEqual(await exportState(fixture.id),before);assert.deepEqual(storageFiles(),filesBefore)
  })
  await check('a lost surface response replays the original after current measurements change',async()=>{
    const fixture=await seed(),requestId=randomUUID(),first=await invoke(fixture,{requestId});assert.equal(first.status,201)
    await pool.query('UPDATE survey_points SET elevation=elevation+10 WHERE project_id=$1',[fixture.id])
    const before=await state(fixture.id),replay=await invoke(fixture,{requestId})
    assert.equal(replay.status,200);assert.equal(replay.json.data.revisionId,first.json.data.revisionId);assert.equal(replay.json.data.replayed,true)
    assert.deepEqual(await state(fixture.id),before)
  })
  await check('reusing a surface request identity with changed parameters is refused',async()=>{
    const fixture=await seed(),requestId=randomUUID();assert.equal((await invoke(fixture,{requestId})).status,201)
    await noMutation(fixture,{requestId,interval:2},409)
  })
  await check('simultaneous retries of one surface request create exactly one revision',async()=>{
    const fixture=await seed(),requestId=randomUUID(),responses=await Promise.all([invoke(fixture,{requestId}),invoke(fixture,{requestId})])
    assert.deepEqual(responses.map(response=>response.status).sort(),[200,201]);assert.equal(new Set(responses.map(response=>response.json.data.revisionId)).size,1)
    const saved=await state(fixture.id);assert.equal(saved.revisions.length,1);assert.equal(saved.contours.length,1)
  })
  await check('an unreceived reviewed computation cannot use later changed measurements',async()=>{
    const fixture=await seed();await pool.query('UPDATE survey_points SET elevation=elevation+10 WHERE project_id=$1',[fixture.id]);await noMutation(fixture,{},409)
  })
  await check('a lost DXF response replays the exact retained bytes without another document or file',async()=>{
    const fixture=await seed(),first=await invoke(fixture),input={expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId:randomUUID()}
    const original=await exportDxf(fixture.id,input,owner);assert.equal(original.status,200);const bytes=Buffer.from(await original.arrayBuffer()),before=await exportState(fixture.id),filesBefore=storageFiles()
    featureAllowed=false
    try{const replay=await exportDxf(fixture.id,input,owner);assert.equal(replay.status,200);assert.deepEqual(Buffer.from(await replay.arrayBuffer()),bytes);assert.equal(replay.headers.get('X-Metardu-Replayed'),'true')}finally{featureAllowed=true}
    assert.deepEqual(await exportState(fixture.id),before);assert.deepEqual(storageFiles(),filesBefore)
  })
  await check('reusing an export identity for another surface revision is refused',async()=>{
    const fixture=await seed(),first=await invoke(fixture),requestId=randomUUID(),input={expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId}
    assert.equal((await exportDxf(fixture.id,input,owner)).status,200)
    const second=await invoke(fixture),before=await exportState(fixture.id),filesBefore=storageFiles()
    await assert.rejects(exportDxf(fixture.id,{...input,surfaceRevisionId:second.json.data.revisionId},owner),error=>error.statusCode===409)
    assert.deepEqual(await exportState(fixture.id),before);assert.deepEqual(storageFiles(),filesBefore)
  })
  await check('concurrent retries of one export identity retain one artifact and one register revision',async()=>{
    const fixture=await seed(),first=await invoke(fixture),input={expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId:randomUUID()}
    const responses=await Promise.all([exportDxf(fixture.id,input,owner),exportDxf(fixture.id,input,owner)]);assert.ok(responses.every(response=>response.status===200))
    assert.deepEqual(Buffer.from(await responses[0].arrayBuffer()),Buffer.from(await responses[1].arrayBuffer()))
    const saved=await exportState(fixture.id);assert.equal(saved.files.length,1);assert.equal(saved.revisions.length,1);assert.equal(saved.events.length,1)
  })
  await check('an export whose evidence transaction rolled back can retry the same identity safely',async()=>{
    const fixture=await seed(),first=await invoke(fixture),input={expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId:randomUUID()}
    await pool.query("INSERT INTO export_faults VALUES($1,'event')",[fixture.id]);await assert.rejects(exportDxf(fixture.id,input,owner))
    assert.equal((await exportState(fixture.id)).files.length,0);await pool.query('DELETE FROM export_faults WHERE project_id=$1',[fixture.id])
    assert.equal((await exportDxf(fixture.id,input,owner)).status,200);assert.equal((await exportState(fixture.id)).revisions.length,1)
  })
  await check('a committed surface survives losing the COMMIT acknowledgement and replays once',async()=>{
    const fixture=await seed(),requestId=randomUUID();loseCommitAcknowledgement=true
    try{assert.equal((await invoke(fixture,{requestId})).status,500)}finally{loseCommitAcknowledgement=false}
    const before=await state(fixture.id);assert.equal(before.revisions.length,1)
    assert.equal((await invoke(fixture,{requestId})).status,200);assert.deepEqual(await state(fixture.id),before)
  })
  await check('a committed export file is never deleted after a lost COMMIT acknowledgement',async()=>{
    const fixture=await seed(),first=await invoke(fixture),input={expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId:randomUUID()}
    loseCommitAcknowledgement=true
    try{await assert.rejects(exportDxf(fixture.id,input,owner),/lost COMMIT acknowledgement/)}finally{loseCommitAcknowledgement=false}
    const before=await exportState(fixture.id);assert.equal(before.revisions.length,1)
    const filesBefore=storageFiles(),response=await exportDxf(fixture.id,input,owner);assert.equal(response.status,200)
    assert.equal(response.headers.get('X-Metardu-Replayed'),'true');assert.deepEqual(await exportState(fixture.id),before);assert.deepEqual(storageFiles(),filesBefore)
  })
  await check('database uniqueness rejects a second immutable surface with the same scoped request identity',async()=>{
    const fixture=await seed(),first=await invoke(fixture),before=await state(fixture.id)
    await assert.rejects(pool.query(`INSERT INTO surface_revisions(surface_id,revision,algorithm,algorithm_version,parameters,point_count,crs,input_hash,result)
      SELECT surface_id,revision+1,algorithm,algorithm_version,parameters,point_count,crs,input_hash,result FROM surface_revisions WHERE id=$1`,[first.json.data.revisionId]),error=>error.code==='23505')
    assert.deepEqual(await state(fixture.id),before)
  })
  await check('database uniqueness rejects a duplicate registered export request identity',async()=>{
    const fixture=await seed(),first=await invoke(fixture),input={expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId:randomUUID()}
    assert.equal((await exportDxf(fixture.id,input,owner)).status,200);const before=await exportState(fixture.id)
    await assert.rejects(pool.query(`INSERT INTO deliverable_revisions(deliverable_id,revision,content_hash,source_revision,generator,manifest)
      SELECT deliverable_id,revision+1,content_hash,source_revision,generator,manifest FROM deliverable_revisions WHERE id=$1`,[before.revisions[0].id]),error=>error.code==='23505')
    assert.deepEqual(await exportState(fixture.id),before)
  })
  await check('read-only surface/export recovery returns exact owner results and refuses foreign actors',async()=>{
    const fixture=await seed(),requestId=randomUUID(),first=await invoke(fixture,{requestId}),query=new URLSearchParams({requestId,requestHash:first.json.data.requestHash})
    assert.equal((await readSurface(fixture.id,{nativeUrl:`http://127.0.0.1/native?${query}`},owner)).status,200)
    assert.equal((await readSurface(fixture.id,{nativeUrl:`http://127.0.0.1/native?${query}`},other)).status,404)
    const input={expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId:randomUUID()}
    const response=await exportDxf(fixture.id,input,owner),bytes=Buffer.from(await response.arrayBuffer()),before=await exportState(fixture.id),filesBefore=storageFiles()
    const recovered=await recoverDxf(fixture.id,{nativeUrl:`http://127.0.0.1/native?${new URLSearchParams(input)}`},owner)
    assert.deepEqual(Buffer.from(await recovered.arrayBuffer()),bytes);assert.deepEqual(await exportState(fixture.id),before);assert.deepEqual(storageFiles(),filesBefore)
    await assert.rejects(recoverDxf(fixture.id,{nativeUrl:`http://127.0.0.1/native?${new URLSearchParams({...input,expectedUserId:other})}`},other),error=>error.statusCode===403)
  })
  await check('corrupted retained export bytes cannot be silently regenerated by retrying',async()=>{
    const fixture=await seed(),first=await invoke(fixture),input={expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId:randomUUID()}
    assert.equal((await exportDxf(fixture.id,input,owner)).status,200);const before=await exportState(fixture.id),full=path.join(storageRoot,before.revisions[0].storage_path),bytes=readFileSync(full)
    writeFileSync(full,'owned corrupt replay fixture');const filesBefore=storageFiles()
    try{await assert.rejects(exportDxf(fixture.id,input,owner),error=>error.statusCode===409);assert.deepEqual(await exportState(fixture.id),before);assert.deepEqual(storageFiles(),filesBefore)}finally{writeFileSync(full,bytes)}
  })
  await check('an account switch cannot submit another account prepared request',async()=>{
    const fixture=await seed(),before=await state(fixture.id),response=await invoke(fixture,{expectedUserId:other})
    assert.equal(response.status,403);assert.deepEqual(await state(fixture.id),before)
  })
  const mask=()=>({horizontalCrs:CRS,units:'metres',sourceLabel:'SYNTHETIC reviewed footprint - not field evidence',supportUseReviewed:true,regions:[{
    outer:[[500002,9850002],[500018,9850002],[500018,9850018],[500002,9850018]].map(([x,y])=>({x,y})),
    holes:[[[500008,9850008],[500012,9850008],[500012,9850012],[500008,9850012]].map(([x,y])=>({x,y}))]}]})
  await check('a saved masked surface has the full independent 240 m2 footprint and two open zero-contour paths',async()=>{
    const fixture=await seed(),before=(await state(fixture.id)).survey_points,response=await invoke(fixture,{terrainDomain:mask()})
    assert.equal(response.status,201,JSON.stringify(response));const saved=await state(fixture.id),result=saved.revisions[0].result
    assert.equal(result.domain.area,240);assert.ok(result.domain.derivedVertexCount>0);assert.deepEqual(saved.survey_points,before)
    assert.equal(result.snapshot.terrainDomain.supportUseReviewed,true);assert.equal(result.snapshot.fieldVerified,false)
    const zero=saved.contours[0].lines.find(line=>line.elevation===0);assert.equal(zero.coordinates.length,2)
    const ends=zero.coordinates.flatMap(path=>[path[0],path.at(-1)]).sort();assert.deepEqual(ends,[[500002,9850018],[500008,9850012],[500012,9850008],[500018,9850002]].sort())
    const record=await loadSurfaceRevision(fixture.id,response.json.data.revisionId);assert.equal(record.snapshot.terrainDomain.sourceLabel,mask().sourceLabel)
  })
  await check('a mask with a different declared basis cannot borrow the project label',async()=>{const fixture=await seed();await noMutation(fixture,{terrainDomain:{...mask(),horizontalCrs:declaredFixtureCrs32632}},400)})
  await check('a self-crossing footprint preserves all existing source and revisions',async()=>{
    const fixture=await seed(),definition=mask();definition.regions[0].outer=[definition.regions[0].outer[0],definition.regions[0].outer[2],definition.regions[0].outer[1],definition.regions[0].outer[3]]
    await noMutation(fixture,{terrainDomain:definition},400)
  })
  await check('an uncovered footprint cannot silently trim itself to the measured hull',async()=>{
    const fixture=await seed(),definition=mask();definition.regions[0].outer[0].x=499999;await noMutation(fixture,{terrainDomain:definition},400)
  })
  await check('unreviewed support semantics are refused before any saved computation',async()=>{
    const fixture=await seed(),before=await state(fixture.id);await assert.rejects(create(fixture.id,body(fixture,{terrainDomain:{...mask(),supportUseReviewed:false}}),owner));assert.deepEqual(await state(fixture.id),before)
  })
  await check('measured breakline chains retain original point identities, heights and global line evidence',async()=>{
    const fixture=await seed(),input={name:'Measured chain',type:'hard',sourceLabel:'SYNTHETIC point chain - not field evidence',reviewed:true,pointIds:[fixture.ids[0],fixture.ids[4],fixture.ids[2]]}
    await pool.query('INSERT INTO breaklines(project_id,name,coordinates) VALUES($1,$2,$3)',[fixture.id,'Original unreferenced register','[]'])
    const before=(await state(fixture.id)).breaklines,response=await invoke(fixture,{breaklineChains:[input]});assert.equal(response.status,201,JSON.stringify(response))
    const saved=await state(fixture.id);assert.deepEqual(saved.breaklines,before);assert.deepEqual(saved.revisions[0].result.snapshot.breaklineSources[0].pointIds,input.pointIds)
    assert.deepEqual(saved.revisions[0].result.snapshot.breaklines[0].points,[[0,0,-2],[10,10,0],[20,20,2]].map(([x,y,z])=>({x:x+500000,y:y+9850000,z})))
  })
  await check('a breakline cannot substitute a vertex outside the reviewed selected source',async()=>{
    const fixture=await seed();await noMutation(fixture,{breaklineChains:[{name:'Wrong source',type:'hard',sourceLabel:'Synthetic',reviewed:true,pointIds:[fixture.ids[0],randomUUID()]}]},400)
  })
  await check('masked DXF retains reviewed boundary layers, measured 3D chains and exact replay binding',async()=>{
    const fixture=await seed(),first=await invoke(fixture,{terrainDomain:mask(),breaklineChains:[{name:'Measured chain',type:'hard',sourceLabel:'SYNTHETIC',reviewed:true,pointIds:[fixture.ids[0],fixture.ids[4],fixture.ids[2]]}]})
    assert.equal(first.status,201,JSON.stringify(first));const saved=await state(fixture.id),input={expectedUserId:owner,projectId:fixture.id,surfaceRevisionId:first.json.data.revisionId,requestId:randomUUID()}
    const response=await exportDxf(fixture.id,input,owner);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer())
    for(const layer of ['TERRAIN_BOUNDARY','TERRAIN_EXCLUSIONS','SURVEY_BREAKLINES_3D'])assert.ok(bytes.toString('utf8').includes(layer),`Missing ${layer} drawing evidence`)
    const replay=await exportDxf(fixture.id,input,owner);assert.deepEqual(Buffer.from(await replay.arrayBuffer()),bytes)
    const record=saved.revisions[0];writeFileSync(`${root}/masked-r1.dxf`,bytes);writeFileSync(`${root}/masked-model.json`,JSON.stringify(record.result,null,2)+'\n')
    report.maskedArtifact={path:`${root}/masked-r1.dxf`,sha256:createHash('sha256').update(bytes).digest('hex'),revisionId:record.id,synthetic:true,positivePlanCheckAdapted:true}
  })
}finally{
  await pool.end()
  if(created){
    assert.equal((await admin.query("SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1",[schema])).rows[0]?.marker,marker,'Never remove a schema without the exact fixture ownership marker')
    await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    assert.equal((await admin.query('SELECT count(*)::int n FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].n,0);report.fixtureSchemaRemoved=true
  }
  assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows,report.ledgerBefore);report.appliedLedgerUnchanged=true
  assert.deepEqual(hashes(),before);report.sourceUnchangedDuringRun=true
  for(const [file,hash]of Object.entries(compiledSource))assert.equal(createHash('sha256').update(readFileSync(file,'utf8')).digest('hex'),hash)
  report.instantiatedSourcesUnchangedDuringRun=true
  assert.equal(path.dirname(storageRoot),path.resolve(root));assert.equal(readFileSync(path.join(storageRoot,'ownership.txt'),'utf8'),marker)
  rmSync(storageRoot,{recursive:true});report.ownedStorageRemoved=true
  report.status=report.checks.length===52&&report.checks.every(check=>check.passed)?'passed':'failed';save();await admin.end()
}
process.exitCode=report.status==='passed'?0:1
