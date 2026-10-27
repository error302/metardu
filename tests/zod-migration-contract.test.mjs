import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { z } from 'zod'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const ts = require('typescript')
const originalLoad = Module._load
const originalTs = Module._extensions['.ts']
Object.assign(process.env, {
  NODE_ENV: 'test', AUTH_SECRET: 'synthetic-schema-contract-only-secret',
  NEXTAUTH_SECRET: 'synthetic-schema-contract-only-secret',
  DATABASE_URL: 'postgresql://schema_probe:schema_probe@127.0.0.1:1/unavailable',
  REDIS_URL: '', NEXT_PUBLIC_SENTRY_DSN: '', METARDU_MCP_ENABLED: 'false',
})
Module._load = function (request, parent, ...args) {
  return originalLoad.call(this, request.startsWith('@/') ? path.resolve('src', request.slice(2)) : request, parent, ...args)
}
Module._extensions['.ts'] = function (module, file) {
  module._compile(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file)
}
after(() => {
  Module._load = originalLoad
  if (originalTs) Module._extensions['.ts'] = originalTs
  else delete Module._extensions['.ts']
})

function decode(value) {
  if (!value || typeof value !== 'object') return value
  if (Object.keys(value).length === 1 && value.__probeUndefined === true) return undefined
  if (Object.keys(value).length === 1 && value.__probeDate) return new Date(value.__probeDate)
  return Array.isArray(value) ? value.map(decode) : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]))
}
function encode(value) {
  if (value === undefined) return { __probeUndefined: true }
  if (value instanceof Date) return { __probeDate: value.toISOString() }
  if (Array.isArray(value)) return value.map(encode)
  return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) : value
}

test('oversized constrained arrays are rejected before per-element validation allocates issues', () => {
  let visits = 0
  const schema = z.array(z.preprocess(value => { visits++; return value }, z.string())).max(2)
  const result = schema.safeParse(Array(10000).fill(42))
  assert.equal(result.success, false)
  assert.equal(visits, 0)
  assert.equal(result.error.issues.length, 1)
})

test('captured v3 wire contracts preserve acceptance and exact output keys and values', () => {
  const baseline = JSON.parse(readFileSync('tests/fixtures/zod-v3-wire-contracts.json', 'utf8'))
  assert.equal(baseline.version, '3.25.76')
  assert.equal(baseline.cases.length, 2169)
  for (const [index, item] of baseline.cases.entries()) {
    const schema = require(path.resolve(item.file))[item.name]
    const result = schema.safeParse(decode(item.input))
    const label = `${item.file}:${item.name} case ${index}`
    assert.equal(result.success, item.success, label)
    if (result.success) assert.deepEqual(encode(result.data), item.output, label)
  }
})

test('retained synthetic v3 revisions retain their hashes, original evidence and geometry', () => {
  const baseline = JSON.parse(readFileSync('tests/fixtures/zod-v3-retained-surfaces.json', 'utf8'))
  assert.equal(baseline.syntheticOnly, true)
  assert.equal(baseline.sourceVersion, '3.25.76')
  assert.equal(baseline.rows.length, 4)
  const { verifySurfaceRevision } = require(path.resolve('src/lib/topo/surfaceRevision.ts'))
  baseline.rows.forEach((row, index) => assert.deepEqual(verifySurfaceRevision(row), baseline.expected[index]))
})

test('legacy UUID-shaped database identities retain their accepted syntax and case normalization', () => {
  const { requestUuid } = require(path.resolve('src/lib/topo/surfaceRequest.ts'))
  assert.equal(requestUuid.parse('00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-000000000001')
  assert.equal(requestUuid.parse('A0000000-0000-4000-8000-000000000001'), 'a0000000-0000-4000-8000-000000000001')
  assert.equal(requestUuid.safeParse('not-a-uuid').success, false)
})
