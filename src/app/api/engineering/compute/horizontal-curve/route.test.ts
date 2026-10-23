/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { rateLimit } from '@/lib/security/rateLimit'
import { db } from '@/lib/db'
import { POST } from './route'
import type { ComputedHorizontalCurve } from '@/lib/engine/engineering'

// Actual common wrapper and geometry, inert external dependencies only.
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/security/rateLimit', () => ({ rateLimit: jest.fn(), getOperationRateLimitIdentifier: () => 'synthetic-horizontal-check' }))
jest.mock('@/lib/auth/requestContext', () => ({ setAuthenticatedDatabaseContext: jest.fn(), resolveAuthenticatedOrganization: jest.fn(async () => null) }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn(() => { throw new Error('No database calls permitted') }) } }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }, auditLog: jest.fn() }))
jest.mock('@/lib/monitoring/sentry', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/monitoring/metrics', () => ({ routeHitsTotal: { inc: jest.fn() } }))
jest.mock('@/lib/monitoring/middleware-tracker', () => ({ normalizePath: (path: string) => path }))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn() }))

const geometry = { radius: 100, delta: 60, piChainage: 500 }
const request = (body: unknown) => new NextRequest('http://127.0.0.1/api/engineering/compute/horizontal-curve', { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'synthetic-source-caller' } })
  jest.mocked(rateLimit).mockResolvedValue({ allowed: true, remaining: 59 })
})
afterEach(() => expect(db.query).not.toHaveBeenCalled())

test('scalar API declares local geometry and correct arc stationing', async () => {
  const response = await POST(request(geometry))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  const body = await response.json() as ComputedHorizontalCurve
  expect(body.pcChainage).toBeCloseTo(442.2649730810374, 10)
  expect(body.ptChainage).toBeCloseTo(546.9847282006972, 10)
  expect(body).toMatchObject({ contractVersion: 2, standardCompliance: 'NOT_ASSESSED', coordinateReferenceStatus: 'NOT_VERIFIED',
    units: { distance: 'm', station: 'm', angle: 'degrees' } })
})

test.each([{ radius: null }, { radius: '100' }, { delta: true }, { piChainage: '500' },
  { radius: -1 }, { delta: 0 }, { delta: 180 }, { delta: -60 }, { piChainage: 1e30 },
  { piChainage: 1e12 }, { radius: 1e308, delta: 179 }, { designSpeed: 80 }, { crs: 'UNDECLARED_REFERENCE' }])('scalar API rejects invalid or undeclared geometry %j', async change => {
  expect((await POST(request({ ...geometry, ...change }))).status).toBe(400)
})

test('scalar API allows signed stations', async () => {
  const response = await POST(request({ ...geometry, piChainage: -100 }))
  expect(response.status).toBe(200)
  expect((await response.json() as ComputedHorizontalCurve).piChainage).toBe(-100)
})

test('wrapper keeps authentication and rate controls', async () => {
  jest.mocked(getServerSession).mockResolvedValue(null)
  expect((await POST(request(geometry))).status).toBe(401)
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'synthetic-source-caller' } })
  jest.mocked(rateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
  expect((await POST(request(geometry))).status).toBe(429)
  expect(rateLimit).toHaveBeenCalledWith('synthetic-horizontal-check', 60, 60000)
})

test('wrapper rejects malformed JSON', async () => {
  expect((await POST(new NextRequest('http://127.0.0.1/api/engineering/compute/horizontal-curve', { method: 'POST', body: '{' }))).status).toBe(400)
})
