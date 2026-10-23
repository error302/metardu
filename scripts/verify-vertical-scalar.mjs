// Actual source API/wrapper and scalar engine; external auth/rate/context are
// synthetic adapters. No listener, real account, database or service mutation.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

assert.equal(process.argv.length, 2, 'No environment or deployment arguments accepted.')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.cache/vertical-scalar-integrity/source-probe.json')
mkdirSync(dirname(output), { recursive: true })
const paths = ['src/lib/computations/roadDesignEngine.ts', 'src/lib/engine/engineering.ts',
  'src/app/api/engineering/compute/vertical-curve/route.ts', 'src/lib/apiHandler.ts',
  'src/components/engineering/panels/RoadPanel.tsx', 'scripts/verify-vertical-scalar.mjs']
const hashes = () => Object.fromEntries(paths.map(path => [path,
  createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))
const report = { status: 'running', source: hashes(), fixtures: [], refusals: [], controls: [] }
const save = () => writeFileSync(output, JSON.stringify(report, null, 2))
save()
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript')
const originalLoad = Module._load, previous = require.extensions['.ts']
const unregister = require('tsconfig-paths').register({ baseUrl: root, paths: { '@/*': ['src/*'] } })
let signedIn = true, allowed = true, databaseCalls = 0
try {
  Module._load = function(request, parent, ...rest) {
    if (request === 'next-auth') return { getServerSession: async () => signedIn ? { user: { id: 'synthetic-source-caller' } } : null }
    if (request === '@/lib/auth') return { authOptions: {} }
    if (request === '@/lib/security/rateLimit') return { getOperationRateLimitIdentifier: () => 'synthetic-scalar-check', rateLimit: async (_id, max, window) => {
      assert.equal(max, 60); assert.equal(window, 60000); return { allowed, remaining: allowed ? 59 : 0 }
    } }
    if (request === '@/lib/auth/requestContext') return { setAuthenticatedDatabaseContext() {}, resolveAuthenticatedOrganization: async () => null }
    if (request === '@/lib/db') return { db: { query() { databaseCalls++; throw new Error('Database calls forbidden') } } }
    if (request === '@/lib/logger') return { logger: { error() {}, warn() {}, info() {} }, auditLog() {} }
    if (request === '@/lib/monitoring/sentry') return { captureError() {} }
    if (request === '@/lib/monitoring/metrics') return { routeHitsTotal: { inc() {} } }
    if (request === '@/lib/monitoring/middleware-tracker') return { normalizePath: value => value }
    if (request === '@/lib/audit/auditLog') return { appendAuditEntry() {} }
    return originalLoad.call(this, request, parent, ...rest)
  }
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true }, fileName: filename,
  }).outputText, filename)
  const { POST } = require('../src/app/api/engineering/compute/vertical-curve/route.ts')
  const { computeVerticalCurve, verticalCurveElevation, verticalCurveGrade } = require('../src/lib/engine/engineering.ts')
  const { NextRequest } = require('next/server')
  const call = input => POST(new NextRequest('http://127.0.0.1:3021/api/engineering/compute/vertical-curve', { method: 'POST', body: JSON.stringify(input) }))
  const base = { pvIChainage: 1003, pvIElevation: 100, gradeIn: -2, gradeOut: 4, length: 200 }
  for (const [name, input] of [
    ['sag', base], ['crest', { ...base, gradeIn: 2, gradeOut: -2, pvIChainage: 0, pvIElevation: -10, length: 205 }],
    ['equal', { ...base, gradeIn: 2, gradeOut: 2, pvIChainage: -25, pvIElevation: 0, length: 50 }],
    ['flat', { ...base, gradeIn: 0, gradeOut: 0, pvIChainage: -25, pvIElevation: 0 }],
    ['monotone', { ...base, gradeIn: 2, gradeOut: 6, length: 150.25 }],
    ['endpoint-stationary', { ...base, gradeOut: 0, pvIElevation: 0 }],
    ['fractional', { ...base, gradeIn: -3.125, gradeOut: 1.875, pvIChainage: 10.125, pvIElevation: 1.23456789, length: 1234.5678 }],
    ['large-representable', { pvIChainage: 0, pvIElevation: 0, gradeIn: 1e200, gradeOut: 1e200, length: 1e110 }],
  ]) {
    const response = await call(input), result = await response.json()
    assert.equal(response.status, 200, name)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    const curve = computeVerticalCurve(input.pvIChainage, input.pvIElevation, input.gradeIn, input.gradeOut, input.length)
    const samples = [-0.25, 0, 0.125, 1 / 3, 0.5, 0.75, 1, 1.25].map(fraction => {
      const chainage = input.pvIChainage + input.length * (fraction - 0.5)
      return { chainage, elevation: verticalCurveElevation(curve, chainage), grade: verticalCurveGrade(curve, chainage) }
    })
    assert.ok(samples.every(row => Object.values(row).every(Number.isFinite)))
    report.fixtures.push({ name, input, result, samples })
  }
  for (const [name, change] of [
    ['collapsed-stations', { pvIChainage: 1e30 }], ['collapsed-levels', { pvIElevation: 1e30 }],
    ['subnormal-length', { length: Number.MIN_VALUE }], ['overflow-levels', { gradeIn: 1e200, gradeOut: -1e200, length: 1e200 }],
    ['zero-length', { length: 0 }], ['guessed-speed', { designSpeedKph: 80 }], ['ignored-K', { K: 40 }], ['unverified-datum', { verticalDatum: 'unknown' }],
  ]) {
    const response = await call({ ...base, ...change })
    assert.equal(response.status, 400, name)
    report.refusals.push({ name, status: response.status, body: await response.json() })
  }
  const steep = computeVerticalCurve(100, 0, 1000, 1000, 100)
  assert.throws(() => verticalCurveElevation(steep, Number.MAX_VALUE), /range/i)
  signedIn = false
  const anonymous = await call(base); assert.equal(anonymous.status, 401)
  report.controls.push({ name: 'anonymous', status: anonymous.status })
  signedIn = true; allowed = false
  const limited = await call(base); assert.equal(limited.status, 429)
  report.controls.push({ name: 'rate-limit', status: limited.status })
  allowed = true
  const malformed = await POST(new NextRequest('http://127.0.0.1:3021/api/engineering/compute/vertical-curve', { method: 'POST', body: '{' }))
  assert.equal(malformed.status, 400); report.controls.push({ name: 'malformed', status: malformed.status })
  assert.equal(databaseCalls, 0)
  assert.ok(!Object.keys(require.cache).some(path => /[\\/]lib[\\/]db[\\/]/.test(path)), 'Real DB must remain unloaded.')
  assert.deepEqual(hashes(), report.source, 'Source changed during verification.')
  report.status = 'passed'; report.sourcePreserved = true; report.databaseCalls = databaseCalls
} catch (cause) { report.status = 'failed'; report.error = String(cause); process.exitCode = 1 }
finally { Module._load = originalLoad; if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts']; unregister(); save() }
console.log(JSON.stringify({ status: report.status, profiles: report.fixtures.length, refusals: report.refusals.length, controls: report.controls.length, error: report.error }))
