#!/usr/bin/env node
const declaredFixtureCrs21037 = 'EPSG:21037'
// Actual beacon re-establishment routes, transactions and immutable captures and restricted PostgreSQL; synthetic sessions only.
import assert from 'node:assert/strict'
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import 'node:util';
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
const { getPool } = require('../src/lib/db.ts')
const { GET, POST } = require('../src/app/api/beacons/route.ts')
const { GET: projectGET } = require('../src/app/api/beacons/projects/route.ts')
const { NextRequest } = require('next/server')
const admin = new pg.Client({connectionString:rehearsal.adminUrl}),ids={owner:randomUUID(),other:randomUUID(),project:randomUUID(),legacy:randomUUID(),live:randomUUID(),retired:randomUUID(),wrong:randomUUID(),unclaimed:randomUUID()}
const checks=[],check=(name,passed)=>{checks.push({name,passed:Boolean(passed)});console.log(`${passed?'PASS':'FAIL'} ${name}`);assert.ok(passed,name)}
let seeded=false, auditFault=false
async function invoke(userId,method,query='',body,projectOptions=false) {
 const resource=new AsyncResource('METARDU_SYNTHETIC_REGISTRY_REQUEST')
 try{return await resource.runInAsyncScope(()=>sessions.run(userId?{user:{id:userId,email:`registry-${userId}@example.invalid`,name:'Synthetic registry operator',role:'user'}}:null,async()=>{
  const req=new NextRequest(`http://localhost/api/beacons${projectOptions?'/projects':''}${query}`,{method,headers:{'Content-Type':'application/json','x-real-ip':'192.0.2.215'},...(body?{body:JSON.stringify(body)}:{})})
  const response=await(projectOptions?projectGET:method==='GET'?GET:POST)(req,{params:{}});return {response,value:await response.json()}
 }))}finally{resource.emitDestroy()}
}
await admin.connect()
try {
 check('registry reads use the restricted runtime role',runtimeDatabaseRoleFailure((await getPool().query(RUNTIME_ROLE_QUERY)).rows[0])===null)
 await admin.query(`INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'synthetic-no-login','Synthetic registry owner'),($3,$4,'synthetic-no-login','Synthetic registry other')`,[ids.owner,`registry-${ids.owner}@example.invalid`,ids.other,`registry-${ids.other}@example.invalid`])
 await admin.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false),($2,'surveyor',false)",[ids.owner,ids.other]);seeded=true
 for(const id of [ids.project,ids.legacy])await admin.query("INSERT INTO projects(id,user_id,name) VALUES($1,$2,'SYNTHETIC registry verification only')",[id,ids.owner])
 await admin.query(`INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by) VALUES($1,'EPSG:21037','Arc 1960 / UTM 37S','ARC1960','metres',37,'S','Synthetic BM','local','grid',3,$2)`,[ids.project,ids.owner])
 for(const [id,x,status,crs]of [[ids.live,500004,'ESTABLISHED','EPSG:21037'],[ids.retired,500000,'SUPERSEDED','EPSG:21037'],[ids.wrong,500001,'ESTABLISHED','EPSG:32736'],[ids.unclaimed,500002,'ESTABLISHED',null]])await admin.query('INSERT INTO beacon_registry(id,created_by,project_id,beacon_number,easting,northing,elevation,status,horizontal_crs) VALUES($1,$2,$3,$4,$5,9800000,0,$6,$7)',[id,ids.owner,ids.project,`SYN-REG-${ids.project}-${id}`,x,status,crs])
 check('anonymous registry requests are rejected',(await invoke(null,'GET')).response.status===401)
 const owned=await invoke(ids.owner,'GET',`?id=${ids.project}`,undefined,true)
 check('owned project choices expose only minimal declared reference data',owned.response.status===200&&owned.value.data.projects.length===1&&owned.value.data.projects[0].horizontalCrs===declaredFixtureCrs21037&&Object.keys(owned.value.data.projects[0]).sort().join(',')==='horizontalCrs,id,name,verticalDatum')
 check('other accounts cannot enumerate project choices',(await invoke(ids.other,'GET',`?id=${ids.project}`,undefined,true)).value.data.projects.length===0)
 const page=await invoke(ids.owner,'GET','?limit=1',undefined,true)
 const next=await invoke(ids.owner,'GET',`?limit=1&cursor=${page.value.data.nextCursor}`,undefined,true)
 check('project choices paginate without repeating the first project',page.value.data.projects.length===1&&next.value.data.projects.length===1&&page.value.data.projects[0].id!==next.value.data.projects[0].id)
 check('undeclared project choices stay explicitly unclaimed',(await invoke(ids.owner,'GET',`?id=${ids.legacy}`,undefined,true)).value.data.projects[0].horizontalCrs===null)
 const query=`?easting=500000&northing=9800000&radius=5&limit=1&crs=EPSG%3A21037&q=SYN-REG-${ids.project}`
 const near=await invoke(ids.owner,'GET',query)
 check('nearby limit is applied after excluding retired, unclaimed and other-grid marks',near.response.status===200&&near.value.data.beacons.length===1&&near.value.data.beacons[0].id===ids.live&&near.value.data.beacons[0].distance_m===4)
 const moved=await invoke(ids.owner,'GET',`?easting=500003&northing=9800000&radius=5&limit=1&crs=EPSG%3A21037&q=SYN-REG-${ids.project}`)
 check('nearby centers sharing a ten-metre bucket retain their own radius and center',moved.response.status===200&&moved.value.data.beacons.length===1&&moved.value.data.beacons[0].distance_m===1&&moved.value.data.center.easting===500003)
 check('nearby search cannot infer an omitted grid',(await invoke(ids.owner,'GET','?easting=500000&northing=9800000')).response.status===400)
 for(const q of ['?easting=500000&radius=5','?limit=0','?limit=oops','?easting=500000oops&northing=9800000&crs=EPSG%3A21037','?easting=500000&northing=9800000&crs=EPSG%3A3857'])check(`invalid registry query ${q} is a client error`,(await invoke(ids.owner,'GET',q)).response.status===400)
 const text=await invoke(ids.owner,'GET',`?q=SYN-REG-${ids.project}-${ids.retired}`)
 check('retired coordinates are absent from normal name searches',text.response.status===200&&text.value.data.beacons.length===0)
 const foreign=await invoke(ids.other,'GET',`?q=SYN-REG-${ids.project}-${ids.live}`)
 check('shared registry responses do not expose private project or actor IDs',foreign.response.status===200&&foreign.value.data.beacons[0].project_id===null&&foreign.value.data.beacons[0].owned===false&&foreign.value.data.beacons[0].created_by===undefined)
 const body={projectId:ids.project,beaconNumber:`SYN-CREATE-${randomUUID()}`,beaconType:'concrete',easting:500000.01234,northing:9800000.05678,elevation:0,verticalDatum:'Synthetic BM',condition:'good'}
 check('new entries require an owned declared project',(await invoke(ids.owner,'POST','',{...body,projectId:ids.legacy})).response.status===400&&(await invoke(ids.other,'POST','',body)).response.status===403)
 check('a client cannot self-assert adoption on a new registration',(await invoke(ids.owner,'POST','',{...body,isAdopted:true})).response.status===400)
 const created=await invoke(ids.owner,'POST','',body)
 check('new registration records exact zero height and explicit project CRS',created.response.status===201&&created.value.data.beacon.elevation===0&&created.value.data.beacon.horizontal_crs===declaredFixtureCrs21037)
 check('duplicate current numbers are rejected within the owned project',(await invoke(ids.owner,'POST','',body)).response.status===409)
 check('invalid establishment calendar dates are client errors',(await invoke(ids.owner,'POST','',{...body,beaconNumber:`SYN-DATE-${randomUUID()}`,establishedDate:'2026-02-30'})).response.status===400)
 const stored=(await admin.query('SELECT * FROM beacon_registry WHERE id=$1',[created.value.data.beacon.id])).rows[0]
 const audit=(await admin.query("SELECT * FROM audit_logs WHERE table_name='beacon_registry' AND record_id=$1",[stored.id])).rows[0]
 check('registration audit records the actual beacon, actor and reference in the same transaction',audit?.user_id===ids.owner&&audit.details.input.elevation===0&&audit.details.reference.horizontal_crs===declaredFixtureCrs21037)
 check('new registration retains unknown uncertainty and unverified confidence',stored.sigma_e===null&&stored.sigma_n===null&&stored.sigma_rl===null&&Number(stored.source_confidence)===0&&!stored.is_adopted&&stored.last_verified_at===null)
 await admin.query(`CREATE FUNCTION synthetic_registry_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${ids.owner}'::uuid AND NEW.table_name='beacon_registry' THEN RAISE EXCEPTION 'Synthetic registry audit failure'; END IF; RETURN NEW; END $$`)
 await admin.query('CREATE TRIGGER synthetic_registry_audit_fault BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION synthetic_registry_audit_fault()');auditFault=true
 const number=`SYN-AUDIT-FAIL-${randomUUID()}`,failed=await invoke(ids.owner,'POST','',{...body,beaconNumber:number})
 check('failed registration audit rolls back its beacon coordinate',failed.response.status===500&&Number((await admin.query('SELECT count(*) FROM beacon_registry WHERE beacon_number=$1',[number])).rows[0].count)===0)
} finally {
 if(auditFault){await admin.query('DROP TRIGGER synthetic_registry_audit_fault ON audit_logs');await admin.query('DROP FUNCTION synthetic_registry_audit_fault()')}
 await mkdir('test-results/runtime-database',{recursive:true});await writeFile('test-results/runtime-database/beacon-registry.json',JSON.stringify({synthetic:true,providerSessionMocked:true,database:rehearsal.database,passed:checks.length===24&&checks.every(c=>c.passed),checks},null,2)+'\n')
 await getPool().end();if(seeded)await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[[ids.owner,ids.other]]);await admin.end()
}
