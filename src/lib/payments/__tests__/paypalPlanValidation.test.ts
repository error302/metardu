import { validatePayPalBillingPlan } from '../paypalPlanValidation'
import type { PayPalBillingPlanDetails } from '../paypalPlanValidation'

const activeMonthlyUsdPlan: PayPalBillingPlanDetails = {
  id: 'P-TEST',
  status: 'ACTIVE',
  billing_cycles: [{
    tenure_type: 'REGULAR',
    frequency: { interval_unit: 'MONTH', interval_count: 1 },
    pricing_scheme: { fixed_price: { value: '19.00', currency_code: 'USD' } },
  }],
}

describe('validatePayPalBillingPlan', () => {
  it('accepts an active monthly plan with the exact catalog price', () => {
    expect(validatePayPalBillingPlan(activeMonthlyUsdPlan, { amount: 19, currency: 'USD' })).toEqual({ valid: true })
  })

  it('rejects a plan that would charge a different amount', () => {
    expect(validatePayPalBillingPlan(activeMonthlyUsdPlan, { amount: 4, currency: 'USD' })).toEqual({ valid: false, error: 'price' })
  })

  it('rejects a currency mismatch instead of relying on the checkout label', () => {
    expect(validatePayPalBillingPlan(activeMonthlyUsdPlan, { amount: 19, currency: 'GBP' })).toEqual({ valid: false, error: 'currency' })
  })

  it('rejects inactive, annual and ambiguous plans', () => {
    expect(validatePayPalBillingPlan({ ...activeMonthlyUsdPlan, status: 'INACTIVE' }, { amount: 19, currency: 'USD' })).toEqual({ valid: false, error: 'inactive' })
    expect(validatePayPalBillingPlan({ ...activeMonthlyUsdPlan, billing_cycles: [{ ...activeMonthlyUsdPlan.billing_cycles![0], frequency: { interval_unit: 'YEAR', interval_count: 1 } }] }, { amount: 19, currency: 'USD' })).toEqual({ valid: false, error: 'billing_interval' })
    expect(validatePayPalBillingPlan({ ...activeMonthlyUsdPlan, billing_cycles: [] }, { amount: 19, currency: 'USD' })).toEqual({ valid: false, error: 'regular_cycle' })
  })
})
