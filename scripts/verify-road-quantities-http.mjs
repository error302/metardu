// Native source-only API proof. Reuse the existing marked synthetic DB/server.
// Immutable synthetic evidence is retained; QA accounts are disabled afterward.
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {mkdirSync,writeFileSync,readFileSync,existsSync,unlinkSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import {rehearsalDatabaseConfig} from './rehearsal-database.mjs'
import {collectFileMigrations,computeDrift} from './verify-migrations.mjs'
const config=rehearsalDatabaseConfig(),base='http://127.0.0.1:3021'
assert.equal(config.database,'metardu_runtime_verify');assert.equal(new URL(config.adminUrl).port,'55433')
const directory='.cache/release-verify/road-quantities-http',privatePath=directory+'/browser-qa.json'
mkdirSync(directory,{recursive:true})
const admin=new pg.Client({connectionString:config.adminUrl,connectionTimeoutMillis:5000})
const label='SYNTHETIC road quantity verification',marker='METARDU synthetic beacon verification only 2026-10-08'
const report={scope:'source-only synthetic',base,checks:[],fixtures:{},status:'checking',customerDataCopied:false,newContainer:false}
const save=()=>writeFileSync(directory+'/result.json',JSON.stringify(report,null,2)+'\n')
const check=(name,passed=true)=>{assert.ok(passed,name);report.checks.push({name,passed:true});save();console.log('PASS '+name)}
const actor=()=>{
  const cookies=new Map()
  return async(path,body,form=false,method)=>{
    const response=await fetch(base+path,{method:method??(body===undefined?'GET':'POST'),redirect:'manual',signal:AbortSignal.timeout(60000),headers:{Origin:base,...(body===undefined?{}:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'}),...(cookies.size?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{})},...(body===undefined?{}:{body:form?new URLSearchParams(body).toString():JSON.stringify(body)})})
    for(const item of response.headers.getSetCookie()){const pair=item.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
    return{response,data:await response.json().catch(()=>null)}
  }
}
await admin.connect()
let actors=[],marked=false,created=false,keepBrowser=false
try {
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,marker);marked=true
  if(process.argv.includes('--cleanup-browser')){
    assert.ok(existsSync(privatePath),'Inspect an existing browser fixture instead of inventing one.')
    const state=JSON.parse(readFileSync(privatePath,'utf8'))
    assert.match(state.email,/^quantity-[a-f0-9-]{36}@example\.invalid$/)
    const rows=await admin.query('SELECT id FROM users WHERE id=$1 AND email=$2 AND full_name=$3',[state.userId,state.email,label])
    assert.equal(rows.rowCount,1)
    await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=$1',[state.userId])
    unlinkSync(privatePath)
    const prior=JSON.parse(readFileSync(directory+'/result.json','utf8'));prior.syntheticActorsDisabled=true;prior.browserQaPending=false
    writeFileSync(directory+'/result.json',JSON.stringify(prior,null,2)+'\n')
    console.log('Exact synthetic browser account disabled; generated credential file removed.')
  } else {
    assert.ok(!existsSync(privatePath),'Complete the existing browser QA fixture first.')
    const inspection=spawnSync('docker',['inspect','metardu-schema-rehearsal-20261008'],{encoding:'utf8',windowsHide:true});assert.equal(inspection.status,0)
    const fixture=JSON.parse(inspection.stdout)[0]
    assert.equal(fixture.Id,'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
    assert.equal(fixture.Config.Labels['metardu.purpose'],'schema-rehearsal')
    assert.deepEqual(fixture.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55433'}])
    const ledger=(await admin.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
    assert.ok(computeDrift(collectFileMigrations(),ledger).ok)
    const runtime=(await admin.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[config.runtimeRole])).rows[0]
    assert.ok(runtime&&!runtime.rolsuper&&!runtime.rolbypassrls)
    check('exact owned synthetic fixture, restricted runtime and unchanged migration hashes verified')
    const owner=randomUUID(),other=randomUUID(),project=randomUUID(),alignment=randomUUID(),password=randomBytes(32).toString('base64url')
    actors=[owner,other];report.fixtures={actors,project,alignment};save()
    const template={carriagewayWidth:6,shoulderWidth:0,camber:0,subgradeDepth:0,cutSlope:'1:1',fillSlope:'1:1'}
    const profile=level=>({level,profile:[{offset:-10,level},{offset:0,level},{offset:10,level}]})
    const road={roadName:'SYNTHETIC quantity road',startChainage:0,coordinateSystem:'EPSG:32737',datum:'WGS84',designSpeed:40,roadClass:'C',ips:[],vips:[],crossSectionTemplate:template,stations:[0,20].map(chainage=>({chainage,groundLevel:0,designLevel:-1,groundProfile:profile(0).profile}))}
    const hash=await bcrypt.hash(password,10)
    await admin.query('BEGIN')
    for(const id of actors)await admin.query("INSERT INTO users(id,email,password_hash,full_name,role,email_verified) VALUES($1,$2,$3,$4,'user',true)",[id,`quantity-${id}@example.invalid`,hash,label])
    await admin.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false),($2,'surveyor',false)",actors)
    await admin.query("INSERT INTO projects(id,user_id,name,survey_type,engineering_data) VALUES($1,$2,'SYNTHETIC quantity record - NOT FIELD EVIDENCE','engineering',$3)",[project,owner,JSON.stringify({mode:'road',standard:'KRDM2017',road})])
    await admin.query("INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by) VALUES($1,'EPSG:32737','Synthetic WGS84 UTM 37S','WGS84','metres',37,'S','Synthetic BM','local','grid',3,$2)",[project,owner])
    await admin.query("INSERT INTO road_alignments(id,project_id,road_name,start_chainage,coordinate_system,cross_section_template) VALUES($1,$2,$3,0,'EPSG:32737',$4)",[alignment,project,road.roadName,JSON.stringify(template)])
    for(const chainage of [0,20])await admin.query("INSERT INTO cross_section_stations(alignment_id,chainage,existing_ground,proposed_road) VALUES($1,$2,$3,'{\"designLevel\":-1,\"designLevelSource\":\"manual\"}')",[alignment,chainage,JSON.stringify(profile(0))])
    await admin.query('INSERT INTO earthworks_results(alignment_id,chainage,cut_area,cut_volume) VALUES($1,123,999,999)',[alignment])
    await admin.query('COMMIT');created=true
    const legacy=async()=>JSON.stringify((await admin.query('SELECT to_jsonb(t) value FROM earthworks_results t WHERE alignment_id=$1 ORDER BY id',[alignment])).rows)
    const legacyBefore=await legacy(),path=`/api/engineering/earthworks?alignment_id=${alignment}`
    const login=async id=>{const request=actor(),csrf=await request('/api/auth/csrf');assert.ok(csrf.data?.csrfToken)
      const callback=await request('/api/auth/callback/credentials',{csrfToken:csrf.data.csrfToken,email:`quantity-${id}@example.invalid`,password,callbackUrl:base+'/dashboard',json:'true'},true)
      const session=await request('/api/auth/session')
      report.lastLogin={csrfStatus:csrf.response.status,callbackStatus:callback.response.status,callbackRejected:String(callback.data?.url??'').includes('error='),sessionStatus:session.response.status,authenticated:session.data?.user?.id===id};save()
      assert.equal(session.data?.user?.id,id,'The source must authenticate this exact synthetic actor.');return request}
    const owned=await login(owner),foreign=await login(other)
    check('exact owner and other actor authenticate through real source credential sessions')
    check('anonymous preview requires authentication',(await actor()(path+'&preview=1')).response.status===401)
    const preview=await owned(path+'&preview=1')
    report.preview={status:preview.response.status,code:preview.data?.code??null,error:preview.data?.error??null};save()
    check('real source preview computes the independent 140m3 cut and zero fill',preview.response.status===200&&preview.data?.data?.result.totalCut===140&&preview.data.data.result.totalFill===0)
    const body={alignment_id:alignment,client_run_id:randomUUID(),expected_input_hash:preview.data.data.input_hash}
    check('caller-authored reductions and methods are rejected',(await owned('/api/engineering/earthworks',{...body,method:'fake',results:[{cut_volume:999}]})).response.status===400)
    check('another account cannot read the owned quantity preview',[403,404].includes((await foreign(path+'&preview=1')).response.status))
    check('another account cannot record owned quantities',[403,404].includes((await foreign('/api/engineering/earthworks',body)).response.status))
    const saved=await owned('/api/engineering/earthworks',body)
    check('native record retains a draft result and source snapshot',saved.response.status===201&&saved.data?.data?.status==='DRAFT'&&saved.data.data.quantity.result.totalCut===140&&saved.data.data.quantity.inputs.road.stations[0].groundLevel===0)
    const first=saved.data.data
    const replay=await owned('/api/engineering/earthworks',body)
    check('retry reopens the same JSONB-serialized immutable run',replay.response.status===200&&replay.data.data.id===first.id&&replay.data.replayed===true)
    check('changed hash cannot reuse a delivery ID',(await owned('/api/engineering/earthworks',{...body,expected_input_hash:'b'.repeat(64)})).response.status===409)
    const retry={...body,client_run_id:randomUUID()}
    const pair=await Promise.all([owned('/api/engineering/earthworks',retry),owned('/api/engineering/earthworks',retry)])
    check('concurrent duplicate delivery commits once and repeated runs remain DRAFT',pair.every(r=>[200,201].includes(r.response.status)&&r.data.data.status==='DRAFT')&&pair[0].data.data.id===pair[1].data.data.id)
    const summaries=await owned(path)
    check('history returns lightweight private summaries',summaries.response.status===200&&summaries.response.headers.get('cache-control')==='private, no-store'&&summaries.data.data.length===2&&summaries.data.data.every(row=>row.payload===undefined&&row.total_cut===140))
    check('other-account archive access is denied',[403,404].includes((await foreign(path+'&run_id='+first.id)).response.status))
    const membership=(await admin.query("INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'viewer') RETURNING id",[project,other])).rows[0].id
    try {
      const reference=await foreign(`/api/project/${project}/reference-system`)
      report.readerReference={status:reference.response.status,code:reference.data?.code??null,referencePresent:Boolean(reference.data?.referenceSystem),crs:reference.data?.referenceSystem?.prs?.horizontalCrs??null};save()
      check('authorized project reader can load the private declared reference',reference.response.status===200&&reference.data.referenceSystem.prs.horizontalCrs==='EPSG:32737')
      const readOnly=await foreign(path)
      check('project reader receives history with recording explicitly disabled',readOnly.response.status===200&&readOnly.data.can_record===false&&readOnly.data.data.length===2)
      check('project reader still cannot record or change reference settings',(await foreign('/api/engineering/earthworks',{...body,client_run_id:randomUUID()})).response.status===403&&(await foreign(`/api/project/${project}/reference-system`,{},false,'PUT')).response.status===403)
    } finally {await admin.query('DELETE FROM project_members WHERE id=$1 AND project_id=$2 AND user_id=$3',[membership,project,other])}
    // Inject one failing INSERT only for this exact synthetic project/delivery.
    // The established writer retires its predecessor before INSERT, so this
    // verifies the real API transaction restores that predecessor on failure.
    const failureDelivery=randomUUID()
    assert.equal((await admin.query("SELECT to_regprocedure('public.metardu_quantity_qa_reject()') existing")).rows[0].existing,null)
    assert.equal((await admin.query("SELECT count(*)::int n FROM pg_trigger WHERE tgname='metardu_quantity_qa_reject'")).rows[0].n,0)
    let triggerIdentity
    try {
      await admin.query('BEGIN')
      await admin.query(`CREATE FUNCTION public.metardu_quantity_qa_reject() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.project_id='${project}'::uuid AND NEW.entity_type='alignment-earthworks'
          AND NEW.payload #>> '{quantityRun,clientRunId}'='${failureDelivery}' THEN
          RAISE EXCEPTION 'SYNTHETIC quantity insert failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`)
      await admin.query('CREATE TRIGGER metardu_quantity_qa_reject BEFORE INSERT ON design_revisions FOR EACH ROW EXECUTE FUNCTION public.metardu_quantity_qa_reject()')
      await admin.query('COMMIT')
      triggerIdentity=(await admin.query("SELECT oid,tgfoid FROM pg_trigger WHERE tgname='metardu_quantity_qa_reject' AND tgrelid='public.design_revisions'::regclass")).rows[0]
      assert.ok(triggerIdentity)
      const failed=await owned('/api/engineering/earthworks',{...body,client_run_id:failureDelivery})
      const preserved=(await admin.query("SELECT id,status FROM design_revisions WHERE project_id=$1 AND entity_type='alignment-earthworks' ORDER BY revision_number DESC",[project])).rows
      check('real API insertion failure rolls back predecessor retirement and creates no partial run',!failed.response.ok&&preserved.length===2&&preserved[0].id===pair[0].data.data.id&&preserved[0].status==='DRAFT')
    } finally {
      await admin.query('ROLLBACK').catch(()=>{})
      if(triggerIdentity){
        const current=(await admin.query("SELECT oid,tgfoid FROM pg_trigger WHERE tgname='metardu_quantity_qa_reject' AND tgrelid='public.design_revisions'::regclass")).rows[0]
        assert.deepEqual(current,triggerIdentity,'Never remove a replaced or unrelated trigger.')
        await admin.query('BEGIN')
        await admin.query('DROP TRIGGER metardu_quantity_qa_reject ON public.design_revisions')
        await admin.query('DROP FUNCTION public.metardu_quantity_qa_reject()')
        await admin.query('COMMIT')
        check('exact temporary fault-injection trigger and function were removed')
      }
    }
    await admin.query('UPDATE cross_section_stations SET existing_ground=$2 WHERE alignment_id=$1',[alignment,JSON.stringify(profile(1))])
    check('changed saved inputs reject a stale recording',(await owned('/api/engineering/earthworks',{...body,client_run_id:randomUUID()})).response.status===409)
    const changed=await owned(path+'&preview=1')
    check('updated measured profile recomputes to independently known 320m3',changed.response.status===200&&changed.data.data.result.totalCut===320)
    await admin.query("UPDATE cross_section_stations SET existing_ground='{}' WHERE alignment_id=$1",[alignment])
    check('incomplete measured profiles block a new preview',(await owned(path+'&preview=1')).response.status===422)
    const archived=await owned(path+'&run_id='+first.id)
    check('archive preserves original 140m3 and source despite cleared current profiles',archived.response.status===200&&archived.data.data.quantity.result.totalCut===140&&archived.data.data.quantity.inputs.road.stations[0].groundProfile.length===3)
    await admin.query('BEGIN');let refused=false
    try{await admin.query("UPDATE design_revisions SET payload='{}' WHERE id=$1",[first.id])}catch(error){refused=error.code==='55000'}finally{await admin.query('ROLLBACK')}
    check('native database trigger rejects rewriting quantity evidence',refused)
    check('legacy caller-authored quantities remain byte-for-byte unchanged',await legacy()===legacyBefore)
    await admin.query('UPDATE cross_section_stations SET existing_ground=$2 WHERE alignment_id=$1',[alignment,JSON.stringify(profile(0))])
    assert.deepEqual((await admin.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows,ledger)
    check('verification made no schema or historical migration changes')
    if(process.argv.includes('--prepare-browser')){
      writeFileSync(privatePath,JSON.stringify({userId:owner,email:`quantity-${owner}@example.invalid`,password,projectId:project,alignmentId:alignment,origin:base}),{mode:0o600})
      keepBrowser=true
    }
    report.status='passed';save()
  }
}catch(error){report.status='failed';report.failure=error.message;save();throw error}
finally{
  await admin.query('ROLLBACK').catch(()=>{})
  if(marked&&created){const disabled=keepBrowser?actors.slice(1):actors;await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[disabled]);report.syntheticActorsDisabled=!keepBrowser;report.browserQaPending=keepBrowser;save()}
  await admin.end()
}
if(!process.argv.includes('--cleanup-browser'))console.log(JSON.stringify({status:report.status,checks:report.checks.length,browserQaPending:keepBrowser,customerDataCopied:false,newContainer:false}))
