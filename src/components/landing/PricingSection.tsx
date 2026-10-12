'use client'

import Link from 'next/link'
import { PLAN_CATALOG } from '@/lib/subscription/catalog'

/* ────────────────────────────────────────────────────────────── */
/*  Data                                                          */
/* ────────────────────────────────────────────────────────────── */

const PRICING = [
  {
    tier: 'Free',
    description: 'For students & occasional use',
    period: '/month',
    features: ['All quick calculation tools', '1 survey project', 'Up to 50 survey points', 'Watermarked PDF report', 'CSV import'],
    cta: 'Start Free',
    href: '/register',
    highlighted: false,
  },
  {
    tier: 'Pro',
    description: 'For licensed surveyors',
    period: '/month',
    features: ['Everything in Free', 'Unlimited projects', 'Unlimited survey points', 'PDF reports for professional review', 'DXF & LandXML export', 'GPS navigation to survey points', 'Priority email support'],
    cta: 'Start Pro',
    href: '/checkout?plan=pro',
    highlighted: true,
  },
  {
    tier: 'Team',
    description: 'For surveying firms',
    period: '/month',
    features: ['Everything in Pro', `${requirePlan('team').includedSeats} included seats`, 'Shared project workspace', 'Role-based access', 'Audit trail'],
    cta: 'Start Team',
    href: '/checkout?plan=team',
    highlighted: false,
  },
]

function requirePlan(planId: string) {
  const plan = PLAN_CATALOG.find(candidate => candidate.id === planId)
  if (!plan) throw new Error(`Pricing content references an unknown plan: ${planId}`)
  return plan
}

function MPesaBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-700 text-white uppercase tracking-wider"
      title="Pay with M-Pesa"
    >
      M-Pesa
    </span>
  )
}

export function PricingSection() {

  return (
    <section aria-labelledby="pricing-heading" className="py-32 md:py-40 bg-[var(--bg-secondary)] border-t border-[var(--border-color)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
        <div className="text-center mb-10">
          <p className="text-[var(--accent)] text-sm font-semibold uppercase tracking-widest mb-4">
            Pricing
          </p>
          <h2 id="pricing-heading" className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Start free,{' '}
            <span className="text-[var(--accent)]">scale as you grow</span>
          </h2>
          <p className="max-w-xl mx-auto text-[var(--text-primary)] text-base lg:text-lg">
            Try a survey project free. Upgrade for more projects and reviewable reports and CAD exports. Available payment methods appear at checkout.
          </p>
        </div>

        <p className="text-center mb-12 text-sm text-[var(--text-secondary)]">Monthly billing in KES. Team pricing includes the seats shown; additional seats cost extra.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start max-w-5xl mx-auto">
          {PRICING.map((plan, i) => {
            const price = requirePlan(plan.tier.toLowerCase()).prices.KES
            const periodLabel = plan.period
            return (
              <div
                key={i}
                className={`relative p-8 rounded-2xl border transition-all ${
                  plan.highlighted
                    ? 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[var(--bg-primary)] shadow-[0_0_60px_-15px_rgba(209,123,71,0.2)] scale-[1.02]'
                    : 'border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[var(--accent)] text-black text-xs font-bold rounded-full uppercase tracking-wider">
                    For individual surveyors
                  </div>
                )}

                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">{plan.tier}</h3>
                <p className="text-sm text-[var(--text-primary)] mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-bold text-[var(--text-primary)]">
                    KSh {price.toLocaleString('en-KE')}
                  </span>
                  <span className="text-[var(--text-primary)] text-sm">{periodLabel}</span>
                </div>
                <div className="mb-6">
                  <MPesaBadge />
                </div>

                <ul className="space-y-3 mb-8 list-none p-0">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-3 text-sm text-[var(--text-primary)]">
                      <span className="mt-0.5 text-[var(--accent)]" aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={`block text-center py-3.5 min-h-[44px] rounded-xl font-semibold text-sm transition-all no-underline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                    plan.highlighted
                      ? 'bg-[var(--accent)] text-black hover:bg-[var(--accent-dim)]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            )
          })}
        </div>

        <p className="text-center text-xs text-[var(--text-primary)] mt-8">
          Need 20+ seats, a white-label license, or on-premise deployment?{' '}
          <a href="mailto:enterprise@metardu.com?subject=METARDU%20Firm%20and%20Enterprise%20Pricing" className="text-[var(--accent)] underline underline-offset-2 hover:no-underline">Talk to us about Firm & Enterprise tiers.</a>
        </p>
      </div>
    </section>
  )
}
