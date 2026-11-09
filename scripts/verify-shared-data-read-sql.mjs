import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createHash,randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
const root=process.cwd(),require=createRequire(path.join(root,'package.json')),{Client}=require('pg')
const {rehearsalDatabaseConfig}=await import(pathToFileURL(path.join(root,'scripts/rehearsal-database.mjs')))
const {quoteIdentifier}=await import(pathToFileURL(path.join(root,'scripts/provision-runtime-db-role.mjs')))
const baseline=process.argv.includes('--baseline')
const owned=JSON.parse(execFileSync('docker',['inspect','metardu-schema-rehearsal-20261008'],{encoding:'utf8',windowsHide:true}))[0]
assert.equal(owned.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
assert.deepEqual(owned.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const addresses=rehearsalDatabaseConfig(),admin=new URL(addresses.adminUrl),runtime=new URL(addresses.runtimeUrl)
admin.pathname='/metardu_runtime_verify';runtime.pathname=admin.pathname
process.env.TEST_ADMIN_DATABASE_URL=admin.href;process.env.TEST_RUNTIME_DATABASE_URL=runtime.href
const config=rehearsalDatabaseConfig(),client=new Client({connectionString:config.adminUrl,connectionTimeoutMillis:5000})
const report={synthetic:true,database:config.database,baseline,productionChanged:false,migrationLedgerChanged:false,transactionRolledBack:false,checks:[]}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const tables=['users','surveyor_profiles','projects','project_members','survey_points','project_fieldbook_entries','fieldbook_audit_events','survey_observations']
const fingerprint=async()=>{
 const values=[]
 for(const table of tables)values.push([table,(await client.query(`SELECT md5(COALESCE(string_agg(row_to_json(shared_read_fingerprint_row)::text,E'\\n' ORDER BY row_to_json(shared_read_fingerprint_row)::text),'')) AS fingerprint FROM public.${quoteIdentifier(table)} shared_read_fingerprint_row`)).rows[0].fingerprint])
 return hash(values)
}
const policies=async()=>(await client.query("SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('survey_points','project_fieldbook_entries') ORDER BY tablename,policyname")).rows
let began=false,before,ledgerBefore,policiesBefore
try{
 await client.connect()
 assert.equal((await client.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
 before=await fingerprint();ledgerBefore=hash((await client.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows);policiesBefore=await policies()
 await client.query('BEGIN');began=true
 await client.query("SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='5s'")
 if(!baseline){
  const migration=readFileSync(path.join(root,'src/lib/db/migrations/126_shared_workspace_read_grants.sql'),'utf8').split(/^--\s*DOWN:/m)[0]
  report.migrationSha256=createHash('sha256').update(migration).digest('hex')
  await client.query(migration)
  report.checks.push('forward SQL parsed in isolated rollback transaction')
  const after=await policies(),writes=value=>value.filter(row=>row.cmd!=='SELECT').map(row=>JSON.stringify(row)).sort()
  assert.deepEqual(writes(after),writes(policiesBefore));report.checks.push('all existing mutation policies preserved byte-for-byte in catalog representation')
 }
 const ids=Object.fromEntries(['owner','crew','viewer','other','unknown','project','foreign','point','fieldbook'].map(name=>[name,randomUUID()]))
 for(const actor of [ids.owner,ids.crew,ids.viewer,ids.other,ids.unknown]){
  await client.query("INSERT INTO public.users(id,email,password_hash,full_name) VALUES($1,$2,'synthetic-no-login','SYNTHETIC shared read SQL')",[actor,`shared-${actor}@example.invalid`])
  await client.query("INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)",[actor])
 }
 for(const [id,owner] of [[ids.project,ids.owner],[ids.foreign,ids.other]])await client.query("INSERT INTO public.projects(id,user_id,name) VALUES($1,$2,'SYNTHETIC shared-read fixture')",[id,owner])
 await client.query("INSERT INTO public.project_members(project_id,user_id,role) VALUES($1,$2,'surveyor'),($1,$3,'viewer'),($1,$4,'unexpected_role')",[ids.project,ids.crew,ids.viewer,ids.unknown])
 await client.query("SELECT set_config('request.user_id',$1,true),set_config('request.org_id','',true),set_config('request.access_role','',true)",[ids.owner])
 await client.query("INSERT INTO public.survey_points(id,project_id,point_name,easting,northing,elevation) VALUES($1,$2,'SYNTHETIC shared point',500000,9900000,100)",[ids.point,ids.project])
 await client.query("INSERT INTO public.project_fieldbook_entries(id,project_id,row_index,station,raw_data) VALUES($1,$2,0,'SYNTHETIC station',$3)",[ids.fieldbook,ids.project,JSON.stringify({distance:'10',source:'synthetic permission test'})])
 const actor=async id=>{await client.query(`SET LOCAL ROLE ${quoteIdentifier(config.runtimeRole)}`);await client.query("SELECT set_config('request.user_id',$1,true)",[id])}
 const denied=async(name,work)=>{
  await client.query('SAVEPOINT rejected_shared_write')
  let failure
  try{await work()}catch(error){failure=error}
  await client.query('ROLLBACK TO SAVEPOINT rejected_shared_write');await client.query('RELEASE SAVEPOINT rejected_shared_write')
  assert.equal(failure?.code,'42501',`${name}: expected42501, received ${failure?.code??'success'}`)
  report.checks.push(name)
 }
 for(const [name,id] of [['crew',ids.crew],['viewer',ids.viewer]]){
  await actor(id)
  const visibleProject=(await client.query('SELECT id FROM public.projects WHERE id=$1',[ids.project])).rows
  assert.equal(visibleProject.length,1);report.checks.push(`${name} can read the authorized project parent`)
  for(const [table,rowId] of [['survey_points',ids.point],['project_fieldbook_entries',ids.fieldbook]]){
   const read=await client.query(`SELECT id FROM public.${quoteIdentifier(table)} WHERE project_id=$1`,[ids.project])
   report.observedReads??=[];report.observedReads.push({actor:name,table,rows:read.rows.length})
   assert.equal(read.rows.length,1,`${name} ${table}: shared project admission must expose its retained source row`)
   const column=table==='survey_points'?'description':'station'
   assert.equal((await client.query(`UPDATE public.${quoteIdentifier(table)} SET ${column}='forbidden' WHERE id=$1 RETURNING id`,[rowId])).rows.length,0)
   assert.equal((await client.query(`DELETE FROM public.${quoteIdentifier(table)} WHERE id=$1 RETURNING id`,[rowId])).rows.length,0)
   report.checks.push(`${name} can read ${table} without gaining update/delete access`)
  }
  await denied(`${name} has no new point insertion grant`,()=>client.query("INSERT INTO public.survey_points(project_id,point_name) VALUES($1,'forbidden')",[ids.project]))
  await denied(`${name} has no new field-book insertion grant`,()=>client.query("INSERT INTO public.project_fieldbook_entries(project_id,row_index,station) VALUES($1,1,'forbidden')",[ids.project]))
 }
 for(const [name,id] of [['unrelated',ids.other],['unknown-role member',ids.unknown]]){
  await actor(id)
  for(const table of ['survey_points','project_fieldbook_entries'])assert.equal((await client.query(`SELECT id FROM public.${quoteIdentifier(table)} WHERE project_id=$1`,[ids.project])).rows.length,0)
  report.checks.push(`${name} cannot read either source table`)
 }
 await actor(ids.owner)
 assert.equal((await client.query("UPDATE public.project_fieldbook_entries SET station='SYNTHETIC owner update' WHERE id=$1 RETURNING id",[ids.fieldbook])).rows.length,1)
 report.checks.push('existing owner draft edit remains available')
 await client.query('RESET ROLE')
 await client.query('ROLLBACK');began=false;report.transactionRolledBack=true
 assert.equal(await fingerprint(),before);assert.equal(hash((await client.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows),ledgerBefore);assert.equal(hash(await policies()),hash(policiesBefore))
 report.checks.push('rollback preserved all source/fixture tables, migration ledger and initial policies')
 report.passed=true
}catch(error){report.passed=false;report.error=error instanceof Error?error.message:'SQL verification failed';process.exitCode=1}
finally{
 if(began){await client.query('ROLLBACK');report.transactionRolledBack=true}
 if(before){assert.equal(await fingerprint(),before);report.rollbackFingerprintsPreserved=true}
 await client.end()
}
mkdirSync(path.join(root,'.cache/collaboration-source'),{recursive:true})
writeFileSync(path.join(root,`.cache/collaboration-source/shared-data-read-${baseline?'baseline':'rollback'}.json`),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
