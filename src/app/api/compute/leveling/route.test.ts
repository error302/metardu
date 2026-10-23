/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { POST } from './route'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/lib/auth/requestContext', () => ({ setAuthenticatedDatabaseContext: jest.fn(), resolveAuthenticatedOrganization: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }, auditLog: jest.fn() }))
jest.mock('@/lib/security/rateLimit', () => ({ getOperationRateLimitIdentifier: () => 'leveling-test', rateLimit: async () => ({ allowed: true, remaining: 49 }) }))
jest.mock('@/lib/monitoring/sentry', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/monitoring/metrics', () => ({ routeHitsTotal: { inc: jest.fn() } }))
jest.mock('@/lib/monitoring/middleware-tracker', () => ({ normalizePath: (path: string) => path }))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn() }))

const base = { surveyType: 'engineering', method: 'rise_and_fall', openingRL: 100,
  readings: [{ station: 'BM', bs: 1.5 }, { station: 'CLOSE', fs: 1.496 }] }
const request = (body: object) => new NextRequest('http://127.0.0.1/api/compute/leveling', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
type Output = { closureStatus: string; misclosure: number | null; misclosureMm: number | null; allowableMm: number | null;
  message: string; readings: Array<{ reducedLevel: number; bs?: number; fs?: number }> }
const bodyOf = async (response: Response): Promise<Output> => await response.json() as Output
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'synthetic-surveyor' }, expires: '2099-01-01T00:00:00Z' })
})

test('ordinary API wrapper still refuses anonymous calculations', async () => {
  jest.mocked(getServerSession).mockResolvedValue(null)
  expect((await POST(request(base))).status).toBe(401)
})

test('unknown closing benchmark and route length remain null, without a false failure verdict', async () => {
  const response = await POST(request(base))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ closureStatus: 'unknown', isAcceptable: null,
    misclosure: null, misclosureMm: null, allowableMm: null, distanceKm: null })
})

test('declared distance cannot manufacture a measured closure when the benchmark is unknown', async () => {
  const value = await bodyOf(await POST(request({ ...base, distanceKm: 1 })))
  expect(value).toMatchObject({ closureStatus: 'unknown', misclosure: null, misclosureMm: null, allowableMm: 10, isAcceptable: null })
})

test('measured closure is retained while a missing route length prevents a tolerance verdict', async () => {
  const value = await bodyOf(await POST(request({ ...base, closingRL: 100 })))
  expect(value).toMatchObject({ closureStatus: 'unknown', allowableMm: null, isAcceptable: null })
  expect(value.misclosureMm).toBeCloseTo(4, 8)
})

test.each(['rise_and_fall', 'height_of_collimation'])('%s uses the supplied one-kilometre run, not backsight count', async method => {
  const response = await POST(request({ ...base, method, closingRL: 100, distanceKm: 1 }))
  expect(response.status).toBe(200)
  const value = await bodyOf(response)
  expect(value).toMatchObject({ closureStatus: 'acceptable', allowableMm: 10, isAcceptable: true, distanceKm: 1, fieldVerified: false })
  expect(value.misclosure).toBeCloseTo(0.004, 12)
  expect(value.readings.at(-1)?.reducedLevel).toBeCloseTo(100.004, 12)
})

test.each([0, -100])('a closing benchmark at %s remains a known value', async openingRL => {
  const value = await bodyOf(await POST(request({ ...base, openingRL, closingRL: openingRL, distanceKm: 1 })))
  expect(value.closureStatus).toBe('acceptable')
  expect(value.misclosureMm).toBeCloseTo(4, 8)
})

test.each([
  { readings: [] }, { readings: [{ station: 'BM' }] }, { readings: [{ station: '  ', bs: 1.5 }] },
  { readings: [{ station: 'BM', fs: 1.5 }] }, { readings: [{ station: 'BM', bs: 1.5, fs: 1.5 }] },
  { distanceKm: 0 }, { distanceKm: -1 }, { distanceKm: null }, { openingRL: null },
])('invalid or incomplete input %j is refused by the real transport schema', async patch => {
  expect((await POST(request({ ...base, ...patch }))).status).toBe(400)
})

test('nonfinite engine output is refused instead of becoming JSON null numerical results', async () => {
  const response = await POST(request({ ...base, openingRL: 1e308,
    readings: [{ station: 'BM', bs: 1e308 }, { station: 'CLOSE', fs: 1 }] }))
  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({ code: 'NONFINITE_LEVELING_RESULT' })
})

test('a numerical closing match cannot override a failed arithmetic identity', async () => {
  const value = await bodyOf(await POST(request({ ...base, closingRL: 101, distanceKm: 1,
    readings: [{ station: 'BM', bs: 1.5 }, { station: 'A', fs: 1 }, { station: 'B', fs: 0.5 }] })))
  expect(value).toMatchObject({ arithmeticCheck: false, misclosure: 0, closureStatus: 'unknown', isAcceptable: null })
  expect(value.message).toMatch(/arithmetic check failed/i)
})

test('entered zero readings and benchmarks are preserved', async () => {
  const value = await bodyOf(await POST(request({ ...base, openingRL: 0, closingRL: 0, distanceKm: 1,
    readings: [{ station: 'BM', bs: 0 }, { station: 'CLOSE', fs: 0 }] })))
  expect(value).toMatchObject({ closureStatus: 'acceptable', misclosure: 0, allowableMm: 10 })
  expect(value.readings.at(-1)).toMatchObject({ fs: 0, reducedLevel: 0 })
})

test.each([
  { readings: Array.from({ length: 10001 }, (_, index) => ({ station: String(index), bs: 0 })) },
  { readings: [{ station: 'B'.repeat(201), bs: 0 }] },
])('bounded transport refuses oversized observations', async patch => {
  expect((await POST(request({ ...base, ...patch }))).status).toBe(400)
})
