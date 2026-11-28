// Release-scoped working-tree recovery proof contracts.
//
// Pure module: no Docker, no PostgreSQL, no network, no payment provider and
// no customer data. The legacy admission gate in scripts/working-tree-release.mjs
// is imported unchanged and stays authoritative; this module only adds a
// strict, source-bound gate on top of it.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import {
  WORKING_TREE_MIGRATION_BASELINE_COUNT,
  WORKING_TREE_MIGRATION_TARGET_COUNT,
  WORKING_TREE_MIGRATION_VERSION,
  assertWorkingTreeRecoveryProof,
  workingTreeRecoveryProofPath,
} from './working-tree-release.mjs'

export const WORKING_TREE_RECOVERY_PROOF_SCHEMA_VERSION = 1
export const WORKING_TREE_RECOVERY_PROOF_KIND = 'working-tree-release-scoped-recovery-proof'
export const WORKING_TREE_RECOVERY_PROOF_AUTHORIZATION_SCOPE = 'customer-clone-and-named-backup-restore'

/**
 * The reviewed executable closure of the release-scoped producer. Every file is
 * hashed into the proof, so a changed producer invalidates the evidence.
 */
export const WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES = Object.freeze([
  'scripts/verify-working-tree-recovery.mjs',
  'scripts/working-tree-recovery-proof.mjs',
  'scripts/working-tree-release.mjs',
  'scripts/rehearsal-database.mjs',
  'scripts/verify-migrations.mjs',
  'scripts/provision-runtime-db-role.mjs',
  'scripts/migrate-unified.mjs',
  'scripts/verify-organization-project-rls.mjs',
  'scripts/recovery-archive-manifest.py',
])

/**
 * Every mandatory check must be present and passed. A proof missing one is
 * rejected even when every present check passed.
 */
export const WORKING_TREE_RECOVERY_PROOF_CHECKS = Object.freeze([
  'source-registry-132',
  'clone-ledger-131',
  'pending-migration-127',
  'post-transition-ledger-132',
  'historical-checksums-preserved',
  'backup-archive-integrity',
  'database-archive-restored',
  'uploads-archive-restored',
  'customer-tables-unchanged',
  'payment-history-preserved',
  'runtime-role-restricted',
  'rls-organization-project-verified',
  'cleanup-complete',
])

/**
 * Serialized-proof content that must never exist in admissible evidence.
 * Regular-expression sources only: the proof itself never carries the values.
 */
export const WORKING_TREE_RECOVERY_PROOF_FORBIDDEN = Object.freeze([
  'postgresql://',
  'PGPASSWORD',
  'password=',
  'Bearer ',
  'sk_live',
  'AKIA',
  'metardu-postgres',
  '127\\.0\\.0\\.1:5432',
  'db_\\d{8}_\\d{6}\\.sql\\.gz',
  'uploads_\\d{8}_\\d{6}\\.tar\\.gz',
  'METARDU_BUILD_SHA',
  'AUTH_SECRET',
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  'metardu_recovery_app_[0-9a-f]{32}',
  '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}',
])

export const WORKING_TREE_RECOVERY_PROOF_PAYMENT_HISTORY_COLUMNS = Object.freeze([
  Object.freeze({ name: 'checkout_request_id', dataType: 'character varying', maximumLength: 255, isNullable: 'YES' }),
  Object.freeze({ name: 'phone_number', dataType: 'character varying', maximumLength: 20, isNullable: 'YES' }),
  Object.freeze({ name: 'last_reconcile_attempt_at', dataType: 'timestamp with time zone', maximumLength: null, isNullable: 'YES' }),
])

export const WORKING_TREE_RECOVERY_PROOF_PAYMENT_HISTORY_INDEXES = Object.freeze([
  'idx_payment_history_mpesa_checkout_request_id',
  'idx_payment_history_mpesa_pending_checkout',
  'idx_payment_history_mpesa_pending_reconcile_attempt',
])

/**
 * The statements that measure the migration-127 schema contract on a
 * PostgreSQL catalog.
 *
 * Both the recovery producer and the promotion controller read the evidence
 * through these exact statements, so the two release paths cannot drift. The
 * producer and the controller previously carried their own copies, and the
 * producer's copy projected the raw catalog boolean (`notNull`) while the
 * reviewed contract requires `isNullable`; the second field execution of the
 * producer failed closed on exactly that mismatch. One shared statement set
 * removes the duplication that allowed the drift.
 *
 * The statements are pure text: this module never opens a database.
 */
export const MIGRATION_127_SCHEMA_EVIDENCE_SQL = Object.freeze({
  columns: `SELECT
      column_name AS name,
      data_type AS "dataType",
      character_maximum_length AS "maximumLength",
      is_nullable AS "isNullable"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_history'
      AND column_name IN ('checkout_request_id', 'phone_number', 'last_reconcile_attempt_at')
    ORDER BY ordinal_position`,
  indexes: `SELECT index_class.relname AS name, index_metadata.indpred IS NOT NULL AS partial
    FROM pg_index index_metadata
    JOIN pg_class index_class ON index_class.oid = index_metadata.indexrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    WHERE index_metadata.indrelid = 'public.payment_history'::regclass
      AND index_namespace.nspname = 'public'
      AND index_class.relname IN (
        'idx_payment_history_mpesa_checkout_request_id',
        'idx_payment_history_mpesa_pending_checkout',
        'idx_payment_history_mpesa_pending_reconcile_attempt'
      )
    ORDER BY index_class.relname`,
  // A checkout_request_id uniqueness claim must be detected whether it
  // arrives as a unique index or as a primary/unique constraint.
  unique: `SELECT EXISTS (
      SELECT 1
      FROM pg_index index_metadata
      JOIN pg_attribute attribute
        ON attribute.attrelid = index_metadata.indrelid
       AND attribute.attnum = ANY(index_metadata.indkey::smallint[])
      WHERE index_metadata.indrelid = 'public.payment_history'::regclass
        AND index_metadata.indisunique
        AND attribute.attname = 'checkout_request_id'
    ) OR EXISTS (
      SELECT 1
      FROM pg_constraint constraint_metadata
      JOIN pg_attribute attribute
        ON attribute.attrelid = constraint_metadata.conrelid
       AND attribute.attnum = ANY(constraint_metadata.conkey)
      WHERE constraint_metadata.conrelid = 'public.payment_history'::regclass
        AND constraint_metadata.contype IN ('p', 'u')
        AND attribute.attname = 'checkout_request_id'
    ) AS "uniqueCheckoutRequestId"`,
  rls: `SELECT relation.relrowsecurity AS "rlsEnabled", relation.relforcerowsecurity AS "rlsForced"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = 'payment_history'`,
  policies: `SELECT count(*)::integer AS count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_history'`,
})

/**
 * The row-set predicates migration 127 rewrites, and the digest of every row
 * it does not.
 *
 * Both the recovery producer and the promotion controller read the row sets
 * through these exact predicates, so the two release paths cannot drift. The
 * producer and the controller previously carried their own copies, and the
 * producer's copy named the migration-127 columns as bare identifiers; the
 * first field execution of the producer failed closed on exactly that 42703.
 * One shared statement set removes the duplication that allowed the drift.
 *
 * The predicates read the migration-127 columns through `to_jsonb(...)`, where
 * a missing key is simply NULL. That makes the same text valid on the
 * 131-migration schema (where the columns do not exist yet) and on the
 * 132-migration schema (where they exist but are not yet backfilled), so the
 * pre-migration baseline and the migration's own WHERE clauses select exactly
 * the same rows.
 *
 * The statements are pure text: this module never opens a database.
 */
export const MIGRATION_127_ROW_SET_SQL = Object.freeze({
  checkoutEligible: `payment_method = 'mpesa'
    AND status IN ('pending', 'processing', 'pending_review')
    AND to_jsonb(t)->>'checkout_request_id' IS NULL
    AND transaction_id ~ '^ws_CO_[A-Za-z0-9]+$'`,
  phoneEligible: `payment_method = 'mpesa'
    AND to_jsonb(t)->>'phone_number' IS NULL
    AND metadata IS NOT NULL
    AND metadata->>'phoneNumber' ~ '^254[17][0-9]{8}$'`,
  // The per-row digests of the identities migration 127 moves.
  //
  // A count alone cannot tell "the right rows backfilled correctly" from "the
  // right number of rows backfilled with the wrong values", so the promotion
  // path and the clone rehearsal both prove the backfill by VALUE: the digest
  // of the eligible rows before the migration has to equal the digest of the
  // same rows afterwards.
  //
  // The row set is addressed by the eligible **id list** in both directions,
  // so the two digests cover exactly the same rows. `eligibleIdentityDigest`
  // is measured before the migration and reads the transaction id that is
  // about to move; `rewrittenIdentityDigest` is measured afterwards and
  // requires the transaction id to have been cleared, so a row the migration
  // did not fully rewrite drops out of the digest instead of matching it.
  //
  // The phase-specific statements name the migration-127 columns directly,
  // because they are only ever executed in the phase where those columns
  // exist: the producer asserts that schema boundary before and after, and
  // the promotion controller measures the baseline before the migration and
  // the after-state after it.
  eligibleIdentityDigest: `SELECT count(*)::integer AS count,
      count(DISTINCT transaction_id)::integer AS identities,
      md5(COALESCE(string_agg(md5(id::text || ':' || transaction_id),'' ORDER BY id::text),'')) AS digest
    FROM public.payment_history t WHERE id::text = ANY($1::text[])`,
  rewrittenIdentityDigest: `SELECT count(*)::integer AS count,
      count(DISTINCT checkout_request_id)::integer AS identities,
      md5(COALESCE(string_agg(md5(id::text || ':' || checkout_request_id),'' ORDER BY id::text),'')) AS digest
    FROM public.payment_history t
    WHERE id::text = ANY($1::text[])
      AND transaction_id IS NULL
      AND checkout_request_id IS NOT NULL`,
  // The phone value the migration copies out of the metadata compatibility
  // bridge, before the migration, and the value it wrote into the dedicated
  // column, afterwards. The two digests have to be equal.
  //
  // The JSON extraction is parenthesized. PostgreSQL gives `||` and `->>` the
  // same precedence and evaluates them left to right, so the unparenthesized
  // form `id::text || ':' || metadata->>'phoneNumber'` parses as
  // `(id::text || ':' || metadata) ->> 'phoneNumber'`: the concatenation
  // resolves through `textcat` to **text**, and the extraction then has no
  // text operator — PostgreSQL raises "operator does not exist: text ->>
  // unknown". The parenthesized form extracts from the jsonb value first.
  phoneSourceDigest: `SELECT count(*)::integer AS count,
      md5(COALESCE(string_agg(md5(id::text || ':' || (metadata->>'phoneNumber')),'' ORDER BY id::text),'')) AS digest
    FROM public.payment_history t WHERE id::text = ANY($1::text[])`,
  phoneValueDigest: `SELECT count(*)::integer AS count,
      md5(COALESCE(string_agg(md5(id::text || ':' || phone_number),'' ORDER BY id::text),'')) AS digest
    FROM public.payment_history t
    WHERE id::text = ANY($1::text[])
      AND phone_number IS NOT NULL
      AND phone_number = metadata->>'phoneNumber'`,
  // The digest of every payment_history row that is NOT eligible for the
  // migration-127 rewrite.
  //
  // The row set is defined by excluding the eligible **id list**, not by
  // re-evaluating the eligibility predicate. The predicate is three-valued: a
  // row whose transaction_id is NULL makes the match unknown, and `NOT unknown`
  // is unknown rather than true, so such a row would be silently dropped from
  // the set — the pre-migration and post-migration digests would then cover
  // different rows and the comparison would be meaningless. The id exclusion is
  // well defined because `id` is the NOT NULL primary key, and the post-
  // migration measurement uses the identical form.
  //
  // The digest distinguishes a NULL transaction id from an empty one. Coalescing
  // both into the empty string would hide a NULL-to-empty rewrite of an
  // ineligible row, which is exactly the kind of change this digest exists to
  // detect.
  otherDigest: `SELECT md5(COALESCE(string_agg(md5(id::text || ':' || CASE WHEN transaction_id IS NULL THEN 'N' ELSE 'V' || transaction_id END),'' ORDER BY id::text),'')) AS digest
    FROM public.payment_history t WHERE NOT (id::text = ANY($1::text[]))`,
})

/**
 * Pinned registry digests of the exact candidate migration source. The values
 * are deliberately not derived at runtime: a changed, added, removed or
 * renamed migration file must fail closed instead of being accepted silently.
 */
export const WORKING_TREE_RECOVERY_PROOF_SOURCE_REGISTRY_SHA256 = '8ee203f13b9883c7ca5b9e117010eb332aa7ee6a068e5f17f80946884b19b9c1'
export const WORKING_TREE_RECOVERY_PROOF_HISTORICAL_REGISTRY_SHA256 = '6b82956a839b24333dd2fa0be20d253d6c3c8e3855d54439c3806851dee58ff7'
export const WORKING_TREE_RECOVERY_PROOF_MIGRATION_127_CHECKSUM = '8c3059a8e5f708b0d9b512fc3f9530b83fe4441828a7b9e47c6896dd8fc26ae0'

const BACKUP_PAIR_ID_DOMAIN = 'metardu-recovery-backup-pair-v1\0'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function assertSha256(value, label) {
  assert.match(value ?? '', /^[a-f0-9]{64}$/, `${label} must be exactly 64 lowercase hexadecimal characters.`)
}

function assertReleaseIdentity(value, label = 'Release identity') {
  assert.match(value ?? '', /^[a-f0-9]{40}$/, `${label} must be exactly 40 lowercase hexadecimal characters.`)
}

function assertPlainObject(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} is required.`)
}

function assertNonNegativeInteger(value, label) {
  assert.ok(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer.`)
}

/**
 * Git stores the reviewed text sources as LF blobs. A Windows checkout may
 * materialize them with CRLF, so every source digest is computed over
 * canonical LF text bytes.
 */
export function canonicalTextSha256(content) {
  assert.ok(
    typeof content === 'string' || Buffer.isBuffer(content) || content instanceof Uint8Array,
    'Canonical text content must be text bytes.',
  )
  const canonical = Buffer.from(content).toString('utf8').replace(/\r\n/g, '\n')
  return sha256(Buffer.from(canonical, 'utf8'))
}

/**
 * Hash an exact producer-source closure. A closure with a missing or an extra
 * file is rejected: the proof may only attest the reviewed closure.
 */
export function recoveryProofSourceHashesForFiles(files, contentsByPath) {
  assert.ok(Array.isArray(files) && files.length > 0, 'Recovery proof source files must be a non-empty array.')
  assertPlainObject(contentsByPath, 'Recovery proof source contents')
  const expected = [...files].sort()
  assert.deepEqual(Object.keys(contentsByPath).sort(), expected, 'Recovery proof source contents must cover exactly the reviewed closure.')
  const hashes = {}
  for (const file of files) {
    assert.ok(typeof file === 'string' && file.length > 0, 'Recovery proof source file names must be text.')
    hashes[file] = canonicalTextSha256(contentsByPath[file])
  }
  return hashes
}

export function workingTreeRecoveryProofArtifactPath(root, sourceSha256) {
  assert.ok(typeof root === 'string' && root.length > 0, 'The repository root is required.')
  assertSha256(sourceSha256, 'Working-tree source SHA-256')
  return workingTreeRecoveryProofPath(root, sourceSha256)
}

export function workingTreeRecoveryProofEvidenceDirectory(root, sourceSha256) {
  return path.dirname(workingTreeRecoveryProofArtifactPath(root, sourceSha256))
}

/**
 * The exact status line the producer writes as the final line of a successful
 * attempt transcript. A transcript without this exact line is not admissible.
 */
export const WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_STATUS = 'STATUS passed'

/**
 * The exact proof-binding marker the producer writes into the attempt
 * transcript once the proof artifact has been written. The marker names the
 * SHA-256 of the admitted proof bytes, so the transcript is bound to the
 * *content* of the proof it produced and not to an attempt ordinal.
 */
export const WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_PROOF = 'PROOF sha256'

/**
 * A candidate proof-binding line of an attempt transcript. The pattern is
 * deliberately tolerant about whitespace so a near-miss marker is *found* and
 * then rejected, rather than being silently ignored as "no proof line".
 */
const WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_PROOF_CANDIDATE = /^PROOF\s+sha256(?:\s+(\S*))?\s*$/

/**
 * The exact proof line of the attempt transcript for a given proof digest.
 * The digest must be exactly 64 lowercase hexadecimal characters, so a
 * near-miss marker can never be formatted by accident.
 */
export function workingTreeRecoveryProofTranscriptProofLine(proofSha256) {
  assertSha256(proofSha256, 'The recovery proof transcript digest')
  return `${WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_PROOF} ${proofSha256}`
}

/**
 * The single canonical serializer of the recovery proof document. It returns
 * the exact bytes that are written to the artifact, so the digest of the
 * artifact on disk is always the digest of these bytes.
 */
export function workingTreeRecoveryProofBytes(proof) {
  assertPlainObject(proof, 'The recovery proof document')
  return Buffer.from(`${JSON.stringify(proof, null, 2)}\n`, 'utf8')
}

/**
 * The SHA-256 of the canonical recovery proof bytes.
 */
export function workingTreeRecoveryProofSha256(proof) {
  return sha256(workingTreeRecoveryProofBytes(proof))
}

export function workingTreeRecoveryProofLogPath(evidenceDirectory, attempt) {
  assert.ok(typeof evidenceDirectory === 'string' && path.isAbsolute(evidenceDirectory), 'Recovery proof evidence requires an absolute directory.')
  assert.ok(Number.isInteger(attempt) && attempt >= 1, 'Recovery proof attempt numbers start at 1.')
  return path.join(evidenceDirectory, `rehearsal-${attempt}.log`)
}

/**
 * Every producer attempt transcript present in the release-scoped evidence
 * directory, in ascending attempt order.
 */
export function workingTreeRecoveryProofAttemptLogs(evidenceDirectory) {
  assert.ok(typeof evidenceDirectory === 'string' && path.isAbsolute(evidenceDirectory), 'Recovery proof evidence requires an absolute directory.')
  if (!existsSync(evidenceDirectory)) return []
  return readdirSync(evidenceDirectory)
    .map(name => /^rehearsal-(\d+)\.log$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((left, right) => left - right)
    .map(attempt => ({ attempt, path: workingTreeRecoveryProofLogPath(evidenceDirectory, attempt) }))
}

/**
 * The next attempt number never reuses an existing log: the retained
 * transcript of an earlier attempt is never truncated or rewritten.
 */
export function workingTreeRecoveryProofNextAttempt(evidenceDirectory) {
  const logs = workingTreeRecoveryProofAttemptLogs(evidenceDirectory)
  return (logs.length ? logs[logs.length - 1].attempt : 0) + 1
}

export function createWorkingTreeRecoveryAttemptLog(evidenceDirectory) {
  mkdirSync(evidenceDirectory, { recursive: true })
  const attempt = workingTreeRecoveryProofNextAttempt(evidenceDirectory)
  const logPath = workingTreeRecoveryProofLogPath(evidenceDirectory, attempt)
  const descriptor = openSync(logPath, 'wx', 0o600)
  closeSync(descriptor)
  return { attempt, path: logPath }
}

function equivalentChecksumsFor(registryEntry) {
  if (Array.isArray(registryEntry.equivalentChecksums) && registryEntry.equivalentChecksums.length >= 2) {
    return { lf: registryEntry.equivalentChecksums[0], crlf: registryEntry.equivalentChecksums[1] }
  }
  if (registryEntry.content !== undefined && registryEntry.content !== null) {
    const content = Buffer.from(registryEntry.content)
    const lf = Buffer.from(content.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
    const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'), 'utf8')
    return { lf: sha256(lf), crlf: sha256(crlf) }
  }
  return { lf: null, crlf: null }
}

/**
 * A stored ledger checksum is either the exact local candidate file checksum
 * or a line-ending equivalent of it. The proof admits only the exact value.
 */
export function classifyCandidateMigrationChecksum(registryEntry, ledgerChecksum) {
  assertPlainObject(registryEntry, 'A candidate migration registry entry')
  assertSha256(registryEntry.checksum, 'The candidate migration checksum')
  assertSha256(ledgerChecksum, 'The stored migration checksum')
  if (ledgerChecksum === registryEntry.checksum) return 'candidate-local'
  const equivalents = equivalentChecksumsFor(registryEntry)
  if (equivalents.lf === ledgerChecksum) return 'equivalent-lf'
  if (equivalents.crlf === ledgerChecksum) return 'equivalent-crlf'
  return 'unrelated'
}

function ledgerMap(ledger, label) {
  const entries = new Map()
  for (const row of ledger) {
    assertPlainObject(row, `The ${label} ledger rows must be objects.`)
    assert.ok(typeof row.version === 'string' && row.version.length > 0, `The ${label} ledger rows require versions.`)
    assert.ok(!entries.has(row.version), `The ${label} ledger versions must be unique.`)
    assertSha256(row.checksum, `The ${label} ledger checksum for ${row.version}`)
    entries.set(row.version, row.checksum)
  }
  return entries
}

/**
 * The exact live 131 to 132 transition on the disposable clone:
 * exactly one pending migration (127), zero mutated, zero ghost, and every
 * stored checksum equal to the exact local candidate file checksum.
 */
export function assertWorkingTreeLedgerTransition({ sourceRegistry, beforeLedger, afterLedger }) {
  assert.ok(Array.isArray(sourceRegistry), 'The candidate migration registry must be an array.')
  assert.ok(Array.isArray(beforeLedger), 'The pre-migration ledger must be an array.')
  assert.ok(Array.isArray(afterLedger), 'The post-migration ledger must be an array.')
  assert.equal(sourceRegistry.length, WORKING_TREE_MIGRATION_TARGET_COUNT, 'The candidate migration registry must contain exactly 132 files.')
  const registry = new Map()
  for (const entry of sourceRegistry) {
    assertPlainObject(entry, 'Migration registry entries must be objects.')
    assert.ok(typeof entry.version === 'string' && entry.version.length > 0, 'Migration registry entries require versions.')
    assert.ok(!registry.has(entry.version), 'Migration registry versions must be unique.')
    assertSha256(entry.checksum, `The migration ${entry.version} checksum`)
    registry.set(entry.version, entry)
  }
  assert.ok(registry.has(WORKING_TREE_MIGRATION_VERSION), 'The candidate migration registry must include migration 127.')
  const before = ledgerMap(beforeLedger, 'pre-migration')
  const after = ledgerMap(afterLedger, 'post-migration')

  assert.equal(
    beforeLedger.length,
    WORKING_TREE_MIGRATION_BASELINE_COUNT,
    'The pre-migration ledger must contain exactly 131 rows.',
  )
  const mutatedBefore = [...before.entries()]
    .filter(([version, checksum]) => registry.has(version) && registry.get(version).checksum !== checksum)
    .map(([version]) => version)
  assert.equal(mutatedBefore.length, 0, 'The pre-migration ledger must contain zero mutated checksums.')
  const ghostBefore = [...before.keys()].filter(version => !registry.has(version))
  assert.equal(ghostBefore.length, 0, 'The pre-migration ledger must contain zero ghost migrations.')
  const missingBefore = [...registry.keys()].filter(version => !before.has(version))
  assert.deepEqual(
    missingBefore,
    [WORKING_TREE_MIGRATION_VERSION],
    `The pending migration must be exactly ['${WORKING_TREE_MIGRATION_VERSION}'].`,
  )

  assert.equal(
    afterLedger.length,
    WORKING_TREE_MIGRATION_TARGET_COUNT,
    'The post-migration ledger must contain exactly 132 rows.',
  )
  const missingAfter = [...registry.keys()].filter(version => !after.has(version))
  assert.equal(missingAfter.length, 0, 'Every candidate migration must be applied after the transition.')
  for (const [version, checksum] of after.entries()) {
    const entry = registry.get(version)
    if (!entry) continue
    if (checksum === entry.checksum) continue
    const variant = classifyCandidateMigrationChecksum(entry, checksum)
    assert.equal(
      variant,
      'unrelated',
      `Migration ${version} must store the exact local candidate checksum (observed variant: ${variant}).`,
    )
  }
  const ghostAfter = [...after.keys()].filter(version => !registry.has(version))
  assert.equal(ghostAfter.length, 0, 'The post-migration ledger must contain zero ghost migrations.')
  for (const [version, checksum] of before.entries()) {
    assert.equal(after.get(version), checksum, `Historical migration checksum changed: ${version}`)
  }
  return {
    beforeCount: beforeLedger.length,
    afterCount: afterLedger.length,
    applied: [WORKING_TREE_MIGRATION_VERSION],
    historicalChecksumsPreserved: true,
    mutatedCount: 0,
    ghostCount: 0,
    missingAfter: [],
  }
}

/**
 * The migration-127 preservation contract: row count, original columns, the
 * checkout and phone backfills, the transaction-id rewrites and the identity
 * uniqueness all have to reconcile exactly.
 */
export function assertWorkingTreePaymentHistoryPreservation({ before, after }) {
  assertPlainObject(before, 'The pre-migration payment-history baseline')
  assertPlainObject(after, 'The post-migration payment-history evidence')
  assert.equal(after.totalRows, before.totalRows, 'The payment_history row count changed during migration.')
  assert.equal(after.preservedFingerprint, before.preservedFingerprint, 'The original payment_history columns changed during migration.')
  assert.equal(
    after.checkoutBackfilledRows,
    before.checkoutEligibleRows,
    'The checkout backfill count does not reconcile with the pre-migration eligible count.',
  )
  assert.equal(
    after.phoneBackfilledRows,
    before.phoneEligibleRows,
    'The phone backfill count does not reconcile with the pre-migration eligible count.',
  )
  assert.equal(
    after.checkoutDistinctBackfilledIdentities,
    before.checkoutDistinctEligibleIdentities,
    'The checkout identities changed during the backfill.',
  )
  assert.equal(after.duplicateCheckoutIdentityGroups, 0, 'Duplicate checkout identities were created.')
  const eligibleRewrites = before.transactionIdRewrites ?? before.transactionIdEligibleRows
  assert.equal(
    after.transactionIdRewrites,
    eligibleRewrites,
    'The transaction-id rewrite count does not reconcile with the pre-migration eligible count.',
  )
  return {
    rowsPreserved: true,
    originalColumnsPreserved: true,
    transactionIdRewritesReconciled: true,
    checkoutBackfillReconciled: true,
    phoneBackfillReconciled: true,
    duplicateCheckoutIdentityGroups: 0,
  }
}

export function workingTreeRecoveryProofBackupPairId({ databaseArchiveSha256, uploadsArchiveSha256 }) {
  assertSha256(databaseArchiveSha256, 'The database archive digest')
  assertSha256(uploadsArchiveSha256, 'The uploads archive digest')
  return sha256(`${BACKUP_PAIR_ID_DOMAIN}${databaseArchiveSha256}\0${uploadsArchiveSha256}`)
}

function normalizedRegistryEntries(registry, label) {
  assert.ok(Array.isArray(registry), `${label} must be an array.`)
  return registry.map(entry => {
    assertPlainObject(entry, `${label} entries must be objects.`)
    assert.ok(typeof entry.version === 'string' && entry.version.length > 0, `${label} entries require versions.`)
    assertSha256(entry.checksum, `The ${label} checksum for ${entry.version}`)
    return { version: entry.version, checksum: entry.checksum }
  })
}

function normalizedRegistryFiles(files) {
  assert.ok(Array.isArray(files), 'The candidate migration file registry must be an array.')
  return files.map(file => {
    assertPlainObject(file, 'The candidate migration file registry entries must be objects.')
    assert.ok(typeof file.version === 'string' && file.version.length > 0, 'The candidate migration file registry entries require versions.')
    assert.ok(typeof file.path === 'string' && file.path.length > 0, 'The candidate migration file registry entries require paths.')
    assertSha256(file.checksum, `The candidate migration file checksum for ${file.version}`)
    return { version: file.version, path: file.path, checksum: file.checksum }
  })
}

function normalizedLedger(rows, label) {
  assert.ok(Array.isArray(rows), `${label} must be an array.`)
  return rows.map(row => {
    assertPlainObject(row, `${label} rows must be objects.`)
    assert.ok(typeof row.version === 'string' && row.version.length > 0, `${label} rows require versions.`)
    assertSha256(row.checksum, `The ${label} checksum for ${row.version}`)
    return { version: row.version, checksum: row.checksum }
  })
}

function ledgerSummary(rows) {
  const versions = rows.map(row => row.version)
  return {
    count: rows.length,
    versions,
    ledgerSha256: sha256(JSON.stringify(versions)),
  }
}

function normalizedChecks(checks) {
  assert.ok(Array.isArray(checks) && checks.length > 0, 'Recovery proof checks must be a non-empty array.')
  return checks.map(check => {
    assertPlainObject(check, 'Recovery proof checks must be objects.')
    assert.ok(typeof check.name === 'string' && check.name.length > 0, 'Recovery proof checks require names.')
    assert.equal(check.passed, true, `The recovery proof check did not pass: ${check.name}`)
    return { name: check.name, passed: true }
  })
}

/**
 * Build the admissible proof document. The result is deterministic: identical
 * inputs always produce byte-identical JSON. No clock, UUID, random id, path,
 * host, credential or customer payload is ever embedded.
 */
export function buildWorkingTreeRecoveryProof(input = {}) {
  assertPlainObject(input, 'The recovery proof input')
  const {
    sourceSha256,
    releaseIdentity,
    sourceRegistry: rawRegistry,
    sourceRegistryFiles: rawRegistryFiles,
    historicalRegistry: rawHistoricalRegistry,
    producerSourceHashes: rawProducerSourceHashes,
    authorization,
    beforeLedger: rawBeforeLedger,
    afterLedger: rawAfterLedger,
    transition: rawTransition,
    backup,
    restore,
    clone,
    preservation,
    runtimeRole,
    rls,
    cleanup,
    checks,
  } = input

  assertSha256(sourceSha256, 'The working-tree source SHA-256')
  assertReleaseIdentity(releaseIdentity, 'The release identity')
  const sourceRegistry = normalizedRegistryEntries(rawRegistry, 'The candidate migration registry')
  assert.equal(sourceRegistry.length, WORKING_TREE_MIGRATION_TARGET_COUNT, 'The candidate migration registry must contain exactly 132 files.')
  const sourceRegistryFiles = normalizedRegistryFiles(rawRegistryFiles)
  assert.equal(sourceRegistryFiles.length, WORKING_TREE_MIGRATION_TARGET_COUNT, 'The candidate migration file registry must contain exactly 132 files.')
  const historicalRegistry = rawHistoricalRegistry
    ? normalizedRegistryEntries(rawHistoricalRegistry, 'The historical migration registry')
    : sourceRegistry.slice(0, WORKING_TREE_MIGRATION_BASELINE_COUNT)
  assert.equal(historicalRegistry.length, WORKING_TREE_MIGRATION_BASELINE_COUNT, 'The historical migration registry must contain exactly 131 files.')
  assert.deepEqual(historicalRegistry, sourceRegistry.slice(0, WORKING_TREE_MIGRATION_BASELINE_COUNT), 'The historical migration registry must be the first 131 candidate entries.')

  assertPlainObject(rawProducerSourceHashes, 'The producer source hashes')
  const producerSourceHashes = {}
  for (const file of WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES) {
    assert.ok(Object.hasOwn(rawProducerSourceHashes, file), `The producer source closure is incomplete: ${file}`)
    assertSha256(rawProducerSourceHashes[file], `The producer source hash for ${file}`)
    producerSourceHashes[file] = rawProducerSourceHashes[file]
  }
  assert.deepEqual(
    Object.keys(rawProducerSourceHashes).sort(),
    [...WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES].sort(),
    'The producer source closure must cover exactly the reviewed files.',
  )

  assertPlainObject(authorization, 'The recovery proof authorization record')
  assert.equal(authorization.customerCloneAuthorized, true, 'The customer clone must be explicitly authorized.')
  assert.equal(authorization.namedBackupRestoreAuthorized, true, 'The named backup restore must be explicitly authorized.')
  assert.equal(authorization.authorizationScope, WORKING_TREE_RECOVERY_PROOF_AUTHORIZATION_SCOPE, 'The authorization scope is not the reviewed scope.')
  assertSha256(authorization.authorizationRecordSha256, 'The authorization record digest')

  const beforeLedger = normalizedLedger(rawBeforeLedger, 'The pre-migration ledger')
  const afterLedger = normalizedLedger(rawAfterLedger, 'The post-migration ledger')
  const transition = rawTransition
    ? { ...rawTransition }
    : assertWorkingTreeLedgerTransition({ sourceRegistry, beforeLedger, afterLedger })

  assertPlainObject(backup, 'The recovery proof backup evidence')
  const databaseArchiveSha256 = backup.databaseArchiveSha256
  const uploadsArchiveSha256 = backup.uploadsArchiveSha256
  assertSha256(databaseArchiveSha256, 'The database archive digest')
  assertSha256(uploadsArchiveSha256, 'The uploads archive digest')
  const pairId = workingTreeRecoveryProofBackupPairId({ databaseArchiveSha256, uploadsArchiveSha256 })
  if (backup.pairId !== undefined) assert.equal(backup.pairId, pairId, 'The backup pair identity does not match the archive digests.')
  assert.match(backup.pairTimestamp ?? '', /^\d{8}_\d{6}$/, 'The backup pair timestamp must be the archive timestamp component.')

  assertPlainObject(cleanup, 'The recovery proof cleanup evidence')
  assert.ok(Object.keys(cleanup).length > 0, 'Recovery proof cleanup evidence must not be empty.')
  for (const [name, value] of Object.entries(cleanup)) {
    assert.equal(value, true, `The recovery proof cleanup step did not complete: ${name}`)
  }
  const normalizedCheckList = normalizedChecks(checks)
  for (const name of WORKING_TREE_RECOVERY_PROOF_CHECKS) {
    assert.ok(normalizedCheckList.some(check => check.name === name), `The mandatory recovery proof check is missing: ${name}`)
  }

  const proof = {
    schemaVersion: WORKING_TREE_RECOVERY_PROOF_SCHEMA_VERSION,
    kind: WORKING_TREE_RECOVERY_PROOF_KIND,
    status: 'passed',
    sourceSha256,
    releaseIdentity,
    sourceRegistry,
    sourceRegistrySha256: sha256(JSON.stringify(sourceRegistry)),
    sourceRegistryFiles,
    sourceRegistryFilesSha256: sha256(JSON.stringify(sourceRegistryFiles)),
    sourceRegistryFileCount: sourceRegistryFiles.length,
    historicalRegistry,
    historicalRegistrySha256: sha256(JSON.stringify(historicalRegistry)),
    producerSourceSha256: producerSourceHashes,
    authorization: {
      customerCloneAuthorized: true,
      namedBackupRestoreAuthorized: true,
      authorizationScope: WORKING_TREE_RECOVERY_PROOF_AUTHORIZATION_SCOPE,
      authorizationRecordSha256: authorization.authorizationRecordSha256,
    },
    sourceBaseline: WORKING_TREE_MIGRATION_BASELINE_COUNT,
    targetLedgerCount: WORKING_TREE_MIGRATION_TARGET_COUNT,
    pending: [WORKING_TREE_MIGRATION_VERSION],
    ledgerBefore: ledgerSummary(beforeLedger),
    ledgerAfter: ledgerSummary(afterLedger),
    transition,
    backup: {
      databaseArchiveSha256,
      uploadsArchiveSha256,
      pairTimestamp: backup.pairTimestamp,
      pairId,
      namedPairMatched: backup.namedPairMatched,
      integrityVerified: backup.integrityVerified,
      restored: backup.restored,
    },
    restore: { ...restore },
    clone: { ...clone },
    preservation: { ...preservation },
    runtimeRole: { ...runtimeRole },
    rls: { ...rls },
    cleanup: { ...cleanup },
    checks: normalizedCheckList,
  }

  assertWorkingTreeRecoveryProofDocument(proof, {
    sourceSha256,
    releaseIdentity,
    sourceRegistry,
    sourceRegistryFiles,
    producerSourceHashes,
  })
  return proof
}

/**
 * The strict, source-bound admission gate. It is additive: the legacy gate in
 * scripts/working-tree-release.mjs stays authoritative and is applied first.
 */
export function assertWorkingTreeRecoveryProofDocument(proof, {
  sourceSha256,
  releaseIdentity,
  sourceRegistry,
  sourceRegistryFiles,
  producerSourceHashes,
}) {
  assertPlainObject(proof, 'The release-scoped recovery proof')
  assert.equal(proof.schemaVersion, WORKING_TREE_RECOVERY_PROOF_SCHEMA_VERSION, 'The recovery proof schema version is not the reviewed version.')
  assert.equal(proof.kind, WORKING_TREE_RECOVERY_PROOF_KIND, 'The recovery proof kind is not the reviewed kind.')
  assert.equal(proof.status, 'passed', 'The recovery proof must have passed.')
  assertSha256(sourceSha256, 'The working-tree source SHA-256')
  assertReleaseIdentity(releaseIdentity, 'The release identity')
  assert.equal(proof.sourceSha256, sourceSha256, 'The recovery proof belongs to a different working-tree source.')
  assert.equal(proof.releaseIdentity, releaseIdentity, 'The recovery proof belongs to a different release identity.')

  const expectedRegistry = normalizedRegistryEntries(sourceRegistry, 'The candidate migration registry')
  assert.equal(expectedRegistry.length, WORKING_TREE_MIGRATION_TARGET_COUNT, 'The candidate migration registry must contain exactly 132 files.')
  assert.deepEqual(proof.sourceRegistry, expectedRegistry, 'The recovery proof must use the exact 132-file candidate migration registry.')
  assert.equal(proof.sourceRegistrySha256, sha256(JSON.stringify(expectedRegistry)), 'The recovery proof migration-registry digest does not match.')

  const expectedRegistryFiles = normalizedRegistryFiles(sourceRegistryFiles)
  assert.equal(expectedRegistryFiles.length, WORKING_TREE_MIGRATION_TARGET_COUNT, 'The candidate migration file registry must contain exactly 132 files.')
  assert.deepEqual(proof.sourceRegistryFiles, expectedRegistryFiles, 'The recovery proof migration source files differ from the current local files.')
  assert.equal(proof.sourceRegistryFilesSha256, sha256(JSON.stringify(expectedRegistryFiles)), 'The recovery proof migration-file registry digest does not match.')
  assert.equal(proof.sourceRegistryFileCount, WORKING_TREE_MIGRATION_TARGET_COUNT, 'The recovery proof must bind exactly 132 migration source files.')

  const expectedHistorical = expectedRegistry.slice(0, WORKING_TREE_MIGRATION_BASELINE_COUNT)
  assert.deepEqual(proof.historicalRegistry, expectedHistorical, 'The recovery proof must record the exact 131-entry historical registry.')
  assert.equal(proof.historicalRegistrySha256, sha256(JSON.stringify(expectedHistorical)), 'The recovery proof historical-registry digest does not match.')

  assertPlainObject(producerSourceHashes, 'The producer source hashes')
  assert.deepEqual(proof.producerSourceSha256, producerSourceHashes, 'The recovery proof was produced by a different producer source.')

  assert.equal(proof.sourceBaseline, WORKING_TREE_MIGRATION_BASELINE_COUNT, 'The recovery proof must start from the exact 131-row ledger.')
  assert.equal(proof.targetLedgerCount, WORKING_TREE_MIGRATION_TARGET_COUNT, 'The recovery proof must target the exact 132-row ledger.')
  assert.deepEqual(proof.pending, [WORKING_TREE_MIGRATION_VERSION], 'The recovery proof must cover exactly migration 127.')

  assertPlainObject(proof.authorization, 'The recovery proof authorization record')
  assert.equal(proof.authorization.customerCloneAuthorized, true, 'The recovery proof requires an authorized customer clone.')
  assert.equal(proof.authorization.namedBackupRestoreAuthorized, true, 'The recovery proof requires an authorized named backup restore.')
  assert.equal(proof.authorization.authorizationScope, WORKING_TREE_RECOVERY_PROOF_AUTHORIZATION_SCOPE, 'The recovery proof authorization scope is not the reviewed scope.')
  assertSha256(proof.authorization.authorizationRecordSha256, 'The recovery proof authorization record digest')

  assertPlainObject(proof.ledgerBefore, 'The pre-migration ledger evidence')
  assertPlainObject(proof.ledgerAfter, 'The post-migration ledger evidence')
  assert.equal(proof.ledgerBefore.count, WORKING_TREE_MIGRATION_BASELINE_COUNT, 'The pre-migration ledger evidence must record exactly 131 rows.')
  assert.deepEqual(proof.ledgerBefore.versions, expectedHistorical.map(entry => entry.version), 'The pre-migration ledger evidence must record the exact 131 historical versions.')
  assert.equal(proof.ledgerBefore.ledgerSha256, sha256(JSON.stringify(proof.ledgerBefore.versions)), 'The pre-migration ledger digest does not match its versions.')
  assert.equal(proof.ledgerAfter.count, WORKING_TREE_MIGRATION_TARGET_COUNT, 'The post-migration ledger evidence must record exactly 132 rows.')
  assert.deepEqual(proof.ledgerAfter.versions, expectedRegistry.map(entry => entry.version), 'The post-migration ledger evidence must record the exact 132 candidate versions.')
  assert.equal(proof.ledgerAfter.ledgerSha256, sha256(JSON.stringify(proof.ledgerAfter.versions)), 'The post-migration ledger digest does not match its versions.')

  assertPlainObject(proof.transition, 'The recovery proof transition evidence')
  assert.deepEqual(proof.transition.applied, [WORKING_TREE_MIGRATION_VERSION], 'The recovery proof must apply exactly migration 127.')
  assert.equal(proof.transition.historicalChecksumsPreserved, true, 'The recovery proof must preserve every historical checksum.')
  assert.equal(proof.transition.mutatedCount, 0, 'The recovery proof must record zero mutated migrations.')
  assert.equal(proof.transition.ghostCount, 0, 'The recovery proof must record zero ghost migrations.')
  assert.deepEqual(proof.transition.missingAfter, [], 'The recovery proof must record no missing migration after the transition.')

  assertPlainObject(proof.backup, 'The recovery proof backup evidence')
  assertSha256(proof.backup.databaseArchiveSha256, 'The recovery proof database archive digest')
  assertSha256(proof.backup.uploadsArchiveSha256, 'The recovery proof uploads archive digest')
  assert.match(proof.backup.pairTimestamp ?? '', /^\d{8}_\d{6}$/, 'The recovery proof backup pair timestamp is malformed.')
  assert.equal(
    proof.backup.pairId,
    workingTreeRecoveryProofBackupPairId({
      databaseArchiveSha256: proof.backup.databaseArchiveSha256,
      uploadsArchiveSha256: proof.backup.uploadsArchiveSha256,
    }),
    'The recovery proof backup pair identity does not match the archive digests.',
  )
  assert.equal(proof.backup.namedPairMatched, true, 'The recovery proof requires one named matching archive pair.')
  assert.equal(proof.backup.integrityVerified, true, 'The recovery proof requires verified backup integrity.')
  assert.equal(proof.backup.restored, true, 'The recovery proof requires successful restore evidence.')

  assertPlainObject(proof.restore, 'The recovery proof restore evidence')
  assert.equal(proof.restore.targetType, 'isolated-temporary-database', 'The recovery proof must restore into an isolated temporary database.')
  assert.equal(proof.restore.customerClone, true, 'The recovery proof must restore a disposable customer clone.')
  assert.equal(proof.restore.databaseCreated, true, 'The recovery proof must create the disposable clone database.')
  assert.equal(proof.restore.singleTransaction, true, 'The recovery proof must restore the archive in one transaction.')
  assert.equal(proof.restore.exitCode, 0, 'The recovery proof restore must succeed.')
  assert.equal(proof.restore.liveDatabaseMutated, false, 'The recovery proof must not mutate the customer database.')
  assert.equal(proof.restore.uploadsIntegrityVerified, true, 'The recovery proof requires verified upload integrity.')
  assertNonNegativeInteger(proof.restore.uploadsFileCount, 'The recovery proof upload file count')
  assertNonNegativeInteger(proof.restore.uploadsTotalBytes, 'The recovery proof upload byte count')

  assertPlainObject(proof.clone, 'The recovery proof clone evidence')
  assert.equal(proof.clone.kind, 'disposable-customer-clone', 'The recovery proof must describe a disposable customer clone.')
  assert.equal(proof.clone.restoreTarget, 'isolated-rehearsal-service', 'The recovery proof must restore into the isolated rehearsal service.')
  assert.equal(proof.clone.hostIp, '127.0.0.1', 'The recovery proof clone must stay on the loopback interface.')
  assert.equal(proof.clone.hostPort, 55433, 'The recovery proof clone must use the disposable loopback port.')
  assert.equal(proof.clone.networkIsolated, true, 'The recovery proof clone must run on an isolated network.')
  assert.equal(proof.clone.productionDatabaseTouched, false, 'The recovery proof must not touch the production database.')
  assert.equal(proof.clone.productionWriteCount, 0, 'The recovery proof must not write to the production database.')
  assert.equal(proof.clone.productionReadOnlySnapshot, true, 'The recovery proof production access must be a read-only snapshot.')

  assertPlainObject(proof.preservation, 'The recovery proof preservation evidence')
  assertNonNegativeInteger(proof.preservation.tablesCompared, 'The recovery proof compared table count')
  assertNonNegativeInteger(proof.preservation.tablesUnchanged, 'The recovery proof unchanged table count')
  assert.equal(proof.preservation.tablesUnchanged, proof.preservation.tablesCompared, 'Every compared customer table must be unchanged.')
  assert.equal(proof.preservation.paymentHistoryRowsPreserved, true, 'The recovery proof must preserve the payment_history rows.')
  assert.equal(proof.preservation.paymentHistoryOriginalColumnsPreserved, true, 'The recovery proof must preserve the original payment_history columns.')
  assert.deepEqual(proof.preservation.paymentHistoryNewColumns, WORKING_TREE_RECOVERY_PROOF_PAYMENT_HISTORY_COLUMNS, 'The recovery proof migration-127 columns do not match the reviewed contract.')
  assert.equal(proof.preservation.transactionIdRewritesReconciled, true, 'The recovery proof must reconcile the transaction-id rewrites.')
  assert.equal(proof.preservation.ineligibleTransactionIdsUnchanged, true, 'The recovery proof must leave ineligible transaction ids unchanged.')
  assert.equal(proof.preservation.checkoutBackfillReconciled, true, 'The recovery proof must reconcile the checkout backfill.')
  assert.equal(proof.preservation.phoneBackfillReconciled, true, 'The recovery proof must reconcile the phone backfill.')
  for (const name of [
    'checkoutEligibleRowsBefore',
    'checkoutBackfilledRowsAfter',
    'checkoutDistinctEligibleIdentitiesBefore',
    'checkoutDistinctBackfilledIdentitiesAfter',
    'duplicateCheckoutIdentityGroupsBefore',
    'duplicateCheckoutIdentityGroups',
    'phoneEligibleRowsBefore',
    'phoneBackfilledRowsAfter',
  ]) {
    assertNonNegativeInteger(proof.preservation[name], `The recovery proof preservation count ${name}`)
  }
  assert.equal(proof.preservation.duplicateCheckoutIdentityGroups, 0, 'The recovery proof must record zero duplicate checkout identities.')
  assert.equal(proof.preservation.duplicateCheckoutIdentityGroupsBefore, 0, 'The recovery proof must record zero duplicate checkout identities before the migration.')
  // The counts have to reconcile, not merely exist. A proof whose
  // before-counts and after-counts are independently non-negative but
  // unrelated would be satisfied by any pair of numbers.
  assert.equal(
    proof.preservation.checkoutEligibleRowsBefore,
    proof.preservation.checkoutBackfilledRowsAfter,
    'The recovery proof checkout backfill does not reconcile with the pre-migration eligible count.',
  )
  assert.equal(
    proof.preservation.phoneEligibleRowsBefore,
    proof.preservation.phoneBackfilledRowsAfter,
    'The recovery proof phone backfill does not reconcile with the pre-migration eligible count.',
  )
  assert.equal(
    proof.preservation.checkoutDistinctEligibleIdentitiesBefore,
    proof.preservation.checkoutDistinctBackfilledIdentitiesAfter,
    'The recovery proof checkout identities do not reconcile.',
  )
  assert.equal(proof.preservation.uniqueCheckoutRequestIdConstraint, false, 'Migration 127 must not introduce a unique checkout_request_id constraint.')
  assert.deepEqual(proof.preservation.partialIndexesPresent, WORKING_TREE_RECOVERY_PROOF_PAYMENT_HISTORY_INDEXES, 'The recovery proof migration-127 indexes do not match the reviewed contract.')
  // The audit trail is excluded from the unchanged-customer-tables set because
  // migration 005 attaches the FOR EACH ROW trigger `audit_payment_history` to
  // payment_history and `audit_trigger_func()` inserts one audit_logs row per
  // updated row. Migration 127 runs two UPDATE statements, so the trail is
  // designed to grow by one row per affected row per statement. The exclusion
  // is therefore not a weakened check: the exact, predictable delta is
  // reconciled here instead.
  assertPlainObject(proof.preservation.auditTrail, 'The recovery proof audit-trail evidence')
  for (const name of ['rowsBefore', 'rowsAfter', 'expectedRows']) {
    assertNonNegativeInteger(proof.preservation.auditTrail[name], `The recovery proof audit-trail count ${name}`)
  }
  assert.equal(
    proof.preservation.auditTrail.rowsAfter - proof.preservation.auditTrail.rowsBefore,
    proof.preservation.auditTrail.expectedRows,
    'The recovery proof audit trail did not record exactly one row per migrated payment_history row.',
  )
  assertPlainObject(proof.preservation.referenceProfileSeedAdditions, 'The recovery proof reference-profile seed reconciliation')
  assertNonNegativeInteger(proof.preservation.referenceProfileSeedAdditions.added, 'The recovery proof added reference-profile seed count')
  assertNonNegativeInteger(proof.preservation.referenceProfileSeedAdditions.expected, 'The recovery proof expected reference-profile seed count')
  assert.equal(
    proof.preservation.referenceProfileSeedAdditions.added,
    proof.preservation.referenceProfileSeedAdditions.expected,
    'The recovery proof reference-profile seed additions do not reconcile.',
  )

  assertPlainObject(proof.runtimeRole, 'The recovery proof runtime-role evidence')
  assert.equal(proof.runtimeRole.restricted, true, 'The recovery proof requires a restricted runtime role.')
  for (const name of ['owner', 'superuser', 'bypassRls', 'canCreateDatabase', 'canCreateInPublic', 'canMutateMigrationLedger']) {
    assert.equal(proof.runtimeRole[name], false, `The recovery proof runtime role must not be elevated: ${name}`)
  }

  assertPlainObject(proof.rls, 'The recovery proof RLS evidence')
  assert.equal(proof.rls.organizationProjectChecksPassed, true, 'The recovery proof requires the organization and project RLS checks.')

  assertPlainObject(proof.cleanup, 'The recovery proof cleanup evidence')
  assert.ok(Object.keys(proof.cleanup).length > 0, 'The recovery proof requires cleanup evidence.')
  for (const [name, value] of Object.entries(proof.cleanup)) {
    assert.equal(value, true, `The recovery proof cleanup step did not complete: ${name}`)
  }

  const checkList = normalizedChecks(proof.checks)
  // The emitted check set must equal the mandatory set exactly: no missing
  // name, no extra unreviewed name and no duplicate name.
  assert.deepEqual(
    checkList.map(check => check.name).sort(),
    [...WORKING_TREE_RECOVERY_PROOF_CHECKS].sort(),
    'The recovery proof must contain exactly the mandatory recovery proof checks.',
  )

  assertNoSensitiveRecoveryProofContent(proof)
  return proof
}

/**
 * The pinned registry binding. The digests are fixed review anchors: a changed
 * migration source must fail closed instead of being accepted silently.
 */
export function assertWorkingTreeRecoveryProofPinnedRegistry(proof) {
  assertPlainObject(proof, 'The release-scoped recovery proof')
  assert.equal(
    proof.sourceRegistrySha256,
    WORKING_TREE_RECOVERY_PROOF_SOURCE_REGISTRY_SHA256,
    'The candidate migration registry digest differs from the pinned registry.',
  )
  assert.equal(
    proof.historicalRegistrySha256,
    WORKING_TREE_RECOVERY_PROOF_HISTORICAL_REGISTRY_SHA256,
    'The historical migration registry digest differs from the pinned registry.',
  )
  const migration = (proof.sourceRegistry ?? []).find(entry => entry?.version === WORKING_TREE_MIGRATION_VERSION)
  assertPlainObject(migration, 'The migration-127 registry entry')
  assert.equal(
    migration.checksum,
    WORKING_TREE_RECOVERY_PROOF_MIGRATION_127_CHECKSUM,
    'The migration-127 checksum differs from the pinned checksum.',
  )
  return true
}

/**
 * Bind the admitted proof to the producer's own attempt transcript.
 *
 * Trust model: the proof is a **local-operator attestation** produced by the
 * reviewed producer. It is bound to the source tree hash, the producer source
 * closure, the pinned migration-registry anchors and the producer's own
 * attempt transcript. It is **not** a signed artifact: a determined local
 * operator with write access to the evidence directory can forge any of it.
 * The controls are procedural (reviewed producer, verified transcript, no
 * customer data in evidence), not cryptographic.
 *
 * The transcript must exist, must be the highest attempt number present in the
 * release-scoped evidence directory, must carry the exact final status line
 * `STATUS passed`, must carry an exact `PASS <name>` line for every one of
 * the mandatory check names, and must carry the exact proof line
 * `PROOF sha256 <digest>` for the **admitted proof bytes**. The digest binding
 * is what ties the transcript to the *content* of the proof it produced: a
 * transcript from a different rehearsal (a different backup pair) names a
 * different digest and is therefore rejected even when every check passed.
 */
export function assertWorkingTreeRecoveryProofAttemptTranscript(evidenceDirectory, { attempt, proofSha256 } = {}) {
  assertSha256(proofSha256, 'The admitted recovery proof digest')
  const logs = workingTreeRecoveryProofAttemptLogs(evidenceDirectory)
  if (logs.length === 0) {
    throw new Error(
      `The release-scoped recovery proof requires the producer attempt transcript in ${evidenceDirectory}; `
      + 'run the reviewed producer scripts/verify-working-tree-recovery.mjs with --execute first.',
    )
  }
  const latest = logs[logs.length - 1]
  const selected = attempt === undefined || attempt === null
    ? latest
    : logs.find(entry => entry.attempt === attempt)
  if (!selected) {
    throw new Error(`The bound recovery proof attempt transcript does not exist in ${evidenceDirectory}.`)
  }
  if (selected.attempt !== latest.attempt) {
    throw new Error(
      `The bound recovery proof attempt transcript (attempt ${selected.attempt}) is not the latest attempt `
      + `(attempt ${latest.attempt}) in ${evidenceDirectory}.`,
    )
  }
  const bytes = readFileSync(selected.path)
  const lines = bytes.toString('utf8').split(/\r?\n/)
  if (!lines.includes(WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_STATUS)) {
    throw new Error(
      `The recovery proof attempt transcript does not record the exact status line `
      + `"${WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_STATUS}".`,
    )
  }
  for (const name of WORKING_TREE_RECOVERY_PROOF_CHECKS) {
    if (!lines.includes(`PASS ${name}`)) {
      throw new Error(`The recovery proof attempt transcript is missing the exact pass marker "PASS ${name}".`)
    }
  }
  const proofLines = lines.filter(line => WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_PROOF_CANDIDATE.test(line))
  if (proofLines.length !== 1) {
    throw new Error(
      'The recovery proof attempt transcript must carry exactly one exact proof digest line '
      + `("${WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_PROOF} <64-lowercase-hex>"); `
      + `observed ${proofLines.length}.`,
    )
  }
  const expectedProofLine = workingTreeRecoveryProofTranscriptProofLine(proofSha256)
  if (proofLines[0] !== expectedProofLine) {
    throw new Error(
      'The recovery proof attempt transcript is not bound to the admitted recovery proof digest '
      + `(expected "${expectedProofLine}").`,
    )
  }
  return {
    attempt: selected.attempt,
    path: selected.path,
    sha256: sha256(bytes),
    byteLength: bytes.length,
    proofSha256,
  }
}

/**
 * The single admission entry point for the promotion path. The existing legacy
 * gate runs first and stays authoritative; the strict document gate is applied
 * immediately afterwards. Both must pass.
 */
export function assertReleaseScopedRecoveryProofAdmission(proof, {
  sourceSha256,
  releaseIdentity,
  sourceRegistry,
  sourceRegistryFiles,
  producerSourceHashes,
}) {
  assertWorkingTreeRecoveryProof(proof, { sourceSha256, releaseIdentity, sourceRegistry })
  assertWorkingTreeRecoveryProofDocument(proof, {
    sourceSha256,
    releaseIdentity,
    sourceRegistry,
    sourceRegistryFiles,
    producerSourceHashes,
  })
  return proof
}

/**
 * No credential, connection string, archive name, live identifier, UUID or
 * wall-clock timestamp may appear in the serialized proof.
 */
export function assertNoSensitiveRecoveryProofContent(proof) {
  assertPlainObject(proof, 'The release-scoped recovery proof')
  const serialized = JSON.stringify(proof)
  for (const source of WORKING_TREE_RECOVERY_PROOF_FORBIDDEN) {
    const pattern = new RegExp(source)
    assert.ok(!pattern.test(serialized), `The recovery proof contains forbidden content (${source}).`)
  }
  return true
}

/**
 * Strict CLI parsing: exactly one --source-sha256 <64-hex> and an optional
 * --execute. Unknown arguments, invalid digests and duplicated flags fail.
 */
export function parseWorkingTreeRecoveryArguments(argv) {
  assert.ok(Array.isArray(argv), 'Recovery proof arguments must be an array.')
  let sourceSha256 = null
  let execute = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--source-sha256') {
      assert.equal(sourceSha256, null, 'The --source-sha256 flag must be supplied exactly once.')
      const value = argv[index + 1]
      assert.ok(typeof value === 'string', 'The --source-sha256 flag requires a 64-hex value.')
      assertSha256(value, 'The --source-sha256 value')
      sourceSha256 = value
      index += 1
      continue
    }
    if (argument === '--execute') {
      assert.equal(execute, false, 'The --execute flag must be supplied at most once.')
      execute = true
      continue
    }
    throw new Error(`Unknown recovery proof argument: ${argument}`)
  }
  assert.ok(sourceSha256, 'The --source-sha256 flag is required.')
  return { sourceSha256, execute }
}

function createAttemptLogEntry(evidenceDirectory, createAttemptLog) {
  if (!createAttemptLog) return null
  if (typeof createAttemptLog === 'function') {
    const created = createAttemptLog(evidenceDirectory)
    assert.ok(created && typeof created.path === 'string', 'The attempt log factory must return the created log path.')
    return { attempt: created.attempt ?? null, path: created.path }
  }
  return createWorkingTreeRecoveryAttemptLog(evidenceDirectory)
}

/**
 * Write the admissible proof atomically. Identical bytes are a no-op; a
 * different proof is never written over an existing artifact.
 *
 * The artifact is written through the single canonical serializer, so the
 * bytes on disk are always exactly the bytes the digest is computed over.
 */
export function writeWorkingTreeRecoveryProofAtomic(artifactPath, proof, { createAttemptLog = false } = {}) {
  assert.ok(typeof artifactPath === 'string' && path.isAbsolute(artifactPath), 'The recovery proof artifact path must be absolute.')
  assertPlainObject(proof, 'The recovery proof document')
  const bytes = workingTreeRecoveryProofBytes(proof)
  const evidenceDirectory = path.dirname(artifactPath)
  mkdirSync(evidenceDirectory, { recursive: true })
  if (existsSync(artifactPath)) {
    const existing = readFileSync(artifactPath)
    assert.ok(
      existing.equals(bytes),
      'An existing recovery proof artifact already differs; it is never silently replaced.',
    )
    const log = createAttemptLogEntry(evidenceDirectory, createAttemptLog)
    return {
      path: artifactPath,
      written: false,
      unchanged: true,
      ...(log ? { attempt: log.attempt, logPath: log.path } : {}),
    }
  }
  const transientPath = `${artifactPath}.${process.pid}.${randomUUID()}.tmp`
  let descriptor
  try {
    descriptor = openSync(transientPath, 'wx', 0o600)
    writeFileSync(descriptor, bytes)
    closeSync(descriptor)
    descriptor = undefined
    if (existsSync(artifactPath)) {
      const existing = readFileSync(artifactPath)
      assert.ok(
        existing.equals(bytes),
        'An existing recovery proof artifact already differs; it is never silently replaced.',
      )
      rmSync(transientPath, { force: true })
      const log = createAttemptLogEntry(evidenceDirectory, createAttemptLog)
      return {
        path: artifactPath,
        written: false,
        unchanged: true,
        ...(log ? { attempt: log.attempt, logPath: log.path } : {}),
      }
    }
    renameSync(transientPath, artifactPath)
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor) } catch { /* the transient descriptor is already closed */ }
    }
    rmSync(transientPath, { force: true })
    throw error
  }
  const log = createAttemptLogEntry(evidenceDirectory, createAttemptLog)
  return {
    path: artifactPath,
    written: true,
    unchanged: false,
    ...(log ? { attempt: log.attempt, logPath: log.path } : {}),
  }
}
