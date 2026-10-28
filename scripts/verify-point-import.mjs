const declaredFixtureCrs32737 = 'EPSG:32737'
// Real PostgreSQL + HTTP checks against the existing loopback synthetic preview.
// No customer database, application container, browser storage or email access.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import {rehearsalDatabaseConfig} from './rehearsal-database.mjs'

const config=rehearsalDatabaseConfig(),base='http://127.0.0.1:3021'
assert.equal(config.database,'metardu_runtime_verify')
const admin=new pg.Client({connectionString:config.adminUrl,connectionTimeoutMillis:5000})
const owner=randomUUID(),other=randomUUID(),project=randomUUID(),requestId=randomUUID(),rollbackId=randomUUID()
const label='SYNTHETIC coordinate import acceptance',password=`synthetic-${randomUUID()}`
const email=id=>`point-import-${id}@example.invalid`,captures=[]
const trigger=`qa_import_${rollbackId.replaceAll('-','')}`,checks=[]
const report={base,synthetic:true,customerRecordsChanged:false,checks,status:'checking',cleanup:false,project,users:[owner,other]}
mkdirSync('.cache/point-import',{recursive:true})
const save=()=>writeFileSync('.cache/point-import/http.json',JSON.stringify(report,null,2)+'\n')
const check=(name,condition=true)=>{assert.ok(condition,name);checks.push({name,passed:true});save();console.log('PASS '+name)}
const actor=()=>{
  const cookies=new Map()
  return async(path,{body,form=false,method}={})=>{
    const response=await fetch(base+path,{redirect:'manual',method:method??(body===undefined?'GET':'POST'),signal:AbortSignal.timeout(90000),
      headers:{Origin:base,...(body===undefined?{}:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'}),...(cookies.size?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{})},
      ...(body===undefined?{}:{body:form?new URLSearchParams(body).toString():JSON.stringify(body)})})
    for(const item of response.headers.getSetCookie()){const pair=item.split(';',1)[0],index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1))}
    const text=new TextDecoder('utf-8',{ignoreBOM:true}).decode(await response.arrayBuffer());let data=null;try{data=JSON.parse(text)}catch{}
    return {response,data,text}
  }
}
const login=async id=>{
  const request=actor(),csrf=await request('/api/auth/csrf');assert.ok(csrf.data?.csrfToken)
  await request('/api/auth/callback/credentials',{form:true,body:{csrfToken:csrf.data.csrfToken,email:email(id),password,callbackUrl:base+'/import',json:'true'}})
  assert.equal((await request('/api/auth/session')).data?.user?.id,id)
  return request
}
const source='\uFEFFid,easting,northing,elevation,code\nNULL-H,500000,9850000,,EDGE\nZERO-H,500010,9850010,0,"Road, centre"'
const bodyFor=(text,id=requestId)=>({requestId:id,fileName:'synthetic-points.csv',sourceText:text,fileSize:Buffer.byteLength(text),sourceFileHash:createHash('sha256').update(text).digest('hex'),
  selectedIndices:[0,1],options:{},sourceCrs:'EPSG:32737',coordinateUnit:'metres',heightUnit:'metres',expectedReferenceHash:'',confirmTransformation:false,confirmVerticalDatum:true,confirmWarnings:false})
const counts=async(id=project)=>(await admin.query(`SELECT
  (SELECT count(*)::int FROM survey_points WHERE project_id=$1) points,
  (SELECT count(*)::int FROM import_sessions WHERE project_id=$1) sessions,
  (SELECT count(*)::int FROM observation_batches WHERE project_id=$1) batches`,[id])).rows[0]
let seeded=false,triggerCreated=false
await admin.connect();save()
try {
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0]?.marker,'METARDU synthetic beacon verification only 2026-10-08')
  await admin.query('BEGIN')
  for(const id of [owner,other]){
    await admin.query("INSERT INTO users(id,email,password_hash,full_name,email_verified) VALUES($1,$2,$3,$4,true)",[id,email(id),await bcrypt.hash(password,10),label])
    await admin.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)",[id])
  }
  await admin.query("INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,$3,'engineering')",[project,owner,label])
  await admin.query("INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by) VALUES($1,'EPSG:32737','SYNTHETIC WGS84 UTM 37S','WGS84','metres',37,'S','SYNTHETIC BM','local','grid',3,$2)",[project,owner])
  await admin.query('COMMIT');seeded=true
  const owned=await login(owner),foreign=await login(other),path=`/api/project/${project}/point-imports`
  check('both disposable users authenticate with normal credential sessions')
  const context=await owned(path)
  check('owner reference snapshot and empty history load privately',context.response.status===200&&context.data?.data?.history.length===0&&context.response.headers.get('cache-control')==='private, no-store')
  const body={...bodyFor(source),expectedReferenceHash:context.data.data.referenceHash}
  check('anonymous cannot inspect a coordinate capture',(await actor()(path)).response.status===401)
  check('foreign owner cannot inspect or commit this project',(await foreign(path)).response.status===404&&(await foreign(path,{body})).response.status===404)
  check('source mismatch fails before any points are written',(await owned(path,{body:{...body,sourceFileHash:'f'.repeat(64)}})).response.status===400)
  check('changed project reference refuses a stale review',(await owned(path,{body:{...body,expectedReferenceHash:'f'.repeat(64)}})).response.status===409)
  assert.deepEqual(await counts(),{points:0,sessions:0,batches:0})
  const first=await owned(path,{body})
  assert.equal(first.response.status,201,JSON.stringify(first.data));captures.push(first.data.data.batchId)
  const receipt=first.data.data
  check('actual HTTP commit acknowledges exact selected records and durable point IDs',receipt.requestId===requestId&&receipt.imported===2&&new Set(receipt.pointIds).size===2&&receipt.fieldVerified===false)
  const points=(await admin.query('SELECT point_name,easting,northing,elevation,horizontal_crs,vertical_datum,ST_X(geom) lon,ST_Y(geom) lat FROM survey_points WHERE project_id=$1 ORDER BY point_name',[project])).rows
  check('unknown height is SQL NULL while explicit zero remains zero',points[0].point_name==='NULL-H'&&points[0].elevation===null&&Number(points[1].elevation)===0&&points[0].vertical_datum===null)
  check('coordinates and WGS84 geometry persist in the declared reference',Number(points[0].easting)===500000&&Number(points[0].northing)===9850000&&points[0].horizontal_crs===declaredFixtureCrs32737&&Math.abs(points[0].lon-39)<1e-8&&points[0].lat<0)
  const download=await owned(path+`?source=${requestId}`)
  check('source download preserves the exact original bytes including BOM',download.response.status===200&&createHash('sha256').update(download.text).digest('hex')===body.sourceFileHash)
  const retained=(await admin.query('SELECT quality_metadata,source_file_hash FROM observation_batches WHERE id=$1',[requestId])).rows[0]
  check('source capture binds exact source, selection, reference and raw values',retained.quality_metadata.sourceText===source&&retained.source_file_hash===body.sourceFileHash&&retained.quality_metadata.points[0].raw.elevation===null&&retained.quality_metadata.fieldVerified===false)
  const retries=await Promise.all([owned(path,{body}),owned(path,{body}),owned(path,{body:{...body,requestId:randomUUID()}})])
  check('concurrent same-ID and new-ID retries replay the original capture',retries.every(result=>result.response.status===200&&result.data.data.replayed&&result.data.data.batchId===requestId))
  assert.deepEqual(await counts(),{points:2,sessions:1,batches:1})
  check('changed settings with a reused request ID fail instead of creating another copy',(await owned(path,{body:{...body,coordinateUnit:'internationalFoot'}})).response.status===409)
  const duplicate=bodyFor(source.replace('Road, centre','Different source'),randomUUID());duplicate.expectedReferenceHash=body.expectedReferenceHash
  check('existing point names reject the entire new capture',(await owned(path,{body:duplicate})).response.status===409)
  // Scoped failure after survey_points INSERT proves native transaction rollback.
  await admin.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${rollbackId}'::uuid THEN RAISE EXCEPTION 'Synthetic capture write failure'; END IF; RETURN NEW; END $$`)
  await admin.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON observation_batches FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);triggerCreated=true
  const rollbackBody=bodyFor(source.replace('NULL-H','ROLLBACK-A').replace('ZERO-H','ROLLBACK-B'),rollbackId);rollbackBody.expectedReferenceHash=body.expectedReferenceHash
  const failed=await owned(path,{body:rollbackBody})
  check('a later capture failure rolls back points and session atomically',failed.response.status===500)
  assert.deepEqual(await counts(),{points:2,sessions:1,batches:1})
  const largeText='id,easting,northing,elevation\n'+Array.from({length:501},(_,i)=>`CHUNK-${i},${500100+i},9850000,`).join('\n')
  const large=bodyFor(largeText,randomUUID());large.selectedIndices=Array.from({length:501},(_,i)=>i);large.expectedReferenceHash=body.expectedReferenceHash
  const chunked=await owned(path,{body:large})
  assert.equal(chunked.response.status,201,JSON.stringify(chunked.data));captures.push(chunked.data.data.batchId)
  check('multiple SQL chunks acknowledge all 501 points without truncation',chunked.data.data.imported===501&&new Set(chunked.data.data.pointIds).size===501)
  assert.deepEqual(await counts(),{points:503,sessions:2,batches:2})
  if(process.argv.includes('--keep-browser-fixture')){
    writeFileSync('.cache/point-import/browser-fixture.json',JSON.stringify({base,project,owner,email:email(owner),password,synthetic:true})+'\n')
    report.browserFixtureActive=true
  }
  report.status='passed'
} catch(error){report.status='failed';report.failure=error.message;throw error}
finally {
  await admin.query('ROLLBACK').catch(()=>{})
  if(triggerCreated)await admin.query(`DROP TRIGGER ${trigger} ON observation_batches`)
  await admin.query(`DROP FUNCTION IF EXISTS ${trigger}()`)
  if(seeded&&!report.browserFixtureActive){
    assert.equal((await admin.query('DELETE FROM projects WHERE id=$1 AND user_id=$2 AND name=$3 RETURNING id',[project,owner,label])).rowCount,1)
    assert.equal((await admin.query('DELETE FROM users WHERE id=ANY($1::uuid[]) AND full_name=$2 RETURNING id',[[owner,other],label])).rowCount,2)
    assert.deepEqual(await counts(),{points:0,sessions:0,batches:0});report.cleanup=true
  }
  await admin.end();save()
}
