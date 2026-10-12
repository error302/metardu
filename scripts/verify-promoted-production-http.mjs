// Normal-account HTTP proof on the one promoted production application.
// Writes only clearly labelled, newly created synthetic fixtures. Immutable
// evidence is retained; fixture accounts are disabled and sessions revoked.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { jsPDF } from 'jspdf'
import { PDFDocument } from 'pdf-lib'

const base='http://127.0.0.1:3000'
const workflowSource=process.argv.includes('--workflow-source')
const noticeWorkerSource=process.argv.includes('--notice-worker-source')
assert.ok([workflowSource,noticeWorkerSource,process.argv.includes('--connector-source')].filter(Boolean).length<=1,'Choose one release namespace')
const evidence=noticeWorkerSource?'test-results/notice-worker-release':workflowSource?'test-results/workflow-source-release':process.argv.includes('--connector-source')?'test-results/connector-source-release':'test-results/production-upgrade'
const promotion=JSON.parse(readFileSync(`${evidence}/promotion.json`,'utf8'))
const report={scope:'Normal-account synthetic HTTP checks on actual promoted production',base,customerFixturesModified:false,externalEmailSent:false,checks:[],status:'prepared',cleanup:{}}
const ids={owner:randomUUID(),other:randomUUID()}
const password=randomBytes(32).toString('hex')
const email=id=>`synthetic-production-check-${id}@example.invalid`
let admin,seeded=false,storedPath,owner
function save(){mkdirSync(evidence,{recursive:true});writeFileSync(`${evidence}/normal-account-http.json`,JSON.stringify(report,null,2)+'\n')}
function check(name,value,detail={}){report.checks.push({name,passed:Boolean(value),...detail});save();console.log(`${value?'PASS':'FAIL'} ${name}`);assert.ok(value,name)}
function docker(args){const result=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30_000,maxBuffer:5*1024*1024});assert.equal(result.status,0,'Docker inspection failed; sensitive details suppressed');return result.stdout}
function sessionClient(){
  const cookies=new Map()
  return async (pathname,init={})=>{
    const response=await fetch(base+pathname,{...init,redirect:'manual',signal:AbortSignal.timeout(30_000),headers:{...init.headers,...(cookies.size?{Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')}:{})}})
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],split=pair.indexOf('=');cookies.set(pair.slice(0,split),pair.slice(split+1))}
    return response
  }
}
async function login(id){
  const request=sessionClient(),csrf=await(await request('/api/auth/csrf')).json()
  const callback=await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.csrfToken,email:email(id),password,callbackUrl:base+'/dashboard',json:'true'})})
  const session=await(await request('/api/auth/session')).json()
  check('normal credentials session authenticates synthetic account',callback.status===200 && session.user?.id===id && session.user.role!=='admin' && session.user.role!=='super_admin')
  return request
}
const json=body=>({headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
try{
  assert.equal(promotion.status,'promoted','Complete promotion first')
  const app=JSON.parse(docker(['inspect','metardu-app']))[0]
  assert.equal(app.Image,promotion.applicationAfter.image)
  assert.equal(app.State.Health.Status,'healthy')
  const config=JSON.parse(docker(['compose','-f','docker-compose.yml','config','--format','json']))
  const pgEnv=config.services['metardu-postgres'].environment
  admin=new pg.Client({host:'127.0.0.1',port:5432,user:pgEnv.POSTGRES_USER,password:pgEnv.POSTGRES_PASSWORD,database:pgEnv.POSTGRES_DB,connectionTimeoutMillis:10_000})
  await admin.connect()
  assert.equal((await admin.query('SELECT count(*)::integer AS count FROM public.schema_migrations')).rows[0].count,109)
  report.imageId=app.Image
  if(!process.argv.includes('--execute')){save();console.log('Prepared only; --execute performs the isolated synthetic workflow.');await admin.end();admin=null;process.exit(0)}
  await admin.query('BEGIN')
  const passwordHash=await bcrypt.hash(password,10)
  for(const id of Object.values(ids)){
    await admin.query("INSERT INTO public.users(id,email,password_hash,full_name,role,email_verified) VALUES($1,$2,$3,'SYNTHETIC PRODUCTION VERIFICATION','user',TRUE)",[id,email(id),passwordHash])
    await admin.query("INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',FALSE)",[id])
  }
  await admin.query('COMMIT');seeded=true;report.syntheticAccountIds=Object.values(ids)
  const anonymous=sessionClient()
  check('anonymous projects are denied',(await anonymous('/api/projects')).status===401)
  owner=await login(ids.owner);const other=await login(ids.other)
  const created=await owner('/api/projects',{method:'POST',...json({name:'SYNTHETIC PRODUCTION VERIFICATION — NOT FIELD DATA',survey_type:'engineering',location:'Synthetic UTM fixture only',utm_zone:36,hemisphere:'N',datum:'WGS84'})})
  const project=(await created.json()).data
  check('normal account creates its own project',created.status===201 && typeof project?.id==='string')
  report.syntheticProjectId=project.id
  check('legacy project display fields do not authorize coordinate export',(await owner(`/api/project/${project.id}/export?format=csv`)).status===400)
  const declaration=await owner(`/api/project/${project.id}/reference-system`,{method:'PUT',...json({datum:'WGS84',utmZone:36,hemisphere:'N',distanceMode:'grid',coordinatePrecision:4,notes:'SYNTHETIC verification, not a surveyed reference'})})
  check('normal account saves explicit project CRS declaration',declaration.status===200)
  const pointResponse=await owner(`/api/project/${project.id}/points`,{method:'POST',...json({pointName:'SYN-PRODUCTION-ZERO',easting:500000.1234,northing:0,elevation:null,description:'Synthetic coordinate; no measured height or field certification'})})
  const point=(await pointResponse.json()).data
  check('point capture preserves zero northing, precision and unknown height',pointResponse.status===201 && point.easting===500000.1234 && point.northing===0 && point.elevation===null)
  for(const suffix of ['', '/reference-system','/points']){
    const response=await owner(`/api/project/${project.id}${suffix}`)
    check(`owner private response ${suffix||'/project'} is readable and uncached`,response.status===200 && response.headers.get('cache-control')==='private, no-store')
    check(`another account cannot read ${suffix||'/project'}`,[403,404].includes((await other(`/api/project/${project.id}${suffix}`)).status))
  }
  const csvResponse=await owner(`/api/project/${project.id}/export?format=csv`),csv=await csvResponse.text()
  report.syntheticExportDiagnostic={status:csvResponse.status,measurementLineMatched:csv.includes('"SYN-PRODUCTION-ZERO",500000.1234,0.0000,,survey'),cacheControl:csvResponse.headers.get('cache-control'),registerWarning:csvResponse.headers.has('X-Metardu-Register-Warning'),errorCode:csv.startsWith('{')?JSON.parse(csv).code??null:null}
  if(csv.startsWith('point_name,'))writeFileSync(`${evidence}/synthetic-coordinate-download.csv`,csv)
  check('actual coordinate download preserves measurements and registers evidence',csvResponse.status===200 && csv.includes('"SYN-PRODUCTION-ZERO",500000.1234,0.0000,,survey') && csvResponse.headers.get('cache-control')==='private, no-store' && !csvResponse.headers.has('X-Metardu-Register-Warning'))
  report.syntheticCsvSha256=createHash('sha256').update(csv).digest('hex')
  const geoResponse=await owner(`/api/project/${project.id}/export?format=geojson`),geo=await geoResponse.json()
  check('actual GeoJSON keeps missing height unknown',geoResponse.status===200 && geo.features?.[0]?.geometry?.coordinates?.length===2 && geo.features[0].properties.elevation_m===null)
  const ownerAudit=await owner(`/api/fieldbook/audit?project_id=${project.id}`),audit=await ownerAudit.json()
  check('actual point change produces owner-visible private audit',ownerAudit.status===200 && audit.events?.some(event=>event.row_id===point.id) && ownerAudit.headers.get('cache-control')?.includes('no-store'))
  const deniedAudit=await(await other(`/api/fieldbook/audit?project_id=${project.id}`)).json()
  check('another account cannot read private project audit',deniedAudit.events?.length===0)
  const bytes=Buffer.from('SYNTHETIC METARDU storage verification\n500000.1234,0,unknown-height\n')
  const form=new FormData();form.set('file',new File([bytes],'synthetic-coordinate-check.csv',{type:'text/csv'}));form.set('bucket','synthetic-production-verification');form.set('projectId',project.id)
  const uploaded=await owner('/api/storage',{method:'POST',body:form}),upload=await uploaded.json()
  check('actual runtime can store owned synthetic file',uploaded.status===200 && typeof upload.data?.path==='string')
  storedPath=upload.data.path
  assert.ok(storedPath.startsWith(`synthetic-production-verification/${ids.owner}/`))
  const download=await owner(`/api/storage?path=${encodeURIComponent(storedPath)}`)
  check('actual stored download matches input bytes privately',download.status===200 && Buffer.from(await download.arrayBuffer()).equals(bytes) && download.headers.get('cache-control')==='private, no-store')
  check('another account cannot download synthetic private file',(await other(`/api/storage?path=${encodeURIComponent(storedPath)}`)).status===403)
  const document=new jsPDF();document.text('SYNTHETIC METARDU PRODUCTION PARSER CHECK',15,20)
  const pdfForm=new FormData();pdfForm.set('file',new File([document.output('arraybuffer')],'synthetic-parser-check.pdf',{type:'application/pdf'}))
  const parsedResponse=await owner('/api/parsers/upload',{method:'POST',body:pdfForm}),parsed=await parsedResponse.json()
  check('actual packaged PDF parser reads uploaded text',parsedResponse.status===200 && parsed.success===true && parsed.extractedTextPreview?.includes('SYNTHETIC METARDU PRODUCTION PARSER CHECK'))
  if(workflowSource||noticeWorkerSource){
    const declaration=await owner(`/api/project/${project.id}/reference-system`,{method:'PUT',...json({datum:'WGS84',utmZone:36,hemisphere:'N',distanceMode:'grid',coordinatePrecision:4,verticalDatum:'Synthetic benchmark BM-01',verticalReference:'local',benchmarkBasis:'SYNTHETIC TEST ONLY',notes:'SYNTHETIC PRODUCTION VERIFICATION'})})
    check('production drainage saves an explicit height reference',declaration.status===200)
    const drainage={projectCrs:'EPSG:32636',minimumCoverM:1.2,setoutIntervalM:50,setoutToleranceProfile:{name:'Synthetic drainage criteria',jurisdiction:'Synthetic project only',version:'SYN-R1',horizontalMm:'10',verticalMm:'10',effectiveDate:'2026-10-11',source:'SYNTHETIC TEST REQUIREMENT',approvedBy:'Synthetic test approver',acknowledged:true},manholes:[{id:'MH-A',name:'MH-A',chainage:100,easting:500000,northing:1000,coverLevel:102,invertLevelOut:100,pipeOutsideDiameterOut:315},{id:'MH-B',name:'MH-B',chainage:200,easting:500100,northing:1000,coverLevel:101,invertLevelIn:99}]}
    const saved=await owner('/api/db',{method:'POST',...json({table:'projects',operation:'update',columns:'*',filters:[{column:'id',op:'eq',value:project.id}],payload:{engineering_data:{mode:'drainage',drainage}}})})
    check('production drainage retains owned synthetic design',(await saved.json()).data?.[0]?.id===project.id && saved.status===200)
    const endpoint=`/api/project/${project.id}/setout`
    const generated=await owner(endpoint,{method:'POST',...json({action:'save_drainage_definition'})}),definition=(await generated.json()).data
    check('production drainage generates three revisioned targets',generated.status===201 && definition?.pointCount===3 && definition?.revision===1)
    report.syntheticDrainageDefinitionId=definition.definitionId
    const targetsResponse=await owner(`${endpoint}?definitionId=${definition.definitionId}`),targets=(await targetsResponse.json()).data?.points
    check('production drainage target metadata includes exact grade',targetsResponse.status===200 && targets?.length===3 && targets[1].metadata?.pipeGradientPercent===1 && targets[1].metadata?.pipeLengthM===100 && targets[1].metadata?.pipeFallM===1)
    for(const [index,target] of targets.entries()){
      const shot=await owner(endpoint,{method:'POST',...json({action:'record_observation',definitionId:definition.definitionId,label:target.label,designRevision:1,designEasting:target.easting,designNorthing:target.northing,designRL:target.design_rl,observedEasting:target.easting+(index===1?0.1:0.00321),observedNorthing:target.northing+0.00432,observedRL:index===2?null:target.design_rl+0.0054,accuracyM:0.001,capturedCrs:'EPSG:32636',capturedAt:new Date().toISOString(),clientShotId:randomUUID(),instrument:'Synthetic test instrument',operatorName:'Synthetic operator',notes:'SYNTHETIC PRODUCTION VERIFICATION'})})
      const data=(await shot.json()).data
      check(`production drainage records ${['precise','failed','unknown-height'][index]} evidence`,shot.status===201 && (index===0?data?.result==='PASS':index===1?data?.result==='FAIL':data?.result!=='PASS'))
    }
    const exportPath=`${endpoint}/export?definitionId=${definition.definitionId}&revision=1`
    const response=await owner(`${exportPath}&format=pdf`),bytes=Buffer.from(await response.arrayBuffer())
    assert.equal(response.status,200,'Actual packaged drainage PDF must succeed')
    const pdf=await PDFDocument.load(bytes)
    check('production native drainage PDF is private A4 landscape',response.headers.get('content-type')==='application/pdf' && response.headers.get('cache-control')==='private, no-store' && pdf.getPageCount()===2 && pdf.getPages().every(page=>Math.abs(page.getWidth()-841.89)<2 && Math.abs(page.getHeight()-595.28)<2))
    writeFileSync(`${evidence}/synthetic-production-drainage.pdf`,bytes)
    report.syntheticDrainagePdfSha256=createHash('sha256').update(bytes).digest('hex')
    check('another account is denied production drainage PDF',[403,404].includes((await other(`${exportPath}&format=pdf`)).status))
    const form=new FormData();form.set('file',new File([bytes],'synthetic-production-drainage.pdf',{type:'application/pdf'}))
    const imported=await owner('/api/parsers/upload',{method:'POST',body:form}),parsed=await imported.json(),text=parsed.extractedTextPreview??''
    check('production PDF round trip retains precise captures and draft evidence',imported.status===200 && parsed.success===true && text.includes('100.0054') && text.includes('500000.00321') && text.includes('NOT ASSESSED') && text.includes('FAIL') && text.includes('DRAFT'))
  }
  if(noticeWorkerSource){
    const proof=JSON.parse(readFileSync(`${evidence}/source-checks.json`,'utf8'))
    const response=await anonymous('/api/public/chatgpt-notice'),notice=await response.json()
    check('production notice has reviewed content and no inferred publication date',response.status===200&&notice.version===proof.noticeVersion&&notice.contentSha256===proof.noticeContentSha256&&notice.state==='unpublished'&&notice.publishedAt===null&&notice.eligibleAt===null&&notice.eligible===false&&notice.linkingConfigured===false)
    const page=await anonymous('/docs/chatgpt-notice'),pageText=await page.text()
    check('production notice explains separate consent and 30-day period',page.status===200&&pageText.includes(`data-chatgpt-notice-version="${proof.noticeVersion}"`)&&pageText.includes('30-day notice period')&&pageText.includes('Publication does not connect an account or grant permission.'))
    const home=await anonymous('/'),homeText=await home.text()
    check('production homepage presents the data-sharing notice',home.status===200&&homeText.includes('aria-label="ChatGPT data-sharing notice"')&&homeText.includes('Read the data-sharing notice'))
    check('production MCP remains unavailable before notice publication',(await anonymous('/api/mcp',{method:'POST',...json({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'synthetic-notice-check',version:'1'}}})})).status===503)
    check('production OAuth registration remains unavailable',(await anonymous('/api/chatgpt/register',{method:'POST',...json({client_name:'Synthetic unissued client',redirect_uris:['https://chatgpt.com/connector_platform_oauth_redirect']})})).status===503)
    check('production OAuth tokens remain unavailable',(await anonymous('/api/chatgpt/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:'synthetic-unissued-code'})})).status===503)
    // No credential is issued. The invalid synthetic resource cannot authorize
    // real METARDU tools; this fixture exercises existing-grant revocation only.
    const clientHash=createHash('sha256').update(randomBytes(32)).digest('hex'),grantId=randomUUID()
    await admin.query('BEGIN')
    await admin.query("INSERT INTO chatgpt_clients(client_id_hash,client_name,redirect_uris) VALUES($1,'SYNTHETIC REVOCATION VERIFICATION',$2::jsonb)",[clientHash,JSON.stringify(['https://chatgpt.com/connector_platform_oauth_redirect'])])
    await admin.query("INSERT INTO chatgpt_grants(id,user_id,client_id,scope,resource) VALUES($1,$2,$3,'projects:read','https://synthetic.invalid')",[grantId,ids.owner,clientHash])
    await admin.query('COMMIT')
    report.syntheticRevokeGrantId=grantId
    const connected=await owner('/connect/chatgpt'),connectedText=await connected.text()
    check('owned existing grant remains visible with new linking disabled',connected.status===200&&connectedText.includes('Revoke access')&&connectedText.includes('project summaries')&&connectedText.includes('Account linking is not enabled on this deployment.'))
    check('another account cannot revoke the synthetic owned grant',(await other(`/api/chatgpt/grants/${grantId}`,{method:'DELETE'})).status===404)
    const revoked=await owner(`/api/chatgpt/grants/${grantId}`,{method:'DELETE'}),revokedBody=await revoked.json()
    check('owner revokes an existing grant while new linking is disabled',revoked.status===200&&revokedBody.revoked===true&&(await admin.query('SELECT revoked_at IS NOT NULL AS revoked FROM chatgpt_grants WHERE id=$1 AND user_id=$2',[grantId,ids.owner])).rows[0].revoked===true)
    check('repeated synthetic grant revocation reports unavailable',(await owner(`/api/chatgpt/grants/${grantId}`,{method:'DELETE'})).status===404)
    const after=await owner('/connect/chatgpt'),afterText=await after.text()
    check('connection page removes the revoked grant',after.status===200&&afterText.includes('No active connections.')&&!afterText.includes('Revoke access'))
    await admin.query('UPDATE chatgpt_clients SET revoked_at=NOW() WHERE client_id_hash=$1',[clientHash])
    report.cleanup.syntheticConnectorCredentialsIssued=0
  }
  const deleted=await owner(`/api/storage?path=${encodeURIComponent(storedPath)}`,{method:'DELETE'})
  check('owner deletes only the synthetic temporary upload',deleted.status===200 && (await owner(`/api/storage?path=${encodeURIComponent(storedPath)}`)).status===404)
  check('temporary upload registration is also removed',(await admin.query('SELECT count(*)::integer AS count FROM public.file_uploads WHERE storage_path=$1 AND user_id=$2',[storedPath,ids.owner])).rows[0].count===0)
  report.cleanup.syntheticUploadRemoved=true;storedPath=null
  await admin.query('UPDATE public.users SET session_version=session_version+1 WHERE id=$1',[ids.owner])
  check('session revocation denies private APIs',(await owner('/api/projects')).status===401)
  check('unrelated normal session remains authenticated',(await other('/api/projects')).status===200)
  report.expectedChecks=noticeWorkerSource?46:workflowSource?35:25
  assert.equal(report.checks.length,report.expectedChecks,'Every planned production check must run')
  report.status='passed'
}catch(error){report.status='failed';report.failure={name:error.name,code:error.code??null,message:error instanceof assert.AssertionError?error.message:'Verification failed; customer/credential diagnostics suppressed'};console.error(report.failure.message);process.exitCode=1}
finally{
  if(admin){
    await admin.query('ROLLBACK').catch(()=>{})
    if(storedPath && owner){try{report.cleanup.syntheticUploadRemoved=(await owner(`/api/storage?path=${encodeURIComponent(storedPath)}`,{method:'DELETE'})).status===200}catch{report.cleanup.syntheticUploadRemoved=false}}
    if(seeded){
      await admin.query('BEGIN')
      await admin.query('UPDATE public.surveyor_profiles SET is_suspended=TRUE WHERE user_id=ANY($1::uuid[])',[Object.values(ids)])
      await admin.query('UPDATE public.users SET session_version=session_version+1,password_hash=$2 WHERE id=ANY($1::uuid[])',[Object.values(ids),await bcrypt.hash(randomBytes(32).toString('hex'),10)])
      if(noticeWorkerSource)await admin.query('UPDATE chatgpt_grants SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=ANY($1::uuid[])',[Object.values(ids)])
      await admin.query('COMMIT')
      report.cleanup.syntheticAccountsDisabled=true;report.cleanup.immutableEvidenceRetained=true
    }
    await admin.end()
  }
  save()
}
