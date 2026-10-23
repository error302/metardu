// Source-only probe: no account, database, network, service or environment access.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.cache/legacy-vertical-profile')
mkdirSync(output, { recursive: true })
const sourcePaths = ['src/lib/engine/curves.ts', 'src/lib/engine/angles.ts',
  'src/lib/computations/roadDesignEngine.ts', 'src/lib/computations/roadSafetyCriteria.ts']
const hashes = () => Object.fromEntries(sourcePaths.map(path => [path,
  createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))
const report = { status: 'running', source: hashes(), fixtures: [], refusals: [] }
const save = () => writeFileSync(resolve(output, 'source-probe.json'), JSON.stringify(report, null, 2))
save()
const require = createRequire(import.meta.url)
const previous = require.extensions['.ts']
try {
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true }, fileName: filename,
  }).outputText, filename)
  const { verticalCurve } = require('../src/lib/engine/curves.ts')
  for (const [name, input] of [
    ['crest', [2, -2, 200, 100, 60]], ['sag', [-2, 4, 205, 100, 80]],
    ['monotone', [2, 6, 200, 0, 70]], ['falling', [-4, -1, 103, -10, 37]],
    ['equal', [2, 2, 50, -1, 100]], ['flat', [0, 0, 50, 0, 100]],
    ['large-flat', [0, 0, 50, 1e30, 100]], ['tiny-anchor', [2, -2, 200, 1e-16, 80]],
    ['default-interval', [1, 1, 25, 0]], ['endpoint-stationary', [-2, 0, 200, -1, 75]],
    ['fractional', [-3.125, 1.875, 1234.5678, 23.456789, 37.25]],
    ['dense', [-2, 4, 1000, 0, 1]],
  ]) report.fixtures.push({ name, input, rows: verticalCurve(...input) })
  for (const [name, input] of [
    ['zero-interval', [2, -2, 200, 0, 0]], ['infinite-interval', [2, -2, 200, 0, Infinity]],
    ['too-many-rows', [2, -2, 200, 0, 0.0001]], ['subnormal-interval', [2, -2, 200, 0, Number.MIN_VALUE]],
    ['infinite-length', [2, -2, Infinity, 0]], ['zero-length', [2, -2, 0, 0]],
    ['unresolvable-length', [2, -2, Number.MIN_VALUE, 0]], ['infinite-start', [2, -2, 200, Infinity]],
    ['grade-overflow', [-Number.MAX_VALUE, Number.MAX_VALUE, 200, 0]],
    ['collapsed-levels', [2, -2, 200, 1e30]], ['translated-overflow', [1e305, 1e305, 1000, Number.MAX_VALUE, 100]],
  ]) {
    let error
    try { verticalCurve(...input) } catch (cause) { error = String(cause) }
    assert.ok(error, `Expected refusal: ${name}`)
    report.refusals.push({ name, error })
  }
  assert.deepEqual(hashes(), report.source, 'Source changed during native probe.')
  report.status = 'passed'
  report.sourcePreserved = true
} catch (cause) { report.status = 'failed'; report.error = String(cause); process.exitCode = 1 }
finally { if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts']; save() }
console.log(JSON.stringify({ status: report.status, fixtures: report.fixtures.length, refusals: report.refusals.length, error: report.error }))
