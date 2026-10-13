import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Retire capture alongside the legacy one-time order route. Recurring PayPal
 * subscriptions are verified and activated by the subscription return and
 * signed webhook paths; this fixed-term capture flow must not grant access.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'This PayPal order capture is retired. Complete a recurring subscription through the current checkout.',
      code: 'PAYPAL_ORDER_CAPTURE_RETIRED',
      checkoutEndpoint: '/api/payments',
      action: 'start-subscription',
      provider: 'paypal',
    },
    { status: 410 },
  )
}
