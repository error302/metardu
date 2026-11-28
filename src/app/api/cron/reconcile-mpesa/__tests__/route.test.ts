/** @jest-environment node */
import { NextRequest } from 'next/server'
import { mr } from '@/test-utils/mock-rows'
import { db, setCurrentRlsServiceRole } from '@/lib/db'
import { getMpesaService } from '@/lib/payments/mpesa'
import type { MpesaCompletionResult } from '@/lib/payments/mpesaCompletion'
import { POST } from '../route'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() }, setCurrentRlsServiceRole: jest.fn() }))
jest.mock('@/lib/payments/mpesa', () => {
  const actual = jest.requireActual('@/lib/payments/mpesa') as typeof import('@/lib/payments/mpesa')
  return {
    ...actual,
    getMpesaService: jest.fn(),
  }
})
jest.mock('@/lib/payments/mpesaCompletion', () => ({
  completeMpesaPayment: (input: unknown): Promise<MpesaCompletionResult> => mockComplete(input),
}))
jest.mock('@/lib/payments/receipt', () => ({
  sendPurchaseReceipt: jest.fn().mockResolvedValue({ sent: true }),
}))
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

const originalKey = process.env.API_ADMIN_KEY
const key = 'synthetic-reconciliation-route-test-only'
const check = jest.fn()
const mockComplete = jest.fn<Promise<MpesaCompletionResult>, [unknown]>()
const query = jest.mocked(db.query)
const request = (authorized = true) => new NextRequest('http://127.0.0.1/api/cron/reconcile-mpesa', {
  method: 'POST', headers: authorized ? { authorization: `Bearer ${key}` } : {},
})
beforeEach(() => {
  jest.clearAllMocks()
  process.env.API_ADMIN_KEY = key
  jest.mocked(getMpesaService).mockReturnValue({ checkTransactionStatus: check } as unknown as NonNullable<ReturnType<typeof getMpesaService>>)
  mockComplete.mockResolvedValue({
    outcome: 'completed',
    activated: true,
    receiptNumber: null,
    receiptEnriched: false,
  })
})
afterAll(() => {
  if (originalKey === undefined) delete process.env.API_ADMIN_KEY
  else process.env.API_ADMIN_KEY = originalKey
})

test('unauthorized reconciliation cannot inspect payments or call the provider', async () => {
  expect((await POST(request(false))).status).toBe(401)
  expect(query).not.toHaveBeenCalled()
  expect(setCurrentRlsServiceRole).not.toHaveBeenCalled()
  expect(check).not.toHaveBeenCalled()
})

test.each([null, ''])('missing checkout identity %p remains pending without a provider call or entitlement write', async checkoutRequestId => {
  query.mockResolvedValueOnce(mr([{ id: 'synthetic-payment', checkout_request_id: checkoutRequestId }]))
  const response = await POST(request())
  expect(await response.json()).toEqual({ ok: true, scanned: 1, completed: 0, failed: 0, keptPending: 1 })
  expect(setCurrentRlsServiceRole).toHaveBeenCalledWith('billing_reconciliation')
  expect(check).not.toHaveBeenCalled()
  expect(query.mock.calls.every(([sql]) =>
    /^\s*SELECT\b/i.test(sql) || sql.includes('last_reconcile_attempt_at = NOW()')
  )).toBe(true)
  expect(query.mock.calls.some(([sql, params]) =>
    sql.includes('UPDATE payment_history') &&
    sql.includes('last_reconcile_attempt_at = NOW()') &&
    JSON.stringify(params).includes('synthetic-payment')
  )).toBe(true)
})

test('a stored checkout identity reaches the provider and ambiguous evidence remains pending', async () => {
  query.mockResolvedValueOnce(mr([{
    id: 'synthetic-payment',
    checkout_request_id: 'synthetic-checkout',
    plan_id: 'pro',
    amount: 2500,
    currency: 'KES',
    phone_number: '254712345678',
  }]))
  check.mockResolvedValueOnce({ status: 'pending' })
  const response = await POST(request())
  expect(await response.json()).toEqual({ ok: true, scanned: 1, completed: 0, failed: 0, keptPending: 1 })
  expect(check).toHaveBeenCalledWith('synthetic-checkout')
  expect(query.mock.calls.every(([sql]) =>
    /^\s*SELECT\b/i.test(sql) || sql.includes('last_reconcile_attempt_at = NOW()')
  )).toBe(true)
  expect(query.mock.calls.some(([sql, params]) =>
    sql.includes('UPDATE payment_history') &&
    sql.includes('last_reconcile_attempt_at = NOW()') &&
    JSON.stringify(params).includes('synthetic-payment')
  )).toBe(true)
})

test('an ambiguous provider result remains pending even for an old checkout', async () => {
  query.mockResolvedValueOnce(mr([{
    id: 'synthetic-payment',
    checkout_request_id: 'synthetic-checkout',
    plan_id: 'pro',
    amount: 2500,
    currency: 'KES',
    phone_number: '254712345678',
  }]))
  check.mockResolvedValueOnce({ status: 'pending' })

  const response = await POST(request())

  expect(await response.json()).toEqual({ ok: true, scanned: 1, completed: 0, failed: 0, keptPending: 1 })
  expect(query.mock.calls.some(([sql]) => sql.includes("status = 'failed'"))).toBe(false)
})

test('orders the bounded reconciliation batch by the last attempt before deterministic fallbacks', async () => {
  query.mockResolvedValueOnce(mr([]))

  await POST(request())

  const selection = query.mock.calls.find(([sql]) =>
    /^\s*SELECT\b/i.test(sql) && sql.includes('FROM payment_history')
  )
  expect(selection?.[0]).toContain('last_reconcile_attempt_at ASC NULLS FIRST')
  expect(selection?.[0]).toContain('created_at ASC')
  expect(selection?.[0]).toContain('id ASC')
  expect(selection?.[0]).not.toMatch(/ORDER BY\s+created_at\s+ASC\s*\n\s*LIMIT/i)
})

test('a completed reconciliation query with mismatched evidence is retained for review and never activates', async () => {
  query.mockResolvedValueOnce(mr([{
    id: 'synthetic-payment',
    user_id: '90000000-0000-4000-8000-000000000901',
    plan_id: 'pro',
    amount: 2500,
    currency: 'KES',
    status: 'pending',
    checkout_request_id: 'synthetic-checkout',
    phone_number: '254712345678',
    metadata: { seatCount: 1, extraSeats: 0 },
  }]))
  check.mockResolvedValueOnce({
    status: 'completed',
    amount: 1,
    phone: '254712345678',
    resultCode: 0,
  })
  mockComplete.mockResolvedValueOnce({
    outcome: 'rejected',
    reason: 'amount_mismatch',
  })

  const response = await POST(request())

  expect(await response.json()).toEqual({ ok: true, scanned: 1, completed: 0, failed: 0, keptPending: 1 })
  const reviewUpdate = query.mock.calls.find(([sql, params]) =>
    sql.includes("status = 'pending_review'") &&
    JSON.stringify(params).includes('amount_mismatch')
  )
  expect(reviewUpdate).toBeDefined()
  expect(query.mock.calls.some(([sql]) => sql.includes('user_subscriptions'))).toBe(false)
})

test('reconciliation normalizes a numeric database amount before shared completion validation', async () => {
  query.mockResolvedValueOnce(mr([{
    id: 'synthetic-payment',
    user_id: '90000000-0000-4000-8000-000000000901',
    plan_id: 'pro',
    amount: '2500',
    currency: 'KES',
    status: 'pending',
    checkout_request_id: 'synthetic-checkout',
    phone_number: '254712345678',
    metadata: { seatCount: 1, extraSeats: 0 },
  }]))
  check.mockResolvedValueOnce({
    status: 'completed',
    amount: 2500,
    phone: '254712345678',
    resultCode: 0,
  })

  await POST(request())

  expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
    record: expect.objectContaining({ amount: 2500 }) as unknown,
  }))
})

test('keeps an unknown Daraja result code pending instead of terminally failing reconciliation', async () => {
  query.mockResolvedValueOnce(mr([{
    id: 'synthetic-payment',
    user_id: '90000000-0000-4000-8000-000000000901',
    plan_id: 'pro',
    amount: 2500,
    currency: 'KES',
    status: 'pending',
    checkout_request_id: 'synthetic-checkout',
    phone_number: '254712345678',
    metadata: { seatCount: 1, extraSeats: 0 },
  }]))
  check.mockResolvedValueOnce({
    status: 'failed',
    resultCode: 1001,
    resultDesc: 'Synthetic retryable provider result',
  })

  const response = await POST(request())

  expect(await response.json()).toEqual({ ok: true, scanned: 1, completed: 0, failed: 0, keptPending: 1 })
  expect(query.mock.calls.some(([sql]) => sql.includes("status = 'failed'"))).toBe(false)
  expect(query.mock.calls.some(([sql, params]) =>
    sql.includes('UPDATE payment_history') &&
    sql.includes('last_reconcile_attempt_at = NOW()') &&
    JSON.stringify(params).includes('synthetic-payment')
  )).toBe(true)
})

test('reports the authoritative failed status when the shared reconciliation claim misses a failed row', async () => {
  query.mockResolvedValueOnce(mr([{
    id: 'synthetic-payment',
    user_id: '90000000-0000-4000-8000-000000000901',
    plan_id: 'pro',
    amount: 2500,
    currency: 'KES',
    status: 'pending',
    checkout_request_id: 'synthetic-checkout',
    phone_number: '254712345678',
    metadata: { seatCount: 1, extraSeats: 0 },
  }]))
  check.mockResolvedValueOnce({
    status: 'completed',
    amount: 2500,
    phone: '254712345678',
    resultCode: 0,
  })
  mockComplete.mockResolvedValueOnce({
    outcome: 'not_completed',
    activated: false,
    status: 'failed',
    receiptNumber: null,
    receiptEnriched: false,
  } as unknown as MpesaCompletionResult)

  const response = await POST(request())

  expect(await response.json()).toEqual({ ok: true, scanned: 1, completed: 0, failed: 1, keptPending: 0 })
})

test('marks a definitive provider result as failed only when the stored row is still recoverable', async () => {
  query.mockImplementation(async (sql: string) => {
    if (/^\s*SELECT\b/i.test(sql) && sql.includes('checkout_request_id IS NOT NULL')) {
      return mr([{
        id: 'synthetic-payment',
        user_id: '90000000-0000-4000-8000-000000000901',
        plan_id: 'pro',
        amount: 2500,
        currency: 'KES',
        status: 'pending',
        checkout_request_id: 'synthetic-checkout',
        phone_number: '254712345678',
        metadata: { seatCount: 1, extraSeats: 0 },
      }])
    }
    if (sql.includes("SET status = 'failed'")) return mr([], 1)
    return mr([])
  })
  check.mockResolvedValueOnce({
    status: 'failed',
    resultCode: 1032,
    resultDesc: 'Request cancelled by user',
  })

  const response = await POST(request())

  expect(await response.json()).toEqual({ ok: true, scanned: 1, completed: 0, failed: 1, keptPending: 0 })
  expect(query.mock.calls.some(([sql, params]) =>
    sql.includes('UPDATE payment_history') &&
    sql.includes('last_reconcile_attempt_at = NOW()') &&
    JSON.stringify(params).includes('synthetic-payment')
  )).toBe(true)
})

test('does not count a definitive failure when the stored row completed concurrently', async () => {
  query.mockImplementation(async (sql: string) => {
    if (/^\s*SELECT\b/i.test(sql) && sql.includes('checkout_request_id IS NOT NULL')) {
      return mr([{
        id: 'synthetic-payment',
        user_id: '90000000-0000-4000-8000-000000000901',
        plan_id: 'pro',
        amount: 2500,
        currency: 'KES',
        status: 'pending',
        checkout_request_id: 'synthetic-checkout',
        phone_number: '254712345678',
        metadata: { seatCount: 1, extraSeats: 0 },
      }])
    }
    if (sql.includes("SET status = 'failed'")) return mr([], 0)
    if (/^\s*SELECT\s+status\b/i.test(sql)) return mr([{ status: 'completed' }])
    return mr([])
  })
  check.mockResolvedValueOnce({
    status: 'failed',
    resultCode: 1032,
    resultDesc: 'Request cancelled by user',
  })

  const response = await POST(request())

  expect(await response.json()).toEqual({ ok: true, scanned: 1, completed: 1, failed: 0, keptPending: 0 })
})

test('reconciliation selects unified M-Pesa checkouts by checkout identity and uses the shared completion contract', async () => {
  query.mockImplementation(async (sql: string) => {
    if (/^\s*SELECT\b/i.test(sql) && sql.includes('checkout_request_id IS NOT NULL')) {
      return mr([{
        id: 'synthetic-payment',
        user_id: '90000000-0000-4000-8000-000000000901',
        plan_id: 'pro',
        amount: 2500,
        currency: 'KES',
        status: 'pending',
        checkout_request_id: 'synthetic-checkout',
        phone_number: '254712345678',
        metadata: { seatCount: 1, extraSeats: 0 },
      }])
    }
    return mr([])
  })
  check.mockResolvedValueOnce({
    status: 'completed',
    amount: 2500,
    phone: '254712345678',
    resultCode: 0,
  })

  const response = await POST(request())

  const responseBody: unknown = await response.json()
  const selection = query.mock.calls.find(([sql]) =>
    /^\s*SELECT\b/i.test(sql) && sql.includes('FROM payment_history')
  )
  expect(selection?.[0]).toContain("payment_method = 'mpesa'")
  expect(selection?.[0]).toContain('checkout_request_id IS NOT NULL')
  expect(selection?.[0]).not.toContain("provider = 'mpesa'")
  expect(check).toHaveBeenCalledWith('synthetic-checkout')
  expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
    record: expect.objectContaining({ checkout_request_id: 'synthetic-checkout' }) as unknown,
    evidence: expect.objectContaining({
      source: 'reconciliation',
      checkoutRequestId: 'synthetic-checkout',
      amount: 2500,
      phone: '254712345678',
    }) as unknown,
  }))
  expect(responseBody).toEqual({ ok: true, scanned: 1, completed: 1, failed: 0, keptPending: 0 })
  expect(query.mock.calls.some(([sql, params]) =>
    sql.includes('UPDATE payment_history') &&
    sql.includes('last_reconcile_attempt_at = NOW()') &&
    JSON.stringify(params).includes('synthetic-payment')
  )).toBe(true)
})

test('records the reconciliation attempt when the provider query throws', async () => {
  query.mockResolvedValueOnce(mr([{
    id: 'synthetic-payment',
    checkout_request_id: 'synthetic-checkout',
    plan_id: 'pro',
    amount: 2500,
    currency: 'KES',
    phone_number: '254712345678',
  }]))
  check.mockRejectedValueOnce(new Error('synthetic provider outage'))

  const response = await POST(request())

  expect(await response.json()).toEqual({
    ok: true,
    scanned: 1,
    completed: 0,
    failed: 0,
    keptPending: 1,
    errors: [{ id: 'synthetic-payment', error: 'provider_query_failed' }],
  })
  expect(query.mock.calls.some(([sql, params]) =>
    sql.includes('UPDATE payment_history') &&
    sql.includes('last_reconcile_attempt_at = NOW()') &&
    JSON.stringify(params).includes('synthetic-payment')
  )).toBe(true)
})

test('records the reconciliation attempt when shared completion fails', async () => {
  query.mockResolvedValueOnce(mr([{
    id: 'synthetic-payment',
    user_id: '90000000-0000-4000-8000-000000000901',
    plan_id: 'pro',
    amount: 2500,
    currency: 'KES',
    status: 'pending',
    checkout_request_id: 'synthetic-checkout',
    phone_number: '254712345678',
    metadata: { seatCount: 1, extraSeats: 0 },
  }]))
  check.mockResolvedValueOnce({
    status: 'completed',
    amount: 2500,
    phone: '254712345678',
    resultCode: 0,
  })
  mockComplete.mockRejectedValueOnce(new Error('synthetic shared completion failure'))

  const response = await POST(request())

  expect(await response.json()).toMatchObject({
    scanned: 1,
    completed: 0,
    failed: 0,
    keptPending: 1,
  })
  expect(query.mock.calls.some(([sql, params]) =>
    sql.includes('UPDATE payment_history') &&
    sql.includes('last_reconcile_attempt_at = NOW()') &&
    JSON.stringify(params).includes('synthetic-payment')
  )).toBe(true)
})

test('records the reconciliation attempt when review persistence fails', async () => {
  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (/^\s*SELECT\b/i.test(sql) && sql.includes('FROM payment_history')) {
      return mr([{
        id: 'synthetic-payment',
        user_id: '90000000-0000-4000-8000-000000000901',
        plan_id: 'pro',
        amount: 2500,
        currency: 'KES',
        status: 'pending',
        checkout_request_id: 'synthetic-checkout',
        phone_number: '254712345678',
        metadata: { seatCount: 1, extraSeats: 0 },
      }])
    }
    if (sql.includes("status = 'pending_review'")) {
      throw new Error('synthetic review persistence failure')
    }
    if (sql.includes('UPDATE payment_history') && sql.includes('last_reconcile_attempt_at = NOW()')) {
      expect(params).toContain('synthetic-payment')
      return mr([], 1)
    }
    return mr([])
  })
  check.mockResolvedValueOnce({
    status: 'completed',
    amount: 2500,
    phone: '254712345678',
    resultCode: 0,
  })
  mockComplete.mockResolvedValueOnce({
    outcome: 'rejected',
    reason: 'amount_mismatch',
  })

  const response = await POST(request())

  expect(await response.json()).toMatchObject({
    scanned: 1,
    completed: 0,
    failed: 0,
    keptPending: 1,
  })
  expect(query.mock.calls.some(([sql]) =>
    sql.includes('UPDATE payment_history') &&
    sql.includes('last_reconcile_attempt_at = NOW()')
  )).toBe(true)
})

test('a batch larger than MAX_BATCH cannot permanently hide a newer pending row', async () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({
    id: `synthetic-payment-${index}`,
    user_id: '90000000-0000-4000-8000-000000000901',
    plan_id: 'pro',
    amount: 2500,
    currency: 'KES',
    status: 'pending',
    checkout_request_id: `synthetic-checkout-${index}`,
    phone_number: '254712345678',
    metadata: { seatCount: 1, extraSeats: 0 },
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    last_reconcile_attempt_at: null as string | null,
  }))

  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (/^\s*SELECT\b/i.test(sql) && sql.includes('FROM payment_history')) {
      const limit = Number(params?.[1] ?? 50)
      const selected = [...rows]
        .sort((left, right) => {
          const leftAttempt = left.last_reconcile_attempt_at
            ? Date.parse(left.last_reconcile_attempt_at)
            : Number.NEGATIVE_INFINITY
          const rightAttempt = right.last_reconcile_attempt_at
            ? Date.parse(right.last_reconcile_attempt_at)
            : Number.NEGATIVE_INFINITY
          if (leftAttempt !== rightAttempt) return leftAttempt - rightAttempt
          return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
        })
        .slice(0, limit)
      return mr(selected)
    }
    if (sql.includes('UPDATE payment_history') && sql.includes('last_reconcile_attempt_at = NOW()')) {
      const row = rows.find(candidate => candidate.id === String(params?.[0]))
      if (row) row.last_reconcile_attempt_at = new Date().toISOString()
      return mr([], 1)
    }
    return mr([])
  })
  check.mockResolvedValue({ status: 'pending' })

  const firstRun = await POST(request())
  expect(await firstRun.json()).toMatchObject({ scanned: 50, keptPending: 50 })
  check.mockClear()

  const secondRun = await POST(request())
  expect(await secondRun.json()).toMatchObject({ scanned: 50, keptPending: 50 })
  expect(check).toHaveBeenCalledTimes(50)
  expect(check).toHaveBeenCalledWith('synthetic-checkout-50')
})
