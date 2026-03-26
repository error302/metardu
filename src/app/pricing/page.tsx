'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ModernPricingPage, PricingCardProps } from '@/components/ui/animated-glassy-pricing'

type Currency = 'KES' | 'UGX' | 'TZS' | 'NGN' | 'USD' | 'GHS' | 'ZAR' | 'INR' | 'IDR' | 'BRL' | 'AUD' | 'GBP' | 'EUR'

const currencyMap: Record<string, Currency> = {
  'KE': 'KES', 'UG': 'UGX', 'TZ': 'TZS', 'NG': 'NGN',
  'GH': 'GHS', 'ZA': 'ZAR', 'IN': 'INR', 'ID': 'IDR',
  'BR': 'BRL', 'AU': 'AUD', 'GB': 'GBP', 'FR': 'EUR',
  'DE': 'EUR', 'US': 'USD', 'ET': 'KES', 'RW': 'KES',
  'SD': 'KES', 'MA': 'EUR', 'EG': 'USD'
}

const formatPrice = (price: number, currency: Currency) => {
  const symbols: Record<Currency, string> = {
    KES: 'KSh ', UGX: 'USh ', TZS: 'TSh ', NGN: '₦ ', USD: '$ ',
    GHS: '₵ ', ZAR: 'R ', INR: '₹ ', IDR: 'Rp ', BRL: 'R$ ', AUD: 'A$ ', GBP: '£ ', EUR: '€ '
  }
  return `${symbols[currency]}${price.toLocaleString()}`
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
  const [currency, setCurrency] = useState<Currency>('KES')

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

  const plans: PricingCardProps[] = [
    {
      planName: 'Free',
      description: 'Perfect for students and hobbyist surveyors',
      price: formatPrice(0, currency),
      features: [
        'All 18 quick calculation tools',
        '1 survey project',
        'Up to 50 survey points',
        'Basic PDF report',
        'CSV import',
        'Offline calculations',
      ],
      buttonText: 'Get Started Free',
      buttonVariant: 'secondary',
      isPopular: false,
    },
    {
      planName: 'Pro',
      description: 'For professional surveyors and small firms',
      price: formatPrice(currency === 'KES' ? 500 : currency === 'USD' ? 4 : currency === 'EUR' ? 4 : 15, currency),
      features: [
        'Everything in Free',
        'Unlimited projects',
        'Unlimited survey points',
        'Full professional PDF reports',
        'DXF & LandXML export',
        'GPS Stakeout mode',
        'Process field notes',
        'Priority support',
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
      ],
      buttonText: 'Start Free Trial',
      buttonVariant: 'primary',
      isPopular: true,
    },
    {
      planName: 'Team',
      description: 'Collaborate with your survey crew',
      price: formatPrice(currency === 'KES' ? 2000 : currency === 'USD' ? 15 : currency === 'EUR' ? 14 : 60, currency),
      features: [
        'Everything in Pro',
        '5 team members',
        'Real-time collaboration',
        'Role-based access',
        'Version history',
        'Audit trail',
        'Branded reports',
        'Dedicated support',
      ],
      buttonText: 'Contact Us',
      buttonVariant: 'primary',
      isPopular: false,
    },
  ]

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
