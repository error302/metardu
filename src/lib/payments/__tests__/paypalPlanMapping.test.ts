import { getPayPalPlanId, resolvePayPalCurrency } from '../paypal'

const envNames = [
  'PAYPAL_PLAN_PRO',
  'PAYPAL_PLAN_PRO_USD',
  'PAYPAL_PLAN_PRO_EUR',
  'PAYPAL_PLAN_PRO_GBP',
  'PAYPAL_PLAN_PRO_AUD',
]
const originalValues = new Map(envNames.map((name) => [name, process.env[name]]))

beforeEach(() => {
  envNames.forEach((name) => { delete process.env[name] })
})

afterAll(() => {
  envNames.forEach((name) => {
    const original = originalValues.get(name)
    if (original === undefined) delete process.env[name]
    else process.env[name] = original
  })
})

test.each([
  ['USD', 'USD'],
  ['EUR', 'EUR'],
  ['GBP', 'GBP'],
  ['AUD', 'AUD'],
  ['KES', 'USD'],
  ['ZAR', 'USD'],
  ['UGX', 'USD'],
])('resolves %s to PayPal %s pricing', (input, expected) => {
  expect(resolvePayPalCurrency(input)).toBe(expected)
})

test('uses the matching currency plan before the legacy USD plan', () => {
  process.env.PAYPAL_PLAN_PRO = 'legacy-usd'
  process.env.PAYPAL_PLAN_PRO_USD = 'catalog-usd'
  process.env.PAYPAL_PLAN_PRO_EUR = 'catalog-eur'

  expect(getPayPalPlanId('pro', 'USD')).toBe('catalog-usd')
  expect(getPayPalPlanId('pro', 'EUR')).toBe('catalog-eur')
})

test('allows a legacy plan only as a USD fallback', () => {
  process.env.PAYPAL_PLAN_PRO = 'legacy-usd'

  expect(getPayPalPlanId('pro', 'USD')).toBe('legacy-usd')
  expect(getPayPalPlanId('pro', 'GBP')).toBeNull()
})
