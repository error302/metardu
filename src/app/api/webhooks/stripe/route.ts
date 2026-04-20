import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/api-client/server'
import { getStripeService } from '@/lib/payments/stripe'
import type { CurrencyCode } from '@/lib/subscription/catalog'

export async function POST(request: NextRequest) {
  const stripe = getStripeService()
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const payload = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: any
  try {
    if (!stripe.verifyWebhookSignature(payload, signature)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
    }
    event = JSON.parse(payload)
  } catch (err: any) {
    console.error('Stripe webhook verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  const db = (await import('@/lib/db')).default

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const paymentId = session.metadata?.payment_id
      const userId = session.metadata?.user_id
      const planId = session.metadata?.plan_id

      if (session.metadata?.type === 'peer_review') {
        const reviewReqId = session.metadata.review_request_id
        if (reviewReqId) {
          await db.query(
            'UPDATE peer_reviews SET payment_status = $1, stripe_payment_intent_id = $2 WHERE id = $3',
            ['paid', session.payment_intent, reviewReqId]
          )
        }
        break
      }

      if (!paymentId || !userId || !planId) {
        console.error('Stripe webhook: missing metadata in checkout.session.completed')
        break
      }

      const now = new Date()
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

      const { rows: existingRows } = await db.query(
        'SELECT id FROM user_subscriptions WHERE user_id = $1 LIMIT 1',
        [userId]
      )
      const existing = existingRows[0]

      const currency = (session.currency || 'USD').toUpperCase()

      if (existing?.id) {
        await db.query(
          `UPDATE user_subscriptions 
           SET plan_id = $1, status = $2, payment_method = $3, currency = $4, current_period_start = $5, current_period_end = $6
           WHERE id = $7`,
          [planId, 'active', 'stripe', currency, now.toISOString(), periodEnd.toISOString(), existing.id]
        )
      } else {
        await db.query(
          `INSERT INTO user_subscriptions (user_id, plan_id, status, payment_method, currency, current_period_start, current_period_end)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, planId, 'active', 'stripe', currency, now.toISOString(), periodEnd.toISOString()]
        )
      }

      await db.query(
        'UPDATE payment_history SET status = $1, transaction_id = $2 WHERE id = $3 AND user_id = $4',
        ['completed', session.id, paymentId, userId]
      )

      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object
      const customerId = sub.customer
      const status = sub.status
      const planId = sub.metadata?.plan_id || 'free'

      const { rows: userRows } = await db.query(
        'SELECT user_id FROM user_subscriptions WHERE user_id = $1 LIMIT 1',
        [sub.metadata?.user_id || '']
      )
      const user = userRows[0]

      if (user) {
        const newStatus = status === 'active' ? 'active' : status === 'past_due' ? 'active' : 'cancelled'
        await db.query(
          'UPDATE user_subscriptions SET status = $1 WHERE user_id = $2',
          [newStatus, user.user_id]
        )
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const userId = sub.metadata?.user_id

      if (userId) {
        await db.query(
          'UPDATE user_subscriptions SET status = $1 WHERE user_id = $2',
          ['cancelled', userId]
        )
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const customerId = invoice.customer

      const { rows: userSubRows } = await db.query(
        'SELECT user_id FROM user_subscriptions WHERE user_id = $1 LIMIT 1',
        [invoice.metadata?.user_id || '']
      )
      const userSub = userSubRows[0]

      if (userSub) {
        await db.query(
          'UPDATE user_subscriptions SET status = $1 WHERE user_id = $2',
          ['expired', userSub.user_id]
        )
      }
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}
