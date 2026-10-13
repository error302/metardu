import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * The former direct-order path granted a fixed 30-day plan after a one-time
 * PayPal capture, while the product sells recurring subscriptions. The UI has
 * no callers for this route; retire it so new purchases use the validated
 * recurring-plan flow in /api/payments.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'This PayPal order checkout is retired. Use the recurring subscription checkout.',
      code: 'PAYPAL_ORDER_CHECKOUT_RETIRED',
      checkoutEndpoint: '/api/payments',
      action: 'start-subscription',
      provider: 'paypal',
    },
    { status: 410 },
  )
}
