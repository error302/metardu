import assert from 'node:assert/strict'
import path from 'node:path'
import {computeDrift} from './verify-migrations.mjs'
import {WORKFLOW_UPGRADE_VERSIONS,assertWorkflowUpgradeProof} from './workflow-upgrade-contract.mjs'

export const SURVEY_RELEASE_PENDING = ['108_pipeline_asbuilt_history','109_surveyor_profile_privileges','110_alignment_input_persistence','111_personal_project_reader_rls','112_project_reader_snapshot_lock','113_observation_batch_compatibility','114_field_observation_roles',...WORKFLOW_UPGRADE_VERSIONS]
export function pinnedReleaseArguments(argv,root) {
  assert.ok(argv.length===2||(argv.length===3&&argv[2]==='--unified'),'Supply an action and the full reviewed commit SHA; only --unified is an optional namespace.')
  const [action,revision]=argv
  assert.ok(['plan','rehearse','build','promote','status'].includes(action),'Unknown release action.')
  assert.match(revision,/^[a-f0-9]{40}$/,'Use a full immutable commit SHA, not HEAD or a branch.')
  const directory=path.resolve(root,'.cache/release-verify',argv[2]==='--unified'?'unified-release':'survey-release')
  return {action,revision,directory:argv[2]==='--unified'?path.join(directory,revision):directory}
}

export function compatibleRollbackRegistry(source,ledger) {
  assert.ok(ledger.length>0,'A rollback must not verify against an empty ledger.')
  const drift=computeDrift(source,ledger)
  assert.equal(drift.mutated.length,0,'Applied hashes differ from the pinned source.')
  assert.equal(drift.ghost.length,0,'Unknown applied migrations cannot be declared compatible.')
  const applied=new Set(ledger.map(row=>row.version))
  assert.equal(applied.size,ledger.length,'Duplicate ledger versions are invalid.')
  const files=source.filter(file=>applied.has(file.version))
  assert.equal(files.length,ledger.length)
  for(const file of files)assert.match(file.path,/^src\/lib\/db\/migrations\/[0-9]+_[a-z0-9_]+\.sql$/)
  return files
}

export function assertSurveyReleaseDrift(source,ledger) {
  const drift=computeDrift(source,ledger)
  compatibleRollbackRegistry(source,ledger)
  assert.ok(drift.missing.every(version=>SURVEY_RELEASE_PENDING.includes(version)),'Unreviewed pending migrations block this release.')
  return drift
}

export function rollbackService(image,revision,registryDirectory) {
  assert.equal(image,'metardu-metardu-app:rollback-current')
  assert.match(revision,/^[a-f0-9]{40}$/)
  assert.ok(path.isAbsolute(registryDirectory),'Rollback registry must be an inspected absolute path.')
  return {image,environment:{METARDU_BUILD_SHA:revision,MIGRATIONS_DIR:'/app/rollback-migration-registry'},
    volumes:[{type:'bind',source:registryDirectory,target:'/app/rollback-migration-registry',read_only:true}]}
}

// A restored production app can depend on a strict forward migration registry.
// Preserve that exact read-only bind during the next promotion. The candidate
// still verifies its own packaged registry; no old MIGRATIONS_DIR is inherited.
export function forwardPromotionService(image,revision,app) {
  assert.equal(image,'metardu-metardu-app:candidate')
  assert.match(revision,/^[a-f0-9]{40}$/)
  assert.equal(app.Name,'/metardu-app')
  assert.equal(app.Config.Labels['com.docker.compose.service'],'metardu-app')
  const target='/app/rollback-migration-registry'
  const registries=app.Mounts.filter(m=>m.Destination===target)
  assert.ok(registries.length<=1,'An ambiguous rollback registry blocks promotion.')
  const environment=Object.fromEntries(app.Config.Env.map(value=>{
    const i=value.indexOf('=');return [value.slice(0,i),value.slice(i+1)]
  }))
  const service={image,environment:{METARDU_BUILD_SHA:revision}}
  if(!registries.length){
    assert.notEqual(environment.MIGRATIONS_DIR,target,'The configured rollback registry must be mounted.')
    return service
  }
  const registry=registries[0]
  assert.ok(environment.MIGRATIONS_DIR===undefined||environment.MIGRATIONS_DIR===target,'Inspect an unexpected registry configuration before promotion.')
  assert.equal(registry.Type,'bind')
  assert.equal(registry.RW,false,'The retained registry must remain read-only.')
  assert.ok(path.isAbsolute(registry.Source),'The retained registry must have an absolute source.')
  service.volumes=[{type:'bind',source:registry.Source,target,read_only:true}]
  return service
}

export function assertBuildSpace(freeBytes,reserveBytes=8*1024**3) {
  assert.ok(Number.isFinite(freeBytes)&&freeBytes>=reserveBytes,'Host free space is below the 8 GiB build reserve.')
}

export function assertSyntheticUpgradeProof(proof,revision,expected) {
  assert.equal(proof.revision,revision)
  assert.equal(proof.status,'passed')
  assert.ok([112,115,117,118,119].includes(proof.sourceBaseline))
  if(expected?.pending?.some(version=>WORKFLOW_UPGRADE_VERSIONS.includes(version)))assert.equal(proof.sourceBaseline,119,'Older rehearsal evidence cannot admit the workflow upgrade.')
  if(proof.sourceBaseline===119)assertWorkflowUpgradeProof(proof,expected)
  if(proof.sourceBaseline===118){
    assert.deepEqual(proof.pending,['114_field_observation_roles'])
    assert.equal(proof.targetLedgerCount,119)
    assert.deepEqual(proof.variants,['canonical','restrictive','unknown_permissive','disabled_rls'])
    for(const key of ['originalValuesPreserved','historicalHashesPreserved','restrictivePoliciesPreserved','unsafePoliciesRejected','disabledRlsRejected','normalRuntimeProvisioning','nativeServiceVerified','rawSchemaContractVerified'])assert.equal(proof[key],true)
    assert.equal(proof.cleanup?.syntheticRoleRemoved,true)
  }
  if(proof.sourceBaseline===117){
    assert.deepEqual(proof.pending,['113_observation_batch_compatibility'])
    assert.deepEqual(proof.variants,['legacy','canonical','hybrid','incompatible'])
    for(const key of ['originalValuesPreserved','historicalHashesPreserved','incompatibleRejected','normalRuntimeProvisioning','nativeServiceVerified'])assert.equal(proof[key],true)
  }
  assert.equal(proof.customerDataCopied,false)
  assert.equal(proof.newContainer,false)
  assert.equal(proof.cleanup?.syntheticDatabaseRemoved,true)
  assert.ok(proof.checks?.length>=5&&proof.checks.every(check=>check.passed===true),'A completed forward upgrade and preservation check is required.')
}

// Resolve rollback source from the exact inspected running image. An unknown
// runtime value cannot replace its immutable, validated OCI revision label.
export function deployedAppRevision(app,image) {
  assert.equal(app.Name,'/metardu-app')
  assert.equal(app.Config.Labels['com.docker.compose.service'],'metardu-app')
  assert.match(app.Image,/^sha256:[a-f0-9]{64}$/)
  assert.equal(image.Id,app.Image,'The revision must belong to the running image.')
  const revision=image.Config.Labels?.['org.opencontainers.image.revision']
  assert.match(revision??'',/^[a-f0-9]{40}$/,'The running image requires a full immutable source revision.')
  const entries=app.Config.Env.filter(value=>value.startsWith('METARDU_BUILD_SHA='))
  assert.ok(entries.length<=1,'Ambiguous runtime release identity.')
  const runtimeRevision=entries[0]?.slice('METARDU_BUILD_SHA='.length)??''
  assert.ok(runtimeRevision===''||runtimeRevision==='unknown'||runtimeRevision===revision,'Runtime and image release identities disagree.')
  return {revision,imageId:image.Id,source:'org.opencontainers.image.revision',runtimeRevision}
}
