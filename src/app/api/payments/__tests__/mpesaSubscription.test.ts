/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
import type { ApiHandlerContext } from '@/lib/apiHandler'
import { MpesaProviderError } from '@/lib/payments/mpesa'
import { sendPurchaseReceipt } from '@/lib/payments/receipt'

const PAYMENT_ID = '90000000-0000-4000-8000-000000000201'
const USER_ID = '90000000-0000-4000-8000-000000000202'
const CHECKOUT_REQUEST_ID = 'ws_CO_27112712000000201'

const mockDbQuery = jest.fn<Promise<{ rows: unknown[]; rowCount?: number }>, [string, unknown[]?]>()
const mockInitiateSTKPush = jest.fn<Promise<{ checkoutRequestId: string; responseCode: string }>, [unknown]>()
const mockCheckTransactionStatus = jest.fn<Promise<{
  status: string
  amount?: number
  phone?: string
  resultCode?: number
  resultDesc?: string
}>, [string]>()
const mockCompleteMpesaPayment = jest.fn<Promise<unknown>, [unknown]>()
const mockSendPurchaseReceipt = jest.mocked(sendPurchaseReceipt)

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
}))
jest.mock('@/lib/db', () => ({
  db: { query: (query: string, values?: unknown[]) => mockDbQuery(query, values) },
}))
jest.mock('@/lib/site', () => ({ getPublicAppUrl: () => 'https://metardu.space' }))
jest.mock('@/lib/payments/paypal', () => ({
  getPayPalService: () => null,
  getPayPalPlanId: () => null,
  resolvePayPalCurrency: () => 'USD',
}))
jest.mock('@/lib/payments/mpesa', () => {
  const actual = jest.requireActual('@/lib/payments/mpesa') as typeof import('@/lib/payments/mpesa')
  return {
    ...actual,
    getMpesaService: () => ({
      initiateSTKPush: (input: unknown) => mockInitiateSTKPush(input),
      checkTransactionStatus: (checkoutRequestId: string) => mockCheckTransactionStatus(checkoutRequestId),
    }),
  }
})
jest.mock('@/lib/payments/mpesaCompletion', () => ({
  completeMpesaPayment: (input: unknown) => mockCompleteMpesaPayment(input),
}))
jest.mock('@/lib/payments/receipt', () => ({
  sendPurchaseReceipt: jest.fn().mockResolvedValue({ sent: true }),
}))

import { POST } from '../route'

function context(body: Record<string, unknown>): ApiHandlerContext {
  return { body, userId: USER_ID, session: null, params: {} }
}

async function post(body: Record<string, unknown>): Promise<NextResponse> {
  const handler = POST as unknown as (
    req: NextRequest,
    ctx: ApiHandlerContext,
  ) => Promise<NextResponse>
  return handler(
    new NextRequest('https://metardu.space/api/payments', { method: 'POST' }),
    context(body),
  )
}

function pendingPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ID,
    user_id: USER_ID,
    plan_id: 'pro',
    amount: 2500,
    currency: 'KES',
    status: 'pending',
    checkout_request_id: CHECKOUT_REQUEST_ID,
    phone_number: '254712345678',
    transaction_id: null,
    metadata: { seatCount: 1, extraSeats: 0 },
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDbQuery.mockImplementation(async (query: string) => {
    if (query.includes('INSERT INTO payment_history')) return { rows: [{ id: PAYMENT_ID }], rowCount: 1 }
    return { rows: [], rowCount: 1 }
  })
  mockInitiateSTKPush.mockResolvedValue({
    checkoutRequestId: CHECKOUT_REQUEST_ID,
    responseCode: '0',
  })
  mockCompleteMpesaPayment.mockResolvedValue({
    outcome: 'completed',
    activated: true,
    receiptNumber: null,
    receiptEnriched: false,
  })
})

describe('POST /api/payments M-Pesa subscription start', () => {
  it('stores the normalized initiating phone and immutable checkout identity', async () => {
    const response = await post({
      provider: 'mpesa',
      action: 'start-subscription',
      planId: 'pro',
      currency: 'KES',
      countryCode: 'KE',
      seatCount: 1,
      phoneNumber: '0712345678',
    })

    expect(response.status).toBe(200)
    const insert = mockDbQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO payment_history'))
    expect(insert?.[0]).toContain('checkout_request_id')
    expect(insert?.[0]).toContain('phone_number')
    expect(insert?.[1]).toContain('254712345678')

    const checkoutUpdate = mockDbQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE payment_history') && sql.includes('checkout_request_id')
    )
    expect(checkoutUpdate?.[0]).not.toMatch(/transaction_id\s*=/i)
    expect(checkoutUpdate?.[1]).toContain(CHECKOUT_REQUEST_ID)
  })

  it('rejects a malformed Kenyan phone before writing a row or calling Daraja', async () => {
    const response = await post({
      provider: 'mpesa',
      action: 'start-subscription',
      planId: 'pro',
      currency: 'KES',
      countryCode: 'KE',
      seatCount: 1,
      phoneNumber: '07123',
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'MPESA_INVALID_PHONE' })
    expect(mockDbQuery).not.toHaveBeenCalled()
    expect(mockInitiateSTKPush).not.toHaveBeenCalled()
  })

  it('marks the pending row failed when Daraja rejects the STK push', async () => {
    mockInitiateSTKPush.mockRejectedValue(new MpesaProviderError())

    await expect(post({
      provider: 'mpesa',
      action: 'start-subscription',
      planId: 'pro',
      currency: 'KES',
      countryCode: 'KE',
      seatCount: 1,
      phoneNumber: '0712345678',
    })).rejects.toMatchObject({ statusCode: 502, code: 'MPESA_UNAVAILABLE' })

    expect(mockDbQuery.mock.calls.some(([sql]) =>
      sql.includes('UPDATE payment_history') && sql.includes("status = 'failed'")
    )).toBe(true)
  })

  it('keeps a provider-accepted checkout pending and recoverable when identity persistence fails', async () => {
    mockDbQuery.mockImplementation(async (query: string) => {
      if (query.includes('INSERT INTO payment_history')) {
        return { rows: [{ id: PAYMENT_ID }], rowCount: 1 }
      }
      if (query.includes('SET checkout_request_id = $1')) {
        throw new Error('synthetic identity persistence failure')
      }
      return { rows: [], rowCount: 1 }
    })

    let response: NextResponse | undefined
    let thrown: unknown
    try {
      response = await post({
        provider: 'mpesa',
        action: 'start-subscription',
        planId: 'pro',
        currency: 'KES',
        countryCode: 'KE',
        seatCount: 1,
        phoneNumber: '0712345678',
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeUndefined()
    expect(response).toBeDefined()
    expect(response?.status).toBe(202)
    expect(await response?.json()).toMatchObject({
      kind: 'mpesa',
      provider: 'mpesa',
      paymentId: PAYMENT_ID,
      checkoutRequestId: CHECKOUT_REQUEST_ID,
      status: 'pending',
    })
    expect(mockDbQuery.mock.calls.some(([sql]) =>
      sql.includes('UPDATE payment_history') && sql.includes("status = 'failed'")
    )).toBe(false)
  })
})

describe('POST /api/payments M-Pesa status polling', () => {
  it('queries Daraja with the stored checkout identity and completes from validated evidence', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [pendingPayment()], rowCount: 1 })
    mockCheckTransactionStatus.mockResolvedValue({
      status: 'completed',
      amount: 2500,
      phone: '254712345678',
      resultCode: 0,
    })

    const response = await post({
      provider: 'mpesa',
      action: 'check-status',
      paymentId: PAYMENT_ID,
      checkoutRequestId: CHECKOUT_REQUEST_ID,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'completed' })
    expect(mockCheckTransactionStatus).toHaveBeenCalledWith(CHECKOUT_REQUEST_ID)
    expect(mockCompleteMpesaPayment).toHaveBeenCalledWith(expect.objectContaining({
      record: expect.objectContaining({ checkout_request_id: CHECKOUT_REQUEST_ID }) as unknown,
      evidence: expect.objectContaining({
        source: 'polling',
        checkoutRequestId: CHECKOUT_REQUEST_ID,
        amount: 2500,
        phone: '254712345678',
      }) as unknown,
    }))
    expect(mockSendPurchaseReceipt).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      planId: 'pro',
      amount: 2500,
      currency: 'KES',
      paymentMethod: 'mpesa',
      paymentId: PAYMENT_ID,
    }))
  })

  it('normalizes a numeric database amount before shared completion validation', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [pendingPayment({ amount: '2500' })],
      rowCount: 1,
    })
    mockCheckTransactionStatus.mockResolvedValue({
      status: 'completed',
      amount: 2500,
      phone: '254712345678',
      resultCode: 0,
    })

    const response = await post({
      provider: 'mpesa',
      action: 'check-status',
      paymentId: PAYMENT_ID,
      checkoutRequestId: CHECKOUT_REQUEST_ID,
    })

    expect(response.status).toBe(200)
    expect(mockCompleteMpesaPayment).toHaveBeenCalledWith(expect.objectContaining({
      record: expect.objectContaining({ amount: 2500 }) as unknown,
    }))
  })

  it('rejects a client checkout assertion that differs from the stored identity', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [pendingPayment()], rowCount: 1 })

    const response = await post({
      provider: 'mpesa',
      action: 'check-status',
      paymentId: PAYMENT_ID,
      checkoutRequestId: 'ws_CO_client_supplied',
    })

    expect(response.status).toBe(400)
    expect(mockCheckTransactionStatus).not.toHaveBeenCalled()
    expect(mockCompleteMpesaPayment).not.toHaveBeenCalled()
  })

  it('does not complete an amount mismatch and leaves the row reviewable', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [pendingPayment()], rowCount: 1 })
    mockCheckTransactionStatus.mockResolvedValue({
      status: 'completed',
      amount: 1,
      phone: '254712345678',
      resultCode: 0,
    })
    mockCompleteMpesaPayment.mockResolvedValue({
      outcome: 'rejected',
      reason: 'amount_mismatch',
    })

    const response = await post({
      provider: 'mpesa',
      action: 'check-status',
      paymentId: PAYMENT_ID,
      checkoutRequestId: CHECKOUT_REQUEST_ID,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'pending' })
    expect(mockDbQuery.mock.calls.some(([sql, params]) =>
      sql.includes("status = 'pending_review'") && JSON.stringify(params).includes('amount_mismatch')
    )).toBe(true)
  })

  it('does not complete a provider phone mismatch', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [pendingPayment()], rowCount: 1 })
    mockCheckTransactionStatus.mockResolvedValue({
      status: 'completed',
      amount: 2500,
      phone: '254700000000',
      resultCode: 0,
    })
    mockCompleteMpesaPayment.mockResolvedValue({
      outcome: 'rejected',
      reason: 'phone_mismatch',
    })

    const response = await post({
      provider: 'mpesa',
      action: 'check-status',
      paymentId: PAYMENT_ID,
      checkoutRequestId: CHECKOUT_REQUEST_ID,
    })

    expect(await response.json()).toEqual({ status: 'pending' })
    expect(mockDbQuery.mock.calls.some(([sql, params]) =>
      sql.includes("status = 'pending_review'") && JSON.stringify(params).includes('phone_mismatch')
    )).toBe(true)
    expect(mockSendPurchaseReceipt).not.toHaveBeenCalled()
  })

  it('maps a provider query failure to a safe 502 without raw provider text', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [pendingPayment()], rowCount: 1 })
    mockCheckTransactionStatus.mockRejectedValue(new Error('raw Daraja payload'))

    let thrown: unknown
    try {
      await post({
        provider: 'mpesa',
        action: 'check-status',
        paymentId: PAYMENT_ID,
        checkoutRequestId: CHECKOUT_REQUEST_ID,
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({ statusCode: 502, code: 'MPESA_UNAVAILABLE' })
    expect((thrown as Error).message).not.toContain('raw Daraja payload')
  })

  it('never defaults a missing stored plan to Pro', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [pendingPayment({ plan_id: null })], rowCount: 1 })
    mockCheckTransactionStatus.mockResolvedValue({
      status: 'completed',
      amount: 2500,
      phone: '254712345678',
      resultCode: 0,
    })
    mockCompleteMpesaPayment.mockResolvedValue({
      outcome: 'rejected',
      reason: 'missing_plan',
    })

    const response = await post({
      provider: 'mpesa',
      action: 'check-status',
      paymentId: PAYMENT_ID,
      checkoutRequestId: CHECKOUT_REQUEST_ID,
    })

    expect(await response.json()).toEqual({ status: 'pending' })
    expect(mockDbQuery.mock.calls.some(([sql, params]) =>
      sql.includes("status = 'pending_review'") && JSON.stringify(params).includes('missing_plan')
    )).toBe(true)
    expect(mockSendPurchaseReceipt).not.toHaveBeenCalled()
    expect(mockCompleteMpesaPayment).toHaveBeenCalledWith(expect.objectContaining({
      record: expect.objectContaining({ plan_id: null }) as unknown,
    }))
  })

  it('keeps an unknown Daraja result code pending instead of terminally failing the checkout', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [pendingPayment()], rowCount: 1 })
    mockCheckTransactionStatus.mockResolvedValue({
      status: 'failed',
      resultCode: 1001,
      resultDesc: 'Synthetic retryable provider result',
    })

    const response = await post({
      provider: 'mpesa',
      action: 'check-status',
      paymentId: PAYMENT_ID,
      checkoutRequestId: CHECKOUT_REQUEST_ID,
    })

    expect(await response.json()).toEqual({ status: 'pending' })
    expect(mockCompleteMpesaPayment).not.toHaveBeenCalled()
    expect(mockDbQuery.mock.calls.some(([sql]) =>
      sql.includes('UPDATE payment_history') && sql.includes("status = 'failed'")
    )).toBe(false)
  })

  it('reports the authoritative failed status when the shared claim misses a row that became failed', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [pendingPayment()], rowCount: 1 })
    mockCheckTransactionStatus.mockResolvedValue({
      status: 'completed',
      amount: 2500,
      phone: '254712345678',
      resultCode: 0,
    })
    mockCompleteMpesaPayment.mockResolvedValue({
      outcome: 'not_completed',
      activated: false,
      status: 'failed',
      receiptNumber: null,
      receiptEnriched: false,
    })

    const response = await post({
      provider: 'mpesa',
      action: 'check-status',
      paymentId: PAYMENT_ID,
      checkoutRequestId: CHECKOUT_REQUEST_ID,
    })

    expect(await response.json()).toEqual({ status: 'failed' })
    expect(mockSendPurchaseReceipt).not.toHaveBeenCalled()
  })

  it('maps a definitive Daraja failure to failed', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [pendingPayment()], rowCount: 1 })
    mockCheckTransactionStatus.mockResolvedValue({
      status: 'failed',
      resultCode: 1032,
      resultDesc: 'Request cancelled by user',
    })

    const response = await post({
      provider: 'mpesa',
      action: 'check-status',
      paymentId: PAYMENT_ID,
      checkoutRequestId: CHECKOUT_REQUEST_ID,
    })

    expect(await response.json()).toEqual({ status: 'failed' })
    expect(mockCompleteMpesaPayment).not.toHaveBeenCalled()
    expect(mockDbQuery.mock.calls.some(([sql]) =>
      sql.includes('UPDATE payment_history') && sql.includes("status = 'failed'")
    )).toBe(true)
  })

  it('reports the authoritative completed status when a definitive failure races with callback completion', async () => {
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, user_id, plan_id, currency, amount, status')) {
        return { rows: [pendingPayment()], rowCount: 1 }
      }
      if (sql.includes("SET status = 'failed'")) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('SELECT status')) {
        return { rows: [{ status: 'completed' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 1 }
    })
    mockCheckTransactionStatus.mockResolvedValue({
      status: 'failed',
      resultCode: 1032,
      resultDesc: 'Request cancelled by user',
    })

    const response = await post({
      provider: 'mpesa',
      action: 'check-status',
      paymentId: PAYMENT_ID,
      checkoutRequestId: CHECKOUT_REQUEST_ID,
    })

    expect(await response.json()).toEqual({ status: 'completed' })
    expect(mockSendPurchaseReceipt).not.toHaveBeenCalled()
  })
})
