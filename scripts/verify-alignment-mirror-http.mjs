const declaredFixtureCrs32737 = 'EPSG:32737'
// Real source HTTP and native schema proof in the existing marked synthetic DB.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import {rehearsalDatabaseConfig} from './rehearsal-database.mjs'
import {collectFileMigrations,computeDrift} from './verify-migrations.mjs'
const config=rehearsalDatabaseConfig(),base='http://127.0.0.1:3021'
assert.equal(config.database,'metardu_runtime_verify');assert.equal(new URL(config.adminUrl).port,'55433')
const admin=new pg.Client({connectionString:config.adminUrl,connectionTimeoutMillis:5000,statement_timeout:30000})
const ownerId=randomUUID(),otherId=randomUUID(),projectId=randomUUID(),password=`synthetic-${randomUUID()}`
const checks=[],directory='.cache/release-verify/alignment-mirror-http'
const check=(name,passed)=>{checks.push({name,passed:Boolean(passed)});console.log(`${passed?'PASS':'FAIL'} ${name}`);assert.ok(passed,name)}
let marked=false,accountsCreated=false
function actor(){const cookies=new Map();return async(path,body,method)=>{
  const response=await fetch(base+path,{method:method||(body===undefined?'GET':'POST'),redirect:'manual',signal:AbortSignal.timeout(60000),
    headers:{Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookies.size?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
  return response
}}
async function signIn(email,id){
  // Credentials use the same cookie jar, with a form-encoded callback.
  const cookies=new Map()
  const request=async(path,options={})=>{const response=await fetch(base+path,{...options,redirect:'manual',signal:AbortSignal.timeout(60000),headers:{Origin:base,...options.headers,...(cookies.size?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{})}});for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}return response}
  const csrf=await(await request('/api/auth/csrf')).json()
  await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password,callbackUrl:base+'/dashboard',json:'true'})})
  assert.equal((await(await request('/api/auth/session')).json()).user?.id,id,'Source must authenticate this exact synthetic actor.')
  return async(path,body,method)=>request(path,{method:method||(body===undefined?'GET':'POST'),...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})})
}
async function call(client,path,body,method){const response=await client(path,body,method);const value=await response.json();return{response,value}}
await admin.connect()
try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08');marked=true
  const role=(await admin.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[config.runtimeRole])).rows[0];assert.ok(role&&!role.rolsuper&&!role.rolbypassrls)
  const files=collectFileMigrations(),before=(await admin.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows,drift=computeDrift(files,before)
  assert.equal(drift.mutated.length,0);assert.equal(drift.ghost.length,0)
  assert.ok(drift.missing.every(v=>v==='110_alignment_input_persistence'))
  const hash=await bcrypt.hash(password,10)
  await admin.query("INSERT INTO users(id,email,password_hash,full_name,role,email_verified) VALUES($1,$2,$3,'SYNTHETIC alignment operator','user',true),($4,$5,$3,'SYNTHETIC other alignment operator','user',true)",[ownerId,`${ownerId}@example.invalid`,hash,otherId,`${otherId}@example.invalid`]);accountsCreated=true
  await admin.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false),($2,'surveyor',false)",[ownerId,otherId])
  await admin.query("INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,'SYNTHETIC alignment mirror - NOT FIELD EVIDENCE','engineering')",[projectId,ownerId])
  await admin.query("INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by) VALUES($1,'EPSG:32737','Synthetic WGS84 UTM 37S','WGS84','metres',37,'S','Synthetic BM','local','grid',3,$2)",[projectId,ownerId])
  if(drift.missing.length){
    assert.ok(process.argv.includes('--prepare'),'Use --prepare only for the pending source fixture migration.')
    const sql=await readFile('src/lib/db/migrations/110_alignment_input_persistence.sql','utf8')
    await admin.query('BEGIN');let refused=false
    try{await admin.query("INSERT INTO road_alignments(project_id,road_name,cross_section_template) VALUES($1,'SYNTHETIC invalid migration fixture','not valid JSON')",[projectId]);await admin.query(sql)}catch(error){refused=error.code==='22P02'}finally{await admin.query('ROLLBACK')}
    check('invalid legacy template JSON blocks the exact candidate migration without discarding source data',refused)
    const migrated=spawnSync(process.execPath,['scripts/migrate-unified.mjs'],{env:{...process.env,DATABASE_URL:config.adminUrl},windowsHide:true,encoding:'utf8',maxBuffer:2*1024*1024})
    assert.equal(migrated.status,0,'Normal synthetic migration runner must pass; diagnostics withheld.')
  }
  const after=(await admin.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
  assert.ok(computeDrift(files,after).ok);for(const row of before)assert.equal(after.find(r=>r.version===row.version)?.checksum,row.checksum)
  check('normal synthetic migration preserves all historical checksums',true)
  const owner=await signIn(`${ownerId}@example.invalid`,ownerId),other=await signIn(`${otherId}@example.invalid`,otherId),anonymous=actor()
  check('source sessions authenticate exact private synthetic actors',true)
  check('anonymous alignment read requires sign-in',(await anonymous(`/api/engineering/alignment?project_id=${projectId}`)).status===401)
  const template={carriagewayWidth:6,shoulderWidth:1,shoulderCrossfall:0,camber:0,cutSlope:'2:1',fillSlope:'2:1',subgradeDepth:0}
  assert.ok(JSON.stringify(template).length>100)
  const header={project_id:projectId,road_name:'Synthetic Road',start_chainage:1000,design_speed:40,road_class:'C',cross_section_template:template,vertical_station_interval_m:20}
  const created=await call(owner,'/api/engineering/alignment',header)
  check('real header API saves a complete template beyond 100 characters',created.response.status===200&&created.value.data.cross_section_template.shoulderCrossfall===0)
  const alignmentId=created.value.data.id
  const canonical={mode:'road',standard:'KRDM2017',road:{roadName:header.road_name,startChainage:1000,datum:'WGS84',coordinateSystem:'EPSG:32737',designSpeed:40,roadClass:'C',crossSectionTemplate:template,ips:[{id:'source-PI',name:'PI',easting:100,northing:0,radius:20,fieldNote:'Retain this source note',tangentLength:999}],vips:[],stations:[]}}
  await admin.query('UPDATE projects SET engineering_data=$2::jsonb WHERE id=$1',[projectId,JSON.stringify(canonical)])
  check('header retains explicit sampling and authoritative CRS',Number(created.value.data.vertical_station_interval_m)===20&&created.value.data.coordinate_system===declaredFixtureCrs32737)
  const ips=[{source_id:'source-A',name:'A',easting:0,northing:0,radius:0},{source_id:'source-PI',name:'PI',easting:100,northing:0,radius:20},{source_id:'source-B',name:'B',easting:100,northing:100,radius:0}]
  const horizontal=await call(owner,'/api/engineering/ips',{alignment_id:alignmentId,ips})
  check('zero-radius endpoints and the middle PI survive real HTTP saving',horizontal.response.status===200&&horizontal.value.calculation.status==='ready'&&horizontal.value.data.length===3&&horizontal.value.data[0].tangent_length===null&&Math.abs(Number(horizontal.value.data[1].chainage_tc)-1080)<1e-9)
  const vipBody={alignment_id:alignmentId,replace:true,vips:[{source_id:'source-VIP',chainage:1000,reduced_level:0,k_value:null,curve_length:50}]}
  const stationBody={alignment_id:alignmentId,replace:true,stations:[{chainage:1000,ground_level:0,design_level:-1,design_level_source:'manual',ground_profile:[{offset:-10,level:0},{offset:0,level:0},{offset:10,level:0}]}]}
  check('canonical VIP API keeps zero RL, source identity and explicit curve length',(await call(owner,'/api/engineering/vips',vipBody)).value.data?.[0]?.source_id==='source-VIP')
  const stationSaved=await call(owner,'/api/engineering/stations',stationBody)
  check('canonical station API keeps measured profile and negative manual design RL',stationSaved.response.status===200&&stationSaved.value.data[0].existing_ground.profile.length===3&&stationSaved.value.data[0].proposed_road.designLevel===-1)
  const readPath=`/api/engineering/alignment?project_id=${projectId}&road_name=Synthetic%20Road`
  const reopened=await call(owner,readPath)
  check('reload reads exactly the canonical saved rows in route order',reopened.response.status===200&&reopened.value.data.ips.map(p=>p.source_id).join(',')==='source-A,source-PI,source-B'&&reopened.value.data.vips[0].source_id==='source-VIP'&&reopened.value.data.stations[0].proposed_road.designLevel===-1)
  check('private alignment and station responses cannot be shared-cache hits',reopened.response.headers.get('cache-control')==='private, no-store'&&(await owner(`/api/engineering/stations?alignment_id=${alignmentId}`)).headers.get('cache-control')==='private, no-store')
  const snapshot=async()=>JSON.stringify((await admin.query("SELECT (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM alignment_ips t WHERE alignment_id=$1) ips,(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM alignment_vertical_ips t WHERE alignment_id=$1) vips,(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM cross_section_stations t WHERE alignment_id=$1) stations",[alignmentId])).rows[0])
  const ownedBefore=await snapshot()
  for(const [name,path,body,method]of[
    ['header read',readPath,undefined],['station read',`/api/engineering/stations?alignment_id=${alignmentId}`,undefined],
    ['header write','/api/engineering/alignment',header],['IP write','/api/engineering/ips',{alignment_id:alignmentId,ips}],['VIP write','/api/engineering/vips',vipBody],['station write','/api/engineering/stations',stationBody],
    ['IP edit','/api/engineering/ips',{id:horizontal.value.data[1].id,radius:25},'PUT'],
    ['earthworks write','/api/engineering/earthworks',{alignment_id:alignmentId,client_run_id:randomUUID(),expected_input_hash:'a'.repeat(64)}],
  ])check(`foreign actor is denied ${name}`,[403,404].includes((await other(path,body,method)).status))
  check('all denied foreign calls preserve owned geometry and observations',await snapshot()===ownedBefore)
  const forged=await owner('/api/engineering/ips',{id:horizontal.value.data[1].id,tangent_length:999,chainage_tc:999},'PUT')
  check('caller-computed geometry is rejected without writes',forged.status===400&&await snapshot()===ownedBefore)
  const changed=await call(owner,'/api/engineering/ips',{id:horizontal.value.data[1].id,radius:30},'PUT')
  check('owned input edit recomputes route geometry and retains the row identity',changed.response.status===200&&changed.value.data.id===horizontal.value.data[1].id&&Number(changed.value.data.chainage_tc)===1070)
  const draft=(await admin.query('SELECT engineering_data FROM projects WHERE id=$1',[projectId])).rows[0].engineering_data
  check('direct API edits synchronize the canonical draft and preserve unrelated input metadata',draft.road.ips[1].radius===30&&draft.road.ips[1].fieldNote==='Retain this source note'&&!('tangentLength'in draft.road.ips[1])&&draft.road.stations[0].designLevel===-1&&draft.road.vips[0].curveLength===50)
  const spiralled=await call(owner,'/api/engineering/ips',{id:horizontal.value.data[1].id,has_transition:true,transition_length_in:10,transition_length_out:10},'PUT')
  check('transition inputs produce explicit TS/SC/CS/ST with no mislabeled TC/CT',spiralled.response.status===200&&spiralled.value.calculation.status==='ready'&&spiralled.value.data.chainage_tc===null&&spiralled.value.data.spiral_parameters.chainage_ts<spiralled.value.data.spiral_parameters.chainage_sc&&spiralled.value.data.spiral_parameters.chainage_cs<spiralled.value.data.spiral_parameters.chainage_st)
  const unsupported=await call(owner,'/api/engineering/ips',{id:horizontal.value.data[1].id,transition_length_out:12},'PUT')
  check('unsupported asymmetric draft retains raw lengths and clears stale computed truth',unsupported.response.status===200&&unsupported.value.calculation.status==='needs-review'&&Number(unsupported.value.data.transition_length_out)===12&&unsupported.value.data.tangent_length===null)
  const cleared=await call(owner,'/api/engineering/ips',{alignment_id:alignmentId,ips:[]})
  check('explicit empty horizontal snapshot clears rows with retained history',cleared.response.status===200&&cleared.value.data.length===0&&(await admin.query("SELECT count(*)::int n FROM design_revisions WHERE project_id=$1 AND entity_type='alignment-horizontal' AND payload::text LIKE '%source-PI%'",[projectId])).rows[0].n>0)
  check('removed input notes remain in immutable pre-edit history',(await admin.query("SELECT count(*)::int n FROM design_revisions WHERE project_id=$1 AND entity_type='alignment-horizontal' AND payload->>'phase'='before' AND payload::text LIKE '%Retain this source note%'",[projectId])).rows[0].n>0)
  check('explicit empty VIP snapshot clears removed rows',(await call(owner,'/api/engineering/vips',{alignment_id:alignmentId,replace:true,vips:[]})).value.data?.length===0)
  check('explicit empty station snapshot clears removed rows',(await call(owner,'/api/engineering/stations',{alignment_id:alignmentId,replace:true,stations:[]})).value.data?.length===0)
  const extra=await call(owner,'/api/engineering/alignment',{...header,road_name:'Synthetic second alignment'})
  check('multiple saved alignments are retained instead of overwriting another road',extra.response.status===200&&extra.value.data.id!==alignmentId)
  check('ambiguous project-only reload requires an explicit road selection',(await owner(`/api/engineering/alignment?project_id=${projectId}`)).status===409)
  check('selected reload still returns the correct original alignment',(await call(owner,readPath)).value.data.id===alignmentId)
  await mkdir(directory,{recursive:true});await writeFile(`${directory}/result.json`,JSON.stringify({base,database:config.database,projectId,checks,productionMutated:false,newContainersCreated:false,physicalInstrumentTested:false,sourceSnapshotOnly:true},null,2))
}finally{
  await mkdir(directory,{recursive:true});await writeFile(`${directory}/latest-attempt.json`,JSON.stringify({base,database:config.database,projectId,checks,productionMutated:false,physicalInstrumentTested:false},null,2))
  if(marked&&accountsCreated)await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[[ownerId,otherId]])
  await admin.end()
}
