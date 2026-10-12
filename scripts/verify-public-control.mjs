#!/usr/bin/env node
import assert from 'node:assert/strict'
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
import { RUNTIME_ROLE_QUERY,runtimeDatabaseRoleFailure } from './verify-migrations.mjs'
const rehearsal=rehearsalDatabaseConfig()
Object.assign(process.env,{DATABASE_URL:rehearsal.runtimeUrl,AUTH_SECRET:'synthetic-public-control-only',NODE_ENV:'test',DB_POOL_MAX:'2'})
const require=createRequire(import.meta.url),Module=require('node:module'),ts=require('typescript'),sessions=new AsyncLocalStorage(),load=Module._load
Module._load=function(request,parent,...args){if(request==='next-auth')return {getServerSession:async()=>sessions.getStore()??null};return load.call(this,request.startsWith('@/')?path.join(process.cwd(),'src',request.slice(2)):request,parent,...args)}
Module._extensions['.ts']=function(module,file){module._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file)}
const {getPool}=require('../src/lib/db.ts'),{GET,POST}=require('../src/app/api/public-beacons/route.ts'),{POST:review}=require('../src/app/api/public-beacons/[id]/review/route.ts'),{POST:importControl}=require('../src/app/api/public-beacons/[id]/import/route.ts'),{NextRequest}=require('next/server')
const {GET:reviewQueue}=require('../src/app/api/public-beacons/review-queue/route.ts'),{GET:history}=require('../src/app/api/project/[id]/control-imports/route.ts')
const {GET:pointGET,POST:pointPOST}=require('../src/app/api/project/[id]/points/route.ts')
const admin=new pg.Client({connectionString:rehearsal.adminUrl}),ids={owner:randomUUID(),other:randomUUID(),reviewer:randomUUID(),project:randomUUID(),wrong:randomUUID(),vertical:randomUUID(),legacy:randomUUID(),rollback:randomUUID()}
const checks=[],check=(name,value)=>{checks.push({name,passed:Boolean(value)});console.log(`${value?'PASS':'FAIL'} ${name}`);assert.ok(value,name)}
async function invoke(user,handler,method='POST',body,query='',id){const resource=new AsyncResource('PUBLIC_CONTROL_TEST');try{return await resource.runInAsyncScope(()=>sessions.run(user?{user:{id:user,email:`control-${user}@example.invalid`,name:'Synthetic control operator',role:user===ids.reviewer?'admin':'user'}}:null,async()=>{const request=new NextRequest(`http://localhost/api/public-beacons${id?`/${id}`:''}${query}`,{method,headers:{'Content-Type':'application/json','x-real-ip':'192.0.2.218'},...(body?{body:JSON.stringify(body)}:{})});const response=await handler(request,{params:{...(id?{id}: {})}});return {response,value:await response.json()}}))}finally{resource.emitDestroy()}}
let seeded=false,fault=false,sourceId
const input={name:`SYN-CATALOG-${ids.owner}`,beaconType:'control',easting:500000.01234,northing:9800000.05678,elevation:0,horizontalCrs:'EPSG:21037',verticalDatum:'Synthetic BM',sourceReference:'Synthetic publication TEST-ONLY; not official survey evidence',authority:'Synthetic publisher',country:'Kenya'}
await admin.connect()
try{
 check('catalogue uses a restricted runtime database login',runtimeDatabaseRoleFailure((await getPool().query(RUNTIME_ROLE_QUERY)).rows[0])===null)
 for(const id of [ids.owner,ids.other,ids.reviewer]){await admin.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'synthetic-no-login','Synthetic catalogue test')",[id,`control-${id}@example.invalid`]);await admin.query('INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,$2,false)',[id,id===ids.reviewer?'admin':'surveyor'])}seeded=true
 for(const id of [ids.project,ids.wrong,ids.vertical,ids.legacy,ids.rollback])await admin.query("INSERT INTO projects(id,user_id,name) VALUES($1,$2,'SYNTHETIC control catalogue test')",[id,ids.owner])
 for(const [id,crs,datum]of [[ids.project,'EPSG:21037','Synthetic BM'],[ids.wrong,'EPSG:32737','Synthetic BM'],[ids.vertical,'EPSG:21037','Other BM'],[ids.rollback,'EPSG:21037','Synthetic BM']])await admin.query("INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by) VALUES($1,$2,'Synthetic grid','ARC1960','metres',37,'S',$3,'local','grid',3,$4)",[id,crs,datum,ids.owner])
 check('anonymous catalogue access is denied',(await invoke(null,GET,'GET')).response.status===401)
 for(const change of [{horizontalCrs:'EPSG:3857'},{verticalDatum:null},{status:'verified'},{sourceReference:''}])check(`invalid submission ${JSON.stringify(change)} rejected`,(await invoke(ids.owner,POST,'POST',{...input,...change})).response.status===400)
 const submitted=await invoke(ids.owner,POST,'POST',input);sourceId=submitted.value.data?.beacon.id
 check('real submission creates pending explicit reference and zero height',submitted.response.status===201&&submitted.value.data.beacon.status==='pending'&&submitted.value.data.beacon.elevation===0)
 check('pending records are absent from the reviewed catalogue',(await invoke(ids.other,GET,'GET',undefined,`?q=${input.name}`)).value.data.beacons.length===0)
 check('submitter can inspect pending record without exposing another account mine view',(await invoke(ids.owner,GET,'GET',undefined,`?mine=true&q=${input.name}`)).value.data.beacons.length===1&&(await invoke(ids.other,GET,'GET',undefined,`?mine=true&q=${input.name}`)).value.data.beacons.length===0)
 const importBody={projectId:ids.project,requestId:randomUUID(),pointName:`SYN-CTRL-${ids.owner}`}
 check('an unreviewed source cannot become imported control',(await invoke(ids.owner,importControl,'POST',importBody,'',sourceId)).response.status===409)
 check('an ordinary submitter cannot approve a catalogue source',(await invoke(ids.owner,review,'POST',{decision:'verified',reason:'Synthetic review'},'',sourceId)).response.status===403)
 const ownAdminSource=(await invoke(ids.reviewer,POST,'POST',{...input,name:`SYN-SELF-${ids.reviewer}`})).value.data.beacon.id
 check('admin self-review is rejected',(await invoke(ids.reviewer,review,'POST',{decision:'verified',reason:'Synthetic review'},'',ownAdminSource)).response.status===403)
 check('review queue rejects a non-reviewer',(await invoke(ids.owner,reviewQueue,'GET')).response.status===403)
 const queued=await invoke(ids.reviewer,reviewQueue,'GET')
 check('review queue returns other submissions and excludes self-review',queued.response.status===200&&queued.value.data.beacons.some(row=>row.id===sourceId)&&queued.value.data.beacons.every(row=>row.id!==ownAdminSource))
 const reviewed=await invoke(ids.reviewer,review,'POST',{decision:'verified',reason:'Synthetic independent catalogue review; no field verification'},'',sourceId)
 check('independent review commits a source snapshot and reviewed status',reviewed.response.status===201&&reviewed.value.data.status==='verified'&&reviewed.value.data.fieldVerified===false)
 const near=await invoke(ids.other,GET,'GET',undefined,`?q=${input.name}&easting=500000.01234&northing=9800000.05678&crs=EPSG:21037&radius=0&limit=1`)
 check('reviewed same-grid search returns exact grid distance without actor IDs',near.response.status===200&&near.value.data.beacons.length===1&&near.value.data.beacons[0].distance_m===0&&near.value.data.beacons[0].submitted_by===undefined&&near.response.headers.get('cache-control')==='private, no-store')
 check('a coincident search point does not invent a north bearing',near.value.data.beacons[0].bearing_deg===null&&near.value.data.beacons[0].bearing_dms===null)
 const eastward=await invoke(ids.other,GET,'GET',undefined,`?q=${input.name}&easting=${input.easting-1}&northing=${input.northing}&crs=EPSG:21037&radius=2&limit=1`)
 check('shared engineering engine supplies a real eastward grid bearing',eastward.response.status===200&&eastward.value.data.beacons[0].distance_m===1&&eastward.value.data.beacons[0].bearing_deg===90&&eastward.value.data.beacons[0].bearing_dms.startsWith('90'))
 check('nearby search excludes another grid',(await invoke(ids.owner,GET,'GET',undefined,`?q=${input.name}&easting=500000&northing=9800000&crs=EPSG:32737`)).value.data.beacons.length===0)
 check('nearby search cannot infer missing grid',(await invoke(ids.owner,GET,'GET',undefined,'?easting=500000&northing=9800000')).response.status===400)
 for(const [actor,projectId,status,message]of [[ids.other,ids.project,403,'owned project'],[ids.owner,ids.wrong,409,'horizontal grids'],[ids.owner,ids.vertical,409,'height datum'],[ids.owner,ids.legacy,409,'Declare the project']]){const failed=await invoke(actor,importControl,'POST',{...importBody,projectId},'',sourceId);check(`invalid project import ${projectId} denied for its actual reference/access reason`,failed.response.status===status&&failed.value.error.includes(message))}
 const imported=await invoke(ids.owner,importControl,'POST',importBody,'',sourceId),captureId=imported.value.data?.captureId,pointId=imported.value.data?.pointId
 check('real control import creates immutable provenance without a field claim',imported.response.status===201&&imported.value.data.fieldVerified===false&&imported.value.data.lockedSourceCoordinates===true)
 const point=(await admin.query('SELECT * FROM survey_points WHERE id=$1',[pointId])).rows[0],capture=(await admin.query('SELECT * FROM control_import_captures WHERE id=$1',[captureId])).rows[0]
 check('import preserves five-decimal source coordinates, zero height and declared grid',Number(point.easting)===input.easting&&Number(point.northing)===input.northing&&Number(point.elevation)===0&&point.horizontal_crs===input.horizontalCrs&&point.vertical_datum===input.verticalDatum&&point.source==='imported'&&point.std_dev_e===null)
 const serialized=await invoke(ids.owner,pointGET,'GET',undefined,'',ids.project),visiblePoint=serialized.value.data.find(row=>row.id===pointId)
 check('actual point reader exposes numeric XY and zero height for the control UI',serialized.response.status===200&&typeof visiblePoint.easting==='number'&&visiblePoint.easting===input.easting&&typeof visiblePoint.northing==='number'&&visiblePoint.elevation===0&&visiblePoint.horizontal_crs===input.horizontalCrs)
 check('full source and declared project reference are captured',capture.source_snapshot.source_reference===input.sourceReference&&capture.source_snapshot.easting===input.easting&&capture.project_reference_snapshot.horizontal_crs===input.horizontalCrs)
 const replay=await invoke(ids.owner,importControl,'POST',importBody,'',sourceId)
 check('identical import retry returns the same record',replay.response.status===200&&replay.value.data.replayed&&replay.value.data.captureId===captureId&&replay.value.data.pointId===pointId)
 check('changed import under same request conflicts',(await invoke(ids.owner,importControl,'POST',{...importBody,pointName:'Changed synthetic name'},'',sourceId)).response.status===409)
 check('a second request cannot duplicate source control',(await invoke(ids.owner,importControl,'POST',{...importBody,requestId:randomUUID()},'',sourceId)).response.status===409)
 for(const [label,sql,values]of [['source coordinate','UPDATE public_beacons SET northing=northing+1 WHERE id=$1',[sourceId]],['imported point','UPDATE survey_points SET easting=easting+1 WHERE id=$1',[pointId]],['capture','DELETE FROM control_import_captures WHERE id=$1',[captureId]],['review','DELETE FROM public_beacon_reviews WHERE beacon_id=$1',[sourceId]]]){let denied=false;try{await admin.query(sql,values)}catch{denied=true}check(`ordinary DML cannot rewrite ${label}`,denied)}
 check('import audit is linked to actual saved point',(await admin.query("SELECT 1 FROM audit_logs WHERE table_name='survey_points' AND record_id=$1 AND user_id=$2",[pointId,ids.owner])).rowCount===1)
 const loaded=await invoke(ids.owner,history,'GET',undefined,'',ids.project)
 check('owned import history reloads the full private source evidence',loaded.response.status===200&&loaded.response.headers.get('cache-control')==='private, no-store'&&loaded.value.data.captures[0].id===captureId&&loaded.value.data.captures[0].source_snapshot.elevation===0)
 check('another account cannot read the project capture history',(await invoke(ids.other,history,'GET',undefined,'',ids.project)).response.status===404)
 const manualBody={pointName:`SYN-MANUAL-${ids.owner}`,easting:500001.01234,northing:9800001.05678,elevation:0,isControl:true}
 const manual=await invoke(ids.owner,pointPOST,'POST',manualBody,'',ids.project)
 check('manual control registration preserves numeric coordinates, zero and declared references',manual.response.status===201&&manual.value.data.easting===manualBody.easting&&manual.value.data.elevation===0&&manual.value.data.horizontal_crs===input.horizontalCrs&&manual.value.fieldVerified===false)
 check('manual coordinates require a saved project declaration',(await invoke(ids.owner,pointPOST,'POST',manualBody,'',ids.legacy)).response.status===400)
 check('manual duplicate names conflict',(await invoke(ids.owner,pointPOST,'POST',manualBody,'',ids.project)).response.status===409)
 check('manual coordinate parsing rejects numeric strings with trailing characters',(await invoke(ids.owner,pointPOST,'POST',{...manualBody,easting:'500000garbage'},'',ids.project)).response.status===400)
 await admin.query(`CREATE FUNCTION synthetic_control_import_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${ids.owner}'::uuid AND NEW.table_name='survey_points' AND NEW.action='import' THEN RAISE EXCEPTION 'Synthetic control import audit failure'; END IF; RETURN NEW; END $$`)
 await admin.query('CREATE TRIGGER synthetic_control_import_audit_fault BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION synthetic_control_import_audit_fault()');fault=true
 const rollbackBody={...importBody,projectId:ids.rollback,requestId:randomUUID(),pointName:`SYN-ROLLBACK-${ids.owner}`},failed=await invoke(ids.owner,importControl,'POST',rollbackBody,'',sourceId)
 check('failed import audit rolls back both the point and its capture',failed.response.status===500&&(await admin.query('SELECT 1 FROM survey_points WHERE project_id=$1',[ids.rollback])).rowCount===0&&(await admin.query('SELECT 1 FROM control_import_captures WHERE project_id=$1',[ids.rollback])).rowCount===0)
 await admin.query('DROP TRIGGER synthetic_control_import_audit_fault ON audit_logs');await admin.query('DROP FUNCTION synthetic_control_import_audit_fault()');fault=false
 const concurrent=await Promise.all([invoke(ids.owner,importControl,'POST',{...rollbackBody,requestId:randomUUID()},'',sourceId),invoke(ids.owner,importControl,'POST',{...rollbackBody,requestId:randomUUID()},'',sourceId)])
 check('concurrent source imports commit one point and return one conflict',concurrent.map(value=>value.response.status).sort().join(',')==='201,409'&&(await admin.query('SELECT 1 FROM control_import_captures WHERE project_id=$1',[ids.rollback])).rowCount===1)
}finally{
 if(fault){await admin.query('DROP TRIGGER synthetic_control_import_audit_fault ON audit_logs');await admin.query('DROP FUNCTION synthetic_control_import_audit_fault()')}
 await mkdir('test-results/runtime-database',{recursive:true});await writeFile('test-results/runtime-database/public-control.json',JSON.stringify({synthetic:true,providerSessionMocked:true,database:rehearsal.database,passed:checks.length>=30&&checks.every(c=>c.passed),checks},null,2)+'\n')
 await getPool().end();if(seeded)await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[[ids.owner,ids.other,ids.reviewer]]);await admin.end()
}
