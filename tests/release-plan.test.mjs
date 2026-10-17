import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {pinnedReleaseArguments,compatibleRollbackRegistry,assertSurveyReleaseDrift,rollbackService,assertBuildSpace,assertSyntheticUpgradeProof} from '../scripts/release-plan.mjs'
const sha='eac2835e377f59dd0d1b1ff98cb3fbc311401f22'
const source=[{version:'107_existing',path:'src/lib/db/migrations/107_existing.sql',checksum:'old',equivalentChecksums:[]},{version:'108_pipeline_asbuilt_history',path:'src/lib/db/migrations/108_pipeline_asbuilt_history.sql',checksum:'new',equivalentChecksums:[]}]
test('release commands require a pinned commit and stay in one reusable namespace',()=>{
  assert.equal(pinnedReleaseArguments(['build',sha],process.cwd()).revision,sha)
  assert.equal(pinnedReleaseArguments(['build',sha,'--unified'],process.cwd()).directory,path.resolve('.cache/release-verify/unified-release',sha))
  assert.notEqual(pinnedReleaseArguments(['build',sha,'--unified'],process.cwd()).directory,pinnedReleaseArguments(['build','a'.repeat(40),'--unified'],process.cwd()).directory)
  assert.notEqual(pinnedReleaseArguments(['plan',sha,'--unified'],process.cwd()).directory,pinnedReleaseArguments(['plan',sha],process.cwd()).directory)
  for(const args of [['build','HEAD'],['build','main'],['build',sha,'extra'],['prune',sha]])assert.throws(()=>pinnedReleaseArguments(args,process.cwd()))
})
test('rollback validates every applied migration and includes only reviewed completed versions',()=>{
  assert.equal(compatibleRollbackRegistry(source,[{version:'107_existing',checksum:'old'}]).length,1)
  assert.equal(compatibleRollbackRegistry(source,[{version:'107_existing',checksum:'old'},{version:'108_pipeline_asbuilt_history',checksum:'new'}]).length,2)
  for(const ledger of [[],[{version:'unknown',checksum:'x'}],[{version:'107_existing',checksum:'changed'}],[{version:'107_existing',checksum:'old'},{version:'107_existing',checksum:'old'}]])assert.throws(()=>compatibleRollbackRegistry(source,ledger))
})
test('a newly discovered migration cannot silently enter the reviewed release',()=>{
  assert.deepEqual(assertSurveyReleaseDrift(source,[{version:'107_existing',checksum:'old'}]).missing,['108_pipeline_asbuilt_history'])
  assert.throws(()=>assertSurveyReleaseDrift([...source,{version:'111_unreviewed',path:'src/lib/db/migrations/111_unreviewed.sql',checksum:'x'}],[{version:'107_existing',checksum:'old'}]))
})
test('rollback retains strict verification through a read-only registry mount',()=>{
  const service=rollbackService('metardu-metardu-app:rollback-current',sha,path.resolve('.cache/release-verify/survey-release/rollback-registry'))
  assert.equal(service.volumes[0].read_only,true)
  assert.equal(service.environment.MIGRATIONS_DIR,service.volumes[0].target)
  assert.throws(()=>rollbackService('some-other-app',sha,'relative'))
})
test('builds fail closed on insufficient or unknown host free space',()=>{
  assertBuildSpace(16*1024**3)
  for(const free of [0,7*1024**3,NaN,Infinity])assert.throws(()=>assertBuildSpace(free))
})

test('a no-op rehearsal cannot replace a completed forward upgrade with cleanup',()=>{
  const proof={revision:sha,status:'passed',sourceBaseline:112,customerDataCopied:false,newContainer:false,cleanup:{syntheticDatabaseRemoved:true},checks:Array.from({length:5},(_,i)=>({name:String(i),passed:true}))}
  assertSyntheticUpgradeProof(proof,sha)
  for(const changed of [{revision:'a'.repeat(40)},{status:'failed'},{customerDataCopied:true},{newContainer:true},{cleanup:{}},{checks:[]},{checks:[{passed:false}]}])assert.throws(()=>assertSyntheticUpgradeProof({...proof,...changed},sha))
})
