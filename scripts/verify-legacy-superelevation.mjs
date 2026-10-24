// Source-only adapter probes. No accounts, databases, browser or service actions.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

assert.equal(process.argv.length, 2)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.cache/legacy-superelevation/source-probe.json')
mkdirSync(dirname(output), { recursive: true })
const paths = ['src/lib/engineering/compute.ts', 'src/lib/engineering/volume.ts', 'src/lib/computations/roadSafetyCriteria.ts']
const hashes = () => Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))
const report = { status: 'running', source: hashes(), fixtures: [], refusals: 0 }
const save = () => writeFileSync(output, JSON.stringify(report, null, 2))
save()
const require = createRequire(import.meta.url), ts = require('typescript'), previous = require.extensions['.ts']
const unregister = require('tsconfig-paths').register({ baseUrl: root, paths: { '@/*': ['src/*'] } })
try {
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true }, fileName: filename,
  }).outputText, filename)
  const compute = require('../src/lib/engineering/compute.ts').superelevationCalc
  const volume = require('../src/lib/engineering/volume.ts')
  const adapters = [compute, volume.calculateSuperelevation, volume.superelevationCalc]
  for (const [speed, radius, lanes, width, initial, provided, friction, maximum, gradient] of [
    [80, 200, 2, 3.5, -0.025, 0.09, 0.15, 0.07, 0.005],
    [80, 400, 2, 3.5, -0.025, 0.06, 0.15, 0.07, 0.005],
    [60, 500, 1, 3.25, 0.04, 0.04, 0.12, 0.08, 0.004],
    [35, 99.5, 3, 3.15, -0.03, 0.055, 0.08, 0.1, 0.0035],
    [120, 2000, 1, 4.1, -0.02, 0, 0.1, 0.06, 0.006],
    [20, 90, 2, 2.75, 0, 0.03, 0, 0.04, 0.002],
  ]) {
    const input = { designSpeed: speed, radius, numLanes: lanes, laneWidth: width, initialCrossfall: initial,
      providedSuperelevation: provided, criteria: { reference: 'Synthetic numeric fixture rev 1', lateralFriction: friction,
        maximumSuperelevation: maximum, maximumRelativeGradient: gradient } }
    const results = adapters.map(calculate => calculate(input))
    for (const result of results) assert.deepEqual(result, results[0])
    for (const calculate of adapters) for (const invalid of [
      { R: radius, V: speed, eMax: maximum }, { ...input, criteria: undefined },
      { ...input, transitionLength: 30 }, { ...input, radius: Infinity },
      { ...input, criteria: { ...input.criteria, maximumRelativeGradient: 0 } },
    ]) { assert.throws(() => calculate(invalid)); report.refusals++ }
    report.fixtures.push({ input, result: results[0] })
  }
  assert.ok(!Object.keys(require.cache).some(path => /[\\/]lib[\\/]db[\\/]/.test(path)))
  assert.deepEqual(hashes(), report.source)
  report.status = 'passed'; report.sourcePreserved = true
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1 }
finally { if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts']; unregister(); save() }
console.log(JSON.stringify({ status: report.status, fixtures: report.fixtures.length, refusals: report.refusals, error: report.error }))
