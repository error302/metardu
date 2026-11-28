import db, { setRlsContext } from '@/lib/db'
import { getPlan } from '@/lib/subscription/catalog'
import { normalizeMpesaPhoneNumber } from '@/lib/payments/mpesa'
import { seatCountFromPaymentMetadata } from '@/lib/subscription/seatSelection'

export type MpesaCompletionSource = 'callback' | 'polling' | 'reconciliation'

export interface MpesaExpectedPayment {
  planId: string | null
  amount: number | null
  currency: string | null
  checkoutRequestId: string | null
  phoneNumber: string | null
}

export interface MpesaPaymentEvidence {
  source: MpesaCompletionSource
  checkoutRequestId: string
  amount?: number | null
  phone?: string | null
  receiptNumber?: string | null
  resultCode?: number | null
}

export type MpesaEvidenceRejectionReason =
  | 'missing_plan'
  | 'currency_mismatch'
  | 'missing_checkout_request_id'
  | 'checkout_request_mismatch'
  | 'missing_amount'
  | 'amount_mismatch'
  | 'missing_phone'
  | 'phone_mismatch'
  | 'missing_receipt'
  | 'non_zero_result_code'

export type MpesaEvidenceValidation =
  | { ok: true }
  | { ok: false; reason: MpesaEvidenceRejectionReason }

export interface MpesaCompletionRecord {
  id: string
  user_id: string
  plan_id: string | null
  amount: number | null
  currency: string | null
  status: string | null
  checkout_request_id: string | null
  phone_number: string | null
  transaction_id?: string | null
  metadata?: unknown
}

export type MpesaCompletionResult =
  | {
      outcome: 'completed'
      activated: true
      receiptNumber: string | null
      receiptEnriched: false
    }
  | {
      outcome: 'already_completed'
      activated: false
      status: 'completed'
      receiptNumber: string | null
      receiptEnriched: boolean
    }
  | {
      outcome: 'not_completed'
      activated: false
      status: string | null
      receiptNumber: string | null
      receiptEnriched: false
    }
  | { outcome: 'rejected'; reason: MpesaEvidenceRejectionReason }

/** Validate immutable provider evidence against the server-owned payment quote. */
export function validateMpesaPaymentEvidence(
  expected: MpesaExpectedPayment,
  evidence: MpesaPaymentEvidence,
): MpesaEvidenceValidation {
  const plan = expected.planId ? getPlan(expected.planId) : null
  if (!plan || plan.contactSales) return { ok: false, reason: 'missing_plan' }

  if (!expected.currency || expected.currency.toUpperCase() !== 'KES') {
    return { ok: false, reason: 'currency_mismatch' }
  }

  if (typeof evidence.resultCode === 'number' && evidence.resultCode !== 0) {
    return { ok: false, reason: 'non_zero_result_code' }
  }

  const expectedCheckout = expected.checkoutRequestId?.trim()
  if (!expectedCheckout) return { ok: false, reason: 'missing_checkout_request_id' }
  if (!evidence.checkoutRequestId?.trim() || evidence.checkoutRequestId.trim() !== expectedCheckout) {
    return { ok: false, reason: 'checkout_request_mismatch' }
  }

  if (typeof evidence.amount !== 'number' || !Number.isFinite(evidence.amount) || evidence.amount <= 0) {
    return { ok: false, reason: 'missing_amount' }
  }
  if (
    typeof expected.amount !== 'number' ||
    !Number.isFinite(expected.amount) ||
    expected.amount <= 0 ||
    Math.round(evidence.amount * 100) !== Math.round(expected.amount * 100)
  ) {
    return { ok: false, reason: 'amount_mismatch' }
  }

  const expectedPhone = expected.phoneNumber ? normalizeMpesaPhoneNumber(expected.phoneNumber) : null
  const paidPhone = evidence.phone ? normalizeMpesaPhoneNumber(evidence.phone) : null
  if (!expectedPhone || !paidPhone) return { ok: false, reason: 'missing_phone' }
  if (expectedPhone !== paidPhone) return { ok: false, reason: 'phone_mismatch' }

  const receiptNumber = evidence.receiptNumber?.trim()
  if (
    evidence.source === 'callback' &&
    (!receiptNumber || receiptNumber === expectedCheckout)
  ) {
    return { ok: false, reason: 'missing_receipt' }
  }

  return { ok: true }
}

/**
 * Complete one M-Pesa payment using a single conditional claim.
 *
 * The caller must load the payment record from the database and pass only
 * provider evidence gathered for that stored checkout. A claim affects one
 * row at most; only the winner can activate the subscription.
 */
export async function completeMpesaPayment(input: {
  record: MpesaCompletionRecord
  evidence: MpesaPaymentEvidence
  now?: Date
}): Promise<MpesaCompletionResult> {
  const { record, evidence } = input
  const validation = validateMpesaPaymentEvidence({
    planId: record.plan_id,
    amount: record.amount,
    currency: record.currency,
    checkoutRequestId: record.checkout_request_id,
    phoneNumber: record.phone_number,
  }, evidence)
  if (!validation.ok) return { outcome: 'rejected', reason: validation.reason }

  const plan = getPlan(record.plan_id as string)
  if (!plan) return { outcome: 'rejected', reason: 'missing_plan' }

  const totalSeats = seatCountFromPaymentMetadata(plan.id, record.metadata)
  const extraSeats = plan.isPerSeat ? Math.max(0, totalSeats - plan.includedSeats) : 0
  const receiptNumber = evidence.receiptNumber?.trim() || null
  const now = (input.now ?? new Date()).toISOString()
  const periodEnd = new Date(
    (input.now ?? new Date()).getTime() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString()
  const providerMetadata = JSON.stringify({
    completionSource: evidence.source,
    providerAmount: evidence.amount,
    providerPhone: evidence.phone,
    providerResultCode: evidence.resultCode,
    ...(receiptNumber ? { receiptNumber } : {}),
  })

  const client = await db.getClient()
  try {
    await client.query('BEGIN')
    await setRlsContext(client)

    const claim = await client.query<never>(
      `UPDATE payment_history
       SET status = 'completed', provider = 'safaricom',
           provider_id = COALESCE(provider_id, $1),
           transaction_id = CASE WHEN $2::text IS NULL THEN transaction_id ELSE $2 END,
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $4
         AND payment_method = 'mpesa'
         AND checkout_request_id = $1
         AND status IN ('pending', 'processing', 'pending_review')`,
      [evidence.checkoutRequestId, receiptNumber, providerMetadata, record.id],
    )

    if ((claim.rowCount ?? 0) === 0) {
      // The conditional claim missed because another actor changed the row.
      // Re-read its authoritative state inside this transaction before
      // reporting an outcome. A miss is not evidence of completion.
      const stored = await client.query<{
        status: string | null
        checkout_request_id: string | null
        transaction_id: string | null
      }>(
        `SELECT status, checkout_request_id, transaction_id
           FROM payment_history
          WHERE id = $1 AND payment_method = 'mpesa'
          FOR UPDATE`,
        [record.id],
      )
      const storedRow = stored.rows[0] ?? null
      const isAlreadyCompleted =
        storedRow?.status === 'completed' &&
        storedRow.checkout_request_id === evidence.checkoutRequestId

      if (!isAlreadyCompleted) {
        await client.query('COMMIT')
        return {
          outcome: 'not_completed',
          activated: false,
          status: storedRow?.status ?? null,
          receiptNumber: storedRow?.transaction_id ?? null,
          receiptEnriched: false,
        }
      }

      let receiptEnriched = false
      if (receiptNumber) {
        const enrichment = await client.query<never>(
          `UPDATE payment_history
           SET transaction_id = $2,
               metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
               updated_at = NOW()
           WHERE id = $1
             AND payment_method = 'mpesa'
             AND status = 'completed'
             AND checkout_request_id = $4
             AND (transaction_id IS NULL OR transaction_id = checkout_request_id)`,
          [record.id, receiptNumber, providerMetadata, evidence.checkoutRequestId],
        )
        receiptEnriched = (enrichment.rowCount ?? 0) > 0
      }
      await client.query('COMMIT')
      return {
        outcome: 'already_completed',
        activated: false,
        status: 'completed',
        receiptNumber: receiptNumber ?? storedRow?.transaction_id ?? null,
        receiptEnriched,
      }
    }

    const existingSubscription = await client.query<{ id: string }>(
      'SELECT id FROM user_subscriptions WHERE user_id = $1 LIMIT 1',
      [record.user_id],
    )

    if (existingSubscription.rows.length > 0) {
      await client.query<never>(
        `UPDATE user_subscriptions
         SET plan_id = $1, status = 'active', payment_method = 'mpesa',
             currency = 'KES', current_period_start = $2, current_period_end = $3,
             seat_count = $5
         WHERE id = $4`,
        [plan.id, now, periodEnd, existingSubscription.rows[0].id, extraSeats],
      )
    } else {
      await client.query<never>(
        `INSERT INTO user_subscriptions
           (user_id, plan_id, status, payment_method, currency,
            current_period_start, current_period_end, seat_count)
         VALUES ($1, $2, 'active', 'mpesa', 'KES', $3, $4, $5)`,
        [record.user_id, plan.id, now, periodEnd, extraSeats],
      )
    }

    await client.query('COMMIT')
    return {
      outcome: 'completed',
      activated: true,
      receiptNumber,
      receiptEnriched: false,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
