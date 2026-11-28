/** @jest-environment node */
import { startSubscriptionPayment } from '../payments'

describe('subscription payment client helper', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('starts the selected provider without sending a client-derived charge amount', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        kind: 'redirect',
        provider: 'paypal',
        url: 'https://paypal.test/approve',
        paymentId: 'payment-1',
      }),
    } as unknown as Response)

    await startSubscriptionPayment({
      planId: 'pro',
      currency: 'USD',
      method: 'paypal',
      seatCount: 1,
      email: 'buyer@example.com',
      countryCode: 'US',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      action: 'start-subscription',
      provider: 'paypal',
      planId: 'pro',
      currency: 'USD',
      seatCount: 1,
      email: 'buyer@example.com',
      countryCode: 'US',
    })
    expect(body).not.toHaveProperty('amount')
    expect(body).not.toHaveProperty('chargeAmount')
  })
})
