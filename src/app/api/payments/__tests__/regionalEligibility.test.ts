/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
import type { ApiHandlerContext } from '@/lib/apiHandler'
import * as catalog from '@/lib/subscription/catalog'
import { getTotalPrice } from '@/lib/subscription/catalog'
import type { PayPalBillingPlanDetails } from '@/lib/payments/paypalPlanValidation'

const PAYMENT_ID = '90000000-0000-4000-8000-000000000011'
const USER_ID = '90000000-0000-4000-8000-000000000012'
const PAYPAL_PLAN_ID = 'P-METARDU-PRO-USD'

const mockDbQuery = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>()
const mockGetPayPalService = jest.fn<unknown, []>()
const mockGetPayPalPlanId = jest.fn<string | null, [string, string?]>()
const mockGetBillingPlan = jest.fn<Promise<PayPalBillingPlanDetails>, [string]>()
const mockCreateSubscription = jest.fn<Promise<unknown>, [string, unknown, unknown]>()
const mockInitiateSTKPush = jest.fn<Promise<unknown>, [unknown]>()

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
}))
jest.mock('@/lib/db', () => ({
  db: { query: (query: string, values?: unknown[]) => mockDbQuery(query, values) },
}))
jest.mock('@/lib/site', () => ({ getPublicAppUrl: () => 'https://metardu.space' }))
jest.mock('@/lib/payments/paypal', () => ({
  getPayPalService: () => mockGetPayPalService(),
  getPayPalPlanId: (planId: string, currency?: string) =>
    mockGetPayPalPlanId(planId, currency),
  resolvePayPalCurrency: (currency: string) =>
    ['EUR', 'GBP', 'AUD'].includes(currency) ? currency : 'USD',
}))
jest.mock('@/lib/payments/mpesa', () => ({
  getMpesaService: () => ({
    initiateSTKPush: (input: unknown) => mockInitiateSTKPush(input),
  }),
}))

import { GET, POST } from '../route'

const paypalService = {
  getBillingPlan: (planId: string) => mockGetBillingPlan(planId),
  createSubscription: (
    planId: string,
    subscriber: unknown,
    callbacks: unknown
  ) => mockCreateSubscription(planId, subscriber, callbacks),
}

function context(): ApiHandlerContext {
  return { body: {}, userId: USER_ID, session: null, params: {} }
}

async function post(body: Record<string, unknown>): Promise<NextResponse> {
  const handler = POST as unknown as (
    req: NextRequest,
    ctx: ApiHandlerContext
  ) => Promise<NextResponse>
  return handler(
    new NextRequest('https://metardu.space/api/payments', { method: 'POST' }),
    { ...context(), body }
  )
}

async function get(query: string): Promise<NextResponse> {
  const handler = GET as unknown as (
    req: NextRequest,
    ctx: ApiHandlerContext
  ) => Promise<NextResponse>
  return handler(
    new NextRequest(`https://metardu.space/api/payments${query}`),
    context()
  )
}

interface RegionalEligibilityBody {
  providers: { paypal: boolean; mpesa: boolean }
  eligibility: {
    ok: boolean
    market: 'kenya' | 'international'
    currency: string
    methods: Array<{
      id: 'mpesa' | 'paypal'
      provider: 'mpesa' | 'paypal'
      label: string
      chargeCurrency: string
      chargeAmount: number
    }>
    reason?: {
      code: string
      message: string
    }
  }
}

async function getEligibility(query: string): Promise<{
  response: NextResponse
  body: RegionalEligibilityBody
}> {
  const response = await get(query)
  const body = (await response.json()) as unknown as RegionalEligibilityBody
  return { response, body }
}

function activeMonthlyBillingPlan(amount: number): PayPalBillingPlanDetails {
  return {
    id: PAYPAL_PLAN_ID,
    status: 'ACTIVE',
    billing_cycles: [
      {
        tenure_type: 'REGULAR',
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        pricing_scheme: {
          fixed_price: { value: amount.toFixed(2), currency_code: 'USD' },
        },
      },
    ],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDbQuery.mockImplementation(async (query: string) =>
    query.includes('INSERT INTO payment_history')
      ? { rows: [{ id: PAYMENT_ID }] }
      : { rows: [] }
  )
  mockGetPayPalService.mockReturnValue(paypalService)
  mockGetPayPalPlanId.mockReturnValue(PAYPAL_PLAN_ID)
  mockGetBillingPlan.mockResolvedValue(
    activeMonthlyBillingPlan(getTotalPrice('pro', 'USD', 1))
  )
  mockCreateSubscription.mockResolvedValue({
    subscriptionId: 'I-METARDU-SUB-011',
    approvalUrl: 'https://www.paypal.com/checkoutnow?token=I-METARDU-SUB-011',
  })
})

describe('server-authoritative regional payment eligibility', () => {
  it('returns only M-PESA for Kenya/KES', async () => {
    const { response, body } = await getEligibility(
      '?countryCode=KE&currency=KES&planId=pro&seatCount=1',
    )

    expect(response.status).toBe(200)
    expect(body.providers).toEqual({ paypal: true, mpesa: true })
    expect(body.eligibility).toMatchObject({
      market: 'kenya',
      methods: [{
        id: 'mpesa',
        provider: 'mpesa',
        label: 'M-Pesa',
        chargeCurrency: 'KES',
        chargeAmount: 2500,
      }],
    })
    expect(Number.isSafeInteger(body.eligibility.methods[0].chargeAmount)).toBe(true)
    expect(body.eligibility.methods[0].chargeAmount).toBeGreaterThan(0)
    expect(body.eligibility.reason).toBeUndefined()
  })

  it('returns only PayPal for an international checkout', async () => {
    const { response, body } = await getEligibility(
      '?countryCode=UG&currency=UGX&planId=pro&seatCount=1',
    )

    expect(response.status).toBe(200)
    expect(body.eligibility).toMatchObject({
      market: 'international',
      methods: [
        {
          id: 'paypal',
          provider: 'paypal',
          label: 'PayPal',
          chargeCurrency: 'USD',
          chargeAmount: 19,
        },
      ],
    })
    expect(Number.isSafeInteger(body.eligibility.methods[0].chargeAmount)).toBe(true)
    expect(body.eligibility.methods[0].chargeAmount).toBeGreaterThan(0)
    expect(body.eligibility.reason).toBeUndefined()
  })

  it('quotes M-Pesa extra seats from the server catalog', async () => {
    const { response, body } = await getEligibility(
      '?countryCode=KE&currency=KES&planId=team&seatCount=4',
    )

    expect(response.status).toBe(200)
    expect(body.eligibility.methods).toEqual([
      {
        id: 'mpesa',
        provider: 'mpesa',
        label: 'M-Pesa',
        chargeCurrency: 'KES',
        chargeAmount: 6000,
      },
    ])
  })

  it('returns the authoritative PayPal extra-seat reason without a method', async () => {
    const { response, body } = await getEligibility(
      '?countryCode=UG&currency=UGX&planId=team&seatCount=4',
    )

    expect(response.status).toBe(200)
    expect(body.eligibility).toMatchObject({
      ok: true,
      market: 'international',
      currency: 'UGX',
      methods: [],
      reason: {
        code: 'PAYPAL_EXTRA_SEATS_UNAVAILABLE',
      },
    })
    expect(body.eligibility.reason?.message).toEqual(expect.any(String))
    expect(body.eligibility.reason?.message.length).toBeGreaterThan(0)
  })

  it('returns a provider-unavailable reason when no provider service is configured', async () => {
    mockGetPayPalService.mockReturnValue(null)

    const { response, body } = await getEligibility(
      '?countryCode=UG&currency=UGX&planId=pro&seatCount=1',
    )

    expect(response.status).toBe(200)
    expect(body.eligibility.methods).toEqual([])
    expect(body.eligibility.reason?.code).toBe('PROVIDER_UNAVAILABLE')
    expect(body.eligibility.reason?.message.length).toBeGreaterThan(0)
  })

  it('returns a plan-unavailable reason when PayPal has no plan for the request', async () => {
    mockGetPayPalPlanId.mockReturnValue(null)

    const { response, body } = await getEligibility(
      '?countryCode=UG&currency=UGX&planId=pro&seatCount=1',
    )

    expect(response.status).toBe(200)
    expect(body.eligibility.methods).toEqual([])
    expect(body.eligibility.reason?.code).toBe('PLAN_UNAVAILABLE')
    expect(body.eligibility.reason?.message.length).toBeGreaterThan(0)
  })

  it('returns an invalid-quote reason when the server cannot produce a positive quote', async () => {
    const quoteSpy = jest.spyOn(catalog, 'getTotalPrice').mockReturnValue(0)

    try {
      const { response, body } = await getEligibility(
        '?countryCode=UG&currency=UGX&planId=pro&seatCount=1',
      )

      expect(response.status).toBe(200)
      expect(body.eligibility.methods).toEqual([])
      expect(body.eligibility.reason?.code).toBe('INVALID_QUOTE')
      expect(body.eligibility.reason?.message.length).toBeGreaterThan(0)
    } finally {
      quoteSpy.mockRestore()
    }
  })

  it.each([
    [
      'a missing plan',
      '?countryCode=KE&currency=KES&seatCount=1',
      'INVALID_PLAN',
    ],
    [
      'an unsupported plan',
      '?countryCode=KE&currency=KES&planId=starter&seatCount=1',
      'INVALID_PLAN',
    ],
    [
      'missing seats',
      '?countryCode=KE&currency=KES&planId=pro',
      'INVALID_SEATS',
    ],
    [
      'invalid seats',
      '?countryCode=KE&currency=KES&planId=pro&seatCount=0',
      'INVALID_SEATS',
    ],
    [
      'fractional seats',
      '?countryCode=KE&currency=KES&planId=pro&seatCount=1.5',
      'INVALID_SEATS',
    ],
    [
      'a missing country',
      '?currency=KES&planId=pro&seatCount=1',
      'COUNTRY_REQUIRED',
    ],
    [
      'a missing currency',
      '?countryCode=KE&planId=pro&seatCount=1',
      'CURRENCY_REQUIRED',
    ],
  ])('rejects %s with a machine-readable HTTP 400 code', async (_caseName, query, code) => {
    const response = await get(query)
    const body = await response.json() as { error?: string; code?: string }

    expect(response.status).toBe(400)
    expect(body.code).toBe(code)
    expect(body.error).toEqual(expect.any(String))
    expect(body.error?.length).toBeGreaterThan(0)
  })

  it('rejects a Kenya GET checkout priced in a non-KES currency', async () => {
    const response = await get(
      '?countryCode=KE&currency=USD&planId=pro&seatCount=1',
    )
    const body = await response.json() as { error?: string; code?: string }

    expect(response.status).toBe(400)
    expect(body.code).toBe('COUNTRY_CURRENCY_MISMATCH')
    expect(body.error?.length).toBeGreaterThan(0)
  })

  it('rejects PayPal for Kenya before writing a row or calling PayPal', async () => {
    const response = await post({
      provider: 'paypal',
      action: 'start-subscription',
      planId: 'pro',
      currency: 'KES',
      countryCode: 'KE',
      seatCount: 1,
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'PAYMENT_METHOD_NOT_ELIGIBLE',
    })
    expect(mockDbQuery).not.toHaveBeenCalled()
    expect(mockGetBillingPlan).not.toHaveBeenCalled()
    expect(mockCreateSubscription).not.toHaveBeenCalled()
  })

  it('rejects M-PESA outside Kenya before writing a row or calling Daraja', async () => {
    const response = await post({
      provider: 'mpesa',
      action: 'start-subscription',
      planId: 'pro',
      currency: 'UGX',
      countryCode: 'UG',
      seatCount: 1,
      phoneNumber: '0712345678',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 'PAYMENT_METHOD_NOT_ELIGIBLE',
    })
    expect(mockDbQuery).not.toHaveBeenCalled()
    expect(mockInitiateSTKPush).not.toHaveBeenCalled()
  })

  it('rejects a Kenya checkout priced in a non-KES currency', async () => {
    const response = await post({
      provider: 'paypal',
      action: 'start-subscription',
      planId: 'pro',
      currency: 'USD',
      countryCode: 'KE',
      seatCount: 1,
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'COUNTRY_CURRENCY_MISMATCH',
    })
    expect(mockDbQuery).not.toHaveBeenCalled()
  })
})
