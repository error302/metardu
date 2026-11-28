import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import CheckoutPage from './page'

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}))

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

const mockedUseSearchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>
const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>

const originalFetch = global.fetch

type FetchMock = jest.Mock<
  Promise<Response>,
  [input: RequestInfo | URL, init?: RequestInit]
>

type ServerMethod = {
  id: 'mpesa' | 'paypal'
  provider: 'mpesa' | 'paypal'
  label: string
  chargeCurrency: string
  chargeAmount: number
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response
}

function eligibilityResponse({
  market = 'kenya',
  currency = 'KES',
  methods,
  reason,
}: {
  market?: 'kenya' | 'international'
  currency?: string
  methods: Array<ServerMethod | Record<string, unknown>>
  reason?: { code: string; message: string }
}): Response {
  return jsonResponse({
    eligibility: {
      ok: true,
      market,
      currency,
      methods,
      ...(reason ? { reason } : {}),
    },
  })
}

function setSearchParams(params: Record<string, string>) {
  mockedUseSearchParams.mockReturnValue(new URLSearchParams(params) as ReturnType<typeof useSearchParams>)
}

beforeEach(() => {
  mockedUseSearchParams.mockReturnValue(new URLSearchParams() as ReturnType<typeof useSearchParams>)
  mockedUseSession.mockReturnValue({ status: 'unauthenticated', data: null } as ReturnType<typeof useSession>)
})

afterEach(() => {
  global.fetch = originalFetch
  jest.clearAllMocks()
})

describe('regional checkout payment eligibility', () => {
  it('fails closed while eligible payment methods are unknown', async () => {
    global.fetch = jest.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch
    render(<CheckoutPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Checking available payment methods…')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review Order' })).toBeDisabled()
  })

  it('requests eligibility for the country, currency, and plan and renders only the validated server method', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockResolvedValue(
      eligibilityResponse({
        methods: [{
          id: 'mpesa',
          provider: 'mpesa',
          label: 'M-PESA STK Push',
          chargeCurrency: 'KES',
          chargeAmount: 2500,
        }],
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'KES', countryCode: 'KE' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('radio', { name: 'Pay with M-PESA STK Push' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /PayPal/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /card|stripe/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/direct card|stripe/i)).not.toBeInTheDocument()

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

  it.each([
    ['unsupported', { plan: 'not-a-plan', currency: 'KES', countryCode: 'KE', seats: '1' }, 'not-a-plan', 'INVALID_PLAN'],
    ['missing', { currency: 'KES', countryCode: 'KE', seats: '1' }, '', 'INVALID_PLAN'],
  ])('requests a %s plan unchanged so the server can reject it', async (_label, params, expectedPlanId, expectedCode) => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockResolvedValue(
      jsonResponse({
        error: 'Choose a valid self-serve plan before checking payment methods.',
        code: expectedCode,
      }, false),
    )
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams(params)

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedCode)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.searchParams.get('planId')).toBe(expectedPlanId)
  })

  it('requests invalid seats unchanged so the server can reject them', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockResolvedValue(
      jsonResponse({
        error: 'Choose a valid number of seats before checking payment methods.',
        code: 'INVALID_SEATS',
      }, false),
    )
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'team', currency: 'KES', countryCode: 'KE', seats: '0' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('INVALID_SEATS')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.searchParams.get('seatCount')).toBe('0')
  })

  it('requests an invalid country unchanged so the server can reject it', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockResolvedValue(
      jsonResponse({
        error: 'A valid country is required before starting payment.',
        code: 'COUNTRY_REQUIRED',
      }, false),
    )
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'KES', countryCode: 'X', seats: '1' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('COUNTRY_REQUIRED')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.searchParams.get('countryCode')).toBe('X')
  })

  it('rejects the entire response when one returned method is malformed', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      eligibilityResponse({
        methods: [
          {
            id: 'mpesa',
            provider: 'mpesa',
            label: 'M-Pesa',
            chargeCurrency: 'KES',
            chargeAmount: 2500,
          },
          {
            id: 'paypal',
            provider: 'paypal',
            label: 'PayPal',
            chargeCurrency: 'USD',
            chargeAmount: 0,
          },
        ],
      })
    ) as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'KES', countryCode: 'KE' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't verify available payment methods/i)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('derives an unavailable requested-method message from validated state and offers a working retry', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockResolvedValue(
      eligibilityResponse({
        methods: [{
          id: 'mpesa',
          provider: 'mpesa',
          label: 'M-Pesa',
          chargeCurrency: 'KES',
          chargeAmount: 2500,
        }],
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'KES', countryCode: 'KE', method: 'paypal' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText(/PayPal is not available.*Available method: M-Pesa/i)).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: /retry payment method check/i })
    fireEvent.click(retry)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('honors a requested method only when the server returns that method', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      eligibilityResponse({
        methods: [{
          id: 'mpesa',
          provider: 'mpesa',
          label: 'M-Pesa',
          chargeCurrency: 'KES',
          chargeAmount: 2500,
        }],
      })
    ) as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'KES', countryCode: 'KE', method: 'paypal' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    const mpesa = await screen.findByRole('radio', { name: 'Pay with M-Pesa' })
    await waitFor(() => expect(mpesa).not.toBeChecked())
  })

  it('selects a requested method when the server returns it', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      eligibilityResponse({
        market: 'international',
        currency: 'UGX',
        methods: [{
          id: 'paypal',
          provider: 'paypal',
          label: 'PayPal',
          chargeCurrency: 'USD',
          chargeAmount: 19,
        }],
      })
    ) as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'UGX', countryCode: 'UG', method: 'paypal' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    const paypal = await screen.findByRole('radio', { name: 'Pay with PayPal' })
    await waitFor(() => expect(paypal).toBeChecked())
  })

  it('does not retain PayPal when a method-only transition requests M-Pesa', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockResolvedValue(
      eligibilityResponse({
        market: 'international',
        currency: 'UGX',
        methods: [{
          id: 'paypal',
          provider: 'paypal',
          label: 'PayPal',
          chargeCurrency: 'USD',
          chargeAmount: 19,
        }],
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'UGX', countryCode: 'UG', method: 'paypal' })

    const { rerender } = render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const paypal = await screen.findByRole('radio', { name: 'Pay with PayPal' })
    await waitFor(() => expect(paypal).toBeChecked())

    setSearchParams({ plan: 'pro', currency: 'UGX', countryCode: 'UG', method: 'mpesa' })
    rerender(<CheckoutPage />)

    await waitFor(() => expect(paypal).not.toBeChecked())
    expect(screen.getByText(/M-Pesa is not available.*Available method: PayPal/i)).toBeInTheDocument()
  })

  it('clears a stale unavailable-method message when the requested method becomes available', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockImplementation(async (input: RequestInfo | URL) => {
      const requestUrl = new URL(String(input), 'https://metardu.test')
      if (requestUrl.searchParams.get('countryCode') === 'KE') {
        return eligibilityResponse({
          methods: [{
            id: 'mpesa',
            provider: 'mpesa',
            label: 'M-Pesa',
            chargeCurrency: 'KES',
            chargeAmount: 2500,
          }],
        })
      }
      return eligibilityResponse({
        market: 'international',
        currency: 'UGX',
        methods: [{
          id: 'paypal',
          provider: 'paypal',
          label: 'PayPal',
          chargeCurrency: 'USD',
          chargeAmount: 19,
        }],
      })
    })
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'KES', countryCode: 'KE', method: 'paypal' })

    const { rerender } = render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/PayPal is not available.*Available method: M-Pesa/i)).toBeInTheDocument()

    setSearchParams({ plan: 'pro', currency: 'UGX', countryCode: 'UG', method: 'paypal' })
    rerender(<CheckoutPage />)

    const paypal = await screen.findByRole('radio', { name: 'Pay with PayPal' })
    await waitFor(() => expect(paypal).toBeChecked())
    expect(screen.queryByText(/is not available/i)).not.toBeInTheDocument()
  })

  it('groups method-specific radios under an accessible payment-method legend', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      eligibilityResponse({
        market: 'international',
        currency: 'UGX',
        methods: [{
          id: 'paypal',
          provider: 'paypal',
          label: 'PayPal',
          chargeCurrency: 'USD',
          chargeAmount: 19,
        }],
      })
    ) as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'UGX', countryCode: 'UG' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    const paypal = await screen.findByRole('radio', { name: 'Pay with PayPal' })
    const group = screen.getByRole('group', { name: 'Payment method' })
    expect(group).toContainElement(paypal)
  })

  it('preserves an international ISO country code that has no local display option', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockResolvedValue(
      eligibilityResponse({
        market: 'international',
        currency: 'KES',
        methods: [{
          id: 'paypal',
          provider: 'paypal',
          label: 'PayPal',
          chargeCurrency: 'USD',
          chargeAmount: 19,
        }],
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'KES', countryCode: 'CA' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('radio', { name: 'Pay with PayPal' })).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.searchParams.get('countryCode')).toBe('CA')
  })

  it('sends the ISO country code when starting a subscription', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse({
          kind: 'mpesa',
          provider: 'mpesa',
          paymentId: '90000000-0000-4000-8000-000000000011',
          checkoutRequestId: 'ws_CO_TEST',
        })
      }
      return eligibilityResponse({
        methods: [{
          id: 'mpesa',
          provider: 'mpesa',
          label: 'M-Pesa',
          chargeCurrency: 'KES',
          chargeAmount: 2500,
        }],
      })
    })
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'KES', countryCode: 'KE' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('radio', { name: 'Pay with M-Pesa' })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'buyer@example.com' } })
    fireEvent.change(screen.getByLabelText('Phone (M-Pesa only)'), { target: { value: '254712345678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review Order' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pay Now' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(postCall).toBeDefined()
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      action: 'start-subscription',
      provider: 'mpesa',
      countryCode: 'KE',
    })
  })

  it('refuses a second payment submission while the first is in flight', async () => {
    let releasePayment!: (value: Response) => void
    const inFlight = new Promise<Response>((resolve) => {
      releasePayment = resolve
    })
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return inFlight
      return eligibilityResponse({
        methods: [{
          id: 'mpesa',
          provider: 'mpesa',
          label: 'M-Pesa',
          chargeCurrency: 'KES',
          chargeAmount: 2500,
        }],
      })
    })
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'KES', countryCode: 'KE' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('radio', { name: 'Pay with M-Pesa' })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'buyer@example.com' } })
    fireEvent.change(screen.getByLabelText('Phone (M-Pesa only)'), { target: { value: '254712345678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review Order' }))

    // Both clicks land on the same element before the first request settles.
    // The ref guard must allow exactly one paid request; the async state guard
    // alone would allow both.
    const payButton = screen.getByRole('button', { name: 'Pay Now' })
    fireEvent.click(payButton)
    fireEvent.click(payButton)
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1)

    releasePayment(jsonResponse({
      kind: 'mpesa',
      provider: 'mpesa',
      paymentId: '90000000-0000-4000-8000-000000000012',
      checkoutRequestId: 'ws_CO_GUARD',
    }))
  })

  it('discloses the server-supplied PayPal charge instead of a catalog-derived amount', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      eligibilityResponse({
        market: 'international',
        currency: 'UGX',
        methods: [{
          id: 'paypal',
          provider: 'paypal',
          label: 'PayPal',
          chargeCurrency: 'USD',
          chargeAmount: 37,
        }],
      })
    ) as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'UGX', countryCode: 'UG' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('radio', { name: 'Pay with PayPal' })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'buyer@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review Order' }))

    expect(screen.getByText('PayPal will charge $37 USD each month.')).toBeInTheDocument()
    expect(screen.queryByText(/PayPal will charge USh/i)).not.toBeInTheDocument()
  })

  it('fails closed with the accurate included-seats-only message when PayPal has no extra-seat quote', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockResolvedValue(
      eligibilityResponse({
        market: 'international',
        currency: 'USD',
        methods: [],
        reason: {
          code: 'PAYPAL_EXTRA_SEATS_UNAVAILABLE',
          message: 'PayPal supports included seats only. Reduce the seat count to the included seats or contact METARDU support for additional seats.',
        },
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'team', currency: 'USD', countryCode: 'US', seats: '4' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText(/PayPal supports included seats only/i)).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByText(/PayPal will charge/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review Order' })).toBeDisabled()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://metardu.test')
    expect(requestUrl.searchParams.get('seatCount')).toBe('4')
  })

  it('exposes the server reason and a retry for generic unavailability', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >().mockResolvedValue(
      eligibilityResponse({
        market: 'international',
        currency: 'USD',
        methods: [],
        reason: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'The payment provider is temporarily unavailable. Please try again later.',
        },
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'USD', countryCode: 'US' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText(/payment provider is temporarily unavailable/i)).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: /retry payment method check/i })
    fireEvent.click(retry)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('uses the server PayPal extra-seat reason even when local seat data differs', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      eligibilityResponse({
        market: 'international',
        currency: 'USD',
        methods: [],
        reason: {
          code: 'PAYPAL_EXTRA_SEATS_UNAVAILABLE',
          message: 'PayPal supports included seats only. Reduce the seat count to the included seats or contact METARDU support for additional seats.',
        },
      })
    ) as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'USD', countryCode: 'US', seats: '1' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText(/PayPal supports included seats only/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adjust seat count' })).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('does not infer a PayPal extra-seat failure from local plan and seat data', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      eligibilityResponse({
        market: 'international',
        currency: 'USD',
        methods: [],
        reason: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'The payment provider is temporarily unavailable. Please try again later.',
        },
      })
    ) as unknown as typeof fetch
    setSearchParams({ plan: 'team', currency: 'USD', countryCode: 'US', seats: '4' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText(/payment provider is temporarily unavailable/i)).toBeInTheDocument()
    expect(screen.queryByText(/PayPal supports included seats only/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adjust seat count' })).not.toBeInTheDocument()
  })

  it('clears a stale server unavailability reason when a method becomes available', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >()
      .mockResolvedValueOnce(eligibilityResponse({
        market: 'international',
        currency: 'USD',
        methods: [],
        reason: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'The payment provider is temporarily unavailable. Please try again later.',
        },
      }))
      .mockResolvedValueOnce(eligibilityResponse({
        market: 'international',
        currency: 'USD',
        methods: [{
          id: 'paypal',
          provider: 'paypal',
          label: 'PayPal',
          chargeCurrency: 'USD',
          chargeAmount: 19,
        }],
      }))
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'USD', countryCode: 'US' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/payment provider is temporarily unavailable/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /retry payment method check/i }))

    expect(await screen.findByRole('radio', { name: 'Pay with PayPal' })).toBeInTheDocument()
    expect(screen.queryByText(/payment provider is temporarily unavailable/i)).not.toBeInTheDocument()
  })

  it('offers a real retry when the availability request fails', async () => {
    const fetchMock: FetchMock = jest.fn<
      Promise<Response>,
      [input: RequestInfo | URL, init?: RequestInit]
    >()
      .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, false))
      .mockResolvedValueOnce(eligibilityResponse({
        methods: [{
          id: 'mpesa',
          provider: 'mpesa',
          label: 'M-Pesa',
          chargeCurrency: 'KES',
          chargeAmount: 2500,
        }],
      }))
    global.fetch = fetchMock as unknown as typeof fetch
    setSearchParams({ plan: 'pro', currency: 'KES', countryCode: 'KE' })

    render(<CheckoutPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't verify available payment methods/i)
    fireEvent.click(screen.getByRole('button', { name: /retry payment method check/i }))

    expect(await screen.findByRole('radio', { name: 'Pay with M-Pesa' })).toBeInTheDocument()
  })
})
