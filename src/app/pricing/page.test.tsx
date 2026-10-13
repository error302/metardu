import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PricingPage from './page'

jest.mock('@/components/pricing/MpesaCheckoutModal', () => ({
  MpesaCheckoutModal: () => null,
}))

jest.mock('@/components/ui/grid-feature-cards', () => ({
  FeatureCard: () => null,
}))

describe('pricing plan seat prices', () => {
  const originalFetch = global.fetch
  const originalLanguage = window.navigator.language

  beforeEach(() => {
    localStorage.removeItem('metardu:currency')
    Object.defineProperty(window.navigator, 'language', { value: 'en-KE', configurable: true })
    global.fetch = jest.fn().mockRejectedValue(new Error('Use the default test currency')) as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    localStorage.removeItem('metardu:currency')
    Object.defineProperty(window.navigator, 'language', { value: originalLanguage, configurable: true })
  })

  it('separates included seats from the extra-seat rate on Team and Firm cards', () => {
    render(<PricingPage />)

    expect(screen.getByText('Includes 3 seats · KSh 1,500 per additional seat/month')).toBeInTheDocument()
    expect(screen.getByText('Includes 5 seats · KSh 2,500 per additional seat/month')).toBeInTheDocument()
    expect(screen.queryByText(/KSh 4,500 \+ KSh 1,500\/seat/)).not.toBeInTheDocument()
    expect(screen.queryByText(/KSh 9,000 \+ KSh 2,500\/seat/)).not.toBeInTheDocument()
  })

  it('exposes a selected state and a checkout action in the PayPal payment tab', () => {
    render(<PricingPage />)

    const paypalTab = screen.getByRole('button', { name: 'PayPal / International Card' })
    fireEvent.click(paypalTab)

    expect(paypalTab).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('PayPal checkout')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with PayPal →' })).toBeInTheDocument()
    expect(screen.getByText(/selected plan, currency, and seat count carry through/)).toBeInTheDocument()
  })

  it('uses the browser locale for display currency without sending an IP lookup', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-GB', configurable: true })
    const fetchMock = global.fetch as jest.Mock
    render(<PricingPage />)

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Pricing currency' })).toHaveValue('GBP'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
