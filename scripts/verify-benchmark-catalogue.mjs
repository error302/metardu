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
Object.assign(process.env,{DATABASE_URL:rehearsal.runtimeUrl,AUTH_SECRET:'synthetic-benchmark-catalogue-only',NODE_ENV:'test',DB_POOL_MAX:'2'})
const require=createRequire(import.meta.url),Module=require('node:module'),ts=require('typescript'),sessions=new AsyncLocalStorage(),load=Module._load
Module._load=function(request,parent,...args){if(request==='next-auth')return{getServerSession:async()=>sessions.getStore()??null};return load.call(this,request.startsWith('@/')?path.join(process.cwd(),'src',request.slice(2)):request,parent,...args)}
Module._extensions['.ts']=function(module,file){module._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file)}
const {getPool}=require('../src/lib/db.ts'),{POST:submit}=require('../src/app/api/public-beacons/route.ts'),{POST:review}=require('../src/app/api/public-beacons/[id]/review/route.ts'),{GET:metadata,POST:search}=require('../src/app/api/benchmarks/search/route.ts'),{GET:nearest}=require('../src/app/api/beacons/nearest/route.ts'),{GET:nearby}=require('../src/app/api/benchmarks/nearby/route.ts'),{NextRequest}=require('next/server')
const admin=new pg.Client({connectionString:rehearsal.adminUrl}),owner=randomUUID(),reviewer=randomUUID(),country=`Synthetic-${owner}`,prefix=`SYN-BM-${owner}`
const checks=[],check=(name,value)=>{checks.push({name,passed:Boolean(value)});console.log(`${value?'PASS':'FAIL'} ${name}`);assert.ok(value,name)}
async function invoke(user,handler,method='GET',body,query='',id){const resource=new AsyncResource('BENCHMARK_CATALOGUE_TEST');try{return await resource.runInAsyncScope(()=>sessions.run(user?{user:{id:user,email:`benchmark-${user}@example.invalid`,name:'Synthetic catalogue operator',role:user===reviewer?'admin':'user'}}:null,async()=>{const response=await handler(new NextRequest(`http://localhost/api/benchmarks/search${query}`,{method,headers:{'Content-Type':'application/json','x-real-ip':'192.0.2.220'},...(body?{body:JSON.stringify(body)}:{})}),{params:id?{id}:{}});return{response,value:await response.json()}}))}finally{resource.emitDestroy()}}
async function mark(name,lon,lat,code,type='benchmark',height=0){
 const xy=(await admin.query('SELECT ST_X(p) e,ST_Y(p) n FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),$3::integer) p) x',[lon,lat,Number(code.slice(5))])).rows[0]
 const input={name:`${prefix}-${name}`,beaconType:type,easting:xy.e,northing:xy.n,elevation:height,horizontalCrs:code,verticalDatum:height===null?null:'Synthetic BM',sourceReference:'Synthetic benchmark publication TEST-ONLY; no official dataset',authority:'Synthetic publisher',country}
 const submitted=await invoke(owner,submit,'POST',input),id=submitted.value.data?.beacon.id
 assert.equal(submitted.response.status,201,JSON.stringify(submitted.value))
 return{id,input}
}
async function approve(source){const result=await invoke(reviewer,review,'POST',{decision:'verified',reason:'Synthetic independent source review; no field verification'},'',source.id);assert.equal(result.response.status,201,JSON.stringify(result.value))}
let seeded=false,completed=false
await admin.connect()
try{
 check('benchmark catalogue uses a restricted runtime login',runtimeDatabaseRoleFailure((await getPool().query(RUNTIME_ROLE_QUERY)).rows[0])===null)
 for(const id of [owner,reviewer]){await admin.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'synthetic-no-login','Synthetic benchmark catalogue test')",[id,`benchmark-${id}@example.invalid`]);await admin.query('INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,$2,false)',[id,id===reviewer?'admin':'surveyor'])}seeded=true
 check('anonymous benchmark search is denied',(await invoke(null,search,'POST',{country})).response.status===401)
 const nearMark=await mark('EQ-Z-NEAR',33.001,0,'EPSG:32636'),farMark=await mark('EQ-A-FAR',33.01,0,'EPSG:32636'),unknown=await mark('UNKNOWN',36.8,-1.5,'EPSG:32736','control',null),cross=await mark('CROSS',36.8,-1.5,'EPSG:21037'),tidal=await mark('TIDAL',36.8,-1.5,'EPSG:32736','tidal',0)
 const absent=await invoke(owner,search,'POST',{country})
 check('pending publications never appear as reviewed benchmarks',absent.response.status===200&&absent.value.total===0&&absent.value.benchmarks.length===0&&absent.value.fromCache===false)
 check('pending-only country is absent from live country metadata',!(await invoke(owner,metadata,'GET',undefined,'?countries=true')).value.countries.includes(country))
 await admin.query('UPDATE public_beacons SET geom=ST_SetSRID(ST_MakePoint(0,0),21037) WHERE id=$1',[nearMark.id])
 for(const source of [nearMark,farMark,unknown,cross,tidal])await approve(source)
 const all=await invoke(owner,search,'POST',{country,limit:2}),zero=all.value.benchmarks.find(row=>row.elevation===0)
 check('real referenced catalogue paginates with the full count',all.response.status===200&&all.value.total===5&&all.value.benchmarks.length===2&&all.value.offset===0&&all.value.limit===2&&all.response.headers.get('cache-control')==='private, no-store')
 check('source DTO keeps explicit references and hides reviewer/account identities',zero?.sourceReference.includes('TEST-ONLY')&&zero.horizontalCrs.startsWith('EPSG:')&&zero.catalogueStatus==='reviewed'&&zero.fieldVerified===false&&zero.submitted_by===undefined&&zero.verified_by===undefined&&zero.lastVerified===undefined)
 const emptyPage=await invoke(owner,search,'POST',{country,offset:100})
 check('empty later pages retain the real matched total',emptyPage.value.benchmarks.length===0&&emptyPage.value.total===5)
 const countryList=await invoke(owner,metadata,'GET',undefined,'?countries=true')
 check('reviewed country becomes available from the database',countryList.value.countries.includes(country)&&countryList.response.headers.get('cache-control')==='private, no-store')
 const id=await invoke(owner,metadata,'GET',undefined,`?id=${unknown.id}`)
 check('unknown height remains null with its real original grid',id.response.status===200&&id.value.elevation===null&&id.value.verticalDatum===null&&id.value.horizontalCrs==='EPSG:32736'&&id.value.type==='CP')
 check('missing reference UUID returns not found',(await invoke(owner,metadata,'GET',undefined,`?id=${randomUUID()}`)).response.status===404)
 for(const change of [{latitude:0},{longitude:0},{radiusKm:1},{limit:0},{offset:-1},{latitude:91,longitude:0},{published_easting:1}])check(`malformed benchmark body ${JSON.stringify(change)} is rejected`,(await invoke(owner,search,'POST',{country,...change})).response.status===400)
 const eq=await invoke(owner,nearest,'GET',undefined,`?lat=0&lon=33&radiusKm=0.2&limit=1&country=${encodeURIComponent(country)}&q=${prefix}-EQ`)
 const equator=eq.value.beacons?.[0]
 check('actual spheroidal radius filtering happens before the result limit',eq.response.status===200&&eq.value.total===1&&equator?.beacon.id===nearMark.id)
 check('WGS84 equatorial arc agrees with its analytic 111.319490793 metre reference',Math.abs(equator.distanceKm*1000-111.31949079327357)<1e-5&&Math.abs(equator.bearingDeg-90)<1e-8)
 check('navigation uses explicit source XY and ignores stale legacy geometry',Math.abs(equator.beacon.longitude-33.001)<1e-10&&equator.beacon.latitude===0&&equator.beacon.easting===nearMark.input.easting)
 check('navigation is uncached and preserves zero published height',eq.value.fromCache===false&&eq.value.navigationOnly===true&&equator.beacon.elevation===0&&eq.response.headers.get('cache-control')==='private, no-store')
 const coincident=await invoke(owner,nearest,'GET',undefined,`?lat=0&lon=33.001&radiusKm=0&country=${encodeURIComponent(country)}&q=${prefix}-EQ-Z`)
 check('zero radius and coincident navigation do not invent a north azimuth',coincident.response.status===200&&coincident.value.beacons.length===1&&coincident.value.beacons[0].distanceKm===0&&coincident.value.beacons[0].bearingDeg===null)
 const mixed=await invoke(owner,nearest,'GET',undefined,`?lat=-1.5&lon=36.8&radiusKm=0.01&country=${encodeURIComponent(country)}`)
 check('nearby navigation retains different explicit grids without relabelling them',mixed.response.status===200&&mixed.value.beacons.some(row=>row.beacon.id===unknown.id&&row.beacon.horizontalCrs==='EPSG:32736')&&mixed.value.beacons.some(row=>row.beacon.id===cross.id&&row.beacon.horizontalCrs==='EPSG:21037'))
 const bmNearby=await invoke(owner,nearby,'GET',undefined,`?lat=0&lon=33&radius=0.2&country=${encodeURIComponent(country)}&q=${prefix}-EQ`)
 check('legacy nearby array uses reviewed BMs and real geographic distance',bmNearby.response.status===200&&Array.isArray(bmNearby.value)&&bmNearby.value.length===1&&bmNearby.value[0].id===nearMark.id&&bmNearby.response.headers.get('x-navigation-only')==='true')
 for(const query of ['?lat=0','?lat=0garbage&lon=33','?lat=0&lon=33&limit=0','?lat=0&lon=33&radiusKm=-1','?lat=0&lon=33&types=FAKE'])check(`invalid nearby query ${query} rejected`,(await invoke(owner,nearest,'GET',undefined,query)).response.status===400)
 const tidalResult=await invoke(owner,search,'POST',{country,type:'TIDAL'})
 check('tidal classification comes from a real typed source with height datum',tidalResult.value.total===1&&tidalResult.value.benchmarks[0].id===tidal.id&&tidalResult.value.benchmarks[0].verticalDatum==='Synthetic BM')
 const withdrawal=await invoke(reviewer,review,'POST',{decision:'rejected',reason:'Synthetic source withdrawal for reader freshness test'},'',nearMark.id)
 check('withdrawal is recorded by an independent reviewer',withdrawal.response.status===201)
 const refreshed=await invoke(owner,nearest,'GET',undefined,`?lat=0&lon=33&radiusKm=0.2&country=${encodeURIComponent(country)}&q=${prefix}-EQ`)
 check('fresh search excludes withdrawn marks without a stale offline cache',refreshed.value.total===0&&refreshed.value.beacons.length===0&&refreshed.value.fromCache===false)
 completed=true
}finally{
 await mkdir('test-results/runtime-database',{recursive:true});await writeFile('test-results/runtime-database/benchmark-catalogue.json',JSON.stringify({synthetic:true,providerSessionMocked:true,database:rehearsal.database,passed:completed&&checks.every(row=>row.passed),checks},null,2)+'\n')
 await getPool().end();if(seeded)await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[[owner,reviewer]]);await admin.end()
}
