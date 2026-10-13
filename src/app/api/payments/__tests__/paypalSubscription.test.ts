/** @jest-environment node */

import { NextRequest, type NextResponse } from 'next/server'
import type { ApiHandlerContext } from '@/lib/apiHandler'
import { getTotalPrice } from '@/lib/subscription/catalog'
import type { PayPalBillingPlanDetails } from '@/lib/payments/paypalPlanValidation'

const PAYMENT_ID = '90000000-0000-4000-8000-000000000001'
const USER_ID = '90000000-0000-4000-8000-000000000002'
const PAYPAL_PLAN_ID = 'P-METARDU-PRO-USD'

type MockPayPalService = {
  getBillingPlan: (planId: string) => Promise<PayPalBillingPlanDetails>
  createSubscription: (
    planId: string,
    subscriber: { email: string },
    callbacks: { returnUrl: string; cancelUrl: string },
  ) => Promise<{ subscriptionId: string; approvalUrl: string }>
}

const mockDbQuery = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>()
const mockGetBillingPlan = jest.fn<Promise<PayPalBillingPlanDetails>, [string]>()
const mockCreateSubscription = jest.fn<Promise<{ subscriptionId: string; approvalUrl: string }>, [
  string,
  { email: string },
  { returnUrl: string; cancelUrl: string },
]>()
const mockGetPayPalService = jest.fn<MockPayPalService | null, []>()
const mockGetPayPalPlanId = jest.fn<string | null, [string, string?]>()

jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: unknown) => handler }))
jest.mock('@/lib/db', () => ({ db: { query: (query: string, values?: unknown[]) => mockDbQuery(query, values) } }))
jest.mock('@/lib/site', () => ({ getPublicAppUrl: () => 'https://metardu.space' }))
jest.mock('@/lib/payments/paypal', () => ({
  getPayPalService: () => mockGetPayPalService(),
  getPayPalPlanId: (planId: string, currency?: string) => mockGetPayPalPlanId(planId, currency),
  resolvePayPalCurrency: (currency: string) => ['EUR', 'GBP', 'AUD'].includes(currency) ? currency : 'USD',
}))

import { POST } from '../route'

const service: MockPayPalService = {
  getBillingPlan: (planId) => mockGetBillingPlan(planId),
  createSubscription: (planId, subscriber, callbacks) => mockCreateSubscription(planId, subscriber, callbacks),
}

function request(): NextRequest {
  return new NextRequest('https://metardu.space/api/payments', { method: 'POST' })
}

async function startSubscription(body: Record<string, unknown>): Promise<NextResponse> {
  const handler = POST as unknown as (
    req: NextRequest,
    ctx: ApiHandlerContext,
  ) => Promise<NextResponse>
  return handler(request(), { body, userId: USER_ID, session: null, params: {} })
}

async function responseJson(response: NextResponse): Promise<unknown> {
  return JSON.parse(await response.text()) as unknown
}

function activeMonthlyBillingPlan(amount: number): PayPalBillingPlanDetails {
  return {
    id: PAYPAL_PLAN_ID,
    status: 'ACTIVE',
    billing_cycles: [{
      tenure_type: 'REGULAR',
      frequency: { interval_unit: 'MONTH', interval_count: 1 },
      pricing_scheme: { fixed_price: { value: amount.toFixed(2), currency_code: 'USD' } },
    }],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDbQuery.mockResolvedValue({ rows: [] })
  mockGetPayPalService.mockReturnValue(service)
  mockGetPayPalPlanId.mockReturnValue(PAYPAL_PLAN_ID)
  mockGetBillingPlan.mockResolvedValue(activeMonthlyBillingPlan(getTotalPrice('pro', 'USD', 1)))
  mockCreateSubscription.mockResolvedValue({
    subscriptionId: 'I-METARDU-SUB-001',
    approvalUrl: 'https://www.paypal.com/checkoutnow?token=I-METARDU-SUB-001',
  })
})

describe('POST /api/payments PayPal subscription start', () => {
  it('validates the live monthly plan before writing and carries the converted price and callbacks through', async () => {
    mockDbQuery.mockImplementation(async (query) => query.includes('INSERT INTO payment_history')
      ? { rows: [{ id: PAYMENT_ID }] }
      : { rows: [] })

    const response = await startSubscription({
      provider: 'paypal',
      action: 'start-subscription',
      planId: 'pro',
      currency: 'KES',
      seatCount: 1,
      email: 'surveyor@example.com',
    })
    const body = await responseJson(response)
    const amountUsd = getTotalPrice('pro', 'USD', 1)

    expect(response.status).toBe(200)
    expect(body).toEqual({ kind: 'redirect', provider: 'paypal', url: 'https://www.paypal.com/checkoutnow?token=I-METARDU-SUB-001', paymentId: PAYMENT_ID })
    expect(mockGetBillingPlan).toHaveBeenCalledWith(PAYPAL_PLAN_ID)
    expect(mockDbQuery).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO payment_history'),
      [USER_ID, getTotalPrice('pro', 'KES', 1), 'KES', 'paypal', 'pro', JSON.stringify({ seatCount: 1, extraSeats: 0 })],
    )
    expect(mockDbQuery).toHaveBeenNthCalledWith(2,
      expect.stringContaining('UPDATE payment_history SET amount = $1, currency = $2'),
      [amountUsd, 'USD', PAYMENT_ID, USER_ID],
    )
    expect(mockCreateSubscription).toHaveBeenCalledWith(PAYPAL_PLAN_ID, { email: 'surveyor@example.com' }, {
      returnUrl: `https://metardu.space/subscription/success?provider=paypal&paymentId=${PAYMENT_ID}&planId=pro`,
      cancelUrl: `https://metardu.space/subscription/cancel?provider=paypal&paymentId=${PAYMENT_ID}&planId=pro`,
    })
    expect(mockDbQuery).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE payment_history SET transaction_id = $1'),
      ['I-METARDU-SUB-001', PAYMENT_ID, USER_ID],
    )
  })

  it('rejects a billing plan price mismatch before creating a payment row or subscription', async () => {
    mockGetBillingPlan.mockResolvedValue(activeMonthlyBillingPlan(getTotalPrice('pro', 'USD', 1) + 1))

    const response = await startSubscription({
      provider: 'paypal', action: 'start-subscription', planId: 'pro', currency: 'KES', seatCount: 1,
    })

    expect(response.status).toBe(409)
    expect(await responseJson(response)).toMatchObject({ code: 'PAYPAL_PLAN_MISMATCH' })
    expect(mockDbQuery).not.toHaveBeenCalled()
    expect(mockCreateSubscription).not.toHaveBeenCalled()
  })

  it('fails closed when PayPal cannot verify the saved billing plan', async () => {
    mockGetBillingPlan.mockRejectedValue(new Error('provider unavailable'))

    const response = await startSubscription({
      provider: 'paypal', action: 'start-subscription', planId: 'pro', currency: 'KES', seatCount: 1,
    })

    expect(response.status).toBe(503)
    expect(await responseJson(response)).toEqual({
      error: 'METARDU could not verify the PayPal billing plan. Please try another method or try again later.',
    })
    expect(mockDbQuery).not.toHaveBeenCalled()
    expect(mockCreateSubscription).not.toHaveBeenCalled()
  })

  it('rejects extra seats before contacting PayPal or writing a payment row', async () => {
    const response = await startSubscription({
      provider: 'paypal', action: 'start-subscription', planId: 'team', currency: 'KES', seatCount: 4,
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'PAYPAL_EXTRA_SEATS_UNAVAILABLE' })
    expect(mockGetPayPalService).not.toHaveBeenCalled()
    expect(mockDbQuery).not.toHaveBeenCalled()
  })
})
