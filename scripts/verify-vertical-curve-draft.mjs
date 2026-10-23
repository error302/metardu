// Pure synthetic source exports. No account, project persistence or service access.
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

assert.equal(process.argv.length, 2, 'No environment or deployment arguments are accepted.')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.cache/curves-vertical-ui')
mkdirSync(output, { recursive: true })
const hash = content => createHash('sha256').update(content).digest('hex')
const sources = ['scripts/verify-vertical-curve-draft.mjs', 'src/lib/engineering/verticalCurveDraft.ts', 'src/lib/engineering/verticalCurveDraftCsv.ts',
  'src/lib/engineering/engineeringSchedulePdf.ts', 'src/lib/computations/roadDesignEngine.ts',
  'src/components/road-design/VerticalCurveCalculator.tsx', 'src/app/tools/curves/page.tsx']
const hashes = () => Object.fromEntries(sources.map(path => [path, hash(readFileSync(resolve(root, path)))]))
const manifest = { status: 'running', source: hashes(), fixtures: {} }
const save = () => writeFileSync(resolve(output, 'source-fixtures.json'), JSON.stringify(manifest, null, 2))
save()
const require = createRequire(import.meta.url), ts = require('typescript'), previous = require.extensions['.ts']
const unregister = require('tsconfig-paths').register({ baseUrl: root, paths: { '@/*': ['src/*'] } })
try {
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true }, fileName: filename,
  }).outputText, filename)
  const { verticalCurveDraftCsv } = require('../src/lib/engineering/verticalCurveDraftCsv.ts')
  const { verticalCurveDraftPdf } = require('../src/lib/engineering/verticalCurveDraft.ts')
  const sag = { g1: -2, g2: 4, vpiChainage: 1003, vpiRL: 100, curveLength: 200, interval: 37 }
  const fixtures = { sag, 'crest-K': { g1: 4, g2: -2, vpiChainage: 1003, vpiRL: 100, kValue: 40, interval: 37 },
    flat: { ...sag, g1: 0, g2: 0, vpiRL: 0, vpiChainage: 0, curveLength: 50, interval: 12.5 },
    negative: { ...sag, vpiRL: -10, vpiChainage: 0 }, dense: { ...sag, interval: 1 } }
  for (const [name, input] of Object.entries(fixtures)) {
    const csv = verticalCurveDraftCsv(input), pdf = verticalCurveDraftPdf(input, new Date('2026-10-23T00:00:00Z'))
    writeFileSync(resolve(output, `${name}.csv`), csv); writeFileSync(resolve(output, `${name}.pdf`), pdf)
    manifest.fixtures[name] = { input, csvHash: hash(csv), pdfHash: hash(pdf) }
  }
  assert.deepEqual(hashes(), manifest.source, 'Source changed during fixture generation.')
  manifest.status = 'passed'; manifest.sourcePreserved = true
} catch (cause) { manifest.status = 'failed'; manifest.error = String(cause); process.exitCode = 1 }
finally {
  if (previous) require.extensions['.ts'] = previous
  else delete require.extensions['.ts']
  unregister(); save()
}
console.log(JSON.stringify({ status: manifest.status, fixtureCount: Object.keys(manifest.fixtures).length }))
