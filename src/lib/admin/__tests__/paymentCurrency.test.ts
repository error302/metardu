import { formatPaymentAmount, normalizePaymentCurrency } from '../paymentCurrency'

describe('admin payment currency presentation', () => {
  it('keeps KES and USD amounts in their recorded currencies with appropriate precision', () => {
    expect(formatPaymentAmount(1_250, 'KES')).toBe('KES 1,250.00')
    expect(formatPaymentAmount(35, 'USD')).toBe('USD 35.00')
  })

  it('normalizes valid ISO codes and falls back safely for missing or malformed values', () => {
    expect(normalizePaymentCurrency(' usd ')).toBe('USD')
    expect(formatPaymentAmount(35, 'usd')).toBe('USD 35.00')
    expect(formatPaymentAmount(35, 'bad currency')).toBe('KES 35.00')
    expect(formatPaymentAmount(Number.NaN, 'USD')).toBe('USD —')
  })
})
