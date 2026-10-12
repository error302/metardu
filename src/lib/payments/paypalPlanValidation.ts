export interface PayPalBillingPlanDetails {
  id: string
  status: string
  billing_cycles?: Array<{
    tenure_type?: string
    frequency?: {
      interval_unit?: string
      interval_count?: number
    }
    pricing_scheme?: {
      fixed_price?: {
        value?: string
        currency_code?: string
      }
    }
  }>
}

export type PayPalPlanValidationError = 'inactive' | 'regular_cycle' | 'billing_interval' | 'currency' | 'price'

export function validatePayPalBillingPlan(
  plan: PayPalBillingPlanDetails,
  expected: { amount: number; currency: string; intervalUnit?: 'MONTH'; intervalCount?: number },
): { valid: true } | { valid: false; error: PayPalPlanValidationError } {
  if (plan.status.toUpperCase() !== 'ACTIVE') return { valid: false, error: 'inactive' }
  const regularCycles = (plan.billing_cycles ?? []).filter(cycle => cycle.tenure_type?.toUpperCase() === 'REGULAR')
  if (regularCycles.length !== 1) return { valid: false, error: 'regular_cycle' }

  const regularCycle = regularCycles[0]
  if (
    regularCycle.frequency?.interval_unit?.toUpperCase() !== (expected.intervalUnit ?? 'MONTH')
    || regularCycle.frequency?.interval_count !== (expected.intervalCount ?? 1)
  ) return { valid: false, error: 'billing_interval' }

  const fixedPrice = regularCycle.pricing_scheme?.fixed_price
  if (!fixedPrice?.value || !fixedPrice.currency_code) return { valid: false, error: 'price' }
  if (fixedPrice.currency_code.toUpperCase() !== expected.currency.toUpperCase()) {
    return { valid: false, error: 'currency' }
  }

  const actualAmount = Number(fixedPrice.value)
  if (!Number.isFinite(actualAmount) || !Number.isFinite(expected.amount)) return { valid: false, error: 'price' }
  let digits = 2
  try {
    digits = new Intl.NumberFormat('en-US', { style: 'currency', currency: expected.currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return { valid: false, error: 'currency' }
  }
  const scale = 10 ** digits
  if (Math.round(actualAmount * scale) !== Math.round(expected.amount * scale)) {
    return { valid: false, error: 'price' }
  }
  return { valid: true }
}
