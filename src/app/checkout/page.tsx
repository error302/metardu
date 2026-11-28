'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { CurrencyCode, PlanId } from '@/lib/subscription/catalog'
import { PLAN_CATALOG, SUPPORTED_CURRENCIES, getTotalPrice } from '@/lib/subscription/catalog'
import { resolveSeatSelection, MAX_SELF_SERVE_SEATS } from '@/lib/subscription/seatSelection'
import {
  checkMpesaPaymentStatus,
  startSubscriptionPayment,
  type PaymentProvider,
} from '@/lib/enterprise/payments'
import {
  COUNTRY_OPTIONS,
  formatMoney,
  getCountryOption,
  inspectPaymentEligibility,
  type RegionalPaymentMethod,
} from '@/lib/payments/regionalCheckout'
import type { PaymentUnavailableReason } from '@/lib/payments/eligibility'

type PaymentAvailability =
  | { status: 'loading' }
  | {
    status: 'ready'
    market: 'kenya' | 'international'
    currency: CurrencyCode
    methods: RegionalPaymentMethod[]
    reason?: PaymentUnavailableReason
  }
  | { status: 'invalid'; code: string; message: string }
  | { status: 'error' }

function parseAvailabilityError(payload: unknown): { code: string; message: string } | null {
  if (!payload || typeof payload !== 'object') return null
  const code = 'code' in payload && typeof payload.code === 'string' ? payload.code : null
  const message = 'error' in payload && typeof payload.error === 'string' ? payload.error : null
  return code && message ? { code, message } : null
}

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  mpesa: 'M-Pesa',
  paypal: 'PayPal',
}

function CheckoutContent() {
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const requestedPlanParam = searchParams.get('plan')
  const fallbackPlan = PLAN_CATALOG.find((plan) => plan.id === 'pro') ?? PLAN_CATALOG[0]
  const initialPlan = PLAN_CATALOG.find((plan) => plan.id === requestedPlanParam && !plan.contactSales) ?? fallbackPlan
  const requestedCurrency = searchParams.get('currency')
  const requestedCountryParam = searchParams.get('countryCode')
  const requestedCountryCode = requestedCountryParam?.toUpperCase()
  const countryFromRequest = getCountryOption(requestedCountryCode ?? '')
  const initialCurrency = SUPPORTED_CURRENCIES.find((code) => code === requestedCurrency)
    ?? countryFromRequest?.currency
    ?? 'KES'
  const initialCountryCode = requestedCountryCode && /^[A-Z]{2}$/.test(requestedCountryCode)
    ? requestedCountryCode
    : 'KE'
  const requestedSeatsParam = searchParams.get('seats')
  const requestedSeats = requestedSeatsParam === null ? undefined : Number(requestedSeatsParam)
  const initialSeats = resolveSeatSelection(initialPlan.id, requestedSeats)
  const initialSeatCount = initialSeats.ok ? initialSeats.totalSeats : initialPlan.includedSeats
  const requestedMethodParam = searchParams.get('method')
  const requestedMethod: PaymentProvider | null = requestedMethodParam === 'mpesa'
    || requestedMethodParam === 'paypal'
    ? requestedMethodParam
    : null
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>(initialPlan.id)
  const [countryCode, setCountryCode] = useState(initialCountryCode)
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency)
  const [seatCount, setSeatCount] = useState(initialSeatCount)
  const [requestCountryCode, setRequestCountryCode] = useState(requestedCountryParam ?? 'KE')
  const [requestCurrency, setRequestCurrency] = useState(requestedCurrency ?? initialCurrency)
  const [requestPlanId, setRequestPlanId] = useState(requestedPlanParam ?? '')
  const [requestSeatCount, setRequestSeatCount] = useState(
    requestedSeatsParam ?? String(initialSeatCount),
  )
  const [method, setMethod] = useState<PaymentProvider | null>(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [processing, setProcessing] = useState(false)
  // React state updates are asynchronous: a second click before the re-render
  // sees `processing === true` can start a second paid request. A ref is set
  // synchronously, so a duplicate submit is refused before any fetch occurs.
  const startingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [mpesa, setMpesa] = useState<{ paymentId: string; checkoutRequestId: string } | null>(null)
  const [availability, setAvailability] = useState<PaymentAvailability>({ status: 'loading' })
  const [availabilityRetry, setAvailabilityRetry] = useState(0)

  const plan = useMemo(
    () => PLAN_CATALOG.find((candidate) => candidate.id === selectedPlanId) ?? PLAN_CATALOG[0],
    [selectedPlanId]
  )
  const countryOptions = useMemo(() => {
    if (COUNTRY_OPTIONS.some((option) => option.code === countryCode)) return COUNTRY_OPTIONS
    return [...COUNTRY_OPTIONS, { code: countryCode, name: `Other (${countryCode})`, currency }]
  }, [countryCode, currency])
  const paymentMethods = availability.status === 'ready' ? availability.methods : []
  const selectedPaymentMethod = paymentMethods.find((paymentMethod) => paymentMethod.id === method) ?? null
  const catalogMonthlyTotal = getTotalPrice(plan.id, currency, seatCount)
  const chargeCurrency = selectedPaymentMethod?.chargeCurrency
    ?? (availability.status === 'ready' ? availability.currency : currency)
  const monthlyCharge = selectedPaymentMethod?.chargeAmount ?? 0
  const unavailableReason = availability.status === 'ready'
    ? availability.reason
    : undefined
  const paypalExtraSeatsUnavailable = unavailableReason?.code
    === 'PAYPAL_EXTRA_SEATS_UNAVAILABLE'
  const requestedMethodUnavailable = availability.status === 'ready'
    && paymentMethods.length > 0
    && requestedMethod
    && !paymentMethods.some((paymentMethod) => paymentMethod.id === requestedMethod)
    ? `${PROVIDER_LABELS[requestedMethod]} is not available. Available method: ${paymentMethods[0]?.label ?? 'unavailable'}.`
    : null

  useEffect(() => {
    const sessionEmail = session?.user?.email
    if (sessionEmail) setEmail((current) => current || sessionEmail)
  }, [session?.user?.email])

  useEffect(() => {
    setSelectedPlanId(initialPlan.id)
    setCountryCode(initialCountryCode)
    setCurrency(initialCurrency)
    setSeatCount(initialSeatCount)
    setRequestCountryCode(requestedCountryParam ?? 'KE')
    setRequestCurrency(requestedCurrency ?? initialCurrency)
    setRequestPlanId(requestedPlanParam ?? '')
    setRequestSeatCount(requestedSeatsParam ?? String(initialSeatCount))
  }, [
    initialCountryCode,
    initialCurrency,
    initialPlan.id,
    initialPlan.includedSeats,
    initialSeatCount,
    requestedCountryParam,
    requestedCurrency,
    requestedPlanParam,
    requestedSeatsParam,
  ])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setAvailability({ status: 'loading' })
    setMethod(null)

    const params = new URLSearchParams({
      countryCode: requestCountryCode,
      currency: requestCurrency,
      planId: requestPlanId,
      seatCount: requestSeatCount,
    })

    void fetch(`/api/payments?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as unknown
        if (!response.ok) {
          const requestError = parseAvailabilityError(payload)
          if (!active) return
          if (requestError) {
            setAvailability({ status: 'invalid', ...requestError })
            return
          }
          throw new Error('Payment availability request failed')
        }
        const request = { countryCode, currency, planId: plan.id, seatCount }
        const inspection = inspectPaymentEligibility(payload, request)
        if (inspection.ok) {
          if (active) {
            setAvailability({
              status: 'ready',
              market: inspection.eligibility.market,
              currency: inspection.eligibility.currency,
              methods: inspection.eligibility.methods,
              ...(inspection.eligibility.reason
                ? { reason: inspection.eligibility.reason }
                : {}),
            })
          }
          return
        }
        throw new Error('Payment availability response was invalid')
      })
      .catch((requestError: unknown) => {
        if (!active || (requestError as Error)?.name === 'AbortError') return
        setAvailability({ status: 'error' })
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [
    availabilityRetry,
    countryCode,
    currency,
    plan.id,
    requestCountryCode,
    requestCurrency,
    requestPlanId,
    requestSeatCount,
    seatCount,
  ])

  useEffect(() => {
    if (availability.status !== 'ready') {
      setMethod(null)
      return
    }

    if (requestedMethod) {
      const requestedEligibleMethod = availability.methods.find(
        (paymentMethod) => paymentMethod.id === requestedMethod,
      )
      setMethod(requestedEligibleMethod?.id ?? null)
      return
    }

    setMethod((current) => {
      if (current && availability.methods.some((paymentMethod) => paymentMethod.id === current)) {
        return current
      }
      return availability.methods[0]?.id ?? null
    })
  }, [availability, requestedMethod])

  // ─── M-Pesa auto-polling (step 4) ────────────────────────────────────────
  // Poll the authoritative Daraja status every 4s while the customer is on
  // the "STK Push Sent" screen, so the plan activates the moment they enter
  // their PIN — without them having to press "Verify Payment". Stops on a
  // terminal status or after ~3 minutes (the manual button still works).
  const [, setAutoPollCount] = useState(0)
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
        const result = await checkMpesaPaymentStatus(mpesa)
        if (cancelled) return
        if (result.status === 'completed') {
          window.location.href = '/dashboard'
          return
        }
        if (result.status === 'failed') {
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
      setAutoPollCount((count) => {
        if (count >= MAX_POLLS) {
          clearInterval(interval)
          return count
        }
        void tick()
        return count + 1
      })
    }, 4000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mpesa?.paymentId, mpesa?.checkoutRequestId])

  const onStart = async () => {
    if (startingRef.current) return
    startingRef.current = true
    setError(null)
    if (!selectedPaymentMethod) {
      setError('No eligible payment method is available. Please contact METARDU support.')
      startingRef.current = false
      return
    }

    setProcessing(true)
    try {
      const result = await startSubscriptionPayment({
        planId: plan.id,
        currency,
        method: selectedPaymentMethod.id,
        seatCount,
        email,
        phoneNumber: phoneNumber || undefined,
        countryCode,
      })

      if (result.kind === 'activated') {
        window.location.href = '/dashboard'
        return
      }

      if (result.kind === 'redirect') {
        window.location.href = result.url
        return
      }

      if (result.kind === 'mpesa') {
        setMpesa({ paymentId: result.paymentId, checkoutRequestId: result.checkoutRequestId })
        setStep(4)
        return
      }

      setError('Unexpected payment response.')
    } catch (paymentError: unknown) {
      setError(((paymentError as Error)?.message) ?? 'Payment failed.')
    } finally {
      setProcessing(false)
      startingRef.current = false
    }
  }

  const canContinueDetails =
    availability.status === 'ready'
    && !!selectedPaymentMethod
    && !!email
    && (selectedPaymentMethod.id !== 'mpesa' || !!phoneNumber)

  const updateSeatCount = (nextSeatCount: number) => {
    setSeatCount(nextSeatCount)
    setRequestSeatCount(String(nextSeatCount))
  }

  const selectPlan = (planId: PlanId) => {
    setSelectedPlanId(planId)
    const nextPlan = PLAN_CATALOG.find((candidate) => candidate.id === planId)
    if (nextPlan) {
      setSeatCount(nextPlan.includedSeats)
      setRequestPlanId(nextPlan.id)
      setRequestSeatCount(String(nextPlan.includedSeats))
    }
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-10">
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] mb-2">Checkout</h1>
        <p className="text-[var(--text-secondary)] mb-8">Choose a plan and complete payment.</p>

        {requestedMethodUnavailable && (
          <div role="status" className="mb-6 rounded-lg border border-amber-700/40 bg-amber-900/10 px-4 py-3 text-sm text-amber-100">
            <p>{requestedMethodUnavailable} Choose another enabled payment method or contact METARDU support.</p>
            <button
              type="button"
              onClick={() => setAvailabilityRetry((attempt) => attempt + 1)}
              className="mt-2 underline underline-offset-2"
            >
              Retry payment method check
            </button>
          </div>
        )}

        {availability.status === 'invalid' && (
          <div
            role="alert"
            data-error-code={availability.code}
            className="mb-6 rounded-lg border border-red-900/50 bg-red-900/10 px-4 py-3 text-sm text-red-200"
          >
            <p className="font-semibold">Checkout request rejected: {availability.code}</p>
            <p className="mt-1">{availability.message}</p>
            <a href="/pricing" className="mt-2 inline-block underline underline-offset-2">
              Return to pricing
            </a>
          </div>
        )}

        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map((progressStep) => (
            <div
              key={progressStep}
              className={`flex-1 h-2 rounded ${step >= progressStep ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}
            />
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-6 rounded-lg border border-red-900/50 bg-red-900/10 px-4 py-3 text-sm text-red-200">
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
                value={countryCode}
                onChange={(event) => {
                  const nextCountry = COUNTRY_OPTIONS.find((option) => option.code === event.target.value)
                  if (!nextCountry) return
                  setCountryCode(nextCountry.code)
                  setCurrency(nextCountry.currency)
                  setRequestCountryCode(nextCountry.code)
                  setRequestCurrency(nextCountry.currency)
                }}
                className="w-full p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] min-h-[44px]"
              >
                {countryOptions.map((option) => (
                  <option key={option.code} value={option.code}>{option.name}</option>
                ))}
              </select>
              <p className="text-xs text-[var(--text-muted)] mt-2">Currency is selected from your country. Available payment methods are confirmed before payment.</p>
            </div>

            <div className="space-y-3">
              {PLAN_CATALOG.map((catalogPlan) => (
                <button
                  key={catalogPlan.id}
                  type="button"
                  onClick={() => selectPlan(catalogPlan.id)}
                  disabled={catalogPlan.contactSales}
                  className={`w-full text-left p-4 border-2 rounded-lg transition min-h-[56px] ${
                    catalogPlan.contactSales ? 'cursor-not-allowed opacity-60' : selectedPlanId === catalogPlan.id ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-[var(--border-color)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[var(--text-primary)] font-semibold text-lg">{catalogPlan.name}</div>
                      <div className="text-[var(--text-muted)] text-sm">{catalogPlan.features.slice(0, 2).join(' • ')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[var(--accent)] font-bold text-2xl">{catalogPlan.contactSales ? 'Custom' : formatMoney(getTotalPrice(catalogPlan.id, currency, catalogPlan.id === selectedPlanId ? seatCount : catalogPlan.includedSeats), currency)}</div>
                      <div className="text-[var(--text-muted)] text-xs">{catalogPlan.contactSales ? 'Contact sales' : '/month'}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {plan.isPerSeat && (
              <div className="mt-5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)]">Team seats</label>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{plan.includedSeats} included · {formatMoney(plan.perSeatPrices[currency], currency)} per additional seat/month</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" aria-label="Remove one seat" onClick={() => updateSeatCount(Math.max(plan.includedSeats, seatCount - 1))} disabled={seatCount <= plan.includedSeats} className="h-9 w-9 rounded-lg border border-[var(--border-color)] text-lg text-[var(--text-primary)] disabled:opacity-40">−</button>
                    <output aria-live="polite" className="min-w-8 text-center font-semibold text-[var(--text-primary)]">{seatCount}</output>
                    <button type="button" aria-label="Add one seat" onClick={() => updateSeatCount(Math.min(MAX_SELF_SERVE_SEATS, seatCount + 1))} disabled={seatCount >= MAX_SELF_SERVE_SEATS} className="h-9 w-9 rounded-lg border border-[var(--border-color)] text-lg text-[var(--text-primary)] disabled:opacity-40">+</button>
                  </div>
                </div>
                {seatCount > plan.includedSeats && <p className="mt-3 text-xs text-[var(--text-secondary)]">{seatCount - plan.includedSeats} additional seat{seatCount - plan.includedSeats === 1 ? '' : 's'} · monthly total updates below. For more than {MAX_SELF_SERVE_SEATS} seats, contact METARDU.</p>}
              </div>
            )}

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
                  onChange={(event) => setEmail(event.target.value)}
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
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="e.g. 254712345678"
                  className="w-full p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] min-h-[44px]"
                />
                <p className="text-xs text-[var(--text-muted)] mt-2">Required only for M-Pesa STK Push.</p>
              </div>
            </div>

            <fieldset className="mt-6">
              <legend className="block text-sm font-medium text-[var(--text-primary)] mb-2">Payment method</legend>
              <div className="space-y-2">
                {paymentMethods.map((paymentMethod) => (
                  <label
                    key={paymentMethod.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer min-h-[44px] ${
                      method === paymentMethod.id ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-[var(--border-color)]'
                    }`}
                  >
                    <input
                      aria-label={`Pay with ${paymentMethod.label}`}
                      type="radio"
                      name="paymentMethod"
                      value={paymentMethod.id}
                      checked={method === paymentMethod.id}
                      onChange={() => setMethod(paymentMethod.id)}
                    />
                    <span className="text-[var(--text-primary)]">{paymentMethod.label}</span>
                  </label>
                ))}
                {availability.status === 'loading' && (
                  <p role="status" className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-3 text-sm text-[var(--text-secondary)]">
                    Checking available payment methods…
                  </p>
                )}
                {availability.status === 'error' && (
                  <div role="alert" className="rounded-lg border border-red-900/50 bg-red-900/10 px-3 py-3 text-sm text-red-200">
                    <p>We couldn&apos;t verify available payment methods. Please try again or contact METARDU support.</p>
                    <button
                      type="button"
                      onClick={() => setAvailabilityRetry((attempt) => attempt + 1)}
                      className="mt-2 underline underline-offset-2"
                    >
                      Retry payment method check
                    </button>
                  </div>
                )}
                {availability.status === 'invalid' && (
                  <p className="rounded-lg border border-red-900/50 bg-red-900/10 px-3 py-3 text-sm text-red-200">
                    Correct the checkout details before checking payment methods.
                  </p>
                )}
                {availability.status === 'ready' && paymentMethods.length === 0 && (
                  <div role="status" className="rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-3 text-sm text-amber-100">
                    <p>
                      {unavailableReason?.message
                        ?? 'No online payment method is currently available. Please contact METARDU support to complete your subscription.'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {paypalExtraSeatsUnavailable && (
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="underline underline-offset-2"
                        >
                          Adjust seat count
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAvailabilityRetry((attempt) => attempt + 1)}
                        className="underline underline-offset-2"
                      >
                        Retry payment method check
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </fieldset>

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
              {plan.isPerSeat && <div className="flex items-center justify-between text-[var(--text-primary)] mb-2"><span>Seats</span><span className="font-semibold">{seatCount} total · {plan.includedSeats} included</span></div>}
              <div className="flex items-center justify-between text-[var(--text-primary)] mb-2">
                <span>Catalog monthly price</span>
                <span className="font-semibold">{formatMoney(catalogMonthlyTotal, currency)} {currency}</span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-primary)] mb-2">
                <span>Charge currency</span>
                <span className="font-semibold">{chargeCurrency}</span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-primary)] mb-2">
                <span>Method</span>
                <span className="font-semibold">{selectedPaymentMethod ? selectedPaymentMethod.label : 'Unavailable'}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-2 mt-2 text-[var(--text-primary)]">
                <span className="font-semibold">{selectedPaymentMethod?.id === 'paypal' ? 'PayPal monthly charge' : 'Monthly total'}</span>
                <span className="font-bold text-lg text-[var(--accent)]">{formatMoney(monthlyCharge, chargeCurrency)}</span>
              </div>
            </div>

            <div className="text-xs text-[var(--text-muted)] mb-6">
              PayPal redirects to PayPal approval. M-Pesa triggers an STK push.
              {selectedPaymentMethod?.id === 'paypal' && (
                <>
                  <span className="block mt-2 text-amber-400">
                    PayPal will charge {formatMoney(monthlyCharge, chargeCurrency)} {chargeCurrency} each month.
                  </span>
                  <span className="block mt-2 text-amber-300">
                    The displayed catalog price is {formatMoney(catalogMonthlyTotal, currency)} {currency}; the PayPal charge is a separate amount and is not a conversion of the displayed catalog price.
                  </span>
                </>
              )}
              {paypalExtraSeatsUnavailable && unavailableReason && (
                <span role="status" className="block mt-2 text-amber-300">
                  {unavailableReason.message}
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
                disabled={processing || paypalExtraSeatsUnavailable || !selectedPaymentMethod}
                className="flex-1 py-3.5 bg-[var(--accent)] text-black rounded-lg hover:bg-[var(--accent-dim)] disabled:bg-gray-700 disabled:text-[var(--text-primary)] font-medium min-h-[44px]"
              >
                {processing ? 'Starting payment…' : paypalExtraSeatsUnavailable ? 'Choose included seats' : 'Pay Now'}
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
                  const result = await checkMpesaPaymentStatus(mpesa)
                  if (result.status === 'completed') {
                    window.location.href = '/dashboard'
                    return
                  }
                  if (result.status === 'failed') setError('Payment failed. Please try again.')
                  if (result.status === 'pending') setError('Still pending. If you have paid, wait a moment then try again.')
                } catch (paymentError: unknown) {
                  setError(((paymentError as Error)?.message) ?? 'Failed to verify payment.')
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
