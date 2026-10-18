import test from 'node:test'
import assert from 'node:assert/strict'
import {commandFailureDetails,redactReleaseDiagnostic,collectFailedAppDiagnostics} from '../scripts/release-failure-diagnostics.mjs'

test('retains timeout and signal without credential-bearing command arguments',()=>{
  const details=commandFailureDetails('docker','compose',{status:null,signal:'SIGTERM',error:{code:'ETIMEDOUT',message:'secret-value'}},150000)
  assert.deepEqual(details,{binary:'docker',action:'compose',exit:null,signal:'SIGTERM',errorCode:'ETIMEDOUT',timeoutMs:150000})
  assert.ok(!JSON.stringify(details).includes('secret-value'))
})
test('redacts longer configuration values first and bounds retained output',()=>{
  const env={KEY:'secret-key',URL:'postgresql://user:secret-key@db/test',SHORT_SECRET:'tiny'}
  const text=redactReleaseDiagnostic('x'.repeat(40000)+env.URL+' '+env.KEY+' '+env.SHORT_SECRET,env)
  assert.equal(text.length,32768);assert.ok(!text.includes('secret-key'));assert.ok(!text.includes('postgresql://'));assert.ok(!text.includes('tiny'))
})
test('captures the exact failed app before rollback using bounded read-only calls',()=>{
  const calls=[]
  const app={Name:'/metardu-app',Id:'candidate-container',Image:'candidate-image',Config:{Labels:{'com.docker.compose.project':'metardu'}},
    State:{Status:'running',Running:true,OOMKilled:false,ExitCode:0,Error:'secret-key',Health:{Status:'starting',FailingStreak:2,Log:[{ExitCode:1,Output:'secret-key'}]}}}
  const result=collectFailedAppDiagnostics('candidate-image',{KEY:'secret-key'},(binary,args,options)=>{
    calls.push({binary,args,options})
    return args[0]==='inspect'?{status:0,stdout:JSON.stringify([app])}:{status:0,stdout:'startup secret-key',stderr:''}
  })
  assert.equal(result.captured,true);assert.equal(result.health.status,'starting');assert.ok(!JSON.stringify(result).includes('secret-key'))
  assert.deepEqual(calls.map(call=>call.args[0]),['inspect','logs']);assert.ok(calls.every(call=>call.options.timeout===5000))
})
test('refuses logs from a different image and cannot throw before rollback',()=>{
  const app={Name:'/metardu-app',Image:'rollback-image',Config:{Labels:{'com.docker.compose.project':'metardu'}}}
  let calls=0
  const result=collectFailedAppDiagnostics('candidate-image',{},()=>{calls++;return{status:0,stdout:JSON.stringify([app])}})
  assert.equal(result.phase,'candidate-not-current');assert.equal(calls,1)
  assert.equal(collectFailedAppDiagnostics('candidate-image',{},()=>{throw Error('unavailable')}).captured,false)
  assert.equal(collectFailedAppDiagnostics('candidate-image',{},()=>({status:null,error:{code:'ETIMEDOUT'}})).captured,false)
})
