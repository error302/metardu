import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertBatchCoverage, eslintOptions, lintFilesInBatches } from '../scripts/lint-batches.mjs'

const require = createRequire(import.meta.url)
const { ESLint } = require('eslint')

test('isolated batches preserve real typed findings, overrides, ignores and exact overlapping-scope coverage', async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'metardu-lint-batches-'))
  const created = []
  const write = (file, value) => {
    const target = path.join(cwd, file)
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value))
    created.push(target)
  }
  mkdirSync(path.join(cwd, 'src'))
  try {
    write('.eslintrc.json', {
      root: true, parser: require.resolve('@typescript-eslint/parser'),
      plugins: ['@typescript-eslint'],
      parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: cwd, sourceType: 'module' },
      rules: { '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unsafe-assignment': 'error', 'no-console': 'warn' },
      overrides: [{ files: ['**/*.test.ts'], parserOptions: { project: ['./tsconfig.tests.json'] }, rules: { '@typescript-eslint/no-explicit-any': 'warn' } }],
    })
    write('.eslintignore', 'src/ignored.ts\n')
    const compilerOptions = { target: 'ES2020', module: 'ESNext', strict: true, types: [], noEmit: true }
    write('tsconfig.json', { compilerOptions, include: ['src/app.ts'] })
    write('tsconfig.tests.json', { compilerOptions, include: ['src/sample.test.ts'] })
    const source = 'export const value: string = JSON.parse("1"); export const legacy: any = 1; console.log(value)\n'
    write('src/app.ts', source)
    write('src/sample.test.ts', source)
    write('src/ignored.ts', 'this file must remain ignored')
    const scope = ['src/', 'src/app.ts']
    const expected = await new ESLint(eslintOptions(cwd)).lintFiles(scope)
    const progress = []
    const actual = await lintFilesInBatches(scope, { cwd, batchSize: 1, heapMb: 512, onBatch: value => progress.push(value) })
    assert.deepEqual(actual, expected)
    assert.equal(actual.length, 2)
    assert.equal(progress.length, 2)
    assert.equal(progress.at(-1).completed, 2)
    assert.equal(actual.flatMap(row => row.messages).filter(message => message.ruleId === '@typescript-eslint/no-unsafe-assignment').length, 2)
    assert.deepEqual(actual.map(row => row.messages.find(message => message.ruleId === '@typescript-eslint/no-explicit-any').severity), [2, 1])
    await assert.rejects(lintFilesInBatches(['does-not-exist/**/*.ts'], { cwd }), /No files matching/)
    // Even when every warning is deliberately within a synthetic baseline,
    // real error-severity findings must refuse CI admission.
    mkdirSync(path.join(cwd, 'scripts'))
    const warnings = {}
    for (const row of expected) for (const message of row.messages) {
      if (message.severity === 1 && message.ruleId) warnings[message.ruleId] = (warnings[message.ruleId] || 0) + 1
    }
    write('scripts/warning-baseline.json', warnings)
    write('scripts/a11y-baseline.json', {})
    for (const [file, rule] of [
      ['member-access', '@typescript-eslint/no-unsafe-member-access'],
      ['assignment', '@typescript-eslint/no-unsafe-assignment'],
      ['explicit-any', '@typescript-eslint/no-explicit-any'],
      ['argument', '@typescript-eslint/no-unsafe-argument'],
      ['row-typing', 'db.query untyped'],
    ]) write(`scripts/${file}-baseline.json`, { [rule]: warnings[rule] || 0 })
    const cli = fileURLToPath(new URL('../scripts/lint-ratchets.mjs', import.meta.url))
    const run = spawnSync(process.execPath, [cli, '--scope', 'src/'], { cwd, encoding: 'utf8', windowsHide: true, timeout: 30000 })
    assert.ifError(run.error)
    assert.equal(run.status, 1, run.stdout + run.stderr)
    assert.match(run.stderr, /[1-9]\d* ESLint errors/)
  } finally {
    for (const file of created.reverse()) unlinkSync(file)
    try { rmdirSync(path.join(cwd, 'scripts')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    rmdirSync(path.join(cwd, 'src'))
    rmdirSync(cwd)
  }
})

test('incomplete, duplicate, foreign and unparseable worker results cannot pass the gate', () => {
  const file = path.resolve('source.ts')
  const row = { filePath: file, messages: [], fatalErrorCount: 0 }
  assert.throws(() => assertBatchCoverage([file], []), /coverage differs/)
  assert.throws(() => assertBatchCoverage([file], [row, row]), /duplicated/)
  assert.throws(() => assertBatchCoverage([file], [{ ...row, filePath: path.resolve('foreign.ts') }]), /coverage differs/)
  assert.throws(() => assertBatchCoverage([file], [{ ...row, fatalErrorCount: 1 }]), /could not parse/)
})
