import assert from 'node:assert/strict'

export const WORKFLOW_UPGRADE_VERSIONS = Object.freeze(['115_fieldbook_delivery_revisions', '116_surface_request_recovery', '117_scheme_import_receipts', '118_block_identity_retention', '119_reviewed_parcel_boundary_drafts', '120_scheme_export_requests', '121_parcel_draft_sharing', '122_retained_parcel_traverses', '123_boundary_request_recovery'])

export function assertWorkflowUpgradeProof(proof, expected) {
  assert.ok(expected?.sourceRegistry, 'Workflow proof must be checked against the planned pinned registry.')
  assert.deepEqual(expected.pending, WORKFLOW_UPGRADE_VERSIONS)
  assert.deepEqual(proof.pending, expected.pending)
  assert.equal(proof.targetLedgerCount, 128)
  assert.deepEqual(proof.variants, ['canonical', 'duplicate_parcel', 'duplicate_block', 'unexpected_block_fk', 'malformed_boundary'])
  for (const key of ['originalValuesPreserved', 'historicalHashesPreserved', 'normalRuntimeProvisioning', 'boundaryBackfillPreserved', 'restrictedRoleVerified', 'legacyFieldbookWritersVerified', 'precisionPreserved', 'retainedBlockDeletionGuard', 'incompatibleDataRejected']) assert.equal(proof[key], true, `Missing native workflow evidence: ${key}`)
  assert.equal(proof.productionMutated, false)
  assert.equal(proof.cleanup?.syntheticRoleRemoved, true)
  assert.equal(proof.sourceRegistry?.length, 128)
  assert.equal(new Set(proof.sourceRegistry.map(file => file.version)).size, 128)
  for (const file of proof.sourceRegistry) assert.match(file.checksum, /^[a-f0-9]{64}$/)
  assert.deepEqual(proof.sourceRegistry, expected.sourceRegistry, 'A changed migration requires a fresh native upgrade proof.')
  assert.ok(proof.checks?.length >= 11)
}
