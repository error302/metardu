// Actual scalar handler/common wrapper with synthetic external boundaries.
// No listener, real account, database, provider or service mutation.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

assert.equal(process.argv.length, 2)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, '.cache/horizontal-adapter-integrity/source-probe.json')
mkdirSync(dirname(output), { recursive: true })
const paths = ['src/lib/computations/roadDesignEngine.ts', 'src/lib/engine/engineering.ts', 'src/lib/engine/curves.ts',
  'src/lib/engineering/curves.ts', 'src/lib/engineering/compute.ts', 'src/lib/apiHandler.ts',
  'src/app/api/engineering/compute/horizontal-curve/route.ts', 'scripts/verify-horizontal-adapters.mjs']
const hashes = () => Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))
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
    if (request === '@/lib/security/rateLimit') return { getOperationRateLimitIdentifier: () => 'synthetic-horizontal-check', rateLimit: async (_id, max, window) => {
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
  const { POST } = require('../src/app/api/engineering/compute/horizontal-curve/route.ts')
  const { simpleCircularCurve } = require('../src/lib/engineering/curves.ts')
  const { curveStakeout } = require('../src/lib/engine/curves.ts')
  const { NextRequest } = require('next/server')
  const call = input => POST(new NextRequest('http://127.0.0.1:3021/api/engineering/compute/horizontal-curve', { method: 'POST', body: JSON.stringify(input) }))
  const base = { radius: 100, delta: 60, piChainage: 500 }
  for (const [name, input, interval] of [
    ['ordinary', base, 20], ['negative', { ...base, piChainage: -100 }, 37],
    ['fractional', { radius: 187.25, delta: 12.345678901, piChainage: 1100.125 }, 17.25],
    ['coarse', base, 1000], ['dense', base, 1],
    ['small-angle', { radius: 10000, delta: 1e-7, piChainage: 0 }, 1],
    ['large-representable', { radius: 1e308, delta: 1, piChainage: 0 }, 1e307],
  ]) {
    const response = await call(input), scalar = await response.json()
    assert.equal(response.status, 200, name)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    const legacy = simpleCircularCurve({ radius: input.radius, deflectionAngle: input.delta, chainage_IP: input.piChainage, interval })
    const stakeout = curveStakeout(input.piChainage, 0, input.radius, input.delta, interval)
    assert.equal(legacy.chainage_TC, scalar.pcChainage)
    assert.equal(legacy.chainage_CT, scalar.ptChainage)
    assert.equal(stakeout.points.length, legacy.settingOutTable.length)
    for (let i = 0; i < stakeout.points.length; i++) {
      assert.equal(stakeout.points[i].chainage, legacy.settingOutTable[i].chainage)
      assert.equal(stakeout.points[i].chordLength, legacy.settingOutTable[i].chordFromTC)
    }
    report.fixtures.push({ name, input, interval, scalar, legacy })
  }
  for (const [name, change] of [
    ['null-radius', { radius: null }], ['string-radius', { radius: '100' }], ['string-station', { piChainage: '500' }],
    ['negative-radius', { radius: -1 }], ['zero-angle', { delta: 0 }], ['negative-angle', { delta: -60 }],
    ['semicircle', { delta: 180 }], ['collapsed-stations', { piChainage: 1e30 }], ['inadequate-resolution', { piChainage: 1e12 }],
    ['overflow-elements', { radius: 1e308, delta: 179 }], ['guessed-speed', { designSpeed: 80 }], ['undeclared-crs', { crs: 'UNDECLARED_REFERENCE' }],
  ]) {
    const response = await call({ ...base, ...change }); assert.equal(response.status, 400, name)
    report.refusals.push({ name, status: response.status, body: await response.json() })
  }
  for (const interval of [0, -1, Infinity, Number.MIN_VALUE, 0.00001]) {
    assert.throws(() => simpleCircularCurve({ radius: 100, deflectionAngle: 60, chainage_IP: 500, interval }))
  }
  signedIn = false
  const anonymous = await call(base); assert.equal(anonymous.status, 401); report.controls.push({ name: 'anonymous', status: anonymous.status })
  signedIn = true; allowed = false
  const limited = await call(base); assert.equal(limited.status, 429); report.controls.push({ name: 'rate-limit', status: limited.status })
  allowed = true
  const malformed = await POST(new NextRequest('http://127.0.0.1:3021/api/engineering/compute/horizontal-curve', { method: 'POST', body: '{' }))
  assert.equal(malformed.status, 400); report.controls.push({ name: 'malformed', status: malformed.status })
  assert.equal(databaseCalls, 0)
  assert.ok(!Object.keys(require.cache).some(path => /[\\/]lib[\\/]db[\\/]/.test(path)))
  assert.deepEqual(hashes(), report.source)
  report.status = 'passed'; report.sourcePreserved = true; report.databaseCalls = 0
} catch (cause) { report.status = 'failed'; report.error = String(cause); process.exitCode = 1 }
finally { Module._load = originalLoad; if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts']; unregister(); save() }
console.log(JSON.stringify({ status: report.status, profiles: report.fixtures.length, refusals: report.refusals.length, controls: report.controls.length, error: report.error }))
