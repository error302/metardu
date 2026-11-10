'use client';

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import MetarduLogo from '@/components/MetarduLogo'
import { getPlan } from '@/lib/subscription/catalog'

type Status = 'processing' | 'completed' | 'failed'

/** Provider keys that can appear in the return URL. */
type Provider = 'stripe' | 'paypal' | 'mpesa'

const PROVIDER_LABELS: Record<Provider, string> = {
  stripe: 'Card payment',
  paypal: 'PayPal',
  mpesa: 'M-Pesa',
}

function formatAmount(amount: number, currency: string): string {
  if (!Number.isFinite(amount) || amount <= 0) return ''
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: currency || 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export default function SubscriptionSuccessPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const provider = String(searchParams.provider || '')
  const paymentId = String(searchParams.paymentId || '')
  const planId = String(searchParams.planId || '')
  const stripeSessionId = String(searchParams.session_id || '')
  const paypalOrderId = String(searchParams.token || searchParams.orderId || searchParams.subscription_id || '')

  const [status, setStatus] = useState<Status>('processing')
  const [message, setMessage] = useState<string>('Verifying payment…')
  const [transactionId, setTransactionId] = useState<string>('')
  const [paidAt, setPaidAt] = useState<string>('')
  const [paidAmount, setPaidAmount] = useState<number>(0)
  const [paidCurrency, setPaidCurrency] = useState<string>('')
  const verificationRequestStarted = useRef(false)

  const plan = useMemo(() => (planId ? getPlan(planId) : null), [planId])
  const planLabel = plan?.name ? `${plan.name} Plan` : ''

  const canVerify = useMemo(() => {
    if (!provider || !paymentId || !planId) return false
    if (provider === 'stripe') return !!stripeSessionId
    if (provider === 'paypal') return true // webhook confirms; poll status until done
    return false
  }, [provider, paymentId, planId, stripeSessionId])

  useEffect(() => {
    if (!canVerify) {
      setStatus('failed')
      setMessage('Missing payment details. If you paid, contact support.')
      return
    }

    const run = async () => {
      try {
        const payload =
          provider === 'stripe'
            ? { provider: 'stripe', action: 'confirm-session', sessionId: stripeSessionId, paymentId, planId }
            : { provider: 'paypal', action: 'subscription-status', paymentId, planId }

        const res = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          status?: string
          receipt?: { amount?: number; currency?: string; transactionId?: string; paidAt?: string }
        }

        if (!res.ok) {
          if (res.status === 401) {
            // Redirect to login preserving all payment params so user can retry after auth
            const params = new URLSearchParams()
            params.set('provider', provider)
            params.set('paymentId', paymentId)
            params.set('planId', planId)
            if (stripeSessionId) params.set('session_id', stripeSessionId)
            if (paypalOrderId) params.set('token', paypalOrderId)
            const callbackUrl = `/subscription/success?${params.toString()}`
            setStatus('failed')
            setMessage(`Please log in to verify your payment. Redirecting to login...`)
            // Auto-redirect to login with callback
            setTimeout(() => {
              const loginUrl = new URL('/login', window.location.origin)
              loginUrl.searchParams.set('callbackUrl', callbackUrl)
              window.location.href = loginUrl.toString()
            }, 2000)
            return
          }
          throw new Error(data?.error || 'Verification failed')
        }

        if (data.status === 'completed') {
          setStatus('completed')
          setMessage('Payment completed. Your subscription is now active.')
          if (data.receipt?.transactionId) setTransactionId(data.receipt.transactionId)
          if (data.receipt?.paidAt) setPaidAt(data.receipt.paidAt)
          if (typeof data.receipt?.amount === 'number') setPaidAmount(data.receipt.amount)
          if (data.receipt?.currency) setPaidCurrency(data.receipt.currency)
          if (!verificationRequestStarted.current) {
            verificationRequestStarted.current = true
            void fetch('/api/auth/email-verification/send', { method: 'POST' }).catch(() => {})
          }
          return
        }

        if (data.status === 'pending') {
          setStatus('processing')
          setMessage('Payment still pending. If you were charged, wait a moment and refresh.')
          return
        }

        setStatus('failed')
        setMessage('Payment not completed.')
      } catch (e: unknown) {
        setStatus('failed')
        setMessage(((e as Error)?.message) ?? 'Verification failed.')
      }
    }

    run()
  }, [canVerify, provider, paymentId, planId, stripeSessionId, paypalOrderId])

  const isCompleted = status === 'completed'
  const isFailed = status === 'failed'

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <main className="flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-8">
            <div className="mb-6 text-center">
              {/* Canonical brandmark — same component and asset as the product nav */}
              <div className="mb-6 flex justify-center">
                <MetarduLogo size={34} color="var(--text-primary)" />
              </div>

              {isCompleted ? (
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)]">
                  <svg className="h-8 w-8 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
              ) : status === 'processing' ? (
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]">
                  <svg className="h-8 w-8 animate-spin text-[var(--warning)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
              ) : (
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-red-500/35 bg-red-500/10">
                  <svg className="h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}

              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {isCompleted ? 'Thank you for your purchase' : isFailed ? 'We could not confirm your payment' : 'Confirming your payment'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{message}</p>
            </div>

            {/* Receipt summary — only once the payment is genuinely confirmed */}
            {isCompleted && (planLabel || transactionId) && (
              <div className="mb-6 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
                <div className="border-b border-[var(--border-color)] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Receipt
                  </p>
                </div>
                <dl className="divide-y divide-[var(--border-color)]">
                  {planLabel && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <dt className="text-sm text-[var(--text-muted)]">Plan</dt>
                      <dd className="text-sm font-medium text-[var(--text-primary)]">{planLabel}</dd>
                    </div>
                  )}
                  {provider && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <dt className="text-sm text-[var(--text-muted)]">Payment method</dt>
                      <dd className="text-sm font-medium text-[var(--text-primary)]">
                        {PROVIDER_LABELS[provider as Provider] ?? provider}
                      </dd>
                    </div>
                  )}
                  {formatAmount(paidAmount, paidCurrency) && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <dt className="text-sm text-[var(--text-muted)]">Amount paid</dt>
                      <dd className="text-sm font-semibold text-[var(--text-primary)]">
                        {formatAmount(paidAmount, paidCurrency)}
                      </dd>
                    </div>
                  )}
                  {paidAt && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <dt className="text-sm text-[var(--text-muted)]">Date</dt>
                      <dd className="text-sm font-medium text-[var(--text-primary)]">
                        {new Date(paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </dd>
                    </div>
                  )}
                  {transactionId && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <dt className="text-sm text-[var(--text-muted)]">Transaction ID</dt>
                      <dd className="max-w-[60%] truncate text-right text-sm font-medium text-[var(--text-primary)]" title={transactionId}>
                        {transactionId}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {isCompleted && (
              <p className="mb-6 rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-4 py-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                A copy of this receipt has been emailed to you. You can review every charge under
                billing history in your account settings.
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={isCompleted ? '/dashboard' : '/pricing'}
                className="flex-1 rounded-lg bg-[var(--accent)] py-3 text-center text-sm font-semibold text-black transition-colors hover:bg-[var(--accent-dim)]"
              >
                {isCompleted ? 'Go to dashboard' : 'Back to plans'}
              </Link>
              <Link
                href={isCompleted ? '/settings/profile' : '/help'}
                className="flex-1 rounded-lg border border-[var(--border-hover)] py-3 text-center text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-primary)]"
              >
                {isCompleted ? 'Billing history' : 'Contact support'}
              </Link>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
            Survey software built for Kenya
          </p>
        </div>
      </main>
    </div>
  )
}
