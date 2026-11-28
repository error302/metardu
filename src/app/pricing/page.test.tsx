import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PricingPage from './page'

jest.mock('@/components/ui/grid-feature-cards', () => ({
  FeatureCard: () => null,
}))

const originalFetch = global.fetch
const originalLanguage = window.navigator.language

const REASON_MESSAGES: Record<string, string> = {
  PAYPAL_EXTRA_SEATS_UNAVAILABLE:
    'PayPal supports included seats only. Reduce the seat count to the included seats or contact METARDU support for additional seats.',
  PROVIDER_UNAVAILABLE:
    'The payment provider is temporarily unavailable. Please try again later.',
  PLAN_UNAVAILABLE:
    'This plan is temporarily unavailable for online payment.',
  INVALID_QUOTE:
    'A valid payment quote is temporarily unavailable. Please try again later.',
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response
}

function installEligibilityMock({
  failedPlanId,
  malformedPlanId,
  methodLabel,
  unavailableReason,
}: {
  failedPlanId?: string
  malformedPlanId?: string
  methodLabel?: string
  unavailableReason?: {
    code: string
    planId?: string
    seatCount?: number
  }
} = {}) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const requestUrl = new URL(String(input), 'https://metardu.test')
    const planId = requestUrl.searchParams.get('planId') ?? 'pro'
    const seatCount = Number(requestUrl.searchParams.get('seatCount') ?? '1')
    const countryCode = requestUrl.searchParams.get('countryCode') ?? 'KE'
    const currency = requestUrl.searchParams.get('currency') ?? 'KES'

    if (planId === failedPlanId) {
      return jsonResponse({ error: 'Payment availability request failed.' }, false)
    }

    if (planId === malformedPlanId) {
      return jsonResponse({
        eligibility: {
          ok: true,
          market: countryCode === 'KE' ? 'kenya' : 'international',
          currency,
          methods: [{
            id: countryCode === 'KE' ? 'mpesa' : 'paypal',
            provider: countryCode === 'KE' ? 'mpesa' : 'paypal',
            label: countryCode === 'KE' ? 'M-Pesa' : 'PayPal',
            chargeCurrency: countryCode === 'KE' ? 'KES' : 'USD',
            chargeAmount: 0,
          }],
        },
      })
    }

    const isKenya = countryCode === 'KE'
    if (isKenya && currency !== 'KES') {
      return jsonResponse({
        eligibility: {
          ok: false,
          code: 'COUNTRY_CURRENCY_MISMATCH',
          message: 'Kenya checkout must be priced in KES.',
        },
      })
    }

    if (
      unavailableReason
      && (!unavailableReason.planId || unavailableReason.planId === planId)
      && (
        unavailableReason.seatCount === undefined
        || unavailableReason.seatCount === seatCount
      )
    ) {
      return jsonResponse({
        eligibility: {
          ok: true,
          market: isKenya ? 'kenya' : 'international',
          currency,
          methods: [],
          reason: {
            code: unavailableReason.code,
            message: REASON_MESSAGES[unavailableReason.code] ?? 'Payment is unavailable.',
          },
        },
      })
    }

    return jsonResponse({
      eligibility: {
        ok: true,
        market: isKenya ? 'kenya' : 'international',
        currency,
        methods: [{
          id: isKenya ? 'mpesa' : 'paypal',
          provider: isKenya ? 'mpesa' : 'paypal',
          label: methodLabel ?? (isKenya ? 'M-Pesa' : 'PayPal'),
          chargeCurrency: isKenya ? 'KES' : 'USD',
          chargeAmount: isKenya ? 2500 : 19,
        }],
      },
    })
  })

  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

beforeEach(() => {
  localStorage.removeItem('metardu:currency')
  Object.defineProperty(window.navigator, 'language', { value: 'en-KE', configurable: true })
  installEligibilityMock()
})

afterEach(() => {
  global.fetch = originalFetch
  localStorage.removeItem('metardu:currency')
  Object.defineProperty(window.navigator, 'language', { value: originalLanguage, configurable: true })
})

describe('regional pricing payment eligibility', () => {
  it('separates included seats from the extra-seat rate on Team and Firm cards', () => {
    render(<PricingPage />)

    expect(screen.getByText('Includes 3 seats · KSh 1,500 per additional seat/month')).toBeInTheDocument()
    expect(screen.getByText('Includes 5 seats · KSh 2,500 per additional seat/month')).toBeInTheDocument()
    expect(screen.queryByText(/KSh 4,500 \+ KSh 1,500\/seat/)).not.toBeInTheDocument()
    expect(screen.queryByText(/KSh 9,000 \+ KSh 2,500\/seat/)).not.toBeInTheDocument()
  })

  it('queries only the selected plan and renders only the validated Kenya method', async () => {
    const fetchMock = installEligibilityMock()

    render(<PricingPage />)

    expect(await screen.findByRole('link', { name: /Continue with M-Pesa/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue with PayPal/ })).not.toBeInTheDocument()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.pathname).toBe('/api/payments')
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      countryCode: 'KE',
      currency: 'KES',
      planId: 'pro',
      seatCount: '1',
    })
  })

  it('does not imply that a rail is available when the selected plan query fails', async () => {
    installEligibilityMock({ failedPlanId: 'pro' })

    render(<PricingPage />)

    expect(await screen.findByText(/Payment methods could not be verified/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue with M-Pesa/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue with PayPal/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry payment method check/i })).toBeInTheDocument()
  })

  it('does not imply that a rail is available when the selected plan response is malformed', async () => {
    installEligibilityMock({ malformedPlanId: 'pro' })

    render(<PricingPage />)

    expect(await screen.findByText(/Payment methods could not be verified/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue with M-Pesa/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue with PayPal/ })).not.toBeInTheDocument()
  })

  it('renders PayPal only when the server returns it and discloses the server charge amount', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-GB', configurable: true })
    installEligibilityMock()

    render(<PricingPage />)

    expect(await screen.findByRole('link', { name: 'Continue with PayPal →' })).toBeInTheDocument()
    expect(screen.getByText('PayPal will charge $19 USD each month.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue with M-Pesa/ })).not.toBeInTheDocument()
  })

  it('uses the server-supplied method label in the provider disclosure and CTA', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true })
    installEligibilityMock({ methodLabel: 'PayPal billing' })

    render(<PricingPage />)

    expect(await screen.findByRole('link', {
      name: 'Continue with PayPal billing →',
    })).toBeInTheDocument()
    expect(screen.getByText('PayPal billing checkout')).toBeInTheDocument()
  })

  it.each([
    ['en-u-ca-gregory', 'KE', 'KES'],
    ['en-u-co-phonebk', 'KE', 'KES'],
    ['en-t-es-u-co-phonebk', 'KE', 'KES'],
    ['en-US-u-hc-h12', 'US', 'USD'],
  ])('uses a grammar-aware region for %s', async (locale, expectedCountry, expectedCurrency) => {
    Object.defineProperty(window.navigator, 'language', { value: locale, configurable: true })
    const fetchMock = installEligibilityMock()

    render(<PricingPage />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.searchParams.get('countryCode')).toBe(expectedCountry)
    expect(requestUrl.searchParams.get('currency')).toBe(expectedCurrency)
  })

  it('does not infer a market from the selected currency alone', async () => {
    const fetchMock = installEligibilityMock()
    render(<PricingPage />)

    await screen.findByRole('link', { name: /Continue with M-Pesa/ })
    fireEvent.change(screen.getByRole('combobox', { name: 'Pricing currency' }), {
      target: { value: 'USD' },
    })

    expect(await screen.findByText(/Payment methods could not be verified/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue with PayPal/ })).not.toBeInTheDocument()
    await waitFor(() => {
      const requestUrls = fetchMock.mock.calls.map(([input]) => (
        new URL(String(input), 'https://metardu.test')
      ))
      expect(requestUrls.some((url) => (
        url.searchParams.get('countryCode') === 'KE'
        && url.searchParams.get('currency') === 'USD'
      ))).toBe(true)
    })
  })

  it('uses stored display preferences only as query context and still requires a server method', async () => {
    localStorage.setItem('metardu:currency', JSON.stringify({
      code: 'UGX',
      countryCode: 'UG',
      ts: Date.now(),
    }))
    const fetchMock = installEligibilityMock()

    render(<PricingPage />)

    expect(await screen.findByRole('link', { name: 'Continue with PayPal →' })).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.searchParams.get('countryCode')).toBe('UG')
    expect(requestUrl.searchParams.get('currency')).toBe('UGX')
  })

  it('announces asynchronous market and method changes in an accessible live region', async () => {
    installEligibilityMock()
    render(<PricingPage />)

    const announcement = screen.getByRole('status')
    await waitFor(() => expect(announcement).toHaveTextContent('M-Pesa is available for Kenya.'))

    fireEvent.change(screen.getByRole('combobox', { name: 'Pricing country' }), {
      target: { value: 'US' },
    })

    await waitFor(() => expect(announcement).toHaveTextContent('PayPal is available for United States.'))
    expect(announcement).toHaveAttribute('aria-live', 'polite')
    expect(announcement).toHaveAttribute('aria-atomic', 'true')
  })

  it('treats the initial unknown state as an accessible payment-method check', () => {
    global.fetch = jest.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch
    render(<PricingPage />)

    expect(screen.getByText('Checking available payment methods…', {
      selector: 'p:not(.sr-only)',
    })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Checking available payment methods…')
  })

  it('replaces a stale availability announcement when revalidation starts', async () => {
    const fetchMock = installEligibilityMock()
    render(<PricingPage />)

    const announcement = screen.getByRole('status')
    await waitFor(() => expect(announcement).toHaveTextContent('M-Pesa is available for Kenya.'))

    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}))
    fireEvent.change(screen.getByRole('combobox', { name: 'Pricing country' }), {
      target: { value: 'US' },
    })

    await waitFor(() => expect(announcement).toHaveTextContent('Checking available payment methods…'))
    expect(announcement).not.toHaveTextContent('M-Pesa is available for Kenya.')
  })

  it('keeps an arbitrary locale country visible and requests it truthfully', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-CA', configurable: true })
    const fetchMock = installEligibilityMock()

    render(<PricingPage />)

    expect(await screen.findByRole('option', { name: 'Other (CA)' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Pricing country' })).toHaveValue('CA')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.searchParams.get('countryCode')).toBe('CA')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Other (CA)'))
  })

  it('keeps a cached arbitrary ISO country visible and requests it truthfully', async () => {
    localStorage.setItem('metardu:currency', JSON.stringify({
      code: 'USD',
      countryCode: 'CA',
      ts: Date.now(),
    }))
    const fetchMock = installEligibilityMock()

    render(<PricingPage />)

    expect(await screen.findByRole('option', { name: 'Other (CA)' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Pricing country' })).toHaveValue('CA')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.searchParams.get('countryCode')).toBe('CA')
  })

  it('re-queries only the selected plan when its seat count changes', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true })
    const fetchMock = installEligibilityMock()
    render(<PricingPage />)

    await screen.findByRole('link', { name: 'Continue with PayPal →' })
    fetchMock.mockClear()
    fireEvent.change(screen.getByRole('combobox', { name: 'Pricing plan' }), {
      target: { value: 'team' },
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    let requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.searchParams.get('planId')).toBe('team')
    expect(requestUrl.searchParams.get('seatCount')).toBe('3')

    fetchMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Add one seat' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.searchParams.get('planId')).toBe('team')
    expect(requestUrl.searchParams.get('seatCount')).toBe('4')
  })

  it('uses the server PayPal extra-seat reason without a disabled PayPal CTA', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true })
    installEligibilityMock({
      unavailableReason: {
        code: 'PAYPAL_EXTRA_SEATS_UNAVAILABLE',
        planId: 'team',
        seatCount: 4,
      },
    })
    render(<PricingPage />)

    await screen.findByRole('link', { name: 'Continue with PayPal →' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Pricing plan' }), {
      target: { value: 'team' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add one seat' }))

    expect(await screen.findByText(/PayPal supports included seats only/i, {
      selector: 'p:not(.sr-only)',
    })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adjust seat count' })).toBeInTheDocument()
    expect(screen.queryByText('PayPal checkout')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue with PayPal/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continue with PayPal/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/PayPal will charge/i)).not.toBeInTheDocument()
  })

  it('uses a generic server unavailability reason without rendering a provider CTA', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true })
    installEligibilityMock({
      unavailableReason: { code: 'PROVIDER_UNAVAILABLE' },
    })
    render(<PricingPage />)

    expect(await screen.findByText(/payment provider is temporarily unavailable/i, {
      selector: 'p:not(.sr-only)',
    })).toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.queryByText('PayPal checkout')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue with PayPal/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continue with PayPal/ })).not.toBeInTheDocument()
  })

  it('sends the validated M-Pesa pricing CTA to the unified STK checkout', async () => {
    render(<PricingPage />)

    const cta = await screen.findByRole('link', { name: /Continue with M-Pesa/ })
    const checkoutUrl = new URL(cta.getAttribute('href') ?? '', 'https://metardu.test')
    expect(checkoutUrl.pathname).toBe('/checkout')
    expect(Object.fromEntries(checkoutUrl.searchParams)).toEqual({
      plan: 'pro',
      currency: 'KES',
      countryCode: 'KE',
      seats: '1',
      method: 'mpesa',
    })
    expect(screen.queryByText(/TILL NUMBER/i)).not.toBeInTheDocument()
  })

  it('never renders a direct-card or Stripe option', async () => {
    render(<PricingPage />)

    await screen.findByRole('link', { name: /Continue with M-Pesa/ })
    expect(screen.queryByRole('link', { name: /card|stripe/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/direct card|stripe/i)).not.toBeInTheDocument()
  })
})
