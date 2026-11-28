import * as regionalCheckout from '../regionalCheckout'
import {
  COUNTRY_OPTIONS,
  detectRegionFromLocale,
  formatMoney,
  parsePaymentEligibility,
} from '../regionalCheckout'

const KENYA_REQUEST = {
  countryCode: 'KE',
  currency: 'KES' as const,
  planId: 'pro' as const,
  seatCount: 1,
}

const INTERNATIONAL_REQUEST = {
  countryCode: 'UG',
  currency: 'UGX' as const,
  planId: 'pro' as const,
  seatCount: 1,
}

const MPESA_METHOD = {
  id: 'mpesa' as const,
  provider: 'mpesa' as const,
  label: 'M-Pesa',
  chargeCurrency: 'KES' as const,
  chargeAmount: 2500,
}

const PAYPAL_METHOD = {
  id: 'paypal' as const,
  provider: 'paypal' as const,
  label: 'PayPal',
  chargeCurrency: 'USD' as const,
  chargeAmount: 19,
}

function eligibilityResponse(
  methods: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    eligibility: {
      ok: true,
      market: 'kenya',
      currency: 'KES',
      methods,
      ...overrides,
    },
  }
}

describe('regional payment eligibility validation', () => {
  it('accepts an exact authoritative Kenya M-Pesa response', () => {
    expect(parsePaymentEligibility(
      eligibilityResponse([MPESA_METHOD]),
      KENYA_REQUEST,
    )).toEqual({
      market: 'kenya',
      currency: 'KES',
      methods: [MPESA_METHOD],
    })
  })

  it('accepts an exact authoritative international PayPal response', () => {
    expect(parsePaymentEligibility(
      eligibilityResponse([PAYPAL_METHOD], {
        market: 'international',
        currency: 'UGX',
      }),
      INTERNATIONAL_REQUEST,
    )).toEqual({
      market: 'international',
      currency: 'UGX',
      methods: [PAYPAL_METHOD],
    })
  })

  it('rejects a request with an invalid seat count', () => {
    expect(parsePaymentEligibility(
      eligibilityResponse([MPESA_METHOD]),
      { ...KENYA_REQUEST, seatCount: 0 },
    )).toBeNull()
  })

  it('accepts a zero-method response only with one approved server reason', () => {
    const getFailureReason = (regionalCheckout as unknown as {
      getPaymentEligibilityFailureReason?: (
        payload: unknown,
        request: typeof KENYA_REQUEST,
      ) => string | undefined
    }).getPaymentEligibilityFailureReason

    const reason = {
      code: 'PROVIDER_UNAVAILABLE',
      message: 'No online payment method is currently available.',
    }
    expect(parsePaymentEligibility(
      eligibilityResponse([], { reason }),
      KENYA_REQUEST,
    )).toEqual({
      market: 'kenya',
      currency: 'KES',
      methods: [],
      reason,
    })
    expect(getFailureReason?.(
      eligibilityResponse([]),
      KENYA_REQUEST,
    )).toBe('invalid-response')
  })

  it.each([
    [
      'an unknown reason code',
      { code: 'UNKNOWN_REASON', message: 'Unavailable.' },
    ],
    [
      'a missing reason message',
      { code: 'PROVIDER_UNAVAILABLE' },
    ],
    [
      'a blank reason message',
      { code: 'PROVIDER_UNAVAILABLE', message: '   ' },
    ],
  ])('rejects a zero-method response with %s', (_caseName, reason) => {
    expect(parsePaymentEligibility(
      eligibilityResponse([], { reason }),
      KENYA_REQUEST,
    )).toBeNull()
  })

  it('rejects a method response that also carries a no-method reason', () => {
    expect(parsePaymentEligibility(
      eligibilityResponse([MPESA_METHOD], {
        reason: {
          code: 'PAYPAL_EXTRA_SEATS_UNAVAILABLE',
          message: 'PayPal supports included seats only.',
        },
      }),
      KENYA_REQUEST,
    )).toBeNull()
  })

  it.each([
    [
      'an unsuccessful eligibility result',
      eligibilityResponse([MPESA_METHOD], { ok: false }),
    ],
    [
      'a response currency that differs from the requested currency',
      eligibilityResponse([MPESA_METHOD], { currency: 'USD' }),
    ],
    [
      'a market that does not match the requested country',
      eligibilityResponse([MPESA_METHOD], { market: 'international' }),
    ],
    [
      'an empty method list',
      eligibilityResponse([]),
    ],
    [
      'a method without a required charge amount',
      eligibilityResponse([{
        id: 'mpesa',
        provider: 'mpesa',
        label: 'M-Pesa',
        chargeCurrency: 'KES',
      }]),
    ],
    [
      'a non-positive charge amount',
      eligibilityResponse([{ ...MPESA_METHOD, chargeAmount: 0 }]),
    ],
    [
      'a fractional charge amount',
      eligibilityResponse([{ ...MPESA_METHOD, chargeAmount: 12.5 }]),
    ],
    [
      'a method whose provider and id disagree',
      eligibilityResponse([{ ...MPESA_METHOD, provider: 'paypal' }]),
    ],
    [
      'an M-Pesa method quoted outside KES',
      eligibilityResponse([{ ...MPESA_METHOD, chargeCurrency: 'USD' }]),
    ],
    [
      'a PayPal method quoted in KES',
      eligibilityResponse([{
        ...PAYPAL_METHOD,
        chargeCurrency: 'KES',
      }], {
        market: 'international',
        currency: 'UGX',
      }),
    ],
    [
      'duplicate method ids and providers',
      eligibilityResponse([MPESA_METHOD, { ...MPESA_METHOD }]),
    ],
  ])('rejects %s atomically', (_caseName, payload) => {
    expect(parsePaymentEligibility(payload, KENYA_REQUEST)).toBeNull()
  })

  it('rejects the entire response when one member is malformed', () => {
    const malformedFirstMember = {
      ...PAYPAL_METHOD,
      chargeAmount: -1,
    }

    expect(parsePaymentEligibility(
      eligibilityResponse([malformedFirstMember, MPESA_METHOD]),
      KENYA_REQUEST,
    )).toBeNull()
  })
})

describe('BCP 47 region detection', () => {
  it.each([
    ['en-US-u-hc-h12', 'US'],
    ['en-GB', 'GB'],
    ['zh-Hant-TW', 'TW'],
    ['en-Latn-KE', 'KE'],
  ])('reads the ISO region from %s', (locale, expectedRegion) => {
    expect(detectRegionFromLocale(locale)).toBe(expectedRegion)
  })

  it.each([
    'en-u-ca-gregory',
    'en-u-co-phonebk',
    'en-t-es-u-co-phonebk',
  ])('does not mistake an extension subtag for a region in %s', (locale) => {
    expect(detectRegionFromLocale(locale)).toBeUndefined()
  })
})

describe('shared country display metadata', () => {
  it('uses one Kenya display record for checkout and pricing', () => {
    expect(COUNTRY_OPTIONS.find((option) => option.code === 'KE')).toEqual({
      code: 'KE',
      name: 'Kenya',
      currency: 'KES',
    })
  })
})

describe('regional money formatting', () => {
  it('uses a fixed application locale so server and browser output cannot differ', () => {
    const numberFormat = jest.spyOn(Intl, 'NumberFormat')

    try {
      expect(formatMoney(2500, 'KES')).toBe('KSh 2,500')
      expect(numberFormat.mock.calls[0]?.[0]).toBe('en-US')
    } finally {
      numberFormat.mockRestore()
    }
  })
})
