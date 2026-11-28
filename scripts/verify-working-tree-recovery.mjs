#!/usr/bin/env node
/**
 * Release-scoped working-tree recovery proof producer.
 *
 * The prepare path (without --execute) is strictly read-only: it binds the
 * working-tree source, the exact 132-file migration registry, the producer
 * closure, the candidate build evidence, the owned rehearsal identity and the
 * selected archive pair. Every clone, Docker, restore and migration action is
 * behind the explicit --execute flag and requires a source-scoped
 * authorization record.
 *
 * No image, container, volume, builder, tag or dated artifact is created: the
 * proof consumes the pre-existing owned rehearsal service and the pre-existing
 * metardu-backup container. The live customer database is never written,
 * never migrated and its migration ledger is never edited; every live access
 * is an explicitly read-only repeatable-read snapshot.
 *
 * Before the disposable clone exists, the producer proves two preconditions:
 * the named backup pair must not predate the newest live mutation write, and
 * the live database is snapshotted so the run can prove it stayed quiescent
 * across the whole rehearsal.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import {
  WORKING_TREE_RECOVERY_PROOF_CHECKS,
  WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES,
  WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_STATUS,
  MIGRATION_127_SCHEMA_EVIDENCE_SQL,
  MIGRATION_127_ROW_SET_SQL,
  assertWorkingTreeLedgerTransition,
  assertWorkingTreePaymentHistoryPreservation,
  assertWorkingTreeRecoveryProofPinnedRegistry,
  buildWorkingTreeRecoveryProof,
  createWorkingTreeRecoveryAttemptLog,
  parseWorkingTreeRecoveryArguments,
  recoveryProofSourceHashesForFiles,
  workingTreeRecoveryProofArtifactPath,
  workingTreeRecoveryProofBytes,
  workingTreeRecoveryProofEvidenceDirectory,
  workingTreeRecoveryProofSha256,
  workingTreeRecoveryProofTranscriptProofLine,
  writeWorkingTreeRecoveryProofAtomic,
} from './working-tree-recovery-proof.mjs'
import {
  assertMigration127SchemaContract,
  computeWorkingTreeSourceHash,
  workingTreeEvidenceDirectory,
  workingTreeMigrationEvidence,
  workingTreeMigrationRegistry,
  workingTreeReleaseIdentity,
} from './working-tree-release.mjs'
import {
  expectedToleranceProfileAdditions,
  assertRehearsalServiceIdentity,
  createRecoveryRoleOwnership,
  ownRecoveryRole,
  parseRecoveryArchivePair,
  parseRehearsalServiceIdentity,
  recoveryArchiveRoleDefinitions,
  recoveryChildEnvironment,
  recoveryMigrationsDirectory,
  recoveryRolesForCleanup,
  recoveryStatusAfterCleanup,
  rehearsalDatabaseConfig,
  resolveRecoveryPython,
} from './rehearsal-database.mjs'
import { RUNTIME_ROLE_QUERY, collectFileMigrations, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'

const REHEARSAL_IDENTITY_PATH = '.cache/release-verify/rehearsal-service.json'
const RECOVERY_ARCHIVES_PATH = '.cache/release-verify/recovery-archives.json'
const AUTHORIZATION_PATH = '.cache/release-verify/working-tree-recovery-authorization.json'
const CLONE_DATABASE = 'metardu_recovery_verify'
const CLONE_MARKER = 'METARDU working-tree recovery verification 2026-11-28'
const BACKUP_CONTAINER = 'metardu-backup'
const PRODUCTION_DATABASE_CONTAINER = 'metardu-postgres'
const AMBIENT_DATABASE_URL_KEY = 'DATABASE_URL'

/**
 * Every ambient connection variable is removed from a child environment before
 * the explicit disposable-clone values are applied.
 */
const AMBIENT_ENVIRONMENT_KEY_PATTERNS = Object.freeze([
  /^DATABASE_URL$/,
  /^PG[A-Z0-9_]*$/,
  /^DB_/,
  /^MIGRATION_DB_/,
  /^APP_DB_/,
])
const SECRET_ENVIRONMENT_KEY_PATTERN = /_(PASSWORD|SECRET|KEY)$/

/**
 * The actions that mutate the disposable rehearsal service. Every one of them
 * is refused unless the operator passed --execute.
 */
export const RECOVERY_PRODUCER_MUTATING_ACTIONS = Object.freeze([
  'create-clone-database',
  'restore-database-archive',
  'restore-uploads-archive',
  'apply-migration-127',
  'verify-customer-preservation',
  'cleanup-clone',
  'write-recovery-proof',
])

export function assertRecoveryProducerActionAuthorized({ execute, action } = {}) {
  assert.ok(
    RECOVERY_PRODUCER_MUTATING_ACTIONS.includes(action),
    `Unknown recovery producer action: ${action}`,
  )
  assert.equal(
    execute,
    true,
    `The recovery producer action "${action}" requires the explicit --execute flag.`,
  )
  return true
}

/**
 * Strip every ambient connection variable and every secret from the inherited
 * environment. Only the explicit disposable-clone values are ever applied.
 */
export function sanitizedRecoveryEnvironment(base) {
  assert.ok(base && typeof base === 'object' && !Array.isArray(base), 'The inherited environment must be an object.')
  const sanitized = {}
  for (const [key, value] of Object.entries(base)) {
    if (AMBIENT_ENVIRONMENT_KEY_PATTERNS.some(pattern => pattern.test(key))) continue
    if (SECRET_ENVIRONMENT_KEY_PATTERN.test(key)) continue
    sanitized[key] = value
  }
  return sanitized
}

/**
 * The complete set of checks this producer can emit. The mandatory proof
 * check list must be a subset of it, so no mandatory name can be unreachable,
 * and the recorder fails closed for every other name.
 */
export const PRODUCER_RECOVERY_CHECK_NAMES = Object.freeze([
  'source-registry-132',
  'backup-archive-integrity',
  'database-archive-restored',
  'uploads-archive-restored',
  'clone-ledger-131',
  'pending-migration-127',
  'post-transition-ledger-132',
  'historical-checksums-preserved',
  'customer-tables-unchanged',
  'payment-history-preserved',
  'runtime-role-restricted',
  'rls-organization-project-verified',
  'cleanup-complete',
])

/**
 * The only way a check enters the proof. The recorder fails closed for an
 * unknown name and for a repeated name, so a renamed or duplicated emission
 * can never be admitted.
 */
export function createRecoveryCheckRecorder(log = () => {}) {
  assert.equal(typeof log, 'function', 'The recovery check recorder requires a log function.')
  const checks = []
  const checked = name => {
    assert.ok(
      typeof name === 'string' && PRODUCER_RECOVERY_CHECK_NAMES.includes(name),
      `The recovery proof check is not in the producer check list: ${name}`,
    )
    assert.ok(
      !checks.some(check => check.name === name),
      `The recovery proof check was already recorded: ${name}`,
    )
    checks.push({ name, passed: true })
    log(`PASS ${name}`)
    return name
  }
  return { checked, checks }
}

/**
 * Every mandatory check must have been emitted before a proof is written.
 */
export function assertProducerRecoveryCheckCoverage(recordedChecks) {
  assert.ok(Array.isArray(recordedChecks), 'The recorded recovery proof checks must be an array.')
  const recorded = new Set(recordedChecks.map(check => check?.name))
  for (const name of WORKING_TREE_RECOVERY_PROOF_CHECKS) {
    assert.ok(recorded.has(name), `The mandatory recovery proof check is missing: ${name}`)
  }
  return true
}

/**
 * The mandatory-coverage gate for the proof-writing phase.
 *
 * A coverage failure is converted into a failed status plus a
 * `failure-<N>.json` summary, so the process never exits non-zero without
 * leaving an artifact behind. The successful path is unchanged: the proof is
 * still built and written exactly as before.
 */
export function evaluateProducerRecoveryCheckCoverage(recordedChecks, {
  evidenceDirectory,
  attempt,
  state,
  writeSummary = writeFailureSummary,
} = {}) {
  try {
    assertProducerRecoveryCheckCoverage(recordedChecks)
    return { passed: true, status: state?.status ?? 'passed', failure: null }
  } catch (error) {
    const phase = 'proof-writing'
    const failure = {
      name: error?.name ?? 'Error',
      code: error?.code ?? null,
      phase,
      message: `The recovery proof check coverage is incomplete: ${error?.message ?? 'an unknown mandatory check is missing.'}`,
    }
    const failedState = {
      ...(state ?? {}),
      status: 'failed',
      failure,
      failurePhase: phase,
    }
    writeSummary(evidenceDirectory, attempt, failedState)
    return { passed: false, status: 'failed', failure, state: failedState }
  }
}

/**
 * The proof-writing commit.
 *
 * The artifact is written **first**. Only a successful write — a newly
 * written artifact or a byte-identical no-op — appends the exact
 * `PROOF sha256 <digest>` transcript line and the final `STATUS passed` line.
 * A refused write (an existing artifact that differs) leaves neither line in
 * the transcript, writes a `failure-<N>.json` summary with
 * `phase: 'proof-writing'` and returns a failed status, so the non-zero exit
 * code and the "never silently replaced" refusal semantics are preserved and
 * the transcript never claims a success it did not achieve.
 */
export function commitProducerRecoveryProof(options) {
  const {
    proof,
    artifactPath,
    evidenceDirectory,
    attempt,
    state,
    log,
    writeProof = writeWorkingTreeRecoveryProofAtomic,
    writeSummary = writeFailureSummary,
  } = options ?? {}
  assert.equal(typeof log, 'function', 'The producer transcript writer requires a log function.')
  assert.ok(proof && typeof proof === 'object' && !Array.isArray(proof), 'The recovery proof document is required.')
  assert.ok(typeof artifactPath === 'string' && artifactPath.length > 0, 'The recovery proof artifact path is required.')
  const proofBytes = workingTreeRecoveryProofBytes(proof)
  const proofSha256 = createHash('sha256').update(proofBytes).digest('hex')
  assert.equal(
    proofSha256,
    workingTreeRecoveryProofSha256(proof),
    'The canonical proof digest must agree with the canonical proof serializer.',
  )
  let written
  try {
    written = writeProof(artifactPath, proof, { createAttemptLog: false })
  } catch (error) {
    const phase = 'proof-writing'
    const failure = {
      name: error?.name ?? 'Error',
      code: error?.code ?? null,
      phase,
      message: `The recovery proof artifact was not written: ${error?.message ?? 'an unknown write failure occurred.'}`,
    }
    const failedState = {
      ...(state ?? {}),
      status: 'failed',
      failure,
      failurePhase: phase,
    }
    writeSummary(evidenceDirectory, attempt, failedState)
    // The refusal is recorded with the producer's existing failure marker
    // vocabulary. No `STATUS` line is written here: the terminal status of an
    // attempt is logged by the finally block (a non-passed status) or, after a
    // successful proof write, by the commit below. A refused write therefore
    // leaves neither a `STATUS passed` line nor a `PROOF sha256` line.
    log('FAIL proof-writing artifact-not-written')
    return {
      passed: false,
      status: 'failed',
      failure,
      proofPath: artifactPath,
      proofSha256,
      written: false,
    }
  }
  log(`PROOF ${written.written ? 'written' : 'unchanged'}`)
  log(workingTreeRecoveryProofTranscriptProofLine(proofSha256))
  log(WORKING_TREE_RECOVERY_PROOF_TRANSCRIPT_STATUS)
  return {
    passed: true,
    status: 'passed',
    proofPath: artifactPath,
    proofSha256,
    written: written.written,
  }
}

/**
 * The cleanup evidence carries stable, run-independent keys only. The
 * per-role removal results stay in a local map, so a run-scoped role name can
 * never reach the serialized proof.
 */
export function buildRecoveryCleanupEvidence({
  backupNetworkRestored,
  cloneDatabaseRemoved,
  uploadsCopyRemoved,
  removedRoles = new Map(),
} = {}) {
  assert.ok(removedRoles instanceof Map, 'The run-owned role removal results must be a map.')
  for (const [role, removed] of removedRoles) {
    assert.ok(typeof role === 'string' && role.length > 0, 'The run-owned role removal results require role names.')
    assert.equal(typeof removed, 'boolean', `The run-owned role removal result must be a boolean: ${role}`)
  }
  return {
    backupNetworkRestored: backupNetworkRestored === true,
    cloneDatabaseRemoved: cloneDatabaseRemoved === true,
    uploadsCopyRemoved: uploadsCopyRemoved === true,
    runOwnedRolesRemoved: [...removedRoles.values()].every(value => value === true),
  }
}

const RECOVERY_ARCHIVE_FILENAME_PATTERN = /^db_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.sql\.gz$/

/**
 * The archive dump instant is derived from the archive filename alone. The
 * backup service stamps the filename before the dump starts, so the derived
 * instant is a conservative archive age. The instant is returned as a
 * second-precision UTC ISO-8601 string.
 */
export function deriveRecoveryArchiveDumpTimestamp(archiveName) {
  assert.ok(typeof archiveName === 'string' && archiveName.length > 0, 'The recovery archive name is required.')
  const basename = archiveName.replaceAll('\\', '/').split('/').filter(Boolean).pop()
  const match = RECOVERY_ARCHIVE_FILENAME_PATTERN.exec(basename)
  assert.ok(match, `The recovery archive filename must be db_YYYYMMDD_HHMMSS.sql.gz: ${basename}`)
  const [, year, month, day, hour, minute, second] = match
  const instant = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ))
  assert.ok(!Number.isNaN(instant.getTime()), `The recovery archive filename is not a valid UTC instant: ${basename}`)
  assert.equal(
    instant.toISOString().slice(0, 19),
    `${year}-${month}-${day}T${hour}:${minute}:${second}`,
    `The recovery archive filename is not a valid calendar instant: ${basename}`,
  )
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
}

const RECOVERY_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i

/**
 * Parse a timestamp into exact epoch microseconds. A timestamp without a zone
 * is read as UTC; a date is read as UTC midnight.
 */
export function parseRecoveryMutationTimestamp(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime() * 1000
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 1000) : null
  if (typeof value !== 'string') return null
  const match = RECOVERY_TIMESTAMP_PATTERN.exec(value.trim())
  if (!match) return null
  const [, year, month, day, hour = '00', minute = '00', second = '00', fraction = '', offset = ''] = match
  const dayBase = Date.UTC(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(dayBase)) return null
  if (new Date(dayBase).toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null
  const base = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  if (Number.isNaN(base)) return null
  let offsetMinutes = 0
  if (offset && offset.toUpperCase() !== 'Z') {
    const sign = offset[0] === '-' ? -1 : 1
    const digits = offset.slice(1).replace(':', '')
    offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || '0'))
  }
  const micros = fraction ? Number(fraction.slice(0, 6).padEnd(6, '0')) : 0
  return (base - offsetMinutes * 60_000) * 1000 + micros
}

/**
 * The live mutation columns: a timestamp/timestamptz/date column whose name
 * is one of the four reviewed mutation markers. Ambiguous and future-dated
 * columns (expires_at, last_used_at, timestamp) are excluded by the name
 * allowlist, so a scheduled value can never make a fresh archive look stale.
 */
export const RECOVERY_MUTATION_COLUMN_NAMES = Object.freeze([
  'created_at',
  'updated_at',
  'createdAt',
  'updatedAt',
])

export function normalizeRecoveryMutationColumnType(dataType) {
  const value = String(dataType ?? '').trim().toLowerCase()
  if (value === 'date') return 'date'
  if (value === 'timestamp' || value === 'timestamp without time zone') return 'timestamp'
  if (value === 'timestamptz' || value === 'timestamp with time zone') return 'timestamptz'
  return null
}

export function selectLiveMutationColumns(catalog) {
  assert.ok(Array.isArray(catalog), 'The live mutation catalog must be an array.')
  const selected = []
  for (const table of catalog) {
    assert.ok(
      table && typeof table === 'object' && !Array.isArray(table),
      'The live mutation catalog entries must be objects.',
    )
    assert.ok(typeof table.name === 'string' && table.name.length > 0, 'The live mutation catalog entries require table names.')
    assert.ok(Array.isArray(table.columns), 'The live mutation catalog entries require column lists.')
    for (const column of table.columns) {
      assert.ok(
        column && typeof column === 'object' && !Array.isArray(column),
        'The live mutation catalog columns must be objects.',
      )
      assert.ok(typeof column.name === 'string' && column.name.length > 0, 'The live mutation catalog columns require names.')
      if (!RECOVERY_MUTATION_COLUMN_NAMES.includes(column.name)) continue
      const dataType = normalizeRecoveryMutationColumnType(column.dataType)
      if (!dataType) continue
      selected.push({ table: table.name, column: column.name, dataType })
    }
  }
  return selected
}

/**
 * The newest live mutation across the reviewed mutation columns.
 *
 * The column allowlist is applied here as well as in
 * `selectLiveMutationColumns`: the column name is the part after the last `.`
 * of `entry.column` or `entry.label`, and an entry whose column is not one of
 * the reviewed mutation markers is ignored outright. No caller can therefore
 * poison the freshness verdict with a future-dated `expires_at`,
 * `last_used_at` or `timestamp` value: an excluded column may never make a
 * stale archive look fresh.
 */
export function newestLiveMutationTimestamp(values) {
  assert.ok(Array.isArray(values), 'The live mutation values must be an array.')
  let newest = null
  for (const entry of values) {
    assert.ok(entry && typeof entry === 'object', 'The live mutation values must be objects.')
    if (entry.value === null || entry.value === undefined) continue
    const label = entry.column ?? entry.label ?? null
    const columnName = typeof label === 'string' ? label.split('.').pop() : null
    if (columnName === null || !RECOVERY_MUTATION_COLUMN_NAMES.includes(columnName)) continue
    const micros = parseRecoveryMutationTimestamp(entry.value)
    if (micros === null) continue
    if (newest === null || micros > newest.epochMicroseconds) {
      newest = {
        epochMicroseconds: micros,
        value: String(entry.value),
        column: label,
      }
    }
  }
  return newest
}

/**
 * The freshness precondition. The named backup pair must not predate the
 * newest live write; otherwise the clone-vs-live fingerprint equality is
 * unsatisfiable and the run fails closed with an actionable message.
 */
export function assertRecoveryArchiveFreshness({ archiveTimestamp, newestLiveMutation } = {}) {
  const archiveMicros = parseRecoveryMutationTimestamp(archiveTimestamp)
  assert.ok(archiveMicros !== null, 'The recovery archive dump timestamp is required.')
  if (newestLiveMutation === null || newestLiveMutation === undefined) return true
  const liveMicros = parseRecoveryMutationTimestamp(newestLiveMutation)
  assert.ok(liveMicros !== null, 'The newest live mutation timestamp is unparsable.')
  if (liveMicros > archiveMicros) {
    throw new Error(
      'The named backup pair predates the newest live write; take a fresh backup and re-point the named archive pair.',
    )
  }
  return true
}

/**
 * The quiescence proof: the live customer database must not have changed
 * between the pre-clone snapshot and the comparison point.
 */
export function assertRecoveryLiveQuiescence({ before, after } = {}) {
  assert.ok(Array.isArray(before), 'The pre-rehearsal live fingerprint snapshot is required.')
  assert.ok(Array.isArray(after), 'The post-rehearsal live fingerprint snapshot is required.')
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(
      'The live customer database changed during the recovery rehearsal; the run is not quiescent. Re-run against a quiescent database and a fresh backup.',
    )
  }
  return true
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function readJson(file, label) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`${label} is required at ${file}.`)
  }
  try {
    return JSON.parse(content)
  } catch {
    throw new Error(`${label} is invalid JSON at ${file}; diagnostics suppressed.`)
  }
}

function producerSourceContents(root) {
  const contents = {}
  for (const file of WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES) {
    const absolute = path.join(root, ...file.split('/'))
    assert.ok(existsSync(absolute), `The reviewed producer source is missing: ${file}`)
    contents[file] = readFileSync(absolute)
  }
  return contents
}

function readAuthorizationRecord(root, { sourceSha256, releaseIdentity, pairTimestamp }) {
  const absolute = path.join(root, ...AUTHORIZATION_PATH.split('/'))
  const raw = readFileSync(absolute)
  const record = JSON.parse(raw.toString('utf8'))
  assert.equal(record.sourceSha256, sourceSha256, 'The authorization record binds a different working-tree source.')
  assert.equal(record.releaseIdentity, releaseIdentity, 'The authorization record binds a different release identity.')
  assert.equal(record.pairTimestamp, pairTimestamp, 'The authorization record binds a different backup pair.')
  assert.match(record.pairId ?? '', /^[a-f0-9]{64}$/, 'The authorization record requires the exact backup pair id.')
  assert.equal(record.customerCloneAuthorized, true, 'The customer clone must be explicitly authorized.')
  assert.equal(record.namedBackupRestoreAuthorized, true, 'The named backup restore must be explicitly authorized.')
  return { record, authorizationRecordSha256: sha256(raw) }
}

/**
 * Phase A and B: the read-only binding. Nothing is created, restored or
 * migrated here.
 */
export async function prepareRecoveryProof({ root, sourceSha256 }) {
  const currentSourceSha256 = computeWorkingTreeSourceHash({ cwd: root })
  assert.equal(currentSourceSha256, sourceSha256, 'The working-tree source hash differs from the supplied candidate source hash.')
  const releaseIdentity = workingTreeReleaseIdentity(sourceSha256)
  const sourceFiles = workingTreeMigrationRegistry(root)
  const sourceRegistry = workingTreeMigrationEvidence(sourceFiles)
  const sourceRegistryFiles = sourceFiles.map(file => ({
    version: file.version,
    path: file.path,
    checksum: file.checksum,
  }))
  const historicalRegistry = sourceRegistry.slice(0, 131)
  assertWorkingTreeRecoveryProofPinnedRegistry({
    sourceRegistry,
    sourceRegistrySha256: sha256(JSON.stringify(sourceRegistry)),
    historicalRegistry,
    historicalRegistrySha256: sha256(JSON.stringify(historicalRegistry)),
  })
  const producerSourceHashes = recoveryProofSourceHashesForFiles(
    WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES,
    producerSourceContents(root),
  )

  const evidenceDirectory = workingTreeEvidenceDirectory(root, sourceSha256)
  const buildEvidence = readJson(path.join(evidenceDirectory, 'candidate-build.json'), 'Candidate build evidence')
  assert.equal(buildEvidence.status, 'built', 'Candidate build evidence must record a successful, source-bound build.')
  assert.equal(buildEvidence.sourceSha256, sourceSha256, 'Candidate build evidence belongs to a different source hash.')
  assert.equal(buildEvidence.releaseIdentity, releaseIdentity, 'Candidate build evidence has an inconsistent release identity.')
  assert.deepEqual(
    buildEvidence.migrationRegistry?.checksums ?? null,
    sourceRegistry,
    'The candidate build evidence migration registry differs from the current working tree.',
  )

  const service = parseRehearsalServiceIdentity(
    readJson(path.join(root, ...REHEARSAL_IDENTITY_PATH.split('/')), 'Rehearsal service identity'),
  )
  const archives = parseRecoveryArchivePair(
    readJson(path.join(root, ...RECOVERY_ARCHIVES_PATH.split('/')), 'Recovery archive pair'),
  )
  const pairTimestamp = archives.databaseArchive.match(/db_(\d{8}_\d{6})\.sql\.gz$/)[1]

  const authorizationPath = path.join(root, ...AUTHORIZATION_PATH.split('/'))
  const authorization = existsSync(authorizationPath)
    ? readAuthorizationRecord(root, { sourceSha256, releaseIdentity, pairTimestamp })
    : null

  return {
    root,
    sourceSha256,
    releaseIdentity,
    sourceRegistry,
    sourceRegistryFiles,
    historicalRegistry,
    producerSourceHashes,
    service,
    archives,
    pairTimestamp,
    authorization,
  }
}

function docker(args, input, { binary = false } = {}) {
  const result = spawnSync('docker', args, {
    input,
    encoding: binary ? null : 'utf8',
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Docker ${args[0]} failed; sensitive output suppressed (exit ${result.status}).`)
  }
  return binary ? result.stdout : (result.stdout ?? '')
}

function quotedIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function quotedLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

const TABLE_CATALOG = `SELECT c.relname AS name, array_agg(a.attname::text ORDER BY a.attnum) AS columns
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
    AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
  GROUP BY c.oid,c.relname ORDER BY c.relname`

/**
 * The content fingerprint mirrors the committed recovery producer exactly:
 * numeric values are scale-normalized so a semantically identical row can
 * never produce a false difference between the clone and the live snapshot.
 * `originalToleranceIds` restricts the reference-profile table to the rows
 * that already existed before the upgrade, so a reviewed seed addition is
 * never counted as a customer-row change.
 */
function fingerprintQuery(table, columns, originalToleranceIds = null) {
  const keys = columns.map(quotedLiteral).join(',')
  const originalFilter = originalToleranceIds && table.name === 'tolerance_profiles'
    ? `WHERE id::text=ANY(ARRAY[${originalToleranceIds.map(quotedLiteral).join(',')}]::text[])`
    : ''
  return `SELECT ${quotedLiteral(table.name)} AS name,count(*)::integer AS rows,
   md5(COALESCE(string_agg(md5(payload::text),'' ORDER BY md5(payload::text)),'')) AS fingerprint
   FROM (SELECT (SELECT jsonb_object_agg(j.key,CASE WHEN jsonb_typeof(j.value)='number'
         THEN to_jsonb(trim_scale((j.value #>> '{}')::numeric)) ELSE j.value END ORDER BY j.key)
         FROM jsonb_each(to_jsonb(t)) j WHERE j.key=ANY(ARRAY[${keys}])) AS payload
     FROM public.${quotedIdentifier(table.name)} t ${originalFilter}) rows`
}

async function snapshot(client, catalog, columnsByTable, originalToleranceIds = null) {
  const rows = []
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    for (const table of catalog) {
      const columns = columnsByTable?.get(table.name) ?? table.columns
      rows.push((await client.query(fingerprintQuery(table, columns, originalToleranceIds))).rows[0])
    }
    await client.query('COMMIT')
    return rows
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

/**
 * Every live access is a read-only statement batch inside an explicit
 * `BEGIN ... ISOLATION LEVEL REPEATABLE READ READ ONLY ... ROLLBACK` against
 * the existing production container. The live database is never written.
 */
function productionRows(sql) {
  return docker(
    ['exec', '-i', PRODUCTION_DATABASE_CONTAINER, 'sh', '-c', 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    sql,
  ).trim().split('\n').filter(Boolean)
}

function productionSnapshot(catalog) {
  const sql = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
    + catalog.map(table => `SELECT row_to_json(result) FROM (${fingerprintQuery(table, table.columns)}) result;`).join('\n')
    + '\nROLLBACK;'
  return productionRows(sql).map(line => JSON.parse(line))
}

/**
 * The live table catalog, read before the disposable clone exists. It is the
 * fixed basis of the quiescence comparison.
 */
function productionCatalog() {
  const sql = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
    + `SELECT row_to_json(result) FROM (${TABLE_CATALOG}) result;\n`
    + 'ROLLBACK;'
  return productionRows(sql).map(line => JSON.parse(line))
}

const LIVE_MUTATION_CATALOG = `SELECT c.relname AS name,
       jsonb_agg(jsonb_build_object('name', a.attname::text, 'dataType', format_type(a.atttypid, NULL)) ORDER BY a.attnum) AS columns
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
    AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
  GROUP BY c.oid,c.relname ORDER BY c.relname`

function productionMutationCatalog() {
  const sql = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
    + `SELECT row_to_json(result) FROM (${LIVE_MUTATION_CATALOG}) result;\n`
    + 'ROLLBACK;'
  return productionRows(sql).map(line => JSON.parse(line))
}

/**
 * The newest value of every reviewed live mutation column. Only the reviewed
 * mutation columns are ever read.
 */
function productionMutationMaxima(columns) {
  if (!columns.length) return []
  const selects = columns.map(({ table, column }) => (
    `SELECT row_to_json(result) FROM (SELECT ${quotedLiteral(`${table}.${column}`)} AS label, `
    + `max(${quotedIdentifier(column)})::text AS value FROM public.${quotedIdentifier(table)}) result;`
  ))
  const sql = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
    + selects.join('\n')
    + '\nROLLBACK;'
  return productionRows(sql).map(line => JSON.parse(line))
}

/**
 * The columns that migration 127 adds to public.payment_history.
 */
export const RECOVERY_MIGRATION_127_PAYMENT_COLUMNS = Object.freeze([
  'checkout_request_id',
  'phone_number',
  'last_reconcile_attempt_at',
])

/**
 * The pre-migration payment_history eligibility predicates.
 *
 * The baseline is measured on the **131-migration** clone, BEFORE migration 127
 * has run, so the columns migration 127 adds do not exist yet. A bare column
 * identifier naming one of them is a hard PostgreSQL error (42703), not a
 * false predicate. These predicates therefore read those columns through
 * `to_jsonb(...)`, where a missing key is simply NULL: the same predicate text
 * selects exactly the same row set before and after the migration, so the
 * before/after digests are directly comparable.
 */
export const RECOVERY_CHECKOUT_ELIGIBLE_SQL = MIGRATION_127_ROW_SET_SQL.checkoutEligible

export const RECOVERY_PHONE_ELIGIBLE_SQL = MIGRATION_127_ROW_SET_SQL.phoneEligible

/**
 * The digest of every payment_history row that is NOT eligible for the
 * migration-127 rewrite.
 *
 * The row set is defined by excluding the eligible **id list**, not by
 * re-evaluating the eligibility predicate. The predicate is three-valued: a
 * row whose transaction_id is NULL makes the match unknown, and `NOT unknown`
 * is unknown rather than true, so such a row would be silently dropped from
 * the set — the pre-migration and post-migration digests would then cover
 * different rows and the comparison would be meaningless. The id exclusion is
 * well defined because `id` is the NOT NULL primary key, and the post-
 * migration measurement uses the identical form.
 *
 * The digest distinguishes a NULL transaction id from an empty one. Coalescing
 * both into the empty string would hide a NULL-to-empty rewrite of an
 * ineligible row, which is exactly the kind of change this digest exists to
 * detect.
 */
export const RECOVERY_ELIGIBLE_OTHER_DIGEST_SQL = MIGRATION_127_ROW_SET_SQL.otherDigest

/**
 * The per-row digests of the identities migration 127 moves.
 *
 * The producer proves the backfill by value, not only by count: the digest of
 * the eligible rows before the migration has to equal the digest of the same
 * rows afterwards. The statements themselves are shared with the promotion
 * controller, so the two release paths cannot drift.
 */
export const RECOVERY_ELIGIBLE_IDENTITY_DIGEST_SQL = MIGRATION_127_ROW_SET_SQL.eligibleIdentityDigest

export const RECOVERY_REWRITTEN_IDENTITY_DIGEST_SQL = MIGRATION_127_ROW_SET_SQL.rewrittenIdentityDigest

export const RECOVERY_PHONE_SOURCE_DIGEST_SQL = MIGRATION_127_ROW_SET_SQL.phoneSourceDigest

export const RECOVERY_PHONE_VALUE_DIGEST_SQL = MIGRATION_127_ROW_SET_SQL.phoneValueDigest

async function paymentHistoryBaseline(client) {
  const eligibleIds = (await client.query(
    `SELECT id::text AS id FROM public.payment_history t WHERE ${RECOVERY_CHECKOUT_ELIGIBLE_SQL}`,
  )).rows.map(row => row.id)
  const phoneIds = (await client.query(
    `SELECT id::text AS id FROM public.payment_history t WHERE ${RECOVERY_PHONE_ELIGIBLE_SQL}`,
  )).rows.map(row => row.id)
  // The eligible rows are addressed by their id list, so the before- and
  // after-state digests cover exactly the same rows.
  const checkout = (await client.query(
    MIGRATION_127_ROW_SET_SQL.eligibleIdentityDigest,
    [eligibleIds],
  )).rows[0]
  const phone = (await client.query(
    MIGRATION_127_ROW_SET_SQL.phoneSourceDigest,
    [phoneIds],
  )).rows[0]
  // The duplicate groups are measured, not assumed: the pre-migration
  // evidence has to show that the eligible identities were already distinct
  // before the migration moved them into checkout_request_id.
  const duplicateGroups = (await client.query(`SELECT count(*)::integer AS groups FROM (
      SELECT transaction_id FROM public.payment_history t WHERE ${RECOVERY_CHECKOUT_ELIGIBLE_SQL}
      GROUP BY transaction_id HAVING count(*) > 1) duplicates`)).rows[0]
  const other = (await client.query(RECOVERY_ELIGIBLE_OTHER_DIGEST_SQL, [eligibleIds])).rows[0]
  return { eligibleIds, phoneIds, checkout, phone, duplicateGroups, other }
}

/**
 * The payment_history column names present on a clone.
 */
async function paymentHistoryColumnNames(client) {
  return (await client.query(
    `SELECT a.attname AS name FROM pg_attribute a
     WHERE a.attrelid = 'public.payment_history'::regclass
       AND a.attnum > 0 AND NOT a.attisdropped`,
  )).rows.map(row => row.name)
}

/**
 * The schema boundary the payment_history evidence depends on.
 *
 * The pre-migration baseline runs against the 131-migration clone, where the
 * migration-127 columns do not exist yet; the post-migration evidence runs
 * after the upgrade, where all of them must exist. Asserting the boundary
 * explicitly turns any future drift into a named failure instead of a raw
 * PostgreSQL 42703, and it proves the baseline was measured on the
 * pre-migration schema and the after-state on the post-migration schema.
 */
export function assertRecoveryPaymentSchemaBoundary(columnNames, { phase } = {}) {
  assert.ok(Array.isArray(columnNames), 'The schema boundary requires the payment_history column names.')
  assert.ok(
    phase === 'before' || phase === 'after',
    'The schema boundary requires an explicit before or after phase.',
  )
  const present = RECOVERY_MIGRATION_127_PAYMENT_COLUMNS.filter(name => columnNames.includes(name))
  if (phase === 'before') {
    assert.equal(
      present.length,
      0,
      'The payment_history baseline must be measured before migration 127 adds its columns.',
    )
  } else {
    assert.deepEqual(
      [...present].sort(),
      [...RECOVERY_MIGRATION_127_PAYMENT_COLUMNS].sort(),
      'The payment_history evidence must be measured after migration 127 adds every column.',
    )
  }
  return true
}

async function paymentHistoryAfter(client, baseline, originalColumns) {
  const preserved = (await client.query(`SELECT count(*)::integer AS rows,
      md5(COALESCE(string_agg(md5(payload::text),'' ORDER BY md5(payload::text)),'')) AS fingerprint
    FROM (SELECT (SELECT jsonb_object_agg(j.key,j.value ORDER BY j.key)
          FROM jsonb_each(to_jsonb(t)) j WHERE j.key=ANY(ARRAY[${originalColumns.map(quotedLiteral).join(',')}])) AS payload
      FROM public.payment_history t) rows`)).rows[0]
  const rewritten = (await client.query(
    MIGRATION_127_ROW_SET_SQL.rewrittenIdentityDigest,
    [baseline.eligibleIds],
  )).rows[0]
  const phone = (await client.query(
    MIGRATION_127_ROW_SET_SQL.phoneValueDigest,
    [baseline.phoneIds],
  )).rows[0]
  const other = (await client.query(RECOVERY_ELIGIBLE_OTHER_DIGEST_SQL,
  [baseline.eligibleIds])).rows[0]
  const duplicates = (await client.query(`SELECT count(*)::integer AS groups FROM (
      SELECT checkout_request_id FROM public.payment_history
      WHERE id::text = ANY($1::text[]) AND checkout_request_id IS NOT NULL
      GROUP BY checkout_request_id HAVING count(*) > 1) duplicates`,
  [baseline.eligibleIds])).rows[0]
  // The global counts cover **every** row, not only the eligible ones. The
  // scoped counts above cannot see a backfill that reached a row outside the
  // eligible set, because they filter on the eligible id list first.
  const globalBackfill = (await client.query(`SELECT
      count(*) FILTER (WHERE checkout_request_id IS NOT NULL)::integer AS checkout,
      count(*) FILTER (WHERE phone_number IS NOT NULL)::integer AS phone
    FROM public.payment_history`)).rows[0]
  return { preserved, rewritten, phone, other, duplicates, globalBackfill }
}

/**
 * The measured migration-127 schema contract. Every value in the proof comes
 * from the catalog of the disposable clone after the upgrade; nothing is
 * copied from a constant.
 *
 * The statements themselves are shared with the promotion controller through
 * `MIGRATION_127_SCHEMA_EVIDENCE_SQL`, so the two release paths read the
 * evidence in exactly the same shape. The producer previously carried its own
 * copy, which projected the raw catalog boolean (`notNull`) while the
 * reviewed contract requires `isNullable`; the second field execution failed
 * closed on precisely that mismatch.
 */
export async function paymentHistorySchemaEvidence(client) {
  const columns = (await client.query(MIGRATION_127_SCHEMA_EVIDENCE_SQL.columns)).rows
  const indexes = (await client.query(MIGRATION_127_SCHEMA_EVIDENCE_SQL.indexes)).rows
  const unique = (await client.query(MIGRATION_127_SCHEMA_EVIDENCE_SQL.unique)).rows[0]
  const rls = (await client.query(MIGRATION_127_SCHEMA_EVIDENCE_SQL.rls)).rows[0]
  const policies = (await client.query(MIGRATION_127_SCHEMA_EVIDENCE_SQL.policies)).rows[0]
  return {
    columns,
    indexes,
    uniqueCheckoutRequestId: unique?.uniqueCheckoutRequestId === true,
    rlsEnabled: rls?.rlsEnabled === true,
    rlsForced: rls?.rlsForced === true,
    policyCount: policies.count,
  }
}

function childEnvironment(overrides) {
  return recoveryChildEnvironment(overrides, sanitizedRecoveryEnvironment(process.env))
}

function runSource(root, script, env) {
  const result = spawnSync(process.execPath, [path.join(root, ...script.split('/'))], {
    cwd: root,
    env: childEnvironment(env),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 600_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    // The child's stdout and stderr can carry SQL and customer data, so they
    // are suppressed. The exit status and the fact that output was produced
    // are not sensitive, and they make a field failure diagnosable.
    const producedOutput = (result.stdout?.length ?? 0) + (result.stderr?.length ?? 0) > 0
    throw new Error(
      `Source verification failed: ${script} (exit ${result.status ?? 'none'}${producedOutput ? ', output produced' : ''}); `
      + 'sensitive diagnostics suppressed.',
    )
  }
}

/**
 * Phases C to I. Every mutating step is authorized by the explicit --execute
 * flag, and the cleanup always runs in a finally block.
 */
export async function executeRecoveryProof({ root, sourceSha256, prepared, execute }) {
  assert.equal(execute, true, 'The mutating recovery proof requires the explicit --execute flag.')
  const state = {
    status: 'failed',
    phase: 'prepare',
    cleanup: {
      backupNetworkRestored: true,
      cloneDatabaseRemoved: true,
      uploadsCopyRemoved: true,
      runOwnedRolesRemoved: true,
    },
    checks: [],
    createdDatabase: false,
    createdUploadsDirectory: false,
    recoveryNetworkConnected: false,
    admin: null,
    clone: null,
    roleOwnership: createRecoveryRoleOwnership(randomUUID().replaceAll('-', '')),
  }
  const evidenceDirectory = workingTreeRecoveryProofEvidenceDirectory(root, sourceSha256)
  mkdirSync(evidenceDirectory, { recursive: true })
  const attempt = createWorkingTreeRecoveryAttemptLog(evidenceDirectory)
  const log = message => appendFileSync(attempt.path, `${message}\n`)
  const recorder = createRecoveryCheckRecorder(log)
  const checked = recorder.checked
  state.checks = recorder.checks
  const cleanupOutcome = {
    backupNetworkRestored: true,
    cloneDatabaseRemoved: true,
    uploadsCopyRemoved: true,
    removedRoles: new Map(),
  }
  const authorize = action => assertRecoveryProducerActionAuthorized({ execute, action })

  try {
    state.phase = 'target-binding'
    const config = rehearsalDatabaseConfig()
    assert.equal(config.database, prepared.service.database, 'The recovery database configuration must match the inspected rehearsal service.')
    const adminAddress = new URL(config.adminUrl)
    assert.equal(adminAddress.hostname, '127.0.0.1')
    assert.equal(adminAddress.port, '55433')
    const container = JSON.parse(docker(['inspect', prepared.service.container]))[0]
    assertRehearsalServiceIdentity(prepared.service, container)
    checked('source-registry-132')

    /*
     * The precondition phase. Both gates run before the disposable clone
     * exists: the named backup pair must not predate the newest live write,
     * and the live database is snapshotted so the run can prove it stayed
     * quiescent. Every access is read-only.
     */
    state.phase = 'precondition'
    const archiveDumpTimestamp = deriveRecoveryArchiveDumpTimestamp(prepared.archives.databaseArchive)
    const liveFingerprintCatalog = productionCatalog()
    const liveBefore = productionSnapshot(liveFingerprintCatalog)
    const mutationColumns = selectLiveMutationColumns(productionMutationCatalog())
    const newestLiveMutation = newestLiveMutationTimestamp(productionMutationMaxima(mutationColumns))
    state.freshness = {
      passed: false,
      archiveTimestamp: archiveDumpTimestamp,
      newestLiveMutation: newestLiveMutation ? newestLiveMutation.value : null,
    }
    try {
      assertRecoveryArchiveFreshness({
        archiveTimestamp: archiveDumpTimestamp,
        newestLiveMutation: newestLiveMutation ? newestLiveMutation.value : null,
      })
      state.freshness.passed = true
      log('PASS freshness named-backup-pair-is-not-stale')
    } catch (error) {
      log('FAIL freshness named-backup-pair-predates-newest-live-write')
      throw error
    }

    state.phase = 'restore'
    authorize('create-clone-database')
    assert.ok(prepared.authorization, 'A source-scoped authorization record is required before the disposable clone is created.')
    state.admin = new pg.Client({
      connectionString: new URL('postgres', adminAddress).href,
      connectionTimeoutMillis: 5000,
    })
    await state.admin.connect()
    const controlMarker = (await state.admin.query(
      "SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
      [prepared.service.database],
    )).rows[0]?.marker
    assert.equal(controlMarker, prepared.service.marker, 'The rehearsal control database marker does not match the inspected identity.')
    assert.equal(
      (await state.admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [CLONE_DATABASE])).rowCount,
      0,
      'The disposable clone database already exists; it is never overwritten.',
    )
    assert.equal(
      (await state.admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [state.roleOwnership.runtimeRole])).rowCount,
      0,
      'The disposable clone runtime role already exists; it is never overwritten.',
    )
    for (const definition of recoveryArchiveRoleDefinitions()) {
      const existing = await state.admin.query(
        'SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',
        [definition.name],
      )
      if (existing.rowCount === 0) {
        const attributes = definition.superuser
          ? 'NOLOGIN SUPERUSER'
          : 'NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
        await state.admin.query(`CREATE ROLE ${quotedIdentifier(definition.name)} ${attributes}`)
        ownRecoveryRole(state.roleOwnership, definition.name)
      } else {
        const role = existing.rows[0]
        assert.equal(role.rolcanlogin, definition.login, `Recovery compatibility role ${definition.name} must not be a login.`)
        assert.equal(role.rolsuper, definition.superuser, `Recovery compatibility role ${definition.name} has unexpected superuser attributes.`)
        assert.equal(role.rolbypassrls, definition.bypassRls, `Recovery compatibility role ${definition.name} has unexpected RLS bypass attributes.`)
      }
    }
    await state.admin.query(`CREATE DATABASE ${quotedIdentifier(CLONE_DATABASE)} TEMPLATE template0`)
    state.createdDatabase = true
    await state.admin.query(`COMMENT ON DATABASE ${quotedIdentifier(CLONE_DATABASE)} IS ${quotedLiteral(CLONE_MARKER)}`)
    await state.admin.query(`REVOKE ALL ON DATABASE ${quotedIdentifier(CLONE_DATABASE)} FROM PUBLIC`)

    authorize('restore-database-archive')
    const archiveDigests = {
      database: docker(['exec', BACKUP_CONTAINER, 'sha256sum', prepared.archives.databaseArchive]).split(/\s/)[0],
      uploads: docker(['exec', BACKUP_CONTAINER, 'sha256sum', prepared.archives.uploadsArchive]).split(/\s/)[0],
    }
    assert.match(archiveDigests.database, /^[a-f0-9]{64}$/, 'The named database archive digest is invalid.')
    assert.match(archiveDigests.uploads, /^[a-f0-9]{64}$/, 'The named uploads archive digest is invalid.')
    state.archiveDigests = archiveDigests
    const pairId = createHash('sha256')
      .update(`metardu-recovery-backup-pair-v1\0${archiveDigests.database}\0${archiveDigests.uploads}`)
      .digest('hex')
    assert.equal(pairId, prepared.authorization.record.pairId, 'The named backup pair does not match the authorized pair id.')

    const backupBefore = JSON.parse(docker(['inspect', BACKUP_CONTAINER]))[0]
    assert.ok(!backupBefore.NetworkSettings.Networks[prepared.service.network], 'The backup container is already attached to the rehearsal network.')
    docker(['network', 'connect', prepared.service.network, BACKUP_CONTAINER])
    state.recoveryNetworkConnected = true
    try {
      const restore = spawnSync('docker', [
        'exec',
        '-e', `PGPASSWORD=${decodeURIComponent(adminAddress.password)}`,
        BACKUP_CONTAINER,
        'bash', '-o', 'pipefail', '-c',
        `gzip -dc ${prepared.archives.databaseArchive} | psql -X -q -v ON_ERROR_STOP=1 --single-transaction -h ${prepared.service.container} -p 5432 -U ${decodeURIComponent(adminAddress.username)} -d ${CLONE_DATABASE}`,
      ], { windowsHide: true, timeout: 600_000, maxBuffer: 8 * 1024 * 1024 })
      assert.equal(restore.status, 0, 'The archive restore failed and the transaction rolled back; sensitive SQL diagnostics suppressed.')
    } finally {
      docker(['network', 'disconnect', prepared.service.network, BACKUP_CONTAINER])
      state.recoveryNetworkConnected = false
      const backupAfter = JSON.parse(docker(['inspect', BACKUP_CONTAINER]))[0]
      assert.deepEqual(backupAfter.NetworkSettings.Networks, backupBefore.NetworkSettings.Networks)
      cleanupOutcome.backupNetworkRestored = true
    }
    checked('backup-archive-integrity')
    checked('database-archive-restored')

    const cloneAddress = new URL(CLONE_DATABASE, adminAddress).href
    state.clone = new pg.Client({ connectionString: cloneAddress, connectionTimeoutMillis: 5000 })
    await state.clone.connect()
    const catalog = (await state.clone.query(TABLE_CATALOG)).rows
    const columnsByTable = new Map(catalog.map(table => [table.name, table.columns]))
    const paymentTable = catalog.find(table => table.name === 'payment_history')
    assert.ok(paymentTable, 'The restored clone does not contain the payment_history table.')
    const originalPaymentColumns = [...paymentTable.columns].filter(column => column !== 'transaction_id')
    const restored = await snapshot(state.clone, catalog, columnsByTable)
    const live = productionSnapshot(catalog)
    const liveAfter = productionSnapshot(liveFingerprintCatalog)
    const liveByName = new Map(live.map(table => [table.name, table]))
    const restoreDifferences = restored
      .filter(table => JSON.stringify(table) !== JSON.stringify(liveByName.get(table.name)))
      .map(table => table.name)
    state.quiescence = { passed: false }
    try {
      assertRecoveryLiveQuiescence({ before: liveBefore, after: liveAfter })
      state.quiescence.passed = true
      log('PASS quiescence live-database-unchanged-during-rehearsal')
    } catch (error) {
      log('FAIL quiescence live-database-changed-during-rehearsal')
      throw error
    }
    assert.equal(restoreDifferences.length, 0, 'The restored clone and the live database fingerprints differ; review timing and data before promotion.')
    log('PASS restore-fingerprints-match-production')

    authorize('restore-uploads-archive')
    const uploadsDirectory = `/tmp/metardu-recovery-uploads-${randomUUID()}`
    state.uploadsDirectory = uploadsDirectory
    const recoveryPython = resolveRecoveryPython()
    const manifestResult = spawnSync(recoveryPython, ['scripts/recovery-archive-manifest.py'], {
      input: docker(['exec', BACKUP_CONTAINER, 'cat', prepared.archives.uploadsArchive], undefined, { binary: true }),
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    })
    assert.equal(manifestResult.status, 0, 'The native upload archive inspection failed; diagnostics intentionally suppressed.')
    const manifest = JSON.parse(manifestResult.stdout)
    docker(['exec', BACKUP_CONTAINER, 'mkdir', '-m', '700', uploadsDirectory])
    state.createdUploadsDirectory = true
    docker(['exec', BACKUP_CONTAINER, 'tar', '-xzf', prepared.archives.uploadsArchive, '-C', uploadsDirectory])
    const extracted = docker(['exec', BACKUP_CONTAINER, 'find', uploadsDirectory, '-type', 'f', '-exec', 'sha256sum', '{}', '+'])
      .trim().split('\n').filter(Boolean)
    const extractedByName = new Map(extracted.map(line => [line.slice(66).slice(uploadsDirectory.length + 1), line.slice(0, 64)]))
    assert.equal(extractedByName.size, Object.keys(manifest).length, 'The restored upload file count differs from the native archive manifest.')
    for (const [name, value] of Object.entries(manifest)) {
      assert.equal(extractedByName.get(name), value.sha256, 'A restored upload digest differs from the native archive manifest; the filename is suppressed.')
    }
    state.uploadsFileCount = Object.keys(manifest).length
    state.uploadsTotalBytes = Object.values(manifest).reduce((total, file) => total + file.bytes, 0)
    checked('uploads-archive-restored')

    const beforeLedger = (await state.clone.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
    state.beforeLedger = beforeLedger
    assert.equal(beforeLedger.length, 131, 'The restored clone ledger must contain exactly 131 rows before the upgrade.')
    const registryByVersion = new Map(prepared.sourceRegistry.map(entry => [entry.version, entry]))
    const missingBefore = prepared.sourceRegistry.filter(entry => !beforeLedger.some(row => row.version === entry.version)).map(entry => entry.version)
    assert.deepEqual(missingBefore, ['127_mpesa_payment_completion'], 'The restored clone must be missing exactly migration 127.')
    const mutatedBefore = beforeLedger.filter(row => registryByVersion.has(row.version) && registryByVersion.get(row.version).checksum !== row.checksum).map(row => row.version)
    assert.equal(mutatedBefore.length, 0, 'The restored clone ledger contains mutated historical checksums.')
    const ghostBefore = beforeLedger.filter(row => !registryByVersion.has(row.version)).map(row => row.version)
    assert.equal(ghostBefore.length, 0, 'The restored clone ledger contains ghost migrations.')
    checked('clone-ledger-131')
    checked('pending-migration-127')

    // The baseline is measured on the 131-migration clone, BEFORE migration 127
    // has run. The boundary is asserted explicitly so that a future drift
    // fails with a named message instead of a raw PostgreSQL 42703.
    assertRecoveryPaymentSchemaBoundary(await paymentHistoryColumnNames(state.clone), { phase: 'before' })
    const paymentBaseline = await paymentHistoryBaseline(state.clone)
    state.paymentBaseline = paymentBaseline
    const paymentBaselineRows = (await state.clone.query('SELECT count(*)::integer AS count FROM public.payment_history')).rows[0].count
    const auditRowsBefore = (await state.clone.query('SELECT count(*)::integer AS count FROM public.audit_logs')).rows[0].count
    const paymentFingerprintBefore = (await state.clone.query(`SELECT md5(COALESCE(string_agg(md5(payload::text),'' ORDER BY md5(payload::text)),'')) AS fingerprint
      FROM (SELECT (SELECT jsonb_object_agg(j.key,j.value ORDER BY j.key)
            FROM jsonb_each(to_jsonb(t)) j WHERE j.key=ANY(ARRAY[${originalPaymentColumns.map(quotedLiteral).join(',')}])) AS payload
        FROM public.payment_history t) rows`)).rows[0].fingerprint
    // The customer-table fingerprint covers the tables the customer owns.
    // Three tables are excluded, and every exclusion is deliberate:
    //   - payment_history is the table migration 127 rewrites; its
    //     preservation is asserted separately against the measured baseline.
    //   - schema_migrations is the migration ledger, which the migration is
    //     designed to advance from 131 rows to 132. The ledger transition is
    //     asserted separately against the source registry, so excluding the
    //     ledger from the unchanged-customer-tables set removes no evidence.
    //   - audit_logs is the audit trail. Migration 005 attaches the FOR EACH
    //     ROW trigger `audit_payment_history` to payment_history, and
    //     `audit_trigger_func()` inserts one audit_logs row per updated row,
    //     so the migration is *designed* to extend the audit trail. The exact
    //     delta is predictable and is asserted separately below, so the
    //     exclusion removes no evidence either.
    const customerCatalog = catalog.filter(table => (
      table.name !== 'payment_history'
      && table.name !== 'schema_migrations'
      && table.name !== 'audit_logs'
    ))
    state.customerTableCount = customerCatalog.length
    state.originalToleranceIds = (await state.clone.query(
      'SELECT id::text AS id FROM public.tolerance_profiles ORDER BY id::text',
    )).rows.map(row => row.id)
    const customerFingerprintBefore = await snapshot(
      state.clone,
      customerCatalog,
      columnsByTable,
      state.originalToleranceIds,
    )
    state.paymentPolicyCountBefore = (await state.clone.query(
      MIGRATION_127_SCHEMA_EVIDENCE_SQL.policies,
    )).rows[0].count

    authorize('apply-migration-127')
    state.phase = 'upgrade'
    const runtimePassword = randomBytes(32).toString('hex')
    ownRecoveryRole(state.roleOwnership, state.roleOwnership.runtimeRole)
    const childEnv = {
      MIGRATION_DB_HOST: '127.0.0.1',
      MIGRATION_DB_PORT: '55433',
      MIGRATION_DB_NAME: CLONE_DATABASE,
      MIGRATION_DB_USER: decodeURIComponent(adminAddress.username),
      MIGRATION_DB_PASSWORD: decodeURIComponent(adminAddress.password),
      APP_DB_HOST: '127.0.0.1',
      APP_DB_PORT: '55433',
      APP_DB_NAME: CLONE_DATABASE,
      APP_DB_USER: state.roleOwnership.runtimeRole,
      APP_DB_PASSWORD: runtimePassword,
      NODE_ENV: 'production',
    }
    runSource(root, 'scripts/provision-runtime-db-role.mjs', childEnv)
    const afterLedger = (await state.clone.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
    state.afterLedger = afterLedger
    state.transition = assertWorkingTreeLedgerTransition({
      sourceRegistry: prepared.sourceRegistry,
      beforeLedger,
      afterLedger,
    })
    checked('post-transition-ledger-132')
    checked('historical-checksums-preserved')
    // The post-migration evidence is measured only after migration 127 has
    // added every column it owns. The boundary is asserted explicitly so that
    // a future drift fails with a named message instead of a raw 42703.
    assertRecoveryPaymentSchemaBoundary(await paymentHistoryColumnNames(state.clone), { phase: 'after' })

    authorize('verify-customer-preservation')
    state.phase = 'preservation'
    const paymentAfter = await paymentHistoryAfter(state.clone, paymentBaseline, originalPaymentColumns)
    state.paymentAfter = paymentAfter
    assert.equal(paymentBaseline.checkout.digest, paymentAfter.rewritten.digest, 'The rewritten checkout identities differ from the pre-migration transaction ids.')
    assert.equal(paymentBaseline.phone.digest, paymentAfter.phone.digest, 'The backfilled phone numbers differ from the pre-migration metadata values.')
    assert.equal(paymentBaseline.other.digest, paymentAfter.other.digest, 'An ineligible payment_history transaction id changed during the upgrade.')
    // The global counts see every row, so a backfill that reached a row
    // outside the eligible set cannot hide behind the scoped measurements.
    assert.equal(
      paymentAfter.globalBackfill.checkout,
      paymentBaseline.checkout.count,
      'The checkout backfill reached a row outside the pre-migration eligible set.',
    )
    assert.equal(
      paymentAfter.globalBackfill.phone,
      paymentBaseline.phone.count,
      'The phone backfill reached a row outside the pre-migration eligible set.',
    )
    // A proof in which every reconciliation is satisfied by 0 === 0 carries no
    // evidence at all. The checkout backfill has to have been exercised.
    assert.ok(
      paymentBaseline.checkout.count > 0,
      'The checkout backfill was not exercised by migration 127 on this customer archive; '
      + 'the recovery proof would carry no migration evidence.',
    )
    assert.equal(
      paymentBaseline.duplicateGroups.groups,
      0,
      'The pre-migration eligible checkout identities were not distinct.',
    )
    // The audit trail is expected to grow by exactly one row per migrated
    // payment_history row: the migration runs two UPDATE statements, and the
    // FOR EACH ROW trigger fires once per affected row per statement. A row
    // eligible for both statements is therefore recorded twice, which is why
    // the expected count is the sum of the two eligible counts rather than
    // the size of their union.
    const auditRowsAfter = (await state.clone.query('SELECT count(*)::integer AS count FROM public.audit_logs')).rows[0].count
    const expectedAuditRows = paymentBaseline.checkout.count + paymentBaseline.phone.count
    assert.equal(
      auditRowsAfter - auditRowsBefore,
      expectedAuditRows,
      'The audit trail did not record exactly one row per migrated payment_history row.',
    )
    state.auditTrail = {
      rowsBefore: auditRowsBefore,
      rowsAfter: auditRowsAfter,
      expectedRows: expectedAuditRows,
    }
    assertWorkingTreePaymentHistoryPreservation({
      before: {
        totalRows: paymentBaselineRows,
        preservedFingerprint: paymentFingerprintBefore,
        checkoutEligibleRows: paymentBaseline.checkout.count,
        checkoutDistinctEligibleIdentities: paymentBaseline.checkout.identities,
        phoneEligibleRows: paymentBaseline.phone.count,
        transactionIdRewrites: paymentBaseline.checkout.count,
      },
      after: {
        totalRows: paymentAfter.preserved.rows,
        preservedFingerprint: paymentAfter.preserved.fingerprint,
        checkoutBackfilledRows: paymentAfter.rewritten.count,
        checkoutDistinctBackfilledIdentities: paymentAfter.rewritten.identities,
        phoneBackfilledRows: paymentAfter.phone.count,
        transactionIdRewrites: paymentAfter.rewritten.count,
        duplicateCheckoutIdentityGroups: paymentAfter.duplicates.groups,
      },
    })
    const customerFingerprintAfter = await snapshot(
      state.clone,
      customerCatalog,
      columnsByTable,
      state.originalToleranceIds,
    )
    const customerDifferences = customerFingerprintBefore
      .filter((table, index) => JSON.stringify(table) !== JSON.stringify(customerFingerprintAfter[index]))
      .map(table => table.name)
    assert.equal(customerDifferences.length, 0, 'A customer table changed during the migration-127 upgrade.')
    const newToleranceRows = (await state.clone.query(
      'SELECT count(*)::integer AS count FROM public.tolerance_profiles WHERE NOT(id::text=ANY($1::text[]))',
      [state.originalToleranceIds],
    )).rows[0].count
    const expectedAddedReferenceProfiles = expectedToleranceProfileAdditions(
      collectFileMigrations(recoveryMigrationsDirectory(root)).map(file => file.version),
      beforeLedger.map(row => row.version),
    )
    assert.equal(
      newToleranceRows,
      expectedAddedReferenceProfiles,
      'Unexpected reference-profile seed rows were added during the upgrade.',
    )
    state.referenceProfileSeedAdditions = { added: newToleranceRows, expected: expectedAddedReferenceProfiles }
    const paymentSchema = await paymentHistorySchemaEvidence(state.clone)
    state.paymentSchema = paymentSchema
    assertMigration127SchemaContract({
      columns: paymentSchema.columns,
      indexes: paymentSchema.indexes,
      uniqueCheckoutRequestId: paymentSchema.uniqueCheckoutRequestId,
      rlsEnabled: paymentSchema.rlsEnabled,
      rlsForced: paymentSchema.rlsForced,
      policyCount: paymentSchema.policyCount,
      beforePolicyCount: state.paymentPolicyCountBefore,
    })
    checked('customer-tables-unchanged')
    checked('payment-history-preserved')

    const runtimeAddress = new URL(cloneAddress)
    runtimeAddress.username = state.roleOwnership.runtimeRole
    runtimeAddress.password = runtimePassword
    const restricted = new pg.Client({ connectionString: runtimeAddress.href, connectionTimeoutMillis: 5000 })
    await restricted.connect()
    try {
      const identity = (await restricted.query(RUNTIME_ROLE_QUERY)).rows[0]
      assert.equal(runtimeDatabaseRoleFailure(identity), null)
      const runtimeRole = {
        restricted: true,
        owner: identity.owns_public_objects === true,
        superuser: identity.rolsuper === true,
        bypassRls: identity.rolbypassrls === true,
        canCreateDatabase: identity.can_create_database === true,
        canCreateInPublic: identity.can_create_in_public === true,
        canMutateMigrationLedger: identity.can_mutate_migration_ledger === true,
      }
      assert.deepEqual(runtimeRole, {
        restricted: true,
        owner: false,
        superuser: false,
        bypassRls: false,
        canCreateDatabase: false,
        canCreateInPublic: false,
        canMutateMigrationLedger: false,
      })
      state.runtimeRole = runtimeRole
      checked('runtime-role-restricted')
    } finally {
      await restricted.end()
    }

    runSource(root, 'scripts/verify-organization-project-rls.mjs', {
      [AMBIENT_DATABASE_URL_KEY]: cloneAddress,
      RUNTIME_DB_ROLE: state.roleOwnership.runtimeRole,
      MIGRATION_DB_HOST: '127.0.0.1',
      MIGRATION_DB_PORT: '55433',
      MIGRATION_DB_NAME: CLONE_DATABASE,
      MIGRATION_DB_USER: decodeURIComponent(adminAddress.username),
      MIGRATION_DB_PASSWORD: decodeURIComponent(adminAddress.password),
    })
    checked('rls-organization-project-verified')
    state.status = 'passed'
  } catch (error) {
    state.status = 'failed'
    state.failure = {
      name: error?.name ?? 'Error',
      code: error?.code ?? null,
      phase: state.phase,
      message: error instanceof assert.AssertionError
        ? 'Recovery proof assertion failed; inspect the structured failed-stage evidence, not customer data.'
        : String(error?.message ?? 'The recovery proof failed.'),
    }
  } finally {
    state.failurePhase = state.failure?.phase ?? state.phase
    state.phase = 'cleanup'
    authorize('cleanup-clone')
    if (state.recoveryNetworkConnected) {
      try {
        docker(['network', 'disconnect', prepared.service.network, BACKUP_CONTAINER])
        state.recoveryNetworkConnected = false
        cleanupOutcome.backupNetworkRestored = true
      } catch {
        cleanupOutcome.backupNetworkRestored = false
      }
    }
    try {
      if (state.clone) await state.clone.end()
    } catch { /* the clone client is already closed */ }
    if (state.createdDatabase && state.admin) {
      try {
        const marker = (await state.admin.query(
          "SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
          [CLONE_DATABASE],
        )).rows[0]?.marker
        assert.equal(marker, CLONE_MARKER, 'The disposable clone marker does not match; the clone is never dropped.')
        await state.admin.query(`DROP DATABASE ${quotedIdentifier(CLONE_DATABASE)}`)
        cleanupOutcome.cloneDatabaseRemoved = (await state.admin.query(
          'SELECT 1 FROM pg_database WHERE datname=$1',
          [CLONE_DATABASE],
        )).rowCount === 0
      } catch {
        cleanupOutcome.cloneDatabaseRemoved = false
      }
    }
    if (state.admin) {
      for (const role of recoveryRolesForCleanup(state.roleOwnership, {
        databaseCreated: state.createdDatabase,
        databaseRemoved: cleanupOutcome.cloneDatabaseRemoved === true,
      })) {
        try {
          await state.admin.query(`DROP ROLE IF EXISTS ${quotedIdentifier(role)}`)
          cleanupOutcome.removedRoles.set(role, (await state.admin.query(
            'SELECT 1 FROM pg_roles WHERE rolname=$1',
            [role],
          )).rowCount === 0)
        } catch {
          cleanupOutcome.removedRoles.set(role, false)
        }
      }
    }
    try {
      await state.admin?.end()
    } catch { /* the admin client is already closed */ }
    if (state.createdUploadsDirectory) {
      try {
        docker(['exec', BACKUP_CONTAINER, 'rm', '-rf', '--', state.uploadsDirectory])
        docker(['exec', BACKUP_CONTAINER, 'test', '!', '-e', state.uploadsDirectory])
        cleanupOutcome.uploadsCopyRemoved = true
      } catch {
        cleanupOutcome.uploadsCopyRemoved = false
      }
    }
    state.cleanup = {
      ...buildRecoveryCleanupEvidence(cleanupOutcome),
      complete: false,
    }
    state.cleanup.complete = Object.entries(state.cleanup)
      .filter(([name]) => name !== 'complete')
      .every(([, value]) => value === true)
    if (state.cleanup.complete === true) {
      checked('cleanup-complete')
    }
    state.status = recoveryStatusAfterCleanup(state.status, state.cleanup)
    // The passed status is never logged here: it is logged only after the
    // proof artifact write has succeeded, so a refused write cannot leave a
    // transcript that claims the attempt passed.
    if (state.status !== 'passed') {
      log(`STATUS ${state.status}`)
    }
  }

  if (state.status !== 'passed') {
    writeFailureSummary(evidenceDirectory, attempt.attempt, state)
    return { status: state.status, failure: state.failure ?? null, cleanup: state.cleanup }
  }

  authorize('write-recovery-proof')
  const coverage = evaluateProducerRecoveryCheckCoverage(state.checks, {
    evidenceDirectory,
    attempt: attempt.attempt,
    state,
  })
  if (!coverage.passed) {
    return { status: coverage.status, failure: coverage.failure, cleanup: state.cleanup }
  }
  const proof = buildWorkingTreeRecoveryProof({
    sourceSha256: prepared.sourceSha256,
    releaseIdentity: prepared.releaseIdentity,
    sourceRegistry: prepared.sourceRegistry,
    sourceRegistryFiles: prepared.sourceRegistryFiles,
    historicalRegistry: prepared.historicalRegistry,
    producerSourceHashes: prepared.producerSourceHashes,
    authorization: {
      customerCloneAuthorized: true,
      namedBackupRestoreAuthorized: true,
      authorizationScope: 'customer-clone-and-named-backup-restore',
      authorizationRecordSha256: prepared.authorization.authorizationRecordSha256,
    },
    beforeLedger: state.beforeLedger,
    afterLedger: state.afterLedger,
    transition: state.transition,
    backup: {
      databaseArchiveSha256: state.archiveDigests.database,
      uploadsArchiveSha256: state.archiveDigests.uploads,
      pairTimestamp: prepared.pairTimestamp,
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
      uploadsFileCount: state.uploadsFileCount,
      uploadsTotalBytes: state.uploadsTotalBytes,
    },
    clone: {
      kind: 'disposable-customer-clone',
      restoreTarget: 'isolated-rehearsal-service',
      hostIp: prepared.service.hostIp,
      hostPort: prepared.service.hostPort,
      networkIsolated: true,
      productionDatabaseTouched: false,
      productionWriteCount: 0,
      productionReadOnlySnapshot: true,
    },
    preservation: {
      tablesCompared: state.customerTableCount,
      tablesUnchanged: state.customerTableCount,
      paymentHistoryRowsPreserved: true,
      paymentHistoryOriginalColumnsPreserved: true,
      paymentHistoryNewColumns: state.paymentSchema.columns.map(column => ({
        name: column.name,
        dataType: column.dataType,
        maximumLength: column.maximumLength,
        isNullable: column.isNullable,
      })),
      transactionIdRewritesReconciled: true,
      ineligibleTransactionIdsUnchanged: true,
      checkoutBackfillReconciled: true,
      phoneBackfillReconciled: true,
      checkoutEligibleRowsBefore: state.paymentBaseline.checkout.count,
      checkoutBackfilledRowsAfter: state.paymentAfter.rewritten.count,
      checkoutDistinctEligibleIdentitiesBefore: state.paymentBaseline.checkout.identities,
      checkoutDistinctBackfilledIdentitiesAfter: state.paymentAfter.rewritten.identities,
      duplicateCheckoutIdentityGroupsBefore: state.paymentBaseline.duplicateGroups.groups,
      duplicateCheckoutIdentityGroups: state.paymentAfter.duplicates.groups,
      phoneEligibleRowsBefore: state.paymentBaseline.phone.count,
      phoneBackfilledRowsAfter: state.paymentAfter.phone.count,
      uniqueCheckoutRequestIdConstraint: state.paymentSchema.uniqueCheckoutRequestId,
      partialIndexesPresent: state.paymentSchema.indexes.map(index => index.name),
      auditTrail: state.auditTrail,
      referenceProfileSeedAdditions: state.referenceProfileSeedAdditions,
    },
    runtimeRole: state.runtimeRole,
    rls: { organizationProjectChecksPassed: true },
    cleanup: state.cleanup,
    checks: WORKING_TREE_RECOVERY_PROOF_CHECKS.map(name => ({ name, passed: true })),
  })
  const artifactPath = workingTreeRecoveryProofArtifactPath(root, prepared.sourceSha256)
  const commit = commitProducerRecoveryProof({
    proof,
    artifactPath,
    evidenceDirectory,
    attempt: attempt.attempt,
    state,
    log,
  })
  if (!commit.passed) {
    return { status: commit.status, failure: commit.failure, cleanup: state.cleanup }
  }
  return { status: 'passed', proofPath: artifactPath, written: commit.written }
}

function writeFailureSummary(evidenceDirectory, attempt, state) {
  const summary = {
    kind: 'working-tree-release-scoped-recovery-failure',
    status: state.status,
    phase: state.failurePhase ?? state.phase,
    failure: state.failure ?? null,
    cleanup: state.cleanup,
    freshness: state.freshness ?? null,
    quiescence: state.quiescence ?? null,
  }
  const target = path.join(evidenceDirectory, `failure-${attempt}.json`)
  const transient = `${target}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(transient, `${JSON.stringify(summary, null, 2)}\n`)
    renameSync(transient, target)
  } catch {
    // A failed summary never blocks the non-zero exit code.
  }
}

/**
 * The producer entry point. The prepare path is read-only and returns before
 * any mutating action can run.
 */
export async function main(argv = process.argv.slice(2), { root = process.cwd() } = {}) {
  const { sourceSha256, execute } = parseWorkingTreeRecoveryArguments(argv)
  const prepared = await prepareRecoveryProof({ root, sourceSha256 })
  if (!execute) {
    console.log('Prepared only. --execute is required for the disposable-clone rehearsal.')
    return {
      status: 'prepared',
      sourceSha256: prepared.sourceSha256,
      releaseIdentity: prepared.releaseIdentity,
      migrationCount: prepared.sourceRegistry.length,
      pairTimestamp: prepared.pairTimestamp,
    }
  }
  const result = await executeRecoveryProof({ root, sourceSha256, prepared, execute })
  if (result.status !== 'passed') process.exitCode = 1
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`working-tree recovery proof failed: ${error.message}`)
    process.exitCode = 1
  })
}
