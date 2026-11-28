import { getTotalPrice, type CurrencyCode, type PlanId } from '@/lib/subscription/catalog'
import { resolveSeatSelection } from '@/lib/subscription/seatSelection'
import { resolvePayPalCurrency, type PayPalBillingCurrency } from '@/lib/payments/paypalCurrency'

export type PaymentMethodId = 'mpesa' | 'paypal'
export type PaymentProvider = 'mpesa' | 'paypal'

export const PAYMENT_UNAVAILABLE_REASON_CODES = [
  'PAYPAL_EXTRA_SEATS_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE',
  'PLAN_UNAVAILABLE',
  'INVALID_QUOTE',
] as const

export type PaymentUnavailableReasonCode =
  typeof PAYMENT_UNAVAILABLE_REASON_CODES[number]

export interface PaymentUnavailableReason {
  code: PaymentUnavailableReasonCode
  message: string
}

const PAYMENT_UNAVAILABLE_MESSAGES: Record<PaymentUnavailableReasonCode, string> = {
  PAYPAL_EXTRA_SEATS_UNAVAILABLE:
    'PayPal supports included seats only. Reduce the seat count to the included seats or contact METARDU support for additional seats.',
  PROVIDER_UNAVAILABLE:
    'No online payment method is currently available. Please try again later or contact METARDU support.',
  PLAN_UNAVAILABLE:
    'This plan is not currently available for online payment. Please choose another plan or contact METARDU support.',
  INVALID_QUOTE:
    'A valid payment quote is not currently available. Please try again later or contact METARDU support.',
}

export function createPaymentUnavailableReason(
  code: PaymentUnavailableReasonCode,
): PaymentUnavailableReason {
  return { code, message: PAYMENT_UNAVAILABLE_MESSAGES[code] }
}

export interface ConfiguredPaymentMethods {
  mpesa: boolean
  paypal: boolean
}

export interface EligiblePaymentMethod {
  id: PaymentMethodId
  provider: PaymentProvider
  chargeCurrency: CurrencyCode
}

export interface QuotedPaymentMethod extends EligiblePaymentMethod {
  label: string
  chargeAmount: number
}

export interface PaymentMethodQuoteInput {
  methods: EligiblePaymentMethod[]
  planId: PlanId
  totalSeats: number
}

export interface PaymentEligibilityContext {
  countryCode: string
  currency: CurrencyCode
  configured: ConfiguredPaymentMethods
}

export type PaymentEligibility =
  | {
      ok: true
      market: 'kenya' | 'international'
      currency: CurrencyCode
      methods: EligiblePaymentMethod[]
    }
  | {
      ok: false
      code: 'COUNTRY_REQUIRED' | 'COUNTRY_CURRENCY_MISMATCH'
      message: string
    }

const COUNTRY_CODES: Record<string, string> = {
  Kenya: 'KE',
  Uganda: 'UG',
  Tanzania: 'TZ',
  Nigeria: 'NG',
  Ghana: 'GH',
  'South Africa': 'ZA',
  Germany: 'DE',
  France: 'FR',
  UK: 'GB',
  US: 'US',
  India: 'IN',
  Indonesia: 'ID',
  Brazil: 'BR',
  Australia: 'AU',
  Ethiopia: 'ET',
  Rwanda: 'RW',
  'South Sudan': 'SD',
  Morocco: 'MA',
  Egypt: 'EG',
}

/** Normalize an ISO alpha-2 country code or a supported display-country name. */
export function normalizeCountryCode(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const direct = trimmed.toUpperCase()
  if (/^[A-Z]{2}$/.test(direct)) return direct

  return COUNTRY_CODES[trimmed] ?? null
}

/**
 * Resolve the server-owned payment policy for a market.
 *
 * Kenya/KES uses M-PESA. International markets use PayPal, whose recurring
 * plan currency is resolved independently from the catalog display currency.
 */
export function resolvePaymentEligibility(
  context: PaymentEligibilityContext
): PaymentEligibility {
  const countryCode = normalizeCountryCode(context.countryCode)
  if (!countryCode) {
    return {
      ok: false,
      code: 'COUNTRY_REQUIRED',
      message: 'A valid country is required before starting payment.',
    }
  }

  if (countryCode === 'KE' && context.currency !== 'KES') {
    return {
      ok: false,
      code: 'COUNTRY_CURRENCY_MISMATCH',
      message: 'Kenya checkout must be priced in KES.',
    }
  }

  const methods: EligiblePaymentMethod[] = []
  if (countryCode === 'KE') {
    if (context.configured.mpesa) {
      methods.push({ id: 'mpesa', provider: 'mpesa', chargeCurrency: 'KES' })
    }
  } else if (context.configured.paypal) {
    methods.push({
      id: 'paypal',
      provider: 'paypal',
      chargeCurrency: resolvePayPalCurrency(context.currency),
    })
  }

  return {
    ok: true,
    market: countryCode === 'KE' ? 'kenya' : 'international',
    currency: context.currency,
    methods,
  }
}

export type PaymentQuoteResult =
  | { ok: true; methods: QuotedPaymentMethod[] }
  | { ok: false; reason: PaymentUnavailableReason }

/**
 * Attach the server-owned recurring-plan price to eligible payment methods.
 *
 * The PayPal amount is the price of the configured PayPal currency plan. It is
 * not an FX conversion of the customer's display currency. PayPal recurring
 * plans cover the included seats only, so a quote that would require an
 * additional PayPal seat charge fails closed with a server-owned reason.
 */
export function quoteEligiblePaymentMethodsWithReason(
  input: PaymentMethodQuoteInput,
): PaymentQuoteResult {
  const seatSelection = resolveSeatSelection(input.planId, input.totalSeats)
  if (!seatSelection.ok) {
    return {
      ok: false,
      reason: createPaymentUnavailableReason('INVALID_QUOTE'),
    }
  }

  const quotes: QuotedPaymentMethod[] = []
  for (const method of input.methods) {
    if (method.id !== method.provider) {
      return {
        ok: false,
        reason: createPaymentUnavailableReason('INVALID_QUOTE'),
      }
    }

    if (method.provider === 'mpesa') {
      if (method.chargeCurrency !== 'KES') {
        return {
          ok: false,
          reason: createPaymentUnavailableReason('INVALID_QUOTE'),
        }
      }
      const chargeAmount = getTotalPrice(input.planId, 'KES', seatSelection.totalSeats)
      if (!Number.isSafeInteger(chargeAmount) || chargeAmount <= 0) {
        return {
          ok: false,
          reason: createPaymentUnavailableReason('INVALID_QUOTE'),
        }
      }
      quotes.push({
        ...method,
        label: 'M-Pesa',
        chargeAmount,
      })
      continue
    }

    if (method.provider === 'paypal') {
      if (seatSelection.extraSeats > 0) {
        return {
          ok: false,
          reason: createPaymentUnavailableReason('PAYPAL_EXTRA_SEATS_UNAVAILABLE'),
        }
      }
      if (!PAYPAL_BILLING_CURRENCIES.includes(method.chargeCurrency as PayPalBillingCurrency)) {
        return {
          ok: false,
          reason: createPaymentUnavailableReason('INVALID_QUOTE'),
        }
      }
      const chargeAmount = getTotalPrice(
        input.planId,
        method.chargeCurrency,
        seatSelection.totalSeats,
      )
      if (!Number.isSafeInteger(chargeAmount) || chargeAmount <= 0) {
        return {
          ok: false,
          reason: createPaymentUnavailableReason('INVALID_QUOTE'),
        }
      }
      quotes.push({
        ...method,
        label: 'PayPal',
        chargeAmount,
      })
      continue
    }

    return {
      ok: false,
      reason: createPaymentUnavailableReason('INVALID_QUOTE'),
    }
  }

  return { ok: true, methods: quotes }
}

/** Quote eligible methods while preserving the legacy array-only helper shape. */
export function quoteEligiblePaymentMethods(
  input: PaymentMethodQuoteInput,
): QuotedPaymentMethod[] {
  const result = quoteEligiblePaymentMethodsWithReason(input)
  return result.ok ? result.methods : []
}

const PAYPAL_BILLING_CURRENCIES: PayPalBillingCurrency[] = ['USD', 'EUR', 'GBP', 'AUD']
