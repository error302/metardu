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
test('subsequent promotion retains a protected historical bind while using its packaged registry',()=>{
  const app=restoredApp();app.Config.Env=[]
  assert.equal(forwardPromotionService('metardu-metardu-app:candidate',sha,app).volumes[0].source,app.Mounts[1].Source)
})
test('a changed registry, missing bind or unrelated app cannot pass the promotion guard',()=>{
  const mutations=[a=>a.Mounts[1].RW=true,a=>a.Mounts[1].Type='volume',a=>a.Mounts[1].Source='relative',a=>a.Mounts.push({...a.Mounts[1]}),a=>a.Config.Env=['MIGRATIONS_DIR=/unexpected'],a=>a.Mounts.pop(),a=>a.Name='/other-app',a=>a.Config.Labels['com.docker.compose.service']='other']
  for(const mutate of mutations){const app=restoredApp();mutate(app);assert.throws(()=>forwardPromotionService('metardu-metardu-app:candidate',sha,app))}
  assert.throws(()=>forwardPromotionService('other-image',sha,restoredApp()))
})
test('117-ledger repair needs the full legacy compatibility and native-service matrix',()=>{
  const proof={revision:sha,status:'passed',sourceBaseline:117,pending:['113_observation_batch_compatibility'],variants:['legacy','canonical','hybrid','incompatible'],originalValuesPreserved:true,historicalHashesPreserved:true,incompatibleRejected:true,normalRuntimeProvisioning:true,nativeServiceVerified:true,customerDataCopied:false,newContainer:false,cleanup:{syntheticDatabaseRemoved:true},checks:Array.from({length:5},()=>({passed:true}))}
  assertSyntheticUpgradeProof(proof,sha)
  for(const change of [{variants:['canonical']},{nativeServiceVerified:false},{incompatibleRejected:false},{pending:[]},{originalValuesPreserved:false},{sourceBaseline:118}])assert.throws(()=>assertSyntheticUpgradeProof({...proof,...change},sha))
})

test('a no-op rehearsal cannot replace a completed forward upgrade with cleanup',()=>{
  const proof={revision:sha,status:'passed',sourceBaseline:112,customerDataCopied:false,newContainer:false,cleanup:{syntheticDatabaseRemoved:true},checks:Array.from({length:5},(_,i)=>({name:String(i),passed:true}))}
  assertSyntheticUpgradeProof(proof,sha)
  for(const changed of [{revision:'a'.repeat(40)},{status:'failed'},{customerDataCopied:true},{newContainer:true},{cleanup:{}},{checks:[]},{checks:[{passed:false}]}])assert.throws(()=>assertSyntheticUpgradeProof({...proof,...changed},sha))
})

test('118-ledger field-role upgrade requires preserved policies, rejection cases and native role proof',()=>{
  const proof={revision:sha,status:'passed',sourceBaseline:118,targetLedgerCount:119,pending:['114_field_observation_roles'],variants:['canonical','restrictive','unknown_permissive','disabled_rls'],originalValuesPreserved:true,historicalHashesPreserved:true,restrictivePoliciesPreserved:true,unsafePoliciesRejected:true,disabledRlsRejected:true,normalRuntimeProvisioning:true,nativeServiceVerified:true,rawSchemaContractVerified:true,customerDataCopied:false,newContainer:false,cleanup:{syntheticDatabaseRemoved:true,syntheticRoleRemoved:true},checks:Array.from({length:8},()=>({passed:true}))}
  assertSyntheticUpgradeProof(proof,sha)
  for(const change of [{variants:['canonical']},{unsafePoliciesRejected:false},{disabledRlsRejected:false},{restrictivePoliciesPreserved:false},{nativeServiceVerified:false},{pending:[]},{cleanup:{syntheticDatabaseRemoved:true}}])assert.throws(()=>assertSyntheticUpgradeProof({...proof,...change},sha))
})

const workflowPending=['115_fieldbook_delivery_revisions','116_surface_request_recovery','117_scheme_import_receipts','118_block_identity_retention','119_reviewed_parcel_boundary_drafts','120_scheme_export_requests','121_parcel_draft_sharing','122_retained_parcel_traverses','123_boundary_request_recovery']
function workflowProof(){return {revision:sha,status:'passed',sourceBaseline:119,targetLedgerCount:128,pending:workflowPending,variants:['canonical','duplicate_parcel','duplicate_block','unexpected_block_fk','malformed_boundary'],sourceRegistry:Array.from({length:119},(_,i)=>({version:`${i}_old`,checksum:'a'.repeat(64)})).concat(workflowPending.map(version=>({version,checksum:'b'.repeat(64)}))),originalValuesPreserved:true,historicalHashesPreserved:true,normalRuntimeProvisioning:true,boundaryBackfillPreserved:true,restrictedRoleVerified:true,legacyFieldbookWritersVerified:true,precisionPreserved:true,retainedBlockDeletionGuard:true,incompatibleDataRejected:true,productionMutated:false,customerDataCopied:false,newContainer:false,cleanup:{syntheticDatabaseRemoved:true,syntheticRoleRemoved:true},checks:Array.from({length:11},(_,i)=>({name:`check-${i}`,passed:true}))}}

test('119-to-128 workflow proof is bound to the planned migration registry and full rejection matrix',()=>{
  const proof=workflowProof(),expected={pending:workflowPending,sourceRegistry:proof.sourceRegistry}
  assertSyntheticUpgradeProof(proof,sha,expected)
  for(const change of [{sourceBaseline:118},{variants:['canonical']},{targetLedgerCount:127},{incompatibleDataRejected:false},{precisionPreserved:false},{restrictedRoleVerified:false},{boundaryBackfillPreserved:false},{productionMutated:true},{sourceRegistry:proof.sourceRegistry.slice(1)},{checks:proof.checks.slice(0,10)},{cleanup:{syntheticDatabaseRemoved:true}}])assert.throws(()=>assertSyntheticUpgradeProof({...proof,...change},sha,expected))
  assert.throws(()=>assertSyntheticUpgradeProof(proof,sha,{...expected,pending:workflowPending.slice(1)}))
  assert.throws(()=>assertSyntheticUpgradeProof(proof,sha,{...expected,sourceRegistry:proof.sourceRegistry.map((file,i)=>i===127?{...file,checksum:'c'.repeat(64)}:file)}))
  assert.throws(()=>assertSyntheticUpgradeProof(proof,sha))
})

test('older rehearsal evidence cannot admit newer workflow migrations',()=>{
  const old={revision:sha,status:'passed',sourceBaseline:112,customerDataCopied:false,newContainer:false,cleanup:{syntheticDatabaseRemoved:true},checks:Array.from({length:5},()=>({passed:true}))}
  assert.throws(()=>assertSyntheticUpgradeProof(old,sha,{pending:workflowPending,sourceRegistry:workflowProof().sourceRegistry}))
  const baseline=[{version:'114_field_observation_roles',path:'src/lib/db/migrations/114_field_observation_roles.sql',checksum:'a'.repeat(64)}]
  const registry=baseline.concat(workflowPending.map(version=>({version,path:`src/lib/db/migrations/${version}.sql`,checksum:'b'.repeat(64)})))
  assert.deepEqual(assertSurveyReleaseDrift(registry,baseline).missing,workflowPending)
  assert.throws(()=>assertSurveyReleaseDrift(registry.concat({version:'124_unknown',checksum:'c'.repeat(64)}),baseline))
})
