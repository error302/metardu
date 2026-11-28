#!/usr/bin/env node
// Build one reusable working-tree candidate image without creating containers.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { establishRollbackTag } from './release-plan.mjs'
import { withExclusiveCandidateBuild } from './release-build-lock.mjs'
import {
  WORKING_TREE_BUILDER_NAME,
  WORKING_TREE_CANDIDATE_TAG,
  WORKING_TREE_ROLLBACK_TAG,
  assertCanonicalScriptPath,
  assertCandidateBuildEvidence,
  assertCandidateBuildVerification,
  assertExactlyOneApplicationContainer,
  assertRollbackAliasDoesNotConflict,
  computeWorkingTreeSourceHash,
  createExclusiveBuildLog,
  failCandidateBuildReceipt,
  finalizeCandidateBuildReceipt,
  normaliseWorkingDirectory,
  resolveDirectExecution,
  rollbackPreservationAlias,
  workingTreeBuildCommand,
  workingTreeBuildLabels,
  workingTreeCandidateBuildLockPath,
  workingTreeEvidenceDirectory,
  workingTreeMigrationEvidence,
  workingTreeMigrationRegistry,
  workingTreeReleaseIdentity,
  workingTreeRepositoryRoot,
} from './working-tree-release.mjs'

const legacyModes = ['--connector-source', '--workflow-source', '--notice-worker-source']
const requestedLegacyModes = legacyModes.filter(mode => process.argv.includes(mode))
if (requestedLegacyModes.length > 0) {
  throw new Error(`${requestedLegacyModes.join(', ')} are incompatible with the source-bound working-tree contract. No image was built; use the working-tree candidate builder without a legacy evidence namespace.`)
}

function command(binary, args, options = {}) {
  const { rawOutput = false, ...spawnOptions } = options
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
    ...spawnOptions,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${binary} ${args[0]} failed; credential-bearing diagnostics suppressed.`)
  }
  return rawOutput ? result.stdout : result.stdout.trim()
}

const docker = (args, options) => command('docker', args, options)

function imageIdForTag(tag) {
  const ids = docker(['image', 'ls', '--quiet', '--no-trunc', tag])
    .split('\n')
    .map(value => value.trim())
    .filter(Boolean)
  if (ids.length === 0) return null
  assert.equal(ids.length, 1, `Image tag ${tag} must resolve to exactly one image.`)
  assert.match(ids[0], /^sha256:[a-f0-9]{64}$/, `Image tag ${tag} must resolve to an exact image id.`)
  return ids[0]
}

function inspectImage(tag) {
  const images = JSON.parse(docker(['image', 'inspect', tag]))
  assert.equal(images.length, 1, `Image tag ${tag} must resolve to exactly one image.`)
  return images[0]
}

function inspectContainers() {
  const ids = docker(['ps', '-aq']).split('\n').map(value => value.trim()).filter(Boolean)
  return ids.length === 0 ? [] : JSON.parse(docker(['inspect', ...ids]))
}

function saveReceipt(pathname, receipt) {
  writeFileSync(pathname, `${JSON.stringify(receipt, null, 2)}\n`)
}

async function buildCandidate() {
  const root = workingTreeRepositoryRoot({ cwd: process.cwd() })
  normaliseWorkingDirectory(root)
  const sourceSha256 = computeWorkingTreeSourceHash({ cwd: root })
  const releaseIdentity = workingTreeReleaseIdentity(sourceSha256)
  const evidenceDirectory = workingTreeEvidenceDirectory(root, sourceSha256)
  const receiptPath = path.join(evidenceDirectory, 'candidate-build.json')
  mkdirSync(evidenceDirectory, { recursive: true })

  const containers = inspectContainers()
  const app = assertExactlyOneApplicationContainer(containers)
  const project = app.Config?.Labels?.['com.docker.compose.project']
  assert.ok(typeof project === 'string' && project.length > 0, 'The live application must identify its Compose project.')
  const liveImageId = app.Image
  assert.match(liveImageId, /^sha256:[a-f0-9]{64}$/, 'The live application must resolve to an exact image id.')

  let preservedPriorRollback = null
  establishRollbackTag({
    rollbackImage: liveImageId,
    rollbackTag: WORKING_TREE_ROLLBACK_TAG,
    existingTagImage: imageIdForTag(WORKING_TREE_ROLLBACK_TAG),
    preservePriorRollback: priorImage => {
      const alias = rollbackPreservationAlias(priorImage)
      const existingAliasImage = imageIdForTag(alias)
      assertRollbackAliasDoesNotConflict(priorImage, existingAliasImage)
      if (existingAliasImage === null) docker(['image', 'tag', priorImage, alias])
      preservedPriorRollback = { image: priorImage, tag: alias }
    },
    tagImage: (image, tag) => docker(['image', 'tag', image, tag]),
    inspectTag: tag => imageIdForTag(tag),
  })

  const composeConfig = JSON.parse(docker([
    'compose',
    '-p', project,
    '-f', path.join(root, 'docker-compose.yml'),
    'config',
    '--format', 'json',
  ]))
  const buildArgs = composeConfig.services?.['metardu-app']?.build?.args
  assert.ok(buildArgs && typeof buildArgs === 'object', 'Compose application build arguments are required.')
  const sourceFiles = workingTreeMigrationRegistry(root)
  const migrationRegistry = workingTreeMigrationEvidence(sourceFiles)
  const labels = workingTreeBuildLabels({ sourceSha256, releaseIdentity })

  let priorReceipt = null
  if (existsSync(receiptPath)) {
    priorReceipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    assert.equal(priorReceipt.sourceSha256, sourceSha256, 'Candidate evidence belongs to a different source hash.')
  }
  const priorAttempts = Array.isArray(priorReceipt?.buildAttempts) ? priorReceipt.buildAttempts : []
  const log = await createExclusiveBuildLog(evidenceDirectory)
  const receipt = {
    schemaVersion: 1,
    status: 'building',
    imageTag: WORKING_TREE_CANDIDATE_TAG,
    imageId: null,
    sourceSha256,
    releaseIdentity,
    labels,
    builder: WORKING_TREE_BUILDER_NAME,
    buildArgsIncluded: true,
    productionStopped: false,
    newApplicationContainer: false,
    newBuilder: false,
    rollback: {
      tag: WORKING_TREE_ROLLBACK_TAG,
      image: liveImageId,
      preservedPriorAlias: preservedPriorRollback,
    },
    migrationRegistry: {
      count: migrationRegistry.length,
      checksums: migrationRegistry,
    },
    buildAttempts: [
      ...priorAttempts,
      {
        attempt: log.attempt,
        log: path.relative(root, log.path),
        status: 'running',
        startedAt: new Date().toISOString(),
      },
    ],
  }
  saveReceipt(receiptPath, receipt)

  const buildArguments = workingTreeBuildCommand({ sourceSha256, releaseIdentity, buildArgs })
  let logClosed = false
  const closeBuildLog = () => new Promise(resolve => {
    if (logClosed) {
      resolve()
      return
    }
    logClosed = true
    log.stream.once('error', () => resolve())
    log.stream.end(() => resolve())
  })
  let exitCode = null
  try {
    const child = spawn('docker', ['buildx', ...buildArguments], {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.pipe(log.stream, { end: false })
    child.stderr?.pipe(log.stream, { end: false })
    exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    await closeBuildLog()
  } catch (error) {
    // The build never ran or never finished: the receipt must not stay in the
    // "building" state, and the retained attempt log must stay referenced.
    await closeBuildLog()
    const failedReceipt = failCandidateBuildReceipt(receipt, {
      reason: 'The candidate build process could not be started or completed.',
      finishedAt: new Date().toISOString(),
      logSha256: existsSync(log.path)
        ? createHash('sha256').update(readFileSync(log.path)).digest('hex')
        : undefined,
    })
    saveReceipt(receiptPath, failedReceipt)
    throw error
  }
  const attempt = receipt.buildAttempts.at(-1)
  attempt.logSha256 = createHash('sha256').update(readFileSync(log.path)).digest('hex')
  attempt.finishedAt = new Date().toISOString()

  if (exitCode !== 0) {
    const failedReceipt = failCandidateBuildReceipt(receipt, {
      reason: `Candidate build failed with exit ${exitCode}.`,
      finishedAt: attempt.finishedAt,
      logSha256: attempt.logSha256,
    })
    saveReceipt(receiptPath, failedReceipt)
    throw new Error('Candidate build failed; inspect the retained source-scoped build log.')
  }

  const candidate = inspectImage(WORKING_TREE_CANDIDATE_TAG)
  const imageId = candidate.Id
  const imageLabels = candidate.Config?.Labels ?? {}
  const sourceAfterBuild = computeWorkingTreeSourceHash({ cwd: root })

  // Verify the artifact while the receipt still says "building": the receipt
  // may only become admissible evidence after every check has passed.
  try {
    assertCandidateBuildVerification({
      imageId,
      imageLabels,
      labels,
      sourceSha256,
      sourceSha256AfterBuild: sourceAfterBuild,
      liveImageId,
      migrationRegistry: {
        count: migrationRegistry.length,
        checksums: migrationRegistry,
      },
    })
  } catch (error) {
    const failedReceipt = failCandidateBuildReceipt(receipt, {
      reason: 'The candidate image failed the source-bound build verification.',
      finishedAt: new Date().toISOString(),
      logSha256: attempt.logSha256,
    })
    saveReceipt(receiptPath, failedReceipt)
    throw error
  }

  attempt.status = 'passed'
  const builtReceipt = finalizeCandidateBuildReceipt(receipt, { verified: true, imageId })
  saveReceipt(receiptPath, builtReceipt)
  try {
    assertCandidateBuildEvidence({
      evidence: builtReceipt,
      liveImageId,
      imageLabels,
    })
  } catch (error) {
    // The receipt was already persisted as "built": it must fall back to an
    // accurate, non-admissible "build-failed" receipt.
    const failedReceipt = failCandidateBuildReceipt(builtReceipt, {
      reason: 'The finalised candidate evidence was not admissible.',
      finishedAt: new Date().toISOString(),
      logSha256: attempt.logSha256,
    })
    saveReceipt(receiptPath, failedReceipt)
    throw error
  }
  console.log(JSON.stringify({
    status: builtReceipt.status,
    imageTag: builtReceipt.imageTag,
    imageId: builtReceipt.imageId,
    sourceSha256: builtReceipt.sourceSha256,
    releaseIdentity: builtReceipt.releaseIdentity,
    builder: builtReceipt.builder,
    evidenceDirectory,
  }))
}

// The entry guard resolves the entry point to this module. A direct execution
// (including through a symlink or a differently-cased path) runs the builder;
// an import stays silent; anything else fails loudly instead of exiting zero
// without having done anything.
const modulePath = fileURLToPath(import.meta.url)
const execution = resolveDirectExecution({ argvPath: process.argv[1], modulePath })
if (execution.mode === 'error') {
  console.error(`build-production-candidate: FAIL — ${execution.reason}`)
  process.exit(1)
}
if (execution.mode === 'execute') {
  const root = workingTreeRepositoryRoot({ cwd: process.cwd() })
  try {
    assertCanonicalScriptPath({
      modulePath,
      repositoryRoot: root,
      expectedScriptPath: 'scripts/build-production-candidate.mjs',
    })
  } catch (error) {
    console.error(`build-production-candidate: FAIL — ${error.message}`)
    process.exit(1)
  }
  const lockDirectory = path.join(root, '.cache', 'release-verify')
  mkdirSync(lockDirectory, { recursive: true })
  await withExclusiveCandidateBuild(workingTreeCandidateBuildLockPath(root), buildCandidate)
}
