// Actual overview source + PostgreSQL, with bounded authentication adapter.
// Fixture data stays in one uniquely owned schema, with no public fallback.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

assert.equal(process.argv.length,2,'No service, database or path overrides are accepted.')
const service=JSON.parse(execFileSync('docker',['inspect','--format','{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}','metardu-schema-rehearsal-20261008'],{encoding:'utf8',windowsHide:true,timeout:30000}))
assert.equal(service.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0');assert.equal(service.Labels['metardu.purpose'],'schema-rehearsal');assert.equal(service.Running,true)
assert.deepEqual(service.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const token=randomUUID(),schema=`metardu_scheme_overview_${token.replaceAll('-','')}`;assert.match(schema,/^metardu_scheme_overview_[a-f0-9]{32}$/)
const marker=`METARDU owned scheme overview fixture ${token}`
const options={connectionString:'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify',connectionTimeoutMillis:5000,statement_timeout:12000,application_name:`metardu-scheme-overview-${token}`}
const admin=new pg.Client(options),pool=new pg.Pool({...options,max:2,options:`-c search_path=${schema}`})
const queries=[]
let lastRawBytes=0
const database={query:async(sql,values)=>{queries.push({sql,values});const result=await pool.query(sql,values);lastRawBytes=Buffer.byteLength(JSON.stringify(result.rows));return result}}
const require=createRequire(import.meta.url),Module=require('node:module'),ts=require('typescript'),originalLoad=Module._load
Module._load=function(request,parent,...rest){
  if(request==='@/lib/db')return {db:database}
  if(request==='@/lib/apiHandler')return {apiHandler:(_options,handler)=>async(req,actor,id)=>{
    if(!actor)return Response.json({error:'Unauthenticated fixture caller'},{status:401})
    try{return await handler(req,{userId:actor,params:{id}})}catch(error){return Response.json({error:error.message},{status:error.statusCode??500})}
  }}
  return originalLoad.call(this,request.startsWith('@/')?path.join(process.cwd(),'src',request.slice(2)):request,parent,...rest)
}
Module._extensions['.ts']=function(module,filename){module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,filename)}
const {GET}=require('../src/app/api/project/[id]/scheme-overview/route.ts'),{NextRequest}=require('next/server')
const {GET:legacySummary}=require('../src/app/api/scheme/traverse/summary/route.ts')
const project=randomUUID(),otherProject=randomUUID(),actor=randomUUID(),other=randomUUID(),block=randomUUID()
const invoke=(query='',user=actor,id=project)=>GET(new NextRequest(`http://127.0.0.1:3021/api/project/${id}/scheme-overview${query?'?'+query:''}`),user,id)
const invokeLegacy=()=>legacySummary(new NextRequest(`http://127.0.0.1:3021/api/scheme/traverse/summary?project_id=${project}`),actor,project)
const root='.cache/scheme-overview';mkdirSync(root,{recursive:true})
const files=['scripts/verify-scheme-overview.mjs','src/app/api/project/[id]/scheme-overview/route.ts','src/app/api/scheme/traverse/summary/route.ts','src/lib/scheme/overview.ts','src/lib/scheme/readOverview.ts','src/components/scheme/SchemeOverview.tsx','src/app/project/[id]/scheme/page.tsx']
const hashes=()=>Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]))
const report={checkedAt:new Date().toISOString(),source:hashes(),fixtureSchema:schema,authentication:'bounded adapter, not ordinary-account HTTP',rls:'owner predicates in actual SQL; no production RLS acceptance claim',checks:[]}
const save=()=>writeFileSync(`${root}/native.json`,JSON.stringify(report,null,2)+'\n')
const fingerprint=async()=>{const result={};for(const table of ['projects','blocks','parcels','traverse_results','users'])result[table]=(await admin.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(record)::text,E'\n' ORDER BY row_to_json(record)::text),'')) hash FROM public.${table} record`)).rows[0];return result}
async function reset(){
  await pool.query('TRUNCATE projects,blocks,parcels,traverse_results')
  await pool.query("INSERT INTO projects VALUES($1,$2,'SYNTHETIC Mwavumbo campaign',NULL,'scheme'),($3,$4,'SYNTHETIC other owner',NULL,'scheme')",[project,actor,otherProject,other])
  queries.length=0
}
async function check(name,run){await reset();const started=performance.now();try{await run();report.checks.push({name,passed:true,elapsedMs:Math.round(performance.now()-started)});console.log(`PASS ${name}`)}catch(error){report.checks.push({name,passed:false,error:error.message});console.log(`FAIL ${name}: ${error.message}`)}save()}
let created=false,original,ledger
await admin.connect()
try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  original=await fingerprint();ledger=(await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  await admin.query(`CREATE SCHEMA ${schema}`);created=true;await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`)
  assert.equal((await pool.query('SELECT current_schema() name')).rows[0].name,schema)
  await pool.query(`CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid,name text,location text,project_type text);
    CREATE TABLE blocks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,block_number text,block_name text);
    CREATE TABLE parcels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,block_id uuid,status text);
    CREATE TABLE traverse_results(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,traverse_name text,method text,status text,created_at timestamptz DEFAULT NOW(),updated_at timestamptz,results jsonb);`)
  await check('authentication required',async()=>assert.equal((await invoke('',null)).status,401))
  await check('invalid UUID refused before querying',async()=>{assert.equal((await invoke('',actor,'bad')).status,400);assert.equal(queries.length,0)})
  for(const query of ['block_page=0','block_page=-1','block_page=1.5','traverse_page=1e2','block_page=1&block_page=2'])await check(`invalid pagination ${query} refused`,async()=>{assert.equal((await invoke(query)).status,400);assert.equal(queries.length,0)})
  await check('foreign owner refused',async()=>assert.equal((await invoke('',other)).status,404))
  await check('missing project refused',async()=>assert.equal((await invoke('',actor,randomUUID())).status,404))
  await check('ordinary project is not fabricated into a scheme',async()=>{await pool.query("UPDATE projects SET project_type='small' WHERE id=$1",[project]);assert.equal((await invoke()).status,409)})
  await check('empty scheme returns authoritative zeros without invented reference',async()=>{
    const response=await invoke();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');const {data}=await response.json();assert.equal(data.project.id,project);assert.equal(data.project.name,'SYNTHETIC Mwavumbo campaign');assert.equal(data.parcels.total,0);assert.equal(data.blocks.page,1);assert.equal(data.blocks.rows.length,0);assert.equal(data.traverses.total,0);assert.equal('utm_zone' in data.project,false);assert.equal(queries.length,1)
  })
  await check('blockless parcels and unknown statuses remain counted',async()=>{
    await pool.query("INSERT INTO parcels(project_id,status) VALUES($1,'pending'),($1,'computed'),($1,'legacy_unknown'),($1,NULL)",[project]);const response=await invoke();assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.parcels.total,4);assert.equal(data.parcels.statusCounts.computed,1);assert.equal(data.parcels.unrecognized,2);assert.equal(data.parcels.unassignedBlock,4);assert.equal(data.blocks.total,0)
  })
  await check('inconsistent block links do not disappear or pollute valid block counts',async()=>{
    await pool.query("INSERT INTO blocks(id,project_id,block_number) VALUES($1,$2,'SYN-A'),($3,$4,'SYN-OTHER')",[block,project,randomUUID(),otherProject]);await pool.query("INSERT INTO parcels(project_id,block_id,status) VALUES($1,$2,'pending'),($1,$3,'pending')",[project,block,randomUUID()]);const response=await invoke();assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.parcels.total,2);assert.equal(data.parcels.invalidBlock,1);assert.equal(data.blocks.rows[0].parcelCount,1)
  })
  await check('10000 parcels use bounded stable pages and owner-scoped totals',async()=>{
    await pool.query("INSERT INTO blocks(project_id,block_number) SELECT $1,'SYN-'||lpad(i::text,3,'0') FROM generate_series(1,100) i",[project]);const blocks=(await pool.query('SELECT id FROM blocks ORDER BY block_number,id')).rows
    await pool.query("INSERT INTO parcels(project_id,block_id,status) SELECT $1,($2::uuid[])[(i%100)+1],CASE WHEN i%2=0 THEN 'pending' ELSE 'approved' END FROM generate_series(1,10000) i",[project,blocks.map(row=>row.id)])
    await pool.query("INSERT INTO parcels(project_id,status) SELECT $1,'approved' FROM generate_series(1,500) i",[otherProject])
    await pool.query("INSERT INTO traverse_results(project_id,traverse_name,method,status,updated_at,results) SELECT $1,'SYNTHETIC-'||i,'bowditch','computed','2026-10-25T00:00:00Z',jsonb_build_object('accuracy_order','1st order','precision_ratio',10000) FROM generate_series(1,100) i",[project])
    const first=await invoke(),second=await invoke('block_page=2&traverse_page=2');assert.equal(first.status,200);assert.equal(second.status,200);const a=(await first.json()).data,b=(await second.json()).data
    assert.equal(a.parcels.total,10000);assert.equal(a.parcels.statusCounts.approved,5000);assert.equal(a.blocks.total,100);assert.equal(a.blocks.rows.length,24);assert.equal(a.traverses.rows.length,24);assert.equal(a.traverses.total,100);assert.equal(a.traverses.rows[0].assessment,'unassessed');assert.equal(a.traverses.rows[0].precisionRatio,10000)
    assert.equal(a.blocks.rows.reduce((sum,row)=>sum+row.parcelCount,0),2400);assert.equal(a.blocks.rows.some(row=>b.blocks.rows.some(next=>next.id===row.id)),false);assert.equal(a.traverses.rows.some(row=>b.traverses.rows.some(next=>next.id===row.id)),false)
    assert.ok(Buffer.byteLength(JSON.stringify(a))<18000,'Overview unexpectedly returned an unbounded register');assert.equal(queries.length,2)
    report.boundedProfile={synthetic:true,parcels:10000,blocks:100,traverses:100,blockRows:a.blocks.rows.length,traverseRows:a.traverses.rows.length,responseBytes:Buffer.byteLength(JSON.stringify(a))}
    const repeat=(await (await invoke()).json()).data;assert.deepEqual(repeat,a)
  })
  await check('out-of-range page clamps to the final available page',async()=>{
    await pool.query("INSERT INTO blocks(project_id,block_number) SELECT $1,'SYN-'||lpad(i::text,3,'0') FROM generate_series(1,25) i",[project]);const response=await invoke('block_page=999999&traverse_page=999999');assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.blocks.page,2);assert.equal(data.blocks.rows.length,1);assert.equal(data.traverses.page,1)
  })
  await check('large retained computations transfer only overview metrics from PostgreSQL',async()=>{
    const results={precision_ratio:10000,accuracy_order:'SYNTHETIC order',adjustedStations:Array.from({length:10000},(_,i)=>({easting:500000+i,northing:9800000+i,elevation:100}))}
    await pool.query("INSERT INTO traverse_results(project_id,status,results) VALUES($1,'computed',$2::jsonb)",[project,JSON.stringify(results)]);const response=await invoke();assert.equal(response.status,200);assert.ok(lastRawBytes<4000,`Raw database overview transferred ${lastRawBytes} bytes`);const body=await response.json();assert.equal(body.data.traverses.rows[0].precisionRatio,10000);report.largeComputationProjection={synthetic:true,retainedStations:10000,rawDatabaseBytes:lastRawBytes,overviewObjectBytes:Buffer.byteLength(JSON.stringify(body.data))}
  })
  for(const value of [null,'NaN','Infinity',true,{bad:'metric'}])await check(`invalid precision ${JSON.stringify(value)} remains unknown`,async()=>{
    await pool.query("INSERT INTO traverse_results(project_id,status,results) VALUES($1,'computed',$2::jsonb)",[project,JSON.stringify({precision_ratio:value,accuracy_order:'1st order'})]);const response=await invoke();assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.traverses.rows[0].precisionRatio,null);assert.equal(data.traverses.rows[0].assessment,'unassessed');assert.equal(data.traverses.rows[0].areaHa,null)
  })
  await check('database read failure is not an empty successful summary',async()=>{
    await pool.query('ALTER TABLE traverse_results RENAME TO fixture_unavailable_traverses');try{assert.equal((await invoke()).status,500)}finally{await pool.query('ALTER TABLE fixture_unavailable_traverses RENAME TO traverse_results')}
  })
  await check('legacy summary does not approve a traverse from its recorded order',async()=>{
    await pool.query("INSERT INTO traverse_results(project_id,status,results) VALUES($1,'computed',$2::jsonb)",[project,JSON.stringify({accuracy_order:'1st order',precision_ratio:1})]);const response=await invokeLegacy();assert.equal(response.status,200);const body=await response.json();assert.equal(body.data[0].accuracy_class,'pending');assert.equal(body.data[0].assessment,'unassessed');assert.equal(body.summary.passed,0);assert.equal(body.summary.failed,0);assert.equal(body.summary.unassessed,1)
  })
  await check('legacy read failure is not an empty successful summary',async()=>{
    await pool.query('ALTER TABLE traverse_results RENAME TO fixture_unavailable_traverses');try{assert.equal((await invokeLegacy()).status,500)}finally{await pool.query('ALTER TABLE fixture_unavailable_traverses RENAME TO traverse_results')}
  })
}finally{
  await pool.end();try{
    if(created){assert.equal((await admin.query("SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1",[schema])).rows[0].marker,marker);await admin.query(`DROP SCHEMA ${schema} CASCADE`);assert.equal((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount,0);report.ownedFixtureRemoved=true}
    if(original){assert.deepEqual(await fingerprint(),original);report.originalRecordsPreserved=true}
    if(ledger){assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows,ledger);report.migrationLedgerPreserved=true}
    assert.deepEqual(hashes(),report.source);report.sourcePreserved=true
    report.status=report.checks.length===24&&report.checks.every(item=>item.passed)&&report.ownedFixtureRemoved&&report.originalRecordsPreserved&&report.migrationLedgerPreserved?'passed':'failed';save()
  }finally{await admin.end()}
}
process.exitCode=report.status==='passed'?0:1
