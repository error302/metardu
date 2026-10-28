// Native migration admission only. Never connects to production, copies customer
// data, edits migration SQL, starts services, or authorizes a release by itself.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { migrationChecksums, computeDrift } from './verify-migrations.mjs'
import { WORKFLOW_UPGRADE_VERSIONS } from './workflow-upgrade-contract.mjs'
import { snapshotExistingRows } from './release-row-snapshot.mjs'

const pendingVersions = WORKFLOW_UPGRADE_VERSIONS
const database = 'metardu_workflow_upgrade_verify'
const fixtureName = 'metardu-schema-rehearsal-20261008'
const fixtureId = 'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0'
const bootstrapUrl = 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify'
const bootstrapMarker = 'METARDU synthetic beacon verification only 2026-10-08'
const hash = value => createHash('sha256').update(value).digest('hex')

export function workflowUpgradeTarget(value) {
  const url = new URL(value)
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol))
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.port, '55433')
  assert.equal(url.pathname, '/metardu_runtime_verify')
  assert.equal(url.search, '')
  assert.equal(url.hash, '')
  url.pathname = '/' + database
  return url.toString()
}

export function workflowUpgradeRegistry(files) {
  assert.equal(files.length, 128, 'Review a changed source registry before rehearsing.')
  assert.equal(new Set(files.map(file => file.version)).size, files.length)
  const pending = files.filter(file => Number(file.version.split('_')[0]) > 114)
  assert.deepEqual(pending.map(file => file.version), pendingVersions)
  const baseline = files.filter(file => !pending.includes(file))
  assert.equal(baseline.length, 119)
  assert.ok(baseline.every(file => /^\d{3}_[a-z0-9_]+$/.test(file.version) && Number(file.version.split('_')[0]) <= 114))
  return { baseline, pending }
}

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024, ...options })
  assert.equal(result.status, 0, `${binary} ${args[0]} failed; credential-bearing output suppressed.`)
  return result.stdout
}

async function main() {
  const revision = process.argv[2]
  assert.equal(process.argv.length, 3, 'Supply one full pinned source commit.')
  assert.match(revision ?? '', /^[a-f0-9]{40}$/)
  const root = process.cwd()
  const git = args => command('git', ['-c', 'core.fsmonitor=false', ...args])
  assert.equal(git(['rev-parse', 'HEAD']).trim(), revision)
  assert.equal(git(['diff', '--name-only', revision, '--', 'src/lib/db/migrations', 'scripts/migrate-unified.mjs', 'scripts/verify-migrations.mjs', 'scripts/provision-runtime-db-role.mjs']).trim(), '', 'The migration implementation must match the pinned commit.')
  const inspected = JSON.parse(command('docker', ['inspect', fixtureName]))[0]
  assert.equal(inspected.Id, fixtureId)
  assert.equal(inspected.Config.Labels['metardu.purpose'], 'schema-rehearsal')
  assert.equal(inspected.State.Running, true)
  assert.deepEqual(inspected.NetworkSettings.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55433' }])
  const files = git(['ls-tree', '-r', '--name-only', revision, 'src/lib/db/migrations']).trim().split('\n').filter(file => file.endsWith('.sql')).sort().map(path => {
    const content = git(['show', `${revision}:${path}`])
    return { path, content, version: path.split('/').at(-1).slice(0, -4), ...migrationChecksums(Buffer.from(content)) }
  })
  const { baseline, pending } = workflowUpgradeRegistry(files)
  const namespace = join(root, '.cache', 'workflow-upgrade', revision)
  mkdirSync(namespace, { recursive: true })
  const directory = join(namespace, 'attempt-' + randomUUID())
  const reportPath = join(directory, 'verification.json')
  assert.equal(existsSync(directory), false, 'Never overwrite an attempted rehearsal.')
  mkdirSync(directory)
  const marker = `METARDU disposable workflow upgrade ${randomUUID()}`
  const runtimeRole = 'workflow_upgrade_' + randomBytes(6).toString('hex')
  const runtimePassword = randomBytes(24).toString('hex')
  const report = { revision, verifierSha256: hash(readFileSync(process.argv[1])), verifierContractSha256: hash(readFileSync(join(root, 'scripts/workflow-upgrade-contract.mjs'))), preservationHelperSha256: hash(readFileSync(join(root, 'scripts/release-row-snapshot.mjs'))), startedAt: new Date().toISOString(), status: 'checking', sourceBaseline: 119, targetLedgerCount: 128, pending: pending.map(file => file.version), sourceRegistry: files.map(({ version, checksum }) => ({ version, checksum })), customerDataCopied: false, productionMutated: false, newContainer: false, syntheticDatabase: database, syntheticRuntimeRole: runtimeRole, checks: [], variants: [], cleanup: {} }
  const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  const check = name => { report.checks.push({ name, passed: true }); save(); console.log('PASS ' + name) }
  const stage = (name, selected) => {
    const source = join(directory, name)
    for (const file of selected) {
      const destination = join(source, file.path)
      mkdirSync(resolve(destination, '..'), { recursive: true })
      writeFileSync(destination, file.content, { flag: 'wx' })
    }
    mkdirSync(join(source, 'scripts'), { recursive: true })
    for (const script of ['migrate-unified.mjs', 'verify-migrations.mjs', 'provision-runtime-db-role.mjs']) writeFileSync(join(source, 'scripts', script), git(['show', `${revision}:scripts/${script}`]), { flag: 'wx' })
    return source
  }
  const stages = { baseline: stage('baseline', baseline), through119: stage('through119', files.filter(file => Number(file.version.split('_')[0]) <= 119)), full: stage('full', files) }
  const cleanEnv = { ...process.env }
  for (const filename of readdirSync(root).filter(name => /^\.env(?:\.|$)/.test(name))) for (const line of readFileSync(join(root, filename), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    if (match) cleanEnv[match[1]] = ''
  }
  const bootstrap = new URL(bootstrapUrl)
  const targetUrl = workflowUpgradeTarget(bootstrapUrl)
  const env = { ...cleanEnv, DATABASE_URL: '', MIGRATIONS_DIR: '', MIGRATION_DB_HOST: '127.0.0.1', MIGRATION_DB_PORT: '55433', MIGRATION_DB_NAME: database, MIGRATION_DB_USER: bootstrap.username, MIGRATION_DB_PASSWORD: bootstrap.password, APP_DB_HOST: '127.0.0.1', APP_DB_PORT: '55433', APP_DB_NAME: database, APP_DB_USER: runtimeRole, APP_DB_PASSWORD: runtimePassword, NODE_ENV: 'production' }
  const provision = (stageName, name, failure) => {
    const source = stages[stageName]
    const result = spawnSync(process.execPath, [join(source, 'scripts/provision-runtime-db-role.mjs')], { cwd: source, env, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024 })
    writeFileSync(join(directory, name + '.log'), (result.stdout ?? '') + (result.stderr ?? ''), { flag: 'wx' })
    assert.equal(result.error, undefined, 'Provisioner execution failed; inspect private log.')
    if (failure) {
      assert.notEqual(result.status, 0, 'Unsafe legacy data must stop the upgrade.')
      assert.match(result.stdout + result.stderr, failure)
    } else assert.equal(result.status, 0, `Normal ${name} failed; inspect the private log.`)
  }
  const admin = new pg.Client({ connectionString: bootstrapUrl, connectionTimeoutMillis: 5000 })
  let target, runtime, created = false, roleOwned = false
  await admin.connect()
  save()
  const databaseMarker = async () => (await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1", [database])).rows[0]?.marker
  const dropOwnedDatabase = async () => {
    assert.equal(await databaseMarker(), marker)
    await admin.query(`DROP DATABASE ${database}`)
    created = false
  }
  try {
    assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker, bootstrapMarker)
    assert.equal((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [runtimeRole])).rowCount, 0)
    for (const variant of ['canonical', 'duplicate_parcel', 'duplicate_block', 'unexpected_block_fk', 'malformed_boundary']) {
      assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount, 0, 'Never replace an existing database.')
      await admin.query(`CREATE DATABASE ${database} TEMPLATE template0`)
      created = true
      await admin.query(`COMMENT ON DATABASE ${database} IS '${marker}'`)
      target = new pg.Client({ connectionString: targetUrl, connectionTimeoutMillis: 5000 })
      await target.connect()
      roleOwned = true
      provision('baseline', variant + '-baseline')
      const ledger = async () => (await target.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
      const before = await ledger()
      assert.equal(before.length, 119)
      assert.ok(computeDrift(baseline, before).ok)
      const owner = randomUUID(), stranger = randomUUID(), project = randomUUID(), block = randomUUID(), parcel = randomUUID(), traverse = randomUUID(), book = randomUUID()
      for (const id of [owner, stranger]) await target.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'unusable-synthetic-hash','SYNTHETIC workflow upgrade')", [id, `${id}@example.invalid`])
      await target.query("INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,'SYNTHETIC upgrade - NOT FIELD EVIDENCE','cadastral')", [project, owner])
      await target.query("INSERT INTO blocks(id,project_id,block_number,description) VALUES($1,$2,'SYN-1','retained café 零')", [block, project])
      await target.query("INSERT INTO parcels(id,project_id,block_id,parcel_number,area_ha,notes) VALUES($1,$2,$3,'SYN-1',0.123456,'original'),($4,$2,$3,'SYN-2',NULL,NULL)", [parcel, project, block, randomUUID()])
      await target.query("INSERT INTO parcel_traverses(id,project_id,parcel_id,traverse_name) VALUES($1,$2,$3,'SYNTHETIC historical')", [traverse, project, parcel])
      await target.query("INSERT INTO traverse_coordinates(traverse_id,station_name,easting,northing,elevation) VALUES($1,'SYN-ZERO',0,0,0),($1,'SYN-NULL',NULL,NULL,NULL),($1,'SYN-PRIOR',500000.123,9500000.789,NULL)", [traverse])
      await target.query("INSERT INTO traverse_observations(traverse_id,station_from,station_to,bearing,distance) VALUES($1,'SYN-ZERO','SYN-NULL',0,0),($1,'SYN-NULL','SYN-PRIOR',NULL,NULL)", [traverse])
      await target.query("INSERT INTO fieldbooks(id,project_id,user_id,name,data,created_at) VALUES($1,$2,$3,'SYNTHETIC old book','{\"unknown\":null,\"zero\":0,\"label\":\"café 零\"}','2020-01-02T03:04:05Z')", [book, project, owner])
      if (variant === 'duplicate_parcel') await target.query("INSERT INTO parcels(project_id,block_id,parcel_number) VALUES($1,$2,'SYN-1')", [project, block])
      if (variant === 'duplicate_block') await target.query("INSERT INTO blocks(project_id,block_number) VALUES($1,'SYN-1')", [project])
      if (variant === 'unexpected_block_fk') {
        const fk = (await target.query("SELECT conname FROM pg_constraint WHERE conrelid='public.parcels'::regclass AND confrelid='public.blocks'::regclass AND contype='f'")).rows
        assert.equal(fk.length, 1)
        await target.query(`ALTER TABLE parcels DROP CONSTRAINT "${fk[0].conname.replaceAll('"', '""')}"`)
        await target.query('ALTER TABLE parcels ADD CONSTRAINT synthetic_unexpected_fk FOREIGN KEY(block_id) REFERENCES blocks(id) ON DELETE RESTRICT')
      }
      const originalSnapshot = await snapshotExistingRows(target)
      const snapshot = async () => (await snapshotExistingRows(target, originalSnapshot.catalog)).rows
      const original = originalSnapshot.rows
      let draft
      if (variant === 'canonical' || variant === 'malformed_boundary') {
        provision('through119', variant + '-through119')
        draft = randomUUID()
        const request = randomUUID(), digest = 'a'.repeat(64)
        const receipt = { protocol: 'reviewed-parcel-boundary-v1', receiptId: draft, requestId: request, actorId: owner, projectId: project, parcelId: parcel, traverseId: traverse, inputHash: digest, evidenceHash: digest, fieldVerified: false }
        if (variant === 'malformed_boundary') receipt.parcelId = randomUUID()
        await target.query("INSERT INTO parcel_boundary_drafts(id,actor_id,request_id,project_id,parcel_id,traverse_id,input_hash,evidence_hash,snapshot,receipt) VALUES($1,$2,$3,$4,$5,$6,$7,$7,'{}',$8)", [draft, owner, request, project, parcel, traverse, digest, receipt])
      }
      const intermediate = await ledger()
      const draftBefore = draft ? (await target.query('SELECT to_jsonb(d) value FROM parcel_boundary_drafts d')).rows : null
      const failures = { duplicate_parcel: /scheme_parcel_number_per_block/, duplicate_block: /scheme_block_number_per_project/, unexpected_block_fk: /Unexpected block FK shape/, malformed_boundary: /Historical boundary receipt identity is inconsistent/ }
      provision('full', variant + '-forward', failures[variant])
      const after = await ledger()
      assert.deepEqual(after.filter(row => before.some(old => old.version === row.version)), before)
      assert.deepEqual(await snapshot(), original)
      if (draft) assert.deepEqual((await target.query('SELECT to_jsonb(d) value FROM parcel_boundary_drafts d')).rows, draftBefore)
      check(`${variant}: existing rows, NULL/zero, Unicode, timestamps and all 119 historical hashes preserved`)
      if (variant !== 'canonical') {
        const failedVersion = { duplicate_parcel: '117_scheme_import_receipts', duplicate_block: '118_block_identity_retention', unexpected_block_fk: '118_block_identity_retention', malformed_boundary: '123_boundary_request_recovery' }[variant]
        const expected = files.filter(file => file.version < failedVersion)
        assert.ok(computeDrift(expected, after).ok, 'Only successfully committed preceding migrations may remain.')
        assert.ok(intermediate.every(row => after.some(next => next.version === row.version && next.checksum === row.checksum)))
        const absentTable = { duplicate_parcel: 'scheme_import_receipts', malformed_boundary: 'parcel_boundary_requests' }[variant]
        if (absentTable) assert.equal((await target.query('SELECT to_regclass($1) value', ['public.' + absentTable])).rows[0].value, null)
        if (variant === 'unexpected_block_fk') assert.equal((await target.query("SELECT confdeltype FROM pg_constraint WHERE conname='synthetic_unexpected_fk'")).rows[0].confdeltype, 'r')
        check(`${variant}: normal runner refuses incompatible legacy state without deleting, renumbering or rewriting it`)
      } else {
        assert.equal(after.length, 128)
        assert.ok(computeDrift(files, after).ok)
        assert.equal((await target.query('SELECT revision::text value FROM fieldbooks WHERE id=$1', [book])).rows[0].value, '0')
        assert.equal((await target.query("SELECT r.receipt=d.receipt same FROM parcel_boundary_requests r JOIN parcel_boundary_drafts d ON d.id=r.draft_id WHERE d.id=$1", [draft])).rows[0].same, true)
        const retainedTables = ['fieldbook_save_receipts', 'scheme_import_receipts', 'parcel_boundary_drafts', 'scheme_export_requests', 'parcel_draft_shares', 'parcel_traverse_requests', 'parcel_traverse_revisions', 'parcel_boundary_requests']
        assert.equal((await target.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1) AND c.relrowsecurity", [retainedTables])).rows[0].n, retainedTables.length)
        provision('full', variant + '-idempotent')
        assert.deepEqual(await ledger(), after)
        assert.deepEqual(await snapshot(), original)
        check('canonical: normal 119-to-128 provisioner, exact historical-boundary backfill and idempotent rerun pass')
        runtime = new pg.Client({ host: '127.0.0.1', port: 55433, database, user: runtimeRole, password: runtimePassword, connectionTimeoutMillis: 5000 })
        await runtime.connect()
        assert.deepEqual((await runtime.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0], { rolsuper: false, rolbypassrls: false })
        await runtime.query("SELECT set_config('request.user_id',$1,false)", [stranger])
        assert.equal((await runtime.query('SELECT id FROM parcel_boundary_drafts')).rowCount, 0)
        assert.equal((await runtime.query('SELECT request_id FROM parcel_boundary_requests')).rowCount, 0)
        await runtime.query("SELECT set_config('request.user_id',$1,false)", [owner])
        assert.equal((await runtime.query('SELECT id FROM parcel_boundary_drafts')).rowCount, 1)
        assert.equal((await runtime.query('SELECT request_id FROM parcel_boundary_requests')).rowCount, 1)
        // PostgreSQL RLS can refuse an UPDATE by exposing zero writable rows,
        // rather than raising. Prove both that refusal and the trigger defense.
        assert.equal((await runtime.query('UPDATE parcel_boundary_drafts SET receipt=receipt WHERE id=$1', [draft])).rowCount, 0)
        assert.deepEqual((await target.query('SELECT to_jsonb(d) value FROM parcel_boundary_drafts d')).rows, draftBefore)
        await assert.rejects(target.query('UPDATE parcel_boundary_drafts SET receipt=receipt WHERE id=$1', [draft]), { code: '42501' })
        await assert.rejects(target.query('DELETE FROM parcel_boundary_requests'), { code: '42501' })
        const revisionOne = (await runtime.query('UPDATE fieldbooks SET name=name WHERE id=$1 RETURNING revision::text', [book])).rows[0].revision
        const revisionTwo = (await runtime.query('UPDATE fieldbooks SET name=name WHERE id=$1 RETURNING revision::text', [book])).rows[0].revision
        assert.ok(BigInt(revisionOne) > 0n && BigInt(revisionTwo) > BigInt(revisionOne))
        const exact = '500000.123456789012345'
        const coordinate = (await runtime.query("INSERT INTO traverse_coordinates(traverse_id,station_name,easting,northing) VALUES($1,'SYN-FULL-PRECISION',$2,$2) RETURNING easting::text,northing::text", [traverse, exact])).rows[0]
        assert.deepEqual(coordinate, { easting: exact, northing: exact })
        await runtime.end(); runtime = null
        await target.query('BEGIN')
        await target.query('DELETE FROM blocks WHERE id=$1', [block])
        await assert.rejects(target.query('COMMIT'), { code: '23503' })
        await target.query('ROLLBACK')
        assert.equal((await target.query('SELECT id FROM blocks WHERE id=$1', [block])).rowCount, 1)
        check('canonical: restricted-role boundary isolation, immutable receipts, legacy revision writes, new numeric precision and direct-block retention pass')
        Object.assign(report, { boundaryBackfillPreserved: true, restrictedRoleVerified: true, legacyFieldbookWritersVerified: true, precisionPreserved: true, retainedBlockDeletionGuard: true })
      }
      report.variants.push(variant)
      save()
      await target.end(); target = null
      await dropOwnedDatabase()
    }
    Object.assign(report, { status: 'passed', originalValuesPreserved: true, historicalHashesPreserved: true, normalRuntimeProvisioning: true, incompatibleDataRejected: true })
  } catch (error) {
    report.status = 'failed'
    // Native errors contain only synthetic fixture values. Credentials and
    // subprocess output remain private and are never copied into this receipt.
    report.failure = { name: error.name, code: error.code, message: error.message }
    throw error
  } finally {
    if (runtime) await runtime.end()
    if (target) await target.end()
    if (created) await dropOwnedDatabase()
    report.cleanup.syntheticDatabaseRemoved = (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount === 0
    if (roleOwned) await admin.query(`DROP ROLE "${runtimeRole}"`)
    report.cleanup.syntheticRoleRemoved = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [runtimeRole])).rowCount === 0
    report.finishedAt = new Date().toISOString()
    await admin.end()
    save()
  }
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, variants: report.variants, cleanup: report.cleanup, reportPath }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
