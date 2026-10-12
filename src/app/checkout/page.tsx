'use client';

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { CurrencyCode, PlanId } from '@/lib/subscription/catalog'
import { PLAN_CATALOG } from '@/lib/subscription/catalog'
import { resolvePayPalCurrency } from '@/lib/payments/paypalCurrency'
import {
  checkMpesaPaymentStatus,
  getCurrencyForCountry,
  getPaymentMethods,
  startSubscriptionPayment,
  type PaymentMethod,
} from '@/lib/enterprise/payments'

function CheckoutContent() {
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>(() => {
    const planParam = searchParams.get('plan') as PlanId | null
    if (planParam && PLAN_CATALOG.some(p => p.id === planParam)) return planParam
    return 'pro'
  })
  const [country, setCountry] = useState('Kenya')
  const [currency, setCurrency] = useState<CurrencyCode>('KES')
  const [method, setMethod] = useState<PaymentMethod['type']>(() => {
    const requested = searchParams.get('method')
    return requested === 'paypal' || requested === 'card' || requested === 'mpesa' ? requested : 'mpesa'
  })
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mpesa, setMpesa] = useState<{ paymentId: string; checkoutRequestId: string } | null>(null)
  const [availableProviders, setAvailableProviders] = useState<{ stripe: boolean; paypal: boolean; mpesa: boolean } | null>(null)

  const plan = useMemo(
    () => PLAN_CATALOG.find((p) => p.id === selectedPlanId) ?? PLAN_CATALOG[0],
    [selectedPlanId]
  )
  const paypalChargeCurrency = resolvePayPalCurrency(currency)
  const chargeCurrency = method === 'paypal' ? paypalChargeCurrency : currency

  const paymentMethods = useMemo(() => getPaymentMethods(country).filter((paymentMethod) => {
    if (!availableProviders) return true
    if (paymentMethod.type === 'mpesa') return availableProviders.mpesa
    if (paymentMethod.type === 'paypal') return availableProviders.paypal
    return paymentMethod.type === 'card' && availableProviders.stripe
  }), [country, availableProviders])

  useEffect(() => {
    const sessionEmail = session?.user?.email
    if (sessionEmail) setEmail((current) => current || sessionEmail)
  }, [session?.user?.email])

  useEffect(() => {
    let active = true
    void fetch('/api/payments').then(async (response) => {
      if (!response.ok) return
      const data = await response.json() as { providers?: { stripe?: boolean; paypal?: boolean; mpesa?: boolean } }
      if (active && data.providers) {
        setAvailableProviders({
          stripe: data.providers.stripe === true,
          paypal: data.providers.paypal === true,
          mpesa: data.providers.mpesa === true,
        })
      }
    }).catch(() => { /* provider availability stays unknown; the server remains authoritative */ })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const requested = searchParams.get('method')
    if (
      (requested === 'paypal' || requested === 'card' || requested === 'mpesa') &&
      paymentMethods.some((paymentMethod) => paymentMethod.type === requested)
    ) {
      if (method !== requested) setMethod(requested)
      return
    }
    if (!paymentMethods.some((m) => m.type === method)) {
      setMethod(paymentMethods.find((paymentMethod) => paymentMethod.type === 'mpesa')?.type ?? paymentMethods[0]?.type ?? 'card')
    }
  }, [paymentMethods, method, searchParams])

  // ─── M-Pesa auto-polling (step 4) ────────────────────────────────────────
  // Poll the authoritative Daraja status every 4s while the customer is on
  // the "STK Push Sent" screen, so the plan activates the moment they enter
  // their PIN — without them having to press "Verify Payment". Stops on a
  // terminal status or after ~3 minutes (the manual button still works).
  const [autoPollCount, setAutoPollCount] = useState(0)
  const [autoVerifying, setAutoVerifying] = useState(false)
  useEffect(() => {
    if (step !== 4 || !mpesa) return
    setAutoPollCount(0)
    let cancelled = false
    const MAX_POLLS = 45 // 45 × 4s ≈ 3 minutes

    const tick = async () => {
      if (cancelled) return
      setAutoVerifying(true)
      try {
        const r = await checkMpesaPaymentStatus(mpesa)
        if (cancelled) return
        if (r.status === 'completed') {
          window.location.href = '/dashboard'
          return
        }
        if (r.status === 'failed') {
          setError('Payment failed. Please try again.')
          return
        }
      } catch {
        // Transient network/Daraja errors — keep polling quietly.
      } finally {
        if (!cancelled) setAutoVerifying(false)
      }
    }

    const interval = setInterval(() => {
      setAutoPollCount((c) => {
        if (c >= MAX_POLLS) {
          clearInterval(interval)
          return c
        }
        void tick()
        return c + 1
      })
    }, 4000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mpesa?.paymentId, mpesa?.checkoutRequestId])


  const formatPrice = (amount: number, priceCurrency: CurrencyCode = currency) => {
    const symbols: Partial<Record<CurrencyCode, string>> = {
      KES: 'KSh ',
      UGX: 'USh ',
      TZS: 'TSh ',
      NGN: '₦ ',
      GHS: 'GH₵ ',
      ZAR: 'R ',
      USD: '$ ',
      EUR: '€ ',
      GBP: '£ ',
      INR: '₹ ',
      IDR: 'Rp ',
      BRL: 'R$ ',
      AUD: 'A$ ',
    }
    return `${symbols[priceCurrency] ?? `${priceCurrency} `}${amount.toLocaleString()}`
  }

  const onStart = async () => {
    setError(null)
    setProcessing(true)
    try {
      const res = await startSubscriptionPayment({
        planId: plan.id,
        currency,
        method,
        email,
        phoneNumber: phoneNumber || undefined,
        country,
      })

      if (res.kind === 'activated') {
        window.location.href = '/dashboard'
        return
      }

      if (res.kind === 'redirect') {
        window.location.href = res.url
        return
      }

      if (res.kind === 'mpesa') {
        setMpesa({ paymentId: res.paymentId, checkoutRequestId: res.checkoutRequestId })
        setStep(4)
        return
      }

      setError('Unexpected payment response.')
    } catch (e: unknown) {
      setError(((e as Error)?.message) ?? 'Payment failed.')
    } finally {
      setProcessing(false)
    }
  }

  const canContinueDetails =
    !!email && (method !== 'mpesa' || !!phoneNumber) && paymentMethods.some((m) => m.type === method)
  const requestedPayPalUnavailable = searchParams.get('method') === 'paypal' && availableProviders !== null && !availableProviders.paypal

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-10">
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] mb-2">Checkout</h1>
        <p className="text-[var(--text-secondary)] mb-8">Choose a plan and complete payment.</p>

        {requestedPayPalUnavailable && (
          <div role="status" className="mb-6 rounded-lg border border-amber-700/40 bg-amber-900/10 px-4 py-3 text-sm text-amber-100">
            PayPal is temporarily unavailable. Choose another enabled payment method or contact METARDU support.
          </div>
        )}

        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded ${step >= s ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-900/50 bg-red-900/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">1) Select Plan</h2>

            <div className="mb-4">
              <label htmlFor="checkout-country" className="block text-sm font-medium text-[var(--text-primary)] mb-2">Country</label>
              <select
                id="checkout-country"
                value={country}
                onChange={(e) => {
                  const c = e.target.value
                  setCountry(c)
                  setCurrency(getCurrencyForCountry(c))
                }}
                className="w-full p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] min-h-[44px]"
              >
                <option value="Kenya">Kenya</option>
                <option value="Uganda">Uganda</option>
                <option value="Tanzania">Tanzania</option>
                <option value="Nigeria">Nigeria</option>
                <option value="Ghana">Ghana</option>
                <option value="South Africa">South Africa</option>
                <option value="Germany">Germany</option>
                <option value="UK">UK</option>
                <option value="US">US</option>
              </select>
              <p className="text-xs text-[var(--text-muted)] mt-2">Currency auto-selects from country, and you can still pay via card globally.</p>
            </div>

            <div className="space-y-3">
              {PLAN_CATALOG.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`w-full text-left p-4 border-2 rounded-lg transition min-h-[56px] ${
                    selectedPlanId === p.id ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-[var(--border-color)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[var(--text-primary)] font-semibold text-lg">{p.name}</div>
                      <div className="text-[var(--text-muted)] text-sm">{p.features.slice(0, 2).join(' • ')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[var(--accent)] font-bold text-2xl">{formatPrice(p.prices[currency])}</div>
                      <div className="text-[var(--text-muted)] text-xs">/month</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full mt-6 py-3.5 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] font-medium min-h-[44px]"
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">2) Payment Details</h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="checkout-email" className="block text-sm font-medium text-[var(--text-primary)] mb-2">Email</label>
                <input
                  id="checkout-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="checkout-phone" className="block text-sm font-medium text-[var(--text-primary)] mb-2">Phone (M-Pesa only)</label>
                <input
                  id="checkout-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g. 254712345678"
                  className="w-full p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] min-h-[44px]"
                />
                <p className="text-xs text-[var(--text-muted)] mt-2">Required only for M-Pesa STK Push.</p>
              </div>
            </div>

            <div className="mt-6">
              <div className="block text-sm font-medium text-[var(--text-primary)] mb-2">Payment Method</div>
              <div className="space-y-2">
                {paymentMethods.map((pm) => (
                  <label
                    key={pm.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer min-h-[44px] ${
                      method === pm.type ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-[var(--border-color)]'
                    }`}
                  >
                    <input aria-label="Paymentmethod"
                      type="radio"
                      name="paymentMethod"
                      value={pm.type}
                      checked={method === pm.type}
                      onChange={() => setMethod(pm.type)}
                    />
                    <span className="text-[var(--text-primary)]">{pm.name}</span>
                  </label>
                ))}
                {availableProviders && paymentMethods.length === 0 && (
                  <p className="rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-3 text-sm text-amber-100">
                    Online payment is not configured right now. Please contact METARDU support to complete your subscription.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3.5 border border-[var(--border-hover)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-primary)] font-medium min-h-[44px]"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canContinueDetails}
                className="flex-1 py-3.5 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] disabled:bg-gray-700 disabled:text-[var(--text-primary)] font-medium min-h-[44px]"
              >
                Review Order
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">3) Confirm & Pay</h2>

            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-4 mb-6">
              <div className="flex items-center justify-between text-[var(--text-primary)] mb-2">
                <span>Plan</span>
                <span className="font-semibold">{plan.name}</span>
                </div>
              <div className="flex items-center justify-between text-[var(--text-primary)] mb-2">
                <span>{method === 'paypal' ? 'PayPal charge currency' : 'Currency'}</span>
                <span className="font-semibold">{chargeCurrency}</span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-primary)] mb-2">
                <span>Method</span>
                <span className="font-semibold">{paymentMethods.find((p) => p.type === method)?.name ?? method}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-2 mt-2 text-[var(--text-primary)]">
                <span className="font-semibold">Monthly total</span>
                <span className="font-bold text-lg text-[var(--accent)]">{formatPrice(plan.prices[chargeCurrency], chargeCurrency)}</span>
              </div>
            </div>

            <div className="text-xs text-[var(--text-muted)] mb-6">
              Card payments use Stripe Checkout (Visa/Mastercard). PayPal redirects to PayPal approval. M-Pesa triggers STK push.
              {method === 'paypal' && (
                <span className="block mt-2 text-amber-400">
                  PayPal will charge {formatPrice(plan.prices[paypalChargeCurrency], paypalChargeCurrency)} {paypalChargeCurrency} each month.
                  {paypalChargeCurrency !== currency && ` Your selected price is in ${currency}; PayPal or your card provider may apply its own exchange rate.`}
                </span>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3.5 border border-[var(--border-hover)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-primary)] font-medium min-h-[44px]"
              >
                Back
              </button>
              <button
                onClick={onStart}
                disabled={processing}
                className="flex-1 py-3.5 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] disabled:bg-gray-700 disabled:text-[var(--text-primary)] font-medium min-h-[44px]"
              >
                {processing ? 'Starting payment…' : 'Pay Now'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && mpesa && (
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">M-Pesa STK Push Sent</h2>
            <p className="text-[var(--text-secondary)] mb-2">Enter your M-Pesa PIN on your phone. This page activates your plan automatically once the payment is confirmed.</p>
            <p className="text-xs text-[var(--text-secondary)] mb-6 flex items-center gap-2">
              {autoVerifying && (
                <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" aria-hidden="true" />
              )}
              {autoVerifying ? 'Verifying payment…' : 'Waiting for confirmation…'}
            </p>

            <button
              onClick={async () => {
                setProcessing(true)
                setError(null)
                try {
                  const r = await checkMpesaPaymentStatus(mpesa)
                  if (r.status === 'completed') {
                    window.location.href = '/dashboard'
                    return
                  }
                  if (r.status === 'failed') setError('Payment failed. Please try again.')
                  if (r.status === 'pending') setError('Still pending. If you have paid, wait a moment then try again.')
                } catch (e: unknown) {
                  setError(((e as Error)?.message) ?? 'Failed to verify payment.')
                } finally {
                  setProcessing(false)
                }
              }}
              disabled={processing}
              className="w-full py-3.5 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] disabled:bg-gray-700 disabled:text-[var(--text-primary)] font-medium min-h-[44px]"
            >
              {processing ? 'Checking…' : 'Verify Payment'}
            </button>

            <button
              onClick={() => {
                setMpesa(null)
                setStep(2)
              }}
              className="w-full mt-3 py-3.5 border border-[var(--border-hover)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-primary)] font-medium min-h-[44px]"
            >
              Change method
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
