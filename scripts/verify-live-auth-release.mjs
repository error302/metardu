// Owner-authorized production account-flow check using a disposable Gmail alias.
// Generated QA credentials/cookies stay in an ignored file until exact-user cleanup.
import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const origin='https://metardu.space'
const directory=resolve('.cache/release-verify/auth-release')
const statePath=resolve(directory,'private-qa-state.json')
const resultPath=resolve(directory,'live-auth.json')
mkdirSync(directory,{recursive:true})
let state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):null
let evidence=existsSync(resultPath)?JSON.parse(readFileSync(resultPath,'utf8')):{origin,checks:[],customerPasswordsChanged:false}
function save(){if(state)writeFileSync(statePath,JSON.stringify(state),{mode:0o600});writeFileSync(resultPath,JSON.stringify(evidence,null,2)+'\n')}
function checked(name,detail={}){evidence.checks.push({name,passed:true,...detail});save();console.log(JSON.stringify({check:name,passed:true,...detail}))}
async function request(path,{method='GET',body,form=false,jar=state?.cookies??{},...options}={}) {
  const headers={Origin:origin,...options.headers}
  if(Object.keys(jar).length)headers.Cookie=Object.entries(jar).map(([key,value])=>`${key}=${value}`).join('; ')
  if(body)headers['Content-Type']=form?'application/x-www-form-urlencoded':'application/json'
  const response=await fetch(origin+path,{method,headers,body:body?(form?new URLSearchParams(body).toString():JSON.stringify(body)):undefined,redirect:'manual',signal:AbortSignal.timeout(60_000)})
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');const key=pair.slice(0,i),value=pair.slice(i+1);if(value)jar[key]=value;else delete jar[key]}
  const data=await response.json().catch(()=>null)
  return {status:response.status,data}
}
async function login(password,jar={}) {
  const csrf=await request('/api/auth/csrf',{jar});assert.equal(csrf.status,200);assert.ok(csrf.data?.csrfToken)
  const response=await request('/api/auth/callback/credentials',{method:'POST',jar,form:true,body:{csrfToken:csrf.data.csrfToken,email:state.email,password,json:'true',callbackUrl:origin+'/fieldbook'}})
  return {response,jar,session:await request('/api/auth/session',{jar})}
}
async function withAdmin(work) {
  const result=spawnSync('docker',['inspect','metardu-postgres'],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(result.status,0)
  const postgres=JSON.parse(result.stdout)[0],environment=Object.fromEntries(postgres.Config.Env.map(value=>{const i=value.indexOf('=');return[value.slice(0,i),value.slice(i+1)]}))
  const client=new pg.Client({host:'127.0.0.1',port:5432,database:environment.POSTGRES_DB,user:environment.POSTGRES_USER,password:environment.POSTGRES_PASSWORD,connectionTimeoutMillis:5000});await client.connect()
  try{return await work(client)}finally{await client.end()}
}
async function main() {
  const action=process.argv[2]
  if(action==='signup') {
    assert.equal(state,null,'Refuse to overwrite an unfinished QA run')
    const inbox=process.env.METARDU_QA_EMAIL
    assert.match(inbox||'',/^[A-Za-z0-9._-]+@gmail\.com$/,'Explicit owner-approved QA inbox is required')
    state={email:`${inbox.split('@')[0]}+metardu-qa-${Date.now()}@gmail.com`,password:randomBytes(24).toString('base64url'),cookies:{},createdAt:new Date().toISOString()};save()
    const response=await request('/api/auth/register',{method:'POST',body:{email:state.email,password:state.password,fullName:'METARDU release QA (temporary)'}})
    assert.equal(response.status,200,`QA signup returned ${response.status}`);assert.ok(response.data?.user?.id)
    state.userId=response.data.user.id;save()
    assert.equal(response.data.onboardingComplete,true);assert.equal(response.data.verificationEmailSent,true);assert.equal(response.data.welcomeEmailSent,true)
    evidence.qaEmail=state.email;evidence.qaUserId=state.userId
    checked('signup persisted and branded verification/welcome accepted',{email:state.email})
    const auth=await login(state.password);assert.equal(auth.session.data?.user?.id,state.userId);state.cookies=auth.jar;save()
    checked('custom-email credentials produce an authenticated HTTPS session')
  }else if(action==='verify') {
    const token=process.argv[3];assert.match(token||'',/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    const claims=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'))
    assert.equal(claims.sub,state.userId);assert.equal(claims.email,state.email)
    const response=await request('/api/auth/email-verification/confirm',{method:'POST',body:{token}})
    assert.equal(response.status,200);assert.equal(response.data?.verified,true)
    checked('inbox verification link confirms the bound QA account')
  }else if(action==='recovery') {
    state.oldCookies={...state.cookies};save()
    const response=await request('/api/auth/forgot-password',{method:'POST',body:{email:state.email,next:'/fieldbook'}})
    assert.equal(response.status,200);assert.equal(response.data?.success,true)
    checked('production recovery request accepted for the QA inbox')
    const invalid=await request('/api/auth/reset-password',{method:'POST',body:{token:'0'.repeat(64),password:randomBytes(24).toString('base64url')}})
    assert.equal(invalid.status,400);checked('forged reset link rejected without a password change')
  }else if(action==='reset') {
    const token=process.argv[3];assert.match(token||'',/^[a-f0-9]{64}$/)
    await withAdmin(async client=>{
      const record=await client.query('SELECT user_id FROM password_reset_tokens WHERE token IN ($1,$2) AND used_at IS NULL',[
        `sha256:${createHash('sha256').update(token).digest('hex')}`,token,
      ])
      assert.equal(record.rows.length,1);assert.equal(record.rows[0].user_id,state.userId,'Reset must target only the newly created QA account')
    })
    const nextPassword=randomBytes(24).toString('base64url')
    const response=await request('/api/auth/reset-password',{method:'POST',body:{token,password:nextPassword}})
    assert.equal(response.status,200);assert.equal(response.data?.confirmationEmailSent,true)
    checked('inbox reset link changes only the disposable QA password and sends confirmation')
    const replay=await request('/api/auth/reset-password',{method:'POST',body:{token,password:randomBytes(24).toString('base64url')}})
    assert.equal(replay.status,400);checked('consumed reset link cannot be reused')
    const stale=await request('/api/auth/session',{jar:state.oldCookies});assert.ok(!stale.data?.user)
    checked('pre-reset session is revoked')
    const old=await login(state.password);assert.ok(!old.session.data?.user)
    checked('old password no longer signs in')
    state.password=nextPassword;state.cookies={};save()
    const auth=await login(nextPassword);assert.equal(auth.session.data?.user?.id,state.userId);state.cookies=auth.jar;save()
    checked('new password signs in through normal HTTPS credentials flow')
  }else if(action==='settings') {
    const nextPassword=randomBytes(24).toString('base64url')
    const response=await request('/api/auth/update-password',{method:'POST',body:{currentPassword:state.password,password:nextPassword}})
    assert.equal(response.status,200);assert.equal(response.data?.confirmationEmailSent,true);assert.equal(response.data?.sessionsRevoked,true)
    const stale=await request('/api/auth/session');assert.ok(!stale.data?.user)
    state.password=nextPassword;state.cookies={};save()
    const auth=await login(nextPassword);assert.equal(auth.session.data?.user?.id,state.userId);state.cookies=auth.jar;save()
    checked('authenticated password change confirms delivery, revokes the session and permits new-password login')
  }else if(action==='cleanup') {
    assert.match(state?.email||'',/^[A-Za-z0-9._-]+\+metardu-qa-\d+@gmail\.com$/)
    await withAdmin(async client=>{
      const removed=await client.query(`DELETE FROM users WHERE id=$1 AND email=$2 AND full_name=$3 AND created_at >= $4 RETURNING id`,[state.userId,state.email,'METARDU release QA (temporary)',state.createdAt])
      assert.equal(removed.rows.length,1,'Only the newly created, explicitly named QA account may be removed')
    })
    evidence.disposableAccountRemoved=true;checked('exact disposable QA account and generated credential file cleaned up')
    unlinkSync(statePath);state=null
  }else throw new Error('Use signup, verify TOKEN, recovery, reset TOKEN, settings, or cleanup')
  delete evidence.failure;save()
}
try{await main()}catch(error){evidence.failure=error instanceof assert.AssertionError?`Account-flow assertion failed: ${error.message.split('\n')[0]}`:'Account-flow request failed';save();console.error(evidence.failure);process.exitCode=1}
