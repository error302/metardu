// Source-only legacy adapter probe. No account, service or persistence actions.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.cache/vpi-vertical-adapters')
mkdirSync(output, { recursive: true })
const require = createRequire(import.meta.url), ts = require('typescript')
const paths = ['src/lib/engineering/compute.ts', 'src/lib/engineering/curves.ts',
  'src/lib/computations/roadDesignEngine.ts', 'scripts/verify-vpi-vertical-adapters.mjs']
const hashes = () => Object.fromEntries(paths.map(path => [path,
  createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))
const report = { status: 'running', source: hashes(), fixtures: [], refusals: [] }
const save = () => writeFileSync(resolve(output, 'source-probe.json'), JSON.stringify(report, null, 2))
save()
const previous = require.extensions['.ts']
const unregister = require('tsconfig-paths').register({ baseUrl: root, paths: { '@/*': ['src/*'] } })
try {
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true }, fileName: filename,
  }).outputText, filename)
  const compute = require('../src/lib/engineering/compute.ts').verticalCurve
  const curves = require('../src/lib/engineering/curves.ts').verticalCurve
  const curveInput = ({ g1, g2, L, chainage_VIP, elevation_VIP, interval }) => ({ gradeIn: g1,
    gradeOut: g2, length: L, chainage_VIP, elevation_VIP, ...(interval === undefined ? {} : { interval }) })
  const sag = { g1: -2, g2: 4, L: 205, chainage_VIP: 1000.125, elevation_VIP: 100.123456789 }
  for (const [name, input] of [
    ['sag-default', sag], ['crest', { ...sag, g1: 4, g2: -2, L: 200, elevation_VIP: -10, interval: 37 }],
    ['equal', { ...sag, g1: 2, g2: 2, L: 55, chainage_VIP: -3.25, elevation_VIP: 0, interval: 13 }],
    ['flat', { ...sag, g1: 0, g2: 0, L: 20, chainage_VIP: -1, elevation_VIP: 0 }],
    ['small-grade-change', { ...sag, g1: 1.23456789, g2: 1.23457789, L: 200.005, chainage_VIP: 0, elevation_VIP: 1e-16 }],
    ['explicit-steep', { ...sag, g1: -17, g2: 18, L: 20, chainage_VIP: -5, elevation_VIP: 0, interval: 7 }],
    ['coarse', { ...sag, interval: 10000 }],
    ['dense', { ...sag, L: 1000, chainage_VIP: 1000, elevation_VIP: 100, interval: 1 }],
    ['endpoint-stationary', { ...sag, g2: 0, L: 200, chainage_VIP: 0, elevation_VIP: 0 }],
    ['negative', { ...sag, g1: 2, g2: -2, L: 100, chainage_VIP: -1, elevation_VIP: -12 }],
  ]) {
    const computed = compute(input), curved = curves(curveInput(input))
    assert.equal(computed.sightDistance, null)
    assert.equal(computed.sightDistanceStatus, 'NOT_ASSESSED')
    assert.ok(computed.elevationTable.every(row => row.cutFill === null))
    const { sightDistance, sightDistanceStatus, elevationTable, ...rest } = computed
    void sightDistance; void sightDistanceStatus
    const geometry = { ...rest, elevationTable: elevationTable.map(({ cutFill, ...row }) => { void cutFill; return row }) }
    assert.deepEqual(geometry, curved)
    // JSON legitimately normalizes -0 to 0. Inspect every numeric leaf rather
    // than mistaking that sign normalization for NaN/Infinity becoming null.
    const checkJsonValues = value => {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), 'Nonfinite JSON value')
      else if (Array.isArray(value)) value.forEach(checkJsonValues)
      else if (value !== null && typeof value === 'object') Object.values(value).forEach(checkJsonValues)
      else assert.ok(value === null || typeof value === 'string' || typeof value === 'boolean', 'Unsupported JSON value')
    }
    checkJsonValues(computed)
    report.fixtures.push({ name, input, computed, curved })
  }
  for (const [name, change] of [
    ['zero-length', { L: 0 }], ['infinite-length', { L: Infinity }], ['subnormal-length', { L: Number.MIN_VALUE }],
    ['infinite-grade', { g1: Infinity }], ['collapsed-level', { elevation_VIP: 1e30 }],
    ['collapsed-chainage', { chainage_VIP: 1e30 }], ['zero-interval', { interval: 0 }],
    ['infinite-interval', { interval: Infinity }], ['too-many-stations', { interval: 0.0001 }],
  ]) {
    for (const [adapter, operation] of [['compute', () => compute({ ...sag, ...change })],
      ['curves', () => curves(curveInput({ ...sag, ...change }))]]) {
      let error
      try { operation() } catch (cause) { error = String(cause) }
      assert.ok(error, `${adapter} must refuse ${name}`)
      report.refusals.push({ adapter, name, error })
    }
  }
  for (const [field, value] of [['designSpeedKph', 80], ['K', 50], ['unrecognizedCriteria', true]]) {
    assert.throws(() => compute({ ...sag, [field]: value }))
    report.refusals.push({ adapter: 'compute', name: `legacy-${field}` })
  }
  assert.ok(!Object.keys(require.cache).some(path => /[\\/]lib[\\/](db[\\/]|api-client[\\/]client)/.test(path)), 'Persistence client must remain unloaded.')
  assert.deepEqual(hashes(), report.source, 'Source changed during probe.')
  report.status = 'passed'; report.sourcePreserved = true; report.persistenceClientUnloaded = true
} catch (cause) { report.status = 'failed'; report.error = String(cause); process.exitCode = 1 }
finally { if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts']; unregister(); save() }
console.log(JSON.stringify({ status: report.status, profiles: report.fixtures.length, refusals: report.refusals.length, error: report.error }))
