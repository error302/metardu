export interface PaymentCurrencyTotal {
  currency: string
  total: number
}

export function normalizePaymentCurrency(value: unknown): string {
  if (typeof value !== 'string') return 'KES'
  const currency = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : 'KES'
}

/** Format in the transaction's recorded currency; never apply an implicit FX rate. */
export function formatPaymentAmount(amount: number, currencyValue: unknown): string {
  const currency = normalizePaymentCurrency(currencyValue)
  if (!Number.isFinite(amount)) return `${currency} —`

  const fractionDigits = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits

  const formatted = new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount)

  return `${currency} ${formatted}`
}
