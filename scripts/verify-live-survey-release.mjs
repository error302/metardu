// Live HTTPS authorization checks using explicitly marked disposable QA records.
// No real customer records, measured batches, email delivery or OAuth-provider
// flow is exercised. Credentials and cookies remain in memory.
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import {pinnedReleaseArguments} from './release-plan.mjs'

export function assertLiveSurveyRelease(receipt,app,revision) {
  assert.match(revision??'',/^[a-f0-9]{40}$/)
  assert.equal(receipt.revision,revision);assert.equal(receipt.status,'promoted')
  assert.equal(app.Name,'/metardu-app');assert.equal(app.Image,receipt.candidateImage)
  assert.ok(app.Config.Env.includes(`METARDU_BUILD_SHA=${revision}`))
}

async function main() {
  const revision=process.argv[2],origin='https://metardu.space'
  const {directory}=pinnedReleaseArguments(['status',revision,...process.argv.slice(3)],process.cwd())
  const receipt=JSON.parse(readFileSync(join(directory,'promotion.json'),'utf8'))
  const inspect=spawnSync('docker',['inspect','metardu-app','metardu-postgres'],{encoding:'utf8',windowsHide:true,timeout:10000})
  assert.equal(inspect.status,0)
  const [app,postgres]=JSON.parse(inspect.stdout);assertLiveSurveyRelease(receipt,app,revision)
  assert.equal(app.State.Health.Status,'healthy')
  assert.equal(postgres.Id,receipt.after.find(service=>service.name==='metardu-postgres').id)
  assert.deepEqual(postgres.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'5432'}])
  const env=Object.fromEntries(postgres.Config.Env.map(value=>{const i=value.indexOf('=');return[value.slice(0,i),value.slice(i+1)]}))
  const client=new pg.Client({host:'127.0.0.1',port:5432,database:env.POSTGRES_DB,user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,connectionTimeoutMillis:5000})
  const owner=randomUUID(),other=randomUUID(),project=randomUUID(),alignment=randomUUID()
  const password=randomBytes(32).toString('base64url'),label='METARDU synthetic release verification',createdAt=new Date().toISOString()
  const report={revision,origin,status:'checking',checks:[],cleanup:{},customerRecordsChanged:false,emailSent:false,fixtures:{users:[owner,other],project,alignment,createdAt}}
  const save=()=>writeFileSync(join(directory,'live-survey.json'),JSON.stringify(report,null,2)+'\n')
  const check=(name,condition=true)=>{assert.ok(condition,name);report.checks.push({name,passed:true});save();console.log('PASS '+name)}
  const actor=()=>{
    const cookies=new Map()
    return async(path,{body,form=false,method}={})=>{
      const response=await fetch(origin+path,{method:method||(body===undefined?'GET':'POST'),redirect:'manual',signal:AbortSignal.timeout(60000),headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'}),...(cookies.size?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{})},...(body===undefined?{}:{body:form?new URLSearchParams(body).toString():JSON.stringify(body)})})
      for(const item of response.headers.getSetCookie()){const pair=item.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
      return {response,data:await response.json().catch(()=>null)}
    }
  }
  const login=async id=>{
    const request=actor(),csrf=await request('/api/auth/csrf');assert.ok(csrf.data?.csrfToken)
    await request('/api/auth/callback/credentials',{form:true,body:{csrfToken:csrf.data.csrfToken,email:`release-${id}@example.invalid`,password,callbackUrl:origin+'/dashboard',json:'true'}})
    assert.equal((await request('/api/auth/session')).data?.user?.id,id)
    return request
  }
  let created=false
  await client.connect();save()
  try {
    assert.equal((await client.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n,receipt.migrationAfter.length)
    const anonymous=actor()
    check('live public health responds over HTTPS',(await anonymous('/api/public/health')).response.status===200)
    for(const path of [`/api/engineering/alignment?project_id=${project}`,`/api/engineering/stations?alignment_id=${alignment}`,`/api/project/${project}/pipeline-asbuilt`])check('anonymous private API requires authentication: '+path.split('?')[0],(await anonymous(path)).response.status===401)
    const hash=await bcrypt.hash(password,10)
    await client.query('BEGIN')
    for(const id of [owner,other])await client.query("INSERT INTO users(id,email,password_hash,full_name,role,email_verified) VALUES($1,$2,$3,$4,'user',true)",[id,`release-${id}@example.invalid`,hash,label])
    await client.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false),($2,'surveyor',false)",[owner,other])
    await client.query("INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,'SYNTHETIC disposable release authorization check','engineering')",[project,owner])
    await client.query("INSERT INTO road_alignments(id,project_id,road_name,cross_section_template) VALUES($1,$2,'SYNTHETIC release road','{}')",[alignment,project])
    await client.query('COMMIT');created=true
    const owned=await login(owner),foreign=await login(other)
    check('two exact disposable accounts obtain live HTTPS credential sessions')
    const path=`/api/engineering/alignment?project_id=${project}&road_name=SYNTHETIC%20release%20road`
    const read=await owned(path)
    check('owner can reopen the known synthetic alignment',read.response.status===200&&read.data?.data?.id===alignment)
    const cache=new Set((read.response.headers.get('cache-control')??'').toLowerCase().split(',').map(value=>value.trim()))
    check('private alignment is not share-cacheable',cache.has('private')&&cache.has('no-store')&&!['HIT','STALE','UPDATING','REVALIDATED'].includes(read.response.headers.get('cf-cache-status')))
    check('another account cannot read the known alignment',[403,404].includes((await foreign(path)).response.status))
    check('another account cannot read the known station list',[403,404].includes((await foreign(`/api/engineering/stations?alignment_id=${alignment}`)).response.status))
    const write=await foreign('/api/engineering/ips',{body:{alignment_id:alignment,ips:[{name:'A',easting:0,northing:0,radius:0},{name:'B',easting:100,northing:0,radius:0}]}})
    check('another account cannot write to the known alignment',[403,404].includes(write.response.status))
    assert.equal((await client.query('SELECT count(*)::int n FROM alignment_ips WHERE alignment_id=$1',[alignment])).rows[0].n,0)
    const filter=[{column:'user_id',op:'eq',value:owner}]
    const forged=await owned('/api/db',{body:{table:'surveyor_profiles',operation:'update',filters:filter,payload:{role:'admin',verified_isk:true}}})
    const profile=(await client.query('SELECT role,verified_isk FROM surveyor_profiles WHERE user_id=$1',[owner])).rows[0]
    check('production proxy refuses self-promotion and leaves authority unchanged',forged.response.status===403&&profile.role==='surveyor'&&profile.verified_isk!==true)
    const edited=await owned('/api/db',{body:{table:'surveyor_profiles',operation:'update',filters:filter,payload:{firm_name:'SYNTHETIC release firm'}}})
    check('ordinary production profile editing remains usable',edited.response.ok&&(await client.query('SELECT firm_name FROM surveyor_profiles WHERE user_id=$1',[owner])).rows[0].firm_name==='SYNTHETIC release firm')
    const history=await owned(`/api/project/${project}/pipeline-asbuilt`)
    check('owner can read an empty pipeline history without creating measured evidence',history.response.status===200&&Array.isArray(history.data?.data)&&history.data.data.length===0)
    report.status='passed'
  } catch(error) {report.status='failed';report.failure=error.message;throw error}
  finally {
    await client.query('ROLLBACK').catch(()=>{})
    try {
      if(created){
        const identities=(await client.query('SELECT id,email,full_name FROM users WHERE id=ANY($1::uuid[])',[[owner,other]])).rows
        assert.equal(identities.length,2)
        assert.ok(identities.every(row=>row.full_name===label&&row.email===`release-${row.id}@example.invalid`))
        // Revoke these disposable credentials first, even if later cleanup fails.
        await client.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])',[[owner,other]])
        assert.equal((await client.query('SELECT count(*)::int n FROM pipeline_asbuilt_batches WHERE project_id=$1',[project])).rows[0].n,0)
        assert.equal((await client.query("DELETE FROM projects WHERE id=$1 AND user_id=$2 AND name='SYNTHETIC disposable release authorization check' RETURNING id",[project,owner])).rowCount,1)
        assert.equal((await client.query('DELETE FROM users WHERE id=ANY($1::uuid[]) AND full_name=$2 RETURNING id',[[owner,other],label])).rowCount,2)
        report.cleanup.syntheticProjectAndAccountsRemoved=true
      }
    } catch(error) {report.status='cleanup-failed';report.cleanup.failure=error.message;throw error}
    finally {await client.end();save()}
  }
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,cleanup:report.cleanup,customerRecordsChanged:false,emailSent:false}))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1})
