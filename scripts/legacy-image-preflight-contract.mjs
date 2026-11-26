// Pure, dependency-light contracts for the known unlabeled legacy image.
// The executable producer lives in scripts/verify-legacy-image-preflight.mjs.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'

export const LEGACY_PREFLIGHT_SCHEMA_VERSION=1
export const LEGACY_PREFLIGHT_MAX_AGE_MS=24*60*60*1000
export const LEGACY_PREFLIGHT_MAX_FUTURE_SKEW_MS=5*60*1000
export const LEGACY_PREFLIGHT_PRODUCER_PATH='scripts/verify-legacy-image-preflight.mjs'
export const LEGACY_PREFLIGHT_STRICT_VERIFIER='/app/verify-migrations.mjs'
export const LEGACY_PREFLIGHT_MIGRATIONS_DIR='/app/migrations'

export function canonicalSourceSha256(content) {
  assert.ok(typeof content==='string'||Buffer.isBuffer(content)||content instanceof Uint8Array,'Source content must be text bytes.')
  const canonical=Buffer.from(content).toString('utf8').replace(/\r\n/g,'\n')
  return createHash('sha256').update(canonical,'utf8').digest('hex')
}

function canonicalJson(value) {
  if(value===null)return 'null'
  const type=typeof value
  if(type==='string'||type==='boolean')return JSON.stringify(value)
  if(type==='number') {
    assert.ok(Number.isFinite(value),'Legacy preflight artifact numbers must be finite.')
    return JSON.stringify(value)
  }
  assert.equal(type,'object','Legacy preflight artifact values must be JSON-compatible.')
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`
  const keys=Object.keys(value).sort()
  return `{${keys.map(key=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
}

export function legacyPreflightArtifactDigest(artifact) {
  assert.ok(artifact&&typeof artifact==='object'&&!Array.isArray(artifact),'Legacy preflight artifact must be an object.')
  const {artifactSha256:_artifactSha256,...payload}=artifact
  return createHash('sha256').update(canonicalJson(payload),'utf8').digest('hex')
}

function normalizedDrift(drift) {
  assert.ok(drift&&typeof drift==='object'&&!Array.isArray(drift),'Migration drift must be an object.')
  assert.ok(Array.isArray(drift.missing)&&Array.isArray(drift.mutated)&&Array.isArray(drift.ghost),'Migration drift results must be arrays.')
  return {
    missing:[...drift.missing],
    mutated:drift.mutated.map(value=>typeof value==='string'?value:value?.version),
    ghost:[...drift.ghost],
  }
}

function strictVerifierEvidence(value,{imageId,containerId}) {
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'Live strict-verifier evidence is required.')
  assert.equal(value.passed,true,'The exact running image strict verifier must pass.')
  assert.equal(value.script,LEGACY_PREFLIGHT_STRICT_VERIFIER,'The strict verifier must be the running image verifier.')
  assert.equal(value.migrationsDir,LEGACY_PREFLIGHT_MIGRATIONS_DIR,'The strict verifier must use the running image migration directory.')
  assert.equal(value.readOnly,true,'The strict verifier must run read-only.')
  assert.equal(value.exitStatus,0,'The strict verifier must exit successfully.')
  assert.equal(value.containerId,containerId,'The strict verifier must run in the admitted container.')
  assert.equal(value.imageId,imageId,'The strict verifier must run in the admitted image.')
  return {
    passed:true,
    script:value.script,
    migrationsDir:value.migrationsDir,
    readOnly:true,
    exitStatus:0,
    containerId:value.containerId,
    imageId:value.imageId,
  }
}

export function createLegacyPreflightLiveEvidence({imageId,containerId,runtimeRevision,ledger,runtimeIdentity,drift,strictVerifier}) {
  assert.match(imageId??'',/^sha256:[a-f0-9]{64}$/,'Legacy live evidence requires an exact image id.')
  assert.match(containerId??'',/^[a-f0-9]{64}$/,'Legacy live evidence requires an exact container id.')
  assert.match(runtimeRevision??'',/^[a-f0-9]{40}$/,'Legacy live evidence requires a full runtime revision.')
  assert.ok(Array.isArray(ledger)&&ledger.length>0,'Legacy live evidence requires a non-empty migration ledger.')
  for(const row of ledger)assert.match(row?.checksum??'',/^[a-f0-9]{64}$/,'Every live migration ledger row requires a valid checksum.')
  const roleFailure=runtimeDatabaseRoleFailure(runtimeIdentity)
  assert.equal(roleFailure,null,`Legacy runtime role verification failed: ${roleFailure}`)
  return {
    imageId,
    containerId,
    runtimeRevision,
    ledgerSha256:createHash('sha256').update(JSON.stringify(ledger),'utf8').digest('hex'),
    appliedMigrationCount:ledger.length,
    runtimeRole:{passed:true,containerId,imageId},
    strictVerifier:strictVerifierEvidence(strictVerifier,{imageId,containerId}),
    drift:normalizedDrift(drift),
  }
}

export function assertLegacyPreflightArtifact(artifact,{
  expectedImageId,
  expectedContainerId,
  expectedRuntimeRevision,
  expectedCandidateRevision,
  expectedProducerSha256,
  now=Date.now(),
  maxAgeMs=LEGACY_PREFLIGHT_MAX_AGE_MS,
}={}) {
  assert.ok(artifact&&typeof artifact==='object'&&!Array.isArray(artifact),'Legacy preflight artifact must be an object.')
  assert.equal(artifact.schemaVersion,LEGACY_PREFLIGHT_SCHEMA_VERSION,'Unsupported legacy preflight schema version.')
  assert.equal(artifact.status,'passed','Legacy preflight must have passed.')
  assert.equal(artifact.readOnly,true,'Legacy preflight must be read-only.')
  assert.equal(artifact.customerRowsRead,false,'Legacy preflight must not read customer rows.')
  assert.match(expectedImageId??'',/^sha256:[a-f0-9]{64}$/,'An exact legacy image id is required.')
  assert.match(expectedContainerId??'',/^[a-f0-9]{64}$/,'An exact legacy container id is required.')
  assert.match(expectedRuntimeRevision??'',/^[a-f0-9]{40}$/,'An exact legacy runtime revision is required.')
  assert.match(expectedCandidateRevision??'',/^[a-f0-9]{40}$/,'An exact candidate revision is required.')
  assert.match(expectedProducerSha256??'',/^[a-f0-9]{64}$/,'An exact candidate producer hash is required.')
  assert.equal(artifact.candidateRevision,expectedCandidateRevision,'Legacy preflight belongs to a different candidate revision.')
  assert.equal(artifact.producer?.path,LEGACY_PREFLIGHT_PRODUCER_PATH,'Legacy preflight must name the reviewed producer.')
  assert.equal(artifact.producer?.sha256,expectedProducerSha256,'Legacy preflight producer hash does not match the pinned candidate source.')
  assert.equal(artifact.containerId,expectedContainerId,'Legacy preflight belongs to a different running container.')
  assert.equal(artifact.image?.id,expectedImageId,'Legacy preflight belongs to a different running image.')
  assert.equal(artifact.image?.runtimeRevision,expectedRuntimeRevision,'Legacy preflight runtime revision does not match the running image.')
  assert.equal(artifact.image?.ociRevision,null,'The legacy exception is limited to an unlabeled image.')
  assert.deepEqual(strictVerifierEvidence(artifact.strictVerifier,{imageId:expectedImageId,containerId:expectedContainerId}),artifact.strictVerifier)
  assert.equal(artifact.runtimeRole?.passed,true,'The independent runtime-role verification must pass.')
  assert.equal(artifact.runtimeRole?.failure,null,'The independent runtime-role verification must have no failure.')
  assert.match(artifact.ledger?.sha256??'',/^[a-f0-9]{64}$/,'Legacy preflight requires an exact ledger digest.')
  assert.ok(Number.isSafeInteger(artifact.ledger?.appliedMigrationCount)&&artifact.ledger.appliedMigrationCount>0,'Legacy preflight requires the applied migration count.')
  const drift=normalizedDrift(artifact.drift)
  assert.deepEqual(drift.mutated,[],'Legacy preflight cannot admit mutated migrations.')
  assert.deepEqual(drift.ghost,[],'Legacy preflight cannot admit ghost migrations.')
  const checkedAt=Date.parse(artifact.checkedAt??'')
  assert.ok(Number.isFinite(checkedAt),'Legacy preflight requires an ISO timestamp.')
  assert.equal(new Date(checkedAt).toISOString(),artifact.checkedAt,'Legacy preflight timestamp must be canonical ISO-8601.')
  const age=now-checkedAt
  assert.ok(age<=maxAgeMs,'Legacy preflight is stale.')
  assert.ok(age>=-LEGACY_PREFLIGHT_MAX_FUTURE_SKEW_MS,'Legacy preflight timestamp is too far in the future.')
  assert.match(artifact.artifactSha256??'',/^[a-f0-9]{64}$/,'Legacy preflight requires its artifact digest.')
  assert.equal(artifact.artifactSha256,legacyPreflightArtifactDigest(artifact),'Legacy preflight artifact digest is invalid.')
  return artifact
}

export function assertLegacyPreflightLiveEvidence(artifact,liveEvidence) {
  assert.ok(liveEvidence&&typeof liveEvidence==='object'&&!Array.isArray(liveEvidence),'Live legacy preflight evidence is required.')
  assert.equal(liveEvidence.imageId,artifact.image?.id,'Live legacy image id does not match the artifact.')
  assert.equal(liveEvidence.containerId,artifact.containerId,'Live legacy container id does not match the artifact.')
  assert.equal(liveEvidence.runtimeRevision,artifact.image?.runtimeRevision,'Live legacy runtime revision does not match the artifact.')
  assert.equal(liveEvidence.ledgerSha256,artifact.ledger?.sha256,'Live legacy ledger digest does not match the artifact.')
  assert.equal(liveEvidence.appliedMigrationCount,artifact.ledger?.appliedMigrationCount,'Live legacy migration count does not match the artifact.')
  assert.equal(liveEvidence.runtimeRole?.passed,true,'The live runtime role is not restricted.')
  assert.equal(liveEvidence.runtimeRole?.containerId,artifact.containerId,'The live runtime-role probe used a different container.')
  assert.equal(liveEvidence.runtimeRole?.imageId,artifact.image?.id,'The live runtime-role probe used a different image.')
  assert.deepEqual(
    strictVerifierEvidence(liveEvidence.strictVerifier,{imageId:artifact.image?.id,containerId:artifact.containerId}),
    liveEvidence.strictVerifier,
    'The live strict verifier did not pass in the admitted container and image.',
  )
  assert.deepEqual(normalizedDrift(liveEvidence.drift),normalizedDrift(artifact.drift),'Live legacy migration drift does not match the artifact.')
  return liveEvidence
}

export function assertLegacyPreflightAdmission(artifact,liveEvidence,context) {
  assertLegacyPreflightArtifact(artifact,context)
  assertLegacyPreflightLiveEvidence(artifact,liveEvidence)
  return artifact
}

export function legacyPreflightReceiptEvidence(preflightPath,override,artifact) {
  assert.ok(typeof preflightPath==='string'&&preflightPath.length>0,'Legacy preflight path is required.')
  return {
    path:resolve(preflightPath),
    override:override??null,
    artifactSha256:legacyPreflightArtifactDigest(artifact),
  }
}

function successfulDockerResult(result,phase) {
  assert.ok(result&&typeof result==='object'&&!Array.isArray(result),`${phase} did not return Docker execution evidence.`)
  assert.equal(result.exitStatus,0,`${phase} failed; strict verification evidence requires exit status 0.`)
  return typeof result.stdout==='string'?result.stdout:''
}

export function collectLegacyPreflightLiveEvidence({app,image,runtimeRevision,ledger,drift,executeDocker}) {
  assert.ok(app&&typeof app==='object'&&!Array.isArray(app),'The inspected running application container is required.')
  assert.ok(image&&typeof image==='object'&&!Array.isArray(image),'The inspected running application image is required.')
  assert.equal(typeof executeDocker,'function','A Docker command runner is required.')
  const containerId=app.Id
  assert.match(containerId??'',/^[a-f0-9]{64}$/,'The running application requires an exact immutable container id.')
  assert.match(image.Id??'',/^sha256:[a-f0-9]{64}$/,'The running application requires an exact image id.')
  assert.equal(app.Image,image.Id,'The inspected image must be the exact running container image.')
  assert.equal(app.State?.Running,true,'The legacy application container must be running.')

  const verifierResult=executeDocker(
    ['exec','-e',`MIGRATIONS_DIR=${LEGACY_PREFLIGHT_MIGRATIONS_DIR}`,containerId,'node',LEGACY_PREFLIGHT_STRICT_VERIFIER],
    'strict-verifier',
  )
  successfulDockerResult(verifierResult,'strict-verifier')
  const roleResult=executeDocker(
    ['exec',containerId,'node','-e',LEGACY_RUNTIME_ROLE_PROBE_SCRIPT],
    'runtime-role-probe',
  )
  const roleOutput=successfulDockerResult(roleResult,'runtime-role-probe')
  let runtimeIdentity
  try {
    runtimeIdentity=JSON.parse(roleOutput)
  } catch {
    throw new Error('The live runtime-role probe returned invalid evidence.')
  }

  const inspectedContainerResult=executeDocker(['inspect',containerId],'post-verifier-container-inspect')
  const inspectedImageResult=executeDocker(['image','inspect',image.Id],'post-verifier-image-inspect')
  const inspectedContainers=JSON.parse(successfulDockerResult(inspectedContainerResult,'post-verifier-container-inspect'))
  const inspectedImages=JSON.parse(successfulDockerResult(inspectedImageResult,'post-verifier-image-inspect'))
  const inspectedContainer=inspectedContainers?.[0]
  const inspectedImage=inspectedImages?.[0]
  assert.equal(inspectedContainer?.Id,containerId,'The running container identity changed during legacy verification.')
  assert.equal(inspectedContainer?.Image,image.Id,'The running container image identity changed during legacy verification.')
  assert.equal(inspectedImage?.Id,image.Id,'The running image identity changed during legacy verification.')

  return createLegacyPreflightLiveEvidence({
    imageId:image.Id,
    containerId,
    runtimeRevision,
    ledger,
    runtimeIdentity,
    drift,
    strictVerifier:{
      passed:true,
      script:LEGACY_PREFLIGHT_STRICT_VERIFIER,
      migrationsDir:LEGACY_PREFLIGHT_MIGRATIONS_DIR,
      readOnly:true,
      exitStatus:verifierResult.exitStatus,
      containerId,
      imageId:image.Id,
    },
  })
}

export const LEGACY_RUNTIME_ROLE_PROBE_SCRIPT=`
const {Pool}=require('pg')
const config=process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{
  host:process.env.DB_HOST,
  port:Number(process.env.DB_PORT||5432),
  database:process.env.DB_NAME,
  user:process.env.DB_USER,
  password:process.env.DB_PASSWORD,
}
const pool=new Pool({...config,connectionTimeoutMillis:5000,statement_timeout:5000})
const query=${JSON.stringify(RUNTIME_ROLE_QUERY)}
async function main(){
  try{
    await pool.query('BEGIN TRANSACTION READ ONLY')
    const result=await pool.query(query)
    await pool.query('COMMIT')
    process.stdout.write(JSON.stringify(result.rows[0]??null))
  }catch{
    try{await pool.query('ROLLBACK')}catch{}
    process.exitCode=1
  }finally{
    await pool.end().catch(()=>{})
  }
}
main()
`.trim()
