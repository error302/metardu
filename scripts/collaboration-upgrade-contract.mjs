import assert from 'node:assert/strict'

export const COLLABORATION_UPGRADE_VERSIONS = Object.freeze([
  '125_surface_source_reviews',
  '126_shared_workspace_read_grants',
])

export const COLLABORATION_UPGRADE_CHECKS = Object.freeze([
  'baseline', 'unsafe-shared-schema-rejected', 'forward',
  'original-rows-and-policies', 'idempotent', 'runtime-role',
  'shared-read-boundaries', 'append-only-review-boundaries', 'previous-image-startup',
])

export function assertCollaborationUpgradeProof(proof, expected) {
  assert.deepEqual(expected?.pending, COLLABORATION_UPGRADE_VERSIONS)
  assert.deepEqual(proof.pending, expected.pending)
  assert.equal(proof.sourceBaseline, 129)
  assert.equal(proof.targetLedgerCount, 131)
  assert.deepEqual(proof.sourceRegistry, expected.sourceRegistry)
  assert.equal(proof.sourceRegistry.length, 131)
  assert.equal(new Set(proof.sourceRegistry.map(file => file.version)).size, 131)
  assert.deepEqual(proof.sourceRegistry.slice(-2).map(file => file.version), expected.pending)
  assert.equal(proof.productionMutated, false)
  assert.equal(proof.cleanup?.syntheticRoleRemoved, true)
  for (const name of COLLABORATION_UPGRADE_CHECKS) {
    assert.equal(proof.checks?.filter(check => check.name === name && check.passed === true).length, 1,
      'Missing or duplicated collaboration evidence: ' + name)
  }
}
