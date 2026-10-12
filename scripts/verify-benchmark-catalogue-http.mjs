import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir,writeFile } from 'node:fs/promises'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
const rehearsal=rehearsalDatabaseConfig(),base='http://localhost:3010',keep=process.argv.includes('--keep-browser-fixture')
assert.equal(rehearsal.database,'metardu_runtime_verify')
const admin=new pg.Client({connectionString:rehearsal.adminUrl,connectionTimeoutMillis:5000}),ownerId=randomUUID(),reviewerId=randomUUID(),password=`synthetic-${randomUUID()}`,email=id=>`benchmark-http-${id}@example.invalid`,country=`Synthetic HTTP ${ownerId}`,prefix=`SYN-HTTP-BM-${ownerId}`
const checks=[],check=(name,value)=>{checks.push({name,passed:Boolean(value)});console.log(`${value?'PASS':'FAIL'} ${name}`);assert.ok(value,name)}
function sessionClient(){const cookies=new Map();return async(path,options={})=>{const response=await fetch(base+path,{...options,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{...options.headers,...(cookies.size?{Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')}:{})}});for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],split=pair.indexOf('=');cookies.set(pair.slice(0,split),pair.slice(split+1))}return response}}
async function login(id){const request=sessionClient(),csrf=await(await request('/api/auth/csrf')).json();await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.csrfToken,email:email(id),password,callbackUrl:base+'/online',json:'true'})});assert.equal((await(await request('/api/auth/session')).json()).user?.id,id);return request}
async function json(request,path,body){const response=await request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{response,value:await response.json()}}
let seeded=false,passed=false,nearId,unknownId
await admin.connect()
try{
 const marker=(await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0]?.marker
 assert.equal(marker,'METARDU synthetic beacon verification only 2026-10-08')
 for(const id of [ownerId,reviewerId]){await admin.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,$3,'Synthetic benchmark HTTP verification')",[id,email(id),await bcrypt.hash(password,10)]);await admin.query('INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,$2,false)',[id,id===reviewerId?'admin':'surveyor'])}seeded=true
 const owner=await login(ownerId),reviewer=await login(reviewerId);check('real owner and independent reviewer password sessions work',true)
 const sources=[]
 for(const [name,lon,type,height]of [['Z-NEAR',33.001,'benchmark',0],['A-FAR',33.01,'benchmark',0],['UNKNOWN',33.002,'control',null]]){
  const coordinates=(await admin.query('SELECT ST_X(p) e,ST_Y(p) n FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,0),4326),32636) p) x',[lon])).rows[0]
  const body={name:`${prefix}-${name}`,beaconType:type,easting:coordinates.e,northing:coordinates.n,elevation:height,horizontalCrs:'EPSG:32636',verticalDatum:height===null?null:'Synthetic BM',sourceReference:'Synthetic HTTP publication TEST-ONLY',authority:'Synthetic HTTP publisher',country}
  const submitted=await json(owner,'/api/public-beacons',body);check(`actual published source ${name} enters the pending catalogue`,submitted.response.status===201&&submitted.value.data.beacon.status==='pending');sources.push({id:submitted.value.data.beacon.id,body})
 }
 const pending=await json(owner,'/api/benchmarks/search',{country})
 check('pending sources cannot appear as reviewed benchmark results',pending.response.status===200&&pending.value.total===0&&pending.value.fromCache===false)
 for(const source of sources){const approved=await json(reviewer,`/api/public-beacons/${source.id}/review`,{decision:'verified',reason:'Synthetic independent HTTP catalogue review; no physical field verification'});assert.equal(approved.response.status,201,JSON.stringify(approved.value))}
 nearId=sources[0].id;unknownId=sources[2].id
 const all=await json(owner,'/api/benchmarks/search',{country,limit:2})
 check('packaged search returns referenced sources with actual pagination counts',all.response.status===200&&all.value.total===3&&all.value.benchmarks.length===2&&all.value.offset===0&&all.response.headers.get('cache-control')==='private, no-store')
 const zero=all.value.benchmarks.find(row=>row.elevation===0)
 check('zero height, source datum and declared grid survive the packaged reader',zero?.verticalDatum==='Synthetic BM'&&zero.horizontalCrs==='EPSG:32636'&&zero.fieldVerified===false&&zero.sourceReference.includes('TEST-ONLY'))
 const metadata=await owner('/api/benchmarks/search?countries=true'),metadataData=await metadata.json()
 check('country options come from reviewed database publications',metadata.status===200&&metadataData.countries.includes(country)&&metadata.headers.get('cache-control')==='private, no-store')
 const unknown=await owner(`/api/benchmarks/search?id=${unknownId}`),unknownData=await unknown.json()
 check('an unknown height stays null rather than becoming a placeholder zero',unknown.status===200&&unknownData.elevation===null&&unknownData.verticalDatum===null)
 const missing=await owner(`/api/benchmarks/search?id=${randomUUID()}`)
 check('missing source UUID returns not found',missing.status===404)
 const near=await owner(`/api/beacons/nearest?lat=0&lon=33&radiusKm=0.2&limit=1&country=${encodeURIComponent(country)}&types=BM`),nearData=await near.json()
 check('radius filtering before limit finds the nearby source despite alphabetically first distant source',near.status===200&&nearData.total===1&&nearData.beacons[0].beacon.id===nearId)
 check('packaged geographic distance agrees with the independent equatorial reference',Math.abs(nearData.beacons[0].distanceKm*1000-111.31949079327357)<1e-5&&Math.abs(nearData.beacons[0].bearingDeg-90)<1e-8)
 check('navigation does not claim offline availability or field verification',nearData.fromCache===false&&nearData.navigationOnly===true&&nearData.beacons[0].beacon.fieldVerified===false&&near.headers.get('cache-control')==='private, no-store')
 const legacy=await owner(`/api/benchmarks/nearby?lat=0&lon=33&radius=0.2&country=${encodeURIComponent(country)}`),legacyData=await legacy.json()
 check('compatibility nearby array contains real reviewed heights and navigation metadata',legacy.status===200&&Array.isArray(legacyData)&&legacyData.length===1&&legacyData[0].id===nearId&&legacy.headers.get('x-navigation-only')==='true')
 check('malformed numeric suffix is rejected',(await owner('/api/beacons/nearest?lat=0garbage&lon=33')).status===400)
 check('partial geographic input is rejected',(await json(owner,'/api/benchmarks/search',{latitude:0,country})).response.status===400)
 const empty=await json(owner,'/api/benchmarks/search',{country,q:'No matching synthetic name'})
 check('empty results remain empty with no embedded official samples',empty.response.status===200&&empty.value.total===0&&empty.value.benchmarks.length===0)
 const online=await owner('/online')
 check('the packaged online page renders without the old embedded lookup',online.status===200&&!(await online.text()).includes('Nairobi Primary BM'))
 passed=true
 if(keep){await mkdir('.cache/release-verify',{recursive:true});await writeFile('.cache/release-verify/benchmark-catalogue-browser-fixture.json',JSON.stringify({synthetic:true,database:rehearsal.database,base,ownerId,ownerEmail:email(ownerId),password,country,prefix,nearId,unknownId,browserFixtureActive:true},null,2)+'\n')}
}finally{
 await mkdir('test-results/benchmark-catalogue-http',{recursive:true});await writeFile('test-results/benchmark-catalogue-http/result.json',JSON.stringify({synthetic:true,base,database:rehearsal.database,passed,passwordSessionsVerified:passed,providerOAuthVerified:false,country,nearId,unknownId,checks},null,2)+'\n')
 if(seeded)await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[passed&&keep?[reviewerId]:[ownerId,reviewerId]])
 await admin.end()
}
