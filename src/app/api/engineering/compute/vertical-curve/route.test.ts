/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { rateLimit } from '@/lib/security/rateLimit'
import { db } from '@/lib/db'
import { POST } from './route'
import type { ComputedVerticalCurve } from '@/lib/engine/engineering'

// Exercise the actual common API wrapper; only its external dependencies are
// inert synthetic boundaries. No real session/account or DB is created.
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/security/rateLimit', () => ({ rateLimit: jest.fn(), getOperationRateLimitIdentifier: () => 'synthetic-scalar-check' }))
jest.mock('@/lib/auth/requestContext', () => ({ setAuthenticatedDatabaseContext: jest.fn(), resolveAuthenticatedOrganization: jest.fn(async () => null) }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn(() => { throw new Error('No database calls permitted') }) } }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }, auditLog: jest.fn() }))
jest.mock('@/lib/monitoring/sentry', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/monitoring/metrics', () => ({ routeHitsTotal: { inc: jest.fn() } }))
jest.mock('@/lib/monitoring/middleware-tracker', () => ({ normalizePath: (path: string) => path }))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn() }))

const geometry = { pvIChainage: 1003, pvIElevation: 100, gradeIn: -2, gradeOut: 4, length: 200 }
const request = (body: unknown) => new NextRequest('http://127.0.0.1/api/engineering/compute/vertical-curve', { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'synthetic-source-caller' } })
  jest.mocked(rateLimit).mockResolvedValue({ allowed: true, remaining: 59 })
})
afterEach(() => expect(db.query).not.toHaveBeenCalled())

test('scalar API returns explicit endpoints, units and unverified evidence without public caching', async () => {
  const response = await POST(request(geometry))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  const body = await response.json() as ComputedVerticalCurve
  expect(body).toMatchObject({ contractVersion: 2, pvcChainage: 903, pvcElevation: 102, pvtChainage: 1103, pvtElevation: 104,
    curveType: 'sag', standardCompliance: 'NOT_ASSESSED', verticalDatumStatus: 'NOT_VERIFIED', units: { station: 'm', elevation: 'm', grade: 'percent' } })
  expect(body.highLowPoint?.chainage).toBeCloseTo(969.6666666667, 8)
  expect(body.highLowPoint?.elevation).toBeCloseTo(101.3333333333, 8)
})

test.each([{ pvIChainage: 1e30 }, { pvIElevation: 1e30 }, { length: Number.MIN_VALUE },
  { gradeIn: 1e200, gradeOut: -1e200, length: 1e200 }])('scalar API refuses nonrepresentable finite geometry %j with 400', async change => {
  const response = await POST(request({ ...geometry, ...change }))
  expect(response.status).toBe(400)
  expect((await response.json() as { code: string }).code).toBe('INVALID_VERTICAL_GEOMETRY')
})

test.each(['designSpeedKph', 'K', 'verticalDatum', 'unknown'])('scalar API refuses undeclared field %s', async field => {
  expect((await POST(request({ ...geometry, [field]: 80 }))).status).toBe(400)
})

test('scalar API preserves zero level, signed stations and straight geometry', async () => {
  const response = await POST(request({ ...geometry, pvIChainage: -25, pvIElevation: 0, gradeIn: 0, gradeOut: 0 }))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ kValue: null, curveType: 'straight', pvcElevation: 0, pvtElevation: 0 })
})

test('common wrapper refuses anonymous access', async () => {
  jest.mocked(getServerSession).mockResolvedValue(null)
  expect((await POST(request(geometry))).status).toBe(401)
})

test('common wrapper enforces the configured rate limit', async () => {
  jest.mocked(rateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
  expect((await POST(request(geometry))).status).toBe(429)
  expect(rateLimit).toHaveBeenCalledWith('synthetic-scalar-check', 60, 60000)
})

test('common wrapper refuses malformed JSON', async () => {
  expect((await POST(new NextRequest('http://127.0.0.1/api/engineering/compute/vertical-curve', { method: 'POST', body: '{' }))).status).toBe(400)
})
