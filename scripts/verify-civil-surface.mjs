// Actual read handler + PostgreSQL in an admitted, exact synthetic schema.
// Authentication/plan adapters are bounded; this is not production HTTP/RLS proof.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import pg from 'pg'
const container=JSON.parse(execFileSync('docker',['inspect','--format','{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}','metardu-schema-rehearsal-20261008'],{encoding:'utf8',windowsHide:true,timeout:30000}))
assert.equal(container.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0');assert.equal(container.Labels['metardu.purpose'],'schema-rehearsal');assert.equal(container.Running,true)
assert.deepEqual(container.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const schema=`metardu_civil_${randomUUID().replaceAll('-','')}`,marker=`METARDU owned civil surface fixture ${schema}`
assert.match(schema,/^metardu_civil_[a-f0-9]{32}$/)
const options={connectionString:'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify',connectionTimeoutMillis:5000,statement_timeout:8000}
const admin=new pg.Client(options),pool=new pg.Pool({...options,max:2,options:`-c search_path=${schema},public`})
const require=createRequire(import.meta.url),Module=require('node:module'),ts=require('typescript'),originalLoad=Module._load
let paid=true,reads=0
Module._load=function(request,parent,...rest){
  if(request==='@/lib/db')return {db:{query:(sql,values)=>{assert.match(sql,/^\s*SELECT/i);reads++;return pool.query(sql,values)}}}
  if(request==='@/lib/apiHandler')return {apiHandler:(_config,handler)=>handler}
  if(request==='@/lib/auth/ownership')return {requireProjectReadAccess:async()=>({ok:true,projectUserId:ownerId})}
  if(request==='@/lib/subscription/subscriptionEngine')return {checkFeatureAccess:async()=>({allowed:paid})}
  return originalLoad.call(this,request.startsWith('@/')?path.resolve(process.cwd(),'src',request.slice(2)):request,parent,...rest)
}
Module._extensions['.ts']=function(module,filename){module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename)}
const {civilSurfaceFixture,clippedCivilSurfaceFixture,projectId,revisionId,ownerId}=require('../tests/civil-surface-fixture.ts')
const {GET}=require('../src/app/api/project/[id]/civil-surface-export/route.ts'),{NextRequest}=require('next/server')
const root='.cache/civil-surface';mkdirSync(root,{recursive:true})
const report={checkedAt:new Date().toISOString(),syntheticOnly:true,productionDataChanged:false,checks:[]};let created=false,ledger,original
const fingerprint=async()=>{const result={};for(const table of ['projects','project_reference_systems','setout_definitions','setout_points','setout_observations','tolerance_profiles'])result[table]=(await admin.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(record)::text,E'\n' ORDER BY row_to_json(record)::text),'')) hash FROM public.${table} record`)).rows[0];return result}
const record=name=>report.checks.push({name,passed:true}),invoke=(suffix='')=>GET(new NextRequest(`http://127.0.0.1/api/project/${projectId}/civil-surface-export${suffix}`),{params:{id:projectId},userId:ownerId})
await admin.connect()
try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  original=await fingerprint();ledger=(await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  await admin.query(`CREATE SCHEMA ${schema}`);created=true;await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`)
  await admin.query(`CREATE TABLE ${schema}.projects(id uuid PRIMARY KEY,user_id uuid,name text);CREATE TABLE ${schema}.surfaces(id uuid PRIMARY KEY,project_id uuid,name text);CREATE TABLE ${schema}.surface_revisions(id uuid PRIMARY KEY,surface_id uuid,revision integer,crs text,point_count integer,triangle_count integer,input_hash text,parameters jsonb,result jsonb,computed_at timestamptz DEFAULT NOW())`)
  const row=civilSurfaceFixture()
  await admin.query(`INSERT INTO ${schema}.projects VALUES($1,$2,$3)`,[projectId,ownerId,row.project_name]);await admin.query(`INSERT INTO ${schema}.surfaces VALUES($1,$2,$3)`,[row.surface_id,projectId,row.name])
  await admin.query(`INSERT INTO ${schema}.surface_revisions(id,surface_id,revision,crs,point_count,triangle_count,input_hash,parameters,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[revisionId,row.surface_id,row.revision,row.crs,row.point_count,row.triangle_count,row.input_hash,JSON.stringify(row.parameters),JSON.stringify(row.result)])
  const inventory=await invoke();assert.equal(inventory.status,200);assert.equal((await inventory.json()).data.revisions.length,1);record('Bound private inventory reads the saved revision without a mesh download')
  const response=await invoke(`?revisionId=${revisionId}`);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store')
  const xml=await response.text();assert(xml.includes('<P id="1">9800000 500000 0</P>'));assert(xml.includes('<F b="1">1 2 3</F>'));assert(xml.includes('<F>2 4 3</F>'))
  writeFileSync(`${root}/retained-native.xml`,xml);report.artifactSha256=createHash('sha256').update(xml).digest('hex');record('Actual handler emits retained vertices/faces, original zero height and constrained edge from PostgreSQL JSONB')
  const clipped=clippedCivilSurfaceFixture()
  await admin.query(`UPDATE ${schema}.surface_revisions SET result=$1,triangle_count=$2,input_hash=$3`,[JSON.stringify(clipped.result),clipped.triangle_count,clipped.input_hash])
  const clippedResponse=await invoke(`?revisionId=${revisionId}`);assert.equal(clippedResponse.status,200)
  const clippedXml=await clippedResponse.text();assert.equal((clippedXml.match(/<P id=/g)??[]).length,8);assert.equal((clippedXml.match(/<F>/g)??[]).length,8);assert(clippedXml.includes('area2DSurf="84"'))
  writeFileSync(`${root}/retained-exclusion-native.xml`,clippedXml);record('Clipped source retains eight faces around its 16-square-metre exclusion; no new triangulation fills the hole')
  await admin.query(`UPDATE ${schema}.surface_revisions SET result=$1,triangle_count=$2,input_hash=$3`,[JSON.stringify(row.result),row.triangle_count,row.input_hash])
  paid=false;const before=reads;assert.equal((await invoke(`?revisionId=${revisionId}`)).status,403);assert.equal(reads,before);paid=true;record('Plan refusal takes no mesh query and produces no artifact')
  await admin.query(`UPDATE ${schema}.projects SET user_id=$1`,[randomUUID()]);assert.equal((await invoke(`?revisionId=${revisionId}`)).status,404);await admin.query(`UPDATE ${schema}.projects SET user_id=$1`,[ownerId]);record('Transferred fixture ownership cannot leak a previously admitted revision')
  await admin.query(`UPDATE ${schema}.surface_revisions SET result=jsonb_set(result,'{mesh,points,0,z}','100'::jsonb)`);assert.equal((await invoke(`?revisionId=${revisionId}`)).status,409);record('A changed saved mesh is refused rather than regenerated from live points')
  assert.equal((await admin.query(`SELECT result#>>'{mesh,points,0,z}' z FROM ${schema}.surface_revisions`)).rows[0].z,'100');record('Refused export leaves the retained input unchanged')
  assert.deepEqual(await fingerprint(),original);assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows,ledger);report.originalRecordsPreserved=true;report.migrationLedgerPreserved=true;report.passed=true
}catch(error){report.passed=false;report.error=error instanceof Error?error.message:String(error);throw error}
finally{
  await pool.end()
  if(created){assert.equal((await admin.query('SELECT obj_description(oid) marker FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].marker,marker);await admin.query(`DROP SCHEMA ${schema} CASCADE`);report.ownedFixtureRemoved=(await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount===0}
  await admin.end();writeFileSync(`${root}/native.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}
