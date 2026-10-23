// Actual source handlers and real NextRequest/NextResponse; synthetic session
// adapter only. No HTTP listener, account, database, provider or service mutation.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

assert.equal(process.argv.length, 2, 'This verifier takes no environment or deployment arguments.')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.cache/curve-api-integrity/source-handler.json')
mkdirSync(dirname(output), { recursive: true })
const files = ['scripts/verify-curve-api-geometry.mjs', 'src/app/api/engineering/compute/curve/route.ts',
  'src/lib/computations/roadDesignEngine.ts', 'src/lib/survey/curves/spiralAlignment.ts',
  'src/lib/engineering/compute.ts', 'src/lib/engine/engineering.ts']
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]))
const report = { status: 'running', scope: 'source handler with synthetic authentication adapter; no real account or network', source: hashes(), cases: [] }
const save = () => writeFileSync(output, JSON.stringify(report, null, 2))
save()
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript')
const originalLoad = Module._load, previousTs = require.extensions['.ts']
const unregister = require('tsconfig-paths').register({ baseUrl: root, paths: { '@/*': ['src/*'] } })
let signedIn = true
try {
  Module._load = function (request, parent, ...rest) {
    if (request === 'next-auth') return { getServerSession: async () => signedIn ? { user: { id: 'synthetic-source-caller' } } : null }
    if (request === '@/lib/auth') return { authOptions: {} }
    if (request === '@/lib/logger') return { logger: { error() {} } }
    return originalLoad.call(this, request, parent, ...rest)
  }
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true }, fileName: filename,
  }).outputText, filename)
  const { POST } = require('../src/app/api/engineering/compute/curve/route.ts')
  const { NextRequest } = require('next/server')
  const vertical = { curveType: 'vertical', g1: -2, g2: 4, vpiChainage: 1003, vpiRL: 100, curveLength: 200, interval: 37 }
  const transition = { curveType: 'transition', radius: 300, intersectionAngleDeg: 70, spiralLength: 60, piChainage: 1000, interval: 17 }
  const { curveLength: _length, ...withoutLength } = vertical
  const cases = [
    ['sag', vertical, 200],
    ['crest-K', { ...withoutLength, g1: 4, g2: -2, kValue: 200 / 6 }, 200],
    ['zero-level', { ...vertical, vpiRL: 0, vpiChainage: 0 }, 200],
    ['negative-level', { ...vertical, vpiRL: -10, vpiChainage: -25 }, 200],
    ['flat-zero', { ...vertical, vpiRL: 0, g1: 0, g2: 0 }, 200],
    ['coarse-profile', { ...vertical, interval: 10000 }, 200],
    ['right-clothoids', transition, 200],
    ['left-clothoids', { ...transition, intersectionAngleDeg: -70, piChainage: -100 }, 200],
    ['circular-limit', { ...transition, radius: 100, intersectionAngleDeg: -60, spiralLength: 0, piChainage: 0 }, 200],
    ['coarse-clothoids', { ...transition, interval: 10000 }, 200],
    ['legacy-missing-level', { curveType: 'vertical', R: 5000, g1: -2, g2: 4, chainageStart: 903, designSpeed: 80 }, 400],
    ['two-length-authorities', { ...vertical, kValue: 40 }, 400],
    ['equal-grade-K', { ...withoutLength, g1: 2, g2: 2, kValue: 40 }, 400],
    ['collapsed-levels', { ...vertical, vpiRL: 1e30 }, 400],
    ['unbounded-profile', { ...vertical, interval: 1e-10 }, 400],
    ['legacy-guessed-spiral', { curveType: 'transition', R: 300, deltaDeg: 30, chainageStart: 0, designSpeed: 80 }, 400],
    ['missing-spiral', { ...transition, spiralLength: undefined }, 400],
    ['negative-circular-length', { ...transition, spiralLength: 1000 }, 400],
    ['unreferenced-world-coordinates', { ...transition, piEasting: 500000, piNorthing: 9900000 }, 400],
    ['unbounded-stations', { ...transition, interval: 1e-10 }, 400],
    ['horizontal-control', { curveType: 'horizontal', R: 100, deltaDeg: 60, chainageStart: 500 }, 200],
  ]
  for (const [name, input, expected] of cases) {
    const response = await POST(new NextRequest('http://127.0.0.1:3021/api/engineering/compute/curve', { method: 'POST', body: JSON.stringify(input) }))
    const body = await response.json()
    report.cases.push({ name, input, status: response.status, cache: response.headers.get('cache-control'), body })
    assert.equal(response.status, expected, name)
  }
  signedIn = false
  const refused = await POST(new NextRequest('http://127.0.0.1:3021/api/engineering/compute/curve', { method: 'POST', body: JSON.stringify(vertical) }))
  assert.equal(refused.status, 401)
  report.cases.push({ name: 'anonymous-control', status: refused.status, body: await refused.json() })
  assert.deepEqual(hashes(), report.source, 'Source changed during verification.')
  report.sourcePreserved = true
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  Module._load = originalLoad
  if (previousTs) require.extensions['.ts'] = previousTs
  else delete require.extensions['.ts']
  unregister()
  save()
}
console.log(JSON.stringify({ status: report.status, cases: report.cases.length, sourcePreserved: report.sourcePreserved ?? false, error: report.error }))
