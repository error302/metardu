import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as releasePlan from '../scripts/release-plan.mjs'

const legacyPreflight=await import('../scripts/verify-legacy-image-preflight.mjs').catch(()=>({}))
function requiredFunction(name){
  const value=legacyPreflight[name]
  assert.equal(typeof value,'function',`Missing legacy preflight contract: ${name}`)
  return value
}
function requiredValue(name){
  const value=legacyPreflight[name]
  assert.notEqual(value,undefined,`Missing legacy preflight contract: ${name}`)
  return value
}

const candidateRevision='eac2835e377f59dd0d1b1ff98cb3fbc311401f22'
const runtimeRevision='c1591bda793e415d300f7f58176e1ced8c020f6b'
const imageId='sha256:'+'a'.repeat(64)
const containerId='b'.repeat(64)
const producerSha256='c'.repeat(64)
const checkedAt='2026-11-26T12:00:00.000Z'
const now=Date.parse('2026-11-26T18:00:00.000Z')
const ledger=[
  {version:'001_initial',checksum:'c'.repeat(64)},
  {version:'002_rls_fixed',checksum:'d'.repeat(64)},
]
const drift={missing:[],mutated:[],ghost:[]}
const runtimeIdentity={
  user_name:'metardu_app',
  rolsuper:false,
  rolbypassrls:false,
  rolcreatedb:false,
  rolcreaterole:false,
  rolreplication:false,
  can_create_database:false,
  can_create_in_public:false,
  owns_public_objects:false,
  can_mutate_migration_ledger:false,
  memberships:['authenticated'],
  authenticated_role_safe:true,
}
function artifactDigest(artifact){
  return requiredFunction('legacyPreflightArtifactDigest')(artifact)
}
function strictVerifier(overrides={}){
  return {
    passed:true,
    script:'/app/verify-migrations.mjs',
    migrationsDir:'/app/migrations',
    readOnly:true,
    exitStatus:0,
    containerId,
    imageId,
    ...overrides,
  }
}
function sealedArtifact(overrides={}){
  const artifact={
    schemaVersion:1,
    status:'passed',
    checkedAt,
    candidateRevision,
    producer:{path:'scripts/verify-legacy-image-preflight.mjs',sha256:producerSha256},
    containerId,
    image:{id:imageId,runtimeRevision,ociRevision:null},
    strictVerifier:strictVerifier(),
    runtimeRole:{passed:true,failure:null},
    ledger:{sha256:createHash('sha256').update(JSON.stringify(ledger)).digest('hex'),appliedMigrationCount:ledger.length},
    drift,
    readOnly:true,
    customerRowsRead:false,
    ...overrides,
  }
  return {...artifact,artifactSha256:artifactDigest(artifact)}
}
function liveEvidence(evidenceDrift=drift){
  return requiredFunction('createLegacyPreflightLiveEvidence')({
    imageId,
    containerId,
    runtimeRevision,
    ledger,
    runtimeIdentity,
    drift:evidenceDrift,
    strictVerifier:strictVerifier(),
  })
}
function admissionContext(overrides={}){
  return {
    expectedImageId:imageId,
    expectedContainerId:containerId,
    expectedRuntimeRevision:runtimeRevision,
    expectedCandidateRevision:candidateRevision,
    expectedProducerSha256:producerSha256,
    now,
    ...overrides,
  }
}

test('a fresh producer-pinned legacy preflight is admitted with exact live evidence',()=>{
  const assertArtifact=requiredFunction('assertLegacyPreflightArtifact')
  const assertAdmission=requiredFunction('assertLegacyPreflightAdmission')
  const artifact=sealedArtifact(),live=liveEvidence()
  assertArtifact(artifact,admissionContext())
  assertAdmission(artifact,live,admissionContext())
})

test('stale, fabricated or differently produced legacy preflight evidence is rejected',()=>{
  const assertAdmission=requiredFunction('assertLegacyPreflightAdmission')
  const live=liveEvidence()
  const invalid=[
    sealedArtifact({checkedAt:'2026-11-25T17:59:59.999Z'}),
    sealedArtifact({containerId:'e'.repeat(64)}),
    sealedArtifact({image:{id:'sha256:'+'e'.repeat(64),runtimeRevision,ociRevision:null}}),
    sealedArtifact({image:{id:imageId,runtimeRevision:'f'.repeat(40),ociRevision:null}}),
    sealedArtifact({candidateRevision:'f'.repeat(40)}),
    sealedArtifact({producer:{path:'scripts/other-preflight.mjs',sha256:producerSha256}}),
    sealedArtifact({producer:{path:'scripts/verify-legacy-image-preflight.mjs',sha256:'e'.repeat(64)}}),
    sealedArtifact({strictVerifier:{...strictVerifier(),passed:false}}),
    sealedArtifact({strictVerifier:{...strictVerifier(),containerId:'e'.repeat(64)}}),
    sealedArtifact({strictVerifier:{...strictVerifier(),imageId:'sha256:'+'e'.repeat(64)}}),
    sealedArtifact({runtimeRole:{passed:false,failure:'unsafe runtime role'}}),
    sealedArtifact({drift:{missing:[],mutated:['001_initial'],ghost:[]}}),
    sealedArtifact({drift:{missing:[],mutated:[],ghost:['unknown']}}),
    sealedArtifact({ledger:{sha256:'e'.repeat(64),appliedMigrationCount:ledger.length}}),
    {...sealedArtifact(),artifactSha256:'e'.repeat(64)},
  ]
  for(const artifact of invalid)assert.throws(()=>assertAdmission(artifact,live,admissionContext()))
})

test('live image, container, verifier, ledger, drift and runtime-role evidence must match the legacy artifact',()=>{
  const assertAdmission=requiredFunction('assertLegacyPreflightAdmission')
  const artifact=sealedArtifact()
  const invalid=[
    {...liveEvidence(),imageId:'sha256:'+'e'.repeat(64)},
    {...liveEvidence(),containerId:'e'.repeat(64)},
    {...liveEvidence(),runtimeRevision:'f'.repeat(40)},
    {...liveEvidence(),ledgerSha256:'e'.repeat(64)},
    {...liveEvidence(),appliedMigrationCount:ledger.length+1},
    {...liveEvidence(),runtimeRole:{...liveEvidence().runtimeRole,passed:false}},
    {...liveEvidence(),strictVerifier:{...liveEvidence().strictVerifier,containerId:'e'.repeat(64)}},
    {...liveEvidence(),strictVerifier:{...liveEvidence().strictVerifier,imageId:'sha256:'+'e'.repeat(64)}},
    {...liveEvidence(),strictVerifier:{...liveEvidence().strictVerifier,exitStatus:1}},
    {...liveEvidence(),strictVerifier:undefined},
    {...liveEvidence(),drift:{missing:['131_pending'],mutated:[],ghost:[]}},
    {...liveEvidence(),drift:{missing:[],mutated:['001_initial'],ghost:[]}},
    {...liveEvidence(),drift:{missing:[],mutated:[],ghost:['unknown']}},
  ]
  for(const evidence of invalid)assert.throws(()=>assertAdmission(artifact,evidence,admissionContext()))
})

test('the unlabeled-image exception requires the same producer-bound live admission',()=>{
  const image={Id:imageId,Config:{Labels:{}}}
  const app={Id:containerId,Name:'/metardu-app',Image:imageId,State:{Running:true},Config:{Labels:{'com.docker.compose.service':'metardu-app'},Env:['METARDU_BUILD_SHA='+runtimeRevision]}}
  const artifact=sealedArtifact(),live=liveEvidence()
  assert.deepEqual(releasePlan.deployedAppRevision(app,image,artifact,{
    ...admissionContext(),
    liveEvidence:live,
  }),{revision:runtimeRevision,imageId,source:'legacy-image-bound-preflight',runtimeRevision,legacyImage:true})
  assert.throws(()=>releasePlan.deployedAppRevision(app,image,artifact,{
    ...admissionContext(),
  }),/live/i)
  assert.throws(()=>releasePlan.deployedAppRevision(app,image,{status:'passed',readOnly:true,runtimeRolePassed:true,baseImage:imageId,baseRelease:runtimeRevision,appliedMigrations:131,missing:[],mutated:0,ghost:[]},{
    ...admissionContext(),
    liveEvidence:live,
  }))
})

test('an allowed candidate pending migration is admitted while mutated and ghost drift remain rejected',()=>{
  const assertAdmission=requiredFunction('assertLegacyPreflightAdmission')
  const pendingVersion='108_pipeline_asbuilt_history'
  const source=[
    {version:'001_initial',path:'src/lib/db/migrations/001_initial.sql',checksum:'c'.repeat(64),equivalentChecksums:[]},
    {version:pendingVersion,path:`src/lib/db/migrations/${pendingVersion}.sql`,checksum:'e'.repeat(64),equivalentChecksums:[]},
  ]
  const applied=[{version:'001_initial',checksum:'c'.repeat(64)}]
  assert.deepEqual(releasePlan.assertSurveyReleaseDrift(source,applied).missing,[pendingVersion])
  const pendingDrift={missing:[pendingVersion],mutated:[],ghost:[]}
  const artifact=sealedArtifact({drift:pendingDrift})
  assert.doesNotThrow(()=>assertAdmission(artifact,liveEvidence(pendingDrift),admissionContext()))
  assert.throws(()=>assertAdmission(sealedArtifact({drift:{missing:[],mutated:['001_initial'],ghost:[]}}),liveEvidence({missing:[],mutated:['001_initial'],ghost:[]}),admissionContext()))
  assert.throws(()=>assertAdmission(sealedArtifact({drift:{missing:[],mutated:[],ghost:['unknown']}}),liveEvidence({missing:[],mutated:[],ghost:['unknown']}),admissionContext()))
})

test('the release plan exports the live collection wiring used for immutable verifier and role probes',()=>{
  assert.equal(typeof releasePlan.collectLegacyPreflightLiveEvidence,'function')
})

test('live collection runs the exact verifier and role probe by immutable container id and re-inspects identity',()=>{
  assert.equal(typeof releasePlan.collectLegacyPreflightLiveEvidence,'function')
  const collect=releasePlan.collectLegacyPreflightLiveEvidence
  const calls=[]
  const app={Id:containerId,Name:'/metardu-app',Image:imageId,State:{Running:true},Config:{Labels:{'com.docker.compose.service':'metardu-app'},Env:['METARDU_BUILD_SHA='+runtimeRevision]}}
  const image={Id:imageId,Config:{Labels:{}}}
  const executeDocker=(args,phase)=>{
    calls.push({args,phase})
    if(args[0]==='exec'&&args.includes('/app/verify-migrations.mjs'))return {exitStatus:0,stdout:''}
    if(args[0]==='exec'&&args.includes('-e'))return {exitStatus:0,stdout:JSON.stringify(runtimeIdentity)}
    if(args[0]==='inspect')return {exitStatus:0,stdout:JSON.stringify([app])}
    if(args[0]==='image'&&args[1]==='inspect')return {exitStatus:0,stdout:JSON.stringify([image])}
    throw new Error(`Unexpected Docker invocation: ${args.join(' ')}`)
  }
  const evidence=collect({app,image,runtimeRevision,ledger,drift,executeDocker})
  assert.equal(evidence.containerId,containerId)
  assert.deepEqual(evidence.strictVerifier,strictVerifier())
  assert.deepEqual(evidence.runtimeRole,{passed:true,containerId,imageId})
  const strict=calls.find(call=>call.args.includes('/app/verify-migrations.mjs'))
  const role=calls.find(call=>call.args.includes('-e')&&!call.args.includes('/app/verify-migrations.mjs'))
  assert.deepEqual(strict.args,['exec','-e','MIGRATIONS_DIR=/app/migrations',containerId,'node','/app/verify-migrations.mjs'])
  assert.deepEqual(role.args,['exec',containerId,'node','-e',requiredValue('LEGACY_RUNTIME_ROLE_PROBE_SCRIPT')])
  for(const call of calls.filter(call=>call.args[0]==='exec'))assert.ok(call.args.includes(containerId))
  assert.ok(calls.some(call=>call.args[0]==='inspect'&&call.args[1]===containerId))
  assert.ok(calls.some(call=>call.args[0]==='image'&&call.args[1]==='inspect'&&call.args[2]===imageId))
})

test('live collection rejects verifier failure and changed container or image identity',()=>{
  const collect=requiredFunction('collectLegacyPreflightLiveEvidence')
  const app={Id:containerId,Name:'/metardu-app',Image:imageId,State:{Running:true},Config:{Labels:{'com.docker.compose.service':'metardu-app'},Env:['METARDU_BUILD_SHA='+runtimeRevision]}}
  const image={Id:imageId,Config:{Labels:{}}}
  const base=(overrides={})=>{
    const calls=[]
    const executeDocker=(args,phase)=>{
      calls.push({args,phase})
      if(args[0]==='exec'&&args.includes('/app/verify-migrations.mjs'))return {exitStatus:overrides.verifierStatus??0,stdout:''}
      if(args[0]==='exec'&&args.includes('-e'))return {exitStatus:0,stdout:JSON.stringify(runtimeIdentity)}
      if(args[0]==='inspect')return {exitStatus:0,stdout:JSON.stringify([overrides.reinspectedApp??app])}
      if(args[0]==='image'&&args[1]==='inspect')return {exitStatus:0,stdout:JSON.stringify([overrides.reinspectedImage??image])}
      throw new Error(`Unexpected Docker invocation: ${args.join(' ')}`)
    }
    return {calls,executeDocker}
  }
  assert.throws(()=>collect({app,image,runtimeRevision,ledger,drift,executeDocker:base({verifierStatus:1}).executeDocker}),/verifier|exit/i)
  assert.throws(()=>collect({app,image,runtimeRevision,ledger,drift,executeDocker:base({reinspectedApp:{...app,Id:'e'.repeat(64)}}).executeDocker}),/container|identity/i)
  assert.throws(()=>collect({app,image,runtimeRevision,ledger,drift,executeDocker:base({reinspectedApp:{...app,Image:'sha256:'+'e'.repeat(64)}}).executeDocker}),/image|identity/i)
  assert.throws(()=>collect({app,image,runtimeRevision,ledger,drift,executeDocker:base({reinspectedImage:{...image,Id:'sha256:'+'e'.repeat(64)}}).executeDocker}),/image|identity/i)
})

test('the injected legacy producer writes an artifact admitted by the pure live-evidence contract',async()=>{
  const produce=requiredFunction('produceLegacyImagePreflight')
  const canonicalSourceSha256=requiredFunction('canonicalSourceSha256')
  const assertAdmission=requiredFunction('assertLegacyPreflightAdmission')
  const actualProducer=readFileSync(new URL('../scripts/verify-legacy-image-preflight.mjs',import.meta.url))
  const actualProducerSha256=canonicalSourceSha256(actualProducer)
  const app={Id:containerId,Name:'/metardu-app',Image:imageId,State:{Running:true},Config:{Labels:{'com.docker.compose.service':'metardu-app'},Env:['METARDU_BUILD_SHA='+runtimeRevision]}}
  const image={Id:imageId,Config:{Labels:{}}}
  const calls=[]
  const executeCommand=(binary,args,options={})=>{
    calls.push({binary,args,options})
    if(binary==='git'){
      if(args.includes('rev-parse'))return candidateRevision
      if(args.includes(`${candidateRevision}:scripts/verify-legacy-image-preflight.mjs`))return actualProducer
      throw new Error(`Unexpected Git invocation: ${args.join(' ')}`)
    }
    if(binary==='docker'){
      if(args[0]==='inspect')return JSON.stringify([app])
      if(args[0]==='image'&&args[1]==='inspect')return JSON.stringify([image])
      if(args[0]==='exec'&&args.includes('/app/verify-migrations.mjs'))return ''
      if(args[0]==='exec'&&args.includes('-e'))return JSON.stringify(runtimeIdentity)
      throw new Error(`Unexpected Docker invocation: ${args.join(' ')}`)
    }
    throw new Error(`Unexpected command: ${binary}`)
  }
  const candidateSource=[
    {version:'001_initial',path:'src/lib/db/migrations/001_initial.sql',checksum:'c'.repeat(64),equivalentChecksums:[]},
    {version:'002_rls_fixed',path:'src/lib/db/migrations/002_rls_fixed.sql',checksum:'d'.repeat(64),equivalentChecksums:[]},
    {version:'108_pipeline_asbuilt_history',path:'src/lib/db/migrations/108_pipeline_asbuilt_history.sql',checksum:'e'.repeat(64),equivalentChecksums:[]},
  ]
  let written
  const result=await produce({
    revision:candidateRevision,
    output:path.resolve('.cache/release-verify/test/legacy-preflight.json'),
    executeCommand,
    readLedger:async()=>ledger,
    readCandidateSource:async()=>candidateSource,
    writeArtifact:(output,artifact)=>{written={output,artifact}},
    now:()=>new Date(checkedAt),
  })
  assert.equal(written.output,path.resolve('.cache/release-verify/test/legacy-preflight.json'))
  assert.equal(written.artifact.artifactSha256,result.artifact.artifactSha256)
  assert.doesNotThrow(()=>assertAdmission(result.artifact,result.liveEvidence,{
    expectedImageId:imageId,
    expectedContainerId:containerId,
    expectedRuntimeRevision:runtimeRevision,
    expectedCandidateRevision:candidateRevision,
    expectedProducerSha256:actualProducerSha256,
    now,
  }))
  const execCalls=calls.filter(call=>call.binary==='docker'&&call.args[0]==='exec')
  assert.equal(execCalls.length,2)
  for(const call of execCalls)assert.ok(call.args.includes(containerId))
  assert.ok(!execCalls.some(call=>call.args.includes('metardu-app')))
  assert.deepEqual(execCalls.find(call=>call.args.includes('/app/verify-migrations.mjs')).args,['exec','-e','MIGRATIONS_DIR=/app/migrations',containerId,'node','/app/verify-migrations.mjs'])
  assert.deepEqual(execCalls.find(call=>call.args.includes('-e')&&!call.args.includes('/app/verify-migrations.mjs')).args,['exec',containerId,'node','-e',requiredValue('LEGACY_RUNTIME_ROLE_PROBE_SCRIPT')])
})

test('the legacy artifact digest is canonical across object key ordering',()=>{
  const digest=requiredFunction('legacyPreflightArtifactDigest')
  const first={
    schemaVersion:1,
    status:'passed',
    checkedAt,
    candidateRevision,
    producer:{path:'scripts/verify-legacy-image-preflight.mjs',sha256:producerSha256},
    containerId,
    image:{id:imageId,runtimeRevision,ociRevision:null},
    ledger:{sha256:'c'.repeat(64),appliedMigrationCount:ledger.length},
    drift:{missing:[],mutated:[],ghost:[]},
  }
  const reordered={
    drift:{ghost:[],mutated:[],missing:[]},
    ledger:{appliedMigrationCount:ledger.length,sha256:'c'.repeat(64)},
    image:{ociRevision:null,runtimeRevision,id:imageId},
    producer:{sha256:producerSha256,path:'scripts/verify-legacy-image-preflight.mjs'},
    candidateRevision,
    checkedAt,
    status:'passed',
    schemaVersion:1,
    containerId,
  }
  assert.equal(digest(first),digest(reordered))
})

test('the legacy producer hash is canonical text and receipt evidence records the resolved artifact',()=>{
  const canonicalHash=requiredFunction('canonicalSourceSha256')
  assert.equal(canonicalHash('alpha\r\nbeta\r\n'),canonicalHash('alpha\nbeta\n'))
  assert.match(canonicalHash('alpha\n'),/^[a-f0-9]{64}$/)
  const receiptEvidence=requiredFunction('legacyPreflightReceiptEvidence')
  const artifact=sealedArtifact()
  assert.deepEqual(receiptEvidence('.cache/release-verify/mpesa-production/legacy/migration-preflight.json',null,artifact),{
    path:path.resolve('.cache/release-verify/mpesa-production/legacy/migration-preflight.json'),
    override:null,
    artifactSha256:artifact.artifactSha256,
  })
  const promotionSource=readFileSync(new URL('../scripts/promote-auth-release.mjs',import.meta.url),'utf8')
  assert.match(promotionSource,/legacyPreflightEvidence/)
  assert.match(promotionSource,/legacyPreflightReceiptEvidence/)
})
