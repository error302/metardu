export const dynamic = 'force-dynamic'

/**
 * POST /api/cron/reconcile-mpesa
 *
 * Reconciles M-Pesa STK Push payments that never received a callback.
 *
 * Why: if the customer closes the browser before the STK callback arrives
 * (or Safaricom's callback fails), the payment row stays `pending` forever —
 * the customer may have paid but their subscription never activates, and
 * there is no audit trail. This job asks Daraja's STK Push Query API for an
 * authoritative answer and finalizes each row accordingly.
 *
 * Designed to be called every 5 minutes by cron / scheduled workflow:
 *   Auth: Bearer API_ADMIN_KEY (same pattern as trial-reminders).
 *
 * Finalization rules per stale pending payment (older than RECONCILE_AFTER_MIN):
 *   - Daraja ResultCode 0             → shared completion contract
 *   - Daraja definitive failure code  → failed
 *   - completed but mismatched quote  → pending_review, never activated
 *   - query error / ambiguous evidence → leave pending, retry next run
 */

import { NextRequest, NextResponse } from 'next/server'
import { db, setCurrentRlsServiceRole } from '@/lib/db'
import { classifyMpesaResultCode, getMpesaService } from '@/lib/payments/mpesa'
import {
  completeMpesaPayment,
  type MpesaCompletionRecord,
} from '@/lib/payments/mpesaCompletion'
import { sendPurchaseReceipt } from '@/lib/payments/receipt'
import { logger } from '@/lib/logger'

const RECONCILE_AFTER_MIN = 15
const MAX_BATCH = 50

interface StalePaymentRow {
  id: string
  user_id: string
  plan_id: string | null
  currency: string | null
  amount: number | string | null
  status: string | null
  checkout_request_id: string | null
  phone_number: string | null
  transaction_id: string | null
  metadata?: unknown
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const serviceKey = process.env.API_ADMIN_KEY
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  setCurrentRlsServiceRole('billing_reconciliation')

  const mpesa = getMpesaService()
  if (!mpesa) {
    return NextResponse.json(
      { skipped: true, reason: 'M-Pesa not configured' },
      { status: 200 },
    )
  }

  const { rows: stale } = await db.query<StalePaymentRow>(
    `SELECT id, user_id, plan_id, currency, amount, status,
            checkout_request_id, phone_number, transaction_id, metadata
     FROM payment_history
     WHERE payment_method = 'mpesa'
       AND status IN ('pending', 'processing', 'pending_review')
       AND checkout_request_id IS NOT NULL
       AND created_at < NOW() - make_interval(mins => $1)
     ORDER BY last_reconcile_attempt_at ASC NULLS FIRST, created_at ASC, id ASC
     LIMIT $2`,
    [RECONCILE_AFTER_MIN, MAX_BATCH],
  )

  let completed = 0
  let failed = 0
  let keptPending = 0
  const errors: Array<{ id: string; error: string }> = []

  for (const pay of stale) {
    try {
      const checkoutRequestId = pay.checkout_request_id?.trim() || null
      if (!checkoutRequestId) {
        keptPending++
        continue
      }

      const result = await mpesa.checkTransactionStatus(checkoutRequestId)

      const resultClassification = classifyMpesaResultCode(result.resultCode)
      if (resultClassification === 'definitive_failure') {
        // Definitive failure from Daraja (cancelled, timeout, insufficient funds…).
        const failureUpdate = await db.query<never>(
          `UPDATE payment_history
           SET status = 'failed',
               metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
               updated_at = NOW()
           WHERE id = $1 AND status IN ('pending', 'processing', 'pending_review')`,
          [
            pay.id,
            JSON.stringify({
              reconciled: true,
              resultCode: result.resultCode ?? null,
              resultDesc: result.resultDesc ?? null,
            }),
          ],
        )
        if ((failureUpdate.rowCount ?? 0) === 0) {
          // A callback may have completed the row while the provider query was
          // in flight. Count the authoritative stored state, not the stale
          // provider result.
          const { rows: storedRows } = await db.query<{ status: string | null }>(
            `SELECT status
               FROM payment_history
              WHERE id = $1 AND payment_method = 'mpesa'
              LIMIT 1`,
            [pay.id],
          )
          const storedStatus = storedRows[0]?.status
          if (storedStatus === 'completed') completed++
          else if (storedStatus === 'failed') failed++
          else keptPending++
        } else {
          failed++
        }
        continue
      }

      if (resultClassification === 'ambiguous') {
        if (result.resultCode !== undefined || result.resultDesc !== undefined) {
          await db.query<never>(
            `UPDATE payment_history
             SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                 updated_at = NOW()
             WHERE id = $1 AND status IN ('pending', 'processing', 'pending_review')`,
            [
              pay.id,
              JSON.stringify({
                reconciled: true,
                resultCode: result.resultCode ?? null,
                resultDesc: result.resultDesc ?? null,
                resultStatus: 'ambiguous',
              }),
            ],
          )
        }
        keptPending++
        continue
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
            source: 'reconciliation',
            checkoutRequestId,
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
             WHERE id = $1 AND status <> 'completed'`,
            [
              pay.id,
              JSON.stringify({
                reconciled: true,
                mpesaReviewReason: completion.reason,
                reviewReason: completion.reason,
              }),
            ],
          )
          keptPending++
          continue
        }

        if (completion.outcome === 'not_completed') {
          if (completion.status === 'failed') {
            failed++
          } else {
            keptPending++
          }
          continue
        }

        if (completion.outcome === 'already_completed') {
          completed++
          continue
        }

        completed++
        if (completion.activated) {
          await sendPurchaseReceipt({
            userId: pay.user_id,
            planId: pay.plan_id as string,
            amount: Number(pay.amount),
            currency: pay.currency as string,
            transactionId: completion.receiptNumber ?? checkoutRequestId,
            paymentMethod: 'mpesa',
            paymentId: pay.id,
          })
        }
        continue
      }

      // Ambiguous provider evidence remains pending for the next run.
      keptPending++
    } catch (err: unknown) {
      keptPending++
      logger.warn('[cron/reconcile-mpesa] Reconciliation attempt failed', {
        paymentId: pay.id,
        error: err,
      })
      errors.push({ id: pay.id, error: 'provider_query_failed' })
    } finally {
      // Every attempted row must leave the queue in a different rotation
      // position, even when the provider or shared completion failed. This
      // prevents permanently ambiguous rows from starving newer checkouts.
      try {
        await db.query<never>(
          `UPDATE payment_history
           SET last_reconcile_attempt_at = NOW()
           WHERE id = $1`,
          [pay.id],
        )
      } catch (err: unknown) {
        logger.warn('[cron/reconcile-mpesa] Failed to record reconciliation attempt', {
          paymentId: pay.id,
          error: err,
        })
      }
    }
  }

  logger.info('[cron/reconcile-mpesa] run complete', { stale: stale.length, completed, failed, keptPending })

  return NextResponse.json({
    ok: true,
    scanned: stale.length,
    completed,
    failed,
    keptPending,
    ...(errors.length > 0 && { errors }),
  })
}
