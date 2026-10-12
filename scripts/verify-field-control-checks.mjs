#!/usr/bin/env node
import assert from 'node:assert/strict'
import { AsyncLocalStorage,AsyncResource } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir,writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
import { RUNTIME_ROLE_QUERY,runtimeDatabaseRoleFailure } from './verify-migrations.mjs'
const rehearsal=rehearsalDatabaseConfig()
Object.assign(process.env,{DATABASE_URL:rehearsal.runtimeUrl,AUTH_SECRET:'synthetic-field-check-only',NODE_ENV:'test',DB_POOL_MAX:'2'})
const require=createRequire(import.meta.url),Module=require('node:module'),ts=require('typescript'),sessions=new AsyncLocalStorage(),load=Module._load
Module._load=function(request,parent,...args){if(request==='next-auth')return {getServerSession:async()=>sessions.getStore()??null};return load.call(this,request.startsWith('@/')?path.join(process.cwd(),'src',request.slice(2)):request,parent,...args)}
Module._extensions['.ts']=function(module,file){module._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file)}
const {getPool}=require('../src/lib/db.ts'),{GET,POST}=require('../src/app/api/control-points/verifications/route.ts'),{NextRequest}=require('next/server')
const admin=new pg.Client({connectionString:rehearsal.adminUrl}),ids=Object.fromEntries(['owner','other','project','otherProject','undeclared','point','beacon','monument','legacyMonument','noncontrol'].map(name=>[name,randomUUID()]))
const checks=[],check=(name,value)=>{checks.push({name,passed:Boolean(value)});console.log(`${value?'PASS':'FAIL'} ${name}`);assert.ok(value,name)}
async function invoke(user,handler,method='POST',body,query=''){
 const resource=new AsyncResource('FIELD_CONTROL_TEST')
 try{return await resource.runInAsyncScope(()=>sessions.run(user?{user:{id:user,email:`field-${user}@example.invalid`,name:'Synthetic field operator',role:'user'}}:null,async()=>{
  const response=await handler(new NextRequest(`http://localhost/api/control-points/verifications${query}`,{method,headers:{'Content-Type':'application/json','x-real-ip':'192.0.2.219'},...(body?{body:JSON.stringify(body)}:{})}),{params:{}})
  return {response,value:await response.json()}
 }))}finally{resource.emitDestroy()}
}
let seeded=false,fault=false,completed=false
await admin.connect()
try{
 check('field checks use a restricted runtime login',runtimeDatabaseRoleFailure((await getPool().query(RUNTIME_ROLE_QUERY)).rows[0])===null)
 for(const id of [ids.owner,ids.other]){await admin.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'synthetic-no-login','Synthetic field check test')",[id,`field-${id}@example.invalid`]);await admin.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)",[id])}seeded=true
 for(const [id,owner]of [[ids.project,ids.owner],[ids.otherProject,ids.other],[ids.undeclared,ids.owner]])await admin.query("INSERT INTO projects(id,user_id,name) VALUES($1,$2,'SYNTHETIC field checks')",[id,owner])
 await admin.query("INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by) VALUES($1,'EPSG:21037','Synthetic grid','ARC1960','metres',37,'S','Synthetic BM','local','grid',3,$2)",[ids.project,ids.owner])
 for(const [id,control]of [[ids.point,true],[ids.noncontrol,false]])await admin.query("INSERT INTO survey_points(id,project_id,point_name,easting,northing,elevation,is_control,horizontal_crs,vertical_datum) VALUES($1,$2,$3,500000,9800000,0,$4,'EPSG:21037','Synthetic BM')",[id,ids.project,`SYN-${id}`,control])
 await admin.query("INSERT INTO beacon_registry(id,project_id,created_by,beacon_number,easting,northing,elevation,horizontal_crs,metadata) VALUES($1,$2,$3,$4,500000,9800000,0,'EPSG:21037',$5)",[ids.beacon,ids.project,ids.owner,`SYN-${ids.beacon}`,JSON.stringify({reference:{verticalDatum:'Synthetic BM'}})])
 for(const [id,declared]of [[ids.monument,true],[ids.legacyMonument,false]])await admin.query("INSERT INTO boundary_monuments(id,project_id,created_by,monument_number,boundary_name,treaty_reference,easting,northing,elevation,horizontal_crs,vertical_datum) VALUES($1,$2,$3,$4,'Synthetic boundary','Synthetic TEST-ONLY reference',500000,9800000,0,$5,$6)",[id,ids.project,ids.owner,`SYN-${id}`,declared?'EPSG:21037':null,declared?'Synthetic BM':null])
 await admin.query("INSERT INTO control_point_verifications(point_type,point_id,point_name,verification_date,verified_by,condition) VALUES('survey_point',$1,'Synthetic legacy check','2026-10-08',$2,'good')",[ids.point,ids.owner])
 check('anonymous field checks are denied',(await invoke(null,GET,'GET',undefined,`?projectId=${ids.project}`)).response.status===401)
 check('project selection is required',(await invoke(ids.owner,GET,'GET')).response.status===400)
 check('another account cannot read project checks',(await invoke(ids.other,GET,'GET',undefined,`?projectId=${ids.project}`)).response.status===403)
 const options=await invoke(ids.owner,GET,'GET',undefined,`?projectId=${ids.project}&options=true`),mark=options.value.data?.marks.find(row=>row.id===ids.point)
 check('saved basis options return numeric zero, revision hash and exclude ordinary observations',options.response.status===200&&mark?.elevation===0&&typeof mark.easting==='number'&&mark.basisHash.length===64&&!options.value.data.marks.some(row=>row.id===ids.noncontrol))
 const input={projectId:ids.project,pointType:'survey_point',pointId:ids.point,requestId:randomUUID(),basisHash:mark.basisHash,observedAt:'2026-10-08T08:00:00Z',condition:'good',method:'total_station',instrument:'Synthetic TS serial only',evidenceReference:'Synthetic field book page 1',measuredEasting:500003,measuredNorthing:9800004,measuredElevation:0,horizontalTolerance:5,verticalTolerance:0,toleranceReference:'Synthetic engineering job criterion',notes:''}
 for(const [name,change,status]of [['caller-supplied published basis',{published_easting:500000},400],['missing criterion',{horizontalTolerance:null},400],['numeric string with suffix',{measuredEasting:'500003garbage'},400],['future observation',{observedAt:'2099-01-01T00:00:00Z'},400],['invalid calendar date',{observedAt:'2026-02-30T00:00:00Z'},400],['changed basis revision',{basisHash:'a'.repeat(64)},409],['a non-control point',{pointId:ids.noncontrol},404]]){
  const denied=await invoke(ids.owner,POST,'POST',{...input,...change});check(`${name} is rejected`,denied.response.status===status)
 }
 check('another account cannot write a project check',(await invoke(ids.other,POST,'POST',input)).response.status===403)
 const saved=await invoke(ids.owner,POST,'POST',input),checkId=saved.value.data?.id
 check('actual check compares 3-4-5 against explicit criteria with zero height',saved.response.status===201&&saved.value.data.result.horizontalDisplacement===5&&saved.value.data.result.deltaH===0&&saved.value.data.result.status==='within_declared_tolerance'&&saved.value.certified===false)
 const record=(await admin.query('SELECT * FROM control_field_checks WHERE id=$1',[checkId])).rows[0]
 check('full source, reference, observation and result evidence are retained',record.source_snapshot.elevation===0&&record.reference_snapshot.vertical_datum==='Synthetic BM'&&record.observation.evidenceReference===input.evidenceReference&&record.result.statisticalStabilityEstablished===false)
 const retry=await invoke(ids.owner,POST,'POST',input)
 check('identical retry returns the original evidence',retry.response.status===200&&retry.value.data.id===checkId&&retry.value.data.replayed===true)
 check('changed observation under one request conflicts',(await invoke(ids.owner,POST,'POST',{...input,notes:'changed'})).response.status===409)
 const loaded=await invoke(ids.owner,GET,'GET',undefined,`?projectId=${ids.project}`)
 check('private history reloads numeric zero and complete evidence',loaded.response.status===200&&loaded.response.headers.get('cache-control')==='private, no-store'&&loaded.value.data.checks.some(row=>row.id===checkId&&row.source_snapshot.elevation===0))
 const visual=await invoke(ids.owner,POST,'POST',{...input,requestId:randomUUID(),method:'visual',instrument:null,measuredEasting:null,measuredNorthing:null,measuredElevation:null,horizontalTolerance:null,verticalTolerance:null,toleranceReference:null})
 check('visual inspection does not claim a coordinate pass',visual.response.status===201&&visual.value.data.result.horizontalPass===null&&visual.value.data.result.status==='not_measured')
 const level=await invoke(ids.owner,POST,'POST',{...input,requestId:randomUUID(),method:'level',measuredEasting:null,measuredNorthing:null,horizontalTolerance:null,measuredElevation:0.02,verticalTolerance:0.01})
 check('height-only levelling compares a signed height residual',level.response.status===201&&level.value.data.result.deltaH===0.02&&level.value.data.result.horizontalPass===null&&level.value.data.result.status==='exceeds_declared_tolerance')
 const disturbed=await invoke(ids.owner,POST,'POST',{...input,requestId:randomUUID(),condition:'disturbed'})
 check('disturbed condition cannot become a usable mark merely by passing coordinates',disturbed.response.status===201&&disturbed.value.data.result.status==='unsuitable_condition')
 for(const [type,id]of [['beacon',ids.beacon],['boundary_monument',ids.monument]]){
  const sourceOptions=await invoke(ids.owner,GET,'GET',undefined,`?projectId=${ids.project}&pointType=${type}&options=true`),source=sourceOptions.value.data.marks.find(row=>row.id===id)
  const result=await invoke(ids.owner,POST,'POST',{...input,pointType:type,pointId:id,basisHash:source.basisHash,requestId:randomUUID()})
  check(`${type} uses its actual declared source record`,result.response.status===201&&result.value.data.result.deltaH===0)
 }
 const boundaryOptions=await invoke(ids.owner,GET,'GET',undefined,`?projectId=${ids.project}&pointType=boundary_monument&options=true`),legacy=boundaryOptions.value.data.marks.find(row=>row.id===ids.legacyMonument)
 check('legacy monument EPSG defaults do not establish an explicit basis',Boolean(legacy.issue)&&(await invoke(ids.owner,POST,'POST',{...input,pointType:'boundary_monument',pointId:legacy.id,basisHash:legacy.basisHash,requestId:randomUUID()})).response.status===409)
 const oldMine=await invoke(ids.owner,GET,'GET',undefined,'?legacy=true'),oldOther=await invoke(ids.other,GET,'GET',undefined,'?legacy=true')
 check('historical records are private and explicitly lack current evidence',oldMine.value.legacy===true&&oldMine.value.data.length===1&&oldOther.value.data.length===0)
 for(const [name,sql]of [['update','UPDATE control_field_checks SET result=result WHERE id=$1'],['delete','DELETE FROM control_field_checks WHERE id=$1']]){let denied=false;try{await admin.query(sql,[checkId])}catch{denied=true}check(`ordinary administrative DML cannot ${name} field evidence`,denied)}
 check('audit links the actual immutable check identity',(await admin.query("SELECT 1 FROM audit_logs WHERE table_name='control_field_checks' AND record_id=$1 AND user_id=$2",[checkId,ids.owner])).rowCount===1)
 for(const [label,column,json]of [['source','source_snapshot',JSON.stringify({...record.source_snapshot,easting:500001})],['reference','reference_snapshot',JSON.stringify({...record.reference_snapshot,vertical_datum:'Invented'})]]){
  let denied=false
  try{await admin.query(`INSERT INTO control_field_checks(project_id,actor_id,point_type,point_id,request_id,input_hash,source_snapshot,reference_snapshot,observation,result,observed_at) SELECT project_id,actor_id,point_type,point_id,$2,input_hash,${column==='source_snapshot'?'$3::jsonb':'source_snapshot'},${column==='reference_snapshot'?'$3::jsonb':'reference_snapshot'},observation,result,observed_at FROM control_field_checks WHERE id=$1`,[checkId,randomUUID(),json])}catch(error){denied=error.message.includes('exact')}
  check(`database trigger rejects a forged ${label} snapshot`,denied)
 }
 await admin.query(`CREATE FUNCTION synthetic_field_control_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${ids.owner}'::uuid AND NEW.table_name='control_field_checks' THEN RAISE EXCEPTION 'Synthetic field check audit failure'; END IF; RETURN NEW; END $$`)
 await admin.query('CREATE TRIGGER synthetic_field_control_audit_fault BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION synthetic_field_control_audit_fault()');fault=true
 const rollbackId=randomUUID(),failed=await invoke(ids.owner,POST,'POST',{...input,requestId:rollbackId})
 check('audit failure rolls back the entire field check',failed.response.status===500&&(await admin.query('SELECT 1 FROM control_field_checks WHERE request_id=$1',[rollbackId])).rowCount===0)
 await admin.query('DROP TRIGGER synthetic_field_control_audit_fault ON audit_logs');await admin.query('DROP FUNCTION synthetic_field_control_audit_fault()');fault=false
 const concurrentInput={...input,requestId:randomUUID()},concurrent=await Promise.all([invoke(ids.owner,POST,'POST',concurrentInput),invoke(ids.owner,POST,'POST',concurrentInput)])
 check('concurrent identical retries create one check and one replay',concurrent.map(row=>row.response.status).sort().join(',')==='200,201'&&(await admin.query('SELECT 1 FROM control_field_checks WHERE request_id=$1',[concurrentInput.requestId])).rowCount===1)
 const runtime=new pg.Client({connectionString:rehearsal.runtimeUrl});await runtime.connect()
 try{await runtime.query('BEGIN');await runtime.query("SELECT set_config('request.user_id',$1,true),set_config('app.current_user_id',$1,true)",[ids.other]);check('database RLS itself hides another project field evidence',(await runtime.query('SELECT 1 FROM control_field_checks WHERE id=$1',[checkId])).rowCount===0);check('database RLS itself hides another actor legacy evidence',(await runtime.query('SELECT 1 FROM control_point_verifications WHERE point_id=$1',[ids.point])).rowCount===0);await runtime.query('ROLLBACK')}finally{await runtime.end()}
 await admin.query("UPDATE project_reference_systems SET vertical_datum='Changed synthetic BM' WHERE project_id=$1",[ids.project])
 check('a real saved reference change invalidates the comparison form basis',(await invoke(ids.owner,POST,'POST',{...input,requestId:randomUUID()})).response.status===409)
 check('historical retry remains idempotent after its live reference changes',(await invoke(ids.owner,POST,'POST',input)).value.data.id===checkId)
 await admin.query('UPDATE survey_points SET easting=easting+1 WHERE id=$1',[ids.point])
 check('retained source evidence does not change with a later live coordinate edit',(await admin.query('SELECT source_snapshot FROM control_field_checks WHERE id=$1',[checkId])).rows[0].source_snapshot.easting===500000)
 completed=true
}finally{
 if(fault){await admin.query('DROP TRIGGER synthetic_field_control_audit_fault ON audit_logs');await admin.query('DROP FUNCTION synthetic_field_control_audit_fault()')}
 await mkdir('test-results/runtime-database',{recursive:true});await writeFile('test-results/runtime-database/field-control-checks.json',JSON.stringify({synthetic:true,providerSessionMocked:true,database:rehearsal.database,passed:completed&&checks.every(row=>row.passed),checks},null,2)+'\n')
 await getPool().end();if(seeded)await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[[ids.owner,ids.other]]);await admin.end()
}
