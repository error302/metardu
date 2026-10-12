export type PayPalBillingCurrency = 'USD' | 'EUR' | 'GBP' | 'AUD'

/** Resolve catalog currencies to the billing currency accepted by PayPal. */
export function resolvePayPalCurrency(currency: string): PayPalBillingCurrency {
  if (currency === 'EUR' || currency === 'GBP' || currency === 'AUD') return currency
  return 'USD'
}
