import { render, screen } from '@testing-library/react'
import PricingPage from './page'

jest.mock('@/components/pricing/MpesaCheckoutModal', () => ({
  MpesaCheckoutModal: () => null,
}))

jest.mock('@/components/ui/grid-feature-cards', () => ({
  FeatureCard: () => null,
}))

describe('pricing plan seat prices', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    localStorage.removeItem('metardu:currency')
    global.fetch = jest.fn().mockRejectedValue(new Error('Use the default test currency')) as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    localStorage.removeItem('metardu:currency')
  })

  it('separates included seats from the extra-seat rate on Team and Firm cards', () => {
    render(<PricingPage />)

    expect(screen.getByText('Includes 3 seats · KSh 1,500 per additional seat/month')).toBeInTheDocument()
    expect(screen.getByText('Includes 5 seats · KSh 2,500 per additional seat/month')).toBeInTheDocument()
    expect(screen.queryByText(/KSh 4,500 \+ KSh 1,500\/seat/)).not.toBeInTheDocument()
    expect(screen.queryByText(/KSh 9,000 \+ KSh 2,500\/seat/)).not.toBeInTheDocument()
  })
})
