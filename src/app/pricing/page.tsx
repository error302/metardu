'use client';

import { useEffect, useMemo, useState } from 'react'
import { ModernPricingPage, PricingCardProps } from '@/components/ui/animated-glassy-pricing'
import {
  PLAN_CATALOG,
  SUPPORTED_CURRENCIES,
  getPlanPrice,
  getTotalPrice,
  getPerSeatPrice,
  type CurrencyCode,
  type PlanId,
} from '@/lib/subscription/catalog'
import { MAX_SELF_SERVE_SEATS } from '@/lib/subscription/seatSelection'
import {
  COUNTRY_OPTIONS,
  detectRegionFromLocale,
  formatMoney,
  getCountryOption,
  inspectPaymentEligibility,
  type RegionalPaymentMethod,
} from '@/lib/payments/regionalCheckout'
import type { PaymentUnavailableReason } from '@/lib/payments/eligibility'
import { Smartphone } from 'lucide-react'

const SELF_SERVE_PAID_PLANS = PLAN_CATALOG.filter(
  (plan) => plan.id !== 'free' && !plan.contactSales,
)

type EligibilityStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'

interface EligibilityResult {
  status: EligibilityStatus
  method?: RegionalPaymentMethod
  reason?: PaymentUnavailableReason
}

const ELIGIBILITY_DEBOUNCE_MS = 150

export default function PricingPage() {
  const [currency, setCurrency] = useState<CurrencyCode>('KES')
  const [countryCode, setCountryCode] = useState('KE')
  const [contextReady, setContextReady] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>('pro')
  const [seatCount, setSeatCount] = useState(1)
  const [eligibility, setEligibility] = useState<EligibilityResult>({ status: 'idle' })
  const [eligibilityRetry, setEligibilityRetry] = useState(0)
  const [announcement, setAnnouncement] = useState<string | null>(
    'Checking available payment methods…',
  )

  useEffect(() => { document.title = 'Pricing — METARDU' }, [])

  useEffect(() => {
    // Infer only from the browser's existing locale or an explicitly stored
    // display preference. The selected country remains independent from the
    // display currency so a currency change cannot silently move the market.
    const localeCountryCode = detectRegionFromLocale(navigator.language)

    let cachedCode: CurrencyCode | undefined
    let cachedCountryCode: string | undefined
    try {
      const cached = localStorage.getItem('metardu:currency')
      if (cached) {
        const parsed = JSON.parse(cached) as { code?: CurrencyCode; ts?: number; countryCode?: string }
        if (typeof parsed.ts === 'number' && Date.now() - parsed.ts < 86400000) {
          if (parsed.code && SUPPORTED_CURRENCIES.includes(parsed.code)) cachedCode = parsed.code
          if (parsed.countryCode && /^[A-Za-z]{2}$/.test(parsed.countryCode)) {
            cachedCountryCode = parsed.countryCode.toUpperCase()
          }
        }
      }
    } catch { /* ignore invalid display preferences */ }

    const detectedCountryCode = cachedCountryCode ?? localeCountryCode ?? 'KE'
    const detectedCurrency = cachedCode
      ?? getCountryOption(detectedCountryCode)?.currency
      ?? 'KES'

    setCountryCode(detectedCountryCode)
    setCurrency(detectedCurrency)
    setContextReady(true)
  }, [])

  const selectedPlan = useMemo(
    () => PLAN_CATALOG.find((plan) => plan.id === selectedPlanId) ?? PLAN_CATALOG[1],
    [selectedPlanId],
  )

  useEffect(() => {
    if (!contextReady) return

    let active = true
    const controller = new AbortController()
    setEligibility({ status: 'loading' })
    setAnnouncement('Checking available payment methods…')

    const params = new URLSearchParams({
      countryCode,
      currency,
      planId: selectedPlanId,
      seatCount: String(seatCount),
    })

    const timeout = window.setTimeout(() => {
      void fetch(`/api/payments?${params.toString()}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Payment availability request failed')

          const payload = await response.json() as unknown
          const inspection = inspectPaymentEligibility(payload, {
            countryCode,
            currency,
            planId: selectedPlanId,
            seatCount,
          })

          if (!inspection.ok) throw new Error('Payment availability response was invalid')

          const method = inspection.eligibility.methods[0]
          if (method) {
            if (!active) return
            setEligibility({ status: 'ready', method })
            setAnnouncement(
              `${method.label} is available for ${getCountryOption(countryCode)?.name ?? `Other (${countryCode})`}.`,
            )
            return
          }

          const reason = inspection.eligibility.reason
          if (!reason) throw new Error('Payment availability response was invalid')
          if (!active) return
          setEligibility({ status: 'unavailable', reason })
          setAnnouncement(reason.message)
        })
        .catch((requestError: unknown) => {
          if (!active || (requestError as Error)?.name === 'AbortError') return
          setEligibility({ status: 'error' })
          setAnnouncement('Payment method verification failed.')
        })
    }, ELIGIBILITY_DEBOUNCE_MS)

    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [contextReady, countryCode, currency, eligibilityRetry, seatCount, selectedPlanId])

  const handlePlanChange = (newPlanId: string) => {
    const plan = PLAN_CATALOG.find((candidate) => candidate.id === newPlanId)
    if (plan) {
      setSelectedPlanId(plan.id)
      setSeatCount(Math.max(plan.includedSeats, 1))
    }
  }

  const countryOptions = useMemo(() => {
    if (COUNTRY_OPTIONS.some((option) => option.code === countryCode)) return COUNTRY_OPTIONS
    return [...COUNTRY_OPTIONS, { code: countryCode, name: `Other (${countryCode})`, currency }]
  }, [countryCode, currency])
  const selectedMethod = eligibility.status === 'ready' ? eligibility.method : undefined
  const eligibilityError = eligibility.status === 'error'
  const eligibilityLoading = eligibility.status === 'idle' || eligibility.status === 'loading'
  const unavailableReason = eligibility.status === 'unavailable'
    ? eligibility.reason
    : undefined
  const paypalExtraSeatsUnavailable = unavailableReason?.code
    === 'PAYPAL_EXTRA_SEATS_UNAVAILABLE'
  const selectedExtraSeats = selectedPlan.isPerSeat
    && seatCount > selectedPlan.includedSeats
  const checkoutHref = `/checkout?plan=${encodeURIComponent(selectedPlanId)}&currency=${encodeURIComponent(currency)}&countryCode=${encodeURIComponent(countryCode)}&seats=${seatCount}&method=${selectedMethod?.id ?? ''}`

  const plans: PricingCardProps[] = PLAN_CATALOG.map((plan) => {
    const isEnterprise = plan.contactSales
    const perSeat = getPerSeatPrice(plan.id, currency)
    const basePrice = getPlanPrice(plan.id, currency)

    let priceLabel: string
    let priceNote: string | undefined
    if (isEnterprise) {
      priceLabel = 'Custom'
    } else if (plan.isPerSeat) {
      priceLabel = formatMoney(basePrice, currency)
      priceNote = `Includes ${plan.includedSeats} seats · ${formatMoney(perSeat, currency)} per additional seat/month`
    } else {
      priceLabel = formatMoney(basePrice, currency)
    }

    return {
      planId: plan.id,
      planName: plan.name,
      description: plan.id === 'free'
        ? 'Perfect for students and hobbyist surveyors'
        : plan.id === 'pro'
          ? 'For professional surveyors and individual practitioners'
          : plan.id === 'team'
            ? 'For survey crews and small firms (3 seats included)'
            : plan.id === 'firm'
              ? 'For established firms with multiple teams (5 seats included)'
              : 'Custom deployment for government and large organizations',
      price: priceLabel,
      priceNote,
      features: plan.features,
      checkoutHref: plan.id === 'free' || isEnterprise
        ? undefined
        : `/checkout?plan=${encodeURIComponent(plan.id)}&currency=${currency}&countryCode=${encodeURIComponent(countryCode)}&seats=${plan.includedSeats}`,
      buttonText: isEnterprise
        ? 'Contact Sales'
        : plan.id === 'free'
          ? 'Get Started Free'
          : `Choose ${plan.name}`,
      buttonVariant: plan.id === 'free' ? 'secondary' as const : 'primary' as const,
      isPopular: plan.id === 'pro',
    }
  })

  return (
    <>
      <ModernPricingPage
        title={
          <>
            Simple, <span className="text-[var(--accent)]">Transparent</span> Pricing
          </>
        }
        subtitle="Start with a free account. Review monthly prices and payment options before you upgrade."
        plans={plans}
      >
        <div className="w-full max-w-4xl mx-auto mt-16 mb-12 p-8 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3 border border-emerald-500/20">
              Payment options
            </div>
            <h3 className="text-2xl font-bold text-[var(--text-primary)]">Choose your payment method</h3>
            <p className="text-[var(--text-secondary)] text-sm mt-1">
              Payment methods and recurring charges are confirmed by METARDU before checkout.
            </p>

            <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <label className="inline-flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2.5 text-left">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Country</span>
                <select
                  aria-label="Pricing country"
                  value={countryCode}
                  onChange={(event) => {
                    const nextCountry = getCountryOption(event.target.value)
                    if (!nextCountry) return
                    setCountryCode(nextCountry.code)
                    setCurrency(nextCountry.currency)
                    try {
                      localStorage.setItem('metardu:currency', JSON.stringify({
                        code: nextCountry.currency,
                        countryCode: nextCountry.code,
                        ts: Date.now(),
                      }))
                    } catch { /* ignore unavailable display storage */ }
                  }}
                  className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  {countryOptions.map((country) => (
                    <option key={country.code} value={country.code}>{country.name}</option>
                  ))}
                </select>
              </label>

              <label className="inline-flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2.5 text-left">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Display currency</span>
                <select
                  aria-label="Pricing currency"
                  value={currency}
                  onChange={(event) => {
                    const nextCurrency = event.target.value as CurrencyCode
                    setCurrency(nextCurrency)
                    try {
                      localStorage.setItem('metardu:currency', JSON.stringify({
                        code: nextCurrency,
                        countryCode,
                        ts: Date.now(),
                      }))
                    } catch { /* ignore unavailable display storage */ }
                  }}
                  className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
            </div>
          </div>

          {announcement !== null && (
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="sr-only"
            >
              {announcement}
            </p>
          )}

          <div className="max-w-md mx-auto mb-4 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--text-muted)] block">Selected Plan:</span>
              <span className="text-base font-bold text-white">{selectedPlan.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Pricing plan"
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[var(--accent)]"
                value={selectedPlanId}
                onChange={(event) => handlePlanChange(event.target.value)}
              >
                {SELF_SERVE_PAID_PLANS.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {formatMoney(getPlanPrice(plan.id, currency), currency)}/mo
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedPlan.isPerSeat && (
            <div className="max-w-md mx-auto mb-8 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Team Seats</span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {selectedPlan.includedSeats} included · {formatMoney(getPerSeatPrice(selectedPlan.id, currency), currency)}/extra seat
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Remove one seat"
                    onClick={() => setSeatCount(Math.max(selectedPlan.includedSeats, seatCount - 1))}
                    disabled={seatCount <= selectedPlan.includedSeats}
                    className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 text-white font-bold text-lg flex items-center justify-center disabled:opacity-30 hover:bg-white/10 transition-colors"
                  >
                    −
                  </button>
                  <span aria-live="polite" className="text-xl font-bold text-white w-8 text-center">{seatCount}</span>
                  <button
                    type="button"
                    aria-label="Add one seat"
                    onClick={() => setSeatCount(Math.min(MAX_SELF_SERVE_SEATS, seatCount + 1))}
                    disabled={seatCount >= MAX_SELF_SERVE_SEATS}
                    className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 text-white font-bold text-lg flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
              {selectedExtraSeats && (
                <div className="text-xs text-[var(--text-secondary)] bg-black/20 rounded-lg px-3 py-2">
                  {formatMoney(getPlanPrice(selectedPlan.id, currency), currency)} base +{' '}
                  {seatCount - selectedPlan.includedSeats} extra seat{seatCount - selectedPlan.includedSeats > 1 ? 's' : ''} × {formatMoney(getPerSeatPrice(selectedPlan.id, currency), currency)} ={' '}
                  <strong className="text-white">{formatMoney(getTotalPrice(selectedPlan.id, currency, seatCount), currency)}/mo</strong>
                </div>
              )}
            </div>
          )}

          {eligibilityError ? (
            <div role="alert" className="max-w-md mx-auto rounded-xl border border-red-900/50 bg-red-900/10 p-4 text-sm text-red-200">
              <p className="font-semibold">Payment methods could not be verified.</p>
              <p className="mt-1">Please try again or contact METARDU support before choosing a payment method.</p>
              <button
                type="button"
                onClick={() => setEligibilityRetry((attempt) => attempt + 1)}
                className="mt-3 underline underline-offset-2"
              >
                Retry payment method check
              </button>
            </div>
          ) : eligibilityLoading ? (
            <p className="max-w-md mx-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
              Checking available payment methods…
            </p>
          ) : selectedMethod ? (
            <div className="max-w-md mx-auto text-center space-y-4">
              {selectedMethod.id === 'mpesa' ? (
                <>
                  <div className="p-5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-left space-y-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedMethod.label} checkout</p>
                    <p className="text-xs leading-5 text-[var(--text-secondary)]">
                      Continue to secure M-Pesa checkout. Your selected plan, currency, and seat count carry through to the STK payment.
                    </p>
                    <p className="text-xs leading-5 text-[var(--text-secondary)]">
                      M-Pesa will charge {formatMoney(selectedMethod.chargeAmount, selectedMethod.chargeCurrency)} {selectedMethod.chargeCurrency} each month.
                    </p>
                  </div>
                  <a
                    href={checkoutHref}
                    className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Continue with {selectedMethod.label} →</span>
                  </a>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-5 text-left">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedMethod.label} checkout</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Continue to secure checkout. Your selected plan, currency, and seat count carry through to the order.</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                      PayPal will charge {formatMoney(selectedMethod.chargeAmount, selectedMethod.chargeCurrency)} {selectedMethod.chargeCurrency} each month.
                    </p>
                  </div>
                  <a
                    href={checkoutHref}
                    className="w-full min-h-12 rounded-xl bg-[#f2c14e] px-4 py-3 font-semibold text-[#16130b] shadow-[0_10px_24px_rgba(242,193,78,0.18)] transition hover:bg-[#ffd56d]"
                  >
                    Continue with {selectedMethod.label} →
                  </a>
                </>
              )}
            </div>
          ) : unavailableReason ? (
            <div className="max-w-md mx-auto rounded-xl border border-amber-700/40 bg-amber-900/10 p-4 text-sm text-amber-100">
              <p>{unavailableReason.message}</p>
              {paypalExtraSeatsUnavailable ? (
                <button
                  type="button"
                  onClick={() => setSeatCount(selectedPlan.includedSeats)}
                  className="mt-3 underline underline-offset-2"
                >
                  Adjust seat count
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setEligibilityRetry((attempt) => attempt + 1)}
                  className="mt-3 underline underline-offset-2"
                >
                  Retry payment method check
                </button>
              )}
            </div>
          ) : (
            <p className="max-w-md mx-auto rounded-xl border border-amber-700/40 bg-amber-900/10 p-4 text-sm text-amber-100">
              No online payment method is currently available. Please contact METARDU support.
            </p>
          )}
        </div>
      </ModernPricingPage>
    </>
  )
}
