import { NextRequest, NextResponse } from 'next/server'
import { getStripeService } from '@/lib/payments/stripe'
import { createClient } from '@/lib/api-client/server'
import { apiSuccess, apiError } from '@/lib/api/response'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  try {
    const { reviewRequestId } = await req.json()
    if (!reviewRequestId) {
      return NextResponse.json(apiError('Missing reviewRequestId'), { status: 400 })
    }

    const dbClient = await createClient()
    const { data: authSession } = await dbClient.auth.getSession()
    const user = authSession.session?.user ?? null

    // For peer reviews, they might not be fully registered but we can try to link if logged in
    const stripe = getStripeService()
    if (!stripe) {
      log({ level: 'error', message: 'Stripe service is not configured or failed to initialize' })
      return NextResponse.json(apiError('Stripe not configured', { fallback: true }), { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const checkoutSession = await stripe.createCheckoutSession({
      mode: 'payment',
      amount: 2500, // KES 2,500
      currency: 'KES',
      name: 'Peer Review Request',
      successUrl: `${appUrl}/peer-review?payment=success&request_id=${reviewRequestId}`,
      cancelUrl: `${appUrl}/peer-review?payment=cancelled`,
      metadata: {
        type: 'peer_review',
        review_request_id: reviewRequestId,
        user_id: user?.id || ''
      }
    })

    return NextResponse.json(apiSuccess({ url: checkoutSession.url }))
  } catch (error: any) {
    log({ level: 'error', message: 'Peer review checkout error', metadata: { error } })
    return NextResponse.json(apiError('Failed to initialize payment checkout session'), { status: 500 })
  }
}
