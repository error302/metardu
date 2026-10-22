import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

// The retired filename/checksum runner must not become a second ledger writer.
// Forbid pg loading before executing its real entry point, so even a regression
// cannot connect to a local/default database during this test.
const directory = path.resolve('.cache/legacy-migration-tests')
mkdirSync(directory, { recursive: true })
const root = mkdtempSync(path.join(directory, 'run-'))
const trace = path.join(root, 'pg-loaded')
const guard = path.join(root, 'guard.cjs')
writeFileSync(guard, `const Module = require('node:module');const fs=require('node:fs');const load=Module._load;Module._load=function(name,...args){if(name==='pg'){fs.writeFileSync(${JSON.stringify(trace)},'forbidden');throw Error('Database access forbidden by synthetic test')}return load.call(this,name,...args)};\n`)

for (const args of [[], ['--status'], ['--dry-run']]) test(`retired migration entry refuses execution with supported guidance: ${args.join(' ') || 'default'}`, () => {
  const result = spawnSync(process.execPath, ['--require', guard, 'scripts/run-migrations.js', ...args], {
    encoding: 'utf8', timeout: 10000, windowsHide: true,
    env: Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]])),
  })
  assert.ifError(result.error)
  assert.equal(existsSync(trace), false, 'Retired runner must not load a database client')
  assert.equal(result.status, 2, result.stdout + result.stderr)
  assert.match(result.stderr, /retired/i)
  assert.match(result.stderr, /npm run migrate:status/)
  assert.match(result.stderr, /npm run migrate:dry-run/)
  assert.doesNotMatch(result.stderr, /SyntaxError|delete the row|To re-apply/)
})
