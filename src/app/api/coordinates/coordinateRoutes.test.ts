/** @jest-environment node */
/* eslint-disable no-restricted-syntax -- Explicit CRS literals are intentional transformation contract fixtures, not map defaults. */
import { NextRequest, NextResponse } from 'next/server'
import type { ZodSchema } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { POST as single, GET as discovery } from './transform/route'
import { POST as batch } from './batch/route'

jest.mock('@/lib/apiHandler', () => ({ apiHandler: jest.fn((options: { auth: boolean; schema?: ZodSchema; rateLimit?: { max: number; windowMs: number } }, handler: (request: NextRequest, ctx: { body: unknown }) => Promise<NextResponse>) => async (request: NextRequest) => {
  if (options.auth && !request.headers.has('x-synthetic-test-user')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: unknown
  if (options.schema) {
    try { const parsed = options.schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: 'Invalid envelope' }, { status: 400 }); body = parsed.data }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }
  return handler(request, { body })
}) }))
const request = (value: unknown, signedIn = true) => new NextRequest('http://127.0.0.1/api/coordinates/test', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signedIn ? { 'x-synthetic-test-user': 'unit-fixture' } : {}) }, body: JSON.stringify(value) })
const common = { fromCRS: 'EPSG:4326', toCRS: 'EPSG:4326' }

test('handlers retain authentication and the exact existing rate limits', async () => {
  expect(jest.mocked(apiHandler).mock.calls).toEqual(expect.arrayContaining([
    [expect.objectContaining({ auth: true, rateLimit: { max: 120, windowMs: 60000 } }), expect.any(Function)],
    [expect.objectContaining({ auth: true, rateLimit: { max: 10, windowMs: 60000 } }), expect.any(Function)],
  ]))
  expect((await single(request({}, false))).status).toBe(401)
  expect((await batch(request({ points: [] }, false))).status).toBe(401)
})
test('single semantic errors return 422 without a successful payload', async () => {
  const response = await single(request({ ...common, longitude: 0, latitude: 91 }))
  expect(response.status).toBe(422)
  const body: unknown = await response.json()
  expect(body).toMatchObject({ success: false, code: 'INVALID_COORDINATE' })
  expect(body).not.toHaveProperty('result')
})
test('malformed envelope and malformed JSON retain HTTP400', async () => {
  expect((await single(request([]))).status).toBe(400)
  expect((await single(new NextRequest('http://127.0.0.1/api/coordinates/test', { method: 'POST', headers: { 'x-synthetic-test-user': 'unit-fixture' }, body: '{' }))).status).toBe(400)
})
test('explicit single output retains zero height, named pairs and honest metadata', async () => {
  const response = await single(request({ ...common, longitude: 0, latitude: 0, elevation: 0 }))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ success: true, result: { longitude: 0, latitude: 0, elevation: 0 }, operation: { accuracyMetres: null, horizontalOnly: true } })
})
test('batch preserves ordered source rows and duplicate/missing caller identities', async () => {
  const points = [{ id: 'same', name: 'zero', longitude: 0, latitude: 0, elevation: null }, { id: 'same', longitude: 1, latitude: 91 }, 7, { longitude: 1, latitude: 1, elevation: 0 }]
  const response = await batch(request({ ...common, points }))
  expect(response.status).toBe(200)
  const body = await response.json() as { results: Array<{ index: number; source: unknown }> }
  expect(body).toMatchObject({ totalPoints: 4, successCount: 2, errorCount: 2, fromCRS: 'EPSG:4326', toCRS: 'EPSG:4326', operation: { accuracyMetres: null } })
  expect(body.results.map((row: { index: number; source: unknown }) => ({ index: row.index, source: row.source }))).toEqual(points.map((source, index) => ({ index, source })))
  expect(body.results[0]).toMatchObject({ id: 'same', name: 'zero', success: true, result: { longitude: 0, latitude: 0, elevation: null } })
  expect(body.results[1]).toMatchObject({ id: 'same', success: false, code: 'INVALID_COORDINATE' })
  expect(body.results[2]).toMatchObject({ success: false, code: 'INVALID_COORDINATE' })
  expect(body.results[3]).not.toHaveProperty('id')
})
test('an all-failure batch still reports every row and exact counts', async () => {
  const response = await batch(request({ ...common, points: [null, {}, { longitude: '0', latitude: 0 }] }))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ totalPoints: 3, successCount: 0, errorCount: 3, results: [{ index: 0, success: false }, { index: 1, success: false }, { index: 2, success: false }] })
})
test('invalid common references and legacy UTM batches reject before processing', async () => {
  for (const selectors of [{ fromCRS: 'EPSG:3857', toCRS: 'EPSG:4326' }, { fromSystem: 'UTM', toSystem: 'WGS84' }]) {
    const response = await batch(request({ ...selectors, points: [{ easting: 500000, northing: 0, zone: 37, hemisphere: 'N' }] }))
    expect(response.status).toBe(422)
    expect(await response.json()).not.toHaveProperty('results')
  }
})
test('row selectors cannot override a common pair', async () => {
  const response = await batch(request({ ...common, points: [{ fromCRS: 'EPSG:32637', longitude: 0, latitude: 0 }] }))
  expect(await response.json()).toMatchObject({ successCount: 0, errorCount: 1 })
})
test.each([1, 1000])('batch accepts the declared %i-row boundary', async count => {
  const response = await batch(request({ ...common, points: Array.from({ length: count }, () => ({ longitude: 0, latitude: 0 })) }))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ totalPoints: count, successCount: count, errorCount: 0 })
})
test.each([0, 1001])('batch refuses %i rows at the envelope boundary', async count => {
  const response = await batch(request({ ...common, points: Array.from({ length: count }, () => ({})) }))
  expect(response.status).toBe(400)
})
test('server discovery advertises registered CRS rather than broad datum labels', async () => {
  const response = await discovery(new NextRequest('http://127.0.0.1/api/coordinates/transform', { headers: { 'x-synthetic-test-user': 'unit-fixture' } }))
  const body = await response.json() as { systems: unknown[]; maxPoints: number }
  expect(body.maxPoints).toBe(1000)
  expect(body.systems).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'EPSG:32760' })]))
})
