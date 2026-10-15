import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import path from 'node:path'
import {cleanupRegistryScript} from '../scripts/verify-rollback-registry.mjs'

test('the cleanup payload sent through Docker is valid JavaScript after template evaluation',()=>{
  assert.doesNotThrow(()=>new Function(cleanupRegistryScript))
})

const root='/tmp/metardu-release-registry-eac2835e377f59dd0d1b1ff98cb3fbc311401f22'
function clean({target=root,names=['108_pipeline_asbuilt_history.sql'],symlink=false}={}) {
  const removed=[]
  const fs={
    lstatSync:p=>({isDirectory:()=>p===root,isSymbolicLink:()=>symlink,isFile:()=>p!==root}),
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
