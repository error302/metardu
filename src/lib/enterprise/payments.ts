/**
 * Client-side payment helpers for the Checkout UI.
 *
 * IMPORTANT:
 * - Never fake payment success in the frontend.
 * - Never send an arbitrary amount from the client; the server validates plan pricing.
 */

import type { CurrencyCode, PlanId } from '@/lib/subscription/catalog'

export type PaymentProvider = 'mpesa' | 'paypal'

export type StartSubscriptionResult =
  | { kind: 'activated'; planId: PlanId }
  | { kind: 'redirect'; provider: 'paypal'; url: string; paymentId: string }
  | { kind: 'mpesa'; provider: 'mpesa'; paymentId: string; checkoutRequestId: string }

export async function startSubscriptionPayment(input: {
  planId: PlanId
  currency: CurrencyCode
  method: PaymentProvider
  seatCount: number
  email: string
  phoneNumber?: string
  countryCode: string
}): Promise<StartSubscriptionResult> {
  const res = await fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: input.method,
      action: 'start-subscription',
      planId: input.planId,
      currency: input.currency,
      seatCount: input.seatCount,
      email: input.email,
      phoneNumber: input.phoneNumber,
      countryCode: input.countryCode,
    }),
  })

  const data = (await res.json().catch(() => ({}))) as unknown
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Failed to start payment')
  }

  return data as StartSubscriptionResult
}

export async function checkMpesaPaymentStatus(input: {
  paymentId: string
  checkoutRequestId: string
}): Promise<{ status: 'pending' | 'completed' | 'failed' }> {
  const res = await fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'mpesa',
      action: 'check-status',
      paymentId: input.paymentId,
      checkoutRequestId: input.checkoutRequestId,
    }),
  })

  const data = (await res.json().catch(() => ({}))) as unknown
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Failed to check payment status')
  }

  return data as { status: 'pending' | 'completed' | 'failed' }
}
