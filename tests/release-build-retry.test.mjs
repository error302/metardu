import test from 'node:test'
import assert from 'node:assert/strict'
import {assertCandidateBuildAdmission, pinnedReleaseArguments} from '../scripts/release-plan.mjs'
const revision='a'.repeat(40)
const failed=()=>({revision,status:'build-failed',buildAttempts:[{status:'failed',builderPid:41,archivePid:42,log:'build-1.log',reason:'Candidate build failed: 1'}]})
test('retry-build is an explicit immutable-revision command',()=>{
  assert.equal(pinnedReleaseArguments(['retry-build',revision,'--unified'],process.cwd()).action,'retry-build')
  assert.throws(()=>pinnedReleaseArguments(['retry-build','HEAD'],process.cwd()))
})
test('initial build and retry have distinct admitted states',()=>{
  assert.equal(assertCandidateBuildAdmission({revision,status:'planned'},revision),1)
  assert.throws(()=>assertCandidateBuildAdmission(failed(),revision))
  assert.throws(()=>assertCandidateBuildAdmission({revision,status:'planned'},revision,{retry:true,priorProcessesAbsent:true}))
  assert.equal(assertCandidateBuildAdmission(failed(),revision,{retry:true,priorProcessesAbsent:true}),2)
})
test('retry refuses live, unknown, malformed or successful prior attempts',()=>{
  for(const status of ['building','built','promoted','failed','rolled-back'])assert.throws(()=>assertCandidateBuildAdmission({...failed(),status},revision,{retry:true,priorProcessesAbsent:true}))
  for(const change of [{status:'running'},{status:'passed'},{builderPid:undefined},{archivePid:0},{reason:''},{log:''}]){
    const receipt=failed();Object.assign(receipt.buildAttempts[0],change)
    assert.throws(()=>assertCandidateBuildAdmission(receipt,revision,{retry:true,priorProcessesAbsent:true}))
  }
  assert.throws(()=>assertCandidateBuildAdmission(failed(),revision,{retry:true}))
  assert.throws(()=>assertCandidateBuildAdmission({...failed(),buildAttempts:[]},revision,{retry:true,priorProcessesAbsent:true}))
})
test('retry does not erase or mutate earlier attempts and rejects a different SHA',()=>{
  const receipt=failed()
  receipt.buildAttempts.push({...receipt.buildAttempts[0],log:'build-2.log',builderPid:51,archivePid:52})
  const unchanged=JSON.stringify(receipt)
  assert.equal(assertCandidateBuildAdmission(receipt,revision,{retry:true,priorProcessesAbsent:true}),3)
  assert.equal(JSON.stringify(receipt),unchanged)
  assert.throws(()=>assertCandidateBuildAdmission(receipt,'b'.repeat(40),{retry:true,priorProcessesAbsent:true}))
})

import {mkdtempSync,existsSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {withExclusiveCandidateBuild} from '../scripts/release-build-lock.mjs'
test('candidate build lock rejects concurrent admission and releases only its own lock',async()=>{
  const folder=mkdtempSync(path.join(tmpdir(),'metardu-build-lock-')),file=path.join(folder,'candidate.lock')
  try {
    let release
    const running=withExclusiveCandidateBuild(file,()=>new Promise(resolve=>{release=resolve}))
    const retained=readFileSync(file,'utf8')
    await assert.rejects(withExclusiveCandidateBuild(file,()=>assert.fail('second builder ran')),/EEXIST/)
    assert.equal(readFileSync(file,'utf8'),retained)
    release('built');assert.equal(await running,'built');assert.equal(existsSync(file),false)
    await assert.rejects(withExclusiveCandidateBuild(file,async()=>{throw new Error('build failed')}),/build failed/)
    assert.equal(existsSync(file),false)
    writeFileSync(file,retained)
    await assert.rejects(withExclusiveCandidateBuild(file,()=>assert.fail('stale lock bypassed')),/EEXIST/)
    assert.equal(readFileSync(file,'utf8'),retained)
  } finally {rmSync(folder,{recursive:true,force:true})}
})
