import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing — METARDU',
  description: 'Simple pricing for surveyors. Free plan with 1 project, Pro with unlimited projects and custom logo, Enterprise for teams. M-Pesa, card, and PayPal accepted.',
  alternates: { canonical: '/pricing' },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
