// Release-scoped working-tree recovery proof contracts.
//
// Pure module only: no Docker, no PostgreSQL, no network, no payment provider.
// The suite uses in-memory fixtures and temporary directories exclusively.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertMigration127SchemaContract, workingTreeRecoveryProofPath } from '../scripts/working-tree-release.mjs'
import * as recoveryProducer from '../scripts/verify-working-tree-recovery.mjs'
import * as promotionController from '../scripts/promote-production-candidate.mjs'
import {
  WORKING_TREE_RECOVERY_PROOF_CHECKS,
  WORKING_TREE_RECOVERY_PROOF_FORBIDDEN,
  WORKING_TREE_RECOVERY_PROOF_PAYMENT_HISTORY_COLUMNS,
  WORKING_TREE_RECOVERY_PROOF_SCHEMA_VERSION,
  WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES,
  MIGRATION_127_SCHEMA_EVIDENCE_SQL,
  MIGRATION_127_ROW_SET_SQL,
  assertNoSensitiveRecoveryProofContent,
  assertReleaseScopedRecoveryProofAdmission,
  assertWorkingTreeLedgerTransition,
  assertWorkingTreePaymentHistoryPreservation,
  assertWorkingTreeRecoveryProofDocument,
  buildWorkingTreeRecoveryProof,
  canonicalTextSha256,
  classifyCandidateMigrationChecksum,
  createWorkingTreeRecoveryAttemptLog,
  parseWorkingTreeRecoveryArguments,
  recoveryProofSourceHashesForFiles,
  workingTreeRecoveryProofArtifactPath,
  workingTreeRecoveryProofLogPath,
  writeWorkingTreeRecoveryProofAtomic,
} from '../scripts/working-tree-recovery-proof.mjs'

const MIGRATION_127 = '127_mpesa_payment_completion'
const SOURCE_SHA256 = 'a'.repeat(64)
const RELEASE_IDENTITY = 'b'.repeat(40)
const REPOSITORY_ROOT = path.resolve(process.cwd())

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function temporaryDirectory(prefix) {
  const base = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA ?? tmpdir(), 'Temp', 'opencode')
    : tmpdir()
  mkdirSync(base, { recursive: true })
  return mkdtempSync(path.join(base, prefix))
}

function fixtureRegistry(count = 132) {
  return Array.from({ length: count }, (_, index) => {
    const version = index === count - 1 ? MIGRATION_127 : `${String(index).padStart(3, '0')}_fixture_${index}`
    return { version, checksum: sha256(`${version}\n`) }
  })
}

function fixtureRegistryWithEquivalents() {
  const registry = fixtureRegistry()
  const index = registry.findIndex(entry => entry.version === MIGRATION_127)
  const lf = 'SELECT 1;\n'
  const crlf = 'SELECT 1;\r\n'
  registry[index] = {
    version: MIGRATION_127,
    checksum: sha256(lf),
    equivalentChecksums: [sha256(lf), sha256(crlf)],
  }
  return registry
}

function fixtureSourceFiles(registry) {
  return registry.map(entry => ({
    version: entry.version,
    path: `src/lib/db/migrations/${entry.version}.sql`,
    checksum: entry.checksum,
  }))
}

function fixtureLedger(registry) {
  return registry.map(entry => ({ version: entry.version, checksum: entry.checksum }))
}

function fixtureProducerHashes() {
  return Object.fromEntries(
    WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES.map(file => [file, sha256(`${file}\n`)]),
  )
}

const PAYMENT_HISTORY_COLUMNS = [
  { name: 'checkout_request_id', dataType: 'character varying', maximumLength: 255, isNullable: 'YES' },
  { name: 'phone_number', dataType: 'character varying', maximumLength: 20, isNullable: 'YES' },
  { name: 'last_reconcile_attempt_at', dataType: 'timestamp with time zone', maximumLength: null, isNullable: 'YES' },
]

const PAYMENT_HISTORY_INDEXES = [
  'idx_payment_history_mpesa_checkout_request_id',
  'idx_payment_history_mpesa_pending_checkout',
  'idx_payment_history_mpesa_pending_reconcile_attempt',
]

function fixtureProof(overrides = {}) {
  const sourceRegistry = fixtureRegistry()
  const sourceRegistryFiles = fixtureSourceFiles(sourceRegistry)
  const producerSourceHashes = fixtureProducerHashes()
  const input = {
    sourceSha256: SOURCE_SHA256,
    releaseIdentity: RELEASE_IDENTITY,
    sourceRegistry,
    sourceRegistryFiles,
    producerSourceHashes,
    authorization: {
      customerCloneAuthorized: true,
      namedBackupRestoreAuthorized: true,
      authorizationScope: 'customer-clone-and-named-backup-restore',
      authorizationRecordSha256: 'c'.repeat(64),
    },
    beforeLedger: fixtureLedger(sourceRegistry.slice(0, 131)),
    afterLedger: fixtureLedger(sourceRegistry),
    backup: {
      databaseArchiveSha256: 'd'.repeat(64),
      uploadsArchiveSha256: 'e'.repeat(64),
      pairTimestamp: '20261128_120000',
      namedPairMatched: true,
      integrityVerified: true,
      restored: true,
    },
    restore: {
      targetType: 'isolated-temporary-database',
      customerClone: true,
      databaseCreated: true,
      singleTransaction: true,
      exitCode: 0,
      liveDatabaseMutated: false,
      uploadsIntegrityVerified: true,
      uploadsFileCount: 0,
      uploadsTotalBytes: 0,
    },
    clone: {
      kind: 'disposable-customer-clone',
      restoreTarget: 'isolated-rehearsal-service',
      hostIp: '127.0.0.1',
      hostPort: 55433,
      networkIsolated: true,
      productionDatabaseTouched: false,
      productionWriteCount: 0,
      productionReadOnlySnapshot: true,
    },
    preservation: {
      tablesCompared: 12,
      tablesUnchanged: 12,
      paymentHistoryRowsPreserved: true,
      paymentHistoryOriginalColumnsPreserved: true,
      paymentHistoryNewColumns: PAYMENT_HISTORY_COLUMNS,
      transactionIdRewritesReconciled: true,
      ineligibleTransactionIdsUnchanged: true,
      checkoutBackfillReconciled: true,
      phoneBackfillReconciled: true,
      checkoutEligibleRowsBefore: 0,
      checkoutBackfilledRowsAfter: 0,
      checkoutDistinctEligibleIdentitiesBefore: 0,
      checkoutDistinctBackfilledIdentitiesAfter: 0,
      duplicateCheckoutIdentityGroupsBefore: 0,
      duplicateCheckoutIdentityGroups: 0,
      phoneEligibleRowsBefore: 0,
      phoneBackfilledRowsAfter: 0,
      uniqueCheckoutRequestIdConstraint: false,
      partialIndexesPresent: PAYMENT_HISTORY_INDEXES,
      auditTrail: { rowsBefore: 7, rowsAfter: 8, expectedRows: 1 },
      referenceProfileSeedAdditions: { added: 0, expected: 0 },
    },
    runtimeRole: {
      restricted: true,
      owner: false,
      superuser: false,
      bypassRls: false,
      canCreateDatabase: false,
      canCreateInPublic: false,
      canMutateMigrationLedger: false,
    },
    rls: { organizationProjectChecksPassed: true },
    cleanup: {
      cloneDatabaseRemoved: true,
      uploadsCopyRemoved: true,
      backupNetworkRestored: true,
      runOwnedRolesRemoved: true,
    },
    checks: WORKING_TREE_RECOVERY_PROOF_CHECKS.map(name => ({ name, passed: true })),
    ...overrides,
  }
  return {
    input,
    proof: buildWorkingTreeRecoveryProof(input),
    sourceRegistry,
    sourceRegistryFiles,
    producerSourceHashes,
    sourceSha256: SOURCE_SHA256,
    releaseIdentity: RELEASE_IDENTITY,
  }
}

function proofContext(fixture) {
  return {
    sourceSha256: fixture.sourceSha256,
    releaseIdentity: fixture.releaseIdentity,
    sourceRegistry: fixture.sourceRegistry,
    sourceRegistryFiles: fixture.sourceRegistryFiles,
    producerSourceHashes: fixture.producerSourceHashes,
  }
}

// --- L: ledger transition ---------------------------------------------------

test('L1 the 131 to 132 transition is admitted with exact local checksums', () => {
  const registry = fixtureRegistry()
  const transition = assertWorkingTreeLedgerTransition({
    sourceRegistry: registry,
    beforeLedger: fixtureLedger(registry.slice(0, 131)),
    afterLedger: fixtureLedger(registry),
  })
  assert.deepEqual(transition, {
    beforeCount: 131,
    afterCount: 132,
    applied: [MIGRATION_127],
    historicalChecksumsPreserved: true,
    mutatedCount: 0,
    ghostCount: 0,
    missingAfter: [],
  })
})

test('L2 a pre-migration ledger that is not exactly 131 rows is rejected', () => {
  const registry = fixtureRegistry()
  assert.throws(() => assertWorkingTreeLedgerTransition({
    sourceRegistry: registry,
    beforeLedger: fixtureLedger(registry.slice(0, 130)),
    afterLedger: fixtureLedger(registry),
  }), /exactly 131/i)
})

test('L3 a pending migration other than 127 is rejected', () => {
  const registry = fixtureRegistry()
  const historical = fixtureLedger(registry.slice(0, 131))
  const dropped = historical.find(entry => entry.version === '099_fixture_99')
  const migration = registry.find(entry => entry.version === MIGRATION_127)
  const beforeLedger = [
    ...historical.filter(entry => entry.version !== dropped.version),
    { version: MIGRATION_127, checksum: migration.checksum },
  ]
  assert.throws(() => assertWorkingTreeLedgerTransition({
    sourceRegistry: registry,
    beforeLedger,
    afterLedger: fixtureLedger(registry),
  }), /127_mpesa_payment_completion/)
})

test('L4 a mutated historical checksum in the pre-migration ledger is rejected', () => {
  const registry = fixtureRegistry()
  const beforeLedger = fixtureLedger(registry.slice(0, 131))
  beforeLedger[10] = { ...beforeLedger[10], checksum: sha256('mutated\n') }
  assert.throws(() => assertWorkingTreeLedgerTransition({
    sourceRegistry: registry,
    beforeLedger,
    afterLedger: fixtureLedger(registry),
  }), /mutated/i)
})

test('L5 a ghost migration in the pre-migration ledger is rejected', () => {
  const registry = fixtureRegistry()
  const historical = fixtureLedger(registry.slice(0, 131))
  const dropped = historical.find(entry => entry.version === '099_fixture_99')
  const beforeLedger = [
    ...historical.filter(entry => entry.version !== dropped.version),
    { version: '999_ghost', checksum: sha256('ghost\n') },
  ]
  assert.throws(() => assertWorkingTreeLedgerTransition({
    sourceRegistry: registry,
    beforeLedger,
    afterLedger: fixtureLedger(registry),
  }), /ghost/i)
})

test('L6 a post-transition ledger with 131 rows is rejected', () => {
  const registry = fixtureRegistry()
  assert.throws(() => assertWorkingTreeLedgerTransition({
    sourceRegistry: registry,
    beforeLedger: fixtureLedger(registry.slice(0, 131)),
    afterLedger: fixtureLedger(registry.slice(0, 131)),
  }), /exactly 132/i)
})

test('L7 a post-transition ledger with 133 rows is rejected', () => {
  const registry = fixtureRegistry()
  const afterLedger = [...fixtureLedger(registry), { version: '999_ghost', checksum: sha256('ghost\n') }]
  assert.throws(() => assertWorkingTreeLedgerTransition({
    sourceRegistry: registry,
    beforeLedger: fixtureLedger(registry.slice(0, 131)),
    afterLedger,
  }), /exactly 132/i)
})

test('L8 a rewritten historical checksum after the transition is rejected', () => {
  const registry = fixtureRegistry()
  const afterLedger = fixtureLedger(registry)
  afterLedger[5] = { ...afterLedger[5], checksum: sha256('rewritten\n') }
  assert.throws(() => assertWorkingTreeLedgerTransition({
    sourceRegistry: registry,
    beforeLedger: fixtureLedger(registry.slice(0, 131)),
    afterLedger,
  }), /historical migration checksum changed/i)
})

test('L9 an LF or CRLF equivalent checksum is not the exact local checksum', () => {
  const registry = fixtureRegistryWithEquivalents()
  const beforeLedger = fixtureLedger(registry.slice(0, 131))
  const afterLedger = fixtureLedger(registry)
  afterLedger[131] = { ...afterLedger[131], checksum: sha256('SELECT 1;\r\n') }
  assert.throws(() => assertWorkingTreeLedgerTransition({
    sourceRegistry: registry,
    beforeLedger,
    afterLedger,
  }), /exact local candidate checksum/i)
})

test('L10 a ghost or missing row after the transition is rejected', () => {
  const registry = fixtureRegistry()
  const beforeLedger = fixtureLedger(registry.slice(0, 131))
  const ghosted = fixtureLedger(registry)
  ghosted[3] = { version: '999_ghost', checksum: sha256('ghost\n') }
  assert.throws(() => assertWorkingTreeLedgerTransition({
    sourceRegistry: registry,
    beforeLedger,
    afterLedger: ghosted,
  }), /applied after the transition/i)
  const missing = fixtureLedger(registry).slice(0, 131)
  assert.throws(() => assertWorkingTreeLedgerTransition({
    sourceRegistry: registry,
    beforeLedger,
    afterLedger: missing,
  }), /exactly 132/i)
})

// --- M: migration-127 preservation -----------------------------------------

function paymentHistoryFixture(overrides = {}) {
  return {
    before: {
      totalRows: 10,
      preservedFingerprint: 'a'.repeat(64),
      checkoutEligibleRows: 3,
      checkoutDistinctEligibleIdentities: 3,
      phoneEligibleRows: 2,
      transactionIdRewrites: 4,
      ...(overrides.before ?? {}),
    },
    after: {
      totalRows: 10,
      preservedFingerprint: 'a'.repeat(64),
      checkoutBackfilledRows: 3,
      checkoutDistinctBackfilledIdentities: 3,
      phoneBackfilledRows: 2,
      transactionIdRewrites: 4,
      duplicateCheckoutIdentityGroups: 0,
      ...(overrides.after ?? {}),
    },
  }
}

test('M1 reconciled payment-history evidence is admitted', () => {
  const { before, after } = paymentHistoryFixture()
  assert.deepEqual(assertWorkingTreePaymentHistoryPreservation({ before, after }), {
    rowsPreserved: true,
    originalColumnsPreserved: true,
    transactionIdRewritesReconciled: true,
    checkoutBackfillReconciled: true,
    phoneBackfillReconciled: true,
    duplicateCheckoutIdentityGroups: 0,
  })
})

test('M2 a checkout backfill count that does not reconcile is rejected', () => {
  const { before, after } = paymentHistoryFixture({ after: { checkoutBackfilledRows: 2 } })
  assert.throws(() => assertWorkingTreePaymentHistoryPreservation({ before, after }), /checkout backfill/i)
})

test('M3 a phone backfill count that does not reconcile is rejected', () => {
  const { before, after } = paymentHistoryFixture({ after: { phoneBackfilledRows: 1 } })
  assert.throws(() => assertWorkingTreePaymentHistoryPreservation({ before, after }), /phone backfill/i)
})

test('M4 duplicate checkout identities are rejected', () => {
  const { before, after } = paymentHistoryFixture({ after: { duplicateCheckoutIdentityGroups: 1 } })
  assert.throws(() => assertWorkingTreePaymentHistoryPreservation({ before, after }), /duplicate/i)
})

test('M5 a changed original-column fingerprint is rejected', () => {
  const { before, after } = paymentHistoryFixture({ after: { preservedFingerprint: 'b'.repeat(64) } })
  assert.throws(() => assertWorkingTreePaymentHistoryPreservation({ before, after }), /columns/i)
})

test('M6 a changed payment-history row count is rejected', () => {
  const { before, after } = paymentHistoryFixture({ after: { totalRows: 11 } })
  assert.throws(() => assertWorkingTreePaymentHistoryPreservation({ before, after }), /row count/i)
})

test('M7 an unreconciled transaction-id rewrite count is rejected', () => {
  const { before, after } = paymentHistoryFixture({ after: { transactionIdRewrites: 3 } })
  assert.throws(() => assertWorkingTreePaymentHistoryPreservation({ before, after }), /transaction/i)
})

// --- P: proof document ------------------------------------------------------

test('P1 a valid fixture proof is admitted against the matching binding', () => {
  const fixture = fixtureProof()
  assert.equal(fixture.proof.schemaVersion, WORKING_TREE_RECOVERY_PROOF_SCHEMA_VERSION)
  assert.equal(fixture.proof.kind, 'working-tree-release-scoped-recovery-proof')
  assert.equal(fixture.proof.status, 'passed')
  assert.equal(assertWorkingTreeRecoveryProofDocument(fixture.proof, proofContext(fixture)), fixture.proof)
})

test('P2 a proof for another source hash is rejected', () => {
  const fixture = fixtureProof()
  assert.throws(() => assertWorkingTreeRecoveryProofDocument(
    { ...fixture.proof, sourceSha256: 'f'.repeat(64) },
    proofContext(fixture),
  ), /source/i)
})

test('P3 a proof for another release identity is rejected', () => {
  const fixture = fixtureProof()
  assert.throws(() => assertWorkingTreeRecoveryProofDocument(
    { ...fixture.proof, releaseIdentity: 'f'.repeat(40) },
    proofContext(fixture),
  ), /release identity/i)
})

test('P4 a proof that carries only 131 registry entries is rejected', () => {
  const fixture = fixtureProof()
  assert.throws(() => assertWorkingTreeRecoveryProofDocument(fixture.proof, {
    ...proofContext(fixture),
    sourceRegistry: fixture.sourceRegistry.slice(0, 131),
  }), /132|registry/i)
})

test('P5 a proof whose migration file checksum differs is rejected', () => {
  const fixture = fixtureProof()
  const sourceRegistryFiles = fixture.sourceRegistryFiles.map((file, index) => (
    index === 7 ? { ...file, checksum: sha256('different\n') } : file
  ))
  assert.throws(() => assertWorkingTreeRecoveryProofDocument(fixture.proof, {
    ...proofContext(fixture),
    sourceRegistryFiles,
  }), /source file|registry/i)
})

test('P6 a proof whose migration file path differs is rejected', () => {
  const fixture = fixtureProof()
  const sourceRegistryFiles = fixture.sourceRegistryFiles.map((file, index) => (
    index === 7 ? { ...file, path: 'src/lib/db/migrations/other.sql' } : file
  ))
  assert.throws(() => assertWorkingTreeRecoveryProofDocument(fixture.proof, {
    ...proofContext(fixture),
    sourceRegistryFiles,
  }), /source file|registry/i)
})

test('P7 a proof produced by a different producer source is rejected', () => {
  const fixture = fixtureProof()
  const producerSourceHashes = { ...fixture.producerSourceHashes }
  producerSourceHashes['scripts/working-tree-recovery-proof.mjs'] = sha256('changed\n')
  assert.throws(() => assertWorkingTreeRecoveryProofDocument(fixture.proof, {
    ...proofContext(fixture),
    producerSourceHashes,
  }), /producer/i)
})

test('P8 a proof with the wrong baseline, target or pending migration is rejected', () => {
  const fixture = fixtureProof()
  for (const change of [
    { sourceBaseline: 130 },
    { targetLedgerCount: 133 },
    { pending: ['126_other_migration'] },
  ]) {
    assert.throws(() => assertWorkingTreeRecoveryProofDocument({ ...fixture.proof, ...change }, proofContext(fixture)), /baseline|target|pending|ledger|migration 127/i)
  }
})

test('P9 a proof without verified backup restore evidence is rejected', () => {
  const fixture = fixtureProof()
  for (const change of [
    { backup: { ...fixture.proof.backup, restored: false } },
    { backup: { ...fixture.proof.backup, integrityVerified: false } },
    { backup: { ...fixture.proof.backup, databaseArchiveSha256: 'not-a-digest' } },
  ]) {
    assert.throws(() => assertWorkingTreeRecoveryProofDocument({ ...fixture.proof, ...change }, proofContext(fixture)), /backup|archive|restore/i)
  }
})

test('P10 a proof without complete cleanup evidence is rejected', () => {
  const fixture = fixtureProof()
  assert.throws(() => assertWorkingTreeRecoveryProofDocument({ ...fixture.proof, cleanup: {} }, proofContext(fixture)), /cleanup/i)
  assert.throws(() => assertWorkingTreeRecoveryProofDocument(
    { ...fixture.proof, cleanup: { cloneDatabaseRemoved: true, uploadsCopyRemoved: false } },
    proofContext(fixture),
  ), /cleanup/i)
})

test('P11 a proof without every mandatory passing check is rejected', () => {
  const fixture = fixtureProof()
  assert.throws(() => assertWorkingTreeRecoveryProofDocument({ ...fixture.proof, checks: [] }, proofContext(fixture)), /check/i)
  assert.throws(() => assertWorkingTreeRecoveryProofDocument(
    { ...fixture.proof, checks: fixture.proof.checks.map(check => ({ ...check, passed: false })) },
    proofContext(fixture),
  ), /check/i)
  assert.throws(() => assertWorkingTreeRecoveryProofDocument(
    { ...fixture.proof, checks: fixture.proof.checks.slice(1) },
    proofContext(fixture),
  ), /check/i)
})

test('P12 a proof that touched the customer database is rejected', () => {
  const fixture = fixtureProof()
  for (const change of [
    { clone: { ...fixture.proof.clone, productionDatabaseTouched: true } },
    { clone: { ...fixture.proof.clone, productionWriteCount: 1 } },
    { clone: { ...fixture.proof.clone, kind: 'customer-database' } },
  ]) {
    assert.throws(() => assertWorkingTreeRecoveryProofDocument({ ...fixture.proof, ...change }, proofContext(fixture)), /clone|production|disposable/i)
  }
})

test('P13 sensitive recovery-proof content is rejected', () => {
  const fixture = fixtureProof()
  for (const content of [
    'postgresql://user:secret@127.0.0.1:5432/metardu',
    'PGPASSWORD=secret',
    'password=secret',
    'Bearer abcdef',
    'sk_live_abcdef',
    'AKIAIOSFODNN7EXAMPLE',
    'metardu-postgres',
    '127.0.0.1:5432',
    'db_20261128_120000.sql.gz',
    'uploads_20261128_120000.tar.gz',
    'METARDU_BUILD_SHA',
    'AUTH_SECRET',
    '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    '2026-11-28T12:00:00',
    `metardu_recovery_app_${'f'.repeat(32)}`,
  ]) {
    assert.throws(
      () => assertNoSensitiveRecoveryProofContent({ ...fixture.proof, leaked: content }),
      /forbidden/i,
      `Forbidden content was not rejected: ${content}`,
    )
  }
  assert.equal(assertNoSensitiveRecoveryProofContent(fixture.proof), true)
  assert.equal(WORKING_TREE_RECOVERY_PROOF_FORBIDDEN.length, 15)
})

test('P14 two builds from identical inputs are byte-identical', () => {
  const fixture = fixtureProof()
  const first = buildWorkingTreeRecoveryProof(fixture.input)
  const second = buildWorkingTreeRecoveryProof(fixture.input)
  assert.equal(JSON.stringify(first), JSON.stringify(second))
  assert.equal(`${JSON.stringify(first, null, 2)}\n`, `${JSON.stringify(second, null, 2)}\n`)
})

test('P15 unreconciled payment-history preservation evidence is rejected', () => {
  const fixture = fixtureProof()
  for (const change of [
    { preservation: { ...fixture.proof.preservation, transactionIdRewritesReconciled: false } },
    { preservation: { ...fixture.proof.preservation, duplicateCheckoutIdentityGroups: 1 } },
    { preservation: { ...fixture.proof.preservation, paymentHistoryRowsPreserved: false } },
  ]) {
    assert.throws(() => assertWorkingTreeRecoveryProofDocument({ ...fixture.proof, ...change }, proofContext(fixture)), /payment|preservation|duplicate|transaction|rewrite/i)
  }
})

test('P16 an elevated runtime role is rejected', () => {
  const fixture = fixtureProof()
  for (const change of [
    { runtimeRole: { ...fixture.proof.runtimeRole, restricted: false } },
    { runtimeRole: { ...fixture.proof.runtimeRole, superuser: true } },
    { runtimeRole: { ...fixture.proof.runtimeRole, owner: true } },
    { runtimeRole: { ...fixture.proof.runtimeRole, bypassRls: true } },
    { runtimeRole: { ...fixture.proof.runtimeRole, canCreateDatabase: true } },
    { runtimeRole: { ...fixture.proof.runtimeRole, canCreateInPublic: true } },
    { runtimeRole: { ...fixture.proof.runtimeRole, canMutateMigrationLedger: true } },
  ]) {
    assert.throws(() => assertWorkingTreeRecoveryProofDocument({ ...fixture.proof, ...change }, proofContext(fixture)), /runtime|role/i)
  }
})

test('P17 an unreconciled reference-profile seed addition is rejected', () => {
  const fixture = fixtureProof()
  for (const change of [
    { preservation: { ...fixture.proof.preservation, referenceProfileSeedAdditions: { added: 1, expected: 0 } } },
    { preservation: { ...fixture.proof.preservation, referenceProfileSeedAdditions: { added: 0, expected: 2 } } },
    { preservation: { ...fixture.proof.preservation, referenceProfileSeedAdditions: undefined } },
  ]) {
    assert.throws(() => assertWorkingTreeRecoveryProofDocument({ ...fixture.proof, ...change }, proofContext(fixture)), /seed|reference-profile|reconcile/i)
  }
})

// --- W: artifact writer and CLI ---------------------------------------------

test('W1 the CLI parser requires exactly one source digest and defaults to prepare-only', () => {
  assert.deepEqual(parseWorkingTreeRecoveryArguments(['--source-sha256', SOURCE_SHA256]), {
    sourceSha256: SOURCE_SHA256,
    execute: false,
  })
})

test('W2 the CLI parser accepts the explicit execute flag', () => {
  assert.deepEqual(parseWorkingTreeRecoveryArguments(['--source-sha256', SOURCE_SHA256, '--execute']), {
    sourceSha256: SOURCE_SHA256,
    execute: true,
  })
})

test('W3 the CLI parser rejects a missing, invalid, duplicated or unknown argument', () => {
  for (const argv of [
    [],
    ['--source-sha256'],
    ['--source-sha256', 'not-a-digest'],
    ['--source-sha256', SOURCE_SHA256.toUpperCase()],
    ['--source-sha256', SOURCE_SHA256, '--unknown'],
    ['--source-sha256', SOURCE_SHA256, '--source-sha256', SOURCE_SHA256],
    ['--source-sha256', SOURCE_SHA256, '--execute', '--execute'],
  ]) {
    assert.throws(() => parseWorkingTreeRecoveryArguments(argv), undefined, `Expected a rejection for: ${JSON.stringify(argv)}`)
  }
})

test('W4 writing the same proof twice is a no-op that never rewrites the artifact', () => {
  const directory = temporaryDirectory('metardu-recovery-proof-')
  try {
    const fixture = fixtureProof()
    const artifactPath = path.join(directory, 'recovery-proof', 'verification.json')
    const first = writeWorkingTreeRecoveryProofAtomic(artifactPath, fixture.proof)
    assert.equal(first.written, true)
    const bytes = readFileSync(artifactPath)
    const second = writeWorkingTreeRecoveryProofAtomic(artifactPath, fixture.proof)
    assert.equal(second.written, false)
    assert.equal(second.unchanged, true)
    assert.equal(second.path, artifactPath)
    assert.deepEqual(readFileSync(artifactPath), bytes)
    assert.deepEqual(
      readFileSync(artifactPath),
      Buffer.from(`${JSON.stringify(fixture.proof, null, 2)}\n`, 'utf8'),
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('W5 a different proof is never written over an existing artifact', () => {
  const directory = temporaryDirectory('metardu-recovery-proof-')
  try {
    const fixture = fixtureProof()
    const artifactPath = path.join(directory, 'recovery-proof', 'verification.json')
    writeWorkingTreeRecoveryProofAtomic(artifactPath, fixture.proof)
    const bytes = readFileSync(artifactPath)
    const changed = fixtureProof({ sourceSha256: 'f'.repeat(64) })
    assert.throws(() => writeWorkingTreeRecoveryProofAtomic(artifactPath, changed.proof), /never silently replaced/i)
    assert.deepEqual(readFileSync(artifactPath), bytes)
    assert.equal(
      readdirSyncNames(path.dirname(artifactPath)).filter(name => name.endsWith('.tmp')).length,
      0,
      'A transient artifact must never survive the writer.',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('W6 attempt logs increment and the earlier transcript is never truncated', () => {
  const directory = temporaryDirectory('metardu-recovery-proof-')
  try {
    const evidenceDirectory = path.join(directory, 'recovery-proof')
    const first = createWorkingTreeRecoveryAttemptLog(evidenceDirectory)
    assert.equal(first.attempt, 1)
    assert.equal(first.path, workingTreeRecoveryProofLogPath(evidenceDirectory, 1))
    writeFileSync(first.path, 'attempt one transcript\n')
    const firstBytes = readFileSync(first.path)
    const second = createWorkingTreeRecoveryAttemptLog(evidenceDirectory)
    assert.equal(second.attempt, 2)
    assert.notEqual(second.path, first.path)
    assert.deepEqual(readFileSync(first.path), firstBytes)
    const third = createWorkingTreeRecoveryAttemptLog(evidenceDirectory)
    assert.equal(third.attempt, 3)
    assert.deepEqual(readFileSync(first.path), firstBytes)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

function readdirSyncNames(directory) {
  return existsSync(directory) ? readdirSync(directory) : []
}

// --- X: operational producer source guards ----------------------------------

const PRODUCER_PATH = path.join(REPOSITORY_ROOT, 'scripts', 'verify-working-tree-recovery.mjs')

async function loadProducer() {
  return import(pathToFileURL(PRODUCER_PATH).href)
}

test('X1 the producer exists and exports a main entry point behind a direct-execution guard', async () => {
  assert.equal(existsSync(PRODUCER_PATH), true, 'The working-tree recovery producer source is missing.')
  const producer = await loadProducer()
  assert.equal(typeof producer.main, 'function')
  const source = readFileSync(PRODUCER_PATH, 'utf8')
  assert.match(source, /import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/)
})

test('X2 the producer never reads the stale committed recovery proof', () => {
  const source = readFileSync(PRODUCER_PATH, 'utf8')
  assert.doesNotMatch(source, /test-results\/recovery-proof/)
  assert.doesNotMatch(source, /test-results/)
})

test('X3 the producer never reads an ambient database URL and carries no default', () => {
  const source = readFileSync(PRODUCER_PATH, 'utf8')
  assert.doesNotMatch(source, /process\.env\.DATABASE_URL/)
  assert.doesNotMatch(source, /DATABASE_URL=/)
})

test('X4 every mutating producer action is refused without the explicit execute flag', async () => {
  const producer = await loadProducer()
  assert.ok(Array.isArray(producer.RECOVERY_PRODUCER_MUTATING_ACTIONS))
  assert.ok(producer.RECOVERY_PRODUCER_MUTATING_ACTIONS.length > 0)
  for (const action of producer.RECOVERY_PRODUCER_MUTATING_ACTIONS) {
    assert.throws(
      () => producer.assertRecoveryProducerActionAuthorized({ execute: false, action }),
      /--execute/,
      `The mutating action was not refused without --execute: ${action}`,
    )
    assert.equal(producer.assertRecoveryProducerActionAuthorized({ execute: true, action }), true)
  }
  assert.throws(() => producer.assertRecoveryProducerActionAuthorized({ execute: true, action: 'unreviewed-action' }))
  const source = readFileSync(PRODUCER_PATH, 'utf8')
  assert.match(source, /if \(!execute\)/)
  assert.ok(
    source.indexOf('if (!execute)') < source.indexOf('await executeRecoveryProof('),
    'The prepare path must return before the mutating recovery path runs.',
  )
})

test('the producer scrubs every ambient credential and connection variable from a child environment', async () => {
  const producer = await loadProducer()
  assert.equal(typeof producer.sanitizedRecoveryEnvironment, 'function')
  const sanitized = producer.sanitizedRecoveryEnvironment({
    DATABASE_URL: 'postgresql://secret',
    PGHOST: 'secret',
    PGPASSWORD: 'secret',
    DB_HOST: 'secret',
    DB_PASSWORD: 'secret',
    MIGRATION_DB_PASSWORD: 'secret',
    APP_DB_PASSWORD: 'secret',
    SERVICE_PASSWORD: 'secret',
    CLIENT_SECRET: 'secret',
    SIGNING_KEY: 'secret',
    PATH: 'kept',
    NODE_ENV: 'production',
  })
  assert.deepEqual(Object.keys(sanitized).sort(), ['NODE_ENV', 'PATH'])
})

// --- A: baseline and path guards -------------------------------------------

const VERIFY_FRESH_RECOVERY_SHA256 = '6d677125108882aab8a984e8b322210892feb04677146d3dc92fdc6b346ae980'
const REHEARSAL_DATABASE_SHA256 = '995b1b7fef587102416da33cb5ed903b68ff4f6a0d9aca66d3f34a2494902a5d'

test('A5 the committed recovery producer is byte-identical to the captured baseline', () => {
  const file = path.join(REPOSITORY_ROOT, 'scripts', 'verify-fresh-recovery.mjs')
  assert.equal(sha256(readFileSync(file)), VERIFY_FRESH_RECOVERY_SHA256)
})

test('A6 the rehearsal database contract is byte-identical to the captured baseline', () => {
  const file = path.join(REPOSITORY_ROOT, 'scripts', 'rehearsal-database.mjs')
  assert.equal(sha256(readFileSync(file)), REHEARSAL_DATABASE_SHA256)
})

test('A8 the release-scoped artifact path is the legacy gate path', () => {
  assert.equal(
    workingTreeRecoveryProofArtifactPath(REPOSITORY_ROOT, SOURCE_SHA256),
    workingTreeRecoveryProofPath(REPOSITORY_ROOT, SOURCE_SHA256),
  )
  assert.equal(
    workingTreeRecoveryProofArtifactPath(REPOSITORY_ROOT, SOURCE_SHA256),
    path.join(
      REPOSITORY_ROOT,
      '.cache',
      'release-verify',
      'working-tree-candidate',
      SOURCE_SHA256,
      'recovery-proof',
      'verification.json',
    ),
  )
})

// --- A: promoter admission wiring (Round B) --------------------------------

const PROMOTER_PATH = path.join(REPOSITORY_ROOT, 'scripts', 'promote-production-candidate.mjs')
const WORKING_TREE_RELEASE_SHA256 = '8271db0852bb20de5aebf9ecf66bdf03dd8a537cb4f22b245552871c2f2f8946'

// The fields the legacy gate already required. They may never disappear from
// the fail-closed operator message.
const LEGACY_RECOVERY_PROOF_FIELDS = Object.freeze([
  'status',
  'sourceSha256',
  'releaseIdentity',
  'sourceRegistry',
  'sourceRegistrySha256',
  'sourceBaseline',
  'targetLedgerCount',
  'pending',
  'backup.databaseArchiveSha256',
  'backup.uploadsArchiveSha256',
  'backup.integrityVerified',
  'backup.restored',
  'cleanup',
  'checks',
])

// The fields the strict, source-bound gate additionally requires. The
// fail-closed message has to name all of them.
const STRICT_RECOVERY_PROOF_FIELDS = Object.freeze([
  'schemaVersion',
  'kind',
  'sourceRegistryFiles',
  'sourceRegistryFilesSha256',
  'sourceRegistryFileCount',
  'historicalRegistry',
  'historicalRegistrySha256',
  'producerSourceSha256',
  'authorization.customerCloneAuthorized',
  'authorization.namedBackupRestoreAuthorized',
  'authorization.authorizationScope',
  'authorization.authorizationRecordSha256',
  'ledgerBefore',
  'ledgerAfter',
  'transition.applied',
  'transition.historicalChecksumsPreserved',
  'transition.mutatedCount',
  'transition.ghostCount',
  'transition.missingAfter',
  'backup.pairTimestamp',
  'backup.pairId',
  'backup.namedPairMatched',
  'restore.targetType',
  'restore.customerClone',
  'restore.databaseCreated',
  'restore.singleTransaction',
  'restore.exitCode',
  'restore.liveDatabaseMutated',
  'restore.uploadsIntegrityVerified',
  'restore.uploadsFileCount',
  'restore.uploadsTotalBytes',
  'clone.kind',
  'clone.restoreTarget',
  'clone.hostIp',
  'clone.hostPort',
  'clone.networkIsolated',
  'clone.productionDatabaseTouched',
  'clone.productionWriteCount',
  'clone.productionReadOnlySnapshot',
  'preservation.tablesCompared',
  'preservation.tablesUnchanged',
  'preservation.paymentHistoryRowsPreserved',
  'preservation.paymentHistoryOriginalColumnsPreserved',
  'preservation.paymentHistoryNewColumns',
  'preservation.transactionIdRewritesReconciled',
  'preservation.ineligibleTransactionIdsUnchanged',
  'preservation.checkoutBackfillReconciled',
  'preservation.phoneBackfillReconciled',
  'preservation.checkoutEligibleRowsBefore',
  'preservation.checkoutBackfilledRowsAfter',
  'preservation.checkoutDistinctEligibleIdentitiesBefore',
  'preservation.checkoutDistinctBackfilledIdentitiesAfter',
  'preservation.duplicateCheckoutIdentityGroupsBefore',
  'preservation.duplicateCheckoutIdentityGroups',
  'preservation.phoneEligibleRowsBefore',
  'preservation.phoneBackfilledRowsAfter',
  'preservation.uniqueCheckoutRequestIdConstraint',
  'preservation.partialIndexesPresent',
  'preservation.referenceProfileSeedAdditions',
  'runtimeRole.restricted',
  'runtimeRole.owner',
  'runtimeRole.superuser',
  'runtimeRole.bypassRls',
  'runtimeRole.canCreateDatabase',
  'runtimeRole.canCreateInPublic',
  'runtimeRole.canMutateMigrationLedger',
  'rls.organizationProjectChecksPassed',
])

function promoterSource() {
  return readFileSync(PROMOTER_PATH, 'utf8')
}

function producerSource() {
  return readFileSync(PRODUCER_PATH, 'utf8')
}

function skipQuotedLiteral(source, startIndex) {
  const quote = source[startIndex]
  let index = startIndex + 1
  while (index < source.length) {
    const character = source[index]
    if (character === '\\') {
      index += 2
      continue
    }
    if (character === quote) return index + 1
    index += 1
  }
  throw new Error(`Unterminated string literal at offset ${startIndex}.`)
}

function startsRegularExpression(source, index) {
  let previous = index - 1
  while (previous >= 0 && /\s/.test(source[previous])) previous -= 1
  if (previous < 0) return true
  return !/[A-Za-z0-9_$)\]]/.test(source[previous])
}

function skipRegularExpression(source, startIndex) {
  let index = startIndex + 1
  let inCharacterClass = false
  while (index < source.length) {
    const character = source[index]
    if (character === '\\') {
      index += 2
      continue
    }
    if (character === '[') inCharacterClass = true
    else if (character === ']') inCharacterClass = false
    else if (character === '/' && !inCharacterClass) return index + 1
    else if (character === '\n') break
    index += 1
  }
  throw new Error(`Unterminated regular expression at offset ${startIndex}.`)
}

/**
 * Extract one balanced JavaScript literal starting at an opening delimiter.
 * Strings, template literals, comments and regular expressions are skipped so
 * the delimiter counting never trips over source text.
 */
function extractBalancedLiteral(source, startIndex) {
  const open = source[startIndex]
  const close = { '(': ')', '[': ']', '{': '}' }[open]
  assert.ok(close, `Unsupported literal opener: ${open}`)
  let depth = 0
  let index = startIndex
  while (index < source.length) {
    const character = source[index]
    if (character === '"' || character === "'" || character === '`') {
      index = skipQuotedLiteral(source, index)
      continue
    }
    if (character === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index)
      index = newline === -1 ? source.length : newline
      continue
    }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index)
      index = end === -1 ? source.length : end + 2
      continue
    }
    if (character === '/' && startsRegularExpression(source, index)) {
      index = skipRegularExpression(source, index)
      continue
    }
    if (character === open) depth += 1
    else if (character === close) {
      depth -= 1
      if (depth === 0) return source.slice(startIndex, index + 1)
    }
    index += 1
  }
  throw new Error(`Unbalanced literal opened at offset ${startIndex}.`)
}

function splitTopLevel(text, separator = ',') {
  const parts = []
  let depth = 0
  let current = ''
  let index = 0
  while (index < text.length) {
    const character = text[index]
    if (character === '"' || character === "'" || character === '`') {
      const end = skipQuotedLiteral(text, index)
      current += text.slice(index, end)
      index = end
      continue
    }
    if (character === '(' || character === '[' || character === '{') depth += 1
    else if (character === ')' || character === ']' || character === '}') depth -= 1
    if (character === separator && depth === 0) {
      parts.push(current.trim())
      current = ''
      index += 1
      continue
    }
    current += character
    index += 1
  }
  if (current.trim().length > 0) parts.push(current.trim())
  return parts
}

function extractFunctionBody(source, signature) {
  const signatureIndex = source.indexOf(signature)
  assert.notEqual(signatureIndex, -1, `The promoter source does not declare ${signature}.`)
  const braceIndex = source.indexOf('{', signatureIndex + signature.length - 1)
  assert.notEqual(braceIndex, -1, `The promoter source does not declare a body for ${signature}.`)
  return extractBalancedLiteral(source, braceIndex)
}

/**
 * Extract the body of a function whose parameter list carries no braces, so
 * the body brace is found unambiguously after the closing parenthesis.
 */
function extractNamedFunctionBody(source, signature) {
  const signatureIndex = source.indexOf(signature)
  assert.notEqual(signatureIndex, -1, `The source does not declare ${signature}.`)
  const bodyBrace = source.indexOf(') {', signatureIndex)
  assert.notEqual(bodyBrace, -1, `The source does not declare a body for ${signature}.`)
  return extractBalancedLiteral(source, bodyBrace + 2)
}

function extractAdmissionCall(source) {
  const matches = [...source.matchAll(/assertReleaseScopedRecoveryProofAdmission\s*\(/g)]
  assert.equal(
    matches.length,
    1,
    `The promoter must call the release-scoped admission wrapper exactly once (found ${matches.length}).`,
  )
  const openIndex = matches[0].index + matches[0][0].length - 1
  return extractBalancedLiteral(source, openIndex)
}

function parseAdmissionArguments(callText) {
  const openIndex = callText.indexOf('(')
  const inner = callText.slice(openIndex + 1, callText.length - 1)
  const argumentList = splitTopLevel(inner)
  assert.equal(argumentList.length, 2, 'The admission wrapper must receive the proof and one option object.')
  const options = argumentList[1]
  assert.ok(options.startsWith('{') && options.endsWith('}'), 'The admission options must be an object literal.')
  const properties = splitTopLevel(options.slice(1, -1)).map(property => {
    const separatorIndex = property.indexOf(':')
    if (separatorIndex === -1) return { key: property.trim(), value: null }
    return {
      key: property.slice(0, separatorIndex).trim(),
      value: property.slice(separatorIndex + 1).trim(),
    }
  })
  return { proof: argumentList[0], properties }
}

function extractRecoveryProofEvidenceLiteral(source) {
  const marker = 'recoveryProof: {'
  const index = source.indexOf(marker)
  assert.notEqual(index, -1, 'The preflight evidence does not carry a recoveryProof object.')
  assert.equal(source.indexOf(marker, index + 1), -1, 'The preflight evidence carries more than one recoveryProof object.')
  const publicEvidenceIndex = source.indexOf('function publicPreflightEvidence(')
  const collectPreflightIndex = source.indexOf('async function collectPreflight(')
  assert.ok(
    publicEvidenceIndex !== -1 && publicEvidenceIndex < index && index < collectPreflightIndex,
    'The recoveryProof evidence must be produced by publicPreflightEvidence().',
  )
  return extractBalancedLiteral(source, index + marker.length - 1)
}

test('A1 the promoter admits the proof through the release-scoped wrapper only', () => {
  const source = promoterSource()
  for (const imported of [
    'assertReleaseScopedRecoveryProofAdmission',
    'recoveryProofSourceHashesForFiles',
    'WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES',
  ]) {
    assert.ok(
      new RegExp(`import\\s*\\{[^}]*\\b${imported}\\b[^}]*\\}\\s*from\\s*'\\./working-tree-recovery-proof\\.mjs'`).test(source),
      `The promoter must import ${imported} from the release-scoped recovery proof module.`,
    )
  }
  const call = parseAdmissionArguments(extractAdmissionCall(source))
  assert.equal(call.proof, 'proof', 'The admission wrapper must receive the admitted proof document.')
  assert.deepEqual(
    call.properties.map(property => property.key),
    [
      'sourceSha256',
      'releaseIdentity',
      'sourceRegistry',
      'sourceRegistryFiles',
      'producerSourceHashes',
    ],
    'The admission wrapper must receive the exact source-bound argument set, in order.',
  )
  for (const property of call.properties) {
    assert.ok(
      property.value === null || property.value === property.key,
      `The admission option ${property.key} must be bound to the preflight value, not to an alias.`,
    )
  }
  assert.doesNotMatch(
    source,
    /assertWorkingTreeRecoveryProof\s*\(/,
    'The promoter must not call the legacy admission gate directly.',
  )
})

test('A2 the promoter never references the stale committed recovery proof', () => {
  const source = promoterSource()
  assert.doesNotMatch(source, /test-results\/recovery-proof/)
  assert.doesNotMatch(source, /test-results/)
})

test('A3 the fail-closed missing-proof message names the proof path and the producer, and never enumerates the field list', () => {
  const source = promoterSource()
  assert.doesNotMatch(
    source,
    /RECOVERY_PROOF_FIELDS/,
    'The promoter must not carry a field-name recipe for a hand-written proof.',
  )
  const marker = 'if (!existsSync(proofPath)) {'
  const index = source.indexOf(marker)
  assert.notEqual(index, -1, 'The promoter does not guard the missing recovery proof.')
  const block = extractBalancedLiteral(source, index + marker.length - 1)
  assert.match(block, /proofPath/, 'The missing-proof message must name the required proof path.')
  assert.match(
    block,
    /scripts\/verify-working-tree-recovery\.mjs/,
    'The missing-proof message must point at the reviewed producer.',
  )
  for (const field of [...LEGACY_RECOVERY_PROOF_FIELDS, ...STRICT_RECOVERY_PROOF_FIELDS]) {
    assert.ok(
      !block.includes(field),
      `The missing-proof message must not enumerate the required field: ${field}`,
    )
  }
  assert.match(
    source,
    /const proofPath = workingTreeRecoveryProofPath\(root, sourceSha256\)/,
    'The missing-proof message must name the release-scoped proof path.',
  )
})

test('A4 the preflight evidence carries the admitted proof digest and the source registry digest', () => {
  const source = promoterSource()
  const evidence = extractRecoveryProofEvidenceLiteral(source)
  assert.match(
    evidence,
    /(^|[\s,{])proofSha256\s*:\s*preflight\.proofSha256\b/,
    'The preflight evidence must carry the digest of the admitted proof bytes.',
  )
  assert.match(
    evidence,
    /(^|[\s,{])sourceRegistrySha256\s*:\s*preflight\.sourceRegistrySha256\b/,
    'The preflight evidence must carry the source registry digest.',
  )
  const body = extractFunctionBody(source, 'async function collectPreflight(')
  const returned = extractBalancedLiteral(body, body.lastIndexOf('return {') + 'return '.length)
  assert.match(returned, /(^|[\s,{])proofSha256\s*,/, 'The preflight must compute the admitted proof digest.')
  assert.match(returned, /(^|[\s,{])sourceRegistrySha256\s*,/, 'The preflight must compute the source registry digest.')
})

test('A7 the legacy release contract is byte-identical to the captured baseline', () => {
  const file = path.join(REPOSITORY_ROOT, 'scripts', 'working-tree-release.mjs')
  assert.equal(sha256(readFileSync(file)), WORKING_TREE_RELEASE_SHA256)
})

test('A9 the admission wrapper still applies the legacy gate before the strict gate', () => {
  const fixture = fixtureProof()
  const registryWithExtraFields = fixture.sourceRegistry.map(entry => ({
    ...entry,
    path: `src/lib/db/migrations/${entry.version}.sql`,
  }))
  // The strict gate alone accepts the proof: only the legacy gate can reject it.
  assert.doesNotThrow(() => assertWorkingTreeRecoveryProofDocument(fixture.proof, {
    ...proofContext(fixture),
    sourceRegistry: registryWithExtraFields,
  }))
  assert.throws(
    () => assertReleaseScopedRecoveryProofAdmission(fixture.proof, {
      ...proofContext(fixture),
      sourceRegistry: registryWithExtraFields,
    }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(
        error.message,
        /^Recovery proof must use the exact 132-file candidate migration registry\./,
        'The legacy gate must reject a proof whose source registry does not deep-equal the candidate registry.',
      )
      return true
    },
  )
})

// --- shared pure helpers ----------------------------------------------------

test('canonical text hashing normalizes line endings and rejects non-text input', () => {
  assert.equal(canonicalTextSha256('a\r\nb'), canonicalTextSha256('a\nb'))
  assert.equal(canonicalTextSha256('a\nb'), sha256('a\nb'))
  assert.throws(() => canonicalTextSha256(42))
})

test('the producer source closure is hashed exactly and rejects an inexact closure', () => {
  assert.equal(WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES.length, 9)
  const contents = Object.fromEntries(
    WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES.map(file => [file, `${file}\r\ncontent\n`]),
  )
  const hashes = recoveryProofSourceHashesForFiles(WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES, contents)
  assert.equal(Object.keys(hashes).length, 9)
  for (const file of WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES) {
    assert.match(hashes[file], /^[a-f0-9]{64}$/)
  }
  assert.throws(() => recoveryProofSourceHashesForFiles(
    WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES,
    { ...contents, 'scripts/unreviewed.mjs': 'x' },
  ))
  assert.throws(() => recoveryProofSourceHashesForFiles(
    WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES,
    Object.fromEntries(WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES.slice(1).map(file => [file, 'x'])),
  ))
})

test('a stored checksum is classified against the exact local candidate file', () => {
  const lf = sha256('local\n')
  const crlf = sha256('local\r\n')
  const entry = { version: MIGRATION_127, checksum: lf, equivalentChecksums: [lf, crlf] }
  assert.equal(classifyCandidateMigrationChecksum(entry, lf), 'candidate-local')
  assert.equal(classifyCandidateMigrationChecksum(entry, crlf), 'equivalent-crlf')
  assert.equal(classifyCandidateMigrationChecksum(entry, sha256('other\n')), 'unrelated')
  const crlfEntry = { version: MIGRATION_127, checksum: crlf, equivalentChecksums: [lf, crlf] }
  assert.equal(classifyCandidateMigrationChecksum(crlfEntry, lf), 'equivalent-lf')
  assert.equal(classifyCandidateMigrationChecksum(crlfEntry, crlf), 'candidate-local')
})

// --- C: producer check emission and mandatory coverage (C-1) -----------------

/**
 * Remove every comment from a JavaScript source text without touching the
 * string, template and regular-expression literals. A `checked('name')` call
 * inside a comment is therefore never mistaken for an emission.
 */
function stripSourceComments(source) {
  let result = ''
  let index = 0
  while (index < source.length) {
    const character = source[index]
    if (character === '"' || character === "'" || character === '`') {
      const end = skipQuotedLiteral(source, index)
      result += source.slice(index, end)
      index = end
      continue
    }
    if (character === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index)
      index = newline === -1 ? source.length : newline
      continue
    }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index)
      index = end === -1 ? source.length : end + 2
      continue
    }
    if (character === '/' && startsRegularExpression(source, index)) {
      const end = skipRegularExpression(source, index)
      result += source.slice(index, end)
      index = end
      continue
    }
    result += character
    index += 1
  }
  return result
}

/**
 * The names the producer actually emits through its `checked(...)` recorder.
 * Only a literal first argument counts: a renamed, aliased or indirect call
 * never satisfies the mandatory coverage.
 */
function producerEmittedCheckNames(source) {
  const stripped = stripSourceComments(source)
  const names = []
  const pattern = /(?<![\w$.])checked\s*\(/g
  let match
  while ((match = pattern.exec(stripped)) !== null) {
    const openIndex = match.index + match[0].length - 1
    const call = extractBalancedLiteral(stripped, openIndex)
    const args = splitTopLevel(call.slice(1, -1))
    if (args.length === 0) continue
    const literal = /^'([^']*)'$/.exec(args[0].trim())
    if (!literal) continue
    names.push(literal[1])
  }
  return names
}

/**
 * The mandatory coverage contract, expressed over the emitted check names.
 */
function assertMandatoryChecksCovered(emittedNames) {
  for (const name of WORKING_TREE_RECOVERY_PROOF_CHECKS) {
    assert.ok(
      emittedNames.includes(name),
      `The mandatory recovery proof check is missing: ${name}`,
    )
  }
  return true
}

/**
 * The cleanup-complete emission must be a guarded, reachable statement inside
 * the producer's finally block: after the cleanup completeness is computed and
 * before the post-cleanup status is derived.
 */
function assertCleanupCompleteEmission(source) {
  const stripped = stripSourceComments(source)
  const completeIndex = stripped.indexOf('state.cleanup.complete =')
  assert.notEqual(completeIndex, -1, 'The producer never computes state.cleanup.complete.')
  const callIndex = stripped.indexOf("checked('cleanup-complete')")
  assert.notEqual(callIndex, -1, "The producer never emits checked('cleanup-complete').")
  const statusIndex = stripped.indexOf('state.status = recoveryStatusAfterCleanup(state.status, state.cleanup)')
  assert.notEqual(statusIndex, -1, 'The producer never derives the post-cleanup status.')
  assert.ok(completeIndex < callIndex, 'The cleanup-complete emission must follow the cleanup completeness computation.')
  assert.ok(callIndex < statusIndex, 'The cleanup-complete emission must precede the post-cleanup status derivation.')
  const finallyIndex = stripped.lastIndexOf('finally {', callIndex)
  assert.notEqual(finallyIndex, -1, 'The cleanup-complete emission is not inside a finally block.')
  const braceIndex = stripped.indexOf('{', finallyIndex)
  const block = extractBalancedLiteral(stripped, braceIndex)
  assert.ok(
    callIndex > braceIndex && callIndex < braceIndex + block.length,
    'The cleanup-complete emission is not inside the producer finally block.',
  )
  const guard = 'if (state.cleanup.complete === true)'
  const guardIndex = stripped.lastIndexOf(guard, callIndex)
  assert.notEqual(guardIndex, -1, 'The cleanup-complete emission is not guarded by the cleanup completeness.')
  const guardOpen = stripped.indexOf('{', guardIndex + guard.length)
  const guardBlock = extractBalancedLiteral(stripped, guardOpen)
  assert.ok(
    callIndex > guardOpen && callIndex < guardOpen + guardBlock.length,
    'The cleanup-complete emission is not inside its guard block.',
  )
  return true
}

test('C1 every mandatory check name is reachable from the producer check list', () => {
  const producerNames = recoveryProducer.PRODUCER_RECOVERY_CHECK_NAMES
  assert.ok(Array.isArray(producerNames), 'The producer must export PRODUCER_RECOVERY_CHECK_NAMES.')
  assert.equal(Object.isFrozen(producerNames), true, 'The producer check list must be frozen.')
  assert.equal(new Set(producerNames).size, producerNames.length, 'The producer check list must not repeat a name.')
  assert.equal(new Set(WORKING_TREE_RECOVERY_PROOF_CHECKS).size, WORKING_TREE_RECOVERY_PROOF_CHECKS.length, 'The mandatory check list must not repeat a name.')
  for (const name of WORKING_TREE_RECOVERY_PROOF_CHECKS) {
    assert.ok(
      producerNames.includes(name),
      `The producer can never emit the mandatory check: ${name}`,
    )
  }
})

test('C2 the producer recorder fails closed for an unknown or repeated check name', () => {
  assert.equal(typeof recoveryProducer.createRecoveryCheckRecorder, 'function')
  const recorded = []
  const recorder = recoveryProducer.createRecoveryCheckRecorder(message => recorded.push(message))
  assert.equal(recorder.checked('cleanup-complete'), 'cleanup-complete')
  assert.deepEqual(recorder.checks, [{ name: 'cleanup-complete', passed: true }])
  assert.deepEqual(recorded, ['PASS cleanup-complete'])
  assert.throws(() => recorder.checked('cleanup-completed'), /not in the producer check list/i)
  assert.throws(() => recorder.checked('cleanup-complete'), /already recorded/i)
  assert.deepEqual(recorder.checks, [{ name: 'cleanup-complete', passed: true }])
})

test('C3 the producer emits a checked() call for every mandatory check', () => {
  const source = readFileSync(PRODUCER_PATH, 'utf8')
  const emitted = producerEmittedCheckNames(source)
  for (const name of WORKING_TREE_RECOVERY_PROOF_CHECKS) {
    assert.equal(
      emitted.filter(entry => entry === name).length,
      1,
      `The producer must emit ${name} exactly once (observed ${emitted.filter(entry => entry === name).length}).`,
    )
  }
  assert.equal(assertMandatoryChecksCovered(emitted), true)
})

test('C4 the cleanup-complete emission is guarded inside the producer finally block', () => {
  const source = readFileSync(PRODUCER_PATH, 'utf8')
  assert.equal(assertCleanupCompleteEmission(source), true)
})

test('C5 the coverage assertion detects a removed, renamed or dead-code emission', () => {
  const source = readFileSync(PRODUCER_PATH, 'utf8')
  const removed = source.replace(/\s*checked\('cleanup-complete'\)/, '')
  assert.equal(producerEmittedCheckNames(removed).includes('cleanup-complete'), false)
  assert.throws(() => assertMandatoryChecksCovered(producerEmittedCheckNames(removed)), /cleanup-complete/)
  const renamed = source.replace("checked('cleanup-complete')", "checked('cleanup-completed')")
  assert.equal(producerEmittedCheckNames(renamed).includes('cleanup-complete'), false)
  assert.throws(() => assertMandatoryChecksCovered(producerEmittedCheckNames(renamed)), /cleanup-complete/)
  const deadCode = source.replace('if (state.cleanup.complete === true) {', 'if (false) {')
  assert.throws(() => assertCleanupCompleteEmission(deadCode), /guarded by the cleanup completeness/)
  const moved = source.replace("      checked('cleanup-complete')\n", '')
  assert.throws(() => assertCleanupCompleteEmission(moved), /never emits checked/)
})

test('C6 the mandatory coverage assertion rejects a run that never recorded cleanup-complete', () => {
  assert.equal(typeof recoveryProducer.assertProducerRecoveryCheckCoverage, 'function')
  const recorded = WORKING_TREE_RECOVERY_PROOF_CHECKS
    .filter(name => name !== 'cleanup-complete')
    .map(name => ({ name, passed: true }))
  assert.throws(
    () => recoveryProducer.assertProducerRecoveryCheckCoverage(recorded),
    /mandatory recovery proof check is missing: cleanup-complete/i,
  )
  assert.equal(
    recoveryProducer.assertProducerRecoveryCheckCoverage(
      WORKING_TREE_RECOVERY_PROOF_CHECKS.map(name => ({ name, passed: true })),
    ),
    true,
  )
})

// --- S: byte-stable cleanup evidence (M-1) -----------------------------------

const RUN_ROLE_PREFIX = 'metardu_recovery_app_'

function cleanupEvidenceForRun(runHex) {
  return {
    ...recoveryProducer.buildRecoveryCleanupEvidence({
      backupNetworkRestored: true,
      cloneDatabaseRemoved: true,
      uploadsCopyRemoved: true,
      removedRoles: new Map([
        [`${RUN_ROLE_PREFIX}${runHex}`, true],
        ['authenticated', true],
        ['service_role', true],
      ]),
    }),
    complete: true,
  }
}

test('S1 the cleanup evidence map carries only stable, run-independent keys', () => {
  assert.equal(typeof recoveryProducer.buildRecoveryCleanupEvidence, 'function')
  const first = cleanupEvidenceForRun('a'.repeat(32))
  const second = cleanupEvidenceForRun('b'.repeat(32))
  assert.deepEqual(first, second, 'The cleanup evidence must not depend on the run-scoped role name.')
  assert.deepEqual(
    Object.keys(first).sort(),
    ['backupNetworkRestored', 'cloneDatabaseRemoved', 'complete', 'runOwnedRolesRemoved', 'uploadsCopyRemoved'],
  )
  for (const key of Object.keys(first)) {
    assert.doesNotMatch(key, /[0-9a-f]{32}/, `The cleanup key carries a run-scoped identifier: ${key}`)
    assert.ok(!key.includes(RUN_ROLE_PREFIX), `The cleanup key carries the run-role prefix: ${key}`)
  }
  assert.equal(first.runOwnedRolesRemoved, true)
  const failed = recoveryProducer.buildRecoveryCleanupEvidence({
    backupNetworkRestored: true,
    cloneDatabaseRemoved: true,
    uploadsCopyRemoved: true,
    removedRoles: new Map([[`${RUN_ROLE_PREFIX}${'c'.repeat(32)}`, false]]),
  })
  assert.equal(failed.runOwnedRolesRemoved, false)
})

test('S2 two producer runs over the same source and backup pair produce byte-identical proof documents', () => {
  const fixture = fixtureProof()
  const first = buildWorkingTreeRecoveryProof({ ...fixture.input, cleanup: cleanupEvidenceForRun('a'.repeat(32)) })
  const second = buildWorkingTreeRecoveryProof({ ...fixture.input, cleanup: cleanupEvidenceForRun('b'.repeat(32)) })
  assert.equal(
    `${JSON.stringify(first, null, 2)}\n`,
    `${JSON.stringify(second, null, 2)}\n`,
    'Two producer runs over the same source and backup pair must produce byte-identical proofs.',
  )
  const directory = temporaryDirectory('metardu-recovery-stability-')
  try {
    const artifactPath = path.join(directory, 'recovery-proof', 'verification.json')
    const written = writeWorkingTreeRecoveryProofAtomic(artifactPath, first)
    assert.equal(written.written, true)
    const unchanged = writeWorkingTreeRecoveryProofAtomic(artifactPath, second)
    assert.equal(unchanged.written, false, 'A second successful run must not fail on a differing artifact.')
    assert.equal(unchanged.unchanged, true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('S3 the forbidden-content scan rejects a proof that carries a run-scoped recovery role', () => {
  const fixture = fixtureProof()
  const runRole = `${RUN_ROLE_PREFIX}${'f'.repeat(32)}`
  assert.ok(
    WORKING_TREE_RECOVERY_PROOF_FORBIDDEN.some(source => new RegExp(source).test(runRole)),
    'The run-role pattern must be part of the forbidden-content scan.',
  )
  assert.throws(
    () => assertNoSensitiveRecoveryProofContent({
      ...fixture.proof,
      cleanup: { [`${runRole}Removed`]: true },
    }),
    /forbidden/i,
  )
})

test('S4 the producer never writes a run-scoped key into the cleanup evidence', () => {
  const source = stripSourceComments(readFileSync(PRODUCER_PATH, 'utf8'))
  assert.doesNotMatch(
    source,
    /state\.cleanup\[/,
    'The producer must never index the cleanup evidence with a run-scoped key.',
  )
  assert.doesNotMatch(
    source,
    /cleanupOutcome\.removedRoles\.set\([^)]*\)\s*;?\s*state\.cleanup/,
    'The per-role removal results must stay in the local map.',
  )
  assert.ok(
    source.includes('buildRecoveryCleanupEvidence(cleanupOutcome)'),
    'The producer must build the cleanup evidence from the stable, run-independent helper.',
  )
})

// --- F: archive freshness and live quiescence (I-2) --------------------------

test('F1 the archive dump timestamp is derived from the archive filename', () => {
  assert.equal(typeof recoveryProducer.deriveRecoveryArchiveDumpTimestamp, 'function')
  assert.equal(
    recoveryProducer.deriveRecoveryArchiveDumpTimestamp('db_20261127_020001.sql.gz'),
    '2026-11-27T02:00:01Z',
  )
  assert.equal(
    recoveryProducer.deriveRecoveryArchiveDumpTimestamp('/backups/db_20261127_020003.sql.gz'),
    '2026-11-27T02:00:03Z',
  )
  assert.throws(
    () => recoveryProducer.deriveRecoveryArchiveDumpTimestamp('db_not-a-timestamp.sql.gz'),
    /db_YYYYMMDD_HHMMSS/,
  )
  assert.throws(
    () => recoveryProducer.deriveRecoveryArchiveDumpTimestamp('db_20261327_020001.sql.gz'),
    /valid calendar instant/,
  )
})

test('F2 the selected stale archive pair is rejected before the clone is created', () => {
  assert.equal(typeof recoveryProducer.assertRecoveryArchiveFreshness, 'function')
  assert.throws(
    () => recoveryProducer.assertRecoveryArchiveFreshness({
      archiveTimestamp: recoveryProducer.deriveRecoveryArchiveDumpTimestamp('db_20261127_020001.sql.gz'),
      newestLiveMutation: '2026-11-27T07:21:21.785237Z',
    }),
    /predates the newest live write; take a fresh backup and re-point the named archive pair/,
  )
  assert.throws(
    () => recoveryProducer.assertRecoveryArchiveFreshness({
      archiveTimestamp: recoveryProducer.deriveRecoveryArchiveDumpTimestamp('db_20261127_020003.sql.gz'),
      newestLiveMutation: '2026-11-27T07:21:21.785237Z',
    }),
    /predates the newest live write/,
  )
})

test('F3 an archive at or after the newest live mutation is accepted', () => {
  assert.equal(
    recoveryProducer.assertRecoveryArchiveFreshness({
      archiveTimestamp: recoveryProducer.deriveRecoveryArchiveDumpTimestamp('db_20261127_080000.sql.gz'),
      newestLiveMutation: '2026-11-27T07:21:21.785237Z',
    }),
    true,
  )
  assert.equal(
    recoveryProducer.assertRecoveryArchiveFreshness({
      archiveTimestamp: recoveryProducer.deriveRecoveryArchiveDumpTimestamp('db_20261127_072121.sql.gz'),
      newestLiveMutation: '2026-11-27T07:21:21Z',
    }),
    true,
  )
  assert.equal(
    recoveryProducer.assertRecoveryArchiveFreshness({
      archiveTimestamp: recoveryProducer.deriveRecoveryArchiveDumpTimestamp('db_20261127_080000.sql.gz'),
      newestLiveMutation: null,
    }),
    true,
  )
})

test('F4 the live mutation columns exclude ambiguous and future-dated columns', () => {
  assert.equal(typeof recoveryProducer.selectLiveMutationColumns, 'function')
  const selected = recoveryProducer.selectLiveMutationColumns([{
    name: 'sessions',
    columns: [
      { name: 'created_at', dataType: 'timestamp with time zone' },
      { name: 'updated_at', dataType: 'timestamp without time zone' },
      { name: 'createdAt', dataType: 'timestamptz' },
      { name: 'expires_at', dataType: 'timestamp with time zone' },
      { name: 'last_used_at', dataType: 'timestamp with time zone' },
      { name: 'timestamp', dataType: 'timestamp without time zone' },
      { name: 'label', dataType: 'text' },
    ],
  }])
  assert.deepEqual(selected, [
    { table: 'sessions', column: 'created_at', dataType: 'timestamptz' },
    { table: 'sessions', column: 'updated_at', dataType: 'timestamp' },
    { table: 'sessions', column: 'createdAt', dataType: 'timestamptz' },
  ])
})

test('F5 a future-dated value in an excluded column never makes a fresh archive look stale', () => {
  const selected = recoveryProducer.selectLiveMutationColumns([{
    name: 'sessions',
    columns: [
      { name: 'created_at', dataType: 'timestamp with time zone' },
      { name: 'expires_at', dataType: 'timestamp with time zone' },
    ],
  }])
  assert.deepEqual(selected.map(entry => entry.column), ['created_at'])
  const values = selected.map(entry => ({
    label: `${entry.table}.${entry.column}`,
    value: '2026-11-27T07:21:21.785237Z',
  }))
  const newest = recoveryProducer.newestLiveMutationTimestamp(values)
  assert.equal(newest.value, '2026-11-27T07:21:21.785237Z')
  assert.equal(
    recoveryProducer.assertRecoveryArchiveFreshness({
      archiveTimestamp: recoveryProducer.deriveRecoveryArchiveDumpTimestamp('db_20261127_080000.sql.gz'),
      newestLiveMutation: newest.value,
    }),
    true,
  )
})

test('F6 the live customer database must be quiescent across the rehearsal', () => {
  assert.equal(typeof recoveryProducer.assertRecoveryLiveQuiescence, 'function')
  const before = [{ name: 'audit_logs', rows: 1, fingerprint: 'a'.repeat(64) }]
  assert.equal(
    recoveryProducer.assertRecoveryLiveQuiescence({ before, after: [...before] }),
    true,
  )
  assert.throws(
    () => recoveryProducer.assertRecoveryLiveQuiescence({
      before,
      after: [{ name: 'audit_logs', rows: 1, fingerprint: 'b'.repeat(64) }],
    }),
    /changed during the recovery rehearsal/,
  )
})

test('F7 the producer enforces freshness before the clone and quiescence across the run', () => {
  const source = stripSourceComments(readFileSync(PRODUCER_PATH, 'utf8'))
  const freshnessIndex = source.indexOf('assertRecoveryArchiveFreshness({')
  const createIndex = source.indexOf('CREATE DATABASE')
  assert.notEqual(freshnessIndex, -1, 'The producer never enforces the archive freshness precondition.')
  assert.notEqual(createIndex, -1, 'The producer never creates the disposable clone.')
  assert.ok(freshnessIndex < createIndex, 'The freshness precondition must be enforced before the clone is created.')
  const quiescenceIndex = source.indexOf('assertRecoveryLiveQuiescence({')
  assert.notEqual(quiescenceIndex, -1, 'The producer never proves live quiescence.')
  assert.ok(quiescenceIndex > freshnessIndex, 'The quiescence proof must follow the freshness precondition.')
  for (const marker of [
    'PASS freshness ',
    'FAIL freshness ',
    'PASS quiescence ',
    'FAIL quiescence ',
  ]) {
    assert.ok(source.includes(marker), `The attempt log must record the ${marker.trim()} marker.`)
  }
})

// --- Round 3B: promoter admission gaps, remaining minors, hardening ----------

const PROMOTER_MODULE_URL = pathToFileURL(PROMOTER_PATH).href

async function loadPromoter() {
  return import(PROMOTER_MODULE_URL)
}

/**
 * The release-scoped recovery proof contracts are loaded through the module
 * namespace so that a missing export is an observable per-test failure
 * instead of a whole-suite module-load error.
 */
let recoveryContractsPromise = null
function loadRecoveryContracts() {
  if (!recoveryContractsPromise) {
    recoveryContractsPromise = import('../scripts/working-tree-recovery-proof.mjs')
  }
  return recoveryContractsPromise
}

/**
 * Write a producer attempt transcript. The producer records every check as an
 * exact `PASS <name>` line, binds the transcript to the digest of the proof
 * it wrote with an exact `PROOF sha256 <digest>` line and records the final
 * status as an exact `STATUS passed` line.
 *
 * `proofLine` writes a raw line verbatim, so a near-miss marker can be
 * exercised without changing the helper.
 */
function writeAttemptTranscript(directory, attempt, {
  status = 'passed',
  checks = WORKING_TREE_RECOVERY_PROOF_CHECKS,
  proofSha256 = null,
  proofLine = null,
} = {}) {
  const logPath = workingTreeRecoveryProofLogPath(directory, attempt)
  const lines = checks.map(name => `PASS ${name}`)
  if (status !== null) lines.push(`STATUS ${status}`)
  if (proofLine !== null) lines.push(proofLine)
  else if (proofSha256 !== null) lines.push(`PROOF sha256 ${proofSha256}`)
  writeFileSync(logPath, `${lines.join('\n')}\n`)
  return logPath
}

test('Y1 the admitted proof must be bound to the producer attempt transcript', async () => {
  const contracts = await loadRecoveryContracts()
  assert.equal(typeof contracts.assertWorkingTreeRecoveryProofAttemptTranscript, 'function')
  assert.equal(typeof contracts.workingTreeRecoveryProofAttemptLogs, 'function')
  const directory = temporaryDirectory('metardu-recovery-transcript-listing-')
  try {
    assert.deepEqual(contracts.workingTreeRecoveryProofAttemptLogs(directory), [])
    writeAttemptTranscript(directory, 1)
    writeAttemptTranscript(directory, 4)
    assert.deepEqual(
      contracts.workingTreeRecoveryProofAttemptLogs(directory).map(entry => entry.attempt),
      [1, 4],
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Y2 a proof with no transcript, a failed transcript, an incomplete transcript or a stale transcript is rejected', async () => {
  const contracts = await loadRecoveryContracts()
  const assertTranscript = contracts.assertWorkingTreeRecoveryProofAttemptTranscript
  assert.equal(typeof assertTranscript, 'function')
  const directory = temporaryDirectory('metardu-recovery-transcript-')
  const proofSha256 = 'a'.repeat(64)
  try {
    // The proof alone, with no transcript, is no longer admissible.
    assert.throws(
      () => assertTranscript(directory, { proofSha256 }),
      /attempt transcript/i,
    )
    // A transcript without the exact status line is rejected.
    writeAttemptTranscript(directory, 1, { status: 'failed', proofSha256 })
    assert.throws(
      () => assertTranscript(directory, { proofSha256 }),
      /STATUS passed/,
    )
    // A transcript missing any mandatory pass marker is rejected.
    writeAttemptTranscript(directory, 2, {
      checks: WORKING_TREE_RECOVERY_PROOF_CHECKS.filter(name => name !== 'cleanup-complete'),
      proofSha256,
    })
    assert.throws(
      () => assertTranscript(directory, { proofSha256 }),
      /PASS cleanup-complete/,
    )
    // A transcript whose attempt is not the highest present is rejected.
    writeAttemptTranscript(directory, 3, { proofSha256 })
    assert.throws(
      () => assertTranscript(directory, { attempt: 1, proofSha256 }),
      /not the latest attempt/i,
    )
    // The valid latest transcript is admitted and identified.
    const admitted = assertTranscript(directory, { attempt: 3, proofSha256 })
    assert.equal(admitted.attempt, 3)
    assert.equal(admitted.path, workingTreeRecoveryProofLogPath(directory, 3))
    assert.match(admitted.sha256, /^[a-f0-9]{64}$/)
    assert.equal(admitted.sha256, sha256(readFileSync(admitted.path)))
    // The default binding is the latest attempt as well.
    assert.equal(assertTranscript(directory, { proofSha256 }).attempt, 3)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Y3 the preflight evidence carries the admitted transcript attempt, path and digest', () => {
  const source = promoterSource()
  const evidence = extractRecoveryProofEvidenceLiteral(source)
  assert.match(
    evidence,
    /(^|[\s,{])transcriptAttempt\s*:\s*preflight\.transcript\.attempt\b/,
    'The preflight evidence must carry the admitted transcript attempt number.',
  )
  assert.match(
    evidence,
    /(^|[\s,{])transcriptPath\s*:\s*path\.relative\(\s*preflight\.root\s*,\s*preflight\.transcript\.path\s*\)/,
    'The preflight evidence must carry the transcript path relative to the repository root.',
  )
  assert.match(
    evidence,
    /(^|[\s,{])transcriptSha256\s*:\s*preflight\.transcript\.sha256\b/,
    'The preflight evidence must carry the SHA-256 of the transcript bytes.',
  )
  const body = extractFunctionBody(source, 'async function collectPreflight(')
  const returned = extractBalancedLiteral(body, body.lastIndexOf('return {') + 'return '.length)
  assert.match(returned, /(^|[\s,{])transcript\s*,/, 'The preflight must carry the admitted transcript.')
})

test('Y4 the promoter wires the transcript admission into the proof admission path', () => {
  const source = promoterSource()
  for (const imported of [
    'assertWorkingTreeRecoveryProofAttemptTranscript',
    'workingTreeRecoveryProofAttemptLogs',
    'workingTreeRecoveryProofEvidenceDirectory',
  ]) {
    assert.ok(
      new RegExp(`import\\s*\\{[^}]*\\b${imported}\\b[^}]*\\}\\s*from\\s*'\\./working-tree-recovery-proof\\.mjs'`).test(source),
      `The promoter must import ${imported} from the release-scoped recovery proof module.`,
    )
  }
  const transcriptCalls = [...source.matchAll(/assertWorkingTreeRecoveryProofAttemptTranscript\s*\(/g)]
  assert.equal(
    transcriptCalls.length,
    1,
    `The promoter must bind the attempt transcript exactly once (found ${transcriptCalls.length}).`,
  )
  const call = extractBalancedLiteral(source, transcriptCalls[0].index + transcriptCalls[0][0].length - 1)
  const argumentsList = splitTopLevel(call.slice(1, -1))
  assert.equal(argumentsList.length, 2, 'The transcript admission must receive the evidence directory and one option object.')
  assert.equal(
    argumentsList[0].trim(),
    'evidenceDirectory',
    'The transcript admission must read the release-scoped evidence directory.',
  )
  assert.match(
    argumentsList[1],
    /attempt\s*:\s*attemptLogs\s*\[\s*attemptLogs\.length\s*-\s*1\s*\]\.attempt/,
    'The transcript admission must bind the highest attempt number present.',
  )
  const listingCalls = [...source.matchAll(/workingTreeRecoveryProofAttemptLogs\s*\(/g)]
  assert.equal(
    listingCalls.length,
    1,
    `The attempt-log listing must be called exactly once (found ${listingCalls.length}).`,
  )
  const recoveryProofIndex = source.indexOf('function recoveryProof(')
  assert.ok(
    transcriptCalls[0].index > recoveryProofIndex,
    'The transcript admission must live inside the proof admission path.',
  )
  const admissionIndex = source.indexOf('assertReleaseScopedRecoveryProofAdmission(')
  assert.ok(
    transcriptCalls[0].index > admissionIndex,
    'The transcript admission must run after the legacy-then-strict admission wrapper.',
  )
})

test('Z1 the pinned registry anchors reject a drifted proof and admit an anchor-matching proof', async () => {
  const contracts = await loadRecoveryContracts()
  assert.equal(typeof contracts.assertWorkingTreeRecoveryProofPinnedRegistry, 'function')
  const pinned = {
    sourceRegistrySha256: contracts.WORKING_TREE_RECOVERY_PROOF_SOURCE_REGISTRY_SHA256,
    historicalRegistrySha256: contracts.WORKING_TREE_RECOVERY_PROOF_HISTORICAL_REGISTRY_SHA256,
    sourceRegistry: [{
      version: MIGRATION_127,
      checksum: contracts.WORKING_TREE_RECOVERY_PROOF_MIGRATION_127_CHECKSUM,
    }],
  }
  assert.equal(contracts.assertWorkingTreeRecoveryProofPinnedRegistry(pinned), true)
  assert.throws(
    () => contracts.assertWorkingTreeRecoveryProofPinnedRegistry({ ...pinned, sourceRegistrySha256: 'f'.repeat(64) }),
    /pinned registry/i,
  )
  assert.throws(
    () => contracts.assertWorkingTreeRecoveryProofPinnedRegistry({ ...pinned, historicalRegistrySha256: 'f'.repeat(64) }),
    /pinned registry/i,
  )
  assert.throws(
    () => contracts.assertWorkingTreeRecoveryProofPinnedRegistry({
      ...pinned,
      sourceRegistry: [{ version: MIGRATION_127, checksum: 'f'.repeat(64) }],
    }),
    /pinned checksum/i,
  )
})

test('Z2 the promoter enforces the pinned registry anchors on the admitted proof', () => {
  const source = promoterSource()
  assert.ok(
    /import\s*\{[^}]*\bassertWorkingTreeRecoveryProofPinnedRegistry\b[^}]*\}\s*from\s*'\.\/working-tree-recovery-proof\.mjs'/.test(source),
    'The promoter must import the pinned registry gate from the release-scoped recovery proof module.',
  )
  const calls = [...source.matchAll(/assertWorkingTreeRecoveryProofPinnedRegistry\s*\(/g)]
  assert.equal(
    calls.length,
    1,
    `The promoter must call the pinned registry gate exactly once (found ${calls.length}).`,
  )
  const call = extractBalancedLiteral(source, calls[0].index + calls[0][0].length - 1)
  assert.equal(
    call.slice(1, -1).trim(),
    'proof',
    'The pinned registry gate must receive the admitted proof document.',
  )
  assert.ok(
    calls[0].index > source.indexOf('function recoveryProof('),
    'The pinned registry gate must live inside the proof admission path.',
  )
  assert.ok(
    calls[0].index > source.indexOf('assertReleaseScopedRecoveryProofAdmission('),
    'The pinned registry gate must run after the legacy-then-strict admission wrapper.',
  )
})

test('U1 the promoted container must carry the release identity in its own environment', async () => {
  const promoter = await loadPromoter()
  assert.equal(typeof promoter.assertPromotedContainerReleaseIdentity, 'function')
  const releaseIdentity = 'b'.repeat(40)
  const container = {
    Config: {
      Env: [
        'DB_PASSWORD=super-secret-value',
        `METARDU_BUILD_SHA=${releaseIdentity}`,
      ],
    },
  }
  assert.equal(promoter.assertPromotedContainerReleaseIdentity(container, releaseIdentity), true)
  assert.throws(
    () => promoter.assertPromotedContainerReleaseIdentity(container, 'c'.repeat(40)),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /METARDU_BUILD_SHA/)
      assert.doesNotMatch(error.message, /super-secret-value/)
      assert.doesNotMatch(error.message, /DB_PASSWORD/)
      assert.doesNotMatch(error.message, /[a-f0-9]{40}/)
      return true
    },
  )
  assert.throws(
    () => promoter.assertPromotedContainerReleaseIdentity(
      { Config: { Env: ['DB_PASSWORD=super-secret-value'] } },
      releaseIdentity,
    ),
    /METARDU_BUILD_SHA/,
  )
})

test('U2 the promoter asserts the container identity after the promotion', () => {
  const source = promoterSource()
  const calls = [...source.matchAll(/assertPromotedContainerReleaseIdentity\s*\(/g)]
  assert.equal(
    calls.length,
    2,
    `The container identity assertion must be declared once and called once (found ${calls.length}).`,
  )
  const call = extractBalancedLiteral(source, calls[1].index + calls[1][0].length - 1)
  const argumentsList = splitTopLevel(call.slice(1, -1))
  assert.equal(argumentsList.length, 2, 'The container identity assertion must receive the container and the release identity.')
  assert.equal(argumentsList[0].trim(), 'updatedApp', 'The identity assertion must read the recreated container.')
  assert.equal(
    argumentsList[1].trim(),
    'preflight.releaseIdentity',
    'The identity assertion must compare against the promoted release identity.',
  )
  const imageAssertion = source.indexOf("assert.equal(updatedApp.Image, preflight.candidateImageId")
  assert.ok(
    calls[1].index > imageAssertion,
    'The container identity assertion must run after the candidate image assertion.',
  )
})

test('V1 the strict gate rejects an extra passing check and admits exactly the mandatory set', () => {
  const fixture = fixtureProof()
  assert.doesNotThrow(() => assertWorkingTreeRecoveryProofDocument(fixture.proof, proofContext(fixture)))
  const withExtra = {
    ...fixture.proof,
    checks: [...fixture.proof.checks, { name: 'unreviewed-extra-check', passed: true }],
  }
  assert.throws(
    () => assertWorkingTreeRecoveryProofDocument(withExtra, proofContext(fixture)),
    /exactly the mandatory recovery proof checks/i,
  )
  const withDuplicate = {
    ...fixture.proof,
    checks: [...fixture.proof.checks, { name: fixture.proof.checks[0].name, passed: true }],
  }
  assert.throws(
    () => assertWorkingTreeRecoveryProofDocument(withDuplicate, proofContext(fixture)),
    /exactly the mandatory recovery proof checks/i,
  )
  const withMissing = {
    ...fixture.proof,
    checks: fixture.proof.checks.slice(1),
  }
  assert.throws(
    () => assertWorkingTreeRecoveryProofDocument(withMissing, proofContext(fixture)),
    /exactly the mandatory recovery proof checks/i,
  )
})

test('H1 a future-dated value in a non-mutation column cannot change the newest-mutation result', () => {
  const reviewed = [
    { label: 'audit_logs.created_at', value: '2026-11-27T07:21:21.785237Z' },
  ]
  const poisoned = [
    ...reviewed,
    { label: 'sessions.expires_at', value: '2099-01-01T00:00:00Z' },
    { column: 'sessions.last_used_at', value: '2099-01-01T00:00:00Z' },
    { label: 'sessions.timestamp', value: '2099-01-01T00:00:00Z' },
  ]
  const newest = recoveryProducer.newestLiveMutationTimestamp(poisoned)
  assert.equal(newest.value, '2026-11-27T07:21:21.785237Z')
  assert.equal(newest.column, 'audit_logs.created_at')
  // An excluded column can never make a stale archive look fresh.
  assert.throws(
    () => recoveryProducer.assertRecoveryArchiveFreshness({
      archiveTimestamp: recoveryProducer.deriveRecoveryArchiveDumpTimestamp('db_20261127_020001.sql.gz'),
      newestLiveMutation: newest.value,
    }),
    /predates the newest live write/i,
  )
  // An excluded column on its own never produces a freshness anchor.
  assert.equal(
    recoveryProducer.newestLiveMutationTimestamp([
      { label: 'sessions.expires_at', value: '2099-01-01T00:00:00Z' },
    ]),
    null,
  )
})

test('H2 a mandatory-coverage failure produces a failure summary rather than a silent exit', () => {
  assert.equal(typeof recoveryProducer.evaluateProducerRecoveryCheckCoverage, 'function')
  const directory = temporaryDirectory('metardu-recovery-coverage-')
  try {
    const recorded = WORKING_TREE_RECOVERY_PROOF_CHECKS
      .filter(name => name !== 'cleanup-complete')
      .map(name => ({ name, passed: true }))
    const result = recoveryProducer.evaluateProducerRecoveryCheckCoverage(recorded, {
      evidenceDirectory: directory,
      attempt: 3,
      state: { status: 'passed', phase: 'cleanup', cleanup: { complete: true } },
    })
    assert.equal(result.passed, false)
    assert.equal(result.status, 'failed')
    const summaryPath = path.join(directory, 'failure-3.json')
    assert.equal(existsSync(summaryPath), true, 'A coverage failure must leave a failure summary behind.')
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
    assert.equal(summary.status, 'failed')
    assert.equal(summary.phase, 'proof-writing')
    assert.match(summary.failure.message, /cleanup-complete/)
    // The successful path is unchanged and writes no failure summary.
    const admitted = recoveryProducer.evaluateProducerRecoveryCheckCoverage(
      WORKING_TREE_RECOVERY_PROOF_CHECKS.map(name => ({ name, passed: true })),
      { evidenceDirectory: directory, attempt: 4, state: { status: 'passed', phase: 'cleanup' } },
    )
    assert.equal(admitted.passed, true)
    assert.equal(existsSync(path.join(directory, 'failure-4.json')), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('H2 the producer routes the coverage gate through the failure-summary path', () => {
  const source = stripSourceComments(readFileSync(PRODUCER_PATH, 'utf8'))
  assert.match(
    source,
    /evaluateProducerRecoveryCheckCoverage\(\s*state\.checks\s*,/,
    'The producer must evaluate the mandatory coverage through the failure-summary helper.',
  )
  assert.doesNotMatch(
    source,
    /assertProducerRecoveryCheckCoverage\(\s*state\.checks\s*\)/,
    'The producer must not call the throwing coverage assertion directly.',
  )
  const helperIndex = source.indexOf('evaluateProducerRecoveryCheckCoverage(state.checks,')
  const proofWriteIndex = source.indexOf('buildWorkingTreeRecoveryProof({')
  assert.ok(helperIndex !== -1, 'The producer never evaluates the mandatory coverage.')
  assert.ok(
    helperIndex < proofWriteIndex,
    'The coverage evaluation must happen before the proof is built.',
  )
})

// --- R4: transcript provenance (fix round 4) ---------------------------------

const CONTRACTS_PATH = path.join(REPOSITORY_ROOT, 'scripts', 'working-tree-recovery-proof.mjs')

function contractsSource() {
  return readFileSync(CONTRACTS_PATH, 'utf8')
}

test('R4-1 the canonical serializer and digest are the bytes the atomic writer puts on disk', async () => {
  const contracts = await loadRecoveryContracts()
  assert.equal(typeof contracts.workingTreeRecoveryProofBytes, 'function')
  assert.equal(typeof contracts.workingTreeRecoveryProofSha256, 'function')
  const fixture = fixtureProof()
  const expected = Buffer.from(`${JSON.stringify(fixture.proof, null, 2)}\n`, 'utf8')
  const bytes = contracts.workingTreeRecoveryProofBytes(fixture.proof)
  assert.ok(Buffer.isBuffer(bytes), 'The canonical serializer must return bytes.')
  assert.deepEqual(bytes, expected, 'The canonical serializer must return the exact proof bytes.')
  assert.match(contracts.workingTreeRecoveryProofSha256(fixture.proof), /^[a-f0-9]{64}$/)
  assert.equal(
    contracts.workingTreeRecoveryProofSha256(fixture.proof),
    sha256(expected),
    'The digest must be the digest of the canonical proof bytes.',
  )

  const directory = temporaryDirectory('metardu-recovery-canonical-')
  try {
    const artifactPath = path.join(directory, 'recovery-proof', 'verification.json')
    writeWorkingTreeRecoveryProofAtomic(artifactPath, fixture.proof)
    const onDisk = readFileSync(artifactPath)
    assert.deepEqual(onDisk, bytes, 'The writer must put the canonical bytes on disk.')
    assert.equal(
      sha256(onDisk),
      contracts.workingTreeRecoveryProofSha256(fixture.proof),
      'The digest of the bytes on disk must equal the canonical digest.',
    )
    assert.equal(
      contracts.workingTreeRecoveryProofSha256(fixture.proof),
      contracts.workingTreeRecoveryProofSha256(JSON.parse(onDisk.toString('utf8'))),
      'The canonical digest must survive a parse/serialize round trip.',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }

  // The writer must not carry a second, private serialization of the proof:
  // the canonical serialization exists exactly once in the contracts module.
  const source = contractsSource()
  assert.equal(
    [...source.matchAll(/JSON\.stringify\(proof, null, 2\)/g)].length,
    1,
    'The canonical proof serialization must exist exactly once in the contracts module.',
  )
  const writerBody = extractNamedFunctionBody(source, 'export function writeWorkingTreeRecoveryProofAtomic(')
  assert.match(
    writerBody,
    /workingTreeRecoveryProofBytes\(proof\)/,
    'The atomic writer must serialize through the canonical serializer.',
  )
})

test('R4-2 the proof transcript marker is a named constant with an exact line formatter', async () => {
  const contracts = await loadRecoveryContracts()
  assert.equal(contracts.WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_PROOF, 'PROOF sha256')
  assert.equal(typeof contracts.workingTreeRecoveryProofTranscriptProofLine, 'function')
  const digest = 'a'.repeat(64)
  assert.equal(
    contracts.workingTreeRecoveryProofTranscriptProofLine(digest),
    `PROOF sha256 ${digest}`,
    'The proof line must carry the exact marker and the exact digest.',
  )
  for (const invalid of ['A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'not-a-digest', '', null]) {
    assert.throws(
      () => contracts.workingTreeRecoveryProofTranscriptProofLine(invalid),
      /64 lowercase hexadecimal/,
      `The proof line formatter must reject: ${JSON.stringify(invalid)}`,
    )
  }
})

test('R4-3 a transcript bound to the admitted proof digest is admitted', async () => {
  const contracts = await loadRecoveryContracts()
  const directory = temporaryDirectory('metardu-recovery-binding-')
  try {
    const proofSha256 = 'b'.repeat(64)
    writeAttemptTranscript(directory, 1, { proofSha256 })
    const admitted = contracts.assertWorkingTreeRecoveryProofAttemptTranscript(directory, {
      attempt: 1,
      proofSha256,
    })
    assert.equal(admitted.attempt, 1)
    assert.match(admitted.sha256, /^[a-f0-9]{64}$/)
    assert.equal(admitted.sha256, sha256(readFileSync(admitted.path)))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('R4-4 a transcript bound to a different proof digest is rejected', async () => {
  const contracts = await loadRecoveryContracts()
  const directory = temporaryDirectory('metardu-recovery-binding-')
  try {
    const admittedDigest = 'b'.repeat(64)
    writeAttemptTranscript(directory, 1, { proofSha256: 'c'.repeat(64) })
    assert.throws(
      () => contracts.assertWorkingTreeRecoveryProofAttemptTranscript(directory, {
        attempt: 1,
        proofSha256: admittedDigest,
      }),
      /proof digest/i,
      'A transcript bound to a different proof digest must be rejected.',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('R4-5 a transcript without any proof digest line is rejected', async () => {
  const contracts = await loadRecoveryContracts()
  const directory = temporaryDirectory('metardu-recovery-binding-')
  try {
    writeAttemptTranscript(directory, 1, { proofSha256: null })
    assert.throws(
      () => contracts.assertWorkingTreeRecoveryProofAttemptTranscript(directory, {
        attempt: 1,
        proofSha256: 'b'.repeat(64),
      }),
      /proof digest/i,
      'A transcript without a proof digest line must be rejected.',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('R4-6 a near-miss proof marker is rejected', async () => {
  const contracts = await loadRecoveryContracts()
  const directory = temporaryDirectory('metardu-recovery-binding-')
  try {
    const digest = 'b'.repeat(64)
    const nearMisses = [
      `PROOF  sha256 ${digest}`,
      `PROOF sha256 ${digest.slice(0, 63)}`,
      `PROOF sha256 ${digest.toUpperCase()}`,
      `proof sha256 ${digest}`,
      `PROOF sha256 ${digest} `,
      `PROOF sha256 `,
      `PROOF sha256 ${digest} extra`,
    ]
    for (const [index, proofLine] of nearMisses.entries()) {
      writeAttemptTranscript(directory, index + 1, { proofLine })
      assert.throws(
        () => contracts.assertWorkingTreeRecoveryProofAttemptTranscript(directory, {
          attempt: index + 1,
          proofSha256: digest,
        }),
        /proof digest/i,
        `A near-miss proof marker must be rejected: ${JSON.stringify(proofLine)}`,
      )
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('R4-6b a transcript carrying two proof digest lines is rejected', async () => {
  const contracts = await loadRecoveryContracts()
  const directory = temporaryDirectory('metardu-recovery-binding-')
  try {
    const digest = 'b'.repeat(64)
    const logPath = workingTreeRecoveryProofLogPath(directory, 1)
    writeFileSync(logPath, [
      ...WORKING_TREE_RECOVERY_PROOF_CHECKS.map(name => `PASS ${name}`),
      'STATUS passed',
      `PROOF sha256 ${digest}`,
      `PROOF sha256 ${'c'.repeat(64)}`,
      '',
    ].join('\n'))
    assert.throws(
      () => contracts.assertWorkingTreeRecoveryProofAttemptTranscript(directory, {
        attempt: 1,
        proofSha256: digest,
      }),
      /proof digest/i,
      'A transcript carrying two proof digest lines must be rejected.',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('R4-7 the transcript admission fails closed without an admitted proof digest', async () => {
  const contracts = await loadRecoveryContracts()
  const directory = temporaryDirectory('metardu-recovery-binding-')
  try {
    writeAttemptTranscript(directory, 1, { proofSha256: 'b'.repeat(64) })
    assert.throws(
      () => contracts.assertWorkingTreeRecoveryProofAttemptTranscript(directory, { attempt: 1 }),
      /64 lowercase hexadecimal/,
      'The transcript admission must refuse to run without the admitted proof digest.',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('R4-8 the producer records the proof digest only after a successful artifact write', async () => {
  assert.equal(typeof recoveryProducer.commitProducerRecoveryProof, 'function')
  const directory = temporaryDirectory('metardu-recovery-commit-')
  try {
    const fixture = fixtureProof()
    const evidenceDirectory = path.join(directory, 'recovery-proof')
    mkdirSync(evidenceDirectory, { recursive: true })
    const artifactPath = path.join(evidenceDirectory, 'verification.json')
    const transcriptPath = workingTreeRecoveryProofLogPath(evidenceDirectory, 1)
    const lines = []
    const result = recoveryProducer.commitProducerRecoveryProof({
      proof: fixture.proof,
      artifactPath,
      evidenceDirectory,
      attempt: 1,
      state: { status: 'passed', phase: 'cleanup', cleanup: { complete: true } },
      log: message => {
        lines.push(message)
        appendFileSync(transcriptPath, `${message}\n`)
      },
    })
    assert.equal(result.passed, true)
    assert.equal(result.status, 'passed')
    const digest = sha256(readFileSync(artifactPath))
    assert.ok(
      lines.includes(`PROOF sha256 ${digest}`),
      'The transcript must carry the exact digest of the proof bytes on disk.',
    )
    assert.ok(lines.includes('STATUS passed'), 'The transcript must carry the final status line.')
    assert.equal(
      existsSync(path.join(evidenceDirectory, 'failure-1.json')),
      false,
      'A successful proof write must not leave a failure summary behind.',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('R4-9 a refused proof write leaves neither transcript line and writes a proof-writing failure summary', async () => {
  assert.equal(typeof recoveryProducer.commitProducerRecoveryProof, 'function')
  const directory = temporaryDirectory('metardu-recovery-refusal-')
  try {
    const evidenceDirectory = path.join(directory, 'recovery-proof')
    mkdirSync(evidenceDirectory, { recursive: true })
    const artifactPath = path.join(evidenceDirectory, 'verification.json')
    const existing = `${JSON.stringify({ different: true }, null, 2)}\n`
    writeFileSync(artifactPath, existing)
    const lines = []
    const result = recoveryProducer.commitProducerRecoveryProof({
      proof: fixtureProof().proof,
      artifactPath,
      evidenceDirectory,
      attempt: 2,
      state: { status: 'passed', phase: 'cleanup', cleanup: { complete: true } },
      log: message => lines.push(message),
    })
    assert.equal(result.passed, false)
    assert.equal(result.status, 'failed')
    assert.ok(
      !lines.some(line => line.startsWith('PROOF sha256')),
      'A refused write must not append the proof digest line.',
    )
    assert.ok(
      !lines.includes('STATUS passed'),
      'A refused write must not append a passed status line.',
    )
    assert.ok(
      lines.some(line => line.startsWith('FAIL proof-writing')),
      'A refused write must record its refusal in the transcript.',
    )
    assert.ok(
      !lines.some(line => line.startsWith('STATUS ')),
      'A refused write must not write a terminal status line at all.',
    )
    const summaryPath = path.join(evidenceDirectory, 'failure-2.json')
    assert.equal(existsSync(summaryPath), true, 'A refused write must leave a failure summary behind.')
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
    assert.equal(summary.status, 'failed')
    assert.equal(summary.phase, 'proof-writing')
    assert.match(summary.failure.message, /never silently replaced/)
    // The existing artifact is never silently replaced.
    assert.equal(readFileSync(artifactPath, 'utf8'), existing)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('R4-10 the producer logs the passed status only after the proof artifact write succeeded', () => {
  const source = stripSourceComments(readFileSync(PRODUCER_PATH, 'utf8'))
  const statusIndex = source.indexOf('state.status = recoveryStatusAfterCleanup(state.status, state.cleanup)')
  assert.notEqual(statusIndex, -1, 'The producer never derives the post-cleanup status.')
  const finallyIndex = source.lastIndexOf('finally {', statusIndex)
  assert.notEqual(finallyIndex, -1, 'The post-cleanup status is not inside a finally block.')
  const finallyBlock = extractBalancedLiteral(source, source.indexOf('{', finallyIndex))
  assert.doesNotMatch(
    finallyBlock,
    /STATUS passed/,
    'The finally block must never log a passed status.',
  )
  assert.doesNotMatch(
    finallyBlock,
    /WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_STATUS/,
    'The finally block must never log the passed status constant.',
  )
  assert.match(
    finallyBlock,
    /if \(state\.status\s*!==\s*'passed'\)\s*\{?\s*log\(`STATUS \$\{state\.status\}`\)\s*;?\s*\}?/,
    'The finally block must log the status only when it is not passed.',
  )
  const statusLogs = [...source.matchAll(/log\(\s*WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_STATUS\s*\)/g)]
  assert.equal(
    statusLogs.length,
    1,
    `The producer must log the passed status exactly once (found ${statusLogs.length}).`,
  )
  const commitBody = extractNamedFunctionBody(source, 'export function commitProducerRecoveryProof(')
  const proofLineLogs = [...commitBody.matchAll(/log\(workingTreeRecoveryProofTranscriptProofLine\(/g)]
  assert.equal(
    proofLineLogs.length,
    1,
    `The proof digest line must be logged exactly once (found ${proofLineLogs.length}).`,
  )
  const helperStatusLogs = [...commitBody.matchAll(/log\(WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_STATUS\)/g)]
  assert.equal(
    helperStatusLogs.length,
    1,
    `The passed status line must be logged exactly once (found ${helperStatusLogs.length}).`,
  )
  const writeIndex = commitBody.indexOf('writeProof(')
  const proofLineIndex = commitBody.indexOf('log(workingTreeRecoveryProofTranscriptProofLine(')
  const statusIndexInHelper = commitBody.indexOf('log(WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_STATUS)')
  assert.ok(writeIndex !== -1, 'The commit helper never writes the proof artifact.')
  assert.ok(proofLineIndex > writeIndex, 'The proof digest line must follow the artifact write.')
  assert.ok(statusIndexInHelper > proofLineIndex, 'The passed status line must follow the proof digest line.')
  // The transcript lines must be logged outside the guarded write, so a
  // refused write can never reach them.
  const catchIndex = commitBody.indexOf('} catch (error) {')
  assert.notEqual(catchIndex, -1, 'The commit helper must guard the proof artifact write.')
  const catchBrace = commitBody.indexOf('{', catchIndex)
  const catchBlock = extractBalancedLiteral(commitBody, catchBrace)
  const catchEnd = catchBrace + catchBlock.length
  assert.ok(
    proofLineIndex > catchEnd,
    'The proof digest line must be logged after the guarded write, never inside the try block.',
  )
  assert.ok(
    statusIndexInHelper > catchEnd,
    'The passed status line must be logged after the guarded write, never inside the try block.',
  )
  const calls = [...source.matchAll(/commitProducerRecoveryProof\s*\(/g)]
  assert.equal(
    calls.length,
    2,
    `The producer must declare and call the commit helper exactly once each (found ${calls.length}).`,
  )
  const callIndex = source.indexOf('commitProducerRecoveryProof({')
  assert.ok(callIndex !== -1, 'The producer never calls the commit helper.')
  const buildIndex = source.indexOf('buildWorkingTreeRecoveryProof({')
  assert.ok(
    buildIndex !== -1 && buildIndex < callIndex,
    'The proof must be built before the commit helper writes it.',
  )
  for (const imported of [
    'WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_STATUS',
    'workingTreeRecoveryProofBytes',
    'workingTreeRecoveryProofSha256',
    'workingTreeRecoveryProofTranscriptProofLine',
  ]) {
    assert.ok(
      new RegExp(`import\\s*\\{[^}]*\\b${imported}\\b[^}]*\\}\\s*from\\s*'\\./working-tree-recovery-proof\\.mjs'`).test(
        readFileSync(PRODUCER_PATH, 'utf8'),
      ),
      `The producer must import ${imported} from the release-scoped recovery proof module.`,
    )
  }
})

test('R4-12 the shipped release-path scripts carry no leftover TDD scaffolding', () => {
  // The contracts module and the producer are inside the hashed producer
  // source closure, so a leftover probe comment is shipped inside every
  // proof's `producerSourceSha256`.
  for (const file of [CONTRACTS_PATH, PRODUCER_PATH, PROMOTER_PATH]) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(
      source,
      /RED-PROBE/,
      `${path.relative(REPOSITORY_ROOT, file)} must not carry leftover TDD scaffolding.`,
    )
  }
})

test('R4-11 the promoter binds the transcript to the digest of the admitted proof bytes', () => {
  const source = promoterSource()
  const body = extractNamedFunctionBody(source, 'function recoveryProof(')
  const digestIndex = body.indexOf("createHash('sha256').update(bytes).digest('hex')")
  assert.notEqual(digestIndex, -1, 'The promoter must compute the digest of the admitted proof bytes.')
  const callIndex = body.indexOf('assertWorkingTreeRecoveryProofAttemptTranscript(')
  assert.notEqual(callIndex, -1, 'The promoter never admits the attempt transcript.')
  assert.ok(
    digestIndex < callIndex,
    'The admitted proof digest must be computed before the transcript admission.',
  )
  const call = extractBalancedLiteral(body, body.indexOf('(', body.indexOf('assertWorkingTreeRecoveryProofAttemptTranscript(')))
  const argumentsList = splitTopLevel(call.slice(1, -1))
  assert.equal(argumentsList.length, 2, 'The transcript admission must receive the evidence directory and one option object.')
  assert.match(
    argumentsList[1],
    /(^|[\s,{])proofSha256\s*(?::\s*proofSha256\b|,)/,
    'The transcript admission must receive the digest of the admitted proof bytes.',
  )
  assert.match(
    body,
    /proofSha256\s*,\s*transcript\s*,/,
    'The preflight must carry the admitted proof digest and the admitted transcript.',
  )
})

// --- R5: the pre-migration baseline must be schema-portable -----------------
//
// Field execution 1 (2026-11-28) failed closed with PostgreSQL 42703
// `column "checkout_request_id" does not exist`. The producer measured the
// payment_history baseline on the 131-migration clone, BEFORE migration 127
// ran, but its eligibility predicates named the migration-127 columns as bare
// column identifiers. A bare reference to a column that does not exist yet is
// a hard PostgreSQL error; the predicates must read those columns in a way
// that is well defined on BOTH schemas.

const MIGRATION_127_PAYMENT_COLUMNS = ['checkout_request_id', 'phone_number', 'last_reconcile_attempt_at']

test('R5-1 the producer exports the migration-127 payment column names', () => {
  assert.deepEqual(
    [...(recoveryProducer.RECOVERY_MIGRATION_127_PAYMENT_COLUMNS ?? [])].sort(),
    [...MIGRATION_127_PAYMENT_COLUMNS].sort(),
    'The producer must export exactly the payment_history columns that migration 127 adds.',
  )
})

test('R5-2 the pre-migration eligibility SQL never names a migration-127 column as a bare identifier', () => {
  const predicates = {
    checkout: recoveryProducer.RECOVERY_CHECKOUT_ELIGIBLE_SQL,
    phone: recoveryProducer.RECOVERY_PHONE_ELIGIBLE_SQL,
  }
  for (const [name, sql] of Object.entries(predicates)) {
    assert.equal(typeof sql, 'string', `The producer must export the ${name} eligibility predicate.`)
    assert.ok(sql.length > 0, `The ${name} eligibility predicate must not be empty.`)
    for (const column of MIGRATION_127_PAYMENT_COLUMNS) {
      // Remove every JSON extraction of the column, then assert that no bare
      // identifier of it remains. A bare identifier is exactly what raised
      // PostgreSQL 42703 in field execution 1.
      const withoutJsonExtraction = sql.replace(new RegExp(`->>'${column}'`, 'g'), '')
      assert.equal(
        new RegExp(`\\b${column}\\b`).test(withoutJsonExtraction),
        false,
        `The ${name} eligibility predicate must not reference ${column} as a bare column identifier; `
        + 'it is read on the 131-migration clone, before migration 127 creates it.',
      )
    }
  }
})

test('R5-3 the pre-migration eligibility SQL reads the migration-127 columns through JSON extraction', () => {
  assert.match(
    recoveryProducer.RECOVERY_CHECKOUT_ELIGIBLE_SQL ?? '',
    /->>'checkout_request_id'\s+IS NULL/,
    'The checkout predicate must read checkout_request_id through a JSON extraction.',
  )
  assert.match(
    recoveryProducer.RECOVERY_PHONE_ELIGIBLE_SQL ?? '',
    /->>'phone_number'\s+IS NULL/,
    'The phone predicate must read phone_number through a JSON extraction.',
  )
})

test('R5-4 the schema boundary assertion rejects the wrong schema state in both directions', () => {
  const assertBoundary = recoveryProducer.assertRecoveryPaymentSchemaBoundary
  assert.equal(typeof assertBoundary, 'function', 'The producer must export the schema-boundary assertion.')
  const preMigration = ['id', 'transaction_id', 'payment_method', 'status', 'metadata']
  const postMigration = [...preMigration, ...MIGRATION_127_PAYMENT_COLUMNS]
  // Before the upgrade, none of the migration-127 columns may exist.
  assert.equal(assertBoundary(preMigration, { phase: 'before' }), true)
  assert.throws(
    () => assertBoundary(postMigration, { phase: 'before' }),
    /before migration 127/i,
    'The pre-migration boundary must reject a schema that already carries the migration-127 columns.',
  )
  // After the upgrade, every one of them must exist.
  assert.equal(assertBoundary(postMigration, { phase: 'after' }), true)
  assert.throws(
    () => assertBoundary(preMigration, { phase: 'after' }),
    /after migration 127/i,
    'The post-migration boundary must reject a schema that is missing the migration-127 columns.',
  )
  assert.throws(
    () => assertBoundary([...preMigration, 'checkout_request_id'], { phase: 'after' }),
    /after migration 127/i,
    'The post-migration boundary must reject a partially migrated schema.',
  )
})

test('R5-5 the producer asserts the pre-migration boundary before the baseline and the post-migration boundary after the upgrade', () => {
  const source = producerSource()
  const body = extractNamedFunctionBody(source, 'export async function executeRecoveryProof(')
  const boundaryCalls = [...body.matchAll(/assertRecoveryPaymentSchemaBoundary\s*\(/g)]
  assert.equal(
    boundaryCalls.length,
    2,
    `The producer must assert the schema boundary exactly twice (found ${boundaryCalls.length}).`,
  )
  const baselineIndex = body.indexOf('paymentHistoryBaseline(')
  const migrationIndex = body.indexOf("authorize('apply-migration-127')")
  const afterIndex = body.indexOf('paymentHistoryAfter(')
  assert.ok(baselineIndex > -1, 'The producer never measures the payment_history baseline.')
  assert.ok(migrationIndex > -1, 'The producer never applies migration 127.')
  assert.ok(afterIndex > -1, 'The producer never measures the post-migration payment_history state.')
  assert.ok(
    baselineIndex < migrationIndex,
    'The payment_history baseline must be measured before migration 127 is applied.',
  )
  assert.ok(
    afterIndex > migrationIndex,
    'The post-migration payment_history state must be measured after migration 127 is applied.',
  )
  // The "before" boundary assertion must sit between the ledger check and the
  // baseline; the "after" assertion must sit between the upgrade and the
  // post-migration measurement.
  const beforeCall = extractBalancedLiteral(body, boundaryCalls[0].index + boundaryCalls[0][0].length - 1)
  const afterCall = extractBalancedLiteral(body, boundaryCalls[1].index + boundaryCalls[1][0].length - 1)
  assert.match(beforeCall, /phase\s*:\s*'before'/, 'The first boundary assertion must be the pre-migration boundary.')
  assert.match(afterCall, /phase\s*:\s*'after'/, 'The second boundary assertion must be the post-migration boundary.')
  assert.ok(
    boundaryCalls[0].index < baselineIndex,
    'The pre-migration boundary must be asserted before the baseline is measured.',
  )
  assert.ok(
    boundaryCalls[1].index > migrationIndex && boundaryCalls[1].index < afterIndex,
    'The post-migration boundary must be asserted after the upgrade and before the post-migration measurement.',
  )
})

test('R5-6 the before and after "other" measurements use one identical row-set definition', () => {
  const sql = recoveryProducer.RECOVERY_ELIGIBLE_OTHER_DIGEST_SQL
  assert.equal(typeof sql, 'string', 'The producer must export the ineligible-row digest query.')
  assert.match(
    sql,
    /NOT \(id::text = ANY\(\$1::text\[\]\)\)/,
    'The ineligible-row set must be defined by excluding the eligible id list.',
  )
  assert.equal(
    sql.includes(recoveryProducer.RECOVERY_CHECKOUT_ELIGIBLE_SQL ?? '\u0000'),
    false,
    'The ineligible-row set must not be defined by re-evaluating the eligibility predicate: '
    + 'a row whose transaction_id is NULL makes the match unknown, and NOT unknown is unknown '
    + 'rather than true, so such a row would be silently dropped from the set.',
  )
  // Both measurements must use this one definition, so the before and after
  // digests provably cover exactly the same rows.
  const source = producerSource()
  const baselineBody = extractNamedFunctionBody(source, 'async function paymentHistoryBaseline(')
  const afterBody = extractNamedFunctionBody(source, 'async function paymentHistoryAfter(')
  assert.match(
    baselineBody,
    /RECOVERY_ELIGIBLE_OTHER_DIGEST_SQL/,
    'The pre-migration ineligible-row digest must use the shared definition.',
  )
  assert.match(
    afterBody,
    /RECOVERY_ELIGIBLE_OTHER_DIGEST_SQL/,
    'The post-migration ineligible-row digest must use the shared definition.',
  )
})

// --- R6: one shared migration-127 schema-evidence contract -----------------
//
// Field execution 2 (2026-11-28) got past the baseline, past the migration
// and past the ledger transition, then failed on the migration-127 schema
// contract. The producer measured the catalog with its OWN copy of the
// column query, which projected `notNull`, while the reviewed contract
// (`assertMigration127SchemaContract`, in the frozen release module) requires
// `isNullable`. The promotion controller had a second, correct copy of the
// same query. The duplication is what allowed the drift, so the two copies
// are replaced by ONE shared set of statements that both sides execute.

const MIGRATION_127_EVIDENCE_ROWS = Object.freeze({
  columns: Object.freeze([
    { name: 'checkout_request_id', dataType: 'character varying', maximumLength: 255, isNullable: 'YES' },
    { name: 'last_reconcile_attempt_at', dataType: 'timestamp with time zone', maximumLength: null, isNullable: 'YES' },
    { name: 'phone_number', dataType: 'character varying', maximumLength: 20, isNullable: 'YES' },
  ]),
  indexes: Object.freeze([
    { name: 'idx_payment_history_mpesa_checkout_request_id', partial: true },
    { name: 'idx_payment_history_mpesa_pending_checkout', partial: true },
    { name: 'idx_payment_history_mpesa_pending_reconcile_attempt', partial: true },
  ]),
  unique: Object.freeze({ uniqueCheckoutRequestId: false }),
  rls: Object.freeze({ rlsEnabled: true, rlsForced: true }),
  policies: Object.freeze({ count: 8 }),
})

/**
 * A catalog client that answers the migration-127 evidence queries with the
 * rows the live customer database actually produces.
 */
function migration127EvidenceClient(overrides = {}) {
  const rows = { ...MIGRATION_127_EVIDENCE_ROWS, ...overrides }
  return {
    async query(sql) {
      const text = String(sql)
      if (text.includes('information_schema.columns')) return { rows: rows.columns }
      if (text.includes('indpred IS NOT NULL')) return { rows: rows.indexes }
      if (text.includes('pg_constraint')) return { rows: [rows.unique] }
      if (text.includes('relrowsecurity')) return { rows: [rows.rls] }
      if (text.includes('pg_policies')) return { rows: [rows.policies] }
      throw new Error(`The migration-127 evidence query is not recognised: ${text.slice(0, 80)}`)
    },
  }
}

test('R6-1 the release-scoped proof module publishes one shared migration-127 evidence contract', () => {
  assert.equal(
    typeof MIGRATION_127_SCHEMA_EVIDENCE_SQL,
    'object',
    'The proof module must publish the shared migration-127 evidence statements.',
  )
  for (const key of ['columns', 'indexes', 'unique', 'rls', 'policies']) {
    const sql = MIGRATION_127_SCHEMA_EVIDENCE_SQL?.[key]
    assert.equal(typeof sql, 'string', `The shared migration-127 evidence must include the ${key} statement.`)
    assert.ok(sql.trim().length > 0, `The shared ${key} statement must not be empty.`)
  }
  assert.match(
    MIGRATION_127_SCHEMA_EVIDENCE_SQL.columns,
    /is_nullable\s+AS\s+"isNullable"/,
    'The shared column statement must project the nullability under the reviewed field name.',
  )
  assert.doesNotMatch(
    MIGRATION_127_SCHEMA_EVIDENCE_SQL.columns,
    /attnotnull|notNull/,
    'The shared column statement must not project the raw catalog boolean that drifted from the contract.',
  )
})

test('R6-2 neither the producer nor the promotion controller keeps its own copy of the evidence SQL', () => {
  const producerBody = extractNamedFunctionBody(producerSource(), 'async function paymentHistorySchemaEvidence(')
  const promoterBody = extractNamedFunctionBody(promoterSource(), 'async function migration127SchemaEvidence(')
  for (const [name, body] of [['producer', producerBody], ['promoter', promoterBody]]) {
    assert.match(
      body,
      /MIGRATION_127_SCHEMA_EVIDENCE_SQL/,
      `The ${name} must execute the shared migration-127 evidence statements.`,
    )
    for (const fragment of [
      'information_schema.columns',
      'indispartial',
      'relrowsecurity',
      'pg_policies',
      'pg_constraint',
    ]) {
      assert.equal(
        body.includes(fragment),
        false,
        `The ${name} must not inline its own copy of the migration-127 catalog query (${fragment}); `
        + 'a duplicated statement is what allowed the producer to drift from the reviewed contract.',
      )
    }
  }
  // Both sides must import the shared statements from the release-scoped
  // proof module, which is inside the hashed producer source closure.
  for (const [name, file] of [['producer', PRODUCER_PATH], ['promoter', PROMOTER_PATH]]) {
    assert.ok(
      new RegExp(`import\\s*\\{[^}]*\\bMIGRATION_127_SCHEMA_EVIDENCE_SQL\\b[^}]*\\}\\s*from\\s*'\\./working-tree-recovery-proof\\.mjs'`).test(
        readFileSync(file, 'utf8'),
      ),
      `The ${name} must import the shared migration-127 evidence statements from the release-scoped recovery proof module.`,
    )
  }
})

test('R6-3 the producer evidence satisfies the reviewed migration-127 schema contract', () => {
  const evidence = typeof recoveryProducer.paymentHistorySchemaEvidence === 'function'
    ? recoveryProducer.paymentHistorySchemaEvidence
    : null
  assert.equal(
    typeof evidence,
    'function',
    'The producer must publish its migration-127 schema evidence function so the contract can be exercised.',
  )
  assert.equal(typeof promotionController.migration127SchemaEvidence, 'function')
  return Promise.all([
    evidence(migration127EvidenceClient()),
    promotionController.migration127SchemaEvidence(migration127EvidenceClient()),
  ]).then(([producerEvidence, promoterEvidence]) => {
    // The exact assertion that failed in field execution 2.
    assert.equal(
      assertMigration127SchemaContract({
        columns: producerEvidence.columns,
        indexes: producerEvidence.indexes,
        uniqueCheckoutRequestId: producerEvidence.uniqueCheckoutRequestId,
        rlsEnabled: producerEvidence.rlsEnabled,
        rlsForced: producerEvidence.rlsForced,
        policyCount: producerEvidence.policyCount,
        beforePolicyCount: producerEvidence.policyCount,
      }),
      true,
      'The producer evidence must satisfy the reviewed migration-127 schema contract.',
    )
    // The two sides must read the same evidence in the same shape.
    assert.deepEqual(
      producerEvidence,
      promoterEvidence,
      'The producer and the promotion controller must read the migration-127 evidence in the same shape.',
    )
    assert.deepEqual(
      Object.keys(producerEvidence).sort(),
      ['columns', 'indexes', 'policyCount', 'rlsEnabled', 'rlsForced', 'uniqueCheckoutRequestId'],
      'The migration-127 evidence shape must be explicit.',
    )
  })
})

test('R6-4 the producer evidence cannot pass when the nullability field drifts again', () => {
  // A mutation that reintroduces the field drift must be rejected by the
  // reviewed contract, so R6-3 cannot pass vacuously.
  assert.throws(
    () => assertMigration127SchemaContract({
      columns: MIGRATION_127_EVIDENCE_ROWS.columns.map(column => ({
        ...column,
        isNullable: undefined,
        notNull: false,
      })),
      indexes: MIGRATION_127_EVIDENCE_ROWS.indexes,
      uniqueCheckoutRequestId: false,
      rlsEnabled: true,
      rlsForced: true,
      policyCount: 8,
      beforePolicyCount: 8,
    }),
    /nullability/i,
    'The reviewed contract must reject evidence whose nullability field drifted.',
  )
})

test('R6-5 the shared uniqueness statement covers unique constraints as well as unique indexes', () => {
  const sql = MIGRATION_127_SCHEMA_EVIDENCE_SQL?.unique ?? ''
  assert.match(sql, /pg_index/, 'The uniqueness statement must inspect unique indexes.')
  assert.match(sql, /pg_constraint/, 'The uniqueness statement must inspect unique constraints.')
  assert.match(sql, /contype\s+IN\s*\(\s*'p'\s*,\s*'u'\s*\)/, 'The uniqueness statement must cover primary and unique constraints.')
  assert.match(sql, /indisunique/, 'The uniqueness statement must inspect unique indexes.')
  // A checkout_request_id uniqueness claim must never be reported as absent
  // merely because it arrived as a constraint rather than as an index.
  assert.doesNotMatch(sql, /count\(\*\)/, 'The uniqueness statement must answer with a boolean, not a count.')
})

test('R6-6 the producer measures the policy count before and after the upgrade with the same statement', () => {
  const source = producerSource()
  const body = extractNamedFunctionBody(source, 'export async function executeRecoveryProof(')
  const evidenceBody = extractNamedFunctionBody(source, 'export async function paymentHistorySchemaEvidence(')
  // The pre-migration policy count, measured on the clone before the upgrade.
  const beforePolicies = [...body.matchAll(/MIGRATION_127_SCHEMA_EVIDENCE_SQL\.policies/g)]
  assert.equal(
    beforePolicies.length,
    1,
    `The producer must measure the pre-migration policy count with the shared statement (found ${beforePolicies.length}).`,
  )
  // The post-migration policy count, measured by the shared evidence function.
  const afterPolicies = [...evidenceBody.matchAll(/MIGRATION_127_SCHEMA_EVIDENCE_SQL\.policies/g)]
  assert.equal(
    afterPolicies.length,
    1,
    `The producer must measure the post-migration policy count with the shared statement (found ${afterPolicies.length}).`,
  )
  for (const [name, text] of [['execute', body], ['evidence', evidenceBody]]) {
    assert.doesNotMatch(
      text,
      /FROM pg_policy\b/,
      `The producer must not count policies through a second, different catalog statement in the ${name} path.`,
    )
  }
})

// --- R7: two more defects the field executions exposed ----------------------
//
// The second field execution failed closed on an assertion between the
// migration and the customer-preservation check. Two distinct defects were
// behind it, and a third would have followed immediately afterwards.

// R7-1: `pg_index` has no `indispartial` column. The partial-index indicator
// is `indpred IS NOT NULL`. Both the producer and the promotion controller
// carried the broken spelling, so the shared statement inherited it: the
// promotion path would have raised PostgreSQL 42703 *after* migration 127
// had already been applied to the live customer database.
test('R7-1 the shared index statement reads the partial-index indicator correctly', () => {
  const sql = MIGRATION_127_SCHEMA_EVIDENCE_SQL?.indexes ?? ''
  assert.doesNotMatch(
    sql,
    /indispartial/,
    'pg_index has no indispartial column; PostgreSQL raises 42703 for it.',
  )
  assert.match(
    sql,
    /indpred\s+IS\s+NOT\s+NULL/,
    'The partial-index indicator must be read as the presence of an index predicate.',
  )
})

// R7-2: the migration ledger is designed to change, so it cannot also be
// part of the unchanged-customer-tables set. The ledger transition is
// verified separately and must stay that way.
test('R7-2 the customer-table fingerprint excludes the migration ledger, and the ledger stays verified separately', () => {
  const source = producerSource()
  const body = extractNamedFunctionBody(source, 'export async function executeRecoveryProof(')
  const catalogFilter = body.match(/catalog\.filter\([^)]*\)/)
  assert.ok(catalogFilter, 'The producer must select its customer-table catalog explicitly.')
  assert.match(
    catalogFilter[0],
    /payment_history/,
    'The customer-table catalog must exclude payment_history, which the migration rewrites.',
  )
  assert.match(
    catalogFilter[0],
    /schema_migrations/,
    'The customer-table catalog must exclude the migration ledger, which the migration is designed to advance.',
  )
  // Excluding the ledger from the customer fingerprint must not remove the
  // ledger evidence: the transition is checked against the source registry.
  assert.match(
    body,
    /assertWorkingTreeLedgerTransition\(\{/,
    'The producer must still assert the migration-ledger transition.',
  )
  assert.match(
    body,
    /beforeLedger[\s\S]*?afterLedger/,
    'The producer must still compare the pre-migration and post-migration ledgers.',
  )
  assert.match(
    body,
    /checked\('clone-ledger-131'\)/,
    'The producer must still record the pre-migration ledger check.',
  )
  assert.match(
    body,
    /checked\('post-transition-ledger-132'\)/,
    'The producer must still record the post-migration ledger check.',
  )
})

// R7-3: the column evidence is compared with an order-sensitive deepEqual
// against the reviewed proof contract, so the statement's row order is part
// of the contract. Ordering by name yields
// checkout_request_id, last_reconcile_attempt_at, phone_number, while the
// contract — and the migration's own ADD COLUMN declaration order — expect
// checkout_request_id, phone_number, last_reconcile_attempt_at.
test('R7-3 the column evidence order is the table declaration order, which the contract and the migration share', () => {
  assert.match(
    MIGRATION_127_SCHEMA_EVIDENCE_SQL?.columns ?? '',
    /ORDER BY ordinal_position/,
    'The shared column statement must return the columns in the table declaration order.',
  )
  const migration = readFileSync(
    path.join(REPOSITORY_ROOT, 'src', 'lib', 'db', 'migrations', `${MIGRATION_127}.sql`),
    'utf8',
  )
  const declared = [...migration.matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/g)]
    .map(match => match[1])
  assert.deepEqual(
    declared,
    [...MIGRATION_127_PAYMENT_COLUMNS],
    'The migration must declare exactly the migration-127 payment columns.',
  )
  assert.deepEqual(
    [...WORKING_TREE_RECOVERY_PROOF_PAYMENT_HISTORY_COLUMNS].map(column => column.name),
    declared,
    'The reviewed proof contract must list the migration-127 columns in the order the migration declares them.',
  )
})

// R7-4: the uniqueness claim is a measured boolean, not a count compared
// with an arithmetic operator. A count comparison would silently coerce a
// missing measurement to "no constraint".
test('R7-4 the producer carries the measured uniqueness claim as a boolean', () => {
  const source = producerSource()
  const body = extractNamedFunctionBody(source, 'export async function executeRecoveryProof(')
  assert.match(
    body,
    /uniqueCheckoutRequestIdConstraint:\s*state\.paymentSchema\.uniqueCheckoutRequestId\s*,/,
    'The proof must carry the measured uniqueness boolean directly.',
  )
  assert.doesNotMatch(
    body,
    /uniqueCheckoutRequestIdConstraint:[^\n]*>\s*0/,
    'The proof must not derive the uniqueness claim by comparing a count with zero.',
  )
})

/**
 * Removes single-quoted SQL literals so a column named inside a string (for
 * example a jsonb key subtraction) is not mistaken for a bare identifier.
 */
function stripQuotedLiterals(source) {
  return source.replace(/'(?:[^']|'')*'/g, "''")
}

// R7-5: the promotion path measures its baseline on the live customer
// database BEFORE migration 127 runs, so its baseline predicates must not
// name the columns migration 127 adds. The producer got this wrong and the
// promotion path has the same shape.
test('R7-5 the promotion baseline is schema-portable and the after-measurement is post-migration', () => {
  const source = promoterSource()
  const baselineBody = stripQuotedLiterals(
    extractNamedFunctionBody(source, 'async function paymentHistoryBaseline('),
  )
  for (const column of MIGRATION_127_PAYMENT_COLUMNS) {
    assert.equal(
      new RegExp(`\\b${column}\\b`).test(baselineBody),
      false,
      `The promotion baseline must not reference ${column} as a bare identifier; `
      + 'it is measured on the live database before migration 127 creates it.',
    )
  }
  const afterBody = stripQuotedLiterals(
    extractNamedFunctionBody(source, 'async function paymentHistoryAfter('),
  )
  assert.match(
    afterBody,
    /checkout_request_id\s+IS\s+NOT\s+NULL/,
    'The promotion after-measurement must read the migration-127 column.',
  )
  assert.match(
    afterBody,
    /phone_number\s+IS\s+NOT\s+NULL/,
    'The promotion after-measurement must read the migration-127 column.',
  )
})

// R7-6: the promotion path measures the RLS state and the policy count
// before and after the upgrade. Both sides must use the same definitions as
// the shared statements, or the "policy count must remain unchanged"
// assertion compares two different populations.
test('R7-6 the promotion baseline measures RLS and policies with the shared definitions', () => {
  const normalize = text => text.replace(/\s+/g, ' ').trim()
  const baselineBody = normalize(extractNamedFunctionBody(promoterSource(), 'async function paymentHistoryBaseline('))
  for (const key of ['rls', 'policies']) {
    const shared = normalize(MIGRATION_127_SCHEMA_EVIDENCE_SQL?.[key] ?? '')
    assert.ok(shared.length > 0, `The shared ${key} statement must not be empty.`)
    assert.ok(
      baselineBody.includes(shared),
      `The promotion baseline must measure ${key} with the shared definition; `
      + 'a second, separately edited statement is how the producer and the controller drifted apart.',
    )
  }
})

// --- R8: the audit trail is expected to change ------------------------------
//
// Migration 005 attaches `audit_payment_history`, a FOR EACH ROW trigger on
// payment_history, to `audit_trigger_func()`, which inserts one audit_logs
// row per updated row. Migration 127 updates payment_history, so the audit
// trail is *designed* to grow by one row per migrated row. The customer-table
// fingerprint therefore cannot include audit_logs unchanged — and the
// exclusion must not simply discard the evidence: the exact delta is
// predictable and is asserted instead.
test('R8-1 the customer-table fingerprint excludes the audit trail', () => {
  const source = producerSource()
  const body = extractNamedFunctionBody(source, 'export async function executeRecoveryProof(')
  const catalogFilter = body.match(/catalog\.filter\([^)]*\)/)
  assert.ok(catalogFilter, 'The producer must select its customer-table catalog explicitly.')
  assert.match(
    catalogFilter[0],
    /audit_logs/,
    'The customer-table catalog must exclude the audit trail, which the migration trigger is designed to extend.',
  )
})

test('R8-2 the producer asserts the exact audit-trail delta', () => {
  const source = producerSource()
  const body = extractNamedFunctionBody(source, 'export async function executeRecoveryProof(')
  assert.match(
    body,
    /expectedAuditRows\s*=\s*paymentBaseline\.checkout\.count\s*\+\s*paymentBaseline\.phone\.count/,
    'The expected audit-trail rows must be derived from the measured checkout and phone eligible counts.',
  )
  assert.match(
    body,
    /auditRowsAfter\s*-\s*auditRowsBefore\s*,\s*expectedAuditRows/,
    'The producer must assert that the audit trail grew by exactly the number of migrated rows.',
  )
  assert.match(
    body,
    /FROM public\.audit_logs/,
    'The producer must measure the audit-trail row count on the clone.',
  )
})

test('R8-3 the proof document gate requires the audit-trail reconciliation to balance', () => {
  const source = readFileSync(CONTRACTS_PATH, 'utf8')
  const body = extractNamedFunctionBody(source, 'export function assertWorkingTreeRecoveryProofDocument(')
  assert.match(
    body,
    /proof\.preservation\.auditTrail/,
    'The proof document gate must require the audit-trail evidence.',
  )
  assert.match(
    body,
    /rowsAfter\s*-\s*proof\.preservation\.auditTrail\.rowsBefore/,
    'The proof document gate must reconcile the observed audit-trail delta.',
  )
  assert.match(
    body,
    /auditTrail\.expectedRows/,
    'The proof document gate must compare the observed delta with the expected row count.',
  )
})

// --- R9: the final hardening round ------------------------------------------
//
// The independent review of the round-5 fix found no critical or important
// defect in the migration itself, but four coverage gaps in the proof. Each
// is a way in which a *passing* proof could carry less evidence than it
// appears to, so each is closed here.
test('R9-1 the ineligible-row digest distinguishes a NULL transaction id from an empty one', () => {
  const sql = recoveryProducer.RECOVERY_ELIGIBLE_OTHER_DIGEST_SQL ?? ''
  assert.match(
    sql,
    /CASE\s+WHEN\s+transaction_id\s+IS\s+NULL\s+THEN\s+'N'\s+ELSE\s+'V'/,
    'The ineligible-row digest must distinguish a NULL transaction id from an empty string; '
    + 'coalescing both to the empty string hides a NULL-to-empty rewrite.',
  )
  assert.doesNotMatch(
    sql,
    /coalesce\s*\(\s*transaction_id\s*,\s*''\s*\)/,
    'The ineligible-row digest must not coalesce a NULL transaction id into the empty string.',
  )
})

test('R9-2 the producer detects a backfill that reaches rows outside the eligible set', () => {
  const source = producerSource()
  const body = extractNamedFunctionBody(source, 'async function paymentHistoryAfter(')
  assert.match(
    body,
    /checkout_request_id IS NOT NULL/,
    'The after-measurement must count every row that carries a backfilled checkout identity.',
  )
  assert.match(
    body,
    /phone_number IS NOT NULL/,
    'The after-measurement must count every row that carries a backfilled phone number.',
  )
  const after = extractNamedFunctionBody(source, 'export async function executeRecoveryProof(')
  assert.match(
    after,
    /globalBackfill\.checkout\s*,\s*paymentBaseline\.checkout\.count/,
    'The producer must reconcile the global checkout backfill count with the pre-migration eligible count.',
  )
  assert.match(
    after,
    /globalBackfill\.phone\s*,\s*paymentBaseline\.phone\.count/,
    'The producer must reconcile the global phone backfill count with the pre-migration eligible count.',
  )
})

test('R9-3 the producer refuses a vacuous proof and measures the baseline duplicate groups', () => {
  const source = producerSource()
  const body = extractNamedFunctionBody(source, 'export async function executeRecoveryProof(')
  assert.match(
    body,
    /paymentBaseline\.checkout\.count\s*>\s*0/,
    'The producer must require that the checkout backfill was actually exercised; '
    + 'a proof in which every reconciliation is satisfied by 0 === 0 carries no evidence.',
  )
  assert.doesNotMatch(
    body,
    /duplicateCheckoutIdentityGroupsBefore:\s*0\s*,/,
    'The producer must measure the pre-migration duplicate groups instead of asserting zero.',
  )
  assert.match(
    body,
    /duplicateCheckoutIdentityGroupsBefore:\s*state\.paymentBaseline\.duplicateGroups\.groups\s*,/,
    'The proof must carry the measured pre-migration duplicate-group count.',
  )
})

test('R9-4 the proof document gate reconciles the backfill counts', () => {
  const source = readFileSync(CONTRACTS_PATH, 'utf8')
  const body = extractNamedFunctionBody(source, 'export function assertWorkingTreeRecoveryProofDocument(')
  for (const [before, after] of [
    ['checkoutEligibleRowsBefore', 'checkoutBackfilledRowsAfter'],
    ['phoneEligibleRowsBefore', 'phoneBackfilledRowsAfter'],
    ['checkoutDistinctEligibleIdentitiesBefore', 'checkoutDistinctBackfilledIdentitiesAfter'],
  ]) {
    assert.match(
      body,
      new RegExp(`proof\\.preservation\\.${before}[\\s\\S]{0,120}proof\\.preservation\\.${after}`),
      `The proof document gate must reconcile ${before} with ${after}.`,
    )
  }
  assert.match(
    body,
    /duplicateCheckoutIdentityGroupsBefore/,
    'The proof document gate must require the measured pre-migration duplicate-group count.',
  )
})

test('R9-5 the producer advances the failure phase through the upgrade and preservation stages', () => {
  const source = producerSource()
  assert.match(
    source,
    /state\.phase = 'upgrade'/,
    'The producer must label the migration-127 upgrade stage.',
  )
  assert.match(
    source,
    /state\.phase = 'preservation'/,
    'The producer must label the customer-preservation stage.',
  )
})

test('R9-6 the promotion path reads the migration-127 row sets through the shared statements', () => {
  const baselineBody = extractNamedFunctionBody(promoterSource(), 'async function paymentHistoryBaseline(')
  for (const key of ['checkoutEligible', 'phoneEligible', 'otherDigest']) {
    assert.match(
      baselineBody,
      new RegExp(`MIGRATION_127_ROW_SET_SQL\\.${key}`),
      `The promotion baseline must read the ${key} row set through the shared statement; `
      + 'a second, separately edited predicate is how the producer and the controller drifted apart.',
    )
  }
  assert.doesNotMatch(
    baselineBody,
    /\^ws_CO_/,
    'The promotion baseline must not carry its own copy of the checkout-eligibility predicate.',
  )
  assert.doesNotMatch(
    baselineBody,
    /\^254\[17\]/,
    'The promotion baseline must not carry its own copy of the phone-eligibility predicate.',
  )
})

test('R9-7 the promotion path verifies that the ineligible transaction ids did not change', () => {
  const afterBody = extractNamedFunctionBody(promoterSource(), 'async function paymentHistoryAfter(')
  assert.match(
    afterBody,
    /MIGRATION_127_ROW_SET_SQL\.otherDigest/,
    'The promotion after-measurement must read the ineligible-row digest through the shared statement.',
  )
  assert.match(
    afterBody,
    /baseline\.checkoutEligibleIds/,
    'The promotion after-measurement must exclude exactly the pre-migration eligible rows.',
  )
  const promotionBody = extractNamedFunctionBody(promoterSource(), 'async function promote(')
  assert.match(
    promotionBody,
    /after\.ineligibleDigest\s*,\s*before\.ineligibleDigest/,
    'The promotion path must compare the ineligible-row digest before and after the migration.',
  )
})

// --- R10: the Windows spawn defect ----------------------------------------
//
// The promotion path had never been executed, and its very first step — the
// read-only `npm run docker:verify` — failed with a bare EINVAL on Windows.
// The cause: modern Node refuses to spawn a `.cmd` batch file without a
// shell, and `npm` on Windows is exactly that. The failure was silent about
// the cause because the diagnostics are suppressed.
test('R10-1 the promotion runtime verification runs the docker:verify script without a shell', () => {
  const command = promotionController.runtimeVerificationCommand(REPOSITORY_ROOT)
  assert.equal(
    command.binary,
    process.execPath,
    'The runtime verification must be invoked through the current Node executable, not a batch file.',
  )
  assert.ok(
    !/\.(cmd|bat)$/i.test(command.binary),
    'The runtime verification must not spawn a Windows batch file.',
  )
  assert.match(
    command.args[0],
    /scripts[\\/]verify-production-runtime\.mjs$/,
    'The runtime verification must invoke the docker:verify script directly.',
  )
  const packageJson = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'))
  assert.equal(
    packageJson.scripts['docker:verify'],
    'node scripts/verify-production-runtime.mjs',
    'The direct invocation must stay equivalent to the npm script; if the npm script changes, both must change.',
  )
})

test('R10-2 a Windows batch binary is rejected with an actionable message', () => {
  assert.throws(
    () => promotionController.assertSpawnableBinary('npm.cmd', 'win32'),
    /batch binaries cannot be spawned without a shell/,
    'A batch binary must be rejected with an actionable message instead of failing with a bare EINVAL.',
  )
  assert.doesNotThrow(
    () => promotionController.assertSpawnableBinary('docker', 'win32'),
    'A real executable must remain spawnable on Windows.',
  )
  assert.doesNotThrow(
    () => promotionController.assertSpawnableBinary('npm.cmd', 'linux'),
    'A batch binary is a normal executable name on POSIX.',
  )
})

test('R10-3 no release-path script spawns a Windows batch file', () => {
  for (const file of [
    'scripts/promote-production-candidate.mjs',
    'scripts/verify-working-tree-recovery.mjs',
    'scripts/build-production-candidate.mjs',
    'scripts/verify-production-runtime.mjs',
  ]) {
    const source = readFileSync(path.join(REPOSITORY_ROOT, ...file.split('/')), 'utf8')
    assert.doesNotMatch(
      source,
      /npm\.cmd/,
      `${file} must not spawn npm.cmd; modern Node cannot spawn a batch file without a shell.`,
    )
    assert.doesNotMatch(
      source,
      /spawnSync\(\s*['"][^'"]+\.(cmd|bat)['"]/i,
      `${file} must not spawn a batch file directly.`,
    )
  }
})

// --- R11: close the three live-path evidence gaps ---------------------------
//
// The independent review of rounds 8-10 returned PASS with three Minor
// findings, all on the LIVE promotion path rather than the rehearsed clone:
// the live gate verified backfill COUNTS but not backfill VALUES, it never
// measured the audit-trail delta that the rehearsal reconciles, and the
// receipt recorded a command string that was never executed.
test('R11-1 the shared statement set carries the per-row identity and phone-value digests', () => {
  const sql = MIGRATION_127_ROW_SET_SQL
  assert.ok(sql, 'The shared row-set statement set must be exported.')
  for (const key of ['eligibleIdentityDigest', 'rewrittenIdentityDigest', 'phoneValueDigest']) {
    assert.ok(
      typeof sql[key] === 'string' && sql[key].length > 0,
      `The shared statement set must carry ${key}.`,
    )
  }
  assert.match(
    sql.eligibleIdentityDigest,
    /id::text \|\| ':' \|\| transaction_id/,
    'The eligible identity digest must hash the per-row pre-migration transaction id.',
  )
  assert.match(
    sql.rewrittenIdentityDigest,
    /id::text \|\| ':' \|\| checkout_request_id/,
    'The rewritten identity digest must hash the per-row post-migration checkout identity.',
  )
  assert.match(
    sql.phoneValueDigest,
    /phone_number = metadata->>'phoneNumber'/,
    'The phone value digest must assert the per-row phone equality.',
  )
  for (const key of ['eligibleIdentityDigest', 'rewrittenIdentityDigest', 'phoneValueDigest', 'otherDigest']) {
    assert.match(
      sql[key],
      /id::text = ANY\(\$1::text\[\]\)/,
      `The ${key} statement must exclude the eligible rows by id list.`,
    )
  }
})

test('R11-2 the producer reads the identity digests through the shared statements', () => {
  const source = producerSource()
  const baselineBody = extractNamedFunctionBody(source, 'async function paymentHistoryBaseline(')
  const afterBody = extractNamedFunctionBody(source, 'async function paymentHistoryAfter(')
  assert.match(
    baselineBody,
    /MIGRATION_127_ROW_SET_SQL\.eligibleIdentityDigest/,
    'The producer baseline must read the eligible identity digest through the shared statement.',
  )
  assert.match(
    afterBody,
    /MIGRATION_127_ROW_SET_SQL\.rewrittenIdentityDigest/,
    'The producer after-measurement must read the rewritten identity digest through the shared statement.',
  )
  assert.doesNotMatch(
    baselineBody,
    /string_agg\(md5\(id::text \|\| ':' \|\| transaction_id\)/,
    'The producer must not carry its own copy of the eligible identity digest.',
  )
  assert.doesNotMatch(
    afterBody,
    /string_agg\(md5\(id::text \|\| ':' \|\| checkout_request_id\)/,
    'The producer must not carry its own copy of the rewritten identity digest.',
  )
})

test('R11-3 the promotion path verifies the backfill VALUES, not only the counts', () => {
  const baselineBody = extractNamedFunctionBody(promoterSource(), 'async function paymentHistoryBaseline(')
  const afterBody = extractNamedFunctionBody(promoterSource(), 'async function paymentHistoryAfter(')
  assert.match(
    baselineBody,
    /MIGRATION_127_ROW_SET_SQL\.eligibleIdentityDigest/,
    'The promotion baseline must read the eligible identity digest through the shared statement.',
  )
  assert.match(
    afterBody,
    /MIGRATION_127_ROW_SET_SQL\.rewrittenIdentityDigest/,
    'The promotion after-measurement must read the rewritten identity digest through the shared statement.',
  )
  assert.match(
    afterBody,
    /MIGRATION_127_ROW_SET_SQL\.phoneValueDigest/,
    'The promotion after-measurement must read the per-row phone value through the shared statement.',
  )
  const promotionBody = extractNamedFunctionBody(promoterSource(), 'async function promote(')
  assert.match(
    promotionBody,
    /after\.checkoutIdentityDigest\s*,\s*before\.checkoutIdentityDigest/,
    'The promotion path must compare the per-row checkout identity across the migration.',
  )
  assert.match(
    promotionBody,
    /after\.phoneIdentityDigest\s*,\s*before\.phoneIdentityDigest/,
    'The promotion path must compare the per-row phone identity across the migration.',
  )
})

test('R11-4 the promotion path reconciles the live audit-trail delta', () => {
  const baselineBody = extractNamedFunctionBody(promoterSource(), 'async function paymentHistoryBaseline(')
  const afterBody = extractNamedFunctionBody(promoterSource(), 'async function paymentHistoryAfter(')
  assert.match(
    baselineBody,
    /FROM public\.audit_logs/,
    'The promotion baseline must measure the audit-trail row count on the live database.',
  )
  assert.match(
    afterBody,
    /FROM public\.audit_logs/,
    'The promotion after-measurement must measure the audit-trail row count on the live database.',
  )
  const promotionBody = extractNamedFunctionBody(promoterSource(), 'async function promote(')
  assert.match(
    promotionBody,
    /after\.auditRowsAfter\s*-\s*before\.auditRowsBefore\s*,\s*expectedAuditRows/,
    'The promotion path must assert that the live audit trail grew by exactly one row per migrated row.',
  )
  assert.match(
    promotionBody,
    /expectedAuditRows\s*=\s*before\.checkoutEligibleRows\s*\+\s*before\.phoneEligibleRows/,
    'The expected audit-trail rows must be derived from the measured live eligible counts.',
  )
})

test('R11-5 the runtime-verification evidence records the command that actually ran', () => {
  const command = promotionController.runtimeVerificationCommand(REPOSITORY_ROOT)
  assert.equal(
    command.command,
    'node scripts/verify-production-runtime.mjs',
    'The evidence must record the command that was actually executed, not an npm alias that was never spawned.',
  )
  assert.equal(command.npmAlias, 'docker:verify', 'The npm alias must be recorded alongside it.')
  assert.doesNotMatch(
    command.command,
    /^npm\b/,
    'The recorded command must not claim npm was executed.',
  )
  assert.doesNotThrow(
    () => promotionController.assertDockerVerifyAlias(REPOSITORY_ROOT),
    'The npm alias must still resolve to the script that is actually run.',
  )
  const packageJson = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'))
  assert.equal(
    packageJson.scripts['docker:verify'],
    'node scripts/verify-production-runtime.mjs',
    'The npm alias must stay equivalent to the direct invocation.',
  )
})

test('R11-7 a JSON extraction inside a concatenation is parenthesized', () => {
  // PostgreSQL gives `||` and `->>` the same precedence and evaluates them
  // left to right, so `a || b->>'c'` parses as `(a || b)->>'c'`: the
  // concatenation resolves through `textcat` to **text**, and the extraction
  // then has no text operator — PostgreSQL raises "operator does not exist:
  // text ->> unknown". This was measured against the live database before it
  // reached a rehearsal. Every extraction that takes part in a concatenation
  // therefore has to be parenthesized.
  for (const [key, sql] of Object.entries(MIGRATION_127_ROW_SET_SQL)) {
    assert.doesNotMatch(
      sql,
      /\|\|\s*[^,()]*?->>/,
      `The ${key} statement concatenates an unparenthesized JSON extraction.`,
    )
  }
  assert.match(
    MIGRATION_127_ROW_SET_SQL.phoneSourceDigest,
    /\(metadata->>'phoneNumber'\)/,
    'The phone source digest must parenthesize the metadata extraction.',
  )
})

test('R11-6 a drifted npm alias fails closed instead of silently diverging', () => {
  assert.throws(
    () => promotionController.assertDockerVerifyAlias(REPOSITORY_ROOT, {
      'docker:verify': 'node scripts/something-else.mjs',
    }),
    /docker:verify/,
    'A re-pointed docker:verify alias must fail closed with an actionable message.',
  )
  assert.doesNotThrow(
    () => promotionController.assertDockerVerifyAlias(REPOSITORY_ROOT, {
      'docker:verify': 'node scripts/verify-production-runtime.mjs',
    }),
    'The unchanged alias must remain admissible.',
  )
  assert.throws(
    () => promotionController.assertDockerVerifyAlias(REPOSITORY_ROOT, {
      'docker:verify': 'node scripts/verify-production-runtime.mjs --changed',
    }),
    /docker:verify/,
    'An alias that carries extra arguments must fail closed as well.',
  )
})

