export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPublicAppUrl } from '@/lib/site'
import { getPayPalService, getPayPalPlanId, resolvePayPalCurrency } from '@/lib/payments/paypal'
import { validatePayPalBillingPlan } from '@/lib/payments/paypalPlanValidation'
import {
  classifyMpesaResultCode,
  getMpesaService,
  MpesaPhoneNumberError,
  MpesaProviderError,
  normalizeMpesaPhoneNumber,
} from '@/lib/payments/mpesa'
import {
  completeMpesaPayment,
  type MpesaCompletionRecord,
} from '@/lib/payments/mpesaCompletion'
import {
  createPaymentUnavailableReason,
  normalizeCountryCode,
  quoteEligiblePaymentMethodsWithReason,
  resolvePaymentEligibility,
  type PaymentUnavailableReason,
  type QuotedPaymentMethod,
} from '@/lib/payments/eligibility'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import type { CurrencyCode, PlanId } from '@/lib/subscription/catalog'
import { getPlan, getTotalPrice, SUPPORTED_CURRENCIES } from '@/lib/subscription/catalog'
import { resolveSeatSelection, seatCountFromPaymentMetadata } from '@/lib/subscription/seatSelection'
import { sendPurchaseReceipt } from '@/lib/payments/receipt'

// ─── Row types ────────────────────────────────────────────────────────────
interface SubscriptionRow {
  id: string
}

interface PaymentHistoryRow {
  id: string
  user_id: string
  plan_id: string | null
  currency: string | null
  amount: number | string | null
  transaction_id: string | null
  status: string | null
  checkout_request_id: string | null
  phone_number: string | null
  metadata?: unknown
}

// PayPal capture response — library types don't expose purchase_units
interface PayPalCapture {
  status?: string
  purchase_units?: {
    payments?: {
      captures?: {
        amount?: { value?: string; currency_code?: string }
      }[]
    }
  }[]
}

export const POST = apiHandler({ auth: true, rateLimit: { max: 10, windowMs: 60000 } }, async (req, ctx) => {
  const body = ctx.body as Record<string, unknown>
  const schema = z.object({
    provider: z.enum(['paypal', 'mpesa']),
    action: z.string(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { provider, action } = parsed.data
  const params = body
  const userId = ctx.userId

  const getPlanPricing = (planId: string, currency: string, seatCount: number) => {
    const plan = getPlan(planId)
    if (!plan) {
      return { ok: false as const, response: NextResponse.json({ error: 'Unknown plan' }, { status: 400 }) }
    }
    if (plan.contactSales) {
      return { ok: false as const, response: NextResponse.json({ error: 'This plan requires a sales agreement and is not available through self-serve checkout.' }, { status: 400 }) }
    }
    if (!SUPPORTED_CURRENCIES.includes(currency as CurrencyCode)) {
      return { ok: false as const, response: NextResponse.json({ error: 'Unsupported currency' }, { status: 400 }) }
    }
    const c = currency as CurrencyCode
    const amount = getTotalPrice(plan.id, c, seatCount)
    if (!Number.isFinite(amount)) {
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
    seatCount?: number
  }) => {
    if (input.status === 'completed') {
      const { rows: existing } = await db.query<SubscriptionRow>(
        'SELECT id FROM user_subscriptions WHERE user_id = $1 LIMIT 1',
        [userId]
      )
      const now = new Date().toISOString()
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      const plan = getPlan(input.planId)
      const totalSeats = plan && Number.isSafeInteger(input.seatCount) && (input.seatCount as number) >= plan.includedSeats
        ? input.seatCount as number
        : plan?.includedSeats ?? 1
      const purchasedExtraSeats = plan?.isPerSeat ? Math.max(0, totalSeats - plan.includedSeats) : 0

      if (existing.length > 0) {
        await db.query<never>(
          `UPDATE user_subscriptions
           SET plan_id = $1, status = 'active', payment_method = $2, currency = $3,
               current_period_start = $4, current_period_end = $5, seat_count = $7
           WHERE id = $6`,
          [input.planId, input.payment_method, input.currency, now, periodEnd, existing[0].id, purchasedExtraSeats]
        )
      } else {
        await db.query<never>(
          `INSERT INTO user_subscriptions
           (user_id, plan_id, status, payment_method, currency, current_period_start, current_period_end, seat_count)
           VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)`,
          [userId, input.planId, input.payment_method, input.currency, now, periodEnd, purchasedExtraSeats]
        )
      }
    }

    if (input.paymentId) {
      await db.query<never>(
        `UPDATE payment_history SET status = $1, transaction_id = $2 WHERE id = $3 AND user_id = $4`,
        [input.status, input.transaction_id ?? null, input.paymentId, userId]
      )
    }
  }

  // ─── Unified subscription checkout ──────────────────────────────────────
  if (action === 'start-subscription') {
    const startSchema = z.object({
      planId: z.enum(['free', 'pro', 'team', 'firm', 'enterprise']),
      currency: z.string().length(3).transform(value => value.toUpperCase()),
      email: z.string().email().optional(),
      phoneNumber: z.string().optional(),
      countryCode: z.string().optional(),
      country: z.string().optional(),
      seatCount: z.number().int().optional(),
    })
    const start = startSchema.safeParse(params)
    if (!start.success) {
      return NextResponse.json({ error: 'Invalid request.', issues: start.error.issues }, { status: 400 })
    }

    const { planId, currency } = start.data
    const countryCode = normalizeCountryCode(start.data.countryCode ?? start.data.country)
    if (!countryCode) {
      return NextResponse.json({
        error: 'A valid country is required before starting payment.',
        code: 'COUNTRY_REQUIRED',
      }, { status: 400 })
    }

    const regionalEligibility = resolvePaymentEligibility({
      countryCode,
      currency: currency as CurrencyCode,
      configured: { mpesa: true, paypal: true },
    })
    if (!regionalEligibility.ok) {
      return NextResponse.json({
        error: regionalEligibility.message,
        code: regionalEligibility.code,
      }, { status: 400 })
    }

    const eligibleMethod = regionalEligibility.methods.find(
      method => method.provider === provider
    )
    if (!eligibleMethod) {
      return NextResponse.json({
        error: provider === 'mpesa'
          ? 'M-Pesa is available only for customers in Kenya.'
          : 'PayPal is available for international customers only.',
        code: 'PAYMENT_METHOD_NOT_ELIGIBLE',
      }, { status: 409 })
    }

    const seatSelection = resolveSeatSelection(planId, start.data.seatCount)
    if (!seatSelection.ok) return NextResponse.json({ error: seatSelection.error }, { status: 400 })
    const seatCount = seatSelection.totalSeats
    const priced = getPlanPricing(planId, currency, seatCount)
    if (!priced.ok) return priced.response

    if (priced.amount <= 0) {
      if (planId !== 'free') {
        return NextResponse.json({ error: 'This plan is not available for self-serve checkout.' }, { status: 400 })
      }
      await activateSubscription({ planId, payment_method: 'free', currency: priced.currency, amount: 0, status: 'completed' })
      return NextResponse.json({ kind: 'activated', planId })
    }

    let paypalService: ReturnType<typeof getPayPalService> = null
    let mpesaService: ReturnType<typeof getMpesaService> = null
    let mpesaPhoneNumber: string | null = null
    let paypalPlanId: string | null = null
    let paypalCurrency: CurrencyCode = priced.currency
    let paypalAmount = 0
    if (provider === 'paypal') {
      if (seatSelection.extraSeats > 0) {
        return NextResponse.json({
          error: 'PayPal recurring plans currently support the included seats only. Contact support for additional seats.',
          code: 'PAYPAL_EXTRA_SEATS_UNAVAILABLE',
        }, { status: 409 })
      }
      paypalService = getPayPalService()
      if (!paypalService) return NextResponse.json({ error: 'PayPal is not configured.' }, { status: 503 })
      paypalCurrency = resolvePayPalCurrency(priced.currency)
      paypalPlanId = getPayPalPlanId(planId, paypalCurrency)
      if (!paypalPlanId) {
        return NextResponse.json({ error: 'PayPal recurring billing is not configured for this plan.' }, { status: 503 })
      }

      paypalAmount = getTotalPrice(planId, paypalCurrency, seatCount)
      if (!Number.isFinite(paypalAmount) || paypalAmount <= 0) {
        return NextResponse.json({ error: `PayPal pricing is unavailable for ${paypalCurrency}.` }, { status: 400 })
      }

      try {
        const billingPlan = await paypalService.getBillingPlan(paypalPlanId)
        const validation = validatePayPalBillingPlan(billingPlan, { amount: paypalAmount, currency: paypalCurrency })
        if (!validation.valid) {
          return NextResponse.json({
            error: 'PayPal is temporarily unavailable for this plan because its saved billing plan does not match METARDU pricing. Choose another payment method or contact support.',
            code: 'PAYPAL_PLAN_MISMATCH',
          }, { status: 409 })
        }
      } catch {
        // No payment row or PayPal subscription is created unless the current
        // live billing plan has been read and matched to the catalog.
        return NextResponse.json({ error: 'METARDU could not verify the PayPal billing plan. Please try another method or try again later.' }, { status: 503 })
      }
    }

    if (provider === 'mpesa') {
      if (priced.currency !== 'KES') return NextResponse.json({ error: 'M-Pesa payments must be in KES.' }, { status: 400 })
      mpesaPhoneNumber = normalizeMpesaPhoneNumber(start.data.phoneNumber ?? '')
      if (!mpesaPhoneNumber) {
        const phoneError = new MpesaPhoneNumberError()
        return NextResponse.json(
          { error: phoneError.message, code: 'MPESA_INVALID_PHONE' },
          { status: 400 },
        )
      }
      mpesaService = getMpesaService()
      if (!mpesaService) return NextResponse.json({ error: 'M-Pesa is not configured.' }, { status: 503 })
    }

    const paymentMetadata = JSON.stringify({
      seatCount,
      extraSeats: seatSelection.extraSeats,
      ...(provider === 'mpesa' && mpesaPhoneNumber
        ? { phoneNumber: mpesaPhoneNumber }
        : {}),
    })
    const { rows } = provider === 'mpesa'
      ? await db.query<Pick<PaymentHistoryRow, 'id'>>(
        `INSERT INTO payment_history
           (user_id, amount, currency, status, payment_method, plan_id,
            checkout_request_id, phone_number, metadata)
         VALUES ($1, $2, $3, 'pending', 'mpesa', $4, NULL, $5, $6)
         RETURNING id`,
        [userId, priced.amount, priced.currency, planId, mpesaPhoneNumber, paymentMetadata],
      )
      : await db.query<Pick<PaymentHistoryRow, 'id'>>(
        `INSERT INTO payment_history (user_id, amount, currency, status, payment_method, plan_id, metadata)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6) RETURNING id`,
        [userId, priced.amount, priced.currency, provider, planId, paymentMetadata],
      )
    if (!rows[0]?.id) throw new Error('No ID returned from payment_history insert')
    const paymentId = rows[0].id as string

    const appUrl = getPublicAppUrl()

    if (provider === 'paypal') {
      if (!paypalService || !paypalPlanId) return NextResponse.json({ error: 'PayPal is not configured.' }, { status: 503 })

      // Update the payment_history record to reflect the PayPal currency/amount
      if (paypalCurrency !== priced.currency) {
        await db.query<never>(
          'UPDATE payment_history SET amount = $1, currency = $2 WHERE id = $3 AND user_id = $4',
          [paypalAmount, paypalCurrency, paymentId, userId]
        )
      }

      // Create the recurring subscription and redirect the user to PayPal approval.
      const sub = await paypalService.createSubscription(
        paypalPlanId,
        { email: start.data.email || '' },
        {
          returnUrl: `${appUrl}/subscription/success?provider=paypal&paymentId=${paymentId}&planId=${planId}`,
          cancelUrl: `${appUrl}/subscription/cancel?provider=paypal&paymentId=${paymentId}&planId=${planId}`,
        }
      )

      if (!sub?.subscriptionId || !sub?.approvalUrl) {
        return NextResponse.json({ error: 'PayPal returned an invalid subscription' }, { status: 502 })
      }

      await db.query<never>(
        'UPDATE payment_history SET transaction_id = $1 WHERE id = $2 AND user_id = $3',
        [sub.subscriptionId, paymentId, userId]
      )
      return NextResponse.json({ kind: 'redirect', provider: 'paypal', url: sub.approvalUrl, paymentId })
    }

    if (provider === 'mpesa') {
      const mpesa = mpesaService
      if (!mpesa || !mpesaPhoneNumber) {
        throw new MpesaProviderError('M-Pesa could not accept this payment request. Please try again or choose another payment method.')
      }

      const callbackUrl = `${appUrl}/api/payments/mpesa/callback?paymentId=${paymentId}&planId=${planId}`
      let acceptedCheckoutRequestId: string | null = null
      try {
        const result = await mpesa.initiateSTKPush({
          phoneNumber: mpesaPhoneNumber,
          amount: priced.amount,
          reference: paymentId,
          description: `METARDU ${priced.plan.name} subscription`,
          callbackUrl,
        })

        if (!result?.checkoutRequestId) {
          throw new MpesaProviderError('M-Pesa did not accept the payment request. Please try again or choose another payment method.')
        }
        acceptedCheckoutRequestId = result.checkoutRequestId

        const checkoutUpdate = await db.query<never>(
          `UPDATE payment_history
           SET checkout_request_id = $1, updated_at = NOW()
           WHERE id = $2 AND user_id = $3 AND checkout_request_id IS NULL
             AND status IN ('pending', 'processing', 'pending_review')`,
          [result.checkoutRequestId, paymentId, userId],
        )
        if ((checkoutUpdate.rowCount ?? 0) === 0) {
          throw new Error('M-Pesa checkout identity could not be persisted.')
        }

        return NextResponse.json({
          kind: 'mpesa',
          provider: 'mpesa',
          paymentId,
          checkoutRequestId: result.checkoutRequestId,
        })
      } catch (cause) {
        if (acceptedCheckoutRequestId) {
          // Daraja already accepted the STK request and may have prompted the
          // customer. A later identity-write failure must not terminally fail
          // the checkout. Keep it pending so the callback can bind the
          // accepted CheckoutRequestID through the server payment id.
          return NextResponse.json({
            kind: 'mpesa',
            provider: 'mpesa',
            paymentId,
            checkoutRequestId: acceptedCheckoutRequestId,
            status: 'pending',
          }, { status: 202 })
        }

        await db.query<never>(
          `UPDATE payment_history
           SET status = 'failed', metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
               updated_at = NOW()
           WHERE id = $1 AND status <> 'completed'`,
          [paymentId, JSON.stringify({ mpesaInitiation: 'failed' })],
        ).catch(() => undefined)

        if (cause instanceof MpesaPhoneNumberError || cause instanceof MpesaProviderError) {
          throw cause
        }
        throw new MpesaProviderError(undefined, cause)
      }
    }

    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
  }

  // ─── Provider action switches ────────────────────────────────────────────
  switch (provider) {
    case 'paypal': {
      const paypal = getPayPalService()
      if (!paypal) return NextResponse.json({ error: 'PayPal not configured' }, { status: 500 })

      switch (action) {
        case 'capture-order': {
          const s = z.object({
            orderId: z.string().min(1),
            paymentId: z.string().guid(),
            planId: z.enum(['free', 'pro', 'team', 'firm', 'enterprise']),
          }).safeParse(params)
          if (!s.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

          const { rows: payRows } = await db.query<PaymentHistoryRow>(
            'SELECT id, plan_id, currency, amount, transaction_id, status, metadata FROM payment_history WHERE id = $1 AND user_id = $2 LIMIT 1',
            [s.data.paymentId, userId]
          )
          const pay = payRows[0] ?? null
          if (!pay) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
          if (pay.plan_id !== s.data.planId) return NextResponse.json({ error: 'Plan mismatch.' }, { status: 400 })
          if (pay.transaction_id && pay.transaction_id !== s.data.orderId) return NextResponse.json({ error: 'Transaction mismatch.' }, { status: 400 })
          if (pay.status === 'completed') return NextResponse.json({ status: 'completed' })
          if (pay.status === 'failed') return NextResponse.json({ status: 'failed' })

          // AUDIT FIX (HIGH 8, 2026-07-02): Handle ORDER_ALREADY_CAPTURED
          // gracefully. The PayPal webhook may auto-capture before the
          // success page calls this endpoint. Previously the error was
          // unhandled and marked the payment as 'failed' even though it
          // was already captured successfully.
          let capture: PayPalCapture
          try {
            capture = await paypal.captureOrder(s.data.orderId) as PayPalCapture
          } catch (captureErr) {
            const errMsg = captureErr instanceof Error ? captureErr.message : String(captureErr)
            if (errMsg.includes('ORDER_ALREADY_CAPTURED') || errMsg.includes('ORDER_ALREADY_PAID')) {
              // Order was already captured by the webhook — treat as success
              // Verify the payment_history row was already marked completed
              const { rows: recheck } = await db.query<Pick<PaymentHistoryRow, 'status'>>(
                'SELECT status FROM payment_history WHERE id = $1',
                [s.data.paymentId]
              )
              if (recheck[0]?.status === 'completed') {
                return NextResponse.json({ status: 'completed' })
              }
              // If not yet completed, mark it now
              await activateSubscription({ planId: s.data.planId, payment_method: 'paypal', currency: 'USD', amount: Number(pay.amount), transaction_id: s.data.orderId, status: 'completed', paymentId: s.data.paymentId })
              return NextResponse.json({ status: 'completed' })
            }
            // Genuine error — mark as failed
            await activateSubscription({ planId: s.data.planId, payment_method: 'paypal', currency: 'USD', amount: 0, transaction_id: s.data.orderId, status: 'failed', paymentId: s.data.paymentId })
            return NextResponse.json({ status: 'failed', error: errMsg })
          }
          if (capture.status?.toLowerCase() !== 'completed') {
            await activateSubscription({ planId: s.data.planId, payment_method: 'paypal', currency: 'USD', amount: 0, transaction_id: s.data.orderId, status: 'failed', paymentId: s.data.paymentId })
            return NextResponse.json({ status: 'failed' })
          }

          const captureAmount = capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount
          const amountStr = captureAmount?.value ?? '0'
          const currencyCode = (captureAmount?.currency_code ?? 'USD') as CurrencyCode

          if (String(pay.currency ?? '').toUpperCase() !== currencyCode.toUpperCase() ||
              Number(pay.amount) !== Number(amountStr)) {
            await activateSubscription({ planId: s.data.planId, payment_method: 'paypal', currency: (pay.currency as CurrencyCode) || 'USD', amount: Number(pay.amount) || 0, transaction_id: s.data.orderId, status: 'failed', paymentId: s.data.paymentId })
            return NextResponse.json({ status: 'failed' })
          }

          await activateSubscription({ planId: s.data.planId, payment_method: 'paypal', currency: currencyCode, amount: Number(amountStr), transaction_id: s.data.orderId, status: 'completed', paymentId: s.data.paymentId, seatCount: seatCountFromPaymentMetadata(s.data.planId, pay.metadata) })
          await sendPurchaseReceipt({
            userId,
            planId: s.data.planId,
            amount: Number(amountStr),
            currency: currencyCode,
            transactionId: s.data.orderId,
            paymentMethod: 'paypal',
            paymentId: s.data.paymentId,
          })
          return NextResponse.json({
            status: 'completed',
            receipt: {
              amount: Number(amountStr),
              currency: currencyCode,
              transactionId: s.data.orderId,
              paidAt: new Date().toISOString(),
            },
          })
        }
        case 'subscription-status': {
          const s = z.object({
            paymentId: z.string().guid(),
            planId: z.enum(['free', 'pro', 'team', 'firm', 'enterprise']),
          }).safeParse(params)
          if (!s.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

          const { rows: payRows } = await db.query<PaymentHistoryRow>(
            'SELECT id, plan_id, currency, amount, transaction_id, status, metadata FROM payment_history WHERE id = $1 AND user_id = $2 LIMIT 1',
            [s.data.paymentId, userId]
          )
          const pay = payRows[0] ?? null
          if (!pay) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
          if (pay.status === 'completed') return NextResponse.json({ status: 'completed' })
          if (pay.status === 'failed') return NextResponse.json({ status: 'failed' })

          // Still pending — ask PayPal whether the subscription is active yet.
          const subscriptionId = pay.transaction_id
          if (subscriptionId) {
            try {
              const sub = await paypal.getSubscriptionStatus(subscriptionId)
              if (sub.status?.toLowerCase() === 'active') {
                await activateSubscription({ planId: s.data.planId, payment_method: 'paypal', currency: (pay.currency as CurrencyCode) || 'USD', amount: Number(pay.amount), transaction_id: subscriptionId, status: 'completed', paymentId: s.data.paymentId, seatCount: seatCountFromPaymentMetadata(s.data.planId, pay.metadata) })
                await sendPurchaseReceipt({
                  userId,
                  planId: s.data.planId,
                  amount: Number(pay.amount),
                  currency: (pay.currency as string) || 'USD',
                  transactionId: subscriptionId,
                  paymentMethod: 'paypal',
                  paymentId: s.data.paymentId,
                })
                return NextResponse.json({
                  status: 'completed',
                  receipt: {
                    amount: Number(pay.amount),
                    currency: (pay.currency as string) || 'USD',
                    transactionId: subscriptionId,
                    paidAt: new Date().toISOString(),
                  },
                })
              }
              if (['approval_pending', 'approved'].includes(sub.status?.toLowerCase() ?? '')) {
                return NextResponse.json({ status: 'pending' })
              }
              if (['suspended', 'cancelled', 'expired'].includes(sub.status?.toLowerCase() ?? '')) {
                await activateSubscription({ planId: s.data.planId, payment_method: 'paypal', currency: 'USD', amount: 0, transaction_id: subscriptionId, status: 'failed', paymentId: s.data.paymentId })
                return NextResponse.json({ status: 'failed' })
              }
              return NextResponse.json({ status: 'pending' })
            } catch {
              // Paypal unreachable — keep polling on the client.
              return NextResponse.json({ status: 'pending' })
            }
          }
          return NextResponse.json({ status: 'pending' })
        }
        default:
          return NextResponse.json({ error: 'Unknown paypal action' }, { status: 400 })
      }
    }

    case 'mpesa': {
      const mpesa = getMpesaService()
      if (!mpesa) return NextResponse.json({ error: 'M-Pesa not configured' }, { status: 500 })

      switch (action) {
        case 'check-status': {
          const s = z.object({
            paymentId: z.string().guid(),
            checkoutRequestId: z.string().min(1),
          }).safeParse(params)
          if (!s.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

          const { rows: payRows } = await db.query<PaymentHistoryRow>(
            `SELECT id, user_id, plan_id, currency, amount, status,
                    checkout_request_id, phone_number, transaction_id, metadata
             FROM payment_history
             WHERE id = $1 AND user_id = $2 AND payment_method = 'mpesa'
             LIMIT 1`,
            [s.data.paymentId, userId],
          )
          const pay = payRows[0] ?? null
          if (!pay) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })

          const storedCheckoutRequestId = pay.checkout_request_id?.trim() || null
          if (!storedCheckoutRequestId) {
            return NextResponse.json({
              error: 'This M-Pesa checkout has no stored provider identity.',
              code: 'MPESA_CHECKOUT_ID_MISSING',
            }, { status: 400 })
          }
          if (s.data.checkoutRequestId.trim() !== storedCheckoutRequestId) {
            return NextResponse.json({
              error: 'The M-Pesa checkout identity does not match this payment.',
              code: 'MPESA_CHECKOUT_MISMATCH',
            }, { status: 400 })
          }

          if (pay.status === 'completed') return NextResponse.json({ status: 'completed' })
          if (pay.status === 'failed') return NextResponse.json({ status: 'failed' })

          let result: Awaited<ReturnType<typeof mpesa.checkTransactionStatus>>
          try {
            result = await mpesa.checkTransactionStatus(storedCheckoutRequestId)
          } catch (cause) {
            // A query outage is not proof that the customer declined. Keep the
            // checkout pending and expose only a customer-safe provider error.
            throw new MpesaProviderError(undefined, cause)
          }

          const resultClassification = classifyMpesaResultCode(result.resultCode)
          if (resultClassification === 'definitive_failure') {
            const failureUpdate = await db.query<never>(
              `UPDATE payment_history
               SET status = 'failed', metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                   updated_at = NOW()
               WHERE id = $1 AND user_id = $3 AND payment_method = 'mpesa'
                 AND status IN ('pending', 'processing', 'pending_review')`,
              [
                pay.id,
                JSON.stringify({
                  mpesaResultCode: result.resultCode ?? null,
                  mpesaResultDesc: result.resultDesc ?? null,
                  mpesaResultStatus: 'failed',
                }),
                userId,
              ],
            )
            if ((failureUpdate.rowCount ?? 0) === 0) {
              // A callback may have completed the row while the provider query
              // was in flight. Report the authoritative stored status instead
              // of claiming failure after the entitlement was activated.
              const { rows: storedRows } = await db.query<{ status: string | null }>(
                `SELECT status
                   FROM payment_history
                  WHERE id = $1 AND user_id = $2 AND payment_method = 'mpesa'
                  LIMIT 1`,
                [pay.id, userId],
              )
              const storedStatus = storedRows[0]?.status
              return NextResponse.json({
                status: storedStatus === 'completed'
                  ? 'completed'
                  : storedStatus === 'failed'
                    ? 'failed'
                    : 'pending',
              })
            }
            return NextResponse.json({ status: 'failed' })
          }

          if (resultClassification === 'ambiguous') {
            if (result.resultCode !== undefined || result.resultDesc !== undefined) {
              await db.query<never>(
                `UPDATE payment_history
                 SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                     updated_at = NOW()
                 WHERE id = $1 AND user_id = $3 AND payment_method = 'mpesa'
                   AND status <> 'completed'`,
                [
                  pay.id,
                  JSON.stringify({
                    mpesaResultCode: result.resultCode ?? null,
                    mpesaResultDesc: result.resultDesc ?? null,
                    mpesaResultStatus: 'ambiguous',
                  }),
                  userId,
                ],
              )
            }
            return NextResponse.json({ status: 'pending' })
          }

          if (result.status === 'completed') {
            const record: MpesaCompletionRecord = {
              id: pay.id,
              user_id: pay.user_id,
              plan_id: pay.plan_id,
              amount: Number(pay.amount),
              currency: pay.currency,
              status: pay.status,
              checkout_request_id: pay.checkout_request_id,
              phone_number: pay.phone_number,
              transaction_id: pay.transaction_id,
              metadata: pay.metadata,
            }
            const completion = await completeMpesaPayment({
              record,
              evidence: {
                source: 'polling',
                checkoutRequestId: storedCheckoutRequestId,
                amount: result.amount,
                phone: result.phone,
                resultCode: result.resultCode,
              },
            })

            if (completion.outcome === 'rejected') {
              await db.query<never>(
                `UPDATE payment_history
                 SET status = 'pending_review',
                     metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                     updated_at = NOW()
                 WHERE id = $1 AND user_id = $3 AND payment_method = 'mpesa'
                   AND status <> 'completed'`,
                [
                  pay.id,
                  JSON.stringify({
                    mpesaReviewReason: completion.reason,
                    reviewReason: completion.reason,
                  }),
                  userId,
                ],
              )
              return NextResponse.json({ status: 'pending' })
            }

            if (completion.outcome === 'not_completed') {
              return NextResponse.json({
                status: completion.status === 'failed' ? 'failed' : 'pending',
              })
            }

            if (completion.outcome === 'already_completed') {
              return NextResponse.json({ status: 'completed' })
            }

            if (completion.activated) {
              await sendPurchaseReceipt({
                userId: pay.user_id,
                planId: pay.plan_id as string,
                amount: Number(pay.amount),
                currency: pay.currency as string,
                transactionId: storedCheckoutRequestId,
                paymentMethod: 'mpesa',
                paymentId: pay.id,
              })
            }
            return NextResponse.json({ status: 'completed' })
          }

          return NextResponse.json({ status: 'pending' })
        }
        default:
          return NextResponse.json({ error: 'Unknown mpesa action' }, { status: 400 })
      }
    }

    default:
      return NextResponse.json({ error: 'Unknown payment provider' }, { status: 400 })
  }
})

export const GET = apiHandler({ auth: false, rateLimit: { max: 30, windowMs: 60000 } }, async (req) => {
  // This endpoint discloses live provider configuration and the eligible
  // method for the requested market. Availability remains contextual: a
  // configured provider is not offered when the market policy excludes it.
  const url = new URL(req.url)
  const invalidRequest = (code: string, error: string) => (
    NextResponse.json({ error, code }, { status: 400 })
  )

  const requestedCountry = url.searchParams.get('countryCode') ?? url.searchParams.get('country')
  const countryCode = normalizeCountryCode(requestedCountry)
  if (!countryCode) {
    return invalidRequest(
      'COUNTRY_REQUIRED',
      'A valid country is required before starting payment.',
    )
  }

  const requestedCurrency = url.searchParams.get('currency')?.trim().toUpperCase()
  const currency = SUPPORTED_CURRENCIES.includes(requestedCurrency as CurrencyCode)
    ? requestedCurrency as CurrencyCode
    : null
  if (!currency) {
    return invalidRequest(
      'CURRENCY_REQUIRED',
      'A supported currency is required before starting payment.',
    )
  }

  const requestedPlanId = url.searchParams.get('planId')
  const planId = (['free', 'pro', 'team', 'firm', 'enterprise'] as const).includes(
    requestedPlanId as PlanId
  ) ? requestedPlanId as PlanId : null
  if (!planId || planId === 'enterprise') {
    return invalidRequest(
      'INVALID_PLAN',
      'Choose a valid self-serve plan before checking payment methods.',
    )
  }

  if (!url.searchParams.has('seatCount')) {
    return invalidRequest(
      'INVALID_SEATS',
      'Choose a valid number of seats before checking payment methods.',
    )
  }
  const requestedSeatCount = Number(url.searchParams.get('seatCount'))
  const seatSelection = resolveSeatSelection(planId, requestedSeatCount)
  if (!seatSelection.ok) {
    return invalidRequest(
      'INVALID_SEATS',
      'Choose a valid number of seats before checking payment methods.',
    )
  }

  if (countryCode === 'KE' && currency !== 'KES') {
    return invalidRequest(
      'COUNTRY_CURRENCY_MISMATCH',
      'Kenya checkout must be priced in KES.',
    )
  }

  const paypal = Boolean(getPayPalService())
  const mpesa = Boolean(getMpesaService())
  const eligibility = resolvePaymentEligibility({
    countryCode,
    currency,
    configured: { paypal, mpesa },
  })
  if (!eligibility.ok) {
    return invalidRequest(eligibility.code, eligibility.message)
  }

  let reason: PaymentUnavailableReason | undefined
  let quotedMethods: QuotedPaymentMethod[] = []
  if (eligibility.methods.length === 0) {
    reason = createPaymentUnavailableReason('PROVIDER_UNAVAILABLE')
  } else {
    const quote = quoteEligiblePaymentMethodsWithReason({
      methods: eligibility.methods,
      planId,
      totalSeats: seatSelection.totalSeats,
    })
    const paypalCurrency = resolvePayPalCurrency(currency)
    const paypalPlanConfigured = countryCode !== 'KE'
      && Boolean(getPayPalPlanId(planId, paypalCurrency))

    if (!quote.ok) {
      reason = quote.reason.code === 'PAYPAL_EXTRA_SEATS_UNAVAILABLE'
        ? quote.reason
        : countryCode !== 'KE' && !paypalPlanConfigured
          ? createPaymentUnavailableReason('PLAN_UNAVAILABLE')
          : quote.reason
    } else if (countryCode !== 'KE' && !paypalPlanConfigured) {
      reason = createPaymentUnavailableReason('PLAN_UNAVAILABLE')
    } else {
      quotedMethods = quote.methods
    }
  }

  const authoritativeEligibility = {
    ok: true as const,
    market: eligibility.market,
    currency: eligibility.currency,
    methods: quotedMethods,
    ...(reason ? { reason } : {}),
  }

  return NextResponse.json({
    providers: { paypal, mpesa },
    currencies: SUPPORTED_CURRENCIES,
    eligibility: authoritativeEligibility,
    paymentMethods: quotedMethods.map(method => ({
      id: method.id,
      provider: method.provider,
      label: method.label,
      name: method.label,
      providers: [method.provider],
      chargeCurrency: method.chargeCurrency,
      chargeAmount: method.chargeAmount,
    })),
  })
})
