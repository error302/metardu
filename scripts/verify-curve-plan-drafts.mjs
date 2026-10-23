// Pure synthetic source calculations and files; no account, network or database.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
assert.equal(process.argv.length, 2, 'This source verifier accepts no deployment arguments.')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), output = resolve(root, '.cache/curve-plan-integrity')
mkdirSync(output, { recursive: true })
const hash = content => createHash('sha256').update(content).digest('hex')
const files = ['scripts/verify-curve-plan-drafts.mjs', 'src/lib/engine/curves.ts', 'src/lib/engine/solution/wrappers/curves.ts',
  'src/lib/computations/roadDesignEngine.ts', 'src/lib/engineering/curvePlanDraftCsv.ts', 'src/lib/engineering/curvePlanDraftPdf.ts',
  'src/lib/engineering/engineeringSchedulePdf.ts', 'src/app/tools/curves/page.tsx']
const hashes = () => Object.fromEntries(files.map(path => [path, hash(readFileSync(resolve(root, path)))]))
const report = { status: 'running', source: hashes(), fixtures: {} }
const save = () => writeFileSync(resolve(output, 'source-fixtures.json'), JSON.stringify(report, null, 2))
save()
const require = createRequire(import.meta.url), ts = require('typescript'), previous = require.extensions['.ts']
const unregister = require('tsconfig-paths').register({ baseUrl: root, paths: { '@/*': ['src/*'] } })
try {
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true }, fileName: filename,
  }).outputText, filename)
  const { simpleCurveSolved, compoundCurveSolved, reverseCurveSolved } = require('../src/lib/engine/solution/wrappers/curves.ts')
  const { curvePlanDraftCsv } = require('../src/lib/engineering/curvePlanDraftCsv.ts')
  const { curvePlanDraftPdf } = require('../src/lib/engineering/curvePlanDraftPdf.ts')
  const fixtures = [
    ['simple', 'simple', { radius: 100, deflectionDeg: 60, piChainage: 500, interval: 20 }],
    ['simple-negative', 'simple', { radius: 100, deflectionDeg: 60, piChainage: -100, interval: 37 }],
    ['simple-dense', 'simple', { radius: 100, deflectionDeg: 60, piChainage: 500, interval: 1 }],
    ['compound', 'compound', { R1: 100, R2: 200, delta1Deg: 60, delta2Deg: 30, junctionChainage: 500 }],
    ['compound-negative', 'compound', { R1: 200, R2: 150, delta1Deg: 30, delta2Deg: 45, junctionChainage: -100 }],
    ['reverse', 'reverse', { R1: 100, R2: 200, AB: 300, delta1: 60, delta2: 60 }],
    ['reverse-unequal', 'reverse', { R1: 200, R2: 150, AB: 500, delta1: 30, delta2: 45 }],
  ]
  for (const [name, kind, input] of fixtures) {
    const solved = kind === 'simple' ? simpleCurveSolved(input) : kind === 'compound' ? compoundCurveSolved(input) : reverseCurveSolved(input)
    const r = solved.result
    let values
    if (kind === 'simple') { const e = r.elements; values = { tangent_m: e.tangentLength, arc_m: e.arcLength, long_chord_m: e.longChord, external_m: e.externalDistance, mid_ordinate_m: e.midOrdinate, PC_m: r.pcChainage, PI_m: r.piChainage, PT_m: r.ptChainage } }
    else if (kind === 'compound') values = { first_tangent_m: r.t1, second_tangent_m: r.t2, first_arc_m: r.l1, second_arc_m: r.l2, total_arc_m: r.totalLength, PC_m: r.chainT1, PCC_m: r.chainJ, PT_m: r.chainT2 }
    else values = { first_tangent_m: r.t1, second_tangent_m: r.t2, first_arc_m: r.l1, second_arc_m: r.l2, intervening_tangent_m: r.commonTangent, arc_sum_m: r.arcLength, total_path_m: r.totalLength }
    const snapshot = { kind, input, values, ...(kind === 'simple' ? { points: r.points } : {}) }
    const csv = curvePlanDraftCsv(snapshot), pdf = curvePlanDraftPdf(snapshot, new Date('2026-10-23T00:00:00Z'))
    writeFileSync(resolve(output, `${name}.csv`), csv); writeFileSync(resolve(output, `${name}.pdf`), pdf)
    report.fixtures[name] = { snapshot, csvHash: hash(csv), pdfHash: hash(pdf) }
  }
  assert.deepEqual(hashes(), report.source, 'Source changed during fixture generation.')
  report.status = 'passed'; report.sourcePreserved = true
} catch (cause) { report.status = 'failed'; report.error = String(cause); process.exitCode = 1 }
finally { if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts']; unregister(); save() }
console.log(JSON.stringify({ status: report.status, fixtures: Object.keys(report.fixtures).length, error: report.error }))
