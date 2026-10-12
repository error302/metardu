import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir,writeFile } from 'node:fs/promises'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
const rehearsal=rehearsalDatabaseConfig(),base='http://localhost:3009'
assert.equal(rehearsal.database,'metardu_runtime_verify')
const keep=process.argv.includes('--keep-browser-fixture'),admin=new pg.Client({connectionString:rehearsal.adminUrl,connectionTimeoutMillis:5000})
const ownerId=randomUUID(),otherId=randomUUID(),password=`synthetic-${randomUUID()}`,email=id=>`field-http-${id}@example.invalid`
const checks=[],check=(name,value)=>{checks.push({name,passed:Boolean(value)});console.log(`${value?'PASS':'FAIL'} ${name}`);assert.ok(value,name)}
function sessionClient(){const cookies=new Map();return async(path,options={})=>{const response=await fetch(base+path,{...options,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{...options.headers,...(cookies.size?{Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')}:{})}});for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],split=pair.indexOf('=');cookies.set(pair.slice(0,split),pair.slice(split+1))}return response}}
async function login(id){const request=sessionClient(),csrf=await(await request('/api/auth/csrf')).json();await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.csrfToken,email:email(id),password,callbackUrl:base+'/tools/control-point-verification',json:'true'})});assert.equal((await(await request('/api/auth/session')).json()).user?.id,id);return request}
async function json(request,path,body,method='POST'){const response=await request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{response,value:await response.json()}}
let seeded=false,passed=false,projectId,pointId
await admin.connect()
try{
 const marker=(await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0]?.marker
 assert.equal(marker,'METARDU synthetic beacon verification only 2026-10-08')
 for(const id of [ownerId,otherId]){await admin.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,$3,'Synthetic field HTTP verification')",[id,email(id),await bcrypt.hash(password,10)]);await admin.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)",[id])}seeded=true
 const owner=await login(ownerId),other=await login(otherId);check('two real password sessions work',true)
 const project=await json(owner,'/api/projects',{name:'SYNTHETIC field control HTTP project',survey_type:'engineering'});projectId=project.value.data?.id
 check('owned project creation succeeds',project.response.status===201&&typeof projectId==='string')
 const reference=await json(owner,`/api/project/${projectId}/reference-system`,{horizontalCrs:'EPSG:21037',datum:'ARC1960',units:'metres',utmZone:37,hemisphere:'S',verticalDatum:'Synthetic BM',verticalReference:'local',distanceMode:'grid',coordinatePrecision:3},'PUT')
 check('project reference is saved',reference.response.status===200)
 const point=await json(owner,`/api/project/${projectId}/points`,{pointName:'SYN-FIELD-CONTROL',easting:500000,northing:9800000,elevation:0,isControl:true});pointId=point.value.data?.id
 check('current control point with zero height is registered',point.response.status===201&&point.value.data.elevation===0&&point.value.fieldVerified===false)
 const options=await owner(`/api/control-points/verifications?projectId=${projectId}&options=true`),marks=await options.json(),mark=marks.data?.marks.find(row=>row.id===pointId)
 check('saved numeric basis and combined reference hash load privately',options.status===200&&options.headers.get('cache-control')==='private, no-store'&&mark?.elevation===0&&mark.basisHash.length===64&&!mark.issue)
 const input={projectId,pointId,pointType:'survey_point',basisHash:mark.basisHash,requestId:randomUUID(),observedAt:'2026-10-08T08:00:00Z',condition:'good',method:'total_station',instrument:'Synthetic TS',evidenceReference:'Synthetic field book HTTP page 1',measuredEasting:500000,measuredNorthing:9800000,measuredElevation:0,horizontalTolerance:0.01,verticalTolerance:0,toleranceReference:'Synthetic engineering job specification',notes:''}
 check('foreign account cannot write field evidence',(await json(other,'/api/control-points/verifications',input)).response.status===403)
 const saved=await json(owner,'/api/control-points/verifications',input),id=saved.value.data?.id
 check('zero residual is compared without automatic certification',saved.response.status===201&&saved.value.data.result.horizontalDisplacement===0&&saved.value.data.result.deltaH===0&&saved.value.certified===false)
 const dbRecord=(await admin.query('SELECT * FROM control_field_checks WHERE id=$1',[id])).rows[0]
 check('packaged write retains full source and project evidence',dbRecord.source_snapshot.elevation===0&&dbRecord.reference_snapshot.vertical_datum==='Synthetic BM'&&dbRecord.observation.evidenceReference===input.evidenceReference)
 const replay=await json(owner,'/api/control-points/verifications',input)
 check('lost-response retry returns the same immutable record',replay.response.status===200&&replay.value.data.id===id&&replay.value.data.replayed)
 check('changed retry evidence conflicts',(await json(owner,'/api/control-points/verifications',{...input,notes:'changed'})).response.status===409)
 check('malformed observed coordinate is rejected',(await json(owner,'/api/control-points/verifications',{...input,requestId:randomUUID(),measuredEasting:'500000garbage'})).response.status===400)
 check('invented published basis is rejected',(await json(owner,'/api/control-points/verifications',{...input,requestId:randomUUID(),published_easting:500000})).response.status===400)
 const history=await owner(`/api/control-points/verifications?projectId=${projectId}`),historyData=await history.json()
 check('owner reloads actual zero residual in private history',history.status===200&&historyData.data.checks.some(row=>row.id===id&&row.result.horizontalDisplacement===0)&&history.headers.get('cache-control')==='private, no-store')
 check('foreign account cannot read the project history',(await other(`/api/control-points/verifications?projectId=${projectId}`)).status===403)
 const page=await owner('/tools/control-point-verification')
 check('packaged field-check page renders the canonical workflow',page.status===200&&(await page.text()).includes('Field control checks'))
 passed=true
 if(keep){await mkdir('.cache/release-verify',{recursive:true});await writeFile('.cache/release-verify/field-control-browser-fixture.json',JSON.stringify({synthetic:true,database:rehearsal.database,base,ownerId,ownerEmail:email(ownerId),password,projectId,pointId,browserFixtureActive:true},null,2)+'\n')}
}finally{
 await mkdir('test-results/field-control-http',{recursive:true});await writeFile('test-results/field-control-http/result.json',JSON.stringify({synthetic:true,base,database:rehearsal.database,passed,projectId,pointId,passwordSessionsVerified:passed,providerOAuthVerified:false,checks},null,2)+'\n')
 if(seeded)await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[passed&&keep?[otherId]:[ownerId,otherId]])
 await admin.end()
}
