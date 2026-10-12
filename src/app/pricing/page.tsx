'use client';
import { useState, useEffect } from 'react'
import { ModernPricingPage, PricingCardProps } from '@/components/ui/animated-glassy-pricing'
import { PLAN_CATALOG, getPlanPrice, getTotalPrice, getPerSeatPrice, type CurrencyCode } from '@/lib/subscription/catalog'
import { MpesaCheckoutModal } from '@/components/pricing/MpesaCheckoutModal'
import { getMpesaTillNumber } from '@/lib/payments/mpesaConfig'
import { Smartphone, CreditCard } from 'lucide-react'

const currencyMap: Record<string, CurrencyCode> = {
  'KE': 'KES', 'UG': 'UGX', 'TZ': 'TZS', 'NG': 'NGN',
  'GH': 'GHS', 'ZA': 'ZAR', 'IN': 'INR', 'ID': 'IDR',
  'BR': 'BRL', 'AU': 'AUD', 'GB': 'GBP', 'FR': 'EUR',
  'DE': 'EUR', 'US': 'USD', 'ET': 'KES', 'RW': 'KES',
  'SD': 'KES', 'MA': 'EUR', 'EG': 'USD'
}

const formatPrice = (price: number, currency: CurrencyCode) => {
  const symbols: Record<string, string> = {
    KES: 'KSh ', UGX: 'USh ', TZS: 'TSh ', NGN: '₦ ', USD: '$ ',
    GHS: '₵ ', ZAR: 'R ', INR: '₹ ', IDR: 'Rp ', BRL: 'R$ ', AUD: 'A$ ', GBP: '£ ', EUR: '€ '
  }
  return `${symbols[currency] || ''}${price.toLocaleString()}`
}

export default function PricingPage() {
  const [currency, setCurrency] = useState<CurrencyCode>('KES')

  useEffect(() => { document.title = 'Pricing — METARDU' }, [])

  useEffect(() => {
    async function detectCurrency() {
      try {
        const cached = localStorage.getItem('metardu:currency')
        if (cached) {
          const { code, ts } = JSON.parse(cached) as { code: CurrencyCode; ts: number }
          if (Date.now() - ts < 86400000) { setCurrency(code); return }
        }
      } catch { /* ignore */ }
      try {
        const res = await fetch('https://ipapi.co/json/')
        const data = (await res.json()) as { country_code?: string }
        if (data.country_code && currencyMap[data.country_code]) {
          const code = currencyMap[data.country_code]
          setCurrency(code)
          try { localStorage.setItem('metardu:currency', JSON.stringify({ code, ts: Date.now() })) } catch { /* ignore */ }
        }
      } catch {
        // Use default KES
      }
    }
    detectCurrency()
  }, [])

  const [selectedPlanId, setSelectedPlanId] = useState<string>('pro')
  const [seatCount, setSeatCount] = useState<number>(3) // default for Team plan

  const [mpesaModalOpen, setMpesaModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'mpesa' | 'paypal'>('mpesa')

  // Show Free, Pro, Team, Firm, Enterprise on pricing page
  const visiblePlans = PLAN_CATALOG

  const selectedPlan = PLAN_CATALOG.find(p => p.id === selectedPlanId) || PLAN_CATALOG[1]
  const totalAmountKes = getTotalPrice(selectedPlan.id as any, 'KES', seatCount)

  // When switching plans, reset seat count to the plan's included seats
  const handlePlanChange = (newPlanId: string) => {
    setSelectedPlanId(newPlanId)
    const plan = PLAN_CATALOG.find(p => p.id === newPlanId)
    if (plan) {
      setSeatCount(Math.max(plan.includedSeats, 1))
    }
  }

  const plans: PricingCardProps[] = visiblePlans.map(plan => {
    const isEnterprise = plan.contactSales
    const perSeat = getPerSeatPrice(plan.id, currency)
    const basePrice = getPlanPrice(plan.id, currency)

    // Build price label
    let priceLabel: string
    if (isEnterprise) {
      priceLabel = 'Custom'
    } else if (plan.isPerSeat) {
      priceLabel = `${formatPrice(basePrice, currency)} + ${formatPrice(perSeat, currency)}/seat`
    } else {
      priceLabel = formatPrice(basePrice, currency)
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
      features: plan.features,
      buttonText: isEnterprise
        ? 'Contact Sales'
        : plan.id === 'free'
          ? 'Get Started Free'
          : 'Start Free Trial',
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
        subtitle="Start free, upgrade when you need more. Two trusted payment options: M-Pesa Buy Goods Till & PayPal."
        plans={plans}
      >
        {/* Payment Methods Section */}
        <div className="w-full max-w-4xl mx-auto mt-16 mb-12 p-8 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3 border border-emerald-500/20">
              ⚡ Instant Activation
            </div>
            <h3 className="text-2xl font-bold text-[var(--text-primary)]">Choose Your Payment Method</h3>
            <p className="text-[var(--text-secondary)] text-sm mt-1">
              Pay securely via Lipa na M-Pesa Till (Kenya) or PayPal / Card (Global).
            </p>

            {/* Payment Method Switcher Tabs */}
            <div className="flex justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => setActiveTab('mpesa')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  activeTab === 'mpesa'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg'
                    : 'bg-black/20 text-[var(--text-muted)] border border-[var(--border-color)] hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>M-Pesa Buy Goods (Till {getMpesaTillNumber()})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('paypal')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  activeTab === 'paypal'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-lg'
                    : 'bg-black/20 text-[var(--text-muted)] border border-[var(--border-color)] hover:text-white'
                }`}
              >
                <CreditCard className="w-4 h-4 text-blue-400" />
                <span>PayPal / International Card</span>
              </button>
            </div>
          </div>

          {/* Plan Selector */}
          <div className="max-w-md mx-auto mb-4 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--text-muted)] block">Selected Plan:</span>
              <span className="text-base font-bold text-white">{selectedPlan.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[var(--accent)]"
                value={selectedPlanId}
                onChange={(e) => handlePlanChange(e.target.value)}
              >
                {visiblePlans.filter(p => p.id !== 'free' && !p.contactSales).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatPrice(getPlanPrice(p.id, currency), currency)}/mo
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Seat Quantity Selector — only for per-seat plans */}
          {selectedPlan.isPerSeat && (
            <div className="max-w-md mx-auto mb-8 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Team Seats</span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {selectedPlan.includedSeats} included · {formatPrice(getPerSeatPrice(selectedPlan.id, currency), currency)}/extra seat
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSeatCount(Math.max(selectedPlan.includedSeats, seatCount - 1))}
                    disabled={seatCount <= selectedPlan.includedSeats}
                    className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 text-white font-bold text-lg flex items-center justify-center disabled:opacity-30 hover:bg-white/10 transition-colors"
                  >
                    −
                  </button>
                  <span className="text-xl font-bold text-white w-8 text-center">{seatCount}</span>
                  <button
                    type="button"
                    onClick={() => setSeatCount(seatCount + 1)}
                    className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 text-white font-bold text-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
              {seatCount > selectedPlan.includedSeats && (
                <div className="text-xs text-[var(--text-secondary)] bg-black/20 rounded-lg px-3 py-2">
                  {formatPrice(getPlanPrice(selectedPlan.id, currency), currency)} base +{' '}
                  {seatCount - selectedPlan.includedSeats} extra seat{seatCount - selectedPlan.includedSeats > 1 ? 's' : ''} × {formatPrice(getPerSeatPrice(selectedPlan.id, currency), currency)} ={' '}
                  <strong className="text-white">{formatPrice(getTotalPrice(selectedPlan.id, currency, seatCount), currency)}/mo</strong>
                </div>
              )}
            </div>
          )}

          {/* Tab 1: M-Pesa Buy Goods Till */}
          {activeTab === 'mpesa' && (
            <div className="max-w-md mx-auto text-center space-y-4">
              <div className="p-5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-left space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-emerald-400">TILL NUMBER:</span>
                  <span className="text-xs font-bold text-[var(--accent)]">{getMpesaTillNumber()}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Pay directly from your Safaricom M-Pesa line using Buy Goods Till <strong className="text-emerald-400 font-mono">{getMpesaTillNumber()}</strong> and get instant access + email receipt.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMpesaModalOpen(true)}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Smartphone className="w-4 h-4" />
                <span>Pay KSh {totalAmountKes.toLocaleString()} via M-Pesa Till →</span>
              </button>
            </div>
          )}

          {/* Tab 2: PayPal Checkout */}
          {activeTab === 'paypal' && (
            <div className="max-w-md mx-auto text-center space-y-4">
              <div className="rounded-xl border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-5 text-left">
                <p className="text-sm font-semibold text-[var(--text-primary)]">PayPal checkout</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Continue to the secure METARDU checkout to approve PayPal or an international card. Your plan and currency stay attached to the order.</p>
              </div>
              <button
                type="button"
                onClick={() => { window.location.href = `/checkout?plan=${encodeURIComponent(selectedPlanId)}&method=paypal` }}
                className="w-full min-h-12 rounded-xl bg-[#f2c14e] px-4 py-3 font-semibold text-[#16130b] shadow-[0_10px_24px_rgba(242,193,78,0.18)] transition hover:bg-[#ffd56d]"
              >
                Continue with PayPal →
              </button>
              <p className="text-xs text-[var(--text-muted)]">Supports PayPal balances and cards where PayPal is available.</p>
            </div>
          )}
        </div>
      </ModernPricingPage>

      {/* M-Pesa Checkout Modal */}
      <MpesaCheckoutModal
        isOpen={mpesaModalOpen}
        onClose={() => setMpesaModalOpen(false)}
        planId={selectedPlanId as any}
        planName={selectedPlan.name}
        amountKes={totalAmountKes}
      />
    </>
  )
}
