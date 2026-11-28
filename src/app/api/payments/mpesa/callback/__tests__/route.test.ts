/**
 * @jest-environment node
 *
 * Contract tests for the Daraja STK Push callback route.
 *
 * WHY CONTRACT TESTS: this route is the money path. It must behave
 * identically no matter how Safaricom delivers — success, user-cancelled,
 * amount-mismatch, missing metadata, or THE SAME CALLBACK TWICE (Daraja
 * retries). The fixtures in src/lib/payments/__tests__/fixtures/mpesa/ pin
 * the recorded payload shapes; these tests pin the ROUTE's side effects:
 * which SQL runs, in what transaction, and what gets credited.
 *
 * The guarantees pinned here (audit C-05, H-01):
 *   1. IP gate: only Safaricom IPs (rightmost XFF hop / CF-Connecting-IP)
 *   2. Success credits exactly once: intent completed + payment_history row
 *      (ON CONFLICT DO NOTHING) + user_subscriptions upsert, all in ONE
 *      transaction gated by a conditional UPDATE
 *   3. Double delivery is a no-op: early 'completed' exit, or the rowCount=0
 *      rollback path — never a double credit
 *   4. Amount verification FAILS CLOSED (mismatch / missing metadata →
 *      intent failed + fraudFlag, zero credits)
 *   5. Failure result codes fail the intent, credit nothing
 */
import type { NextRequest } from 'next/server'
import { makeRequest } from '@/test-utils/request'

jest.mock('@/lib/db', () => {
  const query = jest.fn()
  const getClient = jest.fn()
  const setCurrentRlsServiceRole = jest.fn()
  const setCurrentUserId = jest.fn()
  const setRlsContext = jest.fn().mockResolvedValue(undefined)
  return {
    __esModule: true,
    default: { query, getClient },
    db: { query, getClient },
    setCurrentRlsServiceRole,
    setCurrentUserId,
    setRlsContext,
  }
})
jest.mock('@/lib/payments/mpesa', () => {
  const actual = jest.requireActual('@/lib/payments/mpesa') as typeof import('@/lib/payments/mpesa')
  return {
    ...actual,
    getMpesaService: jest.fn(),
  }
})
jest.mock('@/lib/payments/receipt', () => ({
  sendPurchaseReceipt: jest.fn().mockResolvedValue({ sent: true }),
}))
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/email-templates/paymentReceipt', () => ({
  paymentReceiptEmail: { render: jest.fn(() => ({ subject: 's', html: 'h', text: 't' })) },
}))
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import { POST } from '../route'
import db, { setCurrentRlsServiceRole } from '@/lib/db'
import { getMpesaService } from '@/lib/payments/mpesa'
import { sendPurchaseReceipt } from '@/lib/payments/receipt'
import { sendEmail } from '@/lib/email'
import { mr } from '@/test-utils/mock-rows'
import successPayload from '@/lib/payments/__tests__/fixtures/mpesa/callback-success.json'
import amountMismatchPayload from '@/lib/payments/__tests__/fixtures/mpesa/callback-amount-mismatch.json'
import noMetadataPayload from '@/lib/payments/__tests__/fixtures/mpesa/callback-no-metadata.json'
import userCancelledPayload from '@/lib/payments/__tests__/fixtures/mpesa/callback-user-cancelled.json'

const mockDbQuery = db.query as jest.MockedFunction<typeof db.query>
const mockGetClient = db.getClient as jest.MockedFunction<typeof db.getClient>
const mockGetMpesaService = getMpesaService as jest.MockedFunction<typeof getMpesaService>
const mockSetCurrentRlsServiceRole = setCurrentRlsServiceRole as jest.MockedFunction<typeof setCurrentRlsServiceRole>
const mockSendPurchaseReceipt = jest.mocked(sendPurchaseReceipt)
const mockSendEmail = jest.mocked(sendEmail)

const SAFARICOM_IP = '196.201.214.200'
const USER_ID = '11111111-1111-1111-1111-111111111111'

function callbackRequest(payload: unknown, ip = SAFARICOM_IP, query = ''): NextRequest {
  const suffix = query ? `?${query}` : ''
  return makeRequest(`/api/payments/mpesa/callback${suffix}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': ip,
    },
    body: payload,
  }) as NextRequest
}

/** Real parseCallback implementation from the lib (pure function). */
const { MpesaService } = jest.requireActual('@/lib/payments/mpesa') as typeof import('@/lib/payments/mpesa')
const realService = new MpesaService({} as never)

beforeEach(() => {
  jest.clearAllMocks()
  // Route uses getMpesaService() for config presence + parseCallback.
  mockGetMpesaService.mockReturnValue(realService as never)
})

/**
 * SQL-aware transaction client mock: returns results by matching the SQL
 * text instead of call order (BEGIN/COMMIT consume results too, so naive
 * mockResolvedValueOnce sequencing shifts by one and breaks assertions).
 */
function txClient(opts: {
  claimRowCount?: number
  receiptEnrichmentRowCount?: number
  storedStatus?: string | null
  storedCheckoutRequestId?: string | null
  storedTransactionId?: string | null
} = {}) {
  type MockQueryResult = {
    rows: unknown[]
    command: string
    rowCount: number
    oid: number
    fields: Array<never>
  }
  const q = jest.fn<Promise<MockQueryResult>, [sql: string, params?: unknown[]]>().mockImplementation((sql) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return Promise.resolve(mr([]))
    }
    if (
      typeof sql === 'string' &&
      sql.includes('SELECT') &&
      sql.includes('FROM payment_history') &&
      sql.includes('FOR UPDATE')
    ) {
      return Promise.resolve(mr([{
        status: opts.storedStatus ?? 'completed',
        checkout_request_id: opts.storedCheckoutRequestId ?? 'ws_CO_191220191020363925',
        transaction_id: opts.storedTransactionId ?? null,
      }]))
    }
    if (
      typeof sql === 'string' &&
      sql.includes("status = 'completed'") &&
      sql.includes('transaction_id IS NULL')
    ) {
      return Promise.resolve({
        rows: [],
        rowCount: opts.receiptEnrichmentRowCount ?? 0,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      })
    }
    // Conditional claim UPDATEs: the rowCount IS the semantics
    // (1 = this call won the race, 0 = someone else already did it).
    if (
      typeof sql === 'string' &&
      (sql.includes("AND status <> 'completed'") ||
        sql.includes("AND status IN ('pending', 'processing')") ||
        sql.includes("AND status IN ('pending', 'processing', 'pending_review')") ||
        sql.includes("AND status = 'unclaimed_payment'") ||
        sql.includes("AND status = 'pending_review'"))
    ) {
      return Promise.resolve({
        rows: [],
        rowCount: opts.claimRowCount ?? 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      })
    }
    return Promise.resolve(mr([]))
  })
  const release = jest.fn()
  mockGetClient.mockResolvedValue({ query: q, release } as never)
  return q
}

describe('POST /api/payments/mpesa/callback — IP gate (C-05)', () => {
  test('rejects non-Safaricom IPs with 403 before touching the DB', async () => {
    const res = await POST(callbackRequest(successPayload, '1.2.3.4'))
    expect(res.status).toBe(403)
    expect(mockDbQuery).not.toHaveBeenCalled()
    expect(mockSetCurrentRlsServiceRole).not.toHaveBeenCalled()
  })

  test('rejects requests with spoofed XFF chains — rightmost hop wins', async () => {
    // Attacker sets XFF: "196.201.214.200, 1.2.3.4" — behind an appending
    // proxy the LAST hop (1.2.3.4) is what our proxy observed. CF header
    // absent in this request shape: use x-forwarded-for instead.
    const req = makeRequest('/api/payments/mpesa/callback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `${SAFARICOM_IP}, 1.2.3.4`,
      },
      body: successPayload,
    }) as NextRequest
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/payments/mpesa/callback — provider RLS context', () => {
  test('sets the provider role before the first payment lookup and uses only scoped unified lookups', async () => {
    mockDbQuery.mockResolvedValue(mr([]))

    const res = await POST(callbackRequest(successPayload))

    expect(res.status).toBe(404)
    expect(mockSetCurrentRlsServiceRole).toHaveBeenCalledWith('payment_provider')
    expect(mockSetCurrentRlsServiceRole.mock.invocationCallOrder[0]).toBeLessThan(
      mockDbQuery.mock.invocationCallOrder[0],
    )

    const historyLookups = mockDbQuery.mock.calls.filter(([sql]) =>
      sql.includes('FROM payment_history'),
    )
    expect(historyLookups.length).toBeGreaterThan(0)
    for (const [sql] of historyLookups) {
      expect(sql).toMatch(/WHERE[\s\S]*(checkout_request_id\s*=\s*\$1|id\s*=\s*\$1)/i)
      expect(sql).not.toMatch(/WHERE\s+payment_method\s*=\s*'mpesa'\s*$/i)
    }
    expect(historyLookups[0]?.[0]).not.toContain('LIMIT 1')
  })

  test('fails closed when more than one unified checkout carries the same provider identity', async () => {
    const duplicate = {
      id: 'history-1',
      user_id: USER_ID,
      plan_id: 'pro',
      amount: 500,
      currency: 'KES',
      status: 'pending',
      checkout_request_id: 'ws_CO_191220191020363925',
      phone_number: '254708374149',
      metadata: { seatCount: 1, extraSeats: 0 },
    }
    mockDbQuery
      .mockResolvedValueOnce(mr([]))
      .mockResolvedValueOnce(mr([duplicate, { ...duplicate, id: 'history-2' }]))

    const res = await POST(callbackRequest(successPayload))

    expect(res.status).toBe(409)
    expect(mockGetClient).not.toHaveBeenCalled()
  })

  test('fails closed when duplicate legacy intents carry the same provider identity', async () => {
    const duplicate = {
      id: 'intent-1',
      user_id: USER_ID,
      plan_id: 'pro',
      amount: 500,
      currency: 'KES',
      status: 'pending',
      checkout_request_id: 'ws_CO_191220191020363925',
    }
    mockDbQuery.mockResolvedValueOnce(
      mr([duplicate, { ...duplicate, id: 'intent-2' }]),
    )
    const clientQuery = txClient({ claimRowCount: 1 })

    const res = await POST(callbackRequest(successPayload))

    expect(res.status).toBe(409)
    expect(mockGetClient).not.toHaveBeenCalled()
    expect(clientQuery.mock.calls).toHaveLength(0)
    expect(mockSendPurchaseReceipt).not.toHaveBeenCalled()
    expect(mockDbQuery.mock.calls.some(([sql]) =>
      sql.includes('UPDATE payment_intents') ||
      sql.includes('INSERT INTO payment_history') ||
      sql.includes('user_subscriptions')
    )).toBe(false)
  })
})

describe('POST /api/payments/mpesa/callback — success path credits exactly once', () => {
  test('completes the intent, writes payment_history, upserts user_subscriptions in ONE transaction', async () => {
    mockDbQuery
      .mockResolvedValueOnce(
        mr([
          {
            id: 'intent-1',
            user_id: USER_ID,
            plan_id: 'pro',
            amount: 500,
            currency: 'KES',
            status: 'pending',
          },
        ])
      ) // intent lookup by CheckoutRequestID
      .mockResolvedValue(mr([])) // receipt email user lookup (no email)

    const clientQuery = txClient({ claimRowCount: 1 }) // WE win the race

    const res = await POST(callbackRequest(successPayload))
    expect(res.status).toBe(200)
    expect(mockSetCurrentRlsServiceRole).toHaveBeenCalledWith('payment_provider')

    // Transaction ordering: BEGIN → conditional UPDATE ... WHERE status <> 'completed'
    const beginIdx = clientQuery.mock.calls.findIndex((c) => c[0] === 'BEGIN')
    const commitIdx = clientQuery.mock.calls.findIndex((c) => c[0] === 'COMMIT')
    expect(beginIdx).toBeGreaterThanOrEqual(0)
    expect(commitIdx).toBeGreaterThan(beginIdx)

    const completeCall = clientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes("SET status = 'completed'") && sql.includes("AND status IN ('pending', 'processing')")
    )
    expect(completeCall).toBeDefined()

    const historyCall = clientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO payment_history') && sql.includes('ON CONFLICT (provider_id) DO NOTHING')
    )
    expect(historyCall).toBeDefined()
    // payment_history carries the real paid amount + receipt number
    expect(historyCall?.[1]).toContain(500)
    expect(historyCall?.[1]).toContain('NLJ7RT61SV')

    const subCall = clientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO user_subscriptions')
    )
    expect(subCall).toBeDefined()
    expect(mockSendPurchaseReceipt).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      planId: 'pro',
      amount: 500,
      currency: 'KES',
      transactionId: 'NLJ7RT61SV',
      paymentMethod: 'mpesa',
    }))
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  test('completes the current payment_history checkout and grants its purchased extra seats', async () => {
    const teamSuccessPayload = JSON.parse(JSON.stringify(successPayload)) as typeof successPayload
    teamSuccessPayload.Body.stkCallback.CallbackMetadata.Item[0].Value = 6000
    mockDbQuery
      .mockResolvedValueOnce(mr([])) // no legacy payment_intent for this checkout
      .mockResolvedValueOnce(mr([
        {
          id: 'history-1',
          user_id: USER_ID,
          plan_id: 'team',
          amount: 6000,
          currency: 'KES',
          status: 'pending',
          checkout_request_id: 'ws_CO_191220191020363925',
          phone_number: '254708374149',
          metadata: { seatCount: 4, extraSeats: 1 },
        },
      ])) // current unified checkout row
      .mockResolvedValue(mr([])) // receipt email lookup

    const clientQuery = txClient({ claimRowCount: 1 })
    const res = await POST(callbackRequest(teamSuccessPayload))

    expect(res.status).toBe(200)
    const completion = clientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE payment_history') && sql.includes("status IN ('pending', 'processing', 'pending_review')")
    )
    expect(completion?.[1]).toContain('NLJ7RT61SV')
    expect(completion?.[0]).toContain('checkout_request_id')
    expect(clientQuery.mock.calls.some(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO payment_history'))).toBe(false)

    const subscriptionInsert = clientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO user_subscriptions') && sql.includes('seat_count')
    )
    expect(subscriptionInsert?.[1]).toContain(1)
    expect(mockSendPurchaseReceipt).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      planId: 'team',
      amount: 6000,
      currency: 'KES',
      transactionId: 'NLJ7RT61SV',
      paymentMethod: 'mpesa',
      paymentId: 'history-1',
    }))
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
  test('recovers a provider-accepted checkout by atomically binding the server payment id', async () => {
    const paymentId = '90000000-0000-4000-8000-000000000301'
    const stored = {
      id: paymentId,
      user_id: USER_ID,
      plan_id: 'pro',
      amount: 500,
      currency: 'KES',
      status: 'pending',
      checkout_request_id: 'ws_CO_191220191020363925',
      phone_number: '254708374149',
      transaction_id: null,
      metadata: { seatCount: 1, extraSeats: 0 },
    }
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM payment_intents')) return mr([])
      if (sql.includes('FROM payment_history')) return mr([])
      if (
        sql.includes('UPDATE payment_history') &&
        sql.includes('checkout_request_id = $1') &&
        sql.includes('RETURNING')
      ) {
        return mr([stored])
      }
      return mr([])
    })

    const clientQuery = txClient({ claimRowCount: 1 })
    const res = await POST(callbackRequest(
      successPayload,
      SAFARICOM_IP,
      `paymentId=${paymentId}&planId=enterprise&amount=1&phoneNumber=254700000000`,
    ))

    expect(res.status).toBe(200)
    const binding = mockDbQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE payment_history') &&
      sql.includes('checkout_request_id = $1') &&
      sql.includes('RETURNING'),
    )
    expect(binding?.[0]).toContain('checkout_request_id IS NULL')
    expect(binding?.[0]).toContain("status IN ('pending', 'processing', 'pending_review')")
    expect(binding?.[1]).toContain('ws_CO_191220191020363925')
    expect(binding?.[1]).toContain(paymentId)

    const subscriptionInsert = clientQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO user_subscriptions'),
    )
    expect(subscriptionInsert?.[1]).toContain('pro')
    expect(subscriptionInsert?.[1]).not.toContain('enterprise')
  })

  test('keeps an unknown callback result code pending and retains diagnostics without failing the row', async () => {
    const unknownResultPayload = JSON.parse(JSON.stringify(successPayload)) as typeof successPayload
    unknownResultPayload.Body.stkCallback.ResultCode = 1001
    unknownResultPayload.Body.stkCallback.ResultDesc = 'Synthetic retryable provider result'
    mockDbQuery
      .mockResolvedValueOnce(mr([]))
      .mockResolvedValueOnce(mr([
        {
          id: 'history-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'pending',
          checkout_request_id: 'ws_CO_191220191020363925',
          phone_number: '254708374149',
          metadata: { seatCount: 1, extraSeats: 0 },
        },
      ]))

    const res = await POST(callbackRequest(unknownResultPayload))

    expect(res.status).toBe(200)
    expect(mockDbQuery.mock.calls.some(([sql]) =>
      sql.includes('UPDATE payment_history') && sql.includes("status = 'failed'")
    )).toBe(false)
    expect(mockDbQuery.mock.calls.some(([sql, params]) =>
      sql.includes('UPDATE payment_history') && JSON.stringify(params).includes('1001')
    )).toBe(true)
    expect(mockGetClient).not.toHaveBeenCalled()
  })

  test('a unified callback phone mismatch is retained for review and never activates', async () => {
    mockDbQuery
      .mockResolvedValueOnce(mr([])) // no legacy payment_intent for this checkout
      .mockResolvedValueOnce(mr([
        {
          id: 'history-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'pending',
          checkout_request_id: 'ws_CO_191220191020363925',
          phone_number: '254700000000',
          metadata: { seatCount: 1, extraSeats: 0 },
        },
      ]))
      .mockResolvedValue(mr([]))

    const clientQuery = txClient({ claimRowCount: 1 })
    const res = await POST(callbackRequest(successPayload))

    expect(res.status).toBe(200)
    const reviewUpdate = mockDbQuery.mock.calls.find(([sql, params]) =>
      typeof sql === 'string' &&
      sql.includes("status = 'pending_review'") &&
      JSON.stringify(params).includes('phone_mismatch')
    )
    expect(reviewUpdate).toBeDefined()
    expect(mockGetClient).not.toHaveBeenCalled()
    expect(clientQuery.mock.calls.some(([sql]) => typeof sql === 'string' && sql.includes('user_subscriptions'))).toBe(false)
  })

  test('a real receipt arriving after polling completion enriches the receipt without reactivating', async () => {
    mockDbQuery
      .mockResolvedValueOnce(mr([])) // no legacy payment_intent for this checkout
      .mockResolvedValueOnce(mr([
        {
          id: 'history-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'completed',
          checkout_request_id: 'ws_CO_191220191020363925',
          phone_number: '254708374149',
          transaction_id: null,
          metadata: { seatCount: 1, extraSeats: 0 },
        },
      ]))
      .mockResolvedValue(mr([]))

    const clientQuery = txClient({ claimRowCount: 0, receiptEnrichmentRowCount: 1 })
    const res = await POST(callbackRequest(successPayload))

    expect(res.status).toBe(200)
    expect(mockGetClient).toHaveBeenCalledTimes(1)
    const enrichment = clientQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' &&
      sql.includes('UPDATE payment_history') &&
      sql.includes("status = 'completed'") &&
      sql.includes('transaction_id IS NULL')
    )
    expect(enrichment).toBeDefined()
    expect(enrichment?.[1]).toContain('NLJ7RT61SV')
    expect(clientQuery.mock.calls.some(([sql]) => typeof sql === 'string' && sql.includes('user_subscriptions'))).toBe(false)
    expect(mockSendPurchaseReceipt).not.toHaveBeenCalled()
  })
})

describe('POST /api/payments/mpesa/callback — DOUBLE DELIVERY (H-01 idempotency)', () => {
  test('early exit: already-completed intent returns ok without a transaction', async () => {
    mockDbQuery.mockResolvedValueOnce(
      mr([
        {
          id: 'intent-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'completed',
        },
      ])
    )

    const res = await POST(callbackRequest(successPayload))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })
    // No transaction was started — nothing re-credited
    expect(mockGetClient).not.toHaveBeenCalled()
  })

  test('race loser: conditional UPDATE affects 0 rows → ROLLBACK, ok, no credit', async () => {
    mockDbQuery.mockResolvedValueOnce(
      mr([
        {
          id: 'intent-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'processing',
        },
      ])
    )

    const clientQuery = txClient({ claimRowCount: 0 }) // someone else already completed it

    const res = await POST(callbackRequest(successPayload))
    expect(res.status).toBe(200)

    const rolledBack = clientQuery.mock.calls.some((c) => c[0] === 'ROLLBACK')
    expect(rolledBack).toBe(true)
    // Crucially: NO payment_history insert, NO subscription write happened
    const historyCall = clientQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO payment_history')
    )
    expect(historyCall).toBeUndefined()
  })
})

describe('POST /api/payments/mpesa/callback — amount verification fails CLOSED (C-05)', () => {
  test('paid amount ≠ plan price → intent failed with fraudFlag, nothing credited', async () => {
    mockDbQuery.mockResolvedValueOnce(
      mr([
        {
          id: 'intent-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'pending',
        },
      ])
    )

    const res = await POST(callbackRequest(amountMismatchPayload))
    expect(res.status).toBe(200)

    const failCall = mockDbQuery.mock.calls.find(
      ([sql, params]) =>
        typeof sql === 'string' &&
        sql.includes("SET status = 'failed'") &&
        JSON.stringify(params).includes('amount_mismatch')
    )
    expect(failCall).toBeDefined()
    // No transaction → no credit
    expect(mockGetClient).not.toHaveBeenCalled()
  })

  test('callback with NO metadata (paidAmount 0) fails closed — the pre-C-05 hole', async () => {
    mockDbQuery.mockResolvedValueOnce(
      mr([
        {
          id: 'intent-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'pending',
        },
      ])
    )

    const res = await POST(callbackRequest(noMetadataPayload))
    expect(res.status).toBe(200)

    const failCall = mockDbQuery.mock.calls.find(
      ([sql, params]) =>
        typeof sql === 'string' &&
        sql.includes("SET status = 'failed'") &&
        JSON.stringify(params).includes('missing_callback_metadata')
    )
    expect(failCall).toBeDefined()
    expect(mockGetClient).not.toHaveBeenCalled()
  })
  test('a legacy intent with a stored phone rejects a mismatched callback phone', async () => {
    mockDbQuery.mockResolvedValueOnce(
      mr([
        {
          id: 'intent-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'pending',
          phone_number: '254700000000',
        },
      ])
    )

    const res = await POST(callbackRequest(successPayload))

    expect(res.status).toBe(200)
    const failCall = mockDbQuery.mock.calls.find(([sql, params]) =>
      typeof sql === 'string' &&
      sql.includes("SET status = 'failed'") &&
      JSON.stringify(params).includes('phone_mismatch')
    )
    expect(failCall).toBeDefined()
    expect(mockGetClient).not.toHaveBeenCalled()
  })

  test('a legacy intent with a stored phone rejects callback evidence without a phone', async () => {
    const missingPhonePayload = JSON.parse(JSON.stringify(successPayload)) as typeof successPayload
    missingPhonePayload.Body.stkCallback.CallbackMetadata.Item =
      missingPhonePayload.Body.stkCallback.CallbackMetadata.Item.filter(
        item => item.Name !== 'PhoneNumber',
      )
    mockDbQuery.mockResolvedValueOnce(
      mr([
        {
          id: 'intent-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'pending',
          phone_number: '254708374149',
        },
      ])
    )

    const res = await POST(callbackRequest(missingPhonePayload))

    expect(res.status).toBe(200)
    const failCall = mockDbQuery.mock.calls.find(([sql, params]) =>
      typeof sql === 'string' &&
      sql.includes("SET status = 'failed'") &&
      JSON.stringify(params).includes('missing_phone')
    )
    expect(failCall).toBeDefined()
    expect(mockGetClient).not.toHaveBeenCalled()
  })
  test('a legacy callback without a real Safaricom receipt fails closed', async () => {
    const missingReceiptPayload = JSON.parse(JSON.stringify(successPayload)) as typeof successPayload
    missingReceiptPayload.Body.stkCallback.CallbackMetadata.Item =
      missingReceiptPayload.Body.stkCallback.CallbackMetadata.Item.filter(
        item => item.Name !== 'MpesaReceiptNumber',
      )
    mockDbQuery.mockResolvedValueOnce(
      mr([
        {
          id: 'intent-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'pending',
        },
      ])
    )

    const res = await POST(callbackRequest(missingReceiptPayload))

    expect(res.status).toBe(200)
    const failCall = mockDbQuery.mock.calls.find(([sql, params]) =>
      typeof sql === 'string' &&
      sql.includes("SET status = 'failed'") &&
      JSON.stringify(params).includes('missing_receipt')
    )
    expect(failCall).toBeDefined()
    expect(mockGetClient).not.toHaveBeenCalled()
  })

  test('a legacy contact-sales plan fails closed without activating entitlement', async () => {
    mockDbQuery.mockResolvedValueOnce(
      mr([
        {
          id: 'intent-1',
          user_id: USER_ID,
          plan_id: 'enterprise',
          amount: 500,
          currency: 'KES',
          status: 'pending',
        },
      ])
    )

    const res = await POST(callbackRequest(successPayload))

    expect(res.status).toBe(200)
    const failCall = mockDbQuery.mock.calls.find(([sql, params]) =>
      typeof sql === 'string' &&
      sql.includes("SET status = 'failed'") &&
      JSON.stringify(params).includes('invalid_plan')
    )
    expect(failCall).toBeDefined()
    expect(mockGetClient).not.toHaveBeenCalled()
  })
})

describe('POST /api/payments/mpesa/callback — legacy terminal status guard', () => {
  test.each([
    ['failure evidence', userCancelledPayload],
    ['amount-mismatch evidence', amountMismatchPayload],
  ])('%s cannot flip a concurrently completed legacy intent to failed', async (_label, payload) => {
    let storedStatus = 'completed'
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM payment_intents')) {
        return mr([{
          id: 'intent-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'processing',
        }])
      }
      if (sql.includes('UPDATE payment_intents') && sql.includes("status = 'failed'")) {
        if (
          sql.includes("status IN ('pending', 'processing')") &&
          storedStatus === 'completed'
        ) {
          return mr([], 0)
        }
        storedStatus = 'failed'
        return mr([], 1)
      }
      return mr([])
    })

    const res = await POST(callbackRequest(payload))

    expect(res.status).toBe(200)
    expect(storedStatus).toBe('completed')
  })
})

describe('POST /api/payments/mpesa/callback — user-cancelled callbacks', () => {
  test('non-zero ResultCode fails the intent, credits nothing, returns ok', async () => {
    mockDbQuery.mockResolvedValueOnce(
      mr([
        {
          id: 'intent-1',
          user_id: USER_ID,
          plan_id: 'pro',
          amount: 500,
          currency: 'KES',
          status: 'processing',
        },
      ])
    )

    const res = await POST(callbackRequest(userCancelledPayload))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })

    const failCall = mockDbQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes("SET status = 'failed'")
    )
    expect(failCall).toBeDefined()
    expect(mockGetClient).not.toHaveBeenCalled()
  })
})

describe('POST /api/payments/mpesa/callback — payload validation', () => {
  test('missing CheckoutRequestID → 400', async () => {
    const res = await POST(callbackRequest({ Body: { stkCallback: {} } }))
    expect(res.status).toBe(400)
  })

  test('unknown CheckoutRequestID → 404, no credit', async () => {
    mockDbQuery.mockResolvedValueOnce(mr([]))
    const res = await POST(callbackRequest(successPayload))
    expect(res.status).toBe(404)
    expect(mockGetClient).not.toHaveBeenCalled()
  })

  test('M-Pesa unconfigured → 500', async () => {
    mockGetMpesaService.mockReturnValue(null)
    const res = await POST(callbackRequest(successPayload))
    expect(res.status).toBe(500)
  })
})
