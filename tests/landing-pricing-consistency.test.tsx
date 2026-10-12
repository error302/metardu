import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PricingSection } from '@/components/landing/PricingSection'
import { PricingCard } from '@/components/ui/animated-glassy-pricing'
import { PLAN_CATALOG } from '@/lib/subscription/catalog'

test('landing offers match monthly checkout prices and included seats', () => {
  const html = renderToStaticMarkup(<PricingSection />)
  for (const id of ['pro', 'team']) {
    const plan = PLAN_CATALOG.find(candidate => candidate.id === id)
    if (!plan) throw new Error(`Expected ${id} to exist in the plan catalogue.`)
    expect(html).toContain(`KSh ${plan.prices.KES.toLocaleString('en-KE')}`)
  }
  expect(html).not.toContain('5 team members')
  expect(html).not.toContain('Most Popular')
  // Checkout currently only supports monthly billing. Do not offer an annual
  // selection which silently turns into a monthly purchase.
  expect(html).not.toContain('2 months free')
})

test('enterprise pricing directs customers to sales without implying monthly billing', () => {
  const html = renderToStaticMarkup(
    <PricingCard
      planId="enterprise"
      planName="Enterprise"
      description="Custom deployment for larger operations"
      price="Custom"
      features={['Custom seats and support']}
      buttonText="Contact Sales"
    />,
  )

  expect(html).toContain('href="mailto:enterprise@metardu.com?subject=METARDU%20Enterprise%20Plan"')
  expect(html).toContain('Contact Sales')
  expect(html).not.toContain('/month')
})
