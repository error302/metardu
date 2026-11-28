import { expect, test } from '@jest/globals'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'

const repositoryRoot = path.resolve(process.cwd())
const releaseModulePath = path.join(repositoryRoot, 'scripts', 'working-tree-release.mjs')

async function loadReleaseContract() {
  expect(existsSync(releaseModulePath)).toBe(true)
  return import('../scripts/working-tree-release.mjs')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

function temporaryDirectory(prefix) {
  const base = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA ?? tmpdir(), 'Temp', 'opencode')
    : tmpdir()
  mkdirSync(base, { recursive: true })
  return mkdtempSync(path.join(base, prefix))
}

function gitFixture() {
  const root = temporaryDirectory('metardu-working-tree-')
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'release-tests@example.invalid'])
  git(root, ['config', 'user.name', 'Release Tests'])
  mkdirSync(path.join(root, 'public'), { recursive: true })
  writeFileSync(path.join(root, '.gitignore'), 'ignored.txt\n')
  writeFileSync(path.join(root, 'tracked.txt'), 'tracked-v1\n')
  writeFileSync(path.join(root, 'public', 'asset.txt'), 'asset-v1\n')
  git(root, ['add', '-A'])
  return root
}

function fixtureRegistry(count = 132) {
  return Array.from({ length: count }, (_, index) => {
    const version = index === 131
      ? '127_mpesa_payment_completion'
      : `${String(index).padStart(3, '0')}_fixture_${index}`
    return { version, checksum: sha256(version) }
  })
}

function fixtureSourceFiles(registry) {
  return registry.map(file => ({
    ...file,
    path: `src/lib/db/migrations/${file.version}.sql`,
    content: Buffer.from(`${file.version}\n`),
  }))
}

function fixtureRecoveryProof({ sourceSha256, releaseIdentity, sourceRegistry }) {
  return {
    status: 'passed',
    sourceSha256,
    releaseIdentity,
    sourceRegistry,
    sourceRegistrySha256: sha256(JSON.stringify(sourceRegistry)),
    sourceBaseline: 131,
    targetLedgerCount: 132,
    pending: ['127_mpesa_payment_completion'],
    backup: {
      databaseArchiveSha256: 'a'.repeat(64),
      uploadsArchiveSha256: 'b'.repeat(64),
      integrityVerified: true,
      restored: true,
    },
    cleanup: {
      databaseRemoved: true,
      uploadsCopyRemoved: true,
      temporaryRoleRemoved: true,
    },
    checks: [
      { name: 'database-restore', passed: true },
      { name: 'uploads-restore', passed: true },
      { name: 'upgrade-rehearsal', passed: true },
    ],
  }
}

function applicationContainer(overrides = {}) {
  return {
    Id: 'a'.repeat(64),
    Name: '/metardu-app',
    Image: `sha256:${'1'.repeat(64)}`,
    State: { StartedAt: '2026-01-01T00:00:00.000Z', Health: { Status: 'healthy' } },
    Config: {
      Labels: { 'com.docker.compose.service': 'metardu-app' },
      Env: ['METARDU_BUILD_SHA=old-release', 'AUTH_SECRET=live-secret'],
    },
    Mounts: [
      { Type: 'volume', Name: 'uploads_data', Source: '/volume/uploads', Destination: '/app/upload', RW: true },
    ],
    ...overrides,
  }
}

test('tracked content changes alter the working-tree source hash', async () => {
  const { computeWorkingTreeSourceHash } = await loadReleaseContract()
  const root = gitFixture()
  try {
    const before = computeWorkingTreeSourceHash({ cwd: root })
    writeFileSync(path.join(root, 'tracked.txt'), 'tracked-v2\n')
    const after = computeWorkingTreeSourceHash({ cwd: root })
    expect(after).not.toBe(before)
    expect(after).toMatch(/^[a-f0-9]{64}$/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a non-ignored untracked runtime file alters the working-tree source hash', async () => {
  const { computeWorkingTreeSourceHash } = await loadReleaseContract()
  const root = gitFixture()
  try {
    const before = computeWorkingTreeSourceHash({ cwd: root })
    writeFileSync(path.join(root, 'public', 'runtime.txt'), 'runtime-v1\n')
    const after = computeWorkingTreeSourceHash({ cwd: root })
    expect(after).not.toBe(before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a tracked deletion alters the working-tree source hash through an explicit missing marker', async () => {
  const { computeWorkingTreeSourceHash } = await loadReleaseContract()
  const root = gitFixture()
  try {
    const before = computeWorkingTreeSourceHash({ cwd: root })
    rmSync(path.join(root, 'tracked.txt'))
    const after = computeWorkingTreeSourceHash({ cwd: root })
    expect(after).not.toBe(before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an ignored file does not alter the working-tree source hash', async () => {
  const { computeWorkingTreeSourceHash } = await loadReleaseContract()
  const root = gitFixture()
  try {
    const before = computeWorkingTreeSourceHash({ cwd: root })
    writeFileSync(path.join(root, 'ignored.txt'), 'ignored-v1\n')
    const after = computeWorkingTreeSourceHash({ cwd: root })
    expect(after).toBe(before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('working-tree hashing is independent of the launch directory', async () => {
  const { computeWorkingTreeSourceHash } = await loadReleaseContract()
  const root = gitFixture()
  try {
    const nested = path.join(root, 'public')
    expect(computeWorkingTreeSourceHash({ cwd: nested })).toBe(
      computeWorkingTreeSourceHash({ cwd: root }),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('path and content framing is unambiguous', async () => {
  const { hashWorkingTreeEntries } = await loadReleaseContract()
  const left = hashWorkingTreeEntries([
    { path: 'a', kind: 'file', content: Buffer.from('bc') },
  ])
  const right = hashWorkingTreeEntries([
    { path: 'ab', kind: 'file', content: Buffer.from('c') },
  ])
  expect(left).not.toBe(right)
})

test('release identity is deterministic, source-bound, and exactly 40 lowercase hex characters', async () => {
  const { workingTreeReleaseIdentity } = await loadReleaseContract()
  const sourceSha256 = 'a'.repeat(64)
  const releaseIdentity = workingTreeReleaseIdentity(sourceSha256)
  expect(releaseIdentity).toMatch(/^[a-f0-9]{40}$/)
  expect(workingTreeReleaseIdentity(sourceSha256)).toBe(releaseIdentity)
  expect(workingTreeReleaseIdentity('b'.repeat(64))).not.toBe(releaseIdentity)
})

test('canonical mounts compare independently of source order but require exact fields', async () => {
  const { assertCanonicalMountsEqual, canonicalMounts } = await loadReleaseContract()
  const first = { Type: 'volume', Name: 'uploads', Source: '/vol', Destination: '/app/upload', RW: true }
  const second = { Type: 'bind', Name: null, Source: '/cache', Destination: '/app/cache', RW: false }
  expect(canonicalMounts([first, second])).toEqual(canonicalMounts([second, first]))
  expect(() => assertCanonicalMountsEqual([first, second], [second, first])).not.toThrow()
  expect(() => assertCanonicalMountsEqual([{ ...first, RW: false }], [first])).toThrow()
  expect(() => assertCanonicalMountsEqual([{ ...first, Source: '/other' }], [first])).toThrow()
})

test('exactly one application container is enforced', async () => {
  const { assertExactlyOneApplicationContainer } = await loadReleaseContract()
  const app = applicationContainer()
  expect(assertExactlyOneApplicationContainer([app]).Id).toBe(app.Id)
  expect(() => assertExactlyOneApplicationContainer([])).toThrow()
  expect(() => assertExactlyOneApplicationContainer([
    app,
    applicationContainer({ Id: 'b'.repeat(64), Name: '/metardu-app-copy' }),
  ])).toThrow()
})

test('candidate, application, and migration images must be the same exact artifact', async () => {
  const { assertCandidateArtifactPairing } = await loadReleaseContract()
  const imageId = `sha256:${'c'.repeat(64)}`
  expect(() => assertCandidateArtifactPairing({
    candidateTag: 'metardu-metardu-app:candidate',
    candidateImageId: imageId,
    applicationImageId: imageId,
    migrationImageId: imageId,
  })).not.toThrow()
  expect(() => assertCandidateArtifactPairing({
    candidateTag: 'metardu-metardu-app:candidate',
    candidateImageId: imageId,
    applicationImageId: `sha256:${'d'.repeat(64)}`,
    migrationImageId: imageId,
  })).toThrow()
})

test('the migration baseline is exactly 131 applied with only migration 127 missing', async () => {
  const { assertWorkingTreeMigrationBaseline } = await loadReleaseContract()
  const sourceRegistry = fixtureRegistry()
  const ledger = sourceRegistry.slice(0, 131)
  expect(assertWorkingTreeMigrationBaseline({ sourceRegistry, ledger })).toMatchObject({
    appliedCount: 131,
    targetCount: 132,
    missing: ['127_mpesa_payment_completion'],
    mutatedCount: 0,
    ghostCount: 0,
    historicalChecksumsPreserved: true,
  })
  expect(() => assertWorkingTreeMigrationBaseline({ sourceRegistry, ledger: ledger.slice(0, 130) })).toThrow()
  expect(() => assertWorkingTreeMigrationBaseline({
    sourceRegistry,
    ledger: [{ ...ledger[0], checksum: 'f'.repeat(64) }, ...ledger.slice(1)],
  })).toThrow()
  expect(() => assertWorkingTreeMigrationBaseline({
    sourceRegistry,
    ledger: [...ledger, { version: '999_ghost', checksum: 'e'.repeat(64) }],
  })).toThrow()
})

test('the post-migration ledger is exactly 132 and preserves every historical checksum', async () => {
  const { assertWorkingTreeMigrationAfter } = await loadReleaseContract()
  const sourceRegistry = fixtureRegistry()
  const beforeLedger = sourceRegistry.slice(0, 131)
  const afterLedger = sourceRegistry
  expect(assertWorkingTreeMigrationAfter({ sourceRegistry, beforeLedger, afterLedger })).toMatchObject({
    appliedCount: 132,
    mutatedCount: 0,
    ghostCount: 0,
    historicalChecksumsPreserved: true,
  })
  expect(() => assertWorkingTreeMigrationAfter({
    sourceRegistry,
    beforeLedger,
    afterLedger: afterLedger.slice(0, 131),
  })).toThrow()
  expect(() => assertWorkingTreeMigrationAfter({
    sourceRegistry,
    beforeLedger,
    afterLedger: [{ ...afterLedger[0], checksum: 'f'.repeat(64) }, ...afterLedger.slice(1)],
  })).toThrow()
})

test('release-scoped recovery proof admission binds the exact 132-file registry and transition', async () => {
  const {
    assertWorkingTreeRecoveryProof,
    workingTreeRecoveryProofPath,
  } = await loadReleaseContract()
  const sourceRegistry = fixtureRegistry()
  const sourceSha256 = 'd'.repeat(64)
  const releaseIdentity = 'e'.repeat(40)
  const proof = fixtureRecoveryProof({ sourceSha256, releaseIdentity, sourceRegistry })
  expect(() => assertWorkingTreeRecoveryProof(proof, {
    sourceSha256,
    releaseIdentity,
    sourceRegistry,
  })).not.toThrow()
  expect(workingTreeRecoveryProofPath(repositoryRoot, sourceSha256)).toBe(path.join(
    repositoryRoot,
    '.cache',
    'release-verify',
    'working-tree-candidate',
    sourceSha256,
    'recovery-proof',
    'verification.json',
  ))
  expect(workingTreeRecoveryProofPath(repositoryRoot, sourceSha256)).not.toContain(
    path.join('test-results', 'recovery-proof'),
  )
  expect(() => assertWorkingTreeRecoveryProof({ ...proof, sourceRegistry: sourceRegistry.slice(0, 131) }, {
    sourceSha256,
    releaseIdentity,
    sourceRegistry,
  })).toThrow()
  expect(() => assertWorkingTreeRecoveryProof({ ...proof, targetLedgerCount: 131 }, {
    sourceSha256,
    releaseIdentity,
    sourceRegistry,
  })).toThrow()
  expect(() => assertWorkingTreeRecoveryProof({
    ...proof,
    backup: { ...proof.backup, restored: false },
  }, {
    sourceSha256,
    releaseIdentity,
    sourceRegistry,
  })).toThrow()
})

test('rollback registry selection follows the actual 131- or 132-row live ledger', async () => {
  const { selectWorkingTreeRollbackRegistry } = await loadReleaseContract()
  const sourceRegistry = fixtureRegistry()
  const sourceFiles = fixtureSourceFiles(sourceRegistry)
  const before = selectWorkingTreeRollbackRegistry(sourceFiles, sourceRegistry.slice(0, 131))
  const after = selectWorkingTreeRollbackRegistry(sourceFiles, sourceRegistry)
  expect(before).toHaveLength(131)
  expect(after).toHaveLength(132)
  expect(after.at(-1).version).toBe('127_mpesa_payment_completion')
})

test('the retired manual-till route must be 404 for GET and POST', async () => {
  const { assertRetiredTillRouteStatus } = await loadReleaseContract()
  expect(() => assertRetiredTillRouteStatus({ getStatus: 404, postStatus: 404 })).not.toThrow()
  expect(() => assertRetiredTillRouteStatus({ getStatus: 404, postStatus: 200 })).toThrow()
  expect(() => assertRetiredTillRouteStatus({ getStatus: 500, postStatus: 404 })).toThrow()
})

test('environment continuity evidence contains no secret values or secret hashes', async () => {
  const { assertEnvironmentContinuity } = await loadReleaseContract()
  const secret = 'do-not-evidence-this-secret'
  const live = {
    METARDU_BUILD_SHA: 'old-release',
    AUTH_SECRET: secret,
    DB_PASSWORD: 'another-secret',
  }
  const resolved = {
    METARDU_BUILD_SHA: 'f'.repeat(40),
    AUTH_SECRET: secret,
    DB_PASSWORD: 'another-secret',
  }
  const evidence = assertEnvironmentContinuity(live, resolved, {
    releaseIdentity: 'f'.repeat(40),
  })
  const serialized = JSON.stringify(evidence)
  expect(serialized).not.toContain(secret)
  expect(serialized).not.toContain('another-secret')
  expect(serialized).not.toContain(sha256(secret))
  expect(evidence).toEqual({
    configuredKeyCount: 3,
    continuousKeyCount: 2,
    releaseIdentityChanged: true,
  })
  expect(() => assertEnvironmentContinuity(
    { ...live, AUTH_SECRET: 'changed' },
    resolved,
    { releaseIdentity: 'f'.repeat(40) },
  )).toThrow()
})

test('supporting-service identities and canonical mounts must remain unchanged', async () => {
  const { assertSupportingServicesPreserved } = await loadReleaseContract()
  const before = [applicationContainer({
    Id: '1'.repeat(64),
    Name: '/metardu-postgres',
    Image: `sha256:${'2'.repeat(64)}`,
  })]
  const after = [{
    ...before[0],
    Mounts: [...before[0].Mounts].reverse(),
  }]
  expect(() => assertSupportingServicesPreserved(before, after, {
    supportingNames: ['metardu-postgres'],
  })).not.toThrow()
  expect(() => assertSupportingServicesPreserved(before, [{
    ...after[0],
    Id: '3'.repeat(64),
  }], {
    supportingNames: ['metardu-postgres'],
  })).toThrow()
})

test('builder command and labels use only the reusable candidate, desktop-linux, and complete build args', async () => {
  const {
    WORKING_TREE_BUILDER_NAME,
    WORKING_TREE_CANDIDATE_TAG,
    workingTreeBuildCommand,
    workingTreeBuildLabels,
  } = await loadReleaseContract()
  const sourceSha256 = '1'.repeat(64)
  const releaseIdentity = '2'.repeat(40)
  const buildArgs = {
    NEXT_PUBLIC_APP_URL: 'https://metardu.space',
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: '',
    NEXT_PUBLIC_COLLABORATION_SAME_ORIGIN: '1',
    NEXT_PUBLIC_WS_URL: 'wss://metardu.space/ws/collaboration',
  }
  const command = workingTreeBuildCommand({ sourceSha256, releaseIdentity, buildArgs })
  expect(command).toContain('--builder')
  expect(command[command.indexOf('--builder') + 1]).toBe(WORKING_TREE_BUILDER_NAME)
  expect(command[command.indexOf('--tag') + 1]).toBe(WORKING_TREE_CANDIDATE_TAG)
  expect(command.at(-1)).toBe('.')
  for (const [name, value] of Object.entries(buildArgs)) {
    expect(command).toContain(`${name}=${value}`)
  }
  expect(workingTreeBuildLabels({ sourceSha256, releaseIdentity })).toMatchObject({
    'org.opencontainers.image.revision': releaseIdentity,
    'io.metardu.release.identity': releaseIdentity,
    'io.metardu.source.sha256': sourceSha256,
  })
})

test('build evidence is source-scoped and build logs retain earlier attempts', async () => {
  const {
    createExclusiveBuildLog,
    workingTreeEvidenceDirectory,
  } = await loadReleaseContract()
  const sourceSha256 = '3'.repeat(64)
  const evidenceDirectory = workingTreeEvidenceDirectory(repositoryRoot, sourceSha256)
  expect(evidenceDirectory).toBe(path.join(
    repositoryRoot,
    '.cache',
    'release-verify',
    'working-tree-candidate',
    sourceSha256,
  ))
  const temporary = temporaryDirectory('metardu-build-log-')
  try {
    const first = await createExclusiveBuildLog(temporary)
    first.stream.write('first-attempt\n')
    await new Promise(resolve => first.stream.end(resolve))
    const second = await createExclusiveBuildLog(temporary)
    expect(first.attempt).toBe(1)
    expect(second.attempt).toBe(2)
    expect(readFileSync(first.path, 'utf8')).toContain('first-attempt')
    second.stream.end()
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('candidate evidence must differ from production and match image labels', async () => {
  const {
    assertCandidateBuildEvidence,
    assertSourceLabelEvidenceConsistency,
    workingTreeBuildLabels,
  } = await loadReleaseContract()
  const sourceSha256 = '4'.repeat(64)
  const releaseIdentity = '5'.repeat(40)
  const labels = workingTreeBuildLabels({ sourceSha256, releaseIdentity })
  const evidence = {
    status: 'built',
    imageTag: 'metardu-metardu-app:candidate',
    imageId: `sha256:${'6'.repeat(64)}`,
    sourceSha256,
    releaseIdentity,
    labels,
    builder: 'desktop-linux',
    migrationRegistry: {
      count: 132,
      checksums: fixtureRegistry(),
    },
  }
  expect(() => assertCandidateBuildEvidence({
    evidence,
    liveImageId: `sha256:${'7'.repeat(64)}`,
    imageLabels: labels,
  })).not.toThrow()
  expect(() => assertCandidateBuildEvidence({
    evidence,
    liveImageId: evidence.imageId,
    imageLabels: labels,
  })).toThrow()
  expect(() => assertCandidateBuildEvidence({
    evidence,
    liveImageId: `sha256:${'7'.repeat(64)}`,
    imageLabels: { ...labels, 'io.metardu.source.sha256': '8'.repeat(64) },
  })).toThrow()
  expect(() => assertSourceLabelEvidenceConsistency({
    evidence,
    imageLabels: labels,
    runtimeReleaseIdentity: releaseIdentity,
  })).not.toThrow()
})

test('rollback preservation aliases are content-addressed and conflicting aliases fail closed', async () => {
  const {
    assertRollbackAliasDoesNotConflict,
    rollbackPreservationAlias,
  } = await loadReleaseContract()
  const imageId = `sha256:${'9'.repeat(64)}`
  const alias = rollbackPreservationAlias(imageId)
  expect(alias).toBe('metardu-metardu-app:rollback-9999999999999999')
  expect(() => assertRollbackAliasDoesNotConflict(imageId, null)).not.toThrow()
  expect(() => assertRollbackAliasDoesNotConflict(imageId, imageId)).not.toThrow()
  expect(() => assertRollbackAliasDoesNotConflict(imageId, `sha256:${'a'.repeat(64)}`)).toThrow()
})

test('promotion override renders the same candidate image for application and migration services', async () => {
  const { workingTreePromotionOverride } = await loadReleaseContract()
  const override = workingTreePromotionOverride({
    candidateTag: 'metardu-metardu-app:candidate',
    releaseIdentity: 'b'.repeat(40),
  })
  expect(override.services['metardu-app'].image).toBe('metardu-metardu-app:candidate')
  expect(override.services['metardu-db-migrate'].image).toBe('metardu-metardu-app:candidate')
  expect(override.services['metardu-app'].environment.METARDU_BUILD_SHA).toBe('b'.repeat(40))
  expect(JSON.stringify(override)).not.toMatch(/PASSWORD|SECRET|API_KEY/)
})

test('promoted health must report the exact candidate release identity', async () => {
  const { assertPromotedHealthContract } = await loadReleaseContract()
  const releaseIdentity = 'c'.repeat(40)
  expect(() => assertPromotedHealthContract({
    httpStatus: 200,
    body: {
      status: 'healthy',
      releaseId: releaseIdentity,
      checks: { database: { status: 'ok' }, redis: { status: 'ok' } },
    },
    releaseIdentity,
  })).not.toThrow()
  expect(() => assertPromotedHealthContract({
    httpStatus: 200,
    body: {
      status: 'healthy',
      releaseId: 'old',
      checks: { database: { status: 'ok' }, redis: { status: 'ok' } },
    },
    releaseIdentity,
  })).toThrow()
})

test('the local env update changes only METARDU_BUILD_SHA', async () => {
  const {
    restoreEnvReleaseIdentity,
    updateEnvReleaseIdentity,
  } = await loadReleaseContract()
  const original = 'AUTH_SECRET=keep-me\nMETARDU_BUILD_SHA=old\nDB_PASSWORD=also-keep\n'
  const updated = updateEnvReleaseIdentity(original, 'd'.repeat(40))
  expect(updated).toContain('AUTH_SECRET=keep-me')
  expect(updated).toContain('DB_PASSWORD=also-keep')
  expect(updated).toContain(`METARDU_BUILD_SHA=${'d'.repeat(40)}`)
  expect(updated.replace(/METARDU_BUILD_SHA=.*\n?/, '')).toBe(
    original.replace(/METARDU_BUILD_SHA=.*\n?/, ''),
  )
  expect(restoreEnvReleaseIdentity(updated, 'old')).toBe(original)
  expect(restoreEnvReleaseIdentity(updated, null)).not.toContain('METARDU_BUILD_SHA=')
})

test('migration 127 schema, RLS, and payment-history preservation contracts fail closed', async () => {
  const {
    assertMigration127SchemaContract,
    assertPaymentHistoryPreservation,
  } = await loadReleaseContract()
  const columns = [
    { name: 'checkout_request_id', dataType: 'character varying', maximumLength: 255, isNullable: 'YES' },
    { name: 'phone_number', dataType: 'character varying', maximumLength: 20, isNullable: 'YES' },
    { name: 'last_reconcile_attempt_at', dataType: 'timestamp with time zone', maximumLength: null, isNullable: 'YES' },
  ]
  const indexes = [
    { name: 'idx_payment_history_mpesa_checkout_request_id', partial: true },
    { name: 'idx_payment_history_mpesa_pending_checkout', partial: true },
    { name: 'idx_payment_history_mpesa_pending_reconcile_attempt', partial: true },
  ]
  expect(() => assertMigration127SchemaContract({
    columns,
    indexes,
    uniqueCheckoutRequestId: false,
    rlsEnabled: true,
    rlsForced: true,
    policyCount: 4,
    beforePolicyCount: 4,
  })).not.toThrow()
  expect(() => assertMigration127SchemaContract({
    columns,
    indexes,
    uniqueCheckoutRequestId: true,
    rlsEnabled: true,
    rlsForced: true,
    policyCount: 4,
    beforePolicyCount: 4,
  })).toThrow()

  const before = {
    totalRows: 10,
    preservedFingerprint: 'same',
    checkoutEligibleRows: 3,
    checkoutDistinctEligibleIdentities: 3,
    phoneEligibleRows: 2,
  }
  const after = {
    ...before,
    checkoutBackfilledRows: 3,
    checkoutDistinctBackfilledIdentities: 3,
    phoneBackfilledRows: 2,
    duplicateCheckoutIdentityGroups: 0,
  }
  expect(() => assertPaymentHistoryPreservation({ before, after })).not.toThrow()
  expect(() => assertPaymentHistoryPreservation({
    before,
    after: { ...after, preservedFingerprint: 'changed' },
  })).toThrow()
  expect(() => assertPaymentHistoryPreservation({
    before,
    after: { ...after, duplicateCheckoutIdentityGroups: 1 },
  })).toThrow()
})

test('rollback override uses the rollback image, read-only registry, and verify-only migration command', async () => {
  const { workingTreeRollbackOverride } = await loadReleaseContract()
  const registryDirectory = path.resolve(repositoryRoot, '.cache', 'release-verify', 'rollback-registry')
  const override = workingTreeRollbackOverride({
    rollbackImage: 'metardu-metardu-app:rollback-current',
    priorReleaseIdentity: 'e'.repeat(40),
    registryDirectory,
  })
  expect(override.services['metardu-app'].image).toBe('metardu-metardu-app:rollback-current')
  expect(override.services['metardu-app'].environment.MIGRATIONS_DIR).toBe('/app/rollback-migration-registry')
  expect(override.services['metardu-app'].volumes[0].read_only).toBe(true)
  expect(override.services['metardu-db-migrate'].image).toBe('metardu-metardu-app:rollback-current')
  expect(override.services['metardu-db-migrate'].command).toEqual(['/app/verify-migrations.mjs'])
  expect(JSON.stringify(override)).not.toMatch(/actual-secret-value/)
})

test('working-tree scripts contain no stale digest, dated rollback tag, or stale recovery-proof path', () => {
  const builder = readFileSync(path.join(repositoryRoot, 'scripts', 'build-production-candidate.mjs'), 'utf8')
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  for (const source of [builder, promoter]) {
    expect(source).not.toContain('d2b47891fb9fac7064cc446709a1d2cd3fb684d13c6f126c1aae39628f626fc0')
    expect(source).not.toMatch(/rollback-\d{8}/)
    expect(source).not.toContain('test-results/recovery-proof/verification.json')
    expect(source).not.toContain('test-results/production-upgrade')
  }
})

// ---------------------------------------------------------------------------
// Fix round 1 — RED tests for every merged finding in the fix brief.
// ---------------------------------------------------------------------------

test('C1: the candidate build receipt reaches built only after the image and source are verified', async () => {
  const {
    assertCandidateBuildEvidence,
    assertCandidateBuildVerification,
    finalizeCandidateBuildReceipt,
    workingTreeBuildLabels,
  } = await loadReleaseContract()
  const sourceSha256 = '9'.repeat(64)
  const releaseIdentity = 'a'.repeat(40)
  const labels = workingTreeBuildLabels({ sourceSha256, releaseIdentity })
  const imageId = `sha256:${'b'.repeat(64)}`
  const liveImageId = `sha256:${'c'.repeat(64)}`
  const pending = {
    status: 'building',
    imageTag: 'metardu-metardu-app:candidate',
    imageId: null,
    sourceSha256,
    releaseIdentity,
    labels,
    builder: 'desktop-linux',
    migrationRegistry: { count: 132, checksums: fixtureRegistry() },
  }

  // A receipt that is still building is never admissible evidence.
  expect(() => assertCandidateBuildEvidence({
    evidence: pending,
    liveImageId,
    imageLabels: labels,
  })).toThrow()

  // An unverified build never reports "built".
  expect(finalizeCandidateBuildReceipt(pending, { verified: false }).status).toBe('build-failed')
  expect(() => finalizeCandidateBuildReceipt(pending, { verified: true })).toThrow()

  const built = finalizeCandidateBuildReceipt(pending, { verified: true, imageId })
  expect(built.status).toBe('built')
  expect(built.imageId).toBe(imageId)
  expect(() => assertCandidateBuildEvidence({
    evidence: built,
    liveImageId,
    imageLabels: labels,
  })).not.toThrow()

  // Source stability is part of the verification, not of the admission step.
  expect(() => assertCandidateBuildVerification({
    imageId,
    imageLabels: labels,
    labels,
    sourceSha256,
    sourceSha256AfterBuild: 'd'.repeat(64),
    liveImageId,
    migrationRegistry: pending.migrationRegistry,
  })).toThrow()
})

test('C1: the builder records built only after verification and before evidence admission', () => {
  const builder = readFileSync(path.join(repositoryRoot, 'scripts', 'build-production-candidate.mjs'), 'utf8')
  const verificationIndex = builder.indexOf('assertCandidateBuildVerification(')
  const finalizeIndex = builder.indexOf('finalizeCandidateBuildReceipt(')
  const admissionIndex = builder.indexOf('assertCandidateBuildEvidence(')
  expect(verificationIndex).toBeGreaterThan(-1)
  expect(finalizeIndex).toBeGreaterThan(verificationIndex)
  expect(admissionIndex).toBeGreaterThan(finalizeIndex)
  expect(builder).toContain('build-failed')
})

test('C2: an environment divergence reports only the key name and never a value or digest', async () => {
  const { assertEnvironmentContinuity } = await loadReleaseContract()
  const liveSecret = 'live-secret-value-must-not-leak'
  const resolvedSecret = 'resolved-secret-value-must-not-leak'
  const live = { METARDU_BUILD_SHA: 'old-release', AUTH_SECRET: liveSecret }
  const resolved = { METARDU_BUILD_SHA: 'f'.repeat(40), AUTH_SECRET: resolvedSecret }

  let failure
  try {
    assertEnvironmentContinuity(live, resolved, { releaseIdentity: 'f'.repeat(40) })
  } catch (error) {
    failure = error
  }
  expect(failure).toBeDefined()
  expect(failure.name).not.toBe('AssertionError')
  const surfaced = `${failure.message}\n${failure.stack ?? ''}`
  expect(surfaced).toContain('AUTH_SECRET')
  expect(surfaced).not.toContain(liveSecret)
  expect(surfaced).not.toContain(resolvedSecret)
  expect(surfaced).not.toContain(sha256(liveSecret))
  expect(surfaced).not.toContain(sha256(resolvedSecret))
  expect(failure.message).not.toContain('actual')
  expect(failure.message).not.toContain('expected')

  const matching = assertEnvironmentContinuity(
    { METARDU_BUILD_SHA: 'old-release', AUTH_SECRET: liveSecret },
    { METARDU_BUILD_SHA: 'f'.repeat(40), AUTH_SECRET: liveSecret },
    { releaseIdentity: 'f'.repeat(40) },
  )
  expect(matching).toEqual({
    configuredKeyCount: 2,
    continuousKeyCount: 1,
    releaseIdentityChanged: true,
  })
  expect(JSON.stringify(matching)).not.toContain(liveSecret)
  expect(JSON.stringify(matching)).not.toContain(sha256(liveSecret))
})

test('I1: a healthy rollback keeps the original mounts and adds the read-only registry mount', async () => {
  const { assertRollbackAppMounts } = await loadReleaseContract()
  const registryDirectory = path.resolve(repositoryRoot, '.cache', 'release-verify', 'rollback-registry')
  const original = [
    { Type: 'volume', Name: 'uploads_data', Source: '/volume/uploads', Destination: '/app/upload', RW: true },
  ]
  const registryMount = {
    Type: 'bind',
    Name: null,
    Source: registryDirectory,
    Destination: '/app/rollback-migration-registry',
    RW: false,
  }
  expect(() => assertRollbackAppMounts({
    originalMounts: original,
    restoredMounts: [...original, registryMount],
    registryDirectory,
  })).not.toThrow()
  expect(() => assertRollbackAppMounts({
    originalMounts: original,
    restoredMounts: original,
    registryDirectory,
  })).toThrow()
  expect(() => assertRollbackAppMounts({
    originalMounts: original,
    restoredMounts: [...original, { ...registryMount, RW: true }],
    registryDirectory,
  })).toThrow()
  expect(() => assertRollbackAppMounts({
    originalMounts: original,
    restoredMounts: [{ ...original[0], Source: '/other/uploads' }, registryMount],
    registryDirectory,
  })).toThrow()
})

test('I2: the resolved Compose services must both point at the candidate artifact', async () => {
  const { assertResolvedCandidateServices } = await loadReleaseContract()
  const candidateTag = 'metardu-metardu-app:candidate'
  expect(() => assertResolvedCandidateServices({
    resolvedServices: {
      'metardu-app': { image: candidateTag },
      'metardu-db-migrate': { image: candidateTag },
    },
    candidateTag,
  })).not.toThrow()
  expect(() => assertResolvedCandidateServices({
    resolvedServices: {
      'metardu-app': { image: candidateTag },
      'metardu-db-migrate': { image: 'metardu-metardu-app:latest' },
    },
    candidateTag,
  })).toThrow()
  expect(() => assertResolvedCandidateServices({
    resolvedServices: {
      'metardu-db-migrate': { image: candidateTag },
    },
    candidateTag,
  })).toThrow()
})

test('I3: the candidate tag binding must not change during promotion', async () => {
  const { assertCandidateTagBinding } = await loadReleaseContract()
  const imageId = `sha256:${'e'.repeat(64)}`
  expect(() => assertCandidateTagBinding({
    candidateTag: 'metardu-metardu-app:candidate',
    expectedImageId: imageId,
    actualImageId: imageId,
  })).not.toThrow()
  expect(() => assertCandidateTagBinding({
    candidateTag: 'metardu-metardu-app:candidate',
    expectedImageId: imageId,
    actualImageId: `sha256:${'f'.repeat(64)}`,
  })).toThrow()
})

test('I3: the builder and the promoter share one candidate build lock', async () => {
  const { workingTreeCandidateBuildLockPath } = await loadReleaseContract()
  expect(workingTreeCandidateBuildLockPath(repositoryRoot)).toBe(path.join(
    repositoryRoot,
    '.cache',
    'release-verify',
    'working-tree-candidate-build.lock',
  ))
  const builder = readFileSync(path.join(repositoryRoot, 'scripts', 'build-production-candidate.mjs'), 'utf8')
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  for (const source of [builder, promoter]) {
    expect(source).toContain('withExclusiveCandidateBuild')
    expect(source).toContain('workingTreeCandidateBuildLockPath')
  }
})

test('I4: preflight starts runtime verification with docker:verify', () => {
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  const verifyIndex = promoter.search(/await runDockerVerify\(root\)/)
  const inspectIndex = promoter.search(/const containers = inspectContainers\(\)/)
  expect(verifyIndex).toBeGreaterThan(-1)
  expect(inspectIndex).toBeGreaterThan(-1)
  expect(verifyIndex).toBeLessThan(inspectIndex)
  expect(promoter).toContain('docker:verify')
})

test('M1/M-j: the migration verifier restores an exact direct-execution guard', () => {
  const source = readFileSync(path.join(repositoryRoot, 'scripts', 'verify-migrations.mjs'), 'utf8')
  expect(source).toContain('import.meta.url')
  expect(source).toContain('realpathSync')
  expect(source).not.toMatch(/basename\(invokedPath\)\s*===\s*'verify-migrations\.mjs'/)
  expect(source).not.toMatch(/pathToFileURL\(process\.argv\[1\]\)/)
})

test('M2: canonical mount ordering is locale independent', async () => {
  const { canonicalMounts } = await loadReleaseContract()
  const mounts = [
    { Type: 'volume', Name: 'lower', Source: '/lower', Destination: '/app/a', RW: true },
    { Type: 'volume', Name: 'upper', Source: '/upper', Destination: '/app/B', RW: true },
  ]
  expect(canonicalMounts(mounts).map(mount => mount.destination)).toEqual(['/app/B', '/app/a'])
})

test('M4: preflight does not compare supporting services with themselves', () => {
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  expect(promoter).not.toMatch(/assertSupportingServicesPreserved\(\s*supporting\s*,\s*supporting/)
  expect(promoter).toMatch(/supportingContainers\(containers\)/)
})

test('M5: the rollback ledger expectation follows the failure-time ledger', async () => {
  const { rollbackMigrationCompleted } = await loadReleaseContract()
  const registry = fixtureRegistry()
  expect(rollbackMigrationCompleted(registry.slice(0, 131))).toBe(false)
  expect(rollbackMigrationCompleted(registry)).toBe(true)
})

test('M6: an existing rollback registry directory must match the selected registry exactly', async () => {
  const { assertRollbackRegistryFileSet } = await loadReleaseContract()
  const selected = fixtureSourceFiles(fixtureRegistry().slice(0, 3))
  const entries = selected.map(file => path.basename(file.path))
  expect(() => assertRollbackRegistryFileSet({ entries, selectedFiles: selected })).not.toThrow()
  expect(() => assertRollbackRegistryFileSet({ entries: entries.slice(0, 2), selectedFiles: selected })).toThrow()
  expect(() => assertRollbackRegistryFileSet({ entries: [...entries, 'extra.sql'], selectedFiles: selected })).toThrow()
})

test('M7: migration drift accepts LF/CRLF-equivalent stored checksums but rejects real mutations', async () => {
  const {
    assertWorkingTreeMigrationBaseline,
    workingTreeMigrationEvidence,
  } = await loadReleaseContract()
  const registry = fixtureRegistry()
  const sourceFiles = registry.map(file => ({
    ...file,
    equivalentChecksums: [sha256(`${file.version}-lf`), sha256(`${file.version}-crlf`)],
  }))
  const ledger = sourceFiles.slice(0, 131).map(file => ({
    version: file.version,
    checksum: file.equivalentChecksums[0],
  }))
  expect(() => assertWorkingTreeMigrationBaseline({ sourceFiles, ledger })).not.toThrow()
  const mutated = [...ledger]
  mutated[0] = { ...mutated[0], checksum: 'f'.repeat(64) }
  expect(() => assertWorkingTreeMigrationBaseline({ sourceFiles, ledger: mutated })).toThrow()

  const evidence = workingTreeMigrationEvidence(sourceFiles)
  expect(evidence).toHaveLength(132)
  for (const entry of evidence) {
    expect(Object.keys(entry).sort()).toEqual(['checksum', 'version'])
  }
})

test('M9: the working directory is normalised to the repository root', async () => {
  const { normaliseWorkingDirectory } = await loadReleaseContract()
  const original = process.cwd()
  const temporary = temporaryDirectory('metardu-cwd-')
  try {
    const resolved = normaliseWorkingDirectory(temporary)
    expect(path.resolve(resolved)).toBe(path.resolve(temporary))
    expect(path.resolve(process.cwd())).toBe(path.resolve(temporary))
  } finally {
    process.chdir(original)
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('M10: application logs are streamed into the backup volume without buffering', async () => {
  const { workingTreeApplicationLogCommands } = await loadReleaseContract()
  const archive = '/backups/app-before-working-tree-abc-attempt-1.log'
  const commands = workingTreeApplicationLogCommands({ archive })
  expect(commands.reader).toEqual(['logs', '--timestamps', 'metardu-app'])
  expect(commands.writer.join(' ')).toContain('noclobber')
  expect(commands.writer.join(' ')).toContain('umask 077')
  expect(commands.writer.join(' ')).toContain(archive)
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  expect(promoter).not.toMatch(/runCommand\('docker', \['logs'/)
})

test('baseline: a matching live runtime identity and image revision is admitted', async () => {
  const { assertPriorReleaseIdentityBaseline } = await loadReleaseContract()
  const identity = '8c459ce7ffe2ea029f77e40dff2538cec4f25d2e'
  const result = assertPriorReleaseIdentityBaseline({
    liveEnvironment: { METARDU_BUILD_SHA: identity },
    resolvedBaseEnvironment: { METARDU_BUILD_SHA: identity },
    liveImageRevision: identity,
  })
  expect(result).toEqual({
    priorReleaseIdentity: identity,
    priorImageRevision: identity,
    imageRuntimeIdentityMismatch: false,
  })
})

test('baseline: an image revision that differs from the runtime identity is admitted and reported', async () => {
  const { assertPriorReleaseIdentityBaseline } = await loadReleaseContract()
  const runtimeIdentity = '8c459ce7ffe2ea029f77e40dff2538cec4f25d2e'
  const imageRevision = '8b1141dd22d2b71b84bc9107961c6b2ecd2e4fc1'
  const result = assertPriorReleaseIdentityBaseline({
    liveEnvironment: { METARDU_BUILD_SHA: runtimeIdentity },
    resolvedBaseEnvironment: { METARDU_BUILD_SHA: runtimeIdentity },
    liveImageRevision: imageRevision,
  })
  expect(result).toEqual({
    priorReleaseIdentity: runtimeIdentity,
    priorImageRevision: imageRevision,
    imageRuntimeIdentityMismatch: true,
  })
})

test('baseline: a live runtime identity that differs from the resolved environment is rejected', async () => {
  const { assertPriorReleaseIdentityBaseline } = await loadReleaseContract()
  expect(() => assertPriorReleaseIdentityBaseline({
    liveEnvironment: { METARDU_BUILD_SHA: '8c459ce7ffe2ea029f77e40dff2538cec4f25d2e' },
    resolvedBaseEnvironment: { METARDU_BUILD_SHA: '1'.repeat(40) },
    liveImageRevision: '8b1141dd22d2b71b84bc9107961c6b2ecd2e4fc1',
  })).toThrow()
})

test('baseline: a live runtime identity that is not exactly 40 lowercase hex is rejected', async () => {
  const { assertPriorReleaseIdentityBaseline } = await loadReleaseContract()
  expect(() => assertPriorReleaseIdentityBaseline({
    liveEnvironment: { METARDU_BUILD_SHA: 'unknown' },
    resolvedBaseEnvironment: { METARDU_BUILD_SHA: 'unknown' },
    liveImageRevision: '8b1141dd22d2b71b84bc9107961c6b2ecd2e4fc1',
  })).toThrow()
  expect(() => assertPriorReleaseIdentityBaseline({
    liveEnvironment: { METARDU_BUILD_SHA: '8C459CE7FFE2EA029F77E40DFF2538CEC4F25D2E' },
    resolvedBaseEnvironment: { METARDU_BUILD_SHA: '8C459CE7FFE2EA029F77E40DFF2538CEC4F25D2E' },
    liveImageRevision: '8b1141dd22d2b71b84bc9107961c6b2ecd2e4fc1',
  })).toThrow()
})

test('baseline: the promoter records the prior identity baseline instead of asserting equality', async () => {
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  expect(promoter).toContain('assertPriorReleaseIdentityBaseline')
  expect(promoter).not.toContain('Live runtime and image release identities disagree.')
  expect(promoter).toContain('imageRuntimeIdentityMismatch')
})

// ---------------------------------------------------------------------------
// Fix round 2 — RED tests for every merged finding in the fix-round-2 brief.
// ---------------------------------------------------------------------------

const registryHostDirectory = 'C:\\Users\\user\\Desktop\\METARDU\\.cache\\release-verify\\working-tree-candidate\\abc123\\rollback-registry\\attempt-1\\deadbeef'
const registryTail = 'Users/user/Desktop/METARDU/.cache/release-verify/working-tree-candidate/abc123/rollback-registry/attempt-1/deadbeef'

function rollbackRegistryMount(source, overrides = {}) {
  return {
    Type: 'bind',
    Name: null,
    Source: source,
    Destination: '/app/rollback-migration-registry',
    RW: false,
    ...overrides,
  }
}

function fakeChildProcess({ closeOn }) {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  if (closeOn === 'stdout') child.stdout.on('end', () => child.emit('close', 0))
  if (closeOn === 'stdin') child.stdin.on('finish', () => child.emit('close', 0))
  return child
}

function cleanDatabaseEnvironment() {
  const env = { ...process.env }
  for (const key of ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    delete env[key]
  }
  return env
}

test('I-1: the rollback registry mount comparison normalises both sides symmetrically', async () => {
  const { assertRollbackAppMounts } = await loadReleaseContract()
  const original = [
    { Type: 'volume', Name: 'uploads_data', Source: '/volume/uploads', Destination: '/app/upload', RW: true },
  ]
  const desktop = `/run/desktop/mnt/host/c/${registryTail}`
  const legacy = `/mnt/host/c/${registryTail}`
  const otherDrive = `/run/desktop/mnt/host/d/${registryTail}`
  const different = '/run/desktop/mnt/host/c/Users/user/Desktop/METARDU/.cache/release-verify/working-tree-candidate/abc123/rollback-registry/attempt-1/cafebabe'

  // 1. The current Docker Desktop host translation is admitted.
  expect(() => assertRollbackAppMounts({
    originalMounts: original,
    restoredMounts: [...original, rollbackRegistryMount(desktop)],
    registryDirectory: registryHostDirectory,
  })).not.toThrow()

  // 2. The legacy host translation is admitted.
  expect(() => assertRollbackAppMounts({
    originalMounts: original,
    restoredMounts: [...original, rollbackRegistryMount(legacy)],
    registryDirectory: registryHostDirectory,
  })).not.toThrow()

  // 3. A source on a different drive is rejected.
  expect(() => assertRollbackAppMounts({
    originalMounts: original,
    restoredMounts: [...original, rollbackRegistryMount(otherDrive)],
    registryDirectory: registryHostDirectory,
  })).toThrow()

  // 4. Trailing slashes and case differences are admitted.
  expect(() => assertRollbackAppMounts({
    originalMounts: original,
    restoredMounts: [...original, rollbackRegistryMount(`/run/desktop/mnt/host/c/${registryTail.toUpperCase()}/`)],
    registryDirectory: registryHostDirectory,
  })).not.toThrow()

  // 5. A genuinely different path is rejected.
  expect(() => assertRollbackAppMounts({
    originalMounts: original,
    restoredMounts: [...original, rollbackRegistryMount(different)],
    registryDirectory: registryHostDirectory,
  })).toThrow()

  // 6. A writable registry mount and a changed upload mount are rejected.
  expect(() => assertRollbackAppMounts({
    originalMounts: original,
    restoredMounts: [...original, rollbackRegistryMount(desktop, { RW: true })],
    registryDirectory: registryHostDirectory,
  })).toThrow()
  expect(() => assertRollbackAppMounts({
    originalMounts: original,
    restoredMounts: [{ ...original[0], Source: '/other/uploads' }, rollbackRegistryMount(desktop)],
    registryDirectory: registryHostDirectory,
  })).toThrow()
})

test('M-a: the identity baseline failure carries no identity value', async () => {
  const { assertPriorReleaseIdentityBaseline } = await loadReleaseContract()
  const live = '8c459ce7ffe2ea029f77e40dff2538cec4f25d2e'
  const resolved = '1'.repeat(40)
  let failure
  try {
    assertPriorReleaseIdentityBaseline({
      liveEnvironment: { METARDU_BUILD_SHA: live },
      resolvedBaseEnvironment: { METARDU_BUILD_SHA: resolved },
      liveImageRevision: '8b1141dd22d2b71b84bc9107961c6b2ecd2e4fc1',
    })
  } catch (error) {
    failure = error
  }
  expect(failure).toBeDefined()
  expect(failure.name).not.toBe('AssertionError')
  const surfaced = `${failure.message}\n${failure.stack ?? ''}`
  expect(surfaced).toContain('METARDU_BUILD_SHA')
  expect(surfaced).not.toContain(live)
  expect(surfaced).not.toContain(resolved)

  // An invalid runtime identity must not leak its value either.
  let invalid
  try {
    assertPriorReleaseIdentityBaseline({
      liveEnvironment: { METARDU_BUILD_SHA: 'super-secret-identity' },
      resolvedBaseEnvironment: { METARDU_BUILD_SHA: 'super-secret-identity' },
      liveImageRevision: '8b1141dd22d2b71b84bc9107961c6b2ecd2e4fc1',
    })
  } catch (error) {
    invalid = error
  }
  expect(invalid).toBeDefined()
  expect(`${invalid.message}\n${invalid.stack ?? ''}`).not.toContain('super-secret-identity')
})

test('M-b: a payment-history fingerprint divergence leaks no fingerprint value', async () => {
  const { assertPaymentHistoryPreservation } = await loadReleaseContract()
  const beforeFingerprint = 'a'.repeat(32)
  const afterFingerprint = 'b'.repeat(32)
  const before = {
    totalRows: 10,
    preservedFingerprint: beforeFingerprint,
    checkoutEligibleRows: 1,
    phoneEligibleRows: 1,
    checkoutDistinctEligibleIdentities: 1,
  }
  const after = {
    totalRows: 10,
    preservedFingerprint: afterFingerprint,
    checkoutBackfilledRows: 1,
    phoneBackfilledRows: 1,
    checkoutDistinctBackfilledIdentities: 1,
    duplicateCheckoutIdentityGroups: 0,
  }
  let failure
  try {
    assertPaymentHistoryPreservation({ before, after })
  } catch (error) {
    failure = error
  }
  expect(failure).toBeDefined()
  const surfaced = `${failure.message}\n${failure.stack ?? ''}`
  expect(surfaced).not.toContain(beforeFingerprint)
  expect(surfaced).not.toContain(afterFingerprint)
})

test('M-c: the rollback registry file comparison never renders migration SQL', async () => {
  const { assertRollbackRegistryFileContent } = await loadReleaseContract()
  const version = '127_mpesa_payment_completion'
  const content = Buffer.from('CREATE TABLE payment_history (id uuid);\n', 'utf8')
  expect(() => assertRollbackRegistryFileContent({ stored: content, expected: content, version })).not.toThrow()
  let failure
  try {
    assertRollbackRegistryFileContent({
      stored: Buffer.from('CREATE TABLE payment_history (id uuid, leaked text);\n', 'utf8'),
      expected: content,
      version,
    })
  } catch (error) {
    failure = error
  }
  expect(failure).toBeDefined()
  const surfaced = `${failure.message}\n${failure.stack ?? ''}`
  expect(surfaced).toContain(version)
  expect(surfaced).not.toContain('CREATE TABLE payment_history')
  expect(surfaced).not.toContain('leaked text')

  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  expect(promoter).not.toMatch(/assert\.deepEqual\(stored,\s*file\.content/)
  expect(promoter).toContain('assertRollbackRegistryFileContent')
})

test('M-d: a missing live image revision label fails closed', async () => {
  const { assertPriorReleaseIdentityBaseline } = await loadReleaseContract()
  const identity = '8c459ce7ffe2ea029f77e40dff2538cec4f25d2e'
  expect(() => assertPriorReleaseIdentityBaseline({
    liveEnvironment: { METARDU_BUILD_SHA: identity },
    resolvedBaseEnvironment: { METARDU_BUILD_SHA: identity },
    liveImageRevision: null,
  })).toThrow()
  expect(() => assertPriorReleaseIdentityBaseline({
    liveEnvironment: { METARDU_BUILD_SHA: identity },
    resolvedBaseEnvironment: { METARDU_BUILD_SHA: identity },
    liveImageRevision: 'not-a-revision',
  })).toThrow()
  expect(() => assertPriorReleaseIdentityBaseline({
    liveEnvironment: { METARDU_BUILD_SHA: identity },
    resolvedBaseEnvironment: { METARDU_BUILD_SHA: identity },
    liveImageRevision: '8b1141dd22d2b71b84bc9107961c6b2ecd2e4fc1',
  })).not.toThrow()
})

test('M-e: the preflight contains no tautological candidate pairing assertion', () => {
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  expect(promoter).not.toContain('assertCandidateArtifactPairing')
  expect(promoter).not.toMatch(/applicationImageId:\s*candidateImageId/)
  expect(promoter).not.toMatch(/migrationImageId:\s*candidateImageId/)
  expect(promoter).toContain('assertResolvedCandidateServices')
})

test('M-f: a failed build leaves an accurate, non-admissible receipt', async () => {
  const {
    assertCandidateBuildEvidence,
    failCandidateBuildReceipt,
    finalizeCandidateBuildReceipt,
    workingTreeBuildLabels,
  } = await loadReleaseContract()
  const sourceSha256 = '9'.repeat(64)
  const releaseIdentity = 'a'.repeat(40)
  const labels = workingTreeBuildLabels({ sourceSha256, releaseIdentity })
  const imageId = `sha256:${'b'.repeat(64)}`
  const liveImageId = `sha256:${'c'.repeat(64)}`
  const building = {
    schemaVersion: 1,
    status: 'building',
    imageTag: 'metardu-metardu-app:candidate',
    imageId: null,
    sourceSha256,
    releaseIdentity,
    labels,
    builder: 'desktop-linux',
    migrationRegistry: { count: 132, checksums: fixtureRegistry() },
    buildAttempts: [
      { attempt: 1, log: '.cache/release-verify/working-tree-candidate/abc/build-1.log', status: 'running' },
    ],
  }

  const failed = failCandidateBuildReceipt(building, {
    reason: 'The candidate build process could not be started or completed.',
    finishedAt: '2026-11-28T00:00:00.000Z',
    logSha256: 'd'.repeat(64),
  })
  expect(failed.status).toBe('build-failed')
  expect(failed.imageId).toBeNull()
  expect(failed.buildAttempts.at(-1).status).toBe('failed')
  expect(failed.buildAttempts.at(-1).log).toBe(building.buildAttempts[0].log)
  expect(failed.buildAttempts.at(-1).logSha256).toBe('d'.repeat(64))
  expect(() => assertCandidateBuildEvidence({
    evidence: failed,
    liveImageId,
    imageLabels: labels,
  })).toThrow()

  // A receipt that was already persisted as built must fall back to a
  // non-admissible build-failed receipt when its admission fails.
  const built = finalizeCandidateBuildReceipt(building, { verified: true, imageId })
  expect(built.status).toBe('built')
  const failedAfterFinalise = failCandidateBuildReceipt(built, {
    reason: 'The finalised candidate evidence was not admissible.',
    finishedAt: '2026-11-28T00:00:01.000Z',
  })
  expect(failedAfterFinalise.status).toBe('build-failed')
  expect(failedAfterFinalise.buildAttempts.at(-1).status).toBe('failed')
  expect(() => assertCandidateBuildEvidence({
    evidence: failedAfterFinalise,
    liveImageId,
    imageLabels: labels,
  })).toThrow()

  const builder = readFileSync(path.join(repositoryRoot, 'scripts', 'build-production-candidate.mjs'), 'utf8')
  expect((builder.match(/failCandidateBuildReceipt\(/g) ?? []).length).toBeGreaterThanOrEqual(3)
  expect((builder.match(/saveReceipt\(receiptPath, failedReceipt\)/g) ?? []).length).toBeGreaterThanOrEqual(3)
})

test('M-g: the entry guard distinguishes execution, import, and a renamed copy', async () => {
  const { assertCanonicalScriptPath, resolveDirectExecution } = await loadReleaseContract()
  const modulePath = path.join(repositoryRoot, 'scripts', 'build-production-candidate.mjs')
  expect(resolveDirectExecution({ argvPath: modulePath, modulePath }).mode).toBe('execute')
  expect(resolveDirectExecution({
    argvPath: path.join(repositoryRoot, 'scripts', 'some-other-script.mjs'),
    modulePath,
  }).mode).toBe('import')
  expect(resolveDirectExecution({ argvPath: '', modulePath }).mode).toBe('error')
  expect(() => assertCanonicalScriptPath({
    modulePath,
    repositoryRoot: repositoryRoot,
    expectedScriptPath: 'scripts/build-production-candidate.mjs',
  })).not.toThrow()
  expect(() => assertCanonicalScriptPath({
    modulePath: path.join(repositoryRoot, 'scripts', 'renamed-copy.mjs'),
    repositoryRoot: repositoryRoot,
    expectedScriptPath: 'scripts/build-production-candidate.mjs',
  })).toThrow()
})

test('M-g: invoking a renamed copy of a release script fails loudly instead of exiting zero', () => {
  const scripts = [
    { file: 'build-production-candidate.mjs', canonical: 'scripts/build-production-candidate.mjs' },
    { file: 'promote-production-candidate.mjs', canonical: 'scripts/promote-production-candidate.mjs' },
  ]
  for (const script of scripts) {
    const probeName = `metardu-entry-guard-probe-${path.parse(script.file).name}.mjs`
    const probePath = path.join(repositoryRoot, 'scripts', probeName)
    try {
      writeFileSync(probePath, readFileSync(path.join(repositoryRoot, 'scripts', script.file)))
      const result = spawnSync(process.execPath, [probePath], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60_000,
        env: { ...process.env },
      })
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toContain(script.canonical)
    } finally {
      rmSync(probePath, { force: true })
    }
  }
})

test('M-h: the application log writer drains its stderr into the archive instead of blocking', async () => {
  const { streamApplicationLog, workingTreeApplicationLogCommands } = await loadReleaseContract()
  const commands = workingTreeApplicationLogCommands({ archive: '/backups/app.log' })
  const reader = fakeChildProcess({ closeOn: 'stdout' })
  const writer = fakeChildProcess({ closeOn: 'stdin' })
  const spawnProcess = (binary, args) => (args === commands.reader ? reader : writer)
  const archived = []
  writer.stdin.on('data', chunk => archived.push(chunk))

  const streaming = streamApplicationLog({
    commands,
    archive: '/backups/app.log',
    spawnProcess,
  })
  reader.stdout.write('application log line\n')
  reader.stderr.write('docker logs warning\n')
  writer.stderr.write('backup writer diagnostic\n')
  reader.stdout.end()
  reader.stderr.end()
  await streaming
  await new Promise(resolve => setTimeout(resolve, 0))

  const archive = Buffer.concat(archived).toString('utf8')
  expect(archive).toContain('application log line')
  expect(archive).toContain('docker logs warning')
  expect(archive).toContain('backup writer diagnostic')

  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  expect(promoter).not.toMatch(/stdio: \['pipe', 'ignore', 'pipe'\]/)
  expect(promoter).toContain('streamApplicationLog(')
})

test('M-j: the migration verifier executes main() for its own entry point and fails closed', () => {
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts', 'verify-migrations.mjs')], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
    env: cleanDatabaseEnvironment(),
  })
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('cannot verify schema state')
})

test('M-j: a symlinked entry point still resolves to the module and runs the verification', async () => {
  const { resolvedPathMatches } = await loadReleaseContract()
  const modulePath = path.join(repositoryRoot, 'scripts', 'verify-migrations.mjs')

  // The comparison resolves symlinks, so a symlinked entry point resolves to
  // the module and is executed instead of exiting zero without verifying.
  const injected = resolvedPathMatches(
    path.join(repositoryRoot, 'scripts', 'verify-link.mjs'),
    modulePath,
    {
      realpath: candidate => (String(candidate).endsWith('verify-link.mjs') ? modulePath : candidate),
    },
  )
  expect(injected).toBe(true)
  expect(resolvedPathMatches(modulePath, modulePath)).toBe(true)
  expect(resolvedPathMatches(path.join(repositoryRoot, 'scripts', 'other.mjs'), modulePath)).toBe(false)

  const directory = temporaryDirectory('metardu-symlink-')
  try {
    const link = path.join(directory, 'verify-link.mjs')
    symlinkSync(modulePath, link)
    const result = spawnSync(process.execPath, [link], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
      env: cleanDatabaseEnvironment(),
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('cannot verify schema state')
  } catch (error) {
    // Windows refuses symlink creation without elevated privileges; the
    // injected-resolution proof above covers the same comparison.
    if (error?.code !== 'EPERM') throw error
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('wiring: the working directory is normalised to the repository root in both operational scripts', () => {
  const builder = readFileSync(path.join(repositoryRoot, 'scripts', 'build-production-candidate.mjs'), 'utf8')
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  // The builder normalises the CWD before its first Compose read.
  expect(builder).toContain('normaliseWorkingDirectory(root)')
  expect(builder.indexOf('normaliseWorkingDirectory(root)')).toBeGreaterThan(-1)
  expect(builder.indexOf('normaliseWorkingDirectory(root)')).toBeLessThan(
    builder.indexOf('const composeConfig = JSON.parse(docker(['),
  )
  // The promoter normalises the CWD before it invokes the preflight or the
  // promotion action, and both actions run under the shared build lock.
  expect(promoter).toContain('normaliseWorkingDirectory(root)')
  expect(promoter.indexOf('normaliseWorkingDirectory(root)')).toBeGreaterThan(-1)
  expect(promoter.indexOf('normaliseWorkingDirectory(root)')).toBeLessThan(
    promoter.indexOf('await runPreflight(root, sourceSha256)'),
  )
  expect(promoter.indexOf('normaliseWorkingDirectory(root)')).toBeLessThan(
    promoter.indexOf('await promote(root, sourceSha256)'),
  )
})

test('wiring: the rollback ledger expectation is derived from the failure-time ledger', async () => {
  const { rollbackMigrationCompleted } = await loadReleaseContract()
  const registry = fixtureRegistry()
  const failureTimeLedger = registry
  const postRollbackLedger = registry.slice(0, 131)
  expect(rollbackMigrationCompleted(failureTimeLedger)).toBe(true)
  // The post-rollback ledger can never prove that migration 127 completed.
  expect(rollbackMigrationCompleted(postRollbackLedger)).toBe(false)
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  expect(promoter).toContain('rollbackMigrationCompleted(actualLedger)')
  expect(promoter).not.toMatch(/rollbackMigrationCompleted\(ledgerAfter/)
})

test('wiring: an existing rollback registry directory is verified, not blindly reused', async () => {
  const { assertRollbackRegistryFileSet } = await loadReleaseContract()
  const selected = fixtureSourceFiles(fixtureRegistry().slice(0, 3))
  expect(() => assertRollbackRegistryFileSet({
    entries: selected.map(file => path.basename(file.path)),
    selectedFiles: selected,
  })).not.toThrow()
  expect(() => assertRollbackRegistryFileSet({ entries: ['only-one.sql'], selectedFiles: selected })).toThrow()
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  expect(promoter).toContain('assertRollbackRegistryFileSet({')
  expect(promoter).toContain("error?.code !== 'EEXIST'")
})

test('wiring: the candidate tag binding is re-proven before every Compose mutation', () => {
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  const bindings = [...promoter.matchAll(/assertCandidateTagBinding\(\{/g)]
  expect(bindings.length).toBeGreaterThanOrEqual(2)
  const composeCalls = [...promoter.matchAll(/composePromotion\(/g)]
  expect(composeCalls.length).toBeGreaterThanOrEqual(2)
  for (const binding of bindings) {
    const followingCompose = composeCalls.find(call => call.index > binding.index)
    expect(followingCompose).toBeDefined()
  }
  expect(promoter).toContain('expectedImageId: preflight.candidateImageId')
  expect(promoter).toContain('actualImageId: imageIdForTag(WORKING_TREE_CANDIDATE_TAG)')
})

test('wiring: application logs are streamed and never buffered through another spelling', () => {
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  expect(promoter).not.toMatch(/runCommand\('docker', \['logs'/)
  expect(promoter).not.toMatch(/docker\(\['logs'/)
  expect(promoter).toContain('workingTreeApplicationLogCommands({')
  expect(promoter).toContain('streamApplicationLog({')
})

test('wiring: the identity baseline call site passes the live image revision', () => {
  const promoter = readFileSync(path.join(repositoryRoot, 'scripts', 'promote-production-candidate.mjs'), 'utf8')
  expect(promoter).toContain('assertPriorReleaseIdentityBaseline({')
  expect(promoter).toContain('liveImageRevision: liveRevision')
  expect(promoter).not.toContain('liveImageRevision: null')
  expect(promoter).toContain('resolvedBaseEnvironment: baseEnvironment')
})
