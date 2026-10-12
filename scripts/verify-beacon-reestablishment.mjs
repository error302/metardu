#!/usr/bin/env node
// Actual beacon re-establishment routes, transactions and immutable captures and restricted PostgreSQL; synthetic sessions only.
import assert from 'node:assert/strict'
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'

const rehearsal = rehearsalDatabaseConfig()
Object.assign(process.env, { DATABASE_URL: rehearsal.runtimeUrl, AUTH_SECRET: 'synthetic-beacon-session-only-secret', NODE_ENV: 'test', DB_POOL_MAX: '2' })
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript')
const sessions = new AsyncLocalStorage(), originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request === 'next-auth') return { getServerSession: async () => sessions.getStore() ?? null }
  return originalLoad.call(this, request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request, parent, ...args)
}
Module._extensions['.ts'] = function (module, file) {
  module._compile(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file)
}
const { getPool, db } = require('../src/lib/db.ts')
const { setAuthenticatedDatabaseContext } = require('../src/lib/auth/requestContext.ts')
const { POST, GET } = require('../src/app/api/beacons/[id]/reestablish/route.ts')
const { NextRequest } = require('next/server')
const admin = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const ids = { owner: randomUUID(), other: randomUUID(), project: randomUUID(), undeclared: randomUUID(), original: randomUUID(), concurrent: randomUUID(), rollback: randomUUID(), unsupported: randomUUID(), global: randomUUID() }
const checks=[], session=id=>id?{user:{id,email:`beacon-${id}@example.invalid`,name:'Synthetic beacon operator',role:'user'}}:null
const check=(name,passed)=>{checks.push({name,passed:Boolean(passed)});console.log(`${passed?'PASS':'FAIL'} ${name}`);assert.ok(passed,name)}
async function inRequest(userId,work) {
 const resource=new AsyncResource('METARDU_SYNTHETIC_BEACON_REQUEST')
 try{return await resource.runInAsyncScope(()=>sessions.run(session(userId),work))}finally{resource.emitDestroy()}
}
async function invoke(userId,method,beaconId,body) {
 return inRequest(userId,async()=>{
  const req=new NextRequest(`http://localhost/api/beacons/${beaconId}/reestablish`,{method,headers:{'Content-Type':'application/json','x-real-ip':'192.0.2.214'},...(method==='POST'?{body:JSON.stringify(body)}:{})})
  const response=await(method==='POST'?POST:GET)(req,{params:Promise.resolve({id:beaconId})});return {response,value:await response.json()}
 })
}
const observed={requestId:randomUUID(),projectId:ids.project,easting:500000.01234,northing:9800000.05678,elevation:0,horizontalCrs:'EPSG:21037',originalHorizontalCrs:'EPSG:21037',verticalDatum:'Synthetic BM',ties:'SYN-A 12.000 m; SYN-B 18.000 m; synthetic only',instrument:'Synthetic TS serial TEST-ONLY',note:'Synthetic damaged mark re-observed; not field evidence',observationDate:'2026-10-01T09:00:00+03:00'}
let seeded=false, faultInstalled=false
await admin.connect()
try {
 check('beacon verification uses a restricted runtime database role',runtimeDatabaseRoleFailure((await getPool().query(RUNTIME_ROLE_QUERY)).rows[0])===null)
 await admin.query(`INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'synthetic-no-login','Synthetic beacon owner'),($3,$4,'synthetic-no-login','Synthetic beacon other')`,[ids.owner,session(ids.owner).user.email,ids.other,session(ids.other).user.email])
 await admin.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false),($2,'surveyor',false)",[ids.owner,ids.other]);seeded=true
 for(const id of [ids.project,ids.undeclared]) await admin.query("INSERT INTO projects(id,user_id,name) VALUES($1,$2,'SYNTHETIC beacon verification only')",[id,ids.owner])
 await admin.query(`INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by) VALUES($1,'EPSG:21037','Arc 1960 / UTM zone 37S','ARC1960','metres',37,'S','Synthetic BM','local','grid',3,$2)`,[ids.project,ids.owner])
 for(const id of [ids.original,ids.concurrent,ids.rollback,ids.unsupported]) await admin.query("INSERT INTO beacon_registry(id,created_by,project_id,beacon_number,easting,northing,elevation) VALUES($1,$2,$3,$4,500000,9800000,123.456789)",[id,ids.owner,id===ids.unsupported?ids.undeclared:ids.project,`SYN-${id}`])
 await admin.query("INSERT INTO beacon_registry(id,created_by,beacon_number,easting,northing,elevation) VALUES($1,$2,$3,500000,9800000,NULL)",[ids.global,ids.owner,`SYN-GLOBAL-${ids.global}`])
 const original=(await admin.query('SELECT * FROM beacon_registry WHERE id=$1',[ids.original])).rows[0]
 check('unauthenticated recording is rejected',(await invoke(null,'POST',ids.original,observed)).response.status===401)
 check('another account cannot replace a globally readable mark',(await invoke(ids.other,'POST',ids.original,observed)).response.status===404)
 check('an undeclared project cannot infer the registry default CRS',(await invoke(ids.owner,'POST',ids.unsupported,{...observed,projectId:ids.undeclared})).response.status===400)
 check('missing observed ties cannot produce a replacement',(await invoke(ids.owner,'POST',ids.original,{...observed,ties:''})).response.status===400)
 check('a mismatched observed grid cannot change a mark',(await invoke(ids.owner,'POST',ids.original,{...observed,horizontalCrs:'EPSG:32737'})).response.status===409)
 check('observed height needs its declared vertical datum',(await invoke(ids.owner,'POST',ids.original,{...observed,verticalDatum:null})).response.status===409)
 const saved=await invoke(ids.owner,'POST',ids.original,observed)
 check('real central handler consumes JSON once and records a replacement',saved.response.status===201&&!saved.value.data.replayed)
 const capture=saved.value.data.capture,newId=capture.replacement_id,replacement=(await admin.query('SELECT * FROM beacon_registry WHERE id=$1',[newId])).rows[0]
 const after=(await admin.query('SELECT * FROM beacon_registry WHERE id=$1',[ids.original])).rows[0]
 const unchanged=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['status','superseded_by_id','updated_at'].includes(key)))
 check('original full record stays exact while the successor link changes',isDeepStrictEqual(unchanged(original),unchanged(after))&&after.status==='SUPERSEDED'&&after.superseded_by_id===newId)
 check('measured XY precision and zero RL survive persistence',replacement.easting===observed.easting&&replacement.northing===observed.northing&&replacement.elevation===0&&replacement.horizontal_crs==='EPSG:21037')
 check('new observation does not invent verification, adoption or five-millimetre precision',replacement.sigma_e===null&&replacement.sigma_n===null&&replacement.sigma_rl===null&&Number(replacement.source_confidence)===0&&!replacement.is_adopted&&replacement.last_verified_at===null&&replacement.metadata.verified===false)
 check('immutable capture retains ties, instrument, date and predecessor height',capture.observation.ties===observed.ties&&capture.observation.instrument===observed.instrument&&capture.observation.observationDate==='2026-10-01T06:00:00.000Z'&&capture.predecessor_snapshot.elevation===123.456789&&capture.reference_snapshot.originalReferenceSource==='surveyor_declaration'&&capture.observation.certified===false)
 const history=await invoke(ids.owner,'GET',newId)
 check('owner reloads private history through the replacement',history.response.status===200&&history.response.headers.get('cache-control')==='private, no-store'&&history.value.data.captures.length===1&&(await invoke(ids.other,'GET',newId)).value.data.captures.length===0)
 const replay=await invoke(ids.owner,'POST',ids.original,observed)
 check('identical replay returns the same immutable capture',replay.response.status===200&&replay.value.data.replayed&&replay.value.data.capture.id===capture.id)
 check('changed observation under a reused request ID is rejected',(await invoke(ids.owner,'POST',ids.original,{...observed,northing:observed.northing+0.00001})).response.status===409)
 const pair=await Promise.all([invoke(ids.owner,'POST',ids.concurrent,{...observed,requestId:randomUUID()}),invoke(ids.owner,'POST',ids.concurrent,{...observed,requestId:randomUUID()})])
 check('concurrent different replacements produce one capture and one conflict',pair.map(r=>r.response.status).sort().join(',')==='201,409'&&Number((await admin.query('SELECT count(*) FROM beacon_registry WHERE re_established_from_id=$1',[ids.concurrent])).rows[0].count)===1)
 // Restrict the fault injection to this fresh synthetic project; remove it below.
 await admin.query(`CREATE FUNCTION public.synthetic_beacon_capture_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.predecessor_id='${ids.rollback}'::uuid THEN RAISE EXCEPTION 'Synthetic capture failure'; END IF; RETURN NEW; END $$`)
 await admin.query('CREATE TRIGGER synthetic_beacon_capture_fault BEFORE INSERT ON beacon_reestablishment_captures FOR EACH ROW EXECUTE FUNCTION synthetic_beacon_capture_fault()');faultInstalled=true
 const failed=await invoke(ids.owner,'POST',ids.rollback,{...observed,requestId:randomUUID()})
 check('capture failure rolls back replacement and predecessor status together',failed.response.status===500&&Number((await admin.query('SELECT count(*) FROM beacon_registry WHERE re_established_from_id=$1',[ids.rollback])).rows[0].count)===0&&(await admin.query('SELECT superseded_by_id FROM beacon_registry WHERE id=$1',[ids.rollback])).rows[0].superseded_by_id===null)
 await admin.query('DROP TRIGGER synthetic_beacon_capture_fault ON beacon_reestablishment_captures');await admin.query('DROP FUNCTION synthetic_beacon_capture_fault()');faultInstalled=false
 for(const [name,sql,values] of [
  ['old northing','UPDATE beacon_registry SET northing=northing+0.01 WHERE id=$1',[ids.original]],
  ['old elevation','UPDATE beacon_registry SET elevation=elevation+0.01 WHERE id=$1',[ids.original]],
  ['replacement coordinates','UPDATE beacon_registry SET easting=easting+0.01 WHERE id=$1',[newId]],
  ['capture notes',"UPDATE beacon_reestablishment_captures SET observation='{}' WHERE id=$1",[capture.id]],
  ['old beacon deletion','DELETE FROM beacon_registry WHERE id=$1',[ids.original]],
  ['capture deletion','DELETE FROM beacon_reestablishment_captures WHERE id=$1',[capture.id]],
 ]) {let rejected=false;try{await admin.query(sql,values)}catch{rejected=true}check(`${name} cannot be rewritten even by the migration owner`,rejected)}
 const globalSaved=await invoke(ids.owner,'POST',ids.global,{...observed,requestId:randomUUID(),elevation:null,verticalDatum:null})
 check('a creator can explicitly scope a global mark without rewriting its original project or height',globalSaved.response.status===201&&globalSaved.value.data.capture.predecessor_snapshot.project_id===null&&globalSaved.value.data.capture.observation.elevation===null&&(await admin.query('SELECT project_id FROM beacon_registry WHERE id=$1',[ids.global])).rows[0].project_id===null)
 await inRequest(ids.other,async()=>{setAuthenticatedDatabaseContext(ids.other);check('capture RLS hides records on direct pooled queries',(await db.query('SELECT id FROM beacon_reestablishment_captures WHERE id=$1',[capture.id])).rows.length===0)})
 const started=Date.now()
 for(let i=0;i<6;i++) assert.equal((await invoke(ids.owner,'POST',ids.original,observed)).response.status,200)
 check('repeated requests release both connections in the two-client pool',Date.now()-started<10000&&getPool().waitingCount===0&&getPool().idleCount===getPool().totalCount)
} finally {
 if(faultInstalled){await admin.query('DROP TRIGGER IF EXISTS synthetic_beacon_capture_fault ON beacon_reestablishment_captures');await admin.query('DROP FUNCTION IF EXISTS synthetic_beacon_capture_fault()')}
 await mkdir('test-results/runtime-database',{recursive:true})
 await writeFile('test-results/runtime-database/beacon-reestablishment.json',JSON.stringify({synthetic:true,providerSessionMocked:true,database:rehearsal.database,runtimeRole:rehearsal.runtimeRole,passed:checks.length===26&&checks.every(c=>c.passed),checks},null,2)+'\n')
 await getPool().end();if(seeded)await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[[ids.owner,ids.other]]);await admin.end()
}
