export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import db, { setCurrentRlsServiceRole, setCurrentUserId, setRlsContext } from '@/lib/db'
import {
  classifyMpesaResultCode,
  getMpesaService,
  normalizeMpesaPhoneNumber,
} from '@/lib/payments/mpesa'
import {
  completeMpesaPayment,
  type MpesaCompletionRecord,
} from '@/lib/payments/mpesaCompletion'
import { getPlan } from '@/lib/subscription/catalog'
import { seatCountFromPaymentMetadata } from '@/lib/subscription/seatSelection'
import { sendPurchaseReceipt } from '@/lib/payments/receipt'
import { logger } from '@/lib/logger'

interface PaymentIntentRow {
  id: string
  user_id: string
  plan_id: string
  amount: number
  currency: string
  status: string
  checkout_request_id?: string | null
  phone_number?: string | null
  transaction_id?: string | null
  metadata?: unknown
}

interface SubscriptionRow {
  id: string
}

// Safaricom IP whitelist for M-Pesa callbacks.
// AUDIT FIX (HIGH 5, 2026-07-02): configurable via MPESA_CALLBACK_IP_WHITELIST.
//
// SECURITY (audit C-05, 2026-08-30): the client IP is now derived from the
// RIGHTMOST X-Forwarded-For hop (the one appended by our own reverse proxy)
// or CF-Connecting-IP when present. The previous code trusted
// x-forwarded-for.split(',')[0] — the FIRST entry — which is fully
// client-controlled behind an appending proxy, so any caller could spoof a
// Safaricom source IP and forge a callback.
const DEFAULT_SAFARICOM_IPS = [
  '196.201.214.200', '196.201.214.206', '196.201.213.114',
  '196.201.214.207', '196.201.214.208', '196.201.213.44',
  '196.201.212.127', '196.201.212.138', '196.201.212.129',
  '196.201.212.136', '196.201.212.74', '196.201.212.69',
]

function getSafaricomIPs(): string[] {
  const envList = process.env.MPESA_CALLBACK_IP_WHITELIST
  if (envList) {
    return envList.split(',').map(ip => ip.trim()).filter(Boolean)
  }
  return DEFAULT_SAFARICOM_IPS
}

/**
 * Derive the real client IP (audit C-05).
 *
 * Behind Caddy (an *appending* reverse proxy) the FIRST X-Forwarded-For entry
 * is attacker-supplied; the LAST entry is the hop our own proxy observed.
 * When Cloudflare fronts the site, CF-Connecting-IP is authoritative.
 * Direct connections (no XFF) fall back to the socket address.
 */
function realClientIp(req: NextRequest): string | null {
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp.trim()

  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const hops = xff.split(',').map(h => h.trim()).filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }

  return req.headers.get('x-real-ip')?.trim() ?? null
}

function isSafaricomIP(req: NextRequest): boolean {
  const whitelist = getSafaricomIPs()
  const clientIp = realClientIp(req)
  return clientIp ? whitelist.includes(clientIp) : false
}

/**
 * M-Pesa STK Push callback handler.
 *
 * SECURITY (audit C-05 + H-01, 2026-08-30):
 *   - Client IP derived from the last trusted proxy hop (see realClientIp),
 *     not the spoofable first XFF entry.
 *   - The amount check FAILS CLOSED: a callback without CallbackMetadata
 *     (paidAmount 0) can no longer complete an intent. Previously the
 *     mismatch check was skipped entirely when the metadata was absent.
 *   - planId comes from the payment intent row only; the planId URL query
 *     parameter is no longer trusted.
 *   - Intent completion + payment_history insert + subscription activation
 *     run inside one transaction, gated by a conditional UPDATE whose
 *     rowCount proves this callback instance won the race (idempotent under
 *     Safaricom retries). The ON CONFLICT (provider_id) target is backed by
 *     the unique partial index created in migration 055 — previously the
 *     insert raised 42P10 and paying customers never got their plan.
 */
export async function POST(request: NextRequest) {
  // 1. Reject requests not from Safaricom IPs
  if (!isSafaricomIP(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Establish the provider RLS context before any payment lookup. Unified
  // payment_history rows are otherwise invisible to an anonymous callback.
  setCurrentRlsServiceRole('payment_provider')

  const mpesa = getMpesaService()
  if (!mpesa) {
    return NextResponse.json({ error: 'M-Pesa not configured' }, { status: 500 })
  }

  // 2. Parse callback payload
  const payload = (await request.json().catch(() => null)) as Record<
    string,
    Record<string, unknown>
  > | null
  const stk = payload?.Body?.stkCallback as Record<string, unknown> | undefined
  const checkoutRequestId = stk?.CheckoutRequestID as string | undefined
  const resultCode = stk?.ResultCode as number | undefined
  const resultDesc = typeof stk?.ResultDesc === 'string' ? stk.ResultDesc : null

  if (!checkoutRequestId) {
    return NextResponse.json({ error: 'Missing CheckoutRequestID' }, { status: 400 })
  }

  // 3. Look up the payment intent by CheckoutRequestID (primary). The
  //    paymentId query parameter remains as a legacy fallback, but the plan
  //    is ALWAYS taken from the intent row — never from the URL.
  const paymentIdParam = request.nextUrl.searchParams.get('paymentId') || ''

  let paymentRow: PaymentIntentRow | null = null
  let paymentSource: 'payment_intent' | 'payment_history' | null = null

  // Legacy payment_intents has no transaction_id column: selecting it here
  // raises 42703 and aborts the callback before the payment_history fallback
  // can ever run. The receipt column exists only on payment_history, so keep
  // it out of every payment_intents projection.
  const byCheckout = await db.query<PaymentIntentRow>(
    `SELECT id, user_id, plan_id, amount, currency, status,
            checkout_request_id, phone_number, metadata
     FROM payment_intents
     WHERE checkout_request_id = $1 AND payment_method = 'mpesa'`,
    [checkoutRequestId]
  )
  if (byCheckout.rows.length > 1) {
    return NextResponse.json({ error: 'Ambiguous M-Pesa payment identity' }, { status: 409 })
  }
  paymentRow = byCheckout.rows[0] ?? null
  if (paymentRow) paymentSource = 'payment_intent'

  if (!paymentRow && paymentIdParam && z.string().guid().safeParse(paymentIdParam).success) {
    const result = await db.query<PaymentIntentRow>(
      `SELECT id, user_id, plan_id, amount, currency, status,
              checkout_request_id, phone_number, metadata
       FROM payment_intents
       WHERE id = $1 AND payment_method = 'mpesa' AND checkout_request_id = $2`,
      [paymentIdParam, checkoutRequestId]
    )
    paymentRow = result.rows[0] ?? null
    if (paymentRow) paymentSource = 'payment_intent'
  }

  // The current checkout writes its authoritative quote to payment_history;
  // keep accepting payment_intents for the legacy STK initiation endpoint.
  if (!paymentRow) {
    const byHistoryCheckout = await db.query<PaymentIntentRow>(
      `SELECT id, user_id, plan_id, amount, currency, status,
              checkout_request_id, phone_number, transaction_id, metadata
       FROM payment_history
       WHERE checkout_request_id = $1 AND payment_method = 'mpesa'`,
      [checkoutRequestId]
    )
    if (byHistoryCheckout.rows.length > 1) {
      return NextResponse.json({ error: 'Ambiguous M-Pesa payment identity' }, { status: 409 })
    }
    paymentRow = byHistoryCheckout.rows[0] ?? null
    if (paymentRow) paymentSource = 'payment_history'
  }

  if (!paymentRow && paymentIdParam && z.string().guid().safeParse(paymentIdParam).success) {
    // Recovery path for a provider-accepted checkout whose identity write
    // failed after Daraja returned the CheckoutRequestID. Bind only the
    // server-generated payment id, only while the immutable identity is null,
    // and only while the row is still recoverable.
    const bound = await db.query<PaymentIntentRow>(
      `UPDATE payment_history
       SET checkout_request_id = $1, updated_at = NOW()
       WHERE id = $2 AND payment_method = 'mpesa'
         AND checkout_request_id IS NULL
         AND status IN ('pending', 'processing', 'pending_review')
       RETURNING id, user_id, plan_id, amount, currency, status,
                 checkout_request_id, phone_number, transaction_id, metadata`,
      [checkoutRequestId, paymentIdParam]
    )
    if (bound.rows.length > 1) {
      return NextResponse.json({ error: 'Ambiguous M-Pesa payment identity' }, { status: 409 })
    }
    paymentRow = bound.rows[0] ?? null
    if (paymentRow) paymentSource = 'payment_history'
  }

  if (!paymentRow) {
    return NextResponse.json({ error: 'Payment intent not found' }, { status: 404 })
  }

  // The callback is verified and the payment intent supplies the trusted
  // owner ID, so all subsequent payment-history and subscription work can
  // pass the same per-user RLS policies as interactive requests.
  setCurrentUserId(String(paymentRow.user_id))

  // Legacy intents are terminal once completed. Unified payment_history rows
  // remain eligible for receipt enrichment when a real Safaricom callback
  // arrives after client polling completed the row.
  if (paymentRow.status === 'completed' && paymentSource === 'payment_intent') {
    return NextResponse.json({ ok: true })
  }

  // 4. Plan comes from the intent row ONLY (audit C-05)
  const planId = paymentRow.plan_id as 'free' | 'pro' | 'team' | 'firm' | 'enterprise'

  // 5. Only documented definitive failures are terminal. Unknown, retryable,
  // and missing result codes remain pending and are retained for diagnostics.
  const resultClassification = classifyMpesaResultCode(resultCode)
  if (resultClassification === 'definitive_failure') {
    if (paymentSource === 'payment_history') {
      await db.query<never>(
        `UPDATE payment_history
         SET status = 'failed', provider = 'safaricom', provider_id = $1,
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
         WHERE id = $3 AND status <> 'completed'`,
        [
          checkoutRequestId,
          JSON.stringify({
            callbackResultCode: resultCode,
            callbackResultDesc: resultDesc,
          }),
          paymentRow.id,
        ]
      )
    } else {
      await db.query<never>(
        `UPDATE payment_intents
         SET status = 'failed', provider_id = $1,
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
         WHERE id = $3 AND status IN ('pending', 'processing')`,
        [
          checkoutRequestId,
          JSON.stringify({
            callbackResultCode: resultCode,
            callbackResultDesc: resultDesc,
          }),
          paymentRow.id,
        ]
      )
    }
    return NextResponse.json({ ok: true })
  }

  if (resultClassification === 'ambiguous') {
    if (paymentSource === 'payment_history') {
      await db.query<never>(
        `UPDATE payment_history
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
         WHERE id = $1 AND status <> 'completed'`,
        [
          paymentRow.id,
          JSON.stringify({
            callbackResultCode: resultCode ?? null,
            callbackResultDesc: resultDesc,
            callbackResultStatus: 'ambiguous',
          }),
        ]
      )
    } else {
      await db.query<never>(
        `UPDATE payment_intents
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
         WHERE id = $1 AND status IN ('pending', 'processing')`,
        [
          paymentRow.id,
          JSON.stringify({
            callbackResultCode: resultCode ?? null,
            callbackResultDesc: resultDesc,
            callbackResultStatus: 'ambiguous',
          }),
        ]
      )
    }
    return NextResponse.json({ ok: true })
  }

  // 6. Parse callback metadata to get the ACTUAL paid amount, phone and receipt.
  const parsed = mpesa.parseCallback(payload as Record<string, unknown>)
  const paidAmount = parsed?.amount ?? 0
  const paidPhone = parsed?.phone ?? null
  const receiptNumber = parsed?.transactionId?.trim() || null

  // Unified payment_history checkouts use the shared transactional completion
  // contract. The service validates the immutable quote, plan, amount, phone,
  // checkout identity and real receipt before its conditional row claim.
  if (paymentSource === 'payment_history') {
    const record: MpesaCompletionRecord = {
      id: paymentRow.id,
      user_id: paymentRow.user_id,
      plan_id: paymentRow.plan_id,
      amount: Number(paymentRow.amount),
      currency: paymentRow.currency,
      status: paymentRow.status,
      checkout_request_id: paymentRow.checkout_request_id ?? null,
      phone_number: paymentRow.phone_number ?? null,
      transaction_id: paymentRow.transaction_id,
      metadata: paymentRow.metadata,
    }

    let completion: Awaited<ReturnType<typeof completeMpesaPayment>>
    try {
      completion = await completeMpesaPayment({
        record,
        evidence: {
          source: 'callback',
          checkoutRequestId: checkoutRequestId,
          amount: paidAmount,
          phone: paidPhone,
          receiptNumber,
          resultCode,
        },
      })
    } catch (error) {
      logger.error('[mpesa-callback] Shared completion failed:', { error })
      return NextResponse.json({ error: 'Callback processing failed' }, { status: 500 })
    }

    if (completion.outcome === 'rejected') {
      await db.query<never>(
        `UPDATE payment_history
         SET status = 'pending_review',
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE id = $1 AND status <> 'completed'`,
        [
          paymentRow.id,
          JSON.stringify({
            mpesaReviewReason: completion.reason,
            reviewReason: completion.reason,
            callbackResultCode: resultCode ?? null,
            paidAmount,
            expectedAmount: Number(paymentRow.amount),
          }),
        ],
      )
      return NextResponse.json({ ok: true })
    }

    if (completion.activated) {
      await sendPurchaseReceipt({
        userId: paymentRow.user_id,
        planId: paymentRow.plan_id,
        amount: Number(paymentRow.amount),
        currency: paymentRow.currency,
        transactionId: completion.receiptNumber ?? receiptNumber ?? checkoutRequestId,
        paymentMethod: 'mpesa',
        paymentId: paymentRow.id,
      })
    }
    return NextResponse.json({ ok: true })
  }

  // 7. Verify the paid amount matches the expected price — FAIL CLOSED
  //    (audit C-05). A callback that arrives without CallbackMetadata has
  //    paidAmount 0 and is rejected outright; previously the check was
  //    skipped whenever paidAmount was falsy, which allowed forged
  //    "success" callbacks carrying no metadata at all.
  const plan = getPlan(planId)
  if (!plan || plan.contactSales) {
    await db.query<never>(
      `UPDATE payment_intents
       SET status = 'failed', provider_id = $1,
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
       WHERE id = $3 AND status IN ('pending', 'processing')`,
      [
        checkoutRequestId,
        JSON.stringify({ fraudFlag: 'invalid_plan', planId }),
        paymentRow.id,
      ],
    )
    return NextResponse.json({ ok: true })
  }

  // Legacy intents that recorded an initiating phone must also prove that the
  // paid phone matches. Missing or mismatched evidence fails closed.
  const storedPhone = paymentRow.phone_number?.trim() || null
  if (storedPhone) {
    const expectedPhone = normalizeMpesaPhoneNumber(storedPhone)
    const callbackPhone = paidPhone ? normalizeMpesaPhoneNumber(paidPhone) : null
    const phoneFailure = !callbackPhone
      ? 'missing_phone'
      : !expectedPhone || expectedPhone !== callbackPhone
        ? 'phone_mismatch'
        : null
    if (phoneFailure) {
      await db.query<never>(
        `UPDATE payment_intents
         SET status = 'failed', provider_id = $1,
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
         WHERE id = $3 AND status IN ('pending', 'processing')`,
        [
          checkoutRequestId,
          JSON.stringify({ fraudFlag: phoneFailure }),
          paymentRow.id,
        ],
      )
      return NextResponse.json({ ok: true })
    }
  }

  const totalSeats = seatCountFromPaymentMetadata(planId, paymentRow.metadata)
  const extraSeats = plan?.isPerSeat ? Math.max(0, totalSeats - plan.includedSeats) : 0
  // The server-created intent records the price actually quoted at checkout.
  // A later catalog change must not reject an already initiated payment.
  const expectedAmount = Number(paymentRow.amount)
  if (
    !Number.isFinite(paidAmount) ||
    paidAmount <= 0 ||
    !Number.isFinite(expectedAmount) ||
    expectedAmount <= 0 ||
    Math.round(paidAmount * 100) !== Math.round(expectedAmount * 100)
  ) {
    logger.warn(
      `[mpesa] Amount verification failed: paid ${paidAmount} KES, expected ${expectedAmount} KES for plan ${planId} (intent ${paymentRow.id})`
    )
    const failureMetadata = JSON.stringify({
      fraudFlag: paidAmount <= 0 ? 'missing_callback_metadata' : 'amount_mismatch',
      paidAmount,
      expectedAmount,
    })
    await db.query<never>(
      `UPDATE payment_intents
       SET status = 'failed', provider_id = $1,
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
       WHERE id = $3 AND status IN ('pending', 'processing')`,
      [checkoutRequestId, failureMetadata, paymentRow.id]
    )
    return NextResponse.json({ ok: true, error: 'Amount verification failed' })
  }

  if (!receiptNumber || receiptNumber === checkoutRequestId) {
    await db.query<never>(
      `UPDATE payment_intents
       SET status = 'failed', provider_id = $1,
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
       WHERE id = $3 AND status IN ('pending', 'processing')`,
      [
        checkoutRequestId,
        JSON.stringify({ fraudFlag: 'missing_receipt' }),
        paymentRow.id,
      ],
    )
    return NextResponse.json({ ok: true })
  }

  // 8-10. Complete the intent, write the audit row and activate the
  //       subscription inside ONE transaction, gated by a conditional UPDATE
  //       so concurrent retries cannot double-credit (audit H-01).
  const client = await db.getClient()
  let activated = false
  try {
    await client.query<never>('BEGIN')
    await setRlsContext(client)

    // Conditional completion: rowCount 0 means another callback instance
    // already completed (or concurrently completes) this intent.
    const completeRes = await client.query<never>(
      `UPDATE payment_intents
       SET status = 'completed', provider_id = $1, updated_at = NOW()
       WHERE id = $2 AND status IN ('pending', 'processing')`,
      [checkoutRequestId, paymentRow.id]
    )
    if ((completeRes.rowCount ?? 0) === 0) {
      await client.query<never>('ROLLBACK')
      return NextResponse.json({ ok: true })
    }

    // Audit trail row (unique partial index from migration 055 backs the
    // ON CONFLICT target; DO NOTHING keeps Safaricom retries idempotent).
    if (paymentSource === 'payment_intent') {
      await client.query<never>(
        `INSERT INTO payment_history
           (user_id, amount, currency, payment_method, provider, provider_id,
            status, transaction_id, metadata)
         VALUES ($1, $2, $3, 'mpesa', 'safaricom', $4, 'completed', $5, $6)
         ON CONFLICT (provider_id) DO NOTHING`,
        [
          paymentRow.user_id,
          paidAmount,
          paymentRow.currency,
          checkoutRequestId,
          receiptNumber,
          JSON.stringify({ planId, paymentIntentId: paymentRow.id, totalSeats, extraSeats }),
        ]
      )
    }

    const existingSub = await client.query<SubscriptionRow>(
      'SELECT id FROM user_subscriptions WHERE user_id = $1',
      [paymentRow.user_id]
    )

    const periodStart = new Date().toISOString()
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    if (existingSub.rows.length > 0) {
      await client.query<never>(
        `UPDATE user_subscriptions
         SET plan_id = $1, status = 'active', payment_method = 'mpesa',
             currency = 'KES', current_period_start = $2, current_period_end = $3,
             seat_count = $5
         WHERE id = $4`,
        [planId, periodStart, periodEnd, existingSub.rows[0].id, extraSeats]
      )
    } else {
      await client.query<never>(
        `INSERT INTO user_subscriptions
           (user_id, plan_id, status, payment_method, currency,
            current_period_start, current_period_end, seat_count)
         VALUES ($1, $2, 'active', 'mpesa', 'KES', $3, $4, $5)`,
        [paymentRow.user_id, planId, periodStart, periodEnd, extraSeats]
      )
    }

    await client.query<never>('COMMIT')
    activated = true
  } catch (txErr) {
    await client.query<never>('ROLLBACK').catch(() => {})
    logger.error('[mpesa-callback] Transaction failed:', { error: txErr })
    return NextResponse.json({ error: 'Callback processing failed' }, { status: 500 })
  } finally {
    client.release()
  }

  if (activated) {
    await sendPurchaseReceipt({
      userId: paymentRow.user_id,
      planId,
      amount: paidAmount,
      currency: paymentRow.currency,
      transactionId: receiptNumber,
      paymentMethod: 'mpesa',
      paymentId: paymentRow.id,
    })
  }

  return NextResponse.json({ ok: true })
}
