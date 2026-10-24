// Pure source gate and formatter. No account, database, network or service actions.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

assert.equal(process.argv.length, 2)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.cache/road-export-gate/source-probe.json')
mkdirSync(dirname(output), { recursive: true })
const paths = ['src/lib/validation/statutoryGate.ts', 'src/lib/validation/roadQualityGate.ts',
  'src/lib/computations/roadSafetyCriteria.ts', 'src/components/validation/StatutoryGatePanel.tsx',
  'scripts/verify-road-export-gate.mjs']
const hashes = () => Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))
const report = { status: 'running', source: hashes(), fixtures: [] }
const save = () => writeFileSync(output, JSON.stringify(report, null, 2))
save()
const require = createRequire(import.meta.url), ts = require('typescript'), previous = require.extensions['.ts']
const unregister = require('tsconfig-paths').register({ baseUrl: root, paths: { '@/*': ['src/*'] } })
try {
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true }, fileName: filename,
  }).outputText, filename)
  const { runStatutoryGate, formatGateResult, listRules } = require('../src/lib/validation/statutoryGate.ts')
  const criteria = { reference: 'Synthetic project criteria rev 1', minimumRadiusM: 250, maximumSuperelevation: 0.08,
    longitudinalFriction: 0.35, reactionTimeSeconds: 2.5 }
  const base = { surveyType: 'engineering', surveyor: { name: 'Synthetic source checker', licenseNumber: 'ISK/LS/2020/123' } }
  for (const [name, engineering, passed, state] of [
    ['radius-pass', { horizontalCurveRadiusM: 300, criteria }, true, 'PASS'],
    ['radius-fail', { horizontalCurveRadiusM: 150, criteria }, false, 'FAIL'],
    ['bank-pass-declared', { superelevation: 0.12, criteria: { ...criteria, maximumSuperelevation: 0.15 } }, true, 'PASS'],
    ['bank-fail-declared', { superelevation: 0.07, criteria: { ...criteria, maximumSuperelevation: 0.06 } }, false, 'FAIL'],
    ['ssd-pass', { designSpeedKph: 80, gradePercent: 0, availableSightDistanceM: 200, criteria }, true, 'PASS'],
    ['ssd-zero', { designSpeedKph: 80, gradePercent: 0, availableSightDistanceM: 0, criteria }, false, 'FAIL'],
    ['ssd-downhill', { designSpeedKph: 80, gradePercent: -5, availableSightDistanceM: 100, criteria }, false, 'FAIL'],
    ['ssd-declared-minimum', { designSpeedKph: 80, gradePercent: 0, availableSightDistanceM: 200,
      criteria: { ...criteria, minimumStoppingDistanceM: 300 } }, false, 'FAIL'],
    ['all-pass', { designSpeedKph: 80, gradePercent: 0, horizontalCurveRadiusM: 300, availableSightDistanceM: 500,
      superelevation: 0.07, criteria }, true, 'PASS'],
    ['missing-criteria', { horizontalCurveRadiusM: 300 }, false, 'UNASSESSED'],
    ['missing-grade', { designSpeedKph: 80, availableSightDistanceM: 500, criteria }, false, 'UNASSESSED'],
    ['invalid-braking-criteria', { designSpeedKph: 80, gradePercent: 0, availableSightDistanceM: 500,
      criteria: { ...criteria, longitudinalFriction: 0 } }, false, 'UNASSESSED'],
    ['malformed-request', null, false, 'UNASSESSED'],
    ['empty-request', {}, false, 'UNASSESSED'],
    ['not-requested', undefined, true, 'UNASSESSED'],
  ]) {
    const input = { ...base, ...(engineering === undefined ? {} : { engineering }) }
    const result = runStatutoryGate(input), formatted = formatGateResult(result)
    assert.equal(result.passed, passed, name)
    assert.equal(result.ruleVersion, '1.3.0')
    const findings = result.violations.filter(item => item.field?.startsWith('engineering'))
    assert.ok(findings.length > 0, name)
    for (const finding of findings) {
      assert.equal(finding.assessment, state, name); assert.equal(finding.source, 'metardu_qc')
      assert.equal(finding.standardCompliance, 'NOT_ASSESSED')
      for (const value of [finding.actual, finding.allowable]) if (value !== undefined) assert.ok(Number.isFinite(value))
      assert.ok(!/Per RDM|unsafe stopping|safely negotiate|KeNHA approval/.test(finding.message))
      if (state !== 'UNASSESSED') assert.equal(finding.criteriaReference, criteria.reference)
    }
    if (name === 'not-requested') assert.ok(formatted.includes('Road checks unassessed'))
    report.fixtures.push({ name, ...(engineering === undefined ? {} : { engineering }), result, formatted })
  }
  const roadRules = listRules().filter(item => item.id.startsWith('metardu_qc.road_'))
  assert.equal(roadRules.length, 3)
  assert.ok(roadRules.every(item => item.source === 'metardu_qc'))
  assert.ok(!Object.keys(require.cache).some(path => /[\\/]lib[\\/](db[\\/]|api-client[\\/]client)/.test(path)))
  assert.deepEqual(hashes(), report.source)
  report.status = 'passed'; report.sourcePreserved = true; report.persistenceClientUnloaded = true
} catch (cause) { report.status = 'failed'; report.error = String(cause); process.exitCode = 1 }
finally { if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts']; unregister(); save() }
console.log(JSON.stringify({ status: report.status, cases: report.fixtures.length, error: report.error }))
