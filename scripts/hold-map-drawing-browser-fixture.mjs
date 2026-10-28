// Actual browser map handler and PostgreSQL in an exact, owned rehearsal schema.
// Authentication is a bounded adapter; this does not prove production HTTP or RLS.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const service = JSON.parse(execFileSync('docker', ['inspect', '--format', '{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}', 'metardu-schema-rehearsal-20261008'], { encoding: 'utf8', windowsHide: true, timeout: 30000 }))
assert.equal(service.Id, 'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
assert.equal(service.Labels['metardu.purpose'], 'schema-rehearsal'); assert.equal(service.Running, true)
assert.deepEqual(service.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55433' }])
const token = randomUUID(), projectId = randomUUID()
const marker = `METARDU owned browser map fixture ${token}`
const options = { connectionString: 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify', connectionTimeoutMillis: 5000, statement_timeout: 8000, application_name: `metardu-browser-map-${token}` }
const admin = new pg.Client(options)
const mode=process.argv[2]
assert.ok(['--inspect','--hold'].includes(mode)&&process.argv.length===3,'Use --inspect or --hold with the fixed synthetic service.')
const require=createRequire(import.meta.url),Module=require('node:module'),ts=require('typescript'),originalLoad=Module._load
Module._load=function(request,parent,...rest){return originalLoad.call(this,request.startsWith('@/')?path.join(process.cwd(),'src',request.slice(2)):request,parent,...rest)}
Module._extensions['.ts']=function(module,filename){module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename)}
const {buildProjectReferenceSystem,toReferenceSystemRow}=require('../src/lib/spatial/projectReferenceSystem.ts')
const {transformPoint}=require('../src/lib/spatial/projectCrs.ts')
const root='.cache/map-drawing/browser';mkdirSync(root,{recursive:true})
const report={checkedAt:new Date().toISOString(),marker,projectId,syntheticOnly:true,productionDataChanged:false,browserAuthentication:'existing ordinary session; no injected credentials or browser state'}
const save=()=>writeFileSync(`${root}/fixture.json`,JSON.stringify(report,null,2)+'\n')
const fingerprint=async()=>{const result={};for(const table of ['projects','project_reference_systems','setout_definitions','setout_points','setout_observations','tolerance_profiles'])result[table]=(await admin.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(record)::text,E'\n' ORDER BY row_to_json(record)::text),'')) hash FROM public.${table} record`)).rows[0];return result}
let created=false,original,ledger,owner
await admin.connect()
try{
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  const actor=(await admin.query(`SELECT p.user_id,p.name,(u.email ~* '(\\.invalid|\\.test|@localhost)$') AS reserved_actor FROM public.projects p JOIN public.users u ON u.id=p.user_id WHERE p.id=$1`,['3801daa3-b41f-41be-9a85-1b8c71b531cf'])).rows[0]
  assert.equal(actor?.name,'SYNTHETIC capture recovery browser QA - not field evidence')
  assert.equal(actor.reserved_actor,true,'The existing session is not tied to a verified reserved-domain synthetic actor. No fixture was written.')
  owner=actor.user_id
  if(mode==='--inspect'){console.log(JSON.stringify({admitted:true,syntheticActorVerified:true,writes:0}));process.exitCode=0}
  else{
    original=await fingerprint();ledger=(await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
    const crs='EPSG:32737',ring=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(([e,n])=>transformPoint(e,n,crs,'EPSG:4326'))
    const features={type:'FeatureCollection',features:[
      {type:'Feature',id:0,geometry:{type:'Polygon',coordinates:[ring(500000,9800000,100,50),ring(500010,9800010,20,10)]},properties:{name:'SYNTHETIC rectangle with hole - not field evidence'}},
      {type:'Feature',id:0,geometry:{type:'LineString',coordinates:[[500000,9800000],[500003,9800004]].map(([e,n])=>transformPoint(e,n,crs,'EPSG:4326'))},properties:{name:'SYNTHETIC retained line'}},
    ]}
    await admin.query('BEGIN')
    try{
      await admin.query(`INSERT INTO public.projects(id,user_id,name,survey_type,location,datum,utm_zone,hemisphere,boundary_data)
        VALUES($1,$2,'SYNTHETIC versioned map browser acceptance - not field evidence','road','Synthetic test geometry only','WGS84',37,'S',$3::jsonb)`,[projectId,owner,JSON.stringify({source:'map-drawing',coordinateCrs:'EPSG:4326',drawnFeatures:features,fixture:{marker},cad_document:{signature:'RETAIN SYNTHETIC CAD SENTINEL'},adjustedStations:[]})])
      const row=toReferenceSystemRow(projectId,{prs:buildProjectReferenceSystem({datum:'WGS84',utmZone:37,hemisphere:'S',verticalDatum:'SYNTHETIC local BM - not field control',verticalReference:'local'})},owner),keys=Object.keys(row)
      await admin.query(`INSERT INTO public.project_reference_systems(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row))
      await admin.query('COMMIT');created=true
    }catch(error){await admin.query('ROLLBACK');throw error}
    report.originalRecordsBefore=original;report.originalMigrationCount=ledger.length;report.url=`http://127.0.0.1:3021/map?projectId=${projectId}`;report.status='fixture-ready';save()
    console.log(JSON.stringify({status:'fixture-ready',projectId,url:report.url,commands:['snapshot','remote-edit','cleanup']}))
    const readline=await import('node:readline')
    const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity})
    let stop=false
    const command=async line=>{
      if(line==='cleanup'){stop=true;return}
      const row=(await admin.query('SELECT user_id,name,boundary_data FROM public.projects WHERE id=$1',[projectId])).rows[0]
      assert.equal(row?.user_id,owner);assert.equal(row.name,'SYNTHETIC versioned map browser acceptance - not field evidence');assert.equal(row.boundary_data?.fixture?.marker,marker)
      if(line==='snapshot'){
        report.lastSnapshot={checkedAt:new Date().toISOString(),featureCount:row.boundary_data.drawnFeatures?.features?.length??null,cadRetained:row.boundary_data.cad_document?.signature==='RETAIN SYNTHETIC CAD SENTINEL',coordinateCrs:row.boundary_data.coordinateCrs,mapDrawing:row.boundary_data.mapDrawing??null,featureNames:(row.boundary_data.drawnFeatures?.features??[]).map(f=>f.properties?.name??null)};save();console.log(JSON.stringify(report.lastSnapshot))
      }else if(line==='remote-edit'){
        const next=structuredClone(row.boundary_data.drawnFeatures)
        next.features.push({type:'Feature',id:'SYNTHETIC-REMOTE',geometry:{type:'Point',coordinates:transformPoint(500150,9800050,crs,'EPSG:4326')},properties:{name:'SYNTHETIC concurrent remote version - retain'}})
        const result=await admin.query(`UPDATE public.projects SET boundary_data=jsonb_set(boundary_data,'{drawnFeatures}',$1::jsonb) WHERE id=$2 AND user_id=$3 AND boundary_data->'fixture'->>'marker'=$4 RETURNING id`,[JSON.stringify(next),projectId,owner,marker]);assert.equal(result.rowCount,1)
        report.remoteEditAt=new Date().toISOString();save();console.log(JSON.stringify({remoteEditAdded:true,featureCount:next.features.length}))
      }else throw new Error('Unknown command; no change performed')
    }
    for await(const line of input){await command(line.trim());if(stop){input.close();break}}
  }
}finally{
  try{
    if(created){
      const fixture=(await admin.query('SELECT user_id,name,boundary_data FROM public.projects WHERE id=$1',[projectId])).rows[0]
      assert.equal(fixture?.user_id,owner);assert.equal(fixture.name,'SYNTHETIC versioned map browser acceptance - not field evidence');assert.equal(fixture.boundary_data?.fixture?.marker,marker)
      await admin.query('BEGIN')
      try{await admin.query('DELETE FROM public.project_reference_systems WHERE project_id=$1',[projectId]);const deleted=await admin.query(`DELETE FROM public.projects WHERE id=$1 AND user_id=$2 AND boundary_data->'fixture'->>'marker'=$3 RETURNING id`,[projectId,owner,marker]);assert.equal(deleted.rowCount,1);await admin.query('COMMIT')}catch(error){await admin.query('ROLLBACK');throw error}
      assert.equal((await admin.query('SELECT 1 FROM public.projects WHERE id=$1',[projectId])).rowCount,0);report.ownedFixtureRemoved=true
    }
    if(original){assert.deepEqual(await fingerprint(),original);report.originalRecordsPreserved=true}
    if(ledger){assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows,ledger);report.migrationLedgerPreserved=true}
    if(created){report.status=report.ownedFixtureRemoved&&report.originalRecordsPreserved&&report.migrationLedgerPreserved?'cleaned':'failed';save();console.log(JSON.stringify({status:report.status,preserved:report.originalRecordsPreserved,fixtureRemoved:report.ownedFixtureRemoved}))}
  }finally{await admin.end()}
}
