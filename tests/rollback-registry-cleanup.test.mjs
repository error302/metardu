import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import path from 'node:path'
import * as rollbackRegistry from '../scripts/verify-rollback-registry.mjs'

const {cleanupRegistryScript}=rollbackRegistry

test('the cleanup payload sent through Docker is valid JavaScript after template evaluation',()=>{
  assert.doesNotThrow(()=>new Function(cleanupRegistryScript))
})

const root='/tmp/metardu-release-registry-eac2835e377f59dd0d1b1ff98cb3fbc311401f22'
function clean({target=root,names=['108_pipeline_asbuilt_history.sql'],symlink=false,absent=false}={}) {
  const removed=[]
  const fs={
    lstatSync:p=>{
      if(absent){const error=new Error('ENOENT');error.code='ENOENT';throw error}
      return {isDirectory:()=>p===root,isSymbolicLink:()=>symlink,isFile:()=>p!==root}
    },
    readdirSync:()=>names,unlinkSync:p=>removed.push(p),rmdirSync:p=>removed.push(p),
  }
  const execute=()=>runInNewContext(cleanupRegistryScript,{require:name=>name==='node:fs'?fs:path.posix,process:{argv:['node',target]}})
  return {execute,removed}
}
test('cleanup removes only regular SQL files in the exact owned artifact',()=>{
  const fixture=clean();fixture.execute()
  assert.deepEqual(fixture.removed,[root+'/108_pipeline_asbuilt_history.sql',root])
})
test('cleanup validates every entry before deleting anything',()=>{
  for(const options of [{target:'/app/upload'},{target:root+'/..'},{symlink:true},{names:['108_pipeline_asbuilt_history.sql','../customer.sql']},{names:['schema.sql.zip']}]) {
    const fixture=clean(options)
    assert.throws(fixture.execute,/Unexpected/)
    assert.deepEqual(fixture.removed,[])
  }
})
test('cleanup tolerates an absent target after a copy that created nothing',()=>{
  const fixture=clean({absent:true})
  assert.doesNotThrow(fixture.execute)
  assert.deepEqual(fixture.removed,[])
})

const service={
  container:'metardu-release-rehearsal',
  containerId:'a'.repeat(64),
  purpose:'schema-rehearsal',
  network:'metardu-release-rehearsal',
  hostIp:'127.0.0.1',
  hostPort:55433,
  database:'metardu_runtime_verify',
  marker:'METARDU synthetic release rehearsal only',
  volume:'metardu_release_rehearsal_data',
}
const fixture={
  Id:service.containerId,
  Name:'/'+service.container,
  State:{Running:true},
  Config:{Labels:{'metardu.purpose':service.purpose}},
  NetworkSettings:{
    Networks:{[service.network]:{}},
    Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'55433'}]},
  },
  Mounts:[{Type:'volume',Name:service.volume,Destination:'/var/lib/postgresql/data'}],
}
const app={
  Name:'/metardu-app',
  Config:{Labels:{'com.docker.compose.project':'metardu'}},
  NetworkSettings:{Networks:{[service.network]:{}}},
}

test('the primary copy failure survives a simultaneous cleanup-verification failure',()=>{
  assert.equal(typeof rollbackRegistry.runRollbackRegistryVerification,'function')
  const calls=[]
  let targetPresent=false
  const executeDocker=(args,phase)=>{
    calls.push({args,phase})
    if(args[0]==='network'&&args[1]==='inspect')return JSON.stringify([{Labels:{'com.docker.compose.project':'metardu'}}])
    if(args[0]==='exec'&&args[2]==='node'&&String(args[4]).includes('existsSync'))return String(targetPresent)
    if(args[0]==='cp'){targetPresent=true;throw new Error('primary copy failure')}
    if(args[0]==='exec'&&args[1]==='--user'&&args[2]==='0')return ''
    throw new Error(`Unexpected Docker invocation: ${args[0]}`)
  }
  assert.throws(()=>rollbackRegistry.runRollbackRegistryVerification({
    app,fixture,service,registry:path.resolve('.cache/release-verify/test-registry'),
    revision:'eac2835e377f59dd0d1b1ff98cb3fbc311401f22',
    runtimeUrl:'postgresql://runtime:password@127.0.0.1:55433/metardu_runtime_verify',
    executeDocker,
  }),/primary copy failure/)
  const cleanupIndex=calls.findIndex(call=>call.args[0]==='exec'&&call.args[1]==='--user'&&call.phase==='owned-SQL-cleanup')
  const verificationIndex=calls.findIndex((call,index)=>index>cleanupIndex&&call.args[0]==='exec'&&String(call.args[4]).includes('existsSync'))
  assert.ok(cleanupIndex>=0)
  assert.ok(verificationIndex>cleanupIndex)
})

test('a failing partial copy always attempts scoped cleanup and verifies the target is absent',()=>{
  assert.equal(typeof rollbackRegistry.runRollbackRegistryVerification,'function')
  const calls=[]
  let targetPresent=false
  const executeDocker=(args,phase)=>{
    calls.push({args,phase})
    if(args[0]==='network'&&args[1]==='inspect')return JSON.stringify([{Labels:{'com.docker.compose.project':'metardu'}}])
    if(args[0]==='exec'&&args[2]==='node'&&String(args[4]).includes('existsSync'))return String(targetPresent)
    if(args[0]==='cp'){targetPresent=true;throw new Error('simulated partial copy')}
    if(args[0]==='exec'&&args[1]==='--user'&&args[2]==='0'){
      assert.equal(targetPresent,true)
      targetPresent=false
      return ''
    }
    throw new Error(`Unexpected Docker invocation: ${args[0]}`)
  }
  assert.throws(()=>rollbackRegistry.runRollbackRegistryVerification({
    app,fixture,service,registry:path.resolve('.cache/release-verify/test-registry'),
    revision:'eac2835e377f59dd0d1b1ff98cb3fbc311401f22',
    runtimeUrl:'postgresql://runtime:password@127.0.0.1:55433/metardu_runtime_verify',
    executeDocker,
  }),/simulated partial copy/)
  const copyIndex=calls.findIndex(call=>call.args[0]==='cp')
  const cleanupIndex=calls.findIndex(call=>call.args[0]==='exec'&&call.args[1]==='--user'&&call.phase==='owned-SQL-cleanup')
  const verificationIndex=calls.findIndex((call,index)=>index>cleanupIndex&&call.args[0]==='exec'&&String(call.args[4]).includes('existsSync'))
  assert.ok(copyIndex>=0)
  assert.ok(cleanupIndex>copyIndex)
  assert.ok(verificationIndex>cleanupIndex)
})
