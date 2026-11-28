import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {readFileSync} from 'node:fs'
import {pinnedReleaseArguments,compatibleRollbackRegistry,assertCompleteRehearsalLedger,assertSurveyReleaseDrift,rollbackService,forwardPromotionService,deployedAppRevision,assertBuildSpace,assertSyntheticUpgradeProof} from '../scripts/release-plan.mjs'
import * as releasePlan from '../scripts/release-plan.mjs'
import {pinnedRehearsalIdentity} from '../scripts/rehearsal-database.mjs'
import * as rehearsalDatabase from '../scripts/rehearsal-database.mjs'
import {migrationChecksums} from '../scripts/verify-migrations.mjs'
import * as migrationVerifier from '../scripts/verify-migrations.mjs'
import { COLLABORATION_UPGRADE_CHECKS, COLLABORATION_UPGRADE_VERSIONS } from '../scripts/collaboration-upgrade-contract.mjs'

const sha='eac2835e377f59dd0d1b1ff98cb3fbc311401f22'
const recoveryProofSourceFiles=[
  'scripts/verify-fresh-recovery.mjs',
  'scripts/rehearsal-database.mjs',
  'scripts/verify-migrations.mjs',
  'scripts/provision-runtime-db-role.mjs',
  'scripts/migrate-unified.mjs',
  'scripts/verify-organization-project-rls.mjs',
  'scripts/recovery-archive-manifest.py',
]
const recoveryProofSourceContents=Object.fromEntries(recoveryProofSourceFiles.map((file,index)=>[file,`candidate source ${index}\n`]))
const recoveryProofSourceSha256=rehearsalDatabase.recoveryProofSourceHashes?.(recoveryProofSourceContents)
const rehearsalIdentity={
  container:'metardu-release-rehearsal',
  containerId:'a'.repeat(64),
  purpose:'schema-rehearsal',
  network:'metardu-release-rehearsal',
  hostIp:'127.0.0.1',
  hostPort:55433,
  database:'metardu_release_rehearsal',
  marker:'METARDU synthetic release rehearsal only',
  volume:'metardu_release_rehearsal_data',
}
const rehearsalContainer={
  Id:rehearsalIdentity.containerId,
  Name:'/'+rehearsalIdentity.container,
  State:{Running:true},
  Config:{Labels:{'metardu.purpose':'schema-rehearsal'}},
  NetworkSettings:{
    Networks:{[rehearsalIdentity.network]:{}},
    Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'55433'}]},
  },
  Mounts:[{Type:'volume',Name:rehearsalIdentity.volume,Destination:'/var/lib/postgresql/data'}],
}
function requiredFunction(name){
  const value=rehearsalDatabase[name]
  assert.equal(typeof value,'function',`Missing release rehearsal contract: ${name}`)
  return value
}

test('recovery role cleanup owns only roles created by the current run',()=>{
  const createOwnership=requiredFunction('createRecoveryRoleOwnership')
  const ownRole=requiredFunction('ownRecoveryRole')
  const cleanupRoles=requiredFunction('recoveryRolesForCleanup')
  const runId='a'.repeat(32)
  const ownership=createOwnership(runId)
  assert.equal(ownership.runtimeRole,'metardu_recovery_app_'+runId)
  assert.deepEqual([...ownership.ownedRoles],[])
  ownRole(ownership,'metardu')
  ownRole(ownership,ownership.runtimeRole)
  assert.deepEqual(cleanupRoles(ownership,{databaseCreated:false,databaseRemoved:false}),[ownership.runtimeRole,'metardu'])
  assert.deepEqual(cleanupRoles(ownership,{databaseCreated:true,databaseRemoved:false}),[ownership.runtimeRole])
  assert.deepEqual(cleanupRoles(ownership,{databaseCreated:true,databaseRemoved:true}),[ownership.runtimeRole,'metardu'])
  assert.notEqual(createOwnership('b'.repeat(32)).runtimeRole,ownership.runtimeRole)
})

test('the recovery report confines temporary state without claiming stack immutability',()=>{
  const scope=rehearsalDatabase.RECOVERY_REPORT_SCOPE
  assert.equal(typeof scope,'string')
  assert.match(scope,/customer production data and uploads are read-only/i)
  assert.match(scope,/temporary recovery state is confined to the isolated rehearsal\/backup service/i)
  assert.doesNotMatch(scope,/stack.*immutable|production is read-only/i)
})

test('the executed recovery proof binds an explicit canonical text-source closure',()=>{
  assert.deepEqual(rehearsalDatabase.RECOVERY_PROOF_SOURCE_FILES,recoveryProofSourceFiles)
  assert.equal(typeof rehearsalDatabase.recoveryProofSourceHashes,'function')
  assert.ok(recoveryProofSourceSha256)
  const crlfContents={...recoveryProofSourceContents,'scripts/recovery-archive-manifest.py':recoveryProofSourceContents['scripts/recovery-archive-manifest.py'].replaceAll('\n','\r\n')}
  assert.deepEqual(rehearsalDatabase.recoveryProofSourceHashes(crlfContents),recoveryProofSourceSha256)
  assert.throws(()=>rehearsalDatabase.recoveryProofSourceHashes({...recoveryProofSourceContents,'scripts/unreviewed.mjs':'x'}))
})

test('candidate migration registries exclude non-SQL migration sources',()=>{
  assert.equal(typeof migrationVerifier.migrationSourcePaths,'function')
  assert.deepEqual(migrationVerifier.migrationSourcePaths([
    'src/lib/db/migrations/README.md',
    'src/lib/db/migrations/002_second.sql',
    'src/lib/db/migrations/001_first.sql',
  ]),[
    'src/lib/db/migrations/001_first.sql',
    'src/lib/db/migrations/002_second.sql',
  ])
})

test('the unified committed-source gate runs the rollback registry cleanup regression',()=>{
  const contracts=releasePlan.UNIFIED_RELEASE_CONTRACT_TESTS
  assert.ok(Array.isArray(contracts))
  assert.ok(contracts.includes('tests/rollback-registry-cleanup.test.mjs'))
  assert.ok(contracts.includes('tests/legacy-image-preflight.test.mjs'))
})

test('the unified release-contract gate runs the working-tree recovery proof suite',()=>{
  const contracts=releasePlan.UNIFIED_RELEASE_CONTRACT_TESTS
  assert.ok(Array.isArray(contracts))
  assert.ok(contracts.includes('tests/working-tree-recovery-proof.test.mjs'))
})

test('the first build establishes rollback-current from the exact production image when absent',()=>{
  const establish=releasePlan.establishRollbackTag
  assert.equal(typeof establish,'function')
  const rollbackImage='sha256:'+'a'.repeat(64)
  const calls=[]
  const result=establish({
    rollbackImage,
    rollbackTag:'metardu-metardu-app:rollback-current',
    existingTagImage:null,
    preservePriorRollback:()=>calls.push('preserve'),
    tagImage:(image,tag)=>calls.push(['tag',image,tag]),
    inspectTag:tag=>{calls.push(['inspect',tag]);return rollbackImage},
  })
  assert.equal(result.action,'created')
  assert.deepEqual(calls,[['tag',rollbackImage,'metardu-metardu-app:rollback-current'],['inspect','metardu-metardu-app:rollback-current']])
})

test('a prior rollback tag is preserved by content before rollback-current is replaced',()=>{
  const establish=releasePlan.establishRollbackTag
  assert.equal(typeof establish,'function')
  const rollbackImage='sha256:'+'a'.repeat(64),priorImage='sha256:'+'b'.repeat(64)
  const calls=[]
  const result=establish({
    rollbackImage,
    rollbackTag:'metardu-metardu-app:rollback-current',
    existingTagImage:priorImage,
    preservePriorRollback:image=>calls.push(['preserve',image]),
    tagImage:(image,tag)=>calls.push(['tag',image,tag]),
    inspectTag:tag=>{calls.push(['inspect',tag]);return rollbackImage},
  })
  assert.equal(result.action,'replaced')
  assert.deepEqual(calls,[['preserve',priorImage],['tag',rollbackImage,'metardu-metardu-app:rollback-current'],['inspect','metardu-metardu-app:rollback-current']])
})

test('the locally configured rehearsal service must match the exact inspected loopback container',()=>{
  const parse=requiredFunction('parseRehearsalServiceIdentity')
  const assertIdentity=requiredFunction('assertRehearsalServiceIdentity')
  assert.deepEqual(parse(rehearsalIdentity),rehearsalIdentity)
  assert.deepEqual(assertIdentity(rehearsalIdentity,rehearsalContainer),rehearsalIdentity)
  const mutations=[
    value=>({...value,purpose:'production'}),
    value=>({...value,hostIp:'0.0.0.0'}),
    value=>({...value,hostPort:5432}),
    value=>({...value,database:'metardu'}),
    value=>({...value,marker:'customer recovery'}),
    value=>({...value,container:'metardu-app'}),
    value=>({...value,network:'metardu_default'}),
  ]
  for(const mutate of mutations)assert.throws(()=>parse(mutate(rehearsalIdentity)))
  const containerMutations=[
    container=>({...container,Id:'b'.repeat(64)}),
    container=>({...container,State:{Running:false}}),
    container=>({...container,Config:{Labels:{}}}),
    container=>({...container,NetworkSettings:{...container.NetworkSettings,Networks:{metardu_default:{},[rehearsalIdentity.network]:{}}}}),
    container=>({...container,NetworkSettings:{...container.NetworkSettings,Ports:{'5432/tcp':[{HostIp:'0.0.0.0',HostPort:'55433'}]}}}),
    container=>({...container,Mounts:[{Type:'volume',Name:'other-volume',Destination:'/var/lib/postgresql/data'}]}),
    container=>({...container,Mounts:[]}),
  ]
  for(const mutate of containerMutations)assert.throws(()=>assertIdentity(rehearsalIdentity,mutate(rehearsalContainer)))
})

test('the recovery Python resolver honors an explicit override and fails closed with actionable guidance',()=>{
  const resolveRecoveryPython=requiredFunction('resolveRecoveryPython')
  const probes=[]
  const override=resolveRecoveryPython({
    env:{METARDU_RECOVERY_PYTHON:'C:/synthetic/python.exe'},
    platform:'win32',
    probe:command=>{probes.push(command);return true},
  })
  assert.equal(override,'C:/synthetic/python.exe')
  assert.deepEqual(probes,['C:/synthetic/python.exe'])
  assert.throws(()=>resolveRecoveryPython({
    env:{METARDU_RECOVERY_PYTHON:'C:/synthetic/missing-python.exe'},
    platform:'win32',
    probe:()=>false,
  }),/METARDU_RECOVERY_PYTHON/)
  assert.equal(resolveRecoveryPython({
    env:{},
    platform:'linux',
    probe:command=>command==='python3',
  }),'python3')
  assert.throws(()=>resolveRecoveryPython({
    env:{},
    platform:'linux',
    probe:()=>false,
  }),/METARDU_RECOVERY_PYTHON/)
})

test('recovery archive compatibility roles are explicit and never privileged logins',()=>{
  const roles=requiredFunction('recoveryArchiveRoleDefinitions')()
  assert.deepEqual(roles,[
    {name:'metardu',login:false,superuser:true,bypassRls:false},
    {name:'metardu_app',login:false,superuser:false,bypassRls:false},
    {name:'authenticated',login:false,superuser:false,bypassRls:false},
    {name:'anon',login:false,superuser:false,bypassRls:false},
    {name:'service_role',login:false,superuser:false,bypassRls:false},
  ])
})

test('recovery child migration discovery is pinned and cannot inherit an ambient registry',()=>{
  const childEnvironment=rehearsalDatabase.recoveryChildEnvironment
  const migrationsDirectory=rehearsalDatabase.recoveryMigrationsDirectory
  const recoveryStatusAfterCleanup=rehearsalDatabase.recoveryStatusAfterCleanup
  assert.equal(typeof childEnvironment,'function')
  assert.equal(typeof migrationsDirectory,'function')
  assert.equal(typeof recoveryStatusAfterCleanup,'function')
  const child=childEnvironment({MIGRATIONS_DIR:'/ambient/registry'},{BASE:'kept'})
  assert.equal(child.MIGRATIONS_DIR,'')
  assert.equal(child.BASE,'kept')
  assert.equal(migrationsDirectory('/reviewed/root'),path.resolve('/reviewed/root/src/lib/db/migrations'))
  assert.equal(recoveryStatusAfterCleanup('passed',{databaseRemoved:true}),'passed')
  assert.equal(recoveryStatusAfterCleanup('passed',{databaseRemoved:false}),'cleanup-failed')
  assert.equal(recoveryStatusAfterCleanup('failed',{databaseRemoved:false}),'cleanup-failed')
  const source=readFileSync(new URL('../scripts/verify-fresh-recovery.mjs',import.meta.url),'utf8')
  assert.match(source,/MIGRATIONS_DIR:\s*''/)
  assert.match(source,/collectFileMigrations\(recoveryMigrationsDirectory\(\)\)/)
  assert.doesNotMatch(source,/collectFileMigrations\(\s*\)/)
})

test('reference-profile seed delta is derived from the source registry and pre-upgrade ledger',()=>{
  const expectedAdditions=requiredFunction('expectedToleranceProfileAdditions')
  const migration='068_background_jobs_and_observation_batches'
  assert.equal(expectedAdditions([migration],[]),1)
  assert.equal(expectedAdditions([migration],[migration]),0)
  assert.equal(expectedAdditions([],[]),0)
})

test('recovery archives must be one explicitly selected matching database and uploads pair',()=>{
  const parse=requiredFunction('parseRecoveryArchivePair')
  const pair={databaseArchive:'/backups/db_20261126_120000.sql.gz',uploadsArchive:'/backups/uploads_20261126_120000.tar.gz'}
  assert.deepEqual(parse(pair),pair)
  for(const unsafe of [
    {...pair,databaseArchive:'/backups/db_20261126_120001.sql.gz'},
    {...pair,uploadsArchive:'/backups/uploads_20261127_120000.tar.gz'},
    {...pair,databaseArchive:'/tmp/db_20261126_120000.sql.gz'},
    {...pair,uploadsArchive:'/backups/uploads_20261126_120000.zip'},
    {...pair,databaseArchive:'/backups/db_20261126_120000.sql.gz/../other'},
  ])assert.throws(()=>parse(unsafe))
})

test('recovery evidence is bound to the exact candidate revision and migration registry',()=>{
  const assertRecoveryProof=releasePlan.assertRecoveryProof
  assert.equal(typeof assertRecoveryProof,'function','Missing exact-revision recovery evidence contract')
  const sourceRegistry=[{version:'001_initial',checksum:'a'.repeat(64)}]
  const proof={
    revision:sha,
    status:'passed',
    sourceRegistry,
    sourceRegistrySha256:'997e1f05ed0f72e0b8ab7170f692dbd15a2c80a7936a70f5802cd135dce8226b',
    proofSourceSha256:recoveryProofSourceSha256,
    archiveSha256:{database:'b'.repeat(64),uploads:'c'.repeat(64)},
    cleanup:{databaseRemoved:true,uploadsCopyRemoved:true},
    checks:[{name:'restore',passed:true}],
  }
  assert.throws(()=>assertRecoveryProof(proof,sha,sourceRegistry),'Recovery admission must require candidate-derived proof-source hashes.')
  assertRecoveryProof(proof,sha,sourceRegistry,recoveryProofSourceSha256)
  for(const changed of [
    {revision:'d'.repeat(40)},
    {status:'failed'},
    {sourceRegistry:[{version:'001_initial',checksum:'e'.repeat(64)}]},
    {sourceRegistrySha256:'e'.repeat(64)},
    {proofSourceSha256:{...recoveryProofSourceSha256,'scripts/verify-migrations.mjs':'f'.repeat(64)}},
    {cleanup:{databaseRemoved:false,uploadsCopyRemoved:true}},
    {archiveSha256:{database:'b'.repeat(64)}},
    {checks:[{name:'restore',passed:false}]},
  ])assert.throws(()=>assertRecoveryProof({...proof,...changed},sha,sourceRegistry,recoveryProofSourceSha256))
})

test('recovery admission rejects evidence when a transitive proof dependency changed',()=>{
  const assertRecoveryProof=releasePlan.assertRecoveryProof
  const sourceRegistry=[{version:'001_initial',checksum:'a'.repeat(64)}]
  const proof={
    revision:sha,
    status:'passed',
    sourceRegistry,
    sourceRegistrySha256:'997e1f05ed0f72e0b8ab7170f692dbd15a2c80a7936a70f5802cd135dce8226b',
    proofSourceSha256:recoveryProofSourceSha256,
    archiveSha256:{database:'b'.repeat(64),uploads:'c'.repeat(64)},
    cleanup:{databaseRemoved:true,uploadsCopyRemoved:true},
    checks:[{name:'restore',passed:true}],
  }
  const changedCandidate=rehearsalDatabase.recoveryProofSourceHashes({...recoveryProofSourceContents,'scripts/migrate-unified.mjs':'changed transitive dependency\n'})
  assert.throws(()=>assertRecoveryProof(proof,sha,sourceRegistry,changedCandidate))
})

test('rehearsal evidence is bound to the exact candidate revision and migration registry',()=>{
  const assertRehearsalProof=releasePlan.assertRehearsalProof
  assert.equal(typeof assertRehearsalProof,'function','Missing exact-revision rehearsal evidence contract')
  const sourceRegistry=[{version:'001_initial',checksum:'a'.repeat(64)}]
  const proof={revision:sha,sourceRegistry,passed:true,customerDataCopied:false,existingContainer:true}
  assertRehearsalProof(proof,sha,sourceRegistry)
  for(const changed of [
    {revision:'d'.repeat(40)},
    {sourceRegistry:[{version:'001_initial',checksum:'e'.repeat(64)}]},
    {passed:false},
    {customerDataCopied:true},
    {existingContainer:false},
  ])assert.throws(()=>assertRehearsalProof({...proof,...changed},sha,sourceRegistry))
})

test('build-time rehearsal admission independently compares the pinned candidate source registry',()=>{
  const assertCandidateRehearsalProof=releasePlan.assertCandidateRehearsalProof
  assert.equal(typeof assertCandidateRehearsalProof,'function','Missing candidate-registry rehearsal admission contract')
  const planned=[{version:'001_initial',checksum:'a'.repeat(64)}]
  const candidate=[{version:'001_initial',checksum:'a'.repeat(64)}]
  const proof={revision:sha,sourceRegistry:planned,passed:true,customerDataCopied:false,existingContainer:true}
  assertCandidateRehearsalProof(proof,sha,planned,candidate)
  assert.throws(()=>assertCandidateRehearsalProof(proof,sha,planned,[{version:'001_initial',checksum:'b'.repeat(64)}]))
  assert.throws(()=>assertCandidateRehearsalProof({...proof,sourceRegistry:[{version:'001_initial',checksum:'b'.repeat(64)}]},sha,planned,candidate))
})

test('isolated rehearsal identity uses only the complete pinned revision',()=>{
  const identity=pinnedRehearsalIdentity(sha)
  assert.equal(identity.database,'metardu_release_'+sha)
  assert.equal(identity.runtimeRole,'metardu_release_app_'+sha)
  assert.ok(identity.database.length<=63&&identity.runtimeRole.length<=63)
  assert.match(identity.marker,new RegExp(sha+'$'))
  for(const unsafe of ['HEAD',sha.slice(0,8),sha+';'])assert.throws(()=>pinnedRehearsalIdentity(unsafe))
})
const source=[{version:'107_existing',path:'src/lib/db/migrations/107_existing.sql',checksum:'a'.repeat(64),equivalentChecksums:[]},{version:'108_pipeline_asbuilt_history',path:'src/lib/db/migrations/108_pipeline_asbuilt_history.sql',checksum:'b'.repeat(64),equivalentChecksums:[]}]
test('release commands require a pinned commit and stay in one reusable namespace',()=>{
  assert.equal(pinnedReleaseArguments(['build',sha],process.cwd()).revision,sha)
  assert.equal(pinnedReleaseArguments(['build',sha,'--unified'],process.cwd()).directory,path.resolve('.cache/release-verify/unified-release',sha))
  assert.notEqual(pinnedReleaseArguments(['build',sha,'--unified'],process.cwd()).directory,pinnedReleaseArguments(['build','a'.repeat(40),'--unified'],process.cwd()).directory)
  assert.notEqual(pinnedReleaseArguments(['plan',sha,'--unified'],process.cwd()).directory,pinnedReleaseArguments(['plan',sha],process.cwd()).directory)
  for(const args of [['build','HEAD'],['build','main'],['build',sha,'extra'],['prune',sha]])assert.throws(()=>pinnedReleaseArguments(args,process.cwd()))
})
test('rollback validates every applied migration and includes only reviewed completed versions',()=>{
  assert.equal(compatibleRollbackRegistry(source,[{version:'107_existing',checksum:'a'.repeat(64)}]).length,1)
  assert.equal(compatibleRollbackRegistry(source,[{version:'107_existing',checksum:'a'.repeat(64)},{version:'108_pipeline_asbuilt_history',checksum:'b'.repeat(64)}]).length,2)
  for(const ledger of [[],[{version:'unknown',checksum:'x'.repeat(64)}],[{version:'107_existing',checksum:'c'.repeat(64)}],[{version:'107_existing',checksum:'a'.repeat(64)},{version:'107_existing',checksum:'a'.repeat(64)}]])assert.throws(()=>compatibleRollbackRegistry(source,ledger))
  for(const checksum of [undefined,null,'','not-a-checksum','a'.repeat(63),'g'.repeat(64)]){
    assert.throws(()=>compatibleRollbackRegistry(source,[{version:'107_existing',checksum}]),/checksum/i)
  }
})
test('complete rehearsals accept only checked equivalent line endings for historical hashes', () => {
  const sql = 'SELECT 1;\nSELECT 2;\n'
  const file = { version: '001_existing', path: 'src/lib/db/migrations/001_existing.sql', ...migrationChecksums(Buffer.from(sql)) }
  const legacy = migrationChecksums(Buffer.from(sql.replaceAll('\n', '\r\n'))).checksum
  assert.notEqual(legacy, file.checksum)
  for (const checksum of [file.checksum, legacy]) assertCompleteRehearsalLedger([file], [{ version: file.version, checksum }])
  for (const checksum of [null, 'a'.repeat(64)]) assert.throws(() => assertCompleteRehearsalLedger([file], [{ version: file.version, checksum }]))
  const next = { ...file, version: '002_existing', path: 'src/lib/db/migrations/002_existing.sql' }
  const row = { version: file.version, checksum: file.checksum }
  assert.throws(() => assertCompleteRehearsalLedger([file, next], [row]))
  assert.throws(() => assertCompleteRehearsalLedger([file, next], [row, row]))
})

test('a newly discovered migration cannot silently enter the reviewed release',()=>{
  assert.deepEqual(assertSurveyReleaseDrift(source,[{version:'107_existing',checksum:'a'.repeat(64)}]).missing,['108_pipeline_asbuilt_history'])
  assert.throws(()=>assertSurveyReleaseDrift([...source,{version:'111_unreviewed',path:'src/lib/db/migrations/111_unreviewed.sql',checksum:'c'.repeat(64)}],[{version:'107_existing',checksum:'a'.repeat(64)}]))
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

function deployedIdentity(runtime='unknown') {
  const image={Id:'sha256:'+'a'.repeat(64),Config:{Labels:{'org.opencontainers.image.revision':sha}}}
  const app={Name:'/metardu-app',Image:image.Id,Config:{Labels:{'com.docker.compose.service':'metardu-app'},Env:runtime===null?[]:['METARDU_BUILD_SHA='+runtime]}}
  return {app,image}
}
test('rollback revision is pinned to the exact running image when runtime identity is unknown',()=>{
  for(const runtime of ['unknown','',null,sha]){
    const {app,image}=deployedIdentity(runtime)
    assert.deepEqual(deployedAppRevision(app,image),{revision:sha,imageId:image.Id,source:'org.opencontainers.image.revision',runtimeRevision:runtime??''})
  }
})
test('an unlabeled legacy image rejects the former self-attested preflight shape',()=>{
  const image={Id:'sha256:'+'a'.repeat(64),Config:{Labels:{}}}
  const app={Name:'/metardu-app',Image:image.Id,Config:{Labels:{'com.docker.compose.service':'metardu-app'},Env:['METARDU_BUILD_SHA='+sha]}}
  const preflight={status:'passed',readOnly:true,runtimeRolePassed:true,baseImage:image.Id,baseRelease:sha,appliedMigrations:131,missing:[],mutated:0,ghost:[]}
  assert.throws(()=>deployedAppRevision(app,image,preflight,{
    expectedImageId:image.Id,
    expectedRuntimeRevision:sha,
    expectedCandidateRevision:sha,
    expectedProducerSha256:'b'.repeat(64),
    liveEvidence:{imageId:image.Id,runtimeRevision:sha,ledgerSha256:'c'.repeat(64),appliedMigrationCount:131,runtimeRolePassed:true,drift:{missing:[],mutated:[],ghost:[]}},
    now:Date.parse('2026-11-26T18:00:00.000Z'),
  }))
  assert.throws(()=>deployedAppRevision(app,image))
})

test('conflicting, missing, malformed or foreign deployed identities block release planning',()=>{
  const mutations=[
    ({app})=>app.Name='/other',
    ({app})=>app.Config.Labels['com.docker.compose.service']='other',
    ({app})=>app.Image='sha256:invalid',
    ({image})=>image.Id='sha256:'+'b'.repeat(64),
    ({image})=>delete image.Config.Labels,
    ({image})=>image.Config.Labels['org.opencontainers.image.revision']='unknown',
    ({app})=>app.Config.Env=['METARDU_BUILD_SHA='+'b'.repeat(40)],
    ({app})=>app.Config.Env=['METARDU_BUILD_SHA=working-tree-unverified'],
    ({app})=>app.Config.Env.push('METARDU_BUILD_SHA='+sha),
  ]
  for(const mutate of mutations){const fixture=deployedIdentity();mutate(fixture);assert.throws(()=>deployedAppRevision(fixture.app,fixture.image))}
})


test('collaboration admission requires the full exact 129-to-131 forward proof',()=>{
  const pending=COLLABORATION_UPGRADE_VERSIONS
  const sourceRegistry=Array.from({length:129},(_,i)=>({version:i+'_original',checksum:'a'.repeat(64)}))
    .concat(pending.map(version=>({version,checksum:'b'.repeat(64)})))
  const proof={revision:sha,status:'passed',sourceBaseline:129,targetLedgerCount:131,pending,sourceRegistry,
    customerDataCopied:false,newContainer:false,productionMutated:false,
    cleanup:{syntheticDatabaseRemoved:true,syntheticRoleRemoved:true},
    checks:COLLABORATION_UPGRADE_CHECKS.map(name=>({name,passed:true}))}
  const expected={pending,sourceRegistry}
  assertSyntheticUpgradeProof(proof,sha,expected)
  for(const changed of [{sourceBaseline:128},{targetLedgerCount:130},{productionMutated:true},
    {sourceRegistry:sourceRegistry.slice(1)},{cleanup:{syntheticDatabaseRemoved:true}},
    {checks:proof.checks.slice(1)},{checks:proof.checks.concat(proof.checks[0])}]) {
    assert.throws(()=>assertSyntheticUpgradeProof({...proof,...changed},sha,expected))
  }
  assert.throws(()=>assertSyntheticUpgradeProof(proof,sha,{...expected,pending:pending.slice(1)}))
})

const promotionBackupOutput=`[2026-11-26T15:12:35Z] Starting database backup...
[2026-11-26T15:12:35Z] Archiving uploads...
[2026-11-26T15:12:35Z] Database and uploads archive integrity verified.
[2026-11-26T15:12:36Z] Pruning archives older than 36500 days...
[2026-11-26T15:12:36Z] Backup complete. Verified database and uploads archives retained in /backups.`
const promotionBackupBefore=[
  '/backups/db_20261125_020000.sql.gz',
  '/backups/uploads_20261125_020000.tar.gz',
]
const promotionBackupAfter=[
  ...promotionBackupBefore,
  '/backups/db_20261126_151235.sql.gz',
  '/backups/uploads_20261126_151235.tar.gz',
]
function promotionBackupCheckpointContract(){
  const validate=releasePlan.assertPromotionBackupCheckpoint
  assert.equal(typeof validate,'function','Missing promotion backup checkpoint contract')
  return validate
}

test('promotion backup checkpoint accepts the current backup contract and identifies the exact new pair',()=>{
  const validate=promotionBackupCheckpointContract()
  assert.deepEqual(validate({output:promotionBackupOutput,beforeInventory:promotionBackupBefore,afterInventory:promotionBackupAfter}),{
    database:'/backups/db_20261126_151235.sql.gz',
    uploads:'/backups/uploads_20261126_151235.tar.gz',
  })
})

test('promotion backup checkpoint requires the current integrity and completion markers',()=>{
  const validate=promotionBackupCheckpointContract()
  for(const output of [
    '[2026-11-26T15:12:35Z] Backup integrity verified.\n[2026-11-26T15:12:36Z] Backup complete.',
    '[2026-11-26T15:12:35Z] Database and uploads archive integrity verified.',
    '[2026-11-26T15:12:36Z] Backup complete. Verified database and uploads archives retained in /backups.',
  ])assert.throws(()=>validate({output,beforeInventory:promotionBackupBefore,afterInventory:promotionBackupAfter}))
})

test('promotion backup checkpoint rejects absent, partial or ambiguous new archive pairs',()=>{
  const validate=promotionBackupCheckpointContract()
  const cases=[
    {afterInventory:promotionBackupBefore},
    {afterInventory:[...promotionBackupAfter,'/backups/db_20261126_151236.sql.gz']},
    {afterInventory:[...promotionBackupAfter,'/backups/uploads_20261126_151236.tar.gz']},
    {afterInventory:[...promotionBackupBefore,'/backups/db_20261126_151235.sql.gz']},
    {afterInventory:[...promotionBackupBefore,'/backups/uploads_20261126_151236.tar.gz']},
  ]
  for(const change of cases)assert.throws(()=>validate({output:promotionBackupOutput,beforeInventory:promotionBackupBefore,...change}))
})

test('promotion backup checkpoint rejects a complete new pair with mismatched timestamps',()=>{
  const validate=promotionBackupCheckpointContract()
  const afterInventory=[
    ...promotionBackupBefore,
    '/backups/db_20261126_151235.sql.gz',
    '/backups/uploads_20261126_151236.tar.gz',
  ]
  assert.throws(()=>validate({output:promotionBackupOutput,beforeInventory:promotionBackupBefore,afterInventory}),error=>{
    assert.equal(error.message.split('\n')[0],'Promotion backup database and uploads archives must share one timestamp.')
    return true
  })
})

test('promotion backup checkpoint rejects a removed prior archive',()=>{
  const validate=promotionBackupCheckpointContract()
  const afterInventory=promotionBackupAfter.filter(archive=>archive!=='/backups/db_20261125_020000.sql.gz')
  assert.throws(()=>validate({output:promotionBackupOutput,beforeInventory:promotionBackupBefore,afterInventory}))
})

test('promotion backup checkpoint rejects malformed names, unexpected files and non-canonical paths',()=>{
  const validate=promotionBackupCheckpointContract()
  const cases=[
    {beforeInventory:['/backups/db_20261126_15123.sql.gz']},
    {afterInventory:[...promotionBackupAfter,'/backups/uploads_20261126_151235.zip']},
    {afterInventory:[...promotionBackupAfter,'/backups/db_20261126_151235.sql.gz.gpg']},
    {afterInventory:[...promotionBackupAfter,'/backups/notes.txt']},
    {beforeInventory:['/tmp/db_20261126_151235.sql.gz']},
    {afterInventory:[...promotionBackupAfter,'/backups/../tmp/db_20261126_151235.sql.gz']},
    {afterInventory:[...promotionBackupAfter,'/backups/db_20261126_151235.sql.gz/../other']},
  ]
  for(const change of cases)assert.throws(()=>validate({output:promotionBackupOutput,beforeInventory:promotionBackupBefore,...change}))
})
