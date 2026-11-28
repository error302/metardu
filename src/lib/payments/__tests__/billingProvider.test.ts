import { resolveBillingMutationProvider } from '../billingProvider'

describe('billing mutation provider resolution', () => {
  it('accepts only an exact supported provider', () => {
    expect(resolveBillingMutationProvider('mpesa')).toBe('mpesa')
    expect(resolveBillingMutationProvider('paypal')).toBe('paypal')
  })

  it.each(['', 'PAYPAL', ' card ', 'stripe'])(
    'fails closed for an unsupported provider value',
    (provider) => {
      expect(resolveBillingMutationProvider(provider)).toBeNull()
    },
  )
})
