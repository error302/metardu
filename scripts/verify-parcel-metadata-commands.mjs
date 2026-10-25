// Actual source handlers + PostgreSQL. Authentication is a bounded adapter.
// All mutation/failure fixtures are confined to the checked, uniquely marked schema.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash,randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
const phase=process.argv[2];assert.ok(['red','green'].includes(phase)&&process.argv.length===3)
const service=JSON.parse(execFileSync('docker',['inspect','--format','{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}','metardu-schema-rehearsal-20261008'],{encoding:'utf8',windowsHide:true,timeout:30000}))
assert.equal(service.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0');assert.equal(service.Labels['metardu.purpose'],'schema-rehearsal');assert.equal(service.Running,true);assert.deepEqual(service.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const token=randomUUID(),schema=`metardu_parcel_commands_${token.replaceAll('-','')}`;assert.match(schema,/^metardu_parcel_commands_[a-f0-9]{32}$/)
const marker=`METARDU owned parcel metadata fixture ${token}`
const options={connectionString:'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify',connectionTimeoutMillis:5000,statement_timeout:10000,application_name:`metardu-parcel-commands-${token}`}
const admin=new pg.Client(options),pool=new pg.Pool({...options,max:4,options:`-c search_path=${schema}`})
let fault='',beforeAdmission=null
async function execute(client,sql,values){const result=await client.query(sql,values);if(beforeAdmission&&/FROM parcels/i.test(sql)&&/^\s*SELECT/.test(sql)&&!/FOR UPDATE/.test(sql)){const hook=beforeAdmission;beforeAdmission=null;await hook()}return result}
const database={query:async(sql,values)=>{const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('metardu_fixture.parcel_fault',$1,true)",[fault]);const result=await execute(client,sql,values);await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}},transaction:async fn=>{const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('metardu_fixture.parcel_fault',$1,true)",[fault]);const result=await fn({query:(sql,values)=>execute(client,sql,values)});await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}}
const require=createRequire(import.meta.url),Module=require('node:module'),ts=require('typescript'),originalLoad=Module._load
Module._load=function(request,parent,...rest){
 if(request==='@/lib/db')return {db:database}
 if(request==='@/lib/apiHandler')return {apiHandler:(options,handler)=>async(req,actor,id)=>{
   if(!actor)return Response.json({error:'Unauthenticated fixture caller'},{status:401})
   try{let body=['POST','PATCH'].includes(req.method)?await req.json():undefined;if(options.schema){const parsed=options.schema.safeParse(body);if(!parsed.success)return Response.json({error:'Fixture schema validation failed'},{status:400});body=parsed.data}if(options.optimisticLock&&!body?.updated_at)return Response.json({error:'Missing fixture version'},{status:400});return await handler(req,{userId:actor,params:typeof id==='object'?id:{id},body})}catch(error){return Response.json({error:error.message},{status:error.statusCode??500})}
 }}
 return originalLoad.call(this,request.startsWith('@/')?path.join(process.cwd(),'src',request.slice(2)):request,parent,...rest)
}
Module._extensions['.ts']=function(module,filename){module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,filename)}
const {POST}=require('../src/app/api/scheme/parcels/route.ts'),{PATCH,DELETE}=require('../src/app/api/scheme/parcels/[id]/route.ts'),{NextRequest}=require('next/server')
const {GET:readRegister}=require('../src/app/api/project/[id]/scheme-block/[blockId]/route.ts')
const actor=randomUUID(),other=randomUUID(),project=randomUUID(),otherProject=randomUUID(),block=randomUUID(),otherBlock=randomUUID(),parcel=randomUUID()
const version='2026-10-25T00:00:00.123456Z'
const read=(query='',user=actor,projectId=project)=>readRegister(new NextRequest(`http://127.0.0.1:3021/api/project/${projectId}/scheme-block/${block}${query?'?'+query:''}`),user,{id:projectId,blockId:block})
const create=(body={},user=actor)=>POST(new NextRequest('http://127.0.0.1:3021/api/scheme/parcels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:project,block_id:block,parcel_number:'SYN-NEW',...body})}),user)
const update=(body={},user=actor)=>PATCH(new NextRequest(`http://127.0.0.1:3021/api/scheme/parcels/${parcel}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:project,block_id:block,updated_at:version,base_revision:1,notes:'SYNTHETIC changed',...body})}),user,parcel)
const remove=(query={},user=actor)=>DELETE(new NextRequest(`http://127.0.0.1:3021/api/scheme/parcels/${parcel}?${new URLSearchParams({project_id:project,block_id:block,updated_at:version,base_revision:'1',...query})}`,{method:'DELETE'}),user,parcel)
const root='.cache/parcel-metadata-commands';mkdirSync(root,{recursive:true})
const files=['scripts/verify-parcel-metadata-commands.mjs','src/app/api/scheme/parcels/route.ts','src/app/api/scheme/parcels/[id]/route.ts','src/lib/scheme/parcelMetadataCommands.ts','src/lib/validation/apiSchemas.ts','src/lib/validation/parcelInputs.ts','src/lib/validation/scheme.ts','src/lib/scheme/blockRegister.ts','src/lib/scheme/readBlockRegister.ts','src/app/api/project/[id]/scheme-block/[blockId]/route.ts','src/components/scheme/BlockParcelRegister.tsx','src/app/project/[id]/scheme/blocks/[blockId]/page.tsx','src/components/scheme/TraverseComputePanel.tsx'].filter(existsSync)
const hashes=()=>Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]))
const report={checkedAt:new Date().toISOString(),phase,source:hashes(),fixtureSchema:schema,authentication:'bounded adapter using actual input schemas; not ordinary-account HTTP or production RLS',checks:[]}
const save=()=>writeFileSync(`${root}/${phase}.json`,JSON.stringify(report,null,2)+'\n')
const state=async()=>({parcels:(await pool.query('SELECT *,updated_at::text exact_timestamp FROM parcels ORDER BY id')).rows,traverses:(await pool.query('SELECT * FROM parcel_traverses ORDER BY id')).rows,sources:(await pool.query('SELECT * FROM parcel_import_sources ORDER BY parcel_id')).rows,audit:(await pool.query('SELECT * FROM fixture_parcel_audit ORDER BY id')).rows})
const fingerprint=async()=>{const result={};for(const table of ['projects','blocks','parcels','parcel_traverses','parcel_import_sources','users'])result[table]=(await admin.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(record)::text,E'\n' ORDER BY row_to_json(record)::text),'')) hash FROM public.${table} record`)).rows[0];return result}
async function reset(){fault='';beforeAdmission=null;await pool.query('TRUNCATE fixture_parcel_audit,parcel_import_sources,parcel_traverses,parcels,blocks,projects,users CASCADE');await pool.query('INSERT INTO users VALUES($1),($2)',[actor,other]);await pool.query('INSERT INTO projects(id,user_id) VALUES($1,$2),($3,$2)',[project,actor,otherProject]);await pool.query('INSERT INTO blocks(id,project_id) VALUES($1,$2),($3,$4)',[block,project,otherBlock,otherProject]);await pool.query("INSERT INTO parcels(id,project_id,block_id,parcel_number,notes,updated_at) VALUES($1,$2,$3,'SYN-EXISTING','SYNTHETIC original',$4)",[parcel,project,block,version])}
async function check(name,run){await reset();try{await run();report.checks.push({name,passed:true});console.log(`PASS ${name}`)}catch(error){report.checks.push({name,passed:false,error:error.message});console.log(`FAIL ${name}: ${error.message}`)}save()}
let created=false,original,ledger
await admin.connect()
try{
 assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08');original=await fingerprint();ledger=(await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
 await admin.query(`CREATE SCHEMA ${schema}`);created=true;await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`);assert.equal((await pool.query('SELECT current_schema() name')).rows[0].name,schema)
 await pool.query(`CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid REFERENCES users(id),name text DEFAULT 'SYNTHETIC project');CREATE TABLE blocks(id uuid PRIMARY KEY,project_id uuid REFERENCES projects(id),block_number text DEFAULT 'SYN-A',block_name text,description text);
 CREATE TABLE parcels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES projects(id),block_id uuid REFERENCES blocks(id),parcel_number varchar(30),lr_number_proposed varchar(50),lr_number_confirmed varchar(50),area_ha numeric(12,6),status text DEFAULT 'pending',assigned_surveyor uuid,notes text,revision_number int DEFAULT 1,geom text,created_at timestamptz DEFAULT NOW(),updated_at timestamptz DEFAULT NOW());
 CREATE UNIQUE INDEX scheme_parcel_number_per_block ON parcels(block_id,parcel_number) WHERE block_id IS NOT NULL;
 CREATE TABLE parcel_traverses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),parcel_id uuid REFERENCES parcels(id) ON DELETE CASCADE);
 CREATE TABLE parcel_import_sources(parcel_id uuid PRIMARY KEY REFERENCES parcels(id) ON DELETE CASCADE);
 CREATE TABLE fixture_parcel_audit(id bigserial PRIMARY KEY,operation text,snapshot jsonb);
 CREATE FUNCTION fixture_touch_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END;$$;
 CREATE TRIGGER set_updated_at_parcels BEFORE UPDATE ON parcels FOR EACH ROW EXECUTE FUNCTION fixture_touch_timestamp();
 CREATE TRIGGER trg_parcels_updated_at BEFORE UPDATE ON parcels FOR EACH ROW EXECUTE FUNCTION fixture_touch_timestamp();
 CREATE FUNCTION fixture_audit_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO fixture_parcel_audit(operation,snapshot) VALUES(TG_OP,CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END);
  IF TG_OP='UPDATE' THEN NEW.revision_number:=COALESCE(OLD.revision_number,0)+1;END IF;
  RETURN NULL;END;$$;
 CREATE TRIGGER fixture_audit_snapshot AFTER INSERT OR UPDATE OR DELETE ON parcels FOR EACH ROW EXECUTE FUNCTION fixture_audit_snapshot();
 CREATE FUNCTION fixture_parcel_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF current_setting('metardu_fixture.parcel_fault',true)='suppress' THEN RETURN NULL; END IF;
  IF TG_OP<>'DELETE' THEN
   IF current_setting('metardu_fixture.parcel_fault',true)='invalid_status' THEN NEW.status:='SYNTHETIC invalid'; END IF;
   IF current_setting('metardu_fixture.parcel_fault',true)='changed_notes' THEN NEW.notes:='SYNTHETIC unexpected trigger change'; END IF;
   IF TG_OP='UPDATE' AND current_setting('metardu_fixture.parcel_fault',true)='retained_timestamp' THEN NEW.updated_at:=OLD.updated_at; END IF;
   RETURN NEW;
  END IF;RETURN OLD;END;$$;
 CREATE TRIGGER zz_fixture_parcel_fault BEFORE INSERT OR UPDATE OR DELETE ON parcels FOR EACH ROW EXECUTE FUNCTION fixture_parcel_fault();`)
 await check('authentication required',async()=>assert.equal((await create({},null)).status,401))
 await check('create preserves UUIDs and exact version token',async()=>{const response=await create({area_ha:0.125});assert.equal(response.status,201);const body=await response.json();assert.equal(body.data.project_id,project);assert.equal(body.data.block_id,block);assert.equal(body.data.revision_number,1);assert.match(body.data.updated_at,/\.\d{6}Z$/)})
 await check('create cannot target a block in a different supplied project',async()=>{const before=await state();assert.equal((await create({project_id:otherProject})).status,404);assert.deepEqual(await state(),before)})
 await check('create refuses foreign owner',async()=>assert.equal((await create({},other)).status,404))
 await check('concurrent duplicate creates commit once',async()=>{const responses=await Promise.all([create(),create()]);assert.deepEqual(responses.map(row=>row.status).sort(),[201,409]);assert.equal((await state()).parcels.length,2)})
 for(const mode of ['invalid_status','changed_notes','suppress'])await check(`create ${mode} acknowledgement rolls back`,async()=>{const before=await state();fault=mode;assert.equal((await create()).status,500);assert.deepEqual(await state(),before)})
 await check('update clears explicit unknown fields and advances the revision',async()=>{const response=await update({area_ha:null,lr_number_proposed:null,lr_number_confirmed:null});assert.equal(response.status,200);const body=await response.json();assert.equal(body.data.area_ha,null);assert.equal(body.data.revision_number,2);assert.match(body.data.updated_at,/\.\d{6}Z$/)})
 await check('stale timestamp preserves current record',async()=>{const before=await state();assert.equal((await update({updated_at:'2026-10-25T00:00:00.123Z'})).status,409);assert.deepEqual(await state(),before)})
 await check('stale revision preserves current record even with matching timestamp',async()=>{const before=await state();assert.equal((await update({base_revision:0})).status,409);assert.deepEqual(await state(),before)})
 for(const body of [{project_id:otherProject},{block_id:otherBlock}])await check(`update expected scope ${JSON.stringify(body)} is enforced`,async()=>{const before=await state();assert.equal((await update(body)).status,404);assert.deepEqual(await state(),before)})
 await check('owner change before admission refuses update',async()=>{beforeAdmission=()=>admin.query(`UPDATE ${schema}.projects SET user_id=$1 WHERE id=$2`,[other,project]);const before=(await state()).parcels;assert.equal((await update()).status,404);assert.deepEqual((await state()).parcels,before)})
 for(const mode of ['invalid_status','changed_notes','suppress'])await check(`update ${mode} acknowledgement rolls back`,async()=>{const before=await state();fault=mode;assert.equal((await update()).status,500);assert.deepEqual(await state(),before)})
 await check('delete requires the exact version',async()=>{const before=await state();assert.equal((await remove({updated_at:''})).status,400);assert.deepEqual(await state(),before)})
 await check('stale deletion preserves the record',async()=>{const before=await state();assert.equal((await remove({base_revision:'0'})).status,409);assert.deepEqual(await state(),before)})
 for(const evidence of ['traverse','source','geometry','issued'])await check(`delete retains parcel with ${evidence} evidence`,async()=>{
  if(evidence==='traverse')await pool.query('INSERT INTO parcel_traverses(parcel_id) VALUES($1)',[parcel]);if(evidence==='source')await pool.query('INSERT INTO parcel_import_sources VALUES($1)',[parcel]);if(evidence==='geometry')await pool.query("UPDATE parcels SET geom='SYNTHETIC geometry' WHERE id=$1",[parcel]);if(evidence==='issued')await pool.query("UPDATE parcels SET status='approved' WHERE id=$1",[parcel]);const before=await state();const token=(await pool.query(`SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') version FROM parcels WHERE id=$1`,[parcel])).rows[0].version;assert.equal((await remove({updated_at:token})).status,409);assert.deepEqual(await state(),before)
 })
 await check('empty pending parcel deletion is acknowledged by exact identity',async()=>{const response=await remove();assert.equal(response.status,200);const body=await response.json();assert.equal(body.data.deletedId,parcel);assert.equal(body.data.projectId,project);assert.equal((await state()).parcels.length,0)})
 await check('suppressed deletion cannot report success',async()=>{const before=await state();fault='suppress';assert.equal((await remove()).status,500);assert.deepEqual(await state(),before)})
 await check('unchanged update timestamp refuses acknowledgement',async()=>{const before=await state();fault='retained_timestamp';assert.equal((await update()).status,500);assert.deepEqual(await state(),before)})
 await check('empty deletion revision is invalid input',async()=>{const before=await state();assert.equal((await remove({base_revision:''})).status,400);assert.deepEqual(await state(),before)})
 await check('register returns exact versions and distinguishes unknown area',async()=>{const response=await read();assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.summary.total,1);assert.equal(data.summary.unknownAreaCount,1);assert.equal(data.summary.knownAreaCount,0);assert.equal(data.register.rows[0].updated_at,version);assert.equal(data.register.rows[0].can_delete,true)})
 await check('register binds actor, project and block',async()=>{assert.equal((await read('',other)).status,404);assert.equal((await read('',actor,otherProject)).status,404);assert.equal((await read('',actor,'bad')).status,400)})
 await check('10000-parcel register returns stable 50-row pages and global totals',async()=>{
  report.registerProfile={synthetic:true,total:10000,stage:'fixture_population'}
  let start=performance.now()
  await pool.query("INSERT INTO parcels(project_id,block_id,parcel_number,area_ha,status) SELECT $1,$2,'SYN-'||lpad(i::text,5,'0'),0.125,CASE WHEN i%2=0 THEN 'computed' ELSE 'pending' END FROM generate_series(1,9999) i",[project,block])
  report.registerProfile.populationMs=Math.round(performance.now()-start);report.registerProfile.stage='first_page';start=performance.now()
  const a=await read();report.registerProfile.firstPageMs=Math.round(performance.now()-start);assert.equal(a.status,200)
  report.registerProfile.stage='second_page';start=performance.now();const b=await read('page=2');report.registerProfile.secondPageMs=Math.round(performance.now()-start);assert.equal(b.status,200)
  const first=(await a.json()).data,second=(await b.json()).data
  assert.equal(first.summary.total,10000);assert.equal(first.summary.knownAreaHa,'1249.875000');assert.equal(first.register.rows.length,50);assert.equal(second.register.rows.length,50);assert.equal(first.register.rows.some(row=>second.register.rows.some(next=>next.id===row.id)),false)
  report.registerProfile.stage='repeat_page';assert.deepEqual((await (await read()).json()).data,first)
  Object.assign(report.registerProfile,{stage:'complete',pageRows:first.register.rows.length,responseObjectBytes:Buffer.byteLength(JSON.stringify(first))})
 })
 await check('literal percent and underscore search do not become wildcards',async()=>{await pool.query("INSERT INTO parcels(project_id,block_id,parcel_number) VALUES($1,$2,'SYN%_MATCH'),($1,$2,'SYNXXMATCH')",[project,block]);const response=await read('q=%25_');assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.register.total,1);assert.equal(data.register.rows[0].parcel_number,'SYN%_MATCH');assert.equal(data.summary.total,3)})
 await check('status filter preserves whole-block counts',async()=>{await pool.query("INSERT INTO parcels(project_id,block_id,parcel_number,status) VALUES($1,$2,'SYN-C1','computed'),($1,$2,'SYN-C2','computed')",[project,block]);const response=await read('status=computed');assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.register.total,2);assert.equal(data.summary.total,3);assert.equal(data.summary.statusCounts.computed,2)})
 await check('unknown status and nonfinite recorded area remain explicit',async()=>{await pool.query("UPDATE parcels SET status=NULL,area_ha='NaN'::numeric WHERE id=$1",[parcel]);const response=await read('status=unrecognized');assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.summary.invalidAreaCount,1);assert.equal(data.summary.unrecognizedStatusCount,1);assert.equal(data.register.rows[0].area_text,'NaN');assert.equal(data.register.rows[0].area_ha,null);assert.equal(data.register.rows[0].can_delete,false)})
 await check('register omits retained geometry payload',async()=>{await pool.query('UPDATE parcels SET geom=$1 WHERE id=$2',['SYNTHETIC'.repeat(50000),parcel]);const response=await read();assert.equal(response.status,200);const body=await response.json();assert.ok(Buffer.byteLength(JSON.stringify(body))<3000);assert.equal(body.data.register.rows[0].can_delete,false);assert.equal('geom' in body.data.register.rows[0],false)})
 for(const table of ['parcel_traverses','parcel_import_sources'])await check(`register protects ${table} evidence`,async()=>{await pool.query(`INSERT INTO ${table}(parcel_id) VALUES($1)`,[parcel]);const response=await read();assert.equal(response.status,200);assert.equal((await response.json()).data.register.rows[0].can_delete,false)})
 await check('read/edit/read roundtrip preserves exact optimistic tokens',async()=>{const before=(await (await read()).json()).data.register.rows[0];const response=await update({updated_at:before.updated_at,base_revision:before.revision_number});assert.equal(response.status,200);const after=(await (await read()).json()).data.register.rows[0];assert.equal(after.notes,'SYNTHETIC changed');assert.equal(after.revision_number,2);assert.notEqual(after.updated_at,before.updated_at)})
 await check('empty register zeros follow acknowledged deletion',async()=>{assert.equal((await remove()).status,200);const response=await read();assert.equal(response.status,200);const {data}=await response.json();assert.equal(data.summary.total,0);assert.equal(data.register.rows.length,0);assert.equal(data.register.page,1)})
 await check('register dependency failure remains unavailable',async()=>{await pool.query('ALTER TABLE parcel_traverses RENAME TO fixture_unavailable_traverses');try{assert.equal((await read()).status,500)}finally{await pool.query('ALTER TABLE fixture_unavailable_traverses RENAME TO parcel_traverses')}})
 for(const query of ['page=0','status=not-a-status',`q=${'x'.repeat(81)}`])await check(`invalid register filter ${query} refused`,async()=>assert.equal((await read(query)).status,400))
}finally{
 await pool.end();try{if(created){assert.equal((await admin.query("SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1",[schema])).rows[0].marker,marker);await admin.query(`DROP SCHEMA ${schema} CASCADE`);assert.equal((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount,0);report.ownedFixtureRemoved=true}if(original){assert.deepEqual(await fingerprint(),original);report.originalRecordsPreserved=true}if(ledger){assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows,ledger);report.migrationLedgerPreserved=true}assert.deepEqual(hashes(),report.source);report.sourcePreserved=true;report.status=report.checks.length===42&&report.checks.every(row=>row.passed)&&report.ownedFixtureRemoved&&report.originalRecordsPreserved&&report.migrationLedgerPreserved?'passed':'failed';save()}finally{await admin.end()}
}
process.exitCode=report.status==='passed'?0:1
