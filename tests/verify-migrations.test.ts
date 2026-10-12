/**
 * Unit tests for scripts/verify-migrations.mjs — the post-deploy schema
 * verification gate.
 *
 * The 054 lesson: a broken migration (referencing nonexistent columns) failed
 * silently at container start — the entrypoint only warns and continues — and
 * silently BLOCKED migrations 055-057 from ever applying. Nothing re-checked
 * the result. This gate exists so that never happens again; these tests pin
 * the drift-detection logic itself (the DB I/O shell is 10 lines of pg).
 *
 * The script is ESM (.mjs) with exported pure functions and a guarded main(),
 * so jest (CJS) cannot import it directly — same constraint as the axe
 * scanner. Tests therefore spawn a tiny node subprocess per behaviour
 * (computeDrift via a driver), keeping the real module as the code under test.
 */
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ROOT = path.join(__dirname, '..')

interface MigrationDrift {
  ok: boolean
  missing: string[]
  mutated: Array<{ version: string; stored: string; actual: string }>
  ghost: string[]
}

describe('recovered applied migration artifacts', () => {
  test.each([
    ['052_schema_drift_reconciliation.sql', '1b7bcc2e314ee10efa4bdf324738c49b7c05311932e86ed9a566167e1a5756fc'],
    ['064_project_settings_fields.sql', '152e67e043cfad39c2267c7a695933559d5e3ac26089eb0498a084b3723892e7'],
  ])('%s retains the original deployed bytes', (filename, appliedChecksum) => {
    // Both September images independently matched the recorded database hash.
    // These artifacts contain one CRLF amid LF lines: Git must not normalize it.
    const content = readFileSync(path.join(ROOT, 'src/lib/db/migrations', filename))
    expect(createHash('sha256').update(content).digest('hex')).toBe(appliedChecksum)
  })
})

/** Run computeDrift inside a node subprocess against JSON inputs. */
function drift(files: Array<{ version: string; checksum: string }>, applied: Array<{ version: string; checksum: string | null }>) {
  const driver = `
    const m = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts', 'verify-migrations.mjs')).href)});
    const out = m.computeDrift(
      ${JSON.stringify(files)},
      ${JSON.stringify(applied)}
    );
    process.stdout.write(JSON.stringify(out));
  `
  const output = execFileSync(
    'node',
    ['--input-type=module', '-e', driver],
    { encoding: 'utf8', cwd: ROOT }
  )
  return JSON.parse(output.trim().split('\n').pop() ?? '') as MigrationDrift
}

function runtimeRoleFailures(identities: Array<Record<string, unknown> | null>) {
  const driver = `
    const m = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts', 'verify-migrations.mjs')).href)});
    process.stdout.write(JSON.stringify(${JSON.stringify(identities)}.map(identity => m.runtimeDatabaseRoleFailure(identity))));
  `
  const output = execFileSync(
    'node',
    ['--input-type=module', '-e', driver],
    { encoding: 'utf8', cwd: ROOT }
  )
  return JSON.parse(output.trim().split('\n').pop() as string) as Array<string | null>
}

describe('computeDrift: exact match', () => {
  test('all applied, checksums match, no ghosts → ok', () => {
    const files = [
      { version: '000_canonical_schema', checksum: 'a'.repeat(64) },
      { version: '001_rbac_fixed', checksum: 'b'.repeat(64) },
    ]
    const applied = [
      { version: '000_canonical_schema', checksum: 'a'.repeat(64) },
      { version: '001_rbac_fixed', checksum: 'b'.repeat(64) },
    ]
    const d = drift(files, applied)
    expect(d.ok).toBe(true)
    expect(d.missing).toEqual([])
    expect(d.mutated).toEqual([])
    expect(d.ghost).toEqual([])
  })

  test('legacy rows with NULL checksum are treated as unverifiable, not drift', () => {
    // migrate-unified auto-migrates legacy schema_migrations tables that lack
    // a checksum column; those rows cannot be verified and must not fail the
    // gate (migrate-unified re-writes checksums on --force re-apply).
    const files = [{ version: '000_canonical_schema', checksum: 'a'.repeat(64) }]
    const applied = [{ version: '000_canonical_schema', checksum: null }]
    const d = drift(files, applied)
    expect(d.ok).toBe(true)
  })
})

describe('computeDrift: the 054 failure class (missing)', () => {
  test('a migration file with no applied row is MISSING — the exact silent-054 signature', () => {
    const files = [
      { version: '054_ghost_row_purge', checksum: 'd'.repeat(64) },
      { version: '055_payment_history_provider_id_unique', checksum: 'e'.repeat(64) },
    ]
    const applied: Array<{ version: string; checksum: string }> = [] // nothing ever applied — e.g. entrypoint failed silently
    const d = drift(files, applied)
    expect(d.ok).toBe(false)
    expect(d.missing).toEqual(['054_ghost_row_purge', '055_payment_history_provider_id_unique'])
  })

  test('later migrations blocked by an earlier failure are all reported', () => {
    const files = ['053', '054', '055', '056', '057'].map((v) => ({
      version: `${v}_x`,
      checksum: 'f'.repeat(64),
    }))
    const applied = files.slice(0, 2) // 054 applied; 055-057 never ran
    const d = drift(files, applied)
    expect(d.missing).toEqual(['055_x', '056_x', '057_x'])
  })
})

describe('computeDrift: edited applied migration (mutated)', () => {
  test('checksum mismatch is reported with both hashes', () => {
    const files = [{ version: '010_dpa2019', checksum: '1'.repeat(64) }]
    const applied = [{ version: '010_dpa2019', checksum: '2'.repeat(64) }]
    const d = drift(files, applied)
    expect(d.ok).toBe(false)
    expect(d.mutated).toHaveLength(1)
    expect(d.mutated[0].version).toBe('010_dpa2019')
    expect(d.mutated[0].stored).toBe('2'.repeat(64))
    expect(d.mutated[0].actual).toBe('1'.repeat(64))
  })
})

describe('computeDrift: ghost rows', () => {
  test('applied row with no file on disk is a GHOST', () => {
    const files = [{ version: '001_a', checksum: 'a'.repeat(64) }]
    const applied = [
      { version: '001_a', checksum: 'a'.repeat(64) },
      { version: '999_deleted_migration', checksum: 'z'.repeat(64) },
    ]
    const d = drift(files, applied)
    expect(d.ok).toBe(false)
    expect(d.ghost).toEqual(['999_deleted_migration'])
  })
})

describe('production runtime database role', () => {
  test('accepts only the restricted authenticated login and rejects bypass or DDL paths', () => {
    const safeIdentity = {
      user_name: 'metardu_app',
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      can_create_database: false,
      can_create_in_public: false,
      owns_public_objects: false,
      can_mutate_migration_ledger: false,
      memberships: ['authenticated'],
      authenticated_role_safe: true,
    }
    const identities = [
      safeIdentity,
      { ...safeIdentity, rolsuper: true },
      { ...safeIdentity, rolbypassrls: true },
      { ...safeIdentity, rolcreatedb: true },
      { ...safeIdentity, rolcreaterole: true },
      { ...safeIdentity, rolreplication: true },
      { ...safeIdentity, can_create_database: true },
      { ...safeIdentity, can_create_in_public: true },
      { ...safeIdentity, owns_public_objects: true },
      { ...safeIdentity, can_mutate_migration_ledger: true },
      { ...safeIdentity, memberships: [] },
      { ...safeIdentity, memberships: '{authenticated}' },
      { ...safeIdentity, memberships: ['authenticated', 'metardu'] },
      { ...safeIdentity, authenticated_role_safe: false },
      null,
    ]

    expect(runtimeRoleFailures(identities)).toEqual([
      null,
      expect.stringContaining('non-owner, non-superuser'),
      expect.stringContaining('non-owner, non-superuser'),
      expect.stringContaining('non-owner, non-superuser'),
      expect.stringContaining('non-owner, non-superuser'),
      expect.stringContaining('non-owner, non-superuser'),
      expect.stringContaining('non-owner, non-superuser'),
      expect.stringContaining('non-owner, non-superuser'),
      expect.stringContaining('non-owner, non-superuser'),
      expect.stringContaining('non-owner, non-superuser'),
      expect.stringContaining('belong only'),
      expect.stringContaining('belong only'),
      expect.stringContaining('belong only'),
      expect.stringContaining('compatibility role'),
      expect.stringContaining('could not identify'),
    ])
  })
})

// Optional integration check against an explicitly supplied restricted test
// login. Uses the real node-postgres codec and performs only catalog reads.
const postgresRuntimeTest = process.env.TEST_RUNTIME_DATABASE_URL ? test : test.skip
postgresRuntimeTest('PostgreSQL returns runtime memberships as text[] and accepts the restricted login', () => {
  const driver = `
    const m = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts', 'verify-migrations.mjs')).href)});
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: process.env.TEST_RUNTIME_DATABASE_URL, connectionTimeoutMillis: 10000 });
    await client.connect();
    try {
      const result = await client.query(m.RUNTIME_ROLE_QUERY);
      process.stdout.write(JSON.stringify({ identity: result.rows[0], failure: m.runtimeDatabaseRoleFailure(result.rows[0]), type: result.fields.find(field => field.name === 'memberships').dataTypeID }));
    } finally { await client.end(); }
  `
  const output = execFileSync('node', ['--input-type=module', '-e', driver], { encoding: 'utf8', cwd: ROOT })
  const result = JSON.parse(output) as {
    type: number
    identity: { memberships: string[] }
    failure: string | null
  }
  expect(result.type).toBe(1009) // PostgreSQL text[]; name[] is not decoded by pg.
  expect(result.identity.memberships).toEqual(['authenticated'])
  expect(result.failure).toBeNull()
})

describe('collectFileMigrations: file discovery + checksums', () => {
  test('discovers .sql files sorted, versions = filename minus .sql, checksums are sha256 of content', async () => {
    const driver = `
        const m = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts', 'verify-migrations.mjs')).href)});
      const fs = await import('node:fs');
      const os = await import('node:os');
      const path = await import('node:path');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-mig-'));
      fs.writeFileSync(path.join(dir, '002_b.sql'), 'SELECT 2;');
      fs.writeFileSync(path.join(dir, '001_a.sql'), 'SELECT 1;');
      fs.writeFileSync(path.join(dir, 'ignored.txt'), 'not a migration');
      const out = m.collectFileMigrations(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      process.stdout.write(JSON.stringify(out));
    `
    const output = execFileSync(
      'node',
      ['--input-type=module', '-e', driver],
      { encoding: 'utf8', cwd: ROOT }
    )
    const files = JSON.parse(output.trim().split('\n').pop() ?? '') as Array<{ version: string; checksum: string }>
    expect(files.map((f: { version: string }) => f.version)).toEqual(['001_a', '002_b'])
    // sha256('SELECT 1;') — the known digest proves the checksum pipeline
    expect(files[0].checksum).toBe(
      '17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a'
    )
    expect(files[1].checksum).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('verify-migrations CLI (subprocess, fail-closed wiring)', () => {
  test('exits 2 with usage error when DATABASE_URL is unset (never silently passes)', () => {
    const env = { ...process.env }
    delete env.DATABASE_URL
    // Local developer shells and CI often provide this alternative config.
    // Keep this test independent of whichever database happens to be available.
    delete env.DB_HOST
    delete env.DB_PORT
    delete env.DB_NAME
    delete env.DB_USER
    delete env.DB_PASSWORD
    let code = 0
    let output = ''
    try {
      output = execFileSync('node', [path.join(ROOT, 'scripts', 'verify-migrations.mjs')], {
        encoding: 'utf8',
        env,
        cwd: ROOT,
      })
    } catch (err: unknown) {
      const failure = err as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer }
      code = failure.status ?? 1
      output = String(failure.stdout ?? '') + String(failure.stderr ?? '')
    }
    expect(code).not.toBe(0)
    expect(output).toContain('DATABASE_URL')
    expect(output).toContain('fail closed')
  })
})

test('verifier and migrator accept LF/CRLF equivalents but reject real SQL changes', () => {
  const driver = `
    const verify = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts', 'verify-migrations.mjs')).href)});
    const migrate = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'scripts', 'migrate-unified.mjs')).href)});
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { createHash } = await import('node:crypto');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-eol-'));
    const file = path.join(dir, '001_test.sql');
    const results = [];
    for (const storedSql of ['SELECT 1;\\nSELECT 2;\\n', 'SELECT 1;\\r\\nSELECT 2;\\r\\n']) {
      const checksum = createHash('sha256').update(storedSql).digest('hex');
      for (const diskSql of ['SELECT 1;\\nSELECT 2;\\n', 'SELECT 1;\\r\\nSELECT 2;\\r\\n', 'SELECT 1;\\nSELECT 3;\\n']) {
        fs.writeFileSync(file, diskSql);
        const drift = verify.computeDrift(verify.collectFileMigrations(dir), [{version:'001_test',checksum}]);
        let migratorAccepted = true;
        try { migrate.assertMigrationChecksum(file, checksum); } catch { migratorAccepted = false; }
        results.push({verified:drift.ok,migratorAccepted});
      }
    }
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
    process.stdout.write(JSON.stringify(results));
  `
  const output = execFileSync('node', ['--input-type=module', '-e', driver], { cwd: ROOT, encoding: 'utf8' })
  expect(JSON.parse(output.trim().split('\n').pop() ?? '') as unknown).toEqual([
    { verified: true, migratorAccepted: true }, { verified: true, migratorAccepted: true }, { verified: false, migratorAccepted: false },
    { verified: true, migratorAccepted: true }, { verified: true, migratorAccepted: true }, { verified: false, migratorAccepted: false },
  ])
})
