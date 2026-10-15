import assert from 'node:assert/strict'
import path from 'node:path'
import {computeDrift} from './verify-migrations.mjs'

export const SURVEY_RELEASE_PENDING = ['108_pipeline_asbuilt_history','109_surveyor_profile_privileges','110_alignment_input_persistence']
export function pinnedReleaseArguments(argv,root) {
  assert.equal(argv.length,2,'Supply an action and the full reviewed commit SHA.')
  const [action,revision]=argv
  assert.ok(['plan','rehearse','build','promote','status'].includes(action),'Unknown release action.')
  assert.match(revision,/^[a-f0-9]{40}$/,'Use a full immutable commit SHA, not HEAD or a branch.')
  return {action,revision,directory:path.resolve(root,'.cache/release-verify/survey-release')}
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

export function assertBuildSpace(freeBytes,reserveBytes=8*1024**3) {
  assert.ok(Number.isFinite(freeBytes)&&freeBytes>=reserveBytes,'Host free space is below the 8 GiB build reserve.')
}
