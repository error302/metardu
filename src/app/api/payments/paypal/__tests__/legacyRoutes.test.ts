/** @jest-environment node */
import { POST as createLegacyOrder } from '../create/route'
import { POST as captureLegacyOrder } from '../capture/route'

describe('retired PayPal one-time order endpoints', () => {
  it('directs order creation to the recurring subscription checkout without creating an order', async () => {
    const response = await createLegacyOrder()
    const body: unknown = await response.json()

    expect(response.status).toBe(410)
    expect(body).toMatchObject({
      code: 'PAYPAL_ORDER_CHECKOUT_RETIRED',
      checkoutEndpoint: '/api/payments',
      action: 'start-subscription',
      provider: 'paypal',
    })
  })

  it('does not capture legacy orders or grant fixed-term access', async () => {
    const response = await captureLegacyOrder()
    const body: unknown = await response.json()

    expect(response.status).toBe(410)
    expect(body).toMatchObject({
      code: 'PAYPAL_ORDER_CAPTURE_RETIRED',
      checkoutEndpoint: '/api/payments',
      action: 'start-subscription',
      provider: 'paypal',
    })
  })
})
