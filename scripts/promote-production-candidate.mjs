#!/usr/bin/env node
// Promote one source-bound working-tree candidate into the existing production stack.
// The only mutating entry point is: promote <64-hex-source-sha256>.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statfsSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import {
  assertBuildSpace,
  assertPromotionBackupCheckpoint,
  forwardPromotionService,
} from './release-plan.mjs'
import { withExclusiveCandidateBuild } from './release-build-lock.mjs'
import {
  RUNTIME_ROLE_QUERY,
  runtimeDatabaseRoleFailure,
} from './verify-migrations.mjs'
import {
  WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES,
  MIGRATION_127_SCHEMA_EVIDENCE_SQL,
  MIGRATION_127_ROW_SET_SQL,
  assertReleaseScopedRecoveryProofAdmission,
  assertWorkingTreeRecoveryProofAttemptTranscript,
  assertWorkingTreeRecoveryProofPinnedRegistry,
  recoveryProofSourceHashesForFiles,
  workingTreeRecoveryProofAttemptLogs,
  workingTreeRecoveryProofEvidenceDirectory,
} from './working-tree-recovery-proof.mjs'
import {
  WORKING_TREE_CANDIDATE_TAG,
  WORKING_TREE_MIGRATION_TARGET_COUNT,
  WORKING_TREE_ROLLBACK_TAG,
  assertCanonicalScriptPath,
  assertCandidateBuildEvidence,
  assertCandidateTagBinding,
  assertEnvironmentContinuity,
  assertExactlyOneApplicationContainer,
  assertMigration127SchemaContract,
  assertPaymentHistoryPreservation,
  assertPriorReleaseIdentityBaseline,
  assertPromotedHealthContract,
  assertResolvedCandidateServices,
  assertRetiredTillRouteStatus,
  assertRollbackAppMounts,
  assertRollbackLedgerExpectation,
  assertRollbackRegistryFileSet,
  assertRollbackRegistryFileContent,
  assertSourceLabelEvidenceConsistency,
  assertSupportingServicesPreserved,
  assertWorkingTreeMigrationAfter,
  assertWorkingTreeMigrationBaseline,
  canonicalMounts,
  computeWorkingTreeSourceHash,
  normaliseWorkingDirectory,
  resolveDirectExecution,
  restoreEnvReleaseIdentity,
  rollbackMigrationCompleted,
  selectWorkingTreeRollbackRegistry,
  streamApplicationLog,
  updateEnvReleaseIdentity,
  workingTreeApplicationLogCommands,
  workingTreeBuildLabels,
  workingTreeCandidateBuildLockPath,
  workingTreeEvidenceDirectory,
  workingTreeMigrationEvidence,
  workingTreeMigrationRegistry,
  workingTreeRecoveryProofPath,
  workingTreeReleaseIdentity,
  workingTreeRepositoryRoot,
  workingTreeRollbackOverride,
} from './working-tree-release.mjs'

const SUPPORTING_SERVICE_NAMES = Object.freeze([
  'metardu-postgres',
  'metardu-redis',
  'metardu-worker',
  'metardu-collaboration',
  'metardu-ntrip',
  'metardu-backup',
])
const PROJECT_NAME = 'metardu'

function parseAction(argv) {
  assert.equal(argv.length, 2, 'Use preflight <64-hex-source-sha256> or promote <64-hex-source-sha256>.')
  const [action, sourceSha256] = argv
  assert.ok(['preflight', 'promote'].includes(action), 'Use the explicit preflight or promote action.')
  assert.match(sourceSha256, /^[a-f0-9]{64}$/, 'Supply the exact 64-hex working-tree source SHA-256.')
  return { action, sourceSha256 }
}

/**
 * A binary that can be spawned without a shell.
 *
 * Modern Node refuses to spawn a Windows batch file (`.cmd`, `.bat`) without
 * a shell, and `npm` on Windows is exactly such a file. The spawn fails with
 * a bare `EINVAL`, which the promoter's suppressed diagnostics cannot
 * explain. Any attempt to spawn one is therefore rejected up front with an
 * actionable message, and the underlying script is invoked directly instead.
 */
export function assertSpawnableBinary(binary, platform = process.platform) {
  assert.ok(typeof binary === 'string' && binary.length > 0, 'A spawnable binary is required.')
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(binary)) {
    throw new Error(
      'Windows batch binaries cannot be spawned without a shell; '
      + 'invoke the underlying script directly through the current Node executable.',
    )
  }
  return binary
}

function runCommand(binary, args, options = {}) {
  const { input, timeout = 30_000, maxBuffer = 16 * 1024 * 1024, cwd } = options
  assertSpawnableBinary(binary)
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    input,
    cwd,
    windowsHide: true,
    timeout,
    maxBuffer,
  })
  if (result.error || result.status !== 0) {
    const error = new Error(`${binary} ${args[0]} failed; credential-bearing diagnostics suppressed.`)
    error.exitStatus = result.status
    throw error
  }
  return result
}

/**
 * The npm script that `docker:verify` resolves to.
 *
 * The promotion path runs the runtime verification script directly, through
 * the current Node executable, because modern Node refuses to spawn a Windows
 * batch file without a shell. The alias is resolved and checked here so the
 * direct invocation and the npm script cannot drift apart silently: if
 * `docker:verify` is ever re-pointed, the promotion path refuses to run
 * instead of continuing to execute a script the npm alias no longer names.
 */
export const DOCKER_VERIFY_SCRIPT = 'node scripts/verify-production-runtime.mjs'

export function assertDockerVerifyAlias(root, scripts = readPackageScripts(root)) {
  assert.ok(scripts && typeof scripts === 'object', 'The package scripts are required to resolve the docker:verify alias.')
  assert.equal(
    scripts['docker:verify'],
    DOCKER_VERIFY_SCRIPT,
    'The docker:verify alias must resolve to the runtime verification script the promotion path runs.',
  )
  return DOCKER_VERIFY_SCRIPT
}

function readPackageScripts(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  return manifest.scripts ?? {}
}

/**
 * The runtime verification invocation.
 *
 * Runtime verification starts with the `docker:verify` script: it reads
 * health, ownership, and duplicate-application inventory without starting,
 * building, migrating, or stopping any service. The script is invoked
 * directly through the current Node executable, which is exactly what
 * `npm run docker:verify` runs, and which avoids spawning the Windows `npm`
 * batch file — a spawn modern Node refuses to perform without a shell.
 *
 * The evidence records the command that actually ran, not an npm alias that
 * was never spawned. The alias is recorded alongside it.
 */
export function runtimeVerificationCommand(root) {
  const script = path.join(root, 'scripts', 'verify-production-runtime.mjs')
  return {
    binary: process.execPath,
    args: [script],
    command: DOCKER_VERIFY_SCRIPT,
    npmAlias: 'docker:verify',
    resolvedScript: script,
  }
}

async function runDockerVerify(root) {
  // A re-pointed docker:verify alias is refused before the script runs, so
  // the recorded evidence can never claim an alias that was not executed.
  assertDockerVerifyAlias(root)
  const invocation = runtimeVerificationCommand(root)
  runCommand(invocation.binary, invocation.args, { cwd: root, timeout: 120_000 })
  return {
    command: invocation.command,
    npmAlias: invocation.npmAlias,
    resolvedScript: invocation.resolvedScript,
    passed: true,
  }
}

function docker(args, options = {}) {
  return runCommand('docker', args, options).stdout.trim()
}

function dockerJson(args, options = {}) {
  const output = docker(args, options)
  try {
    return JSON.parse(output)
  } catch {
    throw new Error(`Docker ${args[0]} returned invalid JSON; diagnostics suppressed.`)
  }
}

function imageIdForTag(tag) {
  const ids = [
    ...new Set(docker(['image', 'ls', '--quiet', '--no-trunc', tag])
      .split(/\s+/)
      .filter(Boolean)),
  ]
  if (ids.length === 0) return null
  assert.equal(ids.length, 1, `Image tag ${tag} must resolve to exactly one image.`)
  assert.match(ids[0], /^sha256:[a-f0-9]{64}$/, `Image tag ${tag} must resolve to an exact image id.`)
  return ids[0]
}

function inspectImage(tag) {
  const images = dockerJson(['image', 'inspect', tag])
  assert.equal(images.length, 1, `Image tag ${tag} must resolve to exactly one image.`)
  return images[0]
}

function inspectContainers() {
  const ids = docker(['ps', '-aq']).split(/\s+/).filter(Boolean)
  return ids.length === 0 ? [] : dockerJson(['inspect', ...ids])
}

function environmentOf(container) {
  assert.ok(Array.isArray(container?.Config?.Env), 'Container environment evidence is required.')
  return Object.fromEntries(container.Config.Env.map(value => {
    const separator = value.indexOf('=')
    assert.ok(separator > 0, 'Container environment entries must be key=value pairs.')
    return [value.slice(0, separator), value.slice(separator + 1)]
  }))
}

function composeConfig(root, project) {
  return dockerJson([
    'compose',
    '-p', project,
    '-f', path.join(root, 'docker-compose.yml'),
    'config',
    '--format', 'json',
  ], { timeout: 60_000 })
}

function supportingContainers(containers) {
  return SUPPORTING_SERVICE_NAMES.map(name => {
    const matches = containers.filter(container => container.Name === `/${name}`)
    assert.equal(matches.length, 1, `Exactly one supporting service container is required: ${name}.`)
    assert.equal(matches[0].Config?.Labels?.['com.docker.compose.project'], PROJECT_NAME, `Supporting service is outside the production project: ${name}.`)
    return matches[0]
  })
}

function hostFreeBytes(root) {
  const stats = statfsSync(root)
  return stats.bavail * stats.bsize
}

function databaseConfig(containers) {
  const postgres = containers.find(container => container.Name === '/metardu-postgres')
  assert.ok(postgres, 'The production PostgreSQL container is required.')
  const environment = environmentOf(postgres)
  assert.deepEqual(
    postgres.NetworkSettings?.Ports?.['5432/tcp'],
    [{ HostIp: '127.0.0.1', HostPort: '5432' }],
    'PostgreSQL must remain bound to the owned loopback origin.',
  )
  return {
    host: '127.0.0.1',
    port: 5432,
    database: environment.POSTGRES_DB,
    user: environment.POSTGRES_USER,
    password: environment.POSTGRES_PASSWORD,
    connectionTimeoutMillis: 10_000,
  }
}

async function withAdmin(containers, work, ...args) {
  const client = new pg.Client(databaseConfig(containers))
  await client.connect()
  try {
    return await work(client, ...args)
  } finally {
    await client.end()
  }
}

async function migrationLedger(client) {
  return (await client.query(
    'SELECT version, checksum FROM public.schema_migrations ORDER BY version',
  )).rows
}

async function collectActiveJobCounts(client) {
  return (await client.query(`
    SELECT
      (SELECT count(*)::integer FROM public.background_jobs WHERE status = 'running') AS background,
      (SELECT count(*)::integer FROM public.render_jobs WHERE status = 'running') AS render,
      (SELECT count(*)::integer FROM public.drone_processing_tasks WHERE status IN ('uploading', 'running', 'importing')) AS drone
  `)).rows[0]
}

function readJson(pathname, label) {
  assert.ok(existsSync(pathname), `${label} is required at ${pathname}.`)
  try {
    return JSON.parse(readFileSync(pathname, 'utf8'))
  } catch {
    throw new Error(`${label} is invalid JSON at ${pathname}; diagnostics suppressed.`)
  }
}

/**
 * The recreated container's own runtime identity.
 *
 * The public health `releaseId` is derived from the very same
 * `METARDU_BUILD_SHA` variable, so it is not an independent witness; the
 * container's own `Config.Env` array is read directly instead. The failure
 * message names the variable only — no other environment value is ever
 * rendered, and neither identity value is embedded in the message.
 */
export function assertPromotedContainerReleaseIdentity(container, releaseIdentity) {
  const environment = environmentOf(container)
  assert.ok(
    environment.METARDU_BUILD_SHA === releaseIdentity,
    'The promoted application container must carry METARDU_BUILD_SHA equal to the release identity in its own environment.',
  )
  return true
}

/**
 * The release-scoped recovery proof is admitted through a single wrapper call:
 * the legacy gate runs first and stays authoritative, the strict source-bound
 * gate runs immediately afterwards. The admitted proof bytes are hashed exactly
 * as they were read, so the preflight evidence identifies the proof that was
 * admitted rather than a re-serialized copy of it.
 *
 * Trust model: the proof is a **local-operator attestation** produced by the
 * reviewed producer. It is bound to the source tree hash, the producer source
 * closure, the pinned migration-registry anchors and the producer's own attempt
 * transcript. The transcript is additionally bound to the **content** of the
 * admitted proof: it must carry the exact `PROOF sha256 <digest>` line for the
 * admitted proof bytes, so a transcript from a different rehearsal can never be
 * admitted together with this proof. It is **not** a signed artifact: a
 * determined local operator with write access to the evidence directory can
 * forge any of it. The controls are procedural (reviewed producer, verified
 * transcript, no customer data in evidence), not cryptographic.
 */
function recoveryProof(root, sourceSha256, releaseIdentity, sourceRegistry, sourceRegistryFiles, producerSourceHashes) {
  const proofPath = workingTreeRecoveryProofPath(root, sourceSha256)
  if (!existsSync(proofPath)) {
    // The operator-facing message names the required path and the reviewed
    // producer. It never enumerates the required field names: that list would
    // be a recipe for hand-writing a passing proof while the producer could
    // not run.
    throw new Error(
      `Release-scoped recovery proof is required at ${proofPath}. `
      + 'Produce it with the reviewed producer scripts/verify-working-tree-recovery.mjs; '
      + 'the proof and its producer attempt transcript must both be present.',
    )
  }
  const bytes = readFileSync(proofPath)
  let proof
  try {
    proof = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error(`Release-scoped recovery proof is invalid JSON at ${proofPath}; diagnostics suppressed.`)
  }
  // The digest of the admitted proof bytes, exactly as they were read. It is
  // the same digest the preflight evidence records as `proofSha256`.
  const proofSha256 = createHash('sha256').update(bytes).digest('hex')
  assertReleaseScopedRecoveryProofAdmission(proof, {
    sourceSha256,
    releaseIdentity,
    sourceRegistry,
    sourceRegistryFiles,
    producerSourceHashes,
  })
  // The pinned registry anchors are enforced on the admitted proof itself, so a
  // proof whose migration registry or migration-127 checksum drifted from the
  // reviewed anchors can never be admitted by the promoter.
  assertWorkingTreeRecoveryProofPinnedRegistry(proof)
  // The proof alone is no longer admissible: it must be bound to the producer's
  // own latest attempt transcript, and that transcript must name the digest of
  // the admitted proof bytes. A transcript from a different rehearsal names a
  // different digest and is therefore rejected.
  const evidenceDirectory = workingTreeRecoveryProofEvidenceDirectory(root, sourceSha256)
  const attemptLogs = workingTreeRecoveryProofAttemptLogs(evidenceDirectory)
  if (attemptLogs.length === 0) {
    throw new Error(
      `The release-scoped recovery proof requires the producer attempt transcript in ${evidenceDirectory}; `
      + 'run the reviewed producer scripts/verify-working-tree-recovery.mjs with --execute first.',
    )
  }
  const transcript = assertWorkingTreeRecoveryProofAttemptTranscript(evidenceDirectory, {
    attempt: attemptLogs[attemptLogs.length - 1].attempt,
    proofSha256,
  })
  return {
    proof,
    proofPath,
    proofSha256,
    transcript,
  }
}

function publicPreflightEvidence(preflight) {
  return {
    schemaVersion: 1,
    status: 'preflight-passed',
    sourceSha256: preflight.sourceSha256,
    releaseIdentity: preflight.releaseIdentity,
    runtimeVerification: preflight.dockerVerify,
    candidate: {
      tag: WORKING_TREE_CANDIDATE_TAG,
      imageId: preflight.candidateImageId,
      labels: workingTreeBuildLabels({
        sourceSha256: preflight.sourceSha256,
        releaseIdentity: preflight.releaseIdentity,
      }),
    },
    live: {
      containerId: preflight.app.Id,
      imageId: preflight.liveImageId,
      runtimeReleaseIdentity: preflight.priorReleaseIdentity,
      imageRevision: preflight.priorImageRevision,
      imageRuntimeIdentityMismatch: preflight.imageRuntimeIdentityMismatch,
    },
    rollback: {
      tag: WORKING_TREE_ROLLBACK_TAG,
      imageId: preflight.rollbackImageId,
    },
    environmentContinuity: preflight.environmentContinuity,
    supportingServices: preflight.supporting.map(container => ({
      name: container.Name.replace(/^\//, ''),
      id: container.Id,
      image: container.Image,
      startedAt: container.State?.StartedAt ?? null,
      health: container.State?.Health?.Status ?? null,
      mounts: canonicalMounts(container.Mounts ?? []),
    })),
    migration: preflight.migrationEvidence,
    activeJobCounts: preflight.activeJobCounts,
    hostFreeBytes: preflight.hostFreeBytes,
    recoveryProof: {
      path: path.relative(preflight.root, preflight.proofPath),
      status: 'passed',
      sourceRegistryCount: preflight.sourceRegistry.length,
      sourceRegistrySha256: preflight.sourceRegistrySha256,
      proofSha256: preflight.proofSha256,
      transcriptAttempt: preflight.transcript.attempt,
      transcriptPath: path.relative(preflight.root, preflight.transcript.path),
      transcriptSha256: preflight.transcript.sha256,
      cleanupComplete: true,
    },
    rollbackRegistry: {
      actualLedgerCount: preflight.ledger.length,
      fileCount: preflight.rollbackFiles.length,
      derivedFromActualLedger: true,
    },
  }
}

async function collectPreflight(root, sourceSha256) {
  // Runtime verification starts here: docker:verify is read-only and must be
  // the first runtime inspection of every preflight.
  const dockerVerify = await runDockerVerify(root)

  const currentSourceSha256 = computeWorkingTreeSourceHash({ cwd: root })
  assert.equal(currentSourceSha256, sourceSha256, 'The current working-tree source hash differs from the supplied candidate source hash.')

  const evidenceDirectory = workingTreeEvidenceDirectory(root, sourceSha256)
  const buildEvidence = readJson(path.join(evidenceDirectory, 'candidate-build.json'), 'Candidate build evidence')
  assert.equal(buildEvidence.sourceSha256, sourceSha256, 'Candidate build evidence belongs to a different source hash.')
  const releaseIdentity = workingTreeReleaseIdentity(sourceSha256)
  assert.equal(buildEvidence.releaseIdentity, releaseIdentity, 'Candidate build evidence has an inconsistent release identity.')

  const sourceFiles = workingTreeMigrationRegistry(root)
  const sourceRegistry = workingTreeMigrationEvidence(sourceFiles)
  assert.deepEqual(
    buildEvidence.migrationRegistry?.checksums,
    sourceRegistry,
    'Candidate build evidence does not contain the exact current migration registry.',
  )

  // The strict admission gate binds the proof to the candidate migration files
  // individually, not only to the registry checksums.
  const sourceRegistryFiles = sourceFiles.map(file => ({
    version: file.version,
    path: file.path,
    checksum: file.checksum,
  }))
  assert.equal(
    sourceRegistryFiles.length,
    WORKING_TREE_MIGRATION_TARGET_COUNT,
    'The candidate migration source-file registry must contain exactly 132 files.',
  )

  // The producer source closure is hashed over the current working tree, so a
  // changed producer invalidates an already written proof.
  const producerSourceContents = Object.fromEntries(
    WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES.map(file => [file, readFileSync(path.join(root, file))]),
  )
  const producerSourceHashes = recoveryProofSourceHashesForFiles(
    WORKING_TREE_RECOVERY_PROOF_SOURCE_FILES,
    producerSourceContents,
  )

  const containers = inspectContainers()
  const app = assertExactlyOneApplicationContainer(containers)
  const project = app.Config?.Labels?.['com.docker.compose.project']
  assert.equal(project, PROJECT_NAME, 'The live application must belong to the existing metardu production project.')
  const liveImageId = app.Image
  assert.match(liveImageId, /^sha256:[a-f0-9]{64}$/, 'The live application must resolve to an exact image id.')

  const candidateImageId = imageIdForTag(WORKING_TREE_CANDIDATE_TAG)
  assert.ok(candidateImageId, `Candidate image ${WORKING_TREE_CANDIDATE_TAG} is missing.`)
  assert.equal(candidateImageId, buildEvidence.imageId, 'The candidate tag does not resolve to the built image id.')
  const candidateImage = inspectImage(WORKING_TREE_CANDIDATE_TAG)
  const candidateLabels = candidateImage.Config?.Labels ?? {}
  assertCandidateBuildEvidence({
    evidence: buildEvidence,
    liveImageId,
    imageLabels: candidateLabels,
  })
  assertSourceLabelEvidenceConsistency({
    evidence: buildEvidence,
    imageLabels: candidateLabels,
  })

  const rollbackImageId = imageIdForTag(WORKING_TREE_ROLLBACK_TAG)
  assert.equal(rollbackImageId, liveImageId, 'rollback-current must resolve to the exact live production image.')
  assert.equal(buildEvidence.rollback?.image, liveImageId, 'Candidate build evidence recorded a different rollback image.')

  const liveEnvironment = environmentOf(app)
  const liveImage = inspectImage(liveImageId)
  const liveRevision = liveImage.Config?.Labels?.['org.opencontainers.image.revision'] ?? null

  const config = composeConfig(root, project)
  const baseEnvironment = config.services?.['metardu-app']?.environment
  assert.ok(baseEnvironment && typeof baseEnvironment === 'object' && !Array.isArray(baseEnvironment), 'Resolved application environment is required.')

  // The prior release identity is the baseline this promotion replaces. A live
  // image revision that differs from the runtime identity is recorded, not
  // rejected: the promotion performs that correction.
  const identityBaseline = assertPriorReleaseIdentityBaseline({
    liveEnvironment,
    resolvedBaseEnvironment: baseEnvironment,
    liveImageRevision: liveRevision,
  })
  const priorReleaseIdentity = identityBaseline.priorReleaseIdentity

  const appOverride = forwardPromotionService(WORKING_TREE_CANDIDATE_TAG, releaseIdentity, app)

  // Render the override that will be used and resolve the merged Compose
  // configuration read-only: both services must merge to the candidate.
  // That resolved configuration is the substantive pairing proof; a constant
  // compared with itself is not.
  const override = {
    services: {
      'metardu-app': appOverride,
      'metardu-db-migrate': {
        image: WORKING_TREE_CANDIDATE_TAG,
      },
    },
  }
  const overridePath = path.join(evidenceDirectory, 'candidate.override.yml')
  mkdirSync(evidenceDirectory, { recursive: true })
  writeFileSync(overridePath, `${JSON.stringify(override, null, 2)}\n`)
  const resolvedConfig = dockerJson([
    'compose',
    '-p', project,
    '-f', path.join(root, 'docker-compose.yml'),
    '-f', overridePath,
    'config',
    '--format', 'json',
  ], { timeout: 60_000 })
  assertResolvedCandidateServices({
    resolvedServices: resolvedConfig.services,
    candidateTag: WORKING_TREE_CANDIDATE_TAG,
    candidateImageId,
  })

  const resolvedCandidateEnvironment = {
    ...baseEnvironment,
    ...appOverride.environment,
  }
  const environmentContinuity = assertEnvironmentContinuity(
    liveEnvironment,
    resolvedCandidateEnvironment,
    { releaseIdentity },
  )

  // Inventory only: exactly one container per required supporting service in
  // the production project. The real before/after comparison runs after the
  // promotion.
  const supporting = supportingContainers(containers)

  const ledger = await withAdmin(containers, migrationLedger)
  const migrationEvidence = assertWorkingTreeMigrationBaseline({
    sourceFiles,
    sourceRegistry,
    ledger,
  })
  const rollbackFiles = selectWorkingTreeRollbackRegistry(sourceFiles, ledger)

  const activeJobCounts = await withAdmin(containers, collectActiveJobCounts)
  assert.ok(
    Object.values(activeJobCounts).every(count => count === 0),
    'Active background, render, or drone jobs block promotion.',
  )

  const freeBytes = hostFreeBytes(root)
  assertBuildSpace(freeBytes)

  const { proof, proofPath, proofSha256, transcript } = recoveryProof(
    root,
    sourceSha256,
    releaseIdentity,
    sourceRegistry,
    sourceRegistryFiles,
    producerSourceHashes,
  )
  const sourceRegistrySha256 = createHash('sha256').update(JSON.stringify(sourceRegistry)).digest('hex')

  return {
    root,
    sourceSha256,
    releaseIdentity,
    evidenceDirectory,
    buildEvidence,
    sourceFiles,
    sourceRegistry,
    proof,
    proofPath,
    proofSha256,
    transcript,
    sourceRegistrySha256,
    dockerVerify,
    override,
    overridePath,
    containers,
    app,
    project,
    liveImageId,
    candidateImageId,
    candidateLabels,
    rollbackImageId,
    priorReleaseIdentity,
    priorImageRevision: identityBaseline.priorImageRevision,
    imageRuntimeIdentityMismatch: identityBaseline.imageRuntimeIdentityMismatch,
    liveEnvironment,
    baseEnvironment,
    appOverride,
    environmentContinuity,
    supporting,
    ledger,
    migrationEvidence,
    rollbackFiles,
    activeJobCounts,
    hostFreeBytes: freeBytes,
  }
}

async function runPreflight(root, sourceSha256) {
  const preflight = await collectPreflight(root, sourceSha256)
  const evidenceDirectory = workingTreeEvidenceDirectory(root, sourceSha256)
  mkdirSync(evidenceDirectory, { recursive: true })
  const evidencePath = path.join(evidenceDirectory, 'preflight.json')
  writeFileSync(evidencePath, `${JSON.stringify(publicPreflightEvidence(preflight), null, 2)}\n`)
  console.log(JSON.stringify({
    status: 'preflight-passed',
    sourceSha256,
    releaseIdentity: preflight.releaseIdentity,
    candidateImageId: preflight.candidateImageId,
    liveImageId: preflight.liveImageId,
    migrationCount: preflight.ledger.length,
    recoveryProofPath: preflight.proofPath,
  }))
  return preflight
}

function backupArchiveInventory() {
  return docker([
    'exec',
    'metardu-backup',
    'find',
    '/backups',
    '-maxdepth', '1',
    '-type', 'f',
    '(',
    '-name', '*.sql.gz',
    '-o', '-name', '*.tar.gz',
    ')',
    '-print',
  ]).split(/\r?\n/).filter(Boolean).sort()
}

function takeBackupCheckpoint() {
  const beforeInventory = backupArchiveInventory()
  const output = docker([
    'exec',
    '-e', 'BACKUP_RETENTION=36500',
    'metardu-backup',
    '/app/scripts/backup.sh',
  ], { timeout: 120_000 })
  const afterInventory = backupArchiveInventory()
  return assertPromotionBackupCheckpoint({
    output,
    beforeInventory,
    afterInventory,
  })
}

export async function paymentHistoryBaseline(client) {
  const rows = (await client.query(`
    SELECT
      count(*)::integer AS "totalRows",
      md5(COALESCE(string_agg(
        md5((to_jsonb(payment_history)
          - 'transaction_id'
          - 'checkout_request_id'
          - 'phone_number'
          - 'last_reconcile_attempt_at')::text),
        '' ORDER BY id::text
      ), '')) AS "preservedFingerprint"
    FROM public.payment_history AS payment_history
  `)).rows[0]
  // The row sets are read through the shared statements, so the promotion path
  // and the recovery producer measure exactly the same rows. The predicates
  // read the migration-127 columns through `to_jsonb(...)`, where a missing
  // key is simply NULL, which keeps them valid on the pre-migration schema
  // this baseline is measured against.
  const checkoutEligibleIds = (await client.query(
    `SELECT id::text AS id FROM public.payment_history t WHERE ${MIGRATION_127_ROW_SET_SQL.checkoutEligible} ORDER BY id::text`,
  )).rows.map(row => row.id)
  const checkout = (await client.query(`
    SELECT
      count(*)::integer AS "checkoutEligibleRows",
      count(DISTINCT transaction_id)::integer AS "checkoutDistinctEligibleIdentities"
    FROM public.payment_history t
    WHERE ${MIGRATION_127_ROW_SET_SQL.checkoutEligible}
  `)).rows[0]
  const phoneEligibleIds = (await client.query(
    `SELECT id::text AS id FROM public.payment_history t WHERE ${MIGRATION_127_ROW_SET_SQL.phoneEligible} ORDER BY id::text`,
  )).rows.map(row => row.id)
  const phone = (await client.query(`
    SELECT count(*)::integer AS "phoneEligibleRows"
    FROM public.payment_history t
    WHERE ${MIGRATION_127_ROW_SET_SQL.phoneEligible}
  `)).rows[0]
  // The per-row digests of the identities the migration moves. They are read
  // through the shared statements, so the live promotion path and the clone
  // rehearsal prove the backfill by value in exactly the same way.
  const checkoutIdentity = (await client.query(
    MIGRATION_127_ROW_SET_SQL.eligibleIdentityDigest,
    [checkoutEligibleIds],
  )).rows[0]
  const phoneIdentity = (await client.query(
    MIGRATION_127_ROW_SET_SQL.phoneSourceDigest,
    [phoneEligibleIds],
  )).rows[0]
  // The eligible id lists and the eligibility predicates have to describe the
  // same rows; otherwise the before- and after-state digests would not be
  // comparable.
  assert.equal(
    checkoutIdentity.count,
    checkout.checkoutEligibleRows,
    'The eligible checkout id list does not match the eligible checkout row count.',
  )
  assert.equal(
    checkoutIdentity.identities,
    checkout.checkoutDistinctEligibleIdentities,
    'The eligible checkout id list does not match the eligible checkout identity count.',
  )
  assert.equal(
    phoneIdentity.count,
    phone.phoneEligibleRows,
    'The eligible phone id list does not match the eligible phone row count.',
  )
  const other = (await client.query(
    MIGRATION_127_ROW_SET_SQL.otherDigest,
    [checkoutEligibleIds],
  )).rows[0]
  // The audit trail the migration is expected to grow. The count is measured
  // before the migration so the delta can be reconciled afterwards.
  const audit = (await client.query(
    `SELECT count(*)::integer AS count FROM public.audit_logs`,
  )).rows[0]
  // Migration 005 attaches the FOR EACH ROW audit trigger to
  // payment_history, so migration 127's two UPDATE statements grow the trail
  // by exactly one row per migrated row. The trigger is verified HERE, before
  // the migration runs: a missing or disabled trigger is refused while the
  // database is still untouched, instead of aborting the promotion after the
  // migration has already been applied.
  const auditTrigger = (await client.query(`
    SELECT count(*)::integer AS count
    FROM pg_trigger trigger_metadata
    JOIN pg_class trigger_class ON trigger_class.oid = trigger_metadata.tgrelid
    JOIN pg_namespace trigger_namespace ON trigger_namespace.oid = trigger_class.relnamespace
    WHERE trigger_namespace.nspname = 'public'
      AND trigger_class.relname = 'payment_history'
      AND trigger_metadata.tgname = 'audit_payment_history'
      AND NOT trigger_metadata.tgisinternal
      AND trigger_metadata.tgenabled <> 'D'
  `)).rows[0]
  assert.ok(
    auditTrigger.count >= 1,
    'The payment_history audit trigger is missing or disabled; the audit-trail '
    + 'reconciliation cannot be proven, so the migration is refused before it runs.',
  )
  const rls = (await client.query(`
    SELECT relation.relrowsecurity AS "rlsEnabled", relation.relforcerowsecurity AS "rlsForced"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = 'payment_history'
  `)).rows[0]
  const policies = (await client.query(`
    SELECT count(*)::integer AS count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_history'
  `)).rows[0]
  assert.ok(rls, 'payment_history RLS evidence is required.')
  return {
    totalRows: rows.totalRows,
    preservedFingerprint: rows.preservedFingerprint,
    checkoutEligibleRows: checkout.checkoutEligibleRows,
    checkoutDistinctEligibleIdentities: checkout.checkoutDistinctEligibleIdentities,
    checkoutEligibleIds,
    checkoutIdentityDigest: checkoutIdentity.digest,
    phoneEligibleRows: phone.phoneEligibleRows,
    phoneEligibleIds,
    phoneIdentityDigest: phoneIdentity.digest,
    ineligibleDigest: other.digest,
    auditRowsBefore: audit.count,
    rlsEnabled: rls.rlsEnabled,
    rlsForced: rls.rlsForced,
    policyCount: policies.count,
  }
}

export async function paymentHistoryAfter(client, baseline) {
  const rows = (await client.query(`
    SELECT
      count(*)::integer AS "totalRows",
      md5(COALESCE(string_agg(
        md5((to_jsonb(payment_history)
          - 'transaction_id'
          - 'checkout_request_id'
          - 'phone_number'
          - 'last_reconcile_attempt_at')::text),
        '' ORDER BY id::text
      ), '')) AS "preservedFingerprint",
      count(*) FILTER (WHERE checkout_request_id IS NOT NULL)::integer AS "checkoutBackfilledRows",
      count(DISTINCT checkout_request_id) FILTER (WHERE checkout_request_id IS NOT NULL)::integer AS "checkoutDistinctBackfilledIdentities",
      count(*) FILTER (WHERE phone_number IS NOT NULL)::integer AS "phoneBackfilledRows"
    FROM public.payment_history AS payment_history
  `)).rows[0]
  const duplicates = (await client.query(`
    SELECT count(*)::integer AS count
    FROM (
      SELECT checkout_request_id
      FROM public.payment_history
      WHERE checkout_request_id IS NOT NULL
      GROUP BY checkout_request_id
      HAVING count(*) > 1
    ) duplicate_groups
  `)).rows[0]
  // The digest of every row the migration did not rewrite. It is measured
  // against the pre-migration eligible id list, so a transaction id that
  // changed on a row outside that set cannot hide.
  const other = (await client.query(
    MIGRATION_127_ROW_SET_SQL.otherDigest,
    [baseline.checkoutEligibleIds],
  )).rows[0]
  // The per-row digests of the identities the migration moved. They are read
  // through the shared statements, so the live promotion path and the clone
  // rehearsal prove the backfill by value in exactly the same way.
  const checkoutIdentity = (await client.query(
    MIGRATION_127_ROW_SET_SQL.rewrittenIdentityDigest,
    [baseline.checkoutEligibleIds],
  )).rows[0]
  const phoneIdentity = (await client.query(
    MIGRATION_127_ROW_SET_SQL.phoneValueDigest,
    [baseline.phoneEligibleIds],
  )).rows[0]
  // The audit trail after the migration, so its growth can be reconciled
  // against the number of migrated rows.
  const audit = (await client.query(
    `SELECT count(*)::integer AS count FROM public.audit_logs`,
  )).rows[0]
  return {
    totalRows: rows.totalRows,
    preservedFingerprint: rows.preservedFingerprint,
    checkoutBackfilledRows: rows.checkoutBackfilledRows,
    checkoutDistinctBackfilledIdentities: rows.checkoutDistinctBackfilledIdentities,
    phoneBackfilledRows: rows.phoneBackfilledRows,
    duplicateCheckoutIdentityGroups: duplicates.count,
    checkoutIdentityDigest: checkoutIdentity.digest,
    phoneIdentityDigest: phoneIdentity.digest,
    ineligibleDigest: other.digest,
    auditRowsAfter: audit.count,
  }
}

/**
 * The migration-127 schema evidence.
 *
 * The statements are shared with the recovery producer through
 * `MIGRATION_127_SCHEMA_EVIDENCE_SQL`, so the promotion path and the proof
 * path read the evidence in exactly the same shape and cannot drift apart.
 */
export async function migration127SchemaEvidence(client) {
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

async function assertRestrictedRuntimeRole(appEnvironment) {
  const client = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    database: appEnvironment.DB_NAME,
    user: appEnvironment.DB_USER,
    password: appEnvironment.DB_PASSWORD,
    connectionTimeoutMillis: 10_000,
  })
  await client.connect()
  try {
    const identity = (await client.query(RUNTIME_ROLE_QUERY)).rows[0]
    assert.equal(runtimeDatabaseRoleFailure(identity), null)
    return {
      nonOwner: true,
      nonSuperuser: true,
      noBypassRls: true,
      noDdl: true,
      noLedgerMutation: true,
      safeMembershipOnly: true,
    }
  } finally {
    await client.end()
  }
}

function phase(receipt, name, detail = {}) {
  receipt.phases.push({ name, passed: true, ...detail })
}

function savePromotionReceipt(pathname, receipt) {
  writeFileSync(pathname, `${JSON.stringify(receipt, null, 2)}\n`)
}

function previousPromotionAttempts(evidenceDirectory, sourceSha256) {
  const receiptPath = path.join(evidenceDirectory, 'promotion.json')
  if (!existsSync(receiptPath)) return []
  const receipt = readJson(receiptPath, 'Existing promotion evidence')
  assert.equal(receipt.sourceSha256, sourceSha256, 'Existing promotion evidence belongs to a different source hash.')
  return Array.isArray(receipt.attempts) ? receipt.attempts : []
}

/**
 * The preserved application log is streamed straight from the container into
 * the existing backup volume: no size cap, no in-memory payload, and the
 * noclobber/umask 077 guarantees are preserved. The writer's stderr is
 * redirected into the same private archive so it can never fill the pipe
 * buffer and block the promotion with the application already stopped.
 */
async function preserveApplicationLogs(preflight, attempt) {
  const archive = `/backups/app-before-working-tree-${preflight.sourceSha256}-attempt-${attempt}.log`
  const commands = workingTreeApplicationLogCommands({ archive })
  return streamApplicationLog({ commands, archive })
}

function composePromotion(root, preflight, overridePath, service, detached) {
  const args = [
    'compose',
    '-p', preflight.project,
    '-f', path.join(root, 'docker-compose.yml'),
    '-f', overridePath,
    'up',
  ]
  if (detached) args.push('-d')
  args.push('--no-deps', '--no-build', '--pull', 'never', '--force-recreate')
  if (detached) args.push('--wait', '--wait-timeout', '120')
  else args.push('--exit-code-from', service)
  args.push(service)
  return docker(args, { timeout: detached ? 150_000 : 120_000 })
}

function inspectMigrationContainer(candidateImageId) {
  const containers = dockerJson(['inspect', 'metardu-db-migrate'])
  assert.equal(containers.length, 1, 'Exactly one one-shot migration container is required.')
  const migration = containers[0]
  assert.equal(migration.Image, candidateImageId, 'The migration service must use the exact candidate image.')
  assert.equal(migration.State?.Status, 'exited', 'The migration service must have completed.')
  assert.equal(migration.State?.ExitCode, 0, 'The migration service must exit successfully.')
  return migration
}

async function fetchStatus(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  })
  return response
}

function parseEnvReleaseIdentity(text) {
  const match = text.match(/(^|\r?\n)METARDU_BUILD_SHA=([^\r\n]*)/)
  return match?.[2] ? match[2] : null
}

/**
 * The rollback registry directory is reused only when it already holds exactly
 * the selected registry file set; otherwise the promotion fails closed.
 */
function materialiseRollbackRegistry(registryDirectory, selected) {
  mkdirSync(path.dirname(registryDirectory), { recursive: true })
  let reused = false
  try {
    mkdirSync(registryDirectory, { recursive: false })
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    assertRollbackRegistryFileSet({
      entries: readdirSync(registryDirectory),
      selectedFiles: selected,
    })
    for (const file of selected) {
      const stored = readFileSync(path.join(registryDirectory, path.basename(file.path)))
      // The comparison is a digest comparison: the migration SQL never
      // reaches an error payload, a receipt, or a log.
      assertRollbackRegistryFileContent({
        stored,
        expected: file.content,
        version: file.version,
      })
    }
    reused = true
  }
  if (!reused) {
    for (const file of selected) {
      writeFileSync(path.join(registryDirectory, path.basename(file.path)), file.content)
    }
  }
  return { reused }
}

async function rollbackPromotion(preflight, receipt, failure) {
  const actualLedger = await withAdmin(preflight.containers, migrationLedger)
  const migrationCompleted = rollbackMigrationCompleted(actualLedger)
  const selected = selectWorkingTreeRollbackRegistry(preflight.sourceFiles, actualLedger)
  const ledgerKey = createHash('sha256').update(JSON.stringify(actualLedger)).digest('hex').slice(0, 16)
  const registryDirectory = path.join(
    preflight.evidenceDirectory,
    'rollback-registry',
    `attempt-${receipt.attempt}`,
    ledgerKey,
  )
  const registry = materialiseRollbackRegistry(registryDirectory, selected)
  receipt.rollbackRegistry = {
    actualLedgerCount: actualLedger.length,
    fileCount: selected.length,
    derivedFromActualLedger: true,
    directory: path.relative(preflight.root, registryDirectory),
    reusedExistingDirectory: registry.reused,
  }

  const override = workingTreeRollbackOverride({
    rollbackImage: WORKING_TREE_ROLLBACK_TAG,
    priorReleaseIdentity: preflight.priorReleaseIdentity ?? 'unknown',
    registryDirectory,
  })
  const overridePath = path.join(preflight.evidenceDirectory, `rollback-attempt-${receipt.attempt}.override.yml`)
  writeFileSync(overridePath, `${JSON.stringify(override, null, 2)}\n`)

  const restorationFailures = []
  if (receipt.latestTagChanged) {
    try {
      if (receipt.priorLatestImageId) {
        docker(['image', 'tag', receipt.priorLatestImageId, 'metardu-metardu-app:latest'])
      } else {
        docker(['image', 'rm', 'metardu-metardu-app:latest'])
      }
      receipt.latestTagRestored = true
    } catch (error) {
      restorationFailures.push(error)
    }
  }
  if (receipt.envChanged) {
    try {
      const envPath = path.join(preflight.root, '.env')
      const current = readFileSync(envPath, 'utf8')
      writeFileSync(envPath, restoreEnvReleaseIdentity(current, receipt.priorEnvReleaseIdentity))
      receipt.envReleaseIdentityRestored = true
    } catch (error) {
      restorationFailures.push(error)
    }
  }

  composePromotion(preflight.root, preflight, overridePath, 'metardu-app', true)
  composePromotion(preflight.root, preflight, overridePath, 'metardu-db-migrate', false)
  const migration = inspectMigrationContainer(preflight.liveImageId)

  const containers = inspectContainers()
  const restoredApp = assertExactlyOneApplicationContainer(containers)
  assert.equal(restoredApp.Image, preflight.liveImageId, 'Rollback must restore the exact live production image.')
  assert.equal(restoredApp.State?.Health?.Status, 'healthy', 'The rolled-back application must be healthy.')
  assertRollbackAppMounts({
    originalMounts: preflight.app.Mounts ?? [],
    restoredMounts: restoredApp.Mounts ?? [],
    registryDirectory,
  })
  assertSupportingServicesPreserved(
    preflight.supporting,
    supportingContainers(containers),
    { supportingNames: SUPPORTING_SERVICE_NAMES },
  )

  const ledgerAfter = await withAdmin(containers, migrationLedger)
  assertRollbackLedgerExpectation({
    actualLedger: ledgerAfter,
    beforeLedger: preflight.ledger,
    migrationCompleted,
  })

  assert.equal(
    restorationFailures.length,
    0,
    `Release identity restoration failed: ${restorationFailures.map(error => boundedFailure(error).message).join('; ')}`,
  )

  receipt.rollback = {
    status: 'healthy',
    imageId: preflight.liveImageId,
    migrationImageId: migration.Image,
    migrationExitCode: migration.State.ExitCode,
    ledgerCount: ledgerAfter.length,
    supportingServicesPreserved: true,
    databaseArchiveRestored: false,
    migrationReversedByHand: false,
  }
  receipt.status = 'rolled-back'
  receipt.failure = boundedFailure(failure)
}

function assertCanonicalAppMounts(before, after) {
  assert.deepEqual(
    canonicalMounts(after.Mounts ?? []),
    canonicalMounts(before.Mounts ?? []),
    'The application upload/data mounts changed during promotion.',
  )
}

function boundedFailure(error) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: message.split(/\r?\n/, 1)[0].slice(0, 500),
  }
}

async function promote(root, sourceSha256) {
  const evidenceDirectory = workingTreeEvidenceDirectory(root, sourceSha256)
  mkdirSync(evidenceDirectory, { recursive: true })
  const priorAttempts = previousPromotionAttempts(evidenceDirectory, sourceSha256)
  const attempt = priorAttempts.length + 1
  const receiptPath = path.join(evidenceDirectory, 'promotion.json')
  const receipt = {
    schemaVersion: 1,
    status: 'preflight-running',
    sourceSha256,
    releaseIdentity: workingTreeReleaseIdentity(sourceSha256),
    attempt,
    attempts: [
      ...priorAttempts,
      { attempt, startedAt: new Date().toISOString(), status: 'running' },
    ],
    phases: [],
    applicationStopAttempted: false,
    applicationStopped: false,
    migrationCompleted: false,
    latestTagChanged: false,
    envChanged: false,
    productionWritesThroughApplication: false,
  }
  savePromotionReceipt(receiptPath, receipt)

  let preflight
  try {
    preflight = await collectPreflight(root, sourceSha256)
    writeFileSync(
      path.join(evidenceDirectory, 'preflight.json'),
      `${JSON.stringify(publicPreflightEvidence(preflight), null, 2)}\n`,
    )
    receipt.status = 'preflight-passed'
    receipt.releaseIdentity = preflight.releaseIdentity
    receipt.priorLatestImageId = imageIdForTag('metardu-metardu-app:latest')
    receipt.priorEnvReleaseIdentity = null
    const preflightEnvPath = path.join(root, '.env')
    assert.ok(existsSync(preflightEnvPath), 'The local .env file is required before promotion.')
    receipt.priorEnvReleaseIdentity = parseEnvReleaseIdentity(readFileSync(preflightEnvPath, 'utf8'))
    savePromotionReceipt(receiptPath, receipt)
    phase(receipt, 'complete read-only preflight passed immediately before mutation')

    receipt.applicationStopAttempted = true
    docker(['stop', '--timeout', '20', 'metardu-app'], { timeout: 40_000 })
    receipt.applicationStopped = true
    phase(receipt, 'only the existing application container was stopped')
    savePromotionReceipt(receiptPath, receipt)

    receipt.previousApplicationLogArchive = await preserveApplicationLogs(preflight, attempt)
    phase(receipt, 'previous application logs were streamed privately into the backup volume without printing the payload')
    savePromotionReceipt(receiptPath, receipt)

    receipt.promotionCheckpoint = takeBackupCheckpoint()
    phase(receipt, 'fresh database/uploads backup checkpoint passed with prior archives retained')
    savePromotionReceipt(receiptPath, receipt)

    const before = await withAdmin(preflight.containers, paymentHistoryBaseline)
    receipt.paymentHistoryBefore = {
      totalRows: before.totalRows,
      checkoutEligibleRows: before.checkoutEligibleRows,
      checkoutDistinctEligibleIdentities: before.checkoutDistinctEligibleIdentities,
      phoneEligibleRows: before.phoneEligibleRows,
      rlsEnabled: before.rlsEnabled,
      rlsForced: before.rlsForced,
      policyCount: before.policyCount,
      fingerprintRetainedInMemoryOnly: true,
    }
    phase(receipt, 'customer-data-free payment_history preservation baseline captured')
    savePromotionReceipt(receiptPath, receipt)

    const overridePath = preflight.overridePath
    // The candidate tag is mutable while a build runs: the binding is proven
    // again immediately before every Compose mutation.
    assertCandidateTagBinding({
      candidateTag: WORKING_TREE_CANDIDATE_TAG,
      expectedImageId: preflight.candidateImageId,
      actualImageId: imageIdForTag(WORKING_TREE_CANDIDATE_TAG),
    })
    composePromotion(root, preflight, overridePath, 'metardu-db-migrate', false)
    const migration = inspectMigrationContainer(preflight.candidateImageId)
    receipt.migrationService = {
      imageId: migration.Image,
      exitCode: migration.State.ExitCode,
    }

    const afterLedger = await withAdmin(preflight.containers, migrationLedger)
    const migrationAfter = assertWorkingTreeMigrationAfter({
      sourceFiles: preflight.sourceFiles,
      sourceRegistry: preflight.sourceRegistry,
      beforeLedger: preflight.ledger,
      afterLedger,
    })
    receipt.migrationCompleted = true
    receipt.migrationStateAfter = migrationAfter

    const schema = await withAdmin(preflight.containers, migration127SchemaEvidence)
    assertMigration127SchemaContract({
      ...schema,
      beforePolicyCount: before.policyCount,
    })
    receipt.migration127 = {
      columns: schema.columns,
      indexes: schema.indexes,
      uniqueCheckoutRequestId: schema.uniqueCheckoutRequestId,
      rlsEnabled: schema.rlsEnabled,
      rlsForced: schema.rlsForced,
      policyCountUnchanged: schema.policyCount === before.policyCount,
    }

    const after = await withAdmin(preflight.containers, paymentHistoryAfter, before)
    const preservation = assertPaymentHistoryPreservation({ before, after })
    // The transaction id of every row the migration did not rewrite has to be
    // untouched. The digest is customer derived: it is compared by value and
    // never rendered into a message, a receipt or a log.
    assert.equal(
      after.ineligibleDigest,
      before.ineligibleDigest,
      'An ineligible payment_history transaction id changed during the migration.',
    )
    // The backfill is proven by value, not only by count: the digest of the
    // eligible rows before the migration has to equal the digest of the same
    // rows afterwards. The digests are customer derived: they are compared by
    // value and never rendered into a message, a receipt or a log.
    assert.equal(
      after.checkoutIdentityDigest,
      before.checkoutIdentityDigest,
      'A migrated checkout identity differs from its pre-migration transaction id.',
    )
    assert.equal(
      after.phoneIdentityDigest,
      before.phoneIdentityDigest,
      'A migrated phone number differs from its pre-migration metadata value.',
    )
    // The payment_history audit trigger writes one audit_logs row per affected
    // row per UPDATE statement. Migration 127 runs exactly two UPDATE
    // statements, so the trail has to grow by exactly one row per migrated
    // row. The expected count is derived from the measured live baseline.
    const expectedAuditRows = before.checkoutEligibleRows + before.phoneEligibleRows
    assert.equal(
      after.auditRowsAfter - before.auditRowsBefore,
      expectedAuditRows,
      'The payment_history audit trail did not grow by exactly one row per migrated row.',
    )
    receipt.customerPreservation = {
      ...preservation,
      totalRows: after.totalRows,
      checkoutBackfilledRows: after.checkoutBackfilledRows,
      phoneBackfilledRows: after.phoneBackfilledRows,
      checkoutIdentityValuesPreserved: true,
      phoneValuesPreserved: true,
      ineligibleRowsPreserved: true,
      auditTrailReconciled: true,
      rowPayloadLogged: false,
      identityPayloadLogged: false,
    }
    receipt.runtimeRole = await assertRestrictedRuntimeRole(preflight.liveEnvironment)
    phase(receipt, 'migration 127 schema, RLS, ledger, runtime role, and customer preservation checks passed')
    savePromotionReceipt(receiptPath, receipt)

    assertCandidateTagBinding({
      candidateTag: WORKING_TREE_CANDIDATE_TAG,
      expectedImageId: preflight.candidateImageId,
      actualImageId: imageIdForTag(WORKING_TREE_CANDIDATE_TAG),
    })
    composePromotion(root, preflight, overridePath, 'metardu-app', true)
    const containers = inspectContainers()
    const updatedApp = assertExactlyOneApplicationContainer(containers)
    assert.equal(updatedApp.Image, preflight.candidateImageId, 'The promoted application must use the exact candidate image.')
    assert.equal(updatedApp.State?.Health?.Status, 'healthy', 'The promoted application must be healthy.')
    assertPromotedContainerReleaseIdentity(updatedApp, preflight.releaseIdentity)
    assertCanonicalAppMounts(preflight.app, updatedApp)
    assertSupportingServicesPreserved(
      preflight.supporting,
      supportingContainers(containers),
      { supportingNames: SUPPORTING_SERVICE_NAMES },
    )
    receipt.applicationAfter = {
      id: updatedApp.Id,
      imageId: updatedApp.Image,
      startedAt: updatedApp.State?.StartedAt ?? null,
      health: updatedApp.State?.Health?.Status ?? null,
    }

    const healthResponse = await fetchStatus('http://127.0.0.1:3000/api/public/health')
    const healthBody = await healthResponse.json()
    assertPromotedHealthContract({
      httpStatus: healthResponse.status,
      body: healthBody,
      releaseIdentity: preflight.releaseIdentity,
    })
    const retiredGet = await fetchStatus('http://127.0.0.1:3000/api/payments/mpesa/verify-till')
    const retiredPost = await fetchStatus('http://127.0.0.1:3000/api/payments/mpesa/verify-till', { method: 'POST' })
    receipt.retiredTillRoute = assertRetiredTillRouteStatus({
      getStatus: retiredGet.status,
      postStatus: retiredPost.status,
    })
    inspectMigrationContainer(preflight.candidateImageId)

    receipt.postPromotionRuntimeVerification = await runDockerVerify(root)
    phase(receipt, 'candidate app, public health, retired route, one-shot migration, and docker:verify passed')

    docker(['image', 'tag', preflight.candidateImageId, 'metardu-metardu-app:latest'])
    receipt.latestTagChanged = true
    const envPath = path.join(root, '.env')
    const envText = readFileSync(envPath, 'utf8')
    const updatedEnv = updateEnvReleaseIdentity(envText, preflight.releaseIdentity)
    writeFileSync(envPath, updatedEnv)
    receipt.envChanged = true
    receipt.status = 'promoted'
    receipt.productionWritesThroughApplication = true
    receipt.attempts.at(-1).status = 'passed'
    receipt.attempts.at(-1).finishedAt = new Date().toISOString()
    phase(receipt, 'latest tag and only the local METARDU_BUILD_SHA env value were updated')
    savePromotionReceipt(receiptPath, receipt)
    console.log(JSON.stringify({
      status: receipt.status,
      sourceSha256,
      releaseIdentity: preflight.releaseIdentity,
      candidateImageId: preflight.candidateImageId,
      migrationCount: afterLedger.length,
      requiredServicesPreserved: true,
    }))
  } catch (error) {
    receipt.failure = boundedFailure(error)
    receipt.attempts.at(-1).status = 'failed'
    receipt.attempts.at(-1).finishedAt = new Date().toISOString()
    if (!receipt.applicationStopAttempted) {
      receipt.status = 'blocked-before-mutation'
      savePromotionReceipt(receiptPath, receipt)
      throw error
    }
    try {
      if (!preflight) throw new Error('Promotion preflight state is unavailable for rollback.')
      await rollbackPromotion(preflight, receipt, error)
    } catch (rollbackError) {
      receipt.status = 'maintenance-failure'
      receipt.rollbackFailure = boundedFailure(rollbackError)
      receipt.rollback = {
        ...(receipt.rollback ?? {}),
        status: 'failed',
        databaseArchiveRestored: false,
        migrationReversedByHand: false,
      }
    }
    savePromotionReceipt(receiptPath, receipt)
    throw error
  }
}

async function main() {
  const { action, sourceSha256 } = parseAction(process.argv.slice(2))
  const root = workingTreeRepositoryRoot({ cwd: process.cwd() })
  normaliseWorkingDirectory(root)
  const lockDirectory = path.join(root, '.cache', 'release-verify')
  mkdirSync(lockDirectory, { recursive: true })
  // The candidate build lock is held for the whole promotion window: no build
  // may retarget the candidate tag while a promotion is in flight.
  await withExclusiveCandidateBuild(workingTreeCandidateBuildLockPath(root), async () => {
    if (action === 'preflight') {
      await runPreflight(root, sourceSha256)
      return
    }
    await promote(root, sourceSha256)
  })
}

// The entry guard resolves the entry point to this module. A direct execution
// (including through a symlink or a differently-cased path) runs the
// promoter; an import stays silent; anything else fails loudly instead of
// exiting zero without having done anything.
const modulePath = fileURLToPath(import.meta.url)
const execution = resolveDirectExecution({ argvPath: process.argv[1], modulePath })
if (execution.mode === 'error') {
  console.error(`promote-production-candidate: FAIL — ${execution.reason}`)
  process.exit(1)
}
if (execution.mode === 'execute') {
  const root = workingTreeRepositoryRoot({ cwd: process.cwd() })
  try {
    assertCanonicalScriptPath({
      modulePath,
      repositoryRoot: root,
      expectedScriptPath: 'scripts/promote-production-candidate.mjs',
    })
  } catch (error) {
    console.error(`promote-production-candidate: FAIL — ${error.message}`)
    process.exit(1)
  }
  await main()
}
