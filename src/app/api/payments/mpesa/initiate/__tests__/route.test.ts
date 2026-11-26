/** @jest-environment node */

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { getMpesaService } from '@/lib/payments/mpesa'
import { logger } from '@/lib/logger'
import { mr } from '@/test-utils/mock-rows'
import { POST } from '../route'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/security/rateLimit', () => ({
  getOperationRateLimitIdentifier: () => 'synthetic-mpesa-initiate',
  rateLimit: jest.fn(async () => ({ allowed: true, remaining: 59 })),
}))
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  auditLog: jest.fn(),
}))
jest.mock('@/lib/monitoring/sentry', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/monitoring/metrics', () => ({ routeHitsTotal: { inc: jest.fn() } }))
jest.mock('@/lib/monitoring/middleware-tracker', () => ({ normalizePath: (value: string) => value }))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn() }))
jest.mock('@/lib/auth/requestContext', () => ({
  setAuthenticatedDatabaseContext: jest.fn(),
  resolveAuthenticatedOrganization: jest.fn(async () => null),
}))
jest.mock('@/lib/db', () => {
  const query = jest.fn()
  return {
    __esModule: true,
    default: { query },
    db: { query },
    setCurrentUserId: jest.fn(),
    setCurrentOrgId: jest.fn(),
  }
})
jest.mock('@/lib/payments/mpesa', () => {
  const actual = jest.requireActual<typeof import('@/lib/payments/mpesa')>('@/lib/payments/mpesa')
  return { ...actual, getMpesaService: jest.fn() }
})

const { MpesaService } = jest.requireActual('@/lib/payments/mpesa') as typeof import('@/lib/payments/mpesa')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const query = jest.mocked(db.query)
const fetchMock = jest.fn()

function request(phoneNumber: string): NextRequest {
  return new NextRequest('http://127.0.0.1/api/payments/mpesa/initiate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phoneNumber, planId: 'pro', currency: 'KES' }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = fetchMock
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: USER_ID }, expires: '2099-01-01' })
  jest.mocked(getMpesaService).mockReturnValue(
    new MpesaService({
      consumerKey: 'synthetic-key',
      consumerSecret: 'synthetic-secret',
      shortCode: 'synthetic-shortcode',
      initiatorName: 'METARDU',
      securityCredential: 'synthetic-passkey',
      environment: 'sandbox',
    })
  )
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO payment_intents')) return mr([{ id: 'intent-1' }])
    if (sql.includes("SET status = 'failed'")) return mr([])
    throw new Error(`Unexpected database statement: ${sql}`)
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('malformed Kenyan phone returns the actionable 400 contract without contacting Daraja', async () => {
  const response = await POST(request('1234567890'))

  expect(response.status).toBe(400)
  await expect(response.json()).resolves.toMatchObject({ code: 'MPESA_INVALID_PHONE' })
  expect(fetchMock).not.toHaveBeenCalled()
  expect(query.mock.calls.some(([sql, params]) =>
    String(sql).includes("SET status = 'failed'") && Array.isArray(params) && params[0] === 'intent-1'
  )).toBe(true)
})

test('provider rejection returns a safe 502 contract and never exposes provider details', async () => {
  fetchMock
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'synthetic-token' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ errorMessage: 'Daraja internal detail 99123' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }))

  const response = await POST(request('0712345678'))
  const body = await response.text()

  expect(response.status).toBe(502)
  expect(JSON.parse(body)).toMatchObject({ code: 'MPESA_UNAVAILABLE' })
  expect(body).not.toContain('Daraja internal detail 99123')
  expect(query.mock.calls.some(([sql, params]) =>
    String(sql).includes("SET status = 'failed'") && Array.isArray(params) && params[0] === 'intent-1'
  )).toBe(true)
})

test('malformed phone keeps the 400 contract when the failed-intent update rejects', async () => {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO payment_intents')) return mr([{ id: 'intent-1' }])
    if (sql.includes("SET status = 'failed'")) throw new Error('sensitive database cleanup detail')
    throw new Error(`Unexpected database statement: ${sql}`)
  })

  const response = await POST(request('1234567890'))
  const body = await response.text()

  expect(response.status).toBe(400)
  expect(JSON.parse(body)).toMatchObject({ code: 'MPESA_INVALID_PHONE' })
  expect(body).not.toContain('sensitive database cleanup detail')
  expect(fetchMock).not.toHaveBeenCalled()
  const cleanupLog = jest.mocked(logger.error).mock.calls.find(([message]) => /intent cleanup/i.test(String(message)))
  expect(cleanupLog).toBeDefined()
  expect(JSON.stringify(cleanupLog)).not.toContain('sensitive database cleanup detail')
})

test('provider rejection keeps the 502 contract when the failed-intent update rejects', async () => {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO payment_intents')) return mr([{ id: 'intent-1' }])
    if (sql.includes("SET status = 'failed'")) throw new Error('sensitive database cleanup detail')
    throw new Error(`Unexpected database statement: ${sql}`)
  })
  fetchMock
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'synthetic-token' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ errorMessage: 'Daraja internal detail 99123' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }))

  const response = await POST(request('0712345678'))
  const body = await response.text()

  expect(response.status).toBe(502)
  expect(JSON.parse(body)).toMatchObject({ code: 'MPESA_UNAVAILABLE' })
  expect(body).not.toContain('sensitive database cleanup detail')
  expect(body).not.toContain('Daraja internal detail 99123')
  const cleanupLog = jest.mocked(logger.error).mock.calls.find(([message]) => /intent cleanup/i.test(String(message)))
  expect(cleanupLog).toBeDefined()
  expect(JSON.stringify(cleanupLog)).not.toContain('sensitive database cleanup detail')
})
