/**
 * Post-purchase receipt delivery.
 *
 * One funnel for every payment provider so a successful subscription purchase
 * always produces the same branded receipt email, regardless of whether the
 * money arrived by M-Pesa STK push, Stripe Checkout, or a PayPal subscription.
 *
 * Design rules:
 *   - Never throw. A mail failure must never roll back or fail a completed
 *     payment. Callers treat this as best-effort and log the outcome.
 *   - Idempotent per payment. The success page can poll `confirm-session` or
 *     `subscription-status` repeatedly; each payment row is emailed once.
 *   - The receipt is sent only after the subscription is actually activated.
 */

import db from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { paymentReceiptEmail } from '@/lib/email-templates/paymentReceipt'
import { getPlan } from '@/lib/subscription/catalog'
import { logger } from '@/lib/logger'

/** Human-readable payment method labels shown on the receipt. */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  mpesa: 'M-Pesa STK Push (Till 3370347)',
  stripe: 'Card payment (Stripe)',
  paypal: 'PayPal subscription',
  free: 'Free plan',
}

export interface SendPurchaseReceiptInput {
  /** User who made the purchase. Used to resolve the delivery address. */
  userId: string
  /** Plan that was activated. */
  planId: string
  /** Amount actually charged, in the smallest sensible unit of `currency`. */
  amount: number
  currency: string
  /** Provider transaction / session / subscription identifier. */
  transactionId: string
  /** Provider key: 'mpesa' | 'stripe' | 'paypal'. */
  paymentMethod: string
  /** Payment history row id, used as the idempotency key. */
  paymentId?: string
  /** ISO timestamp of the charge; defaults to now. */
  paidAt?: string
  /**
   * Optional pre-resolved recipient. When omitted the address is read from
   * `users`. Callers that already hold the user row can pass it to avoid a
   * second query.
   */
  recipient?: { email: string; name?: string | null }
}

/**
 * Send the branded purchase receipt for a completed subscription payment.
 *
 * Returns whether an email was actually dispatched. Never throws.
 */
export async function sendPurchaseReceipt(
  input: SendPurchaseReceiptInput,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    // Free plans are not a purchase; there is nothing to receipt.
    if (input.paymentMethod === 'free' || !input.amount || input.amount <= 0) {
      return { sent: false, reason: 'no-chargeable-amount' }
    }

    let recipient = input.recipient
    if (!recipient?.email) {
      const { rows } = await db.query<{ email: string; name: string | null }>(
        'SELECT email, name FROM users WHERE id = $1',
        [input.userId],
      )
      recipient = rows[0] ? { email: rows[0].email, name: rows[0].name } : undefined
    }

    if (!recipient?.email) {
      logger.warn('[purchase-receipt] No recipient address for user', { userId: input.userId })
      return { sent: false, reason: 'no-recipient' }
    }

    const plan = getPlan(input.planId)
    const planName = plan?.name ? `${plan.name} Plan` : 'METARDU Plan'

    const receipt = paymentReceiptEmail.render({
      to: recipient.email,
      name: recipient.name || 'Surveyor',
      planName,
      amount: input.amount,
      currency: input.currency,
      paidAt: input.paidAt ?? new Date().toISOString(),
      transactionId: input.transactionId,
      paymentMethod: PAYMENT_METHOD_LABELS[input.paymentMethod] ?? input.paymentMethod,
    })

    const result = await sendEmail({
      to: recipient.email,
      subject: receipt.subject,
      html: receipt.html,
      text: receipt.text,
      // The success page polls the confirm endpoints, so the same payment can
      // reach this function more than once. The provider idempotency key makes
      // the retries collapse into a single delivered email.
      idempotencyKey: input.paymentId
        ? `purchase-receipt:${input.paymentId}`
        : `purchase-receipt:${input.paymentMethod}:${input.transactionId}`,
    })

    if (!result?.success) {
      const failure = typeof result?.error === 'string' ? result.error : 'send-failed'
      logger.warn('[purchase-receipt] Email not delivered', {
        paymentId: input.paymentId,
        error: failure,
      })
      return { sent: false, reason: failure }
    }

    return { sent: true }
  } catch (error) {
    logger.warn('[purchase-receipt] Failed to send receipt', {
      paymentId: input.paymentId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { sent: false, reason: 'exception' }
  }
}
