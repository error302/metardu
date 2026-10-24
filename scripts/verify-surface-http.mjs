// Exact existing ordinary QA project through normal loopback auth and HTTP.
// No entitlement/provider change; only a named synthetic surface may be created.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import pg from 'pg'

const terrain=process.argv[2]==='--terrain'
assert.ok(process.argv.length===2 || terrain&&process.argv.length===3)
const fixture=JSON.parse(readFileSync('.cache/topographic/isolated-browser.json','utf8'))
assert.equal(fixture.state,'created');assert.equal(fixture.sourceOnly,true)
assert.equal(fixture.userId,'99f15c47-7a36-43c4-b98c-1171da777039')
assert.equal(fixture.projectId,'474f92f6-0e90-4129-83fb-d514db596876')
assert.equal(fixture.email,`topographic-qa-${fixture.userId}@example.invalid`)
const service=JSON.parse(execFileSync('docker',['inspect','--format','{"Id":{{json .Id}},"Purpose":{{json (index .Config.Labels "metardu.purpose")}},"Ports":{{json .NetworkSettings.Ports}}}','metardu-schema-rehearsal-20261008'],{encoding:'utf8',timeout:30000,windowsHide:true}))
assert.equal(service.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0');assert.equal(service.Purpose,'schema-rehearsal')
assert.deepEqual(service.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
const base='http://127.0.0.1:3021',surfacePath=`/api/project/${fixture.projectId}/surfaces`,root=terrain?'.cache/terrain-domain':'.cache/surface-request-recovery'
mkdirSync(root,{recursive:true})
const canonical=value=>JSON.stringify(sort(value))
function sort(value){return Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value}
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex')
const report={status:'running',origin:base,userId:fixture.userId,projectId:fixture.projectId,checks:[],productionChanged:false,entitlementChanged:false,browserProof:false,fieldProof:false,positivePaidExportProof:false}
const save=()=>writeFileSync(`${root}/http.json`,JSON.stringify(report,null,2)+'\n')
const check=name=>{report.checks.push(name);save();console.log('PASS '+name)}
function actor(){
  const cookies=new Map()
  return async function send(pathname,body,form=false,attempt=0){
    assert.ok(pathname.startsWith('/api/'))
    const response=await fetch(base+pathname,{method:body===undefined?'GET':'POST',redirect:'manual',signal:AbortSignal.timeout(180000),headers:{Origin:base,
      ...(body===undefined?{}:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'}),...(cookies.size?{Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')}:{})},
      ...(body===undefined?{}:{body:form?new URLSearchParams(body).toString():JSON.stringify(body)})})
    for(const item of response.headers.getSetCookie()){const pair=item.split(';',1)[0],index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1))}
    const data=await response.json()
    if(response.status===429&&attempt<3){
      console.log('WAIT ordinary HTTP rate window (60 seconds)')
      await new Promise(resolve=>setTimeout(resolve,60000))
      return send(pathname,body,form,attempt+1)
    }
    return{response,data}
  }
}
const client=new pg.Client({connectionString:'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify',connectionTimeoutMillis:5000,statement_timeout:10000})
const snapshot=async()=>({
  points:(await client.query('SELECT * FROM survey_points WHERE project_id=$1 ORDER BY id',[fixture.projectId])).rows,
  reference:(await client.query('SELECT * FROM project_reference_systems WHERE project_id=$1',[fixture.projectId])).rows,
  subscriptions:(await client.query('SELECT * FROM user_subscriptions WHERE user_id=$1 ORDER BY id',[fixture.userId])).rows,
  role:(await client.query('SELECT id,email,role FROM users WHERE id=$1',[fixture.userId])).rows,
  files:(await client.query('SELECT * FROM file_uploads WHERE project_id=$1 ORDER BY id',[fixture.projectId])).rows,
  documents:(await client.query('SELECT * FROM deliverables WHERE project_id=$1 ORDER BY id',[fixture.projectId])).rows,
})
await client.connect()
try{
  assert.equal((await client.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'METARDU synthetic beacon verification only 2026-10-08')
  const project=(await client.query('SELECT user_id,name FROM projects WHERE id=$1',[fixture.projectId])).rows[0]
  assert.equal(project.user_id,fixture.userId);assert.equal(project.name,fixture.projectName)
  const before=await snapshot();assert.equal(before.role[0].role,'user');assert.equal(before.points.length,5)
  const sourceFiles=['src/app/api/project/[id]/surfaces/route.ts','src/lib/topo/surfaceRevision.ts','src/lib/topo/surfaceRequest.ts','src/lib/topo/surfaceExport.ts','src/app/api/topo/export/dxf/route.ts','src/lib/topo/surfaceDrawing.ts',...(terrain?['src/lib/topo/terrainDomain.ts','src/lib/topo/terrainDomainValidation.ts']:[])]
  const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]))
  report.source=hashes()
  const anonymous=actor();assert.equal((await anonymous(surfacePath)).response.status,401);check('anonymous surface inventory refused')
  const request=actor(),csrf=await request('/api/auth/csrf');assert.ok(csrf.data.csrfToken)
  await request('/api/auth/callback/credentials',{csrfToken:csrf.data.csrfToken,email:fixture.email,password:'Local-Topo-Acceptance-Only-2026!',callbackUrl:base+'/topographic-workflow',json:'true'},true)
  const session=await request('/api/auth/session');assert.equal(session.data.user?.id,fixture.userId);assert.ok(!['admin','super_admin'].includes(session.data.user.role));check('normal login retains exact ordinary synthetic identity')
  const subscription=await request('/api/subscription');assert.equal(subscription.response.status,200);assert.equal(subscription.data.plan,'free');assert.equal(subscription.data.isAdmin,false);check('the restored free entitlement remains free without admin access')
  const context=await request(`/api/project/${fixture.projectId}/point-imports`)
  assert.equal(context.response.status,200);assert.equal(context.data.data.referenceSystem.prs.verticalDatum,'Synthetic local benchmark - no field evidence')
  const referenceHash=context.data.data.referenceHash;assert.match(referenceHash,/^[a-f0-9]{64}$/)
  const points=await request(`/api/project/${fixture.projectId}/points?includeIncomplete=true`);assert.equal(points.response.status,200)
  const ids=points.data.data.map(point=>point.id).sort();assert.deepEqual(ids,before.points.map(point=>point.id).sort())
  check('all five retained points and reviewed reference load through ordinary HTTP')
  const expectedSourceHash=digest({version:1,referenceHash,points:points.data.data.map(point=>({id:point.id,pointName:point.point_name,x:point.easting,y:point.northing,z:point.elevation,code:point.code||'UNK',horizontalCrs:point.horizontal_crs,verticalDatum:point.vertical_datum})).sort((a,b)=>a.id.localeCompare(b.id))})
  const terrainDefinition=terrain?{terrainDomain:{horizontalCrs:'EPSG:21037',units:'metres',sourceLabel:'SYNTHETIC analytical footprint - no field evidence',supportUseReviewed:true,
    regions:[{outer:[[500002,9850002],[500018,9850002],[500018,9850018],[500002,9850018]].map(([x,y])=>({x,y})),
      holes:[[[500008,9850008],[500012,9850008],[500012,9850012],[500008,9850012]].map(([x,y])=>({x,y}))]}]},
    breaklineChains:[{name:'SYNTHETIC measured chain',type:'hard',sourceLabel:'Original synthetic P1-P5-P3',reviewed:true,
      pointIds:['P1','P5','P3'].map(name=>{const point=points.data.data.find(point=>point.point_name===name);assert.ok(point);return point.id})}]}:{}
  const candidate={name:terrain?'SYNTHETIC terrain footprint HTTP acceptance - not field evidence':'SYNTHETIC request-recovery HTTP acceptance - not field evidence',requestId:randomUUID(),expectedUserId:fixture.userId,pointIds:ids,expectedReferenceHash:referenceHash,expectedSourceHash,useStoredBreaklines:false,interval:1,resolution:1,...terrainDefinition}
  const inputFile=`${root}/http-request.json`,input=existsSync(inputFile)?JSON.parse(readFileSync(inputFile,'utf8')):candidate
  const {requestId:discard,...payload}=input;void discard
  assert.equal(input.expectedUserId,fixture.userId);assert.equal(input.name,candidate.name);assert.equal(input.expectedSourceHash,expectedSourceHash);assert.equal(input.expectedReferenceHash,referenceHash);assert.deepEqual(input.pointIds,ids)
  if(terrain){assert.deepEqual(input.terrainDomain,candidate.terrainDomain);assert.deepEqual(input.breaklineChains,candidate.breaklineChains)}
  const payloadHash=digest({...payload,pointIds:[...payload.pointIds].sort()});writeFileSync(inputFile,JSON.stringify(input,null,2)+'\n')
  const missing=await request(surfacePath,{...input,requestId:undefined});assert.ok([400,422].includes(missing.response.status));check('mutation without a durable request identity is refused')
  const computed=await request(surfacePath,input);assert.ok([200,201].includes(computed.response.status),JSON.stringify(computed.data))
  const revisionId=computed.data.data.revisionId;report.createdSurface=computed.response.status===201;report.requestId=input.requestId
  assert.equal(computed.data.data.requestId,input.requestId);assert.equal(computed.data.data.requestHash,payloadHash)
  const revisionRows=async()=>(await client.query('SELECT r.* FROM surface_revisions r JOIN surfaces s ON s.id=r.surface_id WHERE s.project_id=$1 ORDER BY r.id',[fixture.projectId])).rows
  const afterFirst=await revisionRows(),replayed=await request(surfacePath,input)
  assert.equal(replayed.response.status,200);assert.equal(replayed.data.data.revisionId,revisionId);assert.equal(replayed.data.data.replayed,true);assert.deepEqual(await revisionRows(),afterFirst);check('lost-response retry reuses the exact immutable revision without appending')
  const recovered=await request(`${surfacePath}?${new URLSearchParams({requestId:input.requestId,requestHash:payloadHash})}`)
  assert.equal(recovered.response.status,200);assert.equal(recovered.data.data.revisionId,revisionId);check('read-only request recovery returns the exact acknowledged original')
  const conflicting=await request(surfacePath,{...input,interval:2});assert.equal(conflicting.response.status,409);assert.deepEqual(await revisionRows(),afterFirst);check('changed intent cannot reuse a committed request identity')
  if(terrain){
    const changed=JSON.parse(JSON.stringify(input));changed.terrainDomain.regions[0].outer[0].x+=1
    assert.equal((await request(surfacePath,changed)).response.status,409);assert.deepEqual(await revisionRows(),afterFirst);check('changed terrain geometry cannot reuse a committed request identity')
    for(const kind of ['basis','self-crossing','uncovered','foreign-chain']){
      const bad=JSON.parse(JSON.stringify(input));bad.requestId=randomUUID()
      if(kind==='basis')bad.terrainDomain.horizontalCrs='EPSG:4326'
      if(kind==='self-crossing'){const ring=bad.terrainDomain.regions[0].outer;[ring[1],ring[2]]=[ring[2],ring[1]]}
      if(kind==='uncovered')bad.terrainDomain.regions[0].outer[0].x=499999
      if(kind==='foreign-chain')bad.breaklineChains[0].pointIds[0]=randomUUID()
      const refused=await request(surfacePath,bad);assert.equal(refused.response.status,400,JSON.stringify(refused.data));assert.deepEqual(await revisionRows(),afterFirst);check(`real HTTP refuses ${kind} terrain definition without a new revision`)
    }
  }
  const stale=await request(surfacePath,{...input,requestId:randomUUID(),expectedSourceHash:'f'.repeat(64)});assert.equal(stale.response.status,409);assert.equal(stale.data.details.requestOutcome,'rejected');assert.deepEqual(await revisionRows(),afterFirst);check('a stale measurement review is explicitly rejected without a new revision')
  assert.match(revisionId,/^[a-f0-9-]{36}$/);report.revisionId=revisionId
  const retained=await request(`${surfacePath}?contourRevision=${revisionId}`)
  assert.equal(retained.response.status,200,JSON.stringify(retained.data));const saved=retained.data.data
  assert.equal(saved.projectId,fixture.projectId);assert.equal(saved.revisionId,revisionId);assert.equal(saved.fieldVerified,false)
  assert.equal(saved.snapshot.referenceHash,referenceHash);assert.deepEqual(saved.snapshot.observations.map(point=>point.id).sort(),ids)
  assert.deepEqual(saved.snapshot.observations.map(point=>point.z).sort((a,b)=>a-b),[-2,0,0,0,2])
  assert.deepEqual(saved.contours.map(line=>line.elevation).sort((a,b)=>a-b),[-1,0,1]);check('saved source, zero/negative heights, contour outputs and exact revision reload together')
  if(terrain){
    assert.deepEqual(saved.snapshot.terrainDomain,input.terrainDomain)
    assert.ok(Math.abs(saved.domain.area-240)<1e-8)
    assert.deepEqual(saved.domain.supportCounts,{inside:0,outside:4,exclusion:1})
    assert.ok(saved.domain.derivedVertexCount>0)
    assert.equal(saved.contours.reduce((sum,line)=>sum+line.coordinates.length,0),4)
    assert.equal(saved.contours.find(line=>line.elevation===0).coordinates.length,2)
    assert.deepEqual(saved.snapshot.breaklineSources[0].pointIds,input.breaklineChains[0].pointIds)
    assert.deepEqual(saved.snapshot.breaklines[0].points.map(point=>point.z),[-2,0,2])
    writeFileSync(`${root}/http-retained.json`,JSON.stringify(saved,null,2)+'\n')
    check('exact retained footprint is 240 m2 with a split zero contour, measured chain and explicit support roles')
  }
  const foreign=await request(`/api/project/3801daa3-b41f-41be-9a85-1b8c71b531cf/surfaces?contourRevision=${revisionId}`)
  assert.ok([403,404].includes(foreign.response.status));check('another account project cannot read this revision')
  const exportInput={projectId:fixture.projectId,surfaceRevisionId:revisionId,expectedUserId:fixture.userId,requestId:randomUUID()}
  const denied=await request('/api/topo/export/dxf',exportInput)
  assert.equal(denied.response.status,403,JSON.stringify(denied.data));check('real free-plan DXF export is refused before storage or registration')
  assert.equal(denied.data.details.requestOutcome,'rejected');assert.equal(denied.data.details.requestId,exportInput.requestId)
  const noExport=await request(`/api/topo/export/dxf?${new URLSearchParams(exportInput)}`);assert.equal(noExport.response.status,404);check('read-only export recovery cannot create a paid artifact')
  assert.deepEqual(await snapshot(),before);report.originalsRoleEntitlementFilesAndRegisterUnchanged=true
  const row=(await client.query('SELECT r.id,r.result,r.input_hash FROM surface_revisions r JOIN surfaces s ON s.id=r.surface_id WHERE r.id=$1 AND s.project_id=$2',[revisionId,fixture.projectId])).rows[0]
  assert.equal(row.result.snapshot.referenceHash,referenceHash);assert.equal(row.input_hash,saved.inputHash);check('HTTP acknowledgement matches the exact marked synthetic database revision')
  assert.deepEqual(hashes(),report.source);report.sourceUnchangedDuringRun=true;report.status='passed';save()
}catch(error){report.status='failed';report.error=error.message;save();throw error}finally{await client.end()}
