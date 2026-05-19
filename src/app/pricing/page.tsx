'use client';
import { useState, useEffect } from 'react'
import { ModernPricingPage, PricingCardProps } from '@/components/ui/animated-glassy-pricing'
import { PLAN_CATALOG, getPlanPrice, SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/subscription/catalog'

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

const faqs = [
  {
    q: 'Can I change plans anytime?',
    a: 'Yes. Upgrade or downgrade at any time. Changes take effect immediately.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'M-Pesa (Kenya), Visa/Mastercard (Stripe), and PayPal for global payments.',
  },
  {
    q: 'Is there a free trial?',
    a: 'All paid plans include a 14-day free trial. No credit card required.',
  },
  {
    q: 'Do you offer student discounts?',
    a: 'Yes. Contact us with your student ID for 50% off any plan.',
  },
]

export default function PricingPage() {
  const [currency, setCurrency] = useState<CurrencyCode>('KES')

  useEffect(() => { document.title = 'Pricing — METARDU' }, [])

  useEffect(() => {
    async function detectCurrency() {
      try {
        const res = await fetch('https://ipapi.co/json/')
        const data = await res.json()
        if (data.country_code && currencyMap[data.country_code]) {
          setCurrency(currencyMap[data.country_code])
        }
      } catch {
        // Use default
      }
    }
    detectCurrency()
  }, [])

  // Show Free, Pro, and Team plans on pricing page (single source of truth from PLAN_CATALOG)
  const visiblePlans = PLAN_CATALOG.filter(p => ['free', 'pro', 'team'].includes(p.id))

  const plans: PricingCardProps[] = visiblePlans.map(plan => ({
    planId: plan.id,
    planName: plan.name,
    description: plan.id === 'free'
      ? 'Perfect for students and hobbyist surveyors'
      : plan.id === 'pro'
        ? 'For professional surveyors and small firms'
        : 'Collaborate with your survey crew',
    price: formatPrice(getPlanPrice(plan.id, currency), currency),
    features: plan.id === 'pro' ? [
      ...plan.features,
      'AI-Powered Features:',
      '  • FieldGuard AI - Smart data cleaning',
      '  • CadastraAI - Land title validation',
      '  • MineTwin 3D - Underground mapping',
      '  • HydroLive - Real-time tide correction',
      '  • SurveyGPT - AI field assistant',
      '  • AutoContour - Instant contours',
      '  • LegalCheck - Compliance analysis',
      '  • CostAI - Instant BOQ estimation',
      'Develop Full Plan (AI-generated)',
    ] : plan.features,
    buttonText: plan.id === 'free'
      ? 'Get Started Free'
      : plan.id === 'team'
        ? 'Start Free Trial'
        : 'Start Free Trial',
    buttonVariant: plan.id === 'free' ? 'secondary' as const : 'primary' as const,
    isPopular: plan.id === 'pro',
  }))

  return (
    <ModernPricingPage
      title={
        <>
          Simple, <span className="text-cyan-400">Transparent</span> Pricing
        </>
      }
      subtitle="Start free, upgrade when you need more. No hidden fees, cancel anytime."
      plans={plans}
      showAnimatedBackground={true}
    />
  )
}
