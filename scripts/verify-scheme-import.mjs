// Native PostgreSQL + actual source handler. Authentication is a bounded adapter.
// Only a uniquely owned schema in the identity-checked rehearsal DB is changed.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const phase = process.argv[2]
assert.ok(['red','green'].includes(phase) && process.argv.length === 3)
const service = JSON.parse(execFileSync('docker', ['inspect','--format','{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}','metardu-schema-rehearsal-20261008'], { encoding:'utf8', windowsHide:true, timeout:30000 }))
assert.equal(service.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
assert.equal(service.Labels['metardu.purpose'],'schema-rehearsal'); assert.equal(service.Running,true)
assert.deepEqual(service.Ports['5432/tcp'],[{ HostIp:'127.0.0.1', HostPort:'55433' }])
const token=randomUUID(), schema=`metardu_scheme_import_${token.replaceAll('-','')}`
assert.match(schema,/^metardu_scheme_import_[a-f0-9]{32}$/)
const marker=`METARDU owned scheme import fixture ${token}`
const options={ connectionString:'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify', connectionTimeoutMillis:5000, statement_timeout:12000, application_name:`metardu-scheme-import-${token}` }
const admin=new pg.Client(options), pool=new pg.Pool({ ...options,max:4,options:`-c search_path=${schema},public` })
let fault='', afterLock=null
const database={ query:(sql,values)=>pool.query(sql,values), transaction:async fn=>{
  const client=await pool.connect()
  try {
    await client.query('BEGIN'); await client.query("SELECT set_config('metardu_fixture.import_fault',$1,true)",[fault])
    const result=await fn({ query:async(sql,values)=>{
      const result=await client.query(sql,values)
      if(afterLock && /FROM projects.*FOR UPDATE/s.test(sql)){ const hook=afterLock; afterLock=null; await hook() }
      return result
    } })
    await client.query('COMMIT'); return result
  } catch(error){ await client.query('ROLLBACK'); throw error } finally{client.release()}
} }
const require=createRequire(import.meta.url), Module=require('node:module'), ts=require('typescript'), originalLoad=Module._load
Module._load=function(request,parent,...rest){
  if(request==='@/lib/db')return {db:database}
  if(request==='@/lib/apiHandler')return { apiHandler:(_options,handler)=>async(req,userId)=>{
    if(!userId)return Response.json({error:'Unauthenticated fixture caller'},{status:401})
    try{return await handler(req,{userId,params:{}})}catch(error){return Response.json({error:error.message},{status:error.statusCode??500})}
  } }
  const resolved=request.startsWith('@/')?path.join(process.cwd(),'src',request.slice(2)):request
  return originalLoad.call(this,resolved,parent,...rest)
}
Module._extensions['.ts']=function(module,filename){module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,filename)}
const {POST}=require('../src/app/api/scheme/import/route.ts'), {NextRequest}=require('next/server')
const owner=randomUUID(),other=randomUUID(),project=randomUUID(),otherProject=randomUUID(),block=randomUUID(),otherBlock=randomUUID()
const header='parcel_number,lr_number_proposed,area_ha,notes\r\n', basic=header+'SYN-1,,0.125,SYNTHETIC ONLY\r\n'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
function invoke(csv=basic,{user=owner,projectId=project,blockId=block,requestId=randomUUID(),name='SYNTHETIC.csv'}={}){
  const form=new FormData(); form.set('project_id',projectId); form.set('block_id',blockId); form.set('request_id',requestId); form.set('file',new Blob([csv],{type:'text/csv'}),name)
  return POST(new NextRequest('http://127.0.0.1:3021/api/scheme/import',{method:'POST',body:form}),user)
}
const root='.cache/scheme-import';mkdirSync(root,{recursive:true})
const files=['scripts/verify-scheme-import.mjs','src/app/api/scheme/import/route.ts','src/lib/parcel/schemeMetadataImport.ts','src/lib/parcel/schemeMetadataImportServer.ts','src/lib/parcel/csvRecords.ts','src/lib/security/requestBody.ts','src/lib/db/migrations/117_scheme_import_receipts.sql'].filter(existsSync)
const hashes=()=>Object.fromEntries(files.map(file=>[file,hash(readFileSync(file))]))
const report={checkedAt:new Date().toISOString(),phase,source:hashes(),fixtureSchema:schema,authentication:'bounded adapter, not ordinary-account HTTP',checks:[]}
const save=()=>writeFileSync(`${root}/${phase}.json`,JSON.stringify(report,null,2)+'\n')
const state=async()=>({parcels:(await pool.query('SELECT * FROM parcels ORDER BY parcel_number')).rows,receipts:(await pool.query('SELECT * FROM scheme_import_receipts ORDER BY request_id')).rows})
const fingerprint=async()=>{const result={};for(const table of ['projects','blocks','parcels','users','observation_batches'])result[table]=(await admin.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(record)::text,E'\n' ORDER BY row_to_json(record)::text),'')) hash FROM public.${table} record`)).rows[0];return result}
async function reset(){
  fault='';afterLock=null
  await pool.query('TRUNCATE scheme_import_receipts,parcels,blocks,projects,users CASCADE')
  await pool.query('INSERT INTO users VALUES($1),($2)',[owner,other])
  await pool.query('INSERT INTO projects VALUES($1,$2),($3,$2)',[project,owner,otherProject])
  await pool.query('INSERT INTO blocks VALUES($1,$2),($3,$4)',[block,project,otherBlock,otherProject])
}
async function check(name,run){await reset();const start=performance.now();try{await run();report.checks.push({name,passed:true,elapsedMs:Math.round(performance.now()-start)});console.log(`PASS ${name}`)}catch(error){report.checks.push({name,passed:false,error:error.message});console.log(`FAIL ${name}: ${error.message}`)}save()}
let created=false,original,ledger
await admin.connect()
try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  original=await fingerprint();ledger=(await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  await admin.query(`CREATE SCHEMA ${schema}`);created=true;await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`)
  assert.equal((await pool.query('SELECT current_schema() name')).rows[0].name,schema)
  await pool.query(`CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid REFERENCES users(id));
    CREATE TABLE blocks(id uuid PRIMARY KEY,project_id uuid REFERENCES projects(id));
    CREATE TABLE parcels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES projects(id),block_id uuid REFERENCES blocks(id),parcel_number varchar(30) NOT NULL,lr_number_proposed varchar(50),area_ha numeric(12,6),status text DEFAULT 'pending',notes text,updated_at timestamptz DEFAULT NOW());`)
  const migration=readFileSync('src/lib/db/migrations/117_scheme_import_receipts.sql','utf8').split('-- DOWN:')[0]
  // Execute the exact pending DDL with public identifiers redirected ONLY to this owned schema.
  await pool.query(migration.replaceAll('public.',`${schema}.`).replaceAll('pg_catalog,public',`pg_catalog,${schema}`))
  await pool.query(`CREATE FUNCTION fixture_import_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF current_setting('metardu_fixture.import_fault',true)=TG_TABLE_NAME THEN RETURN NULL; END IF;
    IF current_setting('metardu_fixture.import_fault',true)='mutate_'||TG_TABLE_NAME THEN
      IF TG_TABLE_NAME='parcels' THEN NEW.notes:='SYNTHETIC unexpected trigger edit';
      ELSE NEW.source_name:='SYNTHETIC changed.csv'; END IF;
    END IF;
    RETURN NEW; END; $$;
    CREATE TRIGGER fixture_parcel_fault BEFORE INSERT ON parcels FOR EACH ROW EXECUTE FUNCTION fixture_import_fault();
    CREATE TRIGGER fixture_receipt_fault BEFORE INSERT ON scheme_import_receipts FOR EACH ROW EXECUTE FUNCTION fixture_import_fault();`)
  await check('authentication required',async()=>assert.equal((await invoke(basic,{user:null})).status,401))
  await check('UUID input is validated',async()=>{assert.equal((await invoke(basic,{projectId:'bad'})).status,400);assert.equal((await state()).parcels.length,0)})
  await check('foreign owner refused',async()=>{assert.equal((await invoke(basic,{user:other})).status,404);assert.equal((await state()).parcels.length,0)})
  await check('block must belong to supplied project',async()=>{assert.equal((await invoke(basic,{projectId:otherProject})).status,404);assert.equal((await state()).parcels.length,0)})
  for(const count of [501,10000])await check(`complete ${count}-parcel atomic intake`,async()=>{
    const source=header+Array.from({length:count},(_,i)=>`SYN-${i},,0.125,SYNTHETIC ONLY`).join('\n')
    const res=await invoke(source);assert.equal(res.status,201);const body=await res.json();assert.equal(body.data.created,count);assert.equal(body.data.total_rows,count);assert.equal((await state()).parcels.length,count)
  })
  await check('10001 rows refused without silent truncation',async()=>{const csv=header+Array.from({length:10001},(_,i)=>`SYN-${i},,0.125,`).join('\n');assert.equal((await invoke(csv)).status,413);assert.equal((await state()).parcels.length,0)})
  await check('quoted UTF-8 CSV retains exact original bytes',async()=>{
    const source='\uFEFF'+header+'SYN-1,,0.125,"SYNTHETIC, Mwavumbo\nsaid ""pima"" — only"\r\n';const res=await invoke(source);assert.equal(res.status,201)
    const saved=await state();assert.equal(saved.parcels[0].notes,'SYNTHETIC, Mwavumbo\nsaid "pima" — only');assert.deepEqual(saved.receipts[0].source_bytes,Buffer.from(source));assert.equal(saved.receipts[0].source_hash,hash(source))
  })
  for(const area of ['0','-2','NaN','0.2junk','1e2','0.1234567'])await check(`invalid/unrepresentable area ${area} refused atomically`,async()=>{assert.equal((await invoke(header+`SYN-1,,${area},SYNTHETIC`)).status,400);assert.equal((await state()).parcels.length,0)})
  await check('unitless area header refused',async()=>assert.equal((await invoke('parcel_number,area\nSYN-1,0.125')).status,400))
  await check('duplicate CSV IDs refused',async()=>assert.equal((await invoke(basic+'SYN-1,,0.125,SYNTHETIC ONLY')).status,400))
  await check('one bad row refuses the entire file',async()=>{assert.equal((await invoke(basic+',,0.125,missing ID')).status,400);assert.equal((await state()).parcels.length,0)})
  await check('identical existing metadata is retained without update',async()=>{assert.equal((await invoke()).status,201);const before=(await state()).parcels;const response=await invoke();assert.equal(response.status,201);assert.equal((await response.json()).data.unchanged,1);assert.deepEqual((await state()).parcels,before)})
  await check('conflicting existing metadata refuses all rows',async()=>{assert.equal((await invoke()).status,201);const before=await state();assert.equal((await invoke(header+'SYN-2,,0.25,new\nSYN-1,,0.5,changed')).status,409);assert.deepEqual(await state(),before)})
  await check('lost response replay recovers historical receipt without overwriting later work',async()=>{
    const requestId=randomUUID();const first=await invoke(basic,{requestId});assert.equal(first.status,201);const receipt=(await first.json()).data
    await pool.query("UPDATE parcels SET notes='SYNTHETIC later edit' WHERE block_id=$1",[block]);const before=await state()
    const replay=await invoke(basic,{requestId});assert.equal(replay.status,200);assert.deepEqual((await replay.json()).data,{...receipt,replayed:true});assert.deepEqual(await state(),before)
  })
  await check('changed request intent refused',async()=>{const requestId=randomUUID();assert.equal((await invoke(basic,{requestId})).status,201);const before=await state();assert.equal((await invoke(basic.replace('0.125','0.25'),{requestId})).status,409);assert.deepEqual(await state(),before)})
  await check('simultaneous exact retries commit once',async()=>{const requestId=randomUUID();const responses=await Promise.all([invoke(basic,{requestId}),invoke(basic,{requestId})]);assert.deepEqual(responses.map(res=>res.status).sort(),[200,201]);assert.equal((await state()).parcels.length,1);assert.equal((await state()).receipts.length,1)})
  for(const table of ['parcels','scheme_import_receipts'])await check(`missing ${table} acknowledgement rolls everything back`,async()=>{fault=table;assert.equal((await invoke()).status,500);assert.deepEqual(await state(),{parcels:[],receipts:[]})})
  for(const table of ['parcels','scheme_import_receipts'])await check(`mutated ${table} acknowledgement rolls everything back`,async()=>{fault=`mutate_${table}`;assert.equal((await invoke()).status,500);assert.deepEqual(await state(),{parcels:[],receipts:[]})})
  await check('malformed quoted field refused',async()=>{assert.equal((await invoke(header+'SYN-1,,0.125,"a"junk')).status,400);assert.equal((await state()).parcels.length,0)})
  await check('oversize CSV refused before intake',async()=>{assert.equal((await invoke('x'.repeat(4*1024*1024+1))).status,413);assert.equal((await state()).parcels.length,0)})
  await check('invalid UTF-8 refused',async()=>{assert.equal((await invoke(new Uint8Array([0xff,0xfe,0x61]))).status,400);assert.equal((await state()).parcels.length,0)})
  await check('pending receipt migration fails closed without parcel writes',async()=>{
    await pool.query('ALTER TABLE scheme_import_receipts RENAME TO fixture_pending_receipts')
    try{assert.equal((await invoke()).status,503);assert.equal((await pool.query('SELECT id FROM parcels')).rows.length,0)}
    finally{await pool.query('ALTER TABLE fixture_pending_receipts RENAME TO scheme_import_receipts')}
  })
  await check('receipt rejects later mutation',async()=>{assert.equal((await invoke()).status,201);const before=await state();await assert.rejects(pool.query("UPDATE scheme_import_receipts SET source_name='changed.csv'"),/immutable/i);assert.deepEqual(await state(),before)})
  await check('unique block/number index protects other writers',async()=>{assert.equal((await invoke()).status,201);await assert.rejects(pool.query("INSERT INTO parcels(project_id,block_id,parcel_number) VALUES($1,$2,'SYN-1')",[project,block]),/duplicate key/i)})
  await check('migration refuses legacy duplicates without deleting them',async()=>{
    const client=await pool.connect();try{
      await client.query('BEGIN');await client.query(`DROP INDEX ${schema}.scheme_parcel_number_per_block`)
      await client.query("INSERT INTO parcels(project_id,block_id,parcel_number) VALUES($1,$2,'SYN-DUP'),($1,$2,'SYN-DUP')",[project,block])
      await assert.rejects(client.query(migration.replaceAll('public.',`${schema}.`).replaceAll('pg_catalog,public',`pg_catalog,${schema}`)),/could not create unique index/i)
    }finally{await client.query('ROLLBACK');client.release()}
    assert.ok((await pool.query('SELECT to_regclass($1) name',[`${schema}.scheme_parcel_number_per_block`])).rows[0].name)
  })
  await check('authenticated receipt visibility follows actor and current ownership',async()=>{
    assert.equal((await invoke()).status,201);await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO authenticated; GRANT SELECT ON ${schema}.projects,${schema}.blocks TO authenticated`)
    const client=await pool.connect();try{await client.query('BEGIN');await client.query('SET LOCAL ROLE authenticated');
      for(const [actor,count] of [[owner,1],[other,0]]){await client.query("SELECT set_config('request.user_id',$1,true)",[actor]);assert.equal((await client.query('SELECT request_id FROM scheme_import_receipts')).rows.length,count)}
      await client.query('ROLLBACK')
    }finally{client.release()}
    await pool.query('UPDATE projects SET user_id=$1 WHERE id=$2',[other,project]);const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE authenticated');await c.query("SELECT set_config('request.user_id',$1,true)",[owner]);assert.equal((await c.query('SELECT request_id FROM scheme_import_receipts')).rows.length,0);await c.query('ROLLBACK')}finally{c.release()}
  })
}finally{
  await pool.end()
  try{
    if(created){assert.equal((await admin.query("SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1",[schema])).rows[0].marker,marker);await admin.query(`DROP SCHEMA ${schema} CASCADE`);assert.equal((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount,0);report.ownedFixtureRemoved=true}
    if(original){assert.deepEqual(await fingerprint(),original);report.originalRecordsPreserved=true}
    if(ledger){assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows,ledger);report.migrationLedgerPreserved=true}
    assert.deepEqual(hashes(),report.source);report.sourcePreserved=true
    report.status=report.checks.length===34&&report.checks.every(item=>item.passed)&&report.ownedFixtureRemoved&&report.originalRecordsPreserved&&report.migrationLedgerPreserved?'passed':'failed';save()
  }finally{await admin.end()}
}
process.exitCode=report.status==='passed'?0:1
