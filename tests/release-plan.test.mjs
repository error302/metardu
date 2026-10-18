import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {pinnedReleaseArguments,compatibleRollbackRegistry,assertSurveyReleaseDrift,rollbackService,forwardPromotionService,assertBuildSpace,assertSyntheticUpgradeProof} from '../scripts/release-plan.mjs'
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

const registryTarget='/app/rollback-migration-registry'
function restoredApp(){return {Name:'/metardu-app',Config:{Labels:{'com.docker.compose.service':'metardu-app'},Env:[`MIGRATIONS_DIR=${registryTarget}`]},Mounts:[
  {Type:'volume',Source:'/var/lib/docker/volumes/metardu_uploads_data/_data',Destination:'/app/upload',RW:true},
  {Type:'bind',Source:path.resolve('.cache/release-verify/previous/rollback-registry/verified'),Destination:registryTarget,RW:false},
]}}
test('promotion preserves the exact inspected registry without inheriting rollback environment',()=>{
  const app=restoredApp(),service=forwardPromotionService('metardu-metardu-app:candidate',sha,app)
  assert.deepEqual(service.volumes,[{type:'bind',source:app.Mounts[1].Source,target:registryTarget,read_only:true}])
  assert.deepEqual(service.environment,{METARDU_BUILD_SHA:sha})
  assert.equal(app.Mounts[0].Destination,'/app/upload')
})
test('ordinary promotion adds no registry mount',()=>{
  const app=restoredApp();app.Mounts=app.Mounts.slice(0,1);app.Config.Env=[]
  assert.deepEqual(forwardPromotionService('metardu-metardu-app:candidate',sha,app),{image:'metardu-metardu-app:candidate',environment:{METARDU_BUILD_SHA:sha}})
})
test('a changed registry, missing bind or unrelated app cannot pass the promotion guard',()=>{
  const mutations=[a=>a.Mounts[1].RW=true,a=>a.Mounts[1].Type='volume',a=>a.Mounts[1].Source='relative',a=>a.Mounts.push({...a.Mounts[1]}),a=>a.Config.Env=[],a=>a.Mounts.pop(),a=>a.Name='/other-app',a=>a.Config.Labels['com.docker.compose.service']='other']
  for(const mutate of mutations){const app=restoredApp();mutate(app);assert.throws(()=>forwardPromotionService('metardu-metardu-app:candidate',sha,app))}
  assert.throws(()=>forwardPromotionService('other-image',sha,restoredApp()))
})

test('a no-op rehearsal cannot replace a completed forward upgrade with cleanup',()=>{
  const proof={revision:sha,status:'passed',sourceBaseline:112,customerDataCopied:false,newContainer:false,cleanup:{syntheticDatabaseRemoved:true},checks:Array.from({length:5},(_,i)=>({name:String(i),passed:true}))}
  assertSyntheticUpgradeProof(proof,sha)
  for(const changed of [{revision:'a'.repeat(40)},{status:'failed'},{customerDataCopied:true},{newContainer:true},{cleanup:{}},{checks:[]},{checks:[{passed:false}]}])assert.throws(()=>assertSyntheticUpgradeProof({...proof,...changed},sha))
})
