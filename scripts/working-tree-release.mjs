import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import {
  createWriteStream,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from 'node:fs'
import path from 'node:path'
import { compatibleRollbackRegistry, rollbackService } from './release-plan.mjs'
import { resolvedPathMatches } from './verify-migrations.mjs'

export { resolvedPathMatches }

export const WORKING_TREE_CANDIDATE_TAG = 'metardu-metardu-app:candidate'
export const WORKING_TREE_ROLLBACK_TAG = 'metardu-metardu-app:rollback-current'
export const WORKING_TREE_BUILDER_NAME = 'desktop-linux'
export const WORKING_TREE_EVIDENCE_NAMESPACE = '.cache/release-verify/working-tree-candidate'
export const WORKING_TREE_SOURCE_LABEL = 'io.metardu.source.sha256'
export const WORKING_TREE_RELEASE_LABEL = 'io.metardu.release.identity'
export const WORKING_TREE_REVISION_LABEL = 'org.opencontainers.image.revision'
export const WORKING_TREE_MIGRATION_VERSION = '127_mpesa_payment_completion'
export const WORKING_TREE_MIGRATION_BASELINE_COUNT = 131
export const WORKING_TREE_MIGRATION_TARGET_COUNT = 132
export const WORKING_TREE_ROLLBACK_REGISTRY_DESTINATION = '/app/rollback-migration-registry'
export const WORKING_TREE_BUILD_ARGS = Object.freeze([
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_PAYPAL_CLIENT_ID',
  'NEXT_PUBLIC_COLLABORATION_SAME_ORIGIN',
  'NEXT_PUBLIC_WS_URL',
])

const SOURCE_HASH_DOMAIN = 'metardu-working-tree-source-v1\0'
const RELEASE_IDENTITY_DOMAIN = 'metardu-working-tree-release-v1\0'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Locale-independent ordering. ICU collation orders "a" before "B"; persisted
 * release evidence must not depend on the host locale, so every persisted
 * ordering uses UTF-16 code-unit order (and the source hash uses raw bytes).
 */
function compareCodeUnits(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function assertSha256(value, label) {
  assert.match(value ?? '', /^[a-f0-9]{64}$/, `${label} must be a lowercase SHA-256 digest.`)
}

function assertReleaseIdentity(value, label = 'Release identity') {
  assert.match(value ?? '', /^[a-f0-9]{40}$/, `${label} must be exactly 40 lowercase hexadecimal characters.`)
}

function gitBuffer(cwd, args) {
  const result = spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', cwd, ...args], {
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Git ${args[0]} failed; working-tree diagnostics suppressed.`)
  }
  return result.stdout ?? Buffer.alloc(0)
}

function nulDelimitedPaths(buffer) {
  return buffer
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
}

export function workingTreeRepositoryRoot({ cwd = process.cwd() } = {}) {
  return resolveWorkingTreeRoot(path.resolve(cwd))
}

function resolveWorkingTreeRoot(cwd) {
  const root = gitBuffer(cwd, ['rev-parse', '--show-toplevel']).toString('utf8').trim()
  assert.ok(root, 'The working-tree release must be inside a Git repository.')
  return path.resolve(root)
}

function assertRepositoryPath(repositoryPath) {
  assert.ok(repositoryPath && !path.isAbsolute(repositoryPath), 'Git repository paths must be relative.')
  const segments = repositoryPath.replaceAll('\\', '/').split('/')
  assert.ok(!segments.includes('..'), 'Git repository paths must not escape the repository root.')
}

function frame(hash, label, content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')
  hash.update(label)
  hash.update('\0')
  hash.update(String(bytes.length).padStart(16, '0'))
  hash.update(':')
  hash.update(bytes)
  hash.update('\0')
}

function entryBytes(entry) {
  if (entry.kind === 'file') {
    assert.ok(Buffer.isBuffer(entry.content) || typeof entry.content === 'string', 'File entries require content bytes.')
    return Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, 'utf8')
  }
  if (entry.kind === 'symlink') {
    assert.ok(typeof entry.content === 'string', 'Symbolic-link entries require their link target.')
    return Buffer.from(entry.content, 'utf8')
  }
  if (entry.kind === 'missing') return Buffer.from('MISSING\0', 'utf8')
  if (entry.kind === 'gitlink') return Buffer.from('GITLINK\0', 'utf8')
  throw new Error(`Unsupported working-tree entry kind: ${entry.kind}`)
}

export function hashWorkingTreeEntries(entries) {
  assert.ok(Array.isArray(entries), 'Working-tree entries must be an array.')
  const ordered = [...entries].sort((left, right) => Buffer.compare(
    Buffer.from(left.path, 'utf8'),
    Buffer.from(right.path, 'utf8'),
  ))
  const hash = createHash('sha256')
  hash.update(SOURCE_HASH_DOMAIN)
  for (const entry of ordered) {
    assert.ok(entry && typeof entry === 'object', 'Every working-tree entry must be an object.')
    assert.ok(typeof entry.path === 'string' && entry.path.length > 0, 'Every working-tree entry requires a path.')
    assertRepositoryPath(entry.path)
    frame(hash, 'path', entry.path)
    frame(hash, 'kind', entry.kind)
    frame(hash, 'content', entryBytes(entry))
  }
  return hash.digest('hex')
}

function collectWorkingTreeEntries(root) {
  const tracked = new Set(nulDelimitedPaths(gitBuffer(root, ['ls-files', '--cached', '-z'])))
  const untracked = new Set(nulDelimitedPaths(gitBuffer(root, ['ls-files', '--others', '--exclude-standard', '-z'])))
  const paths = new Set([...tracked, ...untracked])
  const entries = []
  for (const repositoryPath of paths) {
    assertRepositoryPath(repositoryPath)
    const absolutePath = path.resolve(root, ...repositoryPath.split('/'))
    assert.ok(absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`), 'Repository path escaped the working-tree root.')
    let stat
    try {
      stat = lstatSync(absolutePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      assert.ok(tracked.has(repositoryPath), 'An untracked file changed while the source hash was computed.')
      entries.push({ path: repositoryPath, kind: 'missing' })
      continue
    }
    if (stat.isSymbolicLink()) {
      entries.push({ path: repositoryPath, kind: 'symlink', content: readlinkSync(absolutePath) })
    } else if (stat.isDirectory()) {
      entries.push({ path: repositoryPath, kind: 'gitlink' })
    } else if (stat.isFile()) {
      entries.push({ path: repositoryPath, kind: 'file', content: readFileSync(absolutePath) })
    } else {
      throw new Error(`Unsupported tracked filesystem object: ${repositoryPath}`)
    }
  }
  return entries
}

export function computeWorkingTreeSourceHash({ cwd = process.cwd() } = {}) {
  const root = resolveWorkingTreeRoot(path.resolve(cwd))
  return hashWorkingTreeEntries(collectWorkingTreeEntries(root))
}

export function workingTreeReleaseIdentity(sourceSha256) {
  assertSha256(sourceSha256, 'Working-tree source SHA-256')
  return sha256(`${RELEASE_IDENTITY_DOMAIN}${sourceSha256}`).slice(0, 40)
}

export function workingTreeEvidenceDirectory(root, sourceSha256) {
  assertSha256(sourceSha256, 'Working-tree source SHA-256')
  return path.resolve(root, WORKING_TREE_EVIDENCE_NAMESPACE, sourceSha256)
}

export function workingTreeRecoveryProofPath(root, sourceSha256) {
  return path.join(workingTreeEvidenceDirectory(root, sourceSha256), 'recovery-proof', 'verification.json')
}

export function workingTreeBuildLabels({ sourceSha256, releaseIdentity }) {
  assertSha256(sourceSha256, 'Working-tree source SHA-256')
  assertReleaseIdentity(releaseIdentity)
  return {
    [WORKING_TREE_REVISION_LABEL]: releaseIdentity,
    [WORKING_TREE_RELEASE_LABEL]: releaseIdentity,
    [WORKING_TREE_SOURCE_LABEL]: sourceSha256,
  }
}

export function workingTreeBuildCommand({ sourceSha256, releaseIdentity, buildArgs }) {
  assertSha256(sourceSha256, 'Working-tree source SHA-256')
  assertReleaseIdentity(releaseIdentity)
  assert.ok(buildArgs && typeof buildArgs === 'object' && !Array.isArray(buildArgs), 'Compose build arguments are required.')
  const command = [
    'build',
    '--builder', WORKING_TREE_BUILDER_NAME,
    '--progress', 'plain',
    '--load',
    '--tag', WORKING_TREE_CANDIDATE_TAG,
  ]
  for (const [name, value] of Object.entries(workingTreeBuildLabels({ sourceSha256, releaseIdentity }))) {
    command.push('--label', `${name}=${value}`)
  }
  const names = [...WORKING_TREE_BUILD_ARGS, ...Object.keys(buildArgs).filter(name => !WORKING_TREE_BUILD_ARGS.includes(name)).sort()]
  for (const name of names) {
    assert.ok(Object.hasOwn(buildArgs, name), `Required Compose build argument is missing: ${name}`)
    command.push('--build-arg', `${name}=${buildArgs[name] ?? ''}`)
  }
  command.push('.')
  return command
}

export async function createExclusiveBuildLog(evidenceDirectory) {
  assert.ok(typeof evidenceDirectory === 'string' && path.isAbsolute(evidenceDirectory), 'Build evidence requires an absolute directory.')
  mkdirSync(evidenceDirectory, { recursive: true })
  const existing = readdirSync(evidenceDirectory)
    .map(name => /^build-(\d+)\.log$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number)
  const attempt = (existing.length ? Math.max(...existing) : 0) + 1
  const logPath = path.join(evidenceDirectory, `build-${attempt}.log`)
  const descriptor = openSync(logPath, 'wx', 0o600)
  const stream = createWriteStream(logPath, { fd: descriptor, autoClose: true })
  return { attempt, path: logPath, stream }
}

export function rollbackPreservationAlias(imageId) {
  assert.match(imageId ?? '', /^sha256:[a-f0-9]{64}$/, 'Rollback preservation requires an exact image id.')
  return `metardu-metardu-app:rollback-${imageId.slice('sha256:'.length, 'sha256:'.length + 16)}`
}

export function assertRollbackAliasDoesNotConflict(imageId, existingAliasImage) {
  assert.match(imageId ?? '', /^sha256:[a-f0-9]{64}$/, 'Rollback preservation requires an exact image id.')
  if (existingAliasImage === null || existingAliasImage === undefined) return
  assert.equal(existingAliasImage, imageId, 'The content-addressed rollback alias already refers to a different image.')
}

export function canonicalMounts(mounts) {
  assert.ok(Array.isArray(mounts), 'Container mounts must be an array.')
  return mounts.map(mount => {
    assert.ok(mount && typeof mount === 'object', 'Every mount must be an object.')
    assert.ok(typeof mount.Destination === 'string' && mount.Destination.length > 0, 'Every mount requires a destination.')
    return {
      type: String(mount.Type ?? ''),
      name: mount.Name ?? null,
      source: String(mount.Source ?? ''),
      destination: mount.Destination,
      rw: mount.RW === true,
    }
  }).sort((left, right) => (
    compareCodeUnits(left.destination, right.destination)
    || compareCodeUnits(left.source, right.source)
    || compareCodeUnits(left.type, right.type)
  ))
}

/**
 * Docker Desktop rewrites a Windows bind source into its Linux host path, so
 * the raw source strings are not comparable. Both sides are normalised to the
 * same canonical form:
 *   - lower case and forward slashes;
 *   - the host side keeps its drive letter as a drive (`c:` becomes `c`);
 *   - the container side loses the Docker Desktop host prefix
 *     (`/run/desktop/mnt/host/…` and the legacy `/mnt/host/…`) and the drive
 *     segment that follows it;
 *   - empty segments are dropped.
 * The remaining path tail is compared, and when both sides carry a drive the
 * drives must match exactly.
 */
function canonicalMountSource(source) {
  const text = String(source ?? '').replace(/\\/g, '/').toLowerCase()
  const containerPrefix = /^\/(?:run\/desktop\/mnt\/host|mnt\/host)\//
  const prefix = text.match(containerPrefix)
  if (prefix) {
    const rest = text.slice(prefix[0].length)
    const drive = rest.match(/^([a-z])(?=\/|$)/)
    return {
      drive: drive ? drive[1] : null,
      segments: (drive ? rest.slice(drive[0].length) : rest).split('/').filter(Boolean),
    }
  }
  const drive = text.match(/^([a-z]):(?=\/|$)/)
  return {
    drive: drive ? drive[1] : null,
    segments: (drive ? text.slice(drive[0].length) : text).split('/').filter(Boolean),
  }
}

/**
 * A rollback registry directory is an absolute path. A Windows drive path is
 * accepted on every platform because the comparison is textual and the Docker
 * Desktop host translation is what makes the two forms differ.
 */
function isAbsolutePathLike(value) {
  if (typeof value !== 'string' || value.length === 0) return false
  if (path.isAbsolute(value)) return true
  return /^[a-z]:[\\/]/i.test(value)
}

export function assertRollbackAppMounts({ originalMounts, restoredMounts, registryDirectory }) {
  assert.ok(isAbsolutePathLike(registryDirectory), 'The rollback registry directory must be absolute.')
  const originals = canonicalMounts(originalMounts)
  const restored = canonicalMounts(restoredMounts)
  const registryMounts = restored.filter(mount => mount.destination === WORKING_TREE_ROLLBACK_REGISTRY_DESTINATION)
  assert.equal(registryMounts.length, 1, 'The restored application must mount exactly one rollback migration registry.')
  assert.equal(registryMounts[0].type, 'bind', 'The rollback migration registry must be a bind mount.')
  assert.equal(registryMounts[0].rw, false, 'The rollback migration registry mount must be read-only.')
  const expectedSource = canonicalMountSource(registryDirectory)
  const actualSource = canonicalMountSource(registryMounts[0].source)
  if (expectedSource.drive !== null && actualSource.drive !== null) {
    assert.equal(
      actualSource.drive,
      expectedSource.drive,
      'The rollback migration registry mount must be on the same drive as the selected registry directory.',
    )
  }
  assert.deepEqual(
    actualSource.segments,
    expectedSource.segments,
    'The rollback migration registry mount must point at the selected registry directory.',
  )
  const originalDataMounts = originals.filter(mount => mount.destination !== WORKING_TREE_ROLLBACK_REGISTRY_DESTINATION)
  const restoredDataMounts = restored.filter(mount => mount.destination !== WORKING_TREE_ROLLBACK_REGISTRY_DESTINATION)
  assert.deepEqual(restoredDataMounts, originalDataMounts, 'The application upload/data mounts changed during rollback.')
  return true
}

export function assertCanonicalMountsEqual(actual, expected) {
  assert.deepEqual(canonicalMounts(actual), canonicalMounts(expected))
}

export function assertExactlyOneApplicationContainer(containers) {
  assert.ok(Array.isArray(containers), 'Inspected containers must be an array.')
  const applications = containers.filter(container => (
    container?.Name === '/metardu-app'
    || container?.Config?.Labels?.['com.docker.compose.service'] === 'metardu-app'
  ))
  const unique = new Map(applications.map(container => [container.Id ?? JSON.stringify(container), container]))
  assert.equal(unique.size, 1, 'Exactly one metardu-app container is required.')
  return [...unique.values()][0]
}

export function assertCandidateArtifactPairing({ candidateTag, candidateImageId, applicationImageId, migrationImageId }) {
  assert.equal(candidateTag, WORKING_TREE_CANDIDATE_TAG)
  for (const [label, imageId] of Object.entries({ candidateImageId, applicationImageId, migrationImageId })) {
    assert.match(imageId ?? '', /^sha256:[a-f0-9]{64}$/, `${label} must be an exact image id.`)
    assert.equal(imageId, candidateImageId, 'Candidate, application, and migration services must use the same immutable image.')
  }
  return candidateImageId
}

/**
 * The rendered Compose override must merge to one candidate artifact for both
 * the application and the one-shot migration service. The operational script
 * resolves the merged configuration read-only and calls this helper.
 */
export function assertResolvedCandidateServices({ resolvedServices, candidateTag, candidateImageId }) {
  assert.ok(resolvedServices && typeof resolvedServices === 'object' && !Array.isArray(resolvedServices), 'The resolved Compose services are required.')
  assert.equal(candidateTag, WORKING_TREE_CANDIDATE_TAG)
  const accepted = new Set([candidateTag])
  if (candidateImageId) accepted.add(candidateImageId)
  for (const service of ['metardu-app', 'metardu-db-migrate']) {
    const resolved = resolvedServices[service]
    assert.ok(resolved && typeof resolved === 'object', `The resolved Compose configuration is missing the ${service} service.`)
    const image = typeof resolved.image === 'string' ? resolved.image : ''
    assert.ok(accepted.has(image), `The resolved ${service} service does not use the candidate artifact.`)
  }
  return true
}

/**
 * The candidate tag is mutable while a build runs. The binding must not move
 * between the verified preflight and either Compose mutation.
 */
export function assertCandidateTagBinding({ candidateTag, expectedImageId, actualImageId }) {
  assert.equal(candidateTag, WORKING_TREE_CANDIDATE_TAG)
  assert.match(expectedImageId ?? '', /^sha256:[a-f0-9]{64}$/, 'The verified candidate image id must be an exact image id.')
  assert.match(actualImageId ?? '', /^sha256:[a-f0-9]{64}$/, 'The candidate tag must resolve to an exact image id.')
  assert.equal(actualImageId, expectedImageId, 'The candidate tag no longer resolves to the verified image id.')
  return actualImageId
}

export function workingTreeCandidateBuildLockPath(root) {
  assert.ok(typeof root === 'string' && path.isAbsolute(root), 'The repository root must be absolute.')
  return path.join(root, '.cache', 'release-verify', 'working-tree-candidate-build.lock')
}

/**
 * The Compose working directory decides how `.env` is interpolated, so both
 * operational scripts normalise the process CWD to the repository root.
 */
export function normaliseWorkingDirectory(root) {
  assert.ok(typeof root === 'string' && root.length > 0, 'The repository root is required.')
  const resolved = path.resolve(root)
  process.chdir(resolved)
  return resolved
}

/**
 * The preserved application log is streamed straight from the container into
 * the backup volume: no size cap and no in-memory payload.
 */
export function workingTreeApplicationLogCommands({ archive }) {
  assert.ok(typeof archive === 'string' && archive.startsWith('/backups/'), 'The preserved application log must be written inside the backup volume.')
  assert.ok(!archive.includes('\n') && !archive.includes('\r'), 'The preserved application log name must be a single line.')
  return {
    reader: ['logs', '--timestamps', 'metardu-app'],
    writer: ['exec', '-i', 'metardu-backup', 'bash', '-c', 'set -o noclobber; umask 077; cat > "$1"', 'sh', archive],
  }
}

/**
 * The preserved application log is streamed straight from the container into
 * the existing backup volume: no size cap and no in-memory payload. The
 * writer's own stderr is redirected into the same private archive so a chatty
 * writer can never fill the pipe buffer and block the promotion with the
 * application already stopped.
 */
export async function streamApplicationLog({ commands, archive, spawnProcess = spawn }) {
  assert.ok(commands && Array.isArray(commands.reader) && Array.isArray(commands.writer), 'The application log commands are required.')
  const reader = spawnProcess('docker', commands.reader, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const writer = spawnProcess('docker', commands.writer, {
    stdio: ['pipe', 'ignore', 'pipe'],
    windowsHide: true,
  })
  reader.stdout.pipe(writer.stdin, { end: false })
  reader.stderr.pipe(writer.stdin, { end: false })
  writer.stderr.pipe(writer.stdin, { end: false })
  reader.stderr.on('error', () => {})
  writer.stderr.on('error', () => {})
  writer.stdin.on('error', () => {})
  const readerClosed = new Promise((resolve, reject) => {
    reader.once('error', reject)
    reader.once('close', code => (code === 0
      ? resolve()
      : reject(new Error('The application log stream failed; the preserved log is incomplete.'))))
  })
  const writerClosed = new Promise((resolve, reject) => {
    writer.once('error', reject)
    writer.once('close', code => (code === 0
      ? resolve()
      : reject(new Error('The preserved application log could not be written to the backup volume.'))))
  })
  let readerFailure = null
  try {
    await readerClosed
  } catch (error) {
    readerFailure = error
  } finally {
    writer.stdin.end()
  }
  let writerFailure = null
  try {
    await writerClosed
  } catch (error) {
    writerFailure = error
  }
  if (readerFailure) throw readerFailure
  if (writerFailure) throw writerFailure
  return {
    path: archive,
    storedOnlyInExistingBackupVolume: true,
    privateMode: '0600',
    payloadPrinted: false,
    streamed: true,
  }
}

function assertMigrationRegistry(sourceRegistry) {
  assert.ok(Array.isArray(sourceRegistry), 'The migration source registry must be an array.')
  assert.equal(sourceRegistry.length, WORKING_TREE_MIGRATION_TARGET_COUNT, 'The candidate migration registry must contain exactly 132 files.')
  const versions = new Set()
  for (const file of sourceRegistry) {
    assert.ok(file && typeof file === 'object', 'Migration registry entries must be objects.')
    assert.ok(typeof file.version === 'string' && file.version.length > 0, 'Migration registry entries require versions.')
    assert.ok(!versions.has(file.version), 'Migration registry versions must be unique.')
    versions.add(file.version)
    assertSha256(file.checksum, `Migration ${file.version} checksum`)
  }
  assert.ok(versions.has(WORKING_TREE_MIGRATION_VERSION), 'The candidate migration registry must include migration 127.')
}

function assertLedger(ledger) {
  assert.ok(Array.isArray(ledger), 'The migration ledger must be an array.')
  const versions = new Set()
  for (const row of ledger) {
    assert.ok(row && typeof row === 'object', 'Migration ledger rows must be objects.')
    assert.ok(typeof row.version === 'string' && row.version.length > 0, 'Migration ledger rows require versions.')
    assert.ok(!versions.has(row.version), 'Migration ledger versions must be unique.')
    versions.add(row.version)
    assertSha256(row.checksum, `Applied migration ${row.version} checksum`)
  }
  return versions
}

/**
 * Drift comparison accepts a stored checksum that equals the file checksum or
 * one of its LF/CRLF equivalents, exactly like the established migration
 * tooling. A genuinely mutated checksum is still rejected.
 */
function workingTreeLedgerDrift(sourceFiles, ledger) {
  const source = new Map(sourceFiles.map(file => [file.version, file]))
  const applied = new Map(ledger.map(row => [row.version, row.checksum]))
  return {
    missing: sourceFiles.filter(file => !applied.has(file.version)).map(file => file.version),
    mutated: ledger.filter(row => {
      const file = source.get(row.version)
      if (!file) return false
      const accepted = [file.checksum, ...(file.equivalentChecksums ?? [])]
      return !accepted.includes(row.checksum)
    }).map(row => row.version),
    ghost: ledger.filter(row => !source.has(row.version)).map(row => row.version),
  }
}

function migrationSources({ sourceFiles, sourceRegistry }) {
  const sources = sourceFiles ?? sourceRegistry
  assert.ok(Array.isArray(sources), 'The migration source registry must be an array.')
  return sources
}

export function assertWorkingTreeMigrationBaseline({ sourceFiles, sourceRegistry, ledger }) {
  const sources = migrationSources({ sourceFiles, sourceRegistry })
  assertMigrationRegistry(sources)
  assert.equal(ledger.length, WORKING_TREE_MIGRATION_BASELINE_COUNT, 'Exactly 131 migrations must be applied before promotion.')
  assertLedger(ledger)
  const drift = workingTreeLedgerDrift(sources, ledger)
  assert.deepEqual(drift.missing, [WORKING_TREE_MIGRATION_VERSION], 'Migration 127 must be the only missing migration.')
  assert.equal(drift.mutated.length, 0, 'Applied migration checksums must remain unchanged.')
  assert.equal(drift.ghost.length, 0, 'No ghost migration may exist in the live ledger.')
  return {
    appliedCount: ledger.length,
    targetCount: sources.length,
    missing: drift.missing,
    mutatedCount: drift.mutated.length,
    ghostCount: drift.ghost.length,
    historicalChecksumsPreserved: true,
  }
}

export function assertWorkingTreeMigrationAfter({ sourceFiles, sourceRegistry, beforeLedger, afterLedger }) {
  const sources = migrationSources({ sourceFiles, sourceRegistry })
  assertMigrationRegistry(sources)
  assert.equal(beforeLedger.length, WORKING_TREE_MIGRATION_BASELINE_COUNT, 'The pre-migration ledger must contain exactly 131 rows.')
  assert.equal(afterLedger.length, WORKING_TREE_MIGRATION_TARGET_COUNT, 'The post-migration ledger must contain exactly 132 rows.')
  assertLedger(beforeLedger)
  assertLedger(afterLedger)
  const drift = workingTreeLedgerDrift(sources, afterLedger)
  assert.equal(drift.missing.length, 0, 'Every candidate migration must be applied after promotion.')
  assert.equal(drift.mutated.length, 0, 'Every candidate migration checksum must match after promotion.')
  assert.equal(drift.ghost.length, 0, 'No ghost migration may exist after promotion.')
  const afterByVersion = new Map(afterLedger.map(row => [row.version, row.checksum]))
  for (const row of beforeLedger) {
    assert.equal(afterByVersion.get(row.version), row.checksum, `Historical migration checksum changed: ${row.version}`)
  }
  return {
    appliedCount: afterLedger.length,
    targetCount: sources.length,
    mutatedCount: drift.mutated.length,
    ghostCount: drift.ghost.length,
    historicalChecksumsPreserved: true,
  }
}

export function assertWorkingTreeRecoveryProof(proof, { sourceSha256, releaseIdentity, sourceRegistry }) {
  assertSha256(sourceSha256, 'Recovery-proof source SHA-256')
  assertReleaseIdentity(releaseIdentity, 'Recovery-proof release identity')
  assertMigrationRegistry(sourceRegistry)
  assert.ok(proof && typeof proof === 'object' && !Array.isArray(proof), 'Release-scoped recovery proof is required.')
  assert.equal(proof.status, 'passed', 'Release-scoped recovery proof must have passed.')
  assert.equal(proof.sourceSha256, sourceSha256, 'Recovery proof belongs to a different working-tree source.')
  assert.equal(proof.releaseIdentity, releaseIdentity, 'Recovery proof belongs to a different release identity.')
  assert.deepEqual(proof.sourceRegistry, sourceRegistry, 'Recovery proof must use the exact 132-file candidate migration registry.')
  assert.equal(proof.sourceRegistrySha256, sha256(JSON.stringify(sourceRegistry)), 'Recovery proof migration-registry digest does not match.')
  assert.equal(proof.sourceBaseline, WORKING_TREE_MIGRATION_BASELINE_COUNT, 'Recovery proof must start from the exact 131-row ledger.')
  assert.equal(proof.targetLedgerCount, WORKING_TREE_MIGRATION_TARGET_COUNT, 'Recovery proof must target the exact 132-row ledger.')
  assert.deepEqual(proof.pending, [WORKING_TREE_MIGRATION_VERSION], 'Recovery proof must cover exactly migration 127.')
  assert.match(proof.backup?.databaseArchiveSha256 ?? '', /^[a-f0-9]{64}$/, 'Recovery proof requires a restored database archive digest.')
  assert.match(proof.backup?.uploadsArchiveSha256 ?? '', /^[a-f0-9]{64}$/, 'Recovery proof requires a restored uploads archive digest.')
  assert.equal(proof.backup?.integrityVerified, true, 'Recovery proof requires verified backup integrity.')
  assert.equal(proof.backup?.restored, true, 'Recovery proof requires successful restore evidence.')
  assert.ok(proof.cleanup && Object.keys(proof.cleanup).length > 0, 'Recovery proof requires cleanup evidence.')
  assert.ok(Object.values(proof.cleanup).every(value => value === true), 'Recovery proof cleanup must be complete.')
  assert.ok(Array.isArray(proof.checks) && proof.checks.length > 0, 'Recovery proof requires passing checks.')
  assert.ok(proof.checks.every(check => check?.passed === true), 'Every recovery proof check must have passed.')
  return proof
}

export function selectWorkingTreeRollbackRegistry(sourceFiles, ledger) {
  assert.ok(Array.isArray(sourceFiles), 'Rollback migration source files must be an array.')
  assert.ok(Array.isArray(ledger), 'Rollback migration ledger must be an array.')
  const selected = compatibleRollbackRegistry(sourceFiles, ledger)
  assert.equal(selected.length, ledger.length, 'Rollback registry must contain exactly the files applied in the actual ledger.')
  return selected
}

export function assertRetiredTillRouteStatus({ getStatus, postStatus }) {
  assert.equal(getStatus, 404, 'Retired manual-till GET route must return 404.')
  assert.equal(postStatus, 404, 'Retired manual-till POST route must return 404.')
  return { getStatus, postStatus }
}

/**
 * Environment continuity is compared by in-memory SHA-256 digest. Failures
 * carry the key name only: no value, no value digest, and no AssertionError
 * payload can reach the console or the promotion receipt.
 */
/**
 * The prior release identity is the baseline the candidate replaces. The live
 * runtime identity and the resolved Compose/.env identity must agree; a
 * difference between the live image OCI revision and the runtime identity is
 * recorded, never rejected, because the promotion performs that correction.
 * Failures carry the key name only: no identity value may reach the console
 * or the promotion receipt.
 */
export function assertPriorReleaseIdentityBaseline({ liveEnvironment, resolvedBaseEnvironment, liveImageRevision }) {
  assert.ok(liveEnvironment && typeof liveEnvironment === 'object' && !Array.isArray(liveEnvironment), 'Live environment evidence is required.')
  assert.ok(resolvedBaseEnvironment && typeof resolvedBaseEnvironment === 'object' && !Array.isArray(resolvedBaseEnvironment), 'The resolved base environment is required.')
  const priorReleaseIdentity = liveEnvironment.METARDU_BUILD_SHA ?? null
  if (!/^[a-f0-9]{40}$/.test(priorReleaseIdentity ?? '')) {
    throw new Error('The live runtime release identity must be exactly 40 lowercase hexadecimal characters: METARDU_BUILD_SHA')
  }
  const resolvedReleaseIdentity = resolvedBaseEnvironment.METARDU_BUILD_SHA ?? null
  if (resolvedReleaseIdentity !== priorReleaseIdentity) {
    throw new Error('The live runtime release identity differs from the resolved environment release identity: METARDU_BUILD_SHA')
  }
  if (!/^[a-f0-9]{40}$/.test(liveImageRevision ?? '')) {
    throw new Error('The live image revision label must be exactly 40 lowercase hexadecimal characters: org.opencontainers.image.revision')
  }
  return {
    priorReleaseIdentity,
    priorImageRevision: liveImageRevision,
    imageRuntimeIdentityMismatch: liveImageRevision !== priorReleaseIdentity,
  }
}

export function assertEnvironmentContinuity(liveEnvironment, resolvedEnvironment, { releaseIdentity }) {
  if (!liveEnvironment || typeof liveEnvironment !== 'object' || Array.isArray(liveEnvironment)) {
    throw new Error('Live environment evidence is required.')
  }
  if (!resolvedEnvironment || typeof resolvedEnvironment !== 'object' || Array.isArray(resolvedEnvironment)) {
    throw new Error('Resolved environment evidence is required.')
  }
  if (!/^[a-f0-9]{40}$/.test(releaseIdentity ?? '')) {
    throw new Error('Release identity must be exactly 40 lowercase hexadecimal characters.')
  }
  const keys = Object.keys(resolvedEnvironment).sort(compareCodeUnits)
  let continuousKeyCount = 0
  for (const key of keys) {
    if (!Object.hasOwn(liveEnvironment, key)) {
      throw new Error(`Resolved runtime environment key is absent from the live container: ${key}`)
    }
    if (key === 'METARDU_BUILD_SHA') {
      if (resolvedEnvironment[key] !== releaseIdentity) {
        throw new Error(`Resolved runtime release identity does not match the candidate: ${key}`)
      }
      continue
    }
    const liveDigest = sha256(String(liveEnvironment[key]))
    const resolvedDigest = sha256(String(resolvedEnvironment[key]))
    if (liveDigest !== resolvedDigest) {
      throw new Error(`Runtime environment changed: ${key}`)
    }
    continuousKeyCount += 1
  }
  return {
    configuredKeyCount: keys.length,
    continuousKeyCount,
    releaseIdentityChanged: liveEnvironment.METARDU_BUILD_SHA !== releaseIdentity,
  }
}

function supportingServiceIdentity(container) {
  assert.ok(container && typeof container === 'object', 'Supporting container evidence is required.')
  const name = String(container.Name ?? '').replace(/^\//, '')
  return {
    name,
    id: container.Id,
    image: container.Image,
    startedAt: container.State?.StartedAt ?? null,
    health: container.State?.Health?.Status ?? null,
    mounts: canonicalMounts(container.Mounts ?? []),
  }
}

export function assertSupportingServicesPreserved(beforeContainers, afterContainers, { supportingNames }) {
  assert.ok(Array.isArray(beforeContainers) && Array.isArray(afterContainers), 'Supporting container inventories must be arrays.')
  assert.ok(Array.isArray(supportingNames) && supportingNames.length > 0, 'Supporting service names are required.')
  const expectedNames = [...supportingNames].sort()
  const before = new Map(beforeContainers.map(container => [supportingServiceIdentity(container).name, supportingServiceIdentity(container)]))
  const after = new Map(afterContainers.map(container => [supportingServiceIdentity(container).name, supportingServiceIdentity(container)]))
  assert.deepEqual([...before.keys()].sort(), expectedNames, 'Supporting service inventory changed before promotion.')
  assert.deepEqual([...after.keys()].sort(), expectedNames, 'Supporting service inventory changed during promotion.')
  for (const name of expectedNames) {
    assert.deepEqual(after.get(name), before.get(name), `Supporting service changed during promotion: ${name}`)
  }
  return true
}

/**
 * Verification is deliberately separate from admission: the image id, the
 * source-bound labels, the source stability and the migration registry are
 * proven while the receipt is still "building".
 */
export function assertCandidateBuildVerification({
  imageId,
  imageLabels,
  labels,
  sourceSha256,
  sourceSha256AfterBuild,
  liveImageId,
  migrationRegistry,
}) {
  assert.match(imageId ?? '', /^sha256:[a-f0-9]{64}$/, 'The candidate image must resolve to an exact image id.')
  assert.match(liveImageId ?? '', /^sha256:[a-f0-9]{64}$/, 'The live production image must resolve to an exact image id.')
  assert.notEqual(imageId, liveImageId, 'The candidate image must differ from the live production image.')
  assertSha256(sourceSha256, 'Candidate source SHA-256')
  assertSha256(sourceSha256AfterBuild, 'Post-build working-tree source SHA-256')
  assert.equal(sourceSha256AfterBuild, sourceSha256, 'The working-tree source changed while the candidate image was building.')
  assert.ok(labels && typeof labels === 'object' && !Array.isArray(labels), 'Candidate build labels are required.')
  for (const [name, value] of Object.entries(labels)) {
    assert.equal(imageLabels?.[name], value, `The candidate image label does not match the source-bound release identity: ${name}`)
  }
  assert.equal(migrationRegistry?.count, WORKING_TREE_MIGRATION_TARGET_COUNT)
  assert.equal(migrationRegistry?.checksums?.length, WORKING_TREE_MIGRATION_TARGET_COUNT)
  assert.ok(migrationRegistry.checksums.every(file => (
    typeof file?.version === 'string' && /^[a-f0-9]{64}$/.test(file?.checksum ?? '')
  )), 'Candidate evidence requires the complete migration checksum registry.')
  return true
}

/**
 * The receipt state machine: an unverified build never reports "built".
 */
export function finalizeCandidateBuildReceipt(receipt, { verified, imageId } = {}) {
  assert.ok(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'The candidate build receipt is required.')
  assert.equal(receipt.status, 'building', 'The candidate build receipt must still be in the building state.')
  if (verified !== true) return { ...receipt, status: 'build-failed' }
  assert.match(imageId ?? '', /^sha256:[a-f0-9]{64}$/, 'A verified candidate image id is required before the receipt can be marked built.')
  return { ...receipt, status: 'built', imageId }
}

/**
 * Every failed build leaves an accurate, non-admissible receipt behind: the
 * status is never "building" and never "built", the attempt is marked failed,
 * and the retained attempt log stays referenced by the receipt.
 */
export function failCandidateBuildReceipt(receipt, { reason, finishedAt, logSha256 } = {}) {
  assert.ok(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'The candidate build receipt is required.')
  assert.ok(typeof reason === 'string' && reason.length > 0, 'A candidate build failure reason is required.')
  const attempts = Array.isArray(receipt.buildAttempts) ? receipt.buildAttempts : []
  assert.ok(attempts.length > 0, 'The candidate build receipt must record a build attempt.')
  const failedAttempts = [...attempts]
  const last = failedAttempts.at(-1)
  failedAttempts[failedAttempts.length - 1] = {
    ...last,
    status: 'failed',
    reason,
    finishedAt: finishedAt ?? last.finishedAt ?? null,
    ...(logSha256 ? { logSha256 } : {}),
  }
  return {
    ...receipt,
    status: 'build-failed',
    imageId: receipt.imageId ?? null,
    buildAttempts: failedAttempts,
  }
}

/**
 * Decide how a module was entered. A direct execution resolves the entry point
 * to this module (a symlinked or differently-cased path still matches). An
 * import resolves to another file and must stay silent. An unresolvable entry
 * point fails closed instead of exiting zero without doing anything.
 */
export function resolveDirectExecution({ argvPath, modulePath }) {
  if (typeof argvPath !== 'string' || argvPath.trim() === '') {
    return {
      mode: 'error',
      reason: 'The script entry point could not be resolved; refusing to run without a known entry point.',
    }
  }
  if (typeof modulePath !== 'string' || modulePath.trim() === '') {
    return {
      mode: 'error',
      reason: 'The module path could not be resolved; refusing to run without a known module path.',
    }
  }
  if (!resolvedPathMatches(argvPath, modulePath)) {
    return { mode: 'import', reason: null }
  }
  return { mode: 'execute', reason: null }
}

/**
 * A release script may only run from its canonical repository path. A renamed
 * copy must fail loudly instead of silently doing nothing.
 */
export function assertCanonicalScriptPath({ modulePath, repositoryRoot, expectedScriptPath }) {
  assert.ok(typeof repositoryRoot === 'string' && path.isAbsolute(repositoryRoot), 'The repository root must be absolute.')
  assert.ok(typeof expectedScriptPath === 'string' && expectedScriptPath.length > 0, 'The expected script path is required.')
  const canonical = path.join(repositoryRoot, expectedScriptPath)
  if (!resolvedPathMatches(modulePath, canonical)) {
    throw new Error(`This script must be run as ${expectedScriptPath}; it must not be run under another name or location.`)
  }
  return canonical
}

export function assertCandidateBuildEvidence({ evidence, liveImageId, imageLabels }) {
  assert.ok(evidence && typeof evidence === 'object', 'Candidate build evidence is required.')
  assert.equal(evidence.status, 'built', 'Candidate build evidence must record a successful build.')
  assert.equal(evidence.imageTag, WORKING_TREE_CANDIDATE_TAG)
  assertSha256(evidence.sourceSha256, 'Candidate source SHA-256')
  assertReleaseIdentity(evidence.releaseIdentity)
  const expectedLabels = workingTreeBuildLabels({
    sourceSha256: evidence.sourceSha256,
    releaseIdentity: evidence.releaseIdentity,
  })
  assert.deepEqual(evidence.labels, expectedLabels, 'Candidate evidence labels do not match the source-bound release identity.')
  assertCandidateBuildVerification({
    imageId: evidence.imageId,
    imageLabels,
    labels: expectedLabels,
    sourceSha256: evidence.sourceSha256,
    sourceSha256AfterBuild: evidence.sourceSha256,
    liveImageId,
    migrationRegistry: evidence.migrationRegistry,
  })
  assert.equal(evidence.builder, WORKING_TREE_BUILDER_NAME)
  return evidence
}

export function assertSourceLabelEvidenceConsistency({ evidence, imageLabels, runtimeReleaseIdentity }) {
  assert.ok(evidence && typeof evidence === 'object', 'Candidate evidence is required.')
  assertSha256(evidence.sourceSha256, 'Candidate source SHA-256')
  assertReleaseIdentity(evidence.releaseIdentity)
  const expectedLabels = workingTreeBuildLabels({
    sourceSha256: evidence.sourceSha256,
    releaseIdentity: evidence.releaseIdentity,
  })
  assert.deepEqual(evidence.labels, expectedLabels, 'Candidate evidence labels are inconsistent.')
  for (const [name, value] of Object.entries(expectedLabels)) {
    assert.equal(imageLabels?.[name], value, `Candidate image label is inconsistent: ${name}`)
  }
  if (runtimeReleaseIdentity !== undefined) {
    assert.equal(runtimeReleaseIdentity, evidence.releaseIdentity, 'Runtime and candidate release identities disagree.')
  }
  return true
}

export function workingTreePromotionOverride({ candidateTag, releaseIdentity }) {
  assert.equal(candidateTag, WORKING_TREE_CANDIDATE_TAG)
  assertReleaseIdentity(releaseIdentity)
  return {
    services: {
      'metardu-app': {
        image: candidateTag,
        environment: { METARDU_BUILD_SHA: releaseIdentity },
      },
      'metardu-db-migrate': {
        image: candidateTag,
      },
    },
  }
}

export function assertPromotedHealthContract({ httpStatus, body, releaseIdentity }) {
  assert.equal(httpStatus, 200, 'Promoted public health endpoint must return HTTP 200.')
  assert.equal(body?.status, 'healthy', 'Promoted public health endpoint must report healthy status.')
  assert.equal(body?.checks?.database?.status, 'ok', 'Promoted database health must be ok.')
  assert.equal(body?.checks?.redis?.status, 'ok', 'Promoted Redis health must be ok.')
  assert.equal(body?.releaseId, releaseIdentity, 'Promoted health must report the exact candidate release identity.')
  return true
}

export function updateEnvReleaseIdentity(text, releaseIdentity) {
  assert.equal(typeof text, 'string', 'Local env content must be text.')
  assertReleaseIdentity(releaseIdentity)
  const matches = [...text.matchAll(/(^|[\r\n])(METARDU_BUILD_SHA=)[^\r\n]*/g)]
  assert.ok(matches.length <= 1, 'Local env must contain at most one METARDU_BUILD_SHA entry.')
  if (matches.length === 1) {
    const match = matches[0]
    return `${text.slice(0, match.index)}${match[1]}METARDU_BUILD_SHA=${releaseIdentity}${text.slice(match.index + match[0].length)}`
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  return `${text}${text.length === 0 || text.endsWith('\n') ? '' : eol}METARDU_BUILD_SHA=${releaseIdentity}${eol}`
}

export function restoreEnvReleaseIdentity(text, priorReleaseIdentity) {
  assert.equal(typeof text, 'string', 'Local env content must be text.')
  if (priorReleaseIdentity !== null && priorReleaseIdentity !== undefined) {
    assert.ok(typeof priorReleaseIdentity === 'string' && priorReleaseIdentity.length > 0, 'Prior release identity must be text or null.')
    const matches = [...text.matchAll(/(^|[\r\n])(METARDU_BUILD_SHA=)[^\r\n]*/g)]
    assert.ok(matches.length <= 1, 'Local env must contain at most one METARDU_BUILD_SHA entry.')
    if (matches.length === 0) return text
    const match = matches[0]
    return `${text.slice(0, match.index)}${match[1]}METARDU_BUILD_SHA=${priorReleaseIdentity}${text.slice(match.index + match[0].length)}`
  }
  return text.replace(/(^|[\r\n])METARDU_BUILD_SHA=[^\r\n]*(?=\r?\n|$)/, '').replace(/^\r?\n/, '')
}

export function assertMigration127SchemaContract({
  columns,
  indexes,
  uniqueCheckoutRequestId,
  rlsEnabled,
  rlsForced,
  policyCount,
  beforePolicyCount,
}) {
  assert.ok(Array.isArray(columns), 'Payment-history column evidence is required.')
  const expectedColumns = [
    { name: 'checkout_request_id', dataType: 'character varying', maximumLength: 255, isNullable: 'YES' },
    { name: 'phone_number', dataType: 'character varying', maximumLength: 20, isNullable: 'YES' },
    { name: 'last_reconcile_attempt_at', dataType: 'timestamp with time zone', maximumLength: null, isNullable: 'YES' },
  ]
  for (const expected of expectedColumns) {
    const actual = columns.find(column => column?.name === expected.name)
    assert.ok(actual, `Missing migration-127 column: ${expected.name}`)
    assert.equal(actual.dataType, expected.dataType, `Unexpected type for migration-127 column: ${expected.name}`)
    assert.equal(actual.maximumLength, expected.maximumLength, `Unexpected length for migration-127 column: ${expected.name}`)
    assert.equal(actual.isNullable, expected.isNullable, `Unexpected nullability for migration-127 column: ${expected.name}`)
  }
  assert.ok(Array.isArray(indexes), 'Payment-history index evidence is required.')
  const expectedIndexes = [
    'idx_payment_history_mpesa_checkout_request_id',
    'idx_payment_history_mpesa_pending_checkout',
    'idx_payment_history_mpesa_pending_reconcile_attempt',
  ]
  for (const name of expectedIndexes) {
    const index = indexes.find(candidate => candidate?.name === name)
    assert.ok(index, `Missing migration-127 partial index: ${name}`)
    assert.equal(index.partial, true, `Migration-127 index must remain partial: ${name}`)
  }
  assert.equal(uniqueCheckoutRequestId, false, 'Migration 127 must not introduce a unique checkout_request_id constraint or index.')
  assert.equal(rlsEnabled, true, 'payment_history RLS must remain enabled.')
  assert.equal(rlsForced, true, 'payment_history RLS must remain forced.')
  assert.equal(policyCount, beforePolicyCount, 'payment_history RLS policy count must remain unchanged.')
  return true
}

export function assertPaymentHistoryPreservation({ before, after }) {
  assert.ok(before && typeof before === 'object', 'Pre-migration payment-history baseline is required.')
  assert.ok(after && typeof after === 'object', 'Post-migration payment-history evidence is required.')
  assert.equal(after.totalRows, before.totalRows, 'payment_history row count changed during migration.')
  // The preserved-column fingerprint is customer derived: it is compared by
  // digest so no fingerprint value can reach a message, receipt, or log.
  const beforeFingerprintDigest = sha256(String(before.preservedFingerprint ?? ''))
  const afterFingerprintDigest = sha256(String(after.preservedFingerprint ?? ''))
  if (beforeFingerprintDigest !== afterFingerprintDigest) {
    throw new Error('Original payment_history columns changed during migration.')
  }
  assert.equal(after.checkoutBackfilledRows, before.checkoutEligibleRows, 'Checkout backfill count does not reconcile with the pre-migration eligible count.')
  assert.equal(after.phoneBackfilledRows, before.phoneEligibleRows, 'Phone backfill count does not reconcile with the pre-migration eligible count.')
  assert.equal(after.checkoutDistinctBackfilledIdentities, before.checkoutDistinctEligibleIdentities, 'Checkout identities changed during backfill.')
  assert.equal(after.duplicateCheckoutIdentityGroups, 0, 'Duplicate checkout identities were created.')
  return {
    totalRowsPreserved: true,
    originalColumnsPreserved: true,
    checkoutBackfillReconciled: true,
    phoneBackfillReconciled: true,
    duplicateCheckoutIdentityGroups: 0,
  }
}

/**
 * A stored rollback registry file is compared with the selected migration
 * source by digest. The comparison never renders the migration SQL into an
 * error payload, a receipt, or a log.
 */
export function assertRollbackRegistryFileContent({ stored, expected, version }) {
  assert.ok(typeof version === 'string' && version.length > 0, 'The migration version is required.')
  const digest = value => sha256(Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8'))
  if (digest(stored) !== digest(expected)) {
    throw new Error(`The existing rollback registry file does not match the selected migration source: ${version}`)
  }
  return true
}

export function workingTreeRollbackOverride({ rollbackImage, priorReleaseIdentity, registryDirectory }) {
  assert.equal(rollbackImage, WORKING_TREE_ROLLBACK_TAG)
  assert.ok(typeof priorReleaseIdentity === 'string' && priorReleaseIdentity.length > 0, 'Prior runtime release identity is required.')
  assert.ok(path.isAbsolute(registryDirectory), 'Rollback registry directory must be absolute.')
  const serviceIdentity = /^[a-f0-9]{40}$/.test(priorReleaseIdentity)
    ? priorReleaseIdentity
    : sha256(`metardu-prior-release:${priorReleaseIdentity}`).slice(0, 40)
  const app = rollbackService(rollbackImage, serviceIdentity, registryDirectory)
  app.environment.METARDU_BUILD_SHA = priorReleaseIdentity
  return {
    services: {
      'metardu-app': app,
      'metardu-db-migrate': {
        image: rollbackImage,
        entrypoint: ['node'],
        command: ['/app/verify-migrations.mjs'],
        environment: {
          MIGRATIONS_DIR: WORKING_TREE_ROLLBACK_REGISTRY_DESTINATION,
          DB_HOST: 'metardu-postgres',
          DB_PORT: '5432',
          DB_NAME: '${POSTGRES_DB:-metardu}',
          DB_USER: '${APP_DB_USER:-metardu_app}',
          DB_PASSWORD: '${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set in .env}',
        },
        volumes: app.volumes,
      },
    },
  }
}

export function assertRollbackLedgerExpectation({ actualLedger, beforeLedger, migrationCompleted }) {
  assert.ok(Array.isArray(actualLedger), 'Rollback ledger evidence is required.')
  const expectedCount = migrationCompleted
    ? WORKING_TREE_MIGRATION_TARGET_COUNT
    : beforeLedger.length
  assert.equal(actualLedger.length, expectedCount, 'Rollback ledger count does not match the migration state at failure time.')
  if (migrationCompleted) {
    assert.equal(actualLedger.length, WORKING_TREE_MIGRATION_TARGET_COUNT, 'A completed migration must leave exactly 132 ledger rows.')
  }
  return true
}

/**
 * The failure-time ledger decides whether migration 127 completed. It must
 * never be derived from the post-rollback ledger, which would be circular.
 */
export function rollbackMigrationCompleted(failureTimeLedger) {
  assert.ok(Array.isArray(failureTimeLedger), 'The failure-time migration ledger is required.')
  return failureTimeLedger.some(row => row?.version === WORKING_TREE_MIGRATION_VERSION)
}

/**
 * An existing rollback registry directory may only be reused when it holds
 * exactly the selected registry file set.
 */
export function assertRollbackRegistryFileSet({ entries, selectedFiles }) {
  assert.ok(Array.isArray(entries), 'Rollback registry directory entries must be an array.')
  assert.ok(Array.isArray(selectedFiles) && selectedFiles.length > 0, 'The selected rollback registry must be a non-empty array.')
  const expected = selectedFiles.map(file => path.basename(file.path)).sort(compareCodeUnits)
  const actual = [...entries].sort(compareCodeUnits)
  assert.deepEqual(actual, expected, 'The existing rollback registry directory does not match the selected registry file set.')
  return true
}

export function workingTreeMigrationRegistry(root) {
  const migrationDirectory = path.resolve(root, 'src', 'lib', 'db', 'migrations')
  const files = readdirSync(migrationDirectory)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .map(name => {
      const content = readFileSync(path.join(migrationDirectory, name))
      const lf = Buffer.from(content.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
      const crlf = Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'), 'utf8')
      return {
        version: name.replace(/\.sql$/, ''),
        path: `src/lib/db/migrations/${name}`,
        checksum: sha256(content),
        equivalentChecksums: [sha256(lf), sha256(crlf)],
        content,
      }
    })
  assert.equal(files.length, WORKING_TREE_MIGRATION_TARGET_COUNT, 'The working tree must contain exactly 132 migration files.')
  return files
}

export function workingTreeMigrationEvidence(sourceFiles) {
  return sourceFiles.map(file => ({ version: file.version, checksum: file.checksum }))
}
