import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('static migration and release checks import without an installed database client', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'metardu-migration-logic-'))
  const modules = ['verify-migrations.mjs', 'release-plan.mjs', 'rehearsal-database.mjs', 'verify-survey-upgrade.mjs']
  const driver = path.join(fixture, 'probe.mjs')
  try {
    for (const file of modules) writeFileSync(path.join(fixture, file), readFileSync(path.join('scripts', file)))
    writeFileSync(driver, `
      import assert from 'node:assert/strict'
      assert.throws(() => import.meta.resolve('pg'), { code: 'ERR_MODULE_NOT_FOUND' })
      const { computeDrift, migrationChecksums, runtimeDatabaseRoleFailure } = await import('./verify-migrations.mjs')
      assert.deepEqual(computeDrift([], []), { ok: true, missing: [], mutated: [], ghost: [] })
      assert.equal(migrationChecksums(Buffer.from('SELECT 1;')).checksum.length, 64)
      assert.equal(typeof runtimeDatabaseRoleFailure(null), 'string')
      const release = await import('./release-plan.mjs')
      const upgrade = await import('./verify-survey-upgrade.mjs')
      assert.equal(typeof release.pinnedReleaseArguments, 'function')
      assert.equal(typeof upgrade.surveyUpgradeTarget, 'function')
      process.stdout.write('static checks available without pg')
    `)
    const result = spawnSync(process.execPath, [driver], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, 'static checks available without pg')
  } finally {
    // Remove only the exact files created here; never recurse through temp.
    for (const file of [driver, ...modules.map(file => path.join(fixture, file))]) {
      try { unlinkSync(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    rmdirSync(fixture)
  }
})
