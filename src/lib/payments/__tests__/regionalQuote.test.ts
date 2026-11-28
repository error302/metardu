import * as eligibilityModule from '../eligibility'

type QuoteInput = {
  methods: Array<{
    id: 'mpesa' | 'paypal'
    provider: 'mpesa' | 'paypal'
    chargeCurrency: 'KES' | 'USD' | 'EUR' | 'GBP' | 'AUD'
  }>
  planId: 'pro' | 'team' | 'firm'
  totalSeats: number
}

type QuotedMethod = {
  id: 'mpesa' | 'paypal'
  provider: 'mpesa' | 'paypal'
  label: string
  chargeCurrency: 'KES' | 'USD' | 'EUR' | 'GBP' | 'AUD'
  chargeAmount: number
}

const quoteEligiblePaymentMethods = (
  eligibilityModule as unknown as {
    quoteEligiblePaymentMethods?: (input: QuoteInput) => QuotedMethod[]
  }
).quoteEligiblePaymentMethods

type QuoteResult =
  | { ok: true; methods: QuotedMethod[] }
  | { ok: false; reason: { code: string; message: string } }

const quoteEligiblePaymentMethodsWithReason = (
  eligibilityModule as unknown as {
    quoteEligiblePaymentMethodsWithReason?: (input: QuoteInput) => QuoteResult
  }
).quoteEligiblePaymentMethodsWithReason

function quote(input: QuoteInput): QuotedMethod[] {
  expect(typeof quoteEligiblePaymentMethods).toBe('function')
  if (!quoteEligiblePaymentMethods) return []
  return quoteEligiblePaymentMethods(input)
}

function quoteWithReason(input: QuoteInput): QuoteResult {
  expect(typeof quoteEligiblePaymentMethodsWithReason).toBe('function')
  if (!quoteEligiblePaymentMethodsWithReason) {
    return { ok: false, reason: { code: 'INVALID_QUOTE', message: 'Unavailable.' } }
  }
  return quoteEligiblePaymentMethodsWithReason(input)
}

describe('server-authoritative regional payment quotes', () => {
  it('quotes the Kenyan M-Pesa plan in KES as a positive integer', () => {
    expect(quote({
      methods: [{ id: 'mpesa', provider: 'mpesa', chargeCurrency: 'KES' }],
      planId: 'pro',
      totalSeats: 1,
    })).toEqual([
      {
        id: 'mpesa',
        provider: 'mpesa',
        label: 'M-Pesa',
        chargeCurrency: 'KES',
        chargeAmount: 2500,
      },
    ])
  })

  it('quotes the configured PayPal plan price without converting the display currency', () => {
    expect(quote({
      methods: [{ id: 'paypal', provider: 'paypal', chargeCurrency: 'USD' }],
      planId: 'pro',
      totalSeats: 1,
    })).toEqual([
      {
        id: 'paypal',
        provider: 'paypal',
        label: 'PayPal',
        chargeCurrency: 'USD',
        chargeAmount: 19,
      },
    ])
  })

  it('fails closed when PayPal would need to charge for extra seats', () => {
    expect(quote({
      methods: [{ id: 'paypal', provider: 'paypal', chargeCurrency: 'USD' }],
      planId: 'team',
      totalSeats: 4,
    })).toEqual([])
  })

  it('returns the authoritative PayPal extra-seat reason without a quote', () => {
    const result = quoteWithReason({
      methods: [{ id: 'paypal', provider: 'paypal', chargeCurrency: 'USD' }],
      planId: 'team',
      totalSeats: 4,
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected the PayPal extra-seat quote to fail')
    expect(result.reason.code).toBe('PAYPAL_EXTRA_SEATS_UNAVAILABLE')
    expect(typeof result.reason.message).toBe('string')
    expect(result.reason.message.length).toBeGreaterThan(0)
  })

  it('returns an invalid-quote reason for an invalid plan or seat count', () => {
    const result = quoteWithReason({
      methods: [{ id: 'paypal', provider: 'paypal', chargeCurrency: 'USD' }],
      planId: 'enterprise' as 'pro',
      totalSeats: 0,
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected the invalid quote to fail')
    expect(result.reason.code).toBe('INVALID_QUOTE')
    expect(typeof result.reason.message).toBe('string')
    expect(result.reason.message.length).toBeGreaterThan(0)
  })

  it('quotes M-Pesa extra seats from the server catalog', () => {
    expect(quote({
      methods: [{ id: 'mpesa', provider: 'mpesa', chargeCurrency: 'KES' }],
      planId: 'team',
      totalSeats: 4,
    })).toEqual([
      {
        id: 'mpesa',
        provider: 'mpesa',
        label: 'M-Pesa',
        chargeCurrency: 'KES',
        chargeAmount: 6000,
      },
    ])
  })

  it('fails closed for an invalid plan or seat count', () => {
    expect(quote({
      methods: [{ id: 'paypal', provider: 'paypal', chargeCurrency: 'USD' }],
      planId: 'firm',
      totalSeats: 0,
    })).toEqual([])

    expect(quote({
      methods: [{ id: 'paypal', provider: 'paypal', chargeCurrency: 'USD' }],
      planId: 'enterprise' as 'pro',
      totalSeats: 1,
    })).toEqual([])
  })
})
