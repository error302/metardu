import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getStripeService } from '@/lib/payments/stripe'
import { getPayPalService } from '@/lib/payments/paypal'
import { getMpesaService } from '@/lib/payments/mpesa'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import db from '@/lib/db'
import type { CurrencyCode, PlanId } from '@/lib/subscription/catalog'
import { getPlan } from '@/lib/subscription/catalog'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const schema = z.object({
      provider: z.enum(['stripe', 'paypal', 'mpesa']),
      action: z.string(),
    })
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const { provider, action } = parsed.data
    const params = (body ?? {}) as Record<string, any>

    const session = await getServerSession(authOptions)
    const user = session?.user ? { id: (session.user as any).id, email: session.user.email } : null

    const requireUser = () => {
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return null
    }

    const getPlanPricing = (planId: string, currency: string) => {
      const plan = getPlan(planId)
      if (!plan) {
        return { ok: false as const, response: NextResponse.json({ error: 'Unknown plan' }, { status: 400 }) }
      }
      const c = currency as CurrencyCode
      const amount = plan.prices[c]
      if (amount === undefined) {
        return { ok: false as const, response: NextResponse.json({ error: 'Unsupported currency' }, { status: 400 }) }
      }
      return { ok: true as const, plan, currency: c, amount }
    }

    const activateSubscription = async (input: {
      planId: PlanId
      payment_method: string
      currency: CurrencyCode
      amount: number
      transaction_id?: string
      status: 'completed' | 'failed'
      paymentId?: string
    }) => {
      if (!user) return

      if (input.status === 'completed') {
        // Upsert-style: replace existing subscription row for this user.
        const { rows: existing } = await db.query(
          'SELECT id FROM user_subscriptions WHERE user_id = $1 LIMIT 1',
          [user.id]
        )

        const now = new Date().toISOString()
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

        if (existing.length > 0) {
          await db.query(
            `UPDATE user_subscriptions SET plan_id = $1, status = 'active', payment_method = $2, currency = $3, current_period_start = $4, current_period_end = $5 WHERE id = $6`,
            [input.planId, input.payment_method, input.currency, now, periodEnd, existing[0].id]
          )
        } else {
          await db.query(
            `INSERT INTO user_subscriptions (user_id, plan_id, status, payment_method, currency, current_period_start, current_period_end) VALUES ($1, $2, 'active', $3, $4, $5, $6)`,
            [user.id, input.planId, input.payment_method, input.currency, now, periodEnd]
          )
        }
      }

      if (input.paymentId) {
        await db.query(
          `UPDATE payment_history SET status = $1, transaction_id = $2 WHERE id = $3 AND user_id = $4`,
          [input.status, input.transaction_id ?? null, input.paymentId, user.id]
        )
      }
    }

    // Unified subscription checkout entrypoint (server validates amount from plan).
    if (action === 'start-subscription') {
      const authResp = requireUser()
      if (authResp) return authResp

      const startSchema = z.object({
        planId: z.enum(['free', 'pro', 'team']),
        currency: z.string().min(3).max(3),
        email: z.string().email().optional(),
        phoneNumber: z.string().optional(),
        country: z.string().optional(),
      })
      const start = startSchema.safeParse(params)
      if (!start.success) {
        return NextResponse.json({ error: 'Invalid request.', issues: start.error.issues }, { status: 400 })
      }

      const { planId, currency } = start.data
      const priced = getPlanPricing(planId, currency)
      if (!priced.ok) return priced.response

      // Free plan: activate immediately.
      if (priced.amount <= 0) {
        await activateSubscription({
          planId,
          payment_method: 'free',
          currency: priced.currency,
          amount: 0,
          status: 'completed',
        })
        return NextResponse.json({ kind: 'activated', planId })
      }

      // Create payment history row first (links provider callbacks to a user safely).
      let paymentId: string
      try {
        const { rows } = await db.query(
          `INSERT INTO payment_history (user_id, amount, currency, status, payment_method, plan_id) VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING id`,
          [user!.id, priced.amount, priced.currency, provider, planId]
        )
        if (!rows[0]?.id) throw new Error('No ID returned')
        paymentId = rows[0].id
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Failed to create payment record' }, { status: 500 })
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

      if (provider === 'stripe') {
        const stripe = getStripeService()
        if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })

        const session = await stripe.createCheckoutSession({
          mode: 'payment',
          amount: priced.amount,
          currency: priced.currency,
          name: `METARDU ${priced.plan.name}`,
          successUrl: `${appUrl}/subscription/success?provider=stripe&paymentId=${paymentId}&planId=${planId}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${appUrl}/subscription/cancel?provider=stripe&paymentId=${paymentId}&planId=${planId}`,
          metadata: {
            payment_id: paymentId,
            user_id: user!.id,
            plan_id: planId,
            currency: priced.currency,
          },
        })

        await db.query('UPDATE payment_history SET transaction_id = $1 WHERE id = $2 AND user_id = $3', [session.id, paymentId, user!.id])

        return NextResponse.json({ kind: 'redirect', provider: 'stripe', url: session.url, paymentId })
      }

      if (provider === 'paypal') {
        const paypal = getPayPalService()
        if (!paypal) return NextResponse.json({ error: 'PayPal not configured' }, { status: 500 })

        const order = await paypal.createOrder({
          amount: priced.amount,
          currency: priced.currency,
          description: `METARDU ${priced.plan.name} subscription`,
          returnUrl: `${appUrl}/subscription/success?provider=paypal&paymentId=${paymentId}&planId=${planId}`,
          cancelUrl: `${appUrl}/subscription/cancel?provider=paypal&paymentId=${paymentId}&planId=${planId}`,
        })

        const approval = order.links?.find((l) => l.rel === 'approve')?.href
        if (!approval) {
          return NextResponse.json({ error: 'PayPal did not return approval link' }, { status: 500 })
        }

        await db.query('UPDATE payment_history SET transaction_id = $1 WHERE id = $2 AND user_id = $3', [order.id, paymentId, user!.id])

        return NextResponse.json({ kind: 'redirect', provider: 'paypal', url: approval, paymentId })
      }

      if (provider === 'mpesa') {
        const mpesa = getMpesaService()
        if (!mpesa) return NextResponse.json({ error: 'M-Pesa not configured' }, { status: 500 })

        if (priced.currency !== 'KES') {
          return NextResponse.json({ error: 'M-Pesa payments must be in KES.' }, { status: 400 })
        }

        if (!start.data.phoneNumber) {
          return NextResponse.json({ error: 'Phone number required for M-Pesa.' }, { status: 400 })
        }

        const callbackUrl = `${appUrl}/api/payments/mpesa/callback?paymentId=${paymentId}&planId=${planId}`
        const result = await mpesa.initiateSTKPush({
          phoneNumber: start.data.phoneNumber,
          amount: priced.amount,
          reference: paymentId,
          description: `METARDU ${priced.plan.name} subscription`,
          callbackUrl,
        })

        await db.query('UPDATE payment_history SET transaction_id = $1 WHERE id = $2 AND user_id = $3', [result.checkoutRequestId, paymentId, user!.id])

        return NextResponse.json({
          kind: 'mpesa',
          provider: 'mpesa',
          paymentId,
          checkoutRequestId: result.checkoutRequestId,
        })
      }

      return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
    }

    switch (provider) {
      case 'stripe': {
        const stripe = getStripeService()
        if (!stripe) {
          return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
        }

        switch (action) {
          case 'confirm-session': {
            const authResp = requireUser()
            if (authResp) return authResp

            const s = z.object({ sessionId: z.string().min(1), paymentId: z.string().uuid(), planId: z.enum(['free','pro','team']) }).safeParse(params)
            if (!s.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

            const { rows: payRows } = await db.query(
              'SELECT id, plan_id, currency, amount, transaction_id, status FROM payment_history WHERE id = $1 AND user_id = $2 LIMIT 1',
              [s.data.paymentId, user!.id]
            )
            const pay = payRows[0] ?? null

            if (!pay) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
            if (pay.plan_id !== s.data.planId) return NextResponse.json({ error: 'Plan mismatch.' }, { status: 400 })
            if (pay.transaction_id && pay.transaction_id !== s.data.sessionId) {
              return NextResponse.json({ error: 'Transaction mismatch.' }, { status: 400 })
            }
            if (pay.status === 'completed') return NextResponse.json({ status: 'completed' })
            if (pay.status === 'failed') return NextResponse.json({ status: 'failed' })

            const session = await stripe.getCheckoutSession(s.data.sessionId)
            if (session.paymentStatus !== 'paid') {
              return NextResponse.json({ status: 'pending' })
            }

            if (String(pay.currency || '').toUpperCase() !== String(session.currency || '').toUpperCase()) {
              await activateSubscription({
                planId: s.data.planId,
                payment_method: 'stripe',
                currency: (pay.currency as CurrencyCode) || 'USD',
                amount: Number(pay.amount) || 0,
                transaction_id: session.id,
                status: 'failed',
                paymentId: s.data.paymentId,
              })
              return NextResponse.json({ status: 'failed' })
            }

            if (Number(pay.amount) !== Number(session.amountTotal)) {
              await activateSubscription({
                planId: s.data.planId,
                payment_method: 'stripe',
                currency: (pay.currency as CurrencyCode) || 'USD',
                amount: Number(pay.amount) || 0,
                transaction_id: session.id,
                status: 'failed',
                paymentId: s.data.paymentId,
              })
              return NextResponse.json({ status: 'failed' })
            }

            await activateSubscription({
              planId: s.data.planId,
              payment_method: 'stripe',
              currency: session.currency as CurrencyCode,
              amount: session.amountTotal,
              transaction_id: session.id,
              status: 'completed',
              paymentId: s.data.paymentId,
            })

            return NextResponse.json({ status: 'completed' })
          }

          default:
            return NextResponse.json({ error: 'Unknown stripe action' }, { status: 400 })
        }
      }

      case 'paypal': {
        const paypal = getPayPalService()
        if (!paypal) {
          return NextResponse.json({ error: 'PayPal not configured' }, { status: 500 })
        }

        switch (action) {
          case 'capture-order': {
            const authResp = requireUser()
            if (authResp) return authResp

            const s = z.object({ orderId: z.string().min(1), paymentId: z.string().uuid(), planId: z.enum(['free','pro','team']) }).safeParse(params)
            if (!s.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

            const { rows: payRows } = await db.query(
              'SELECT id, plan_id, currency, amount, transaction_id, status FROM payment_history WHERE id = $1 AND user_id = $2 LIMIT 1',
              [s.data.paymentId, user!.id]
            )
            const pay = payRows[0] ?? null

            if (!pay) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
            if (pay.plan_id !== s.data.planId) return NextResponse.json({ error: 'Plan mismatch.' }, { status: 400 })
            if (pay.transaction_id && pay.transaction_id !== s.data.orderId) {
              return NextResponse.json({ error: 'Transaction mismatch.' }, { status: 400 })
            }
            if (pay.status === 'completed') return NextResponse.json({ status: 'completed' })
            if (pay.status === 'failed') return NextResponse.json({ status: 'failed' })

            const capture = await paypal.captureOrder(s.data.orderId)
            const status = capture.status?.toLowerCase() === 'completed' ? 'completed' : 'failed'

            if (status !== 'completed') {
              await activateSubscription({
                planId: s.data.planId,
                payment_method: 'paypal',
                currency: 'USD',
                amount: 0,
                transaction_id: s.data.orderId,
                status: 'failed',
                paymentId: s.data.paymentId,
              })
              return NextResponse.json({ status: 'failed' })
            }

            const amountStr =
              (capture as any).purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? '0'
            const currencyCode =
              (capture as any).purchase_units?.[0]?.payments?.captures?.[0]?.amount?.currency_code ?? 'USD'

            if (String(pay.currency || '').toUpperCase() !== String(currencyCode || '').toUpperCase()) {
              await activateSubscription({
                planId: s.data.planId,
                payment_method: 'paypal',
                currency: (pay.currency as CurrencyCode) || 'USD',
                amount: Number(pay.amount) || 0,
                transaction_id: s.data.orderId,
                status: 'failed',
                paymentId: s.data.paymentId,
              })
              return NextResponse.json({ status: 'failed' })
            }

            if (Number(pay.amount) !== Number(amountStr)) {
              await activateSubscription({
                planId: s.data.planId,
                payment_method: 'paypal',
                currency: (pay.currency as CurrencyCode) || 'USD',
                amount: Number(pay.amount) || 0,
                transaction_id: s.data.orderId,
                status: 'failed',
                paymentId: s.data.paymentId,
              })
              return NextResponse.json({ status: 'failed' })
            }

            await activateSubscription({
              planId: s.data.planId,
              payment_method: 'paypal',
              currency: currencyCode as CurrencyCode,
              amount: Number(amountStr),
              transaction_id: s.data.orderId,
              status: 'completed',
              paymentId: s.data.paymentId,
            })

            return NextResponse.json({ status: 'completed' })
          }

          default:
            return NextResponse.json({ error: 'Unknown paypal action' }, { status: 400 })
        }
      }

      case 'mpesa': {
        const mpesa = getMpesaService()
        if (!mpesa) {
          return NextResponse.json({ error: 'M-Pesa not configured' }, { status: 500 })
        }

        switch (action) {
          case 'check-status': {
            const authResp = requireUser()
            if (authResp) return authResp

            const s = z.object({ paymentId: z.string().uuid(), checkoutRequestId: z.string().min(1) }).safeParse(params)
            if (!s.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

            const { rows: payRows } = await db.query(
              'SELECT id, plan_id, currency, amount, status FROM payment_history WHERE id = $1 AND user_id = $2 LIMIT 1',
              [s.data.paymentId, user!.id]
            )
            const pay = payRows[0] ?? null

            if (!pay) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
            if (pay.status === 'completed') return NextResponse.json({ status: 'completed' })
            if (pay.status === 'failed') return NextResponse.json({ status: 'failed' })

            const result = await mpesa.checkTransactionStatus(s.data.checkoutRequestId)
            const status = result.status === 'completed' ? 'completed' : 'pending'

            if (status === 'completed') {
              await activateSubscription({
                planId: (pay.plan_id as PlanId) || 'pro',
                payment_method: 'mpesa',
                currency: (pay.currency as CurrencyCode) || 'KES',
                amount: Number(pay.amount) || 0,
                transaction_id: s.data.checkoutRequestId,
                status: 'completed',
                paymentId: s.data.paymentId,
              })
            }

            return NextResponse.json({ status })
          }

          default:
            return NextResponse.json({ error: 'Unknown mpesa action' }, { status: 400 })
        }
      }

      default:
        return NextResponse.json({ error: 'Unknown payment provider' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Payment failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Only report providers that have real (non-mock) keys configured
  const isReal = (key: string | undefined) => !!key && !key.includes('mockup') && !key.includes('Mock')

  const stripe = isReal(process.env.STRIPE_SECRET_KEY)
  const paypal = isReal(process.env.PAYPAL_CLIENT_ID)
  const mpesa = isReal(process.env.MPESA_CONSUMER_KEY)
  const airtel = isReal(process.env.AIRTEL_CLIENT_ID)

  const paymentMethods = [
    ...(stripe || paypal ? [{ id: 'card', name: 'Credit/Debit Card', providers: [stripe && 'stripe', paypal && 'paypal'].filter(Boolean) }] : []),
    ...(mpesa ? [{ id: 'mpesa', name: 'M-Pesa', providers: ['mpesa'] }] : []),
    ...(airtel ? [{ id: 'airtel_money', name: 'Airtel Money', providers: ['airtel'] }] : []),
    ...(paypal ? [{ id: 'paypal', name: 'PayPal', providers: ['paypal'] }] : []),
  ]

  return NextResponse.json({
    providers: { stripe, paypal, mpesa, airtel },
    currencies: ['USD', 'KES', 'UGX', 'TZ', 'EUR', 'GBP'],
    paymentMethods,
  })
}
