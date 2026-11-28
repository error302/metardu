import {
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
  type PlanId,
} from '@/lib/subscription/catalog'
import { resolveSeatSelection } from '@/lib/subscription/seatSelection'
import {
  PAYMENT_UNAVAILABLE_REASON_CODES,
  type PaymentUnavailableReason,
  type PaymentUnavailableReasonCode,
} from '@/lib/payments/eligibility'

export type RegionalPaymentProvider = 'mpesa' | 'paypal'
export type RegionalPaymentMarket = 'kenya' | 'international'

export interface CountryDisplayOption {
  code: string
  name: string
  currency: CurrencyCode
}

export interface RegionalPaymentMethod {
  id: RegionalPaymentProvider
  provider: RegionalPaymentProvider
  label: string
  chargeCurrency: CurrencyCode
  chargeAmount: number
}

export interface RegionalPaymentEligibilityRequest {
  countryCode: string
  currency: CurrencyCode
  planId: PlanId
  seatCount: number
}

export interface RegionalPaymentEligibility {
  market: RegionalPaymentMarket
  currency: CurrencyCode
  methods: RegionalPaymentMethod[]
  reason?: PaymentUnavailableReason
}

/**
 * Shared display metadata for checkout and pricing. This metadata selects the
 * display currency for an explicitly chosen country; it never determines
 * payment eligibility.
 */
export const COUNTRY_OPTIONS: readonly CountryDisplayOption[] = [
  { code: 'KE', name: 'Kenya', currency: 'KES' },
  { code: 'UG', name: 'Uganda', currency: 'UGX' },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN' },
  { code: 'GH', name: 'Ghana', currency: 'GHS' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'MA', name: 'Morocco', currency: 'EUR' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'EG', name: 'Egypt', currency: 'USD' },
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR' },
  { code: 'BR', name: 'Brazil', currency: 'BRL' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'ET', name: 'Ethiopia', currency: 'KES' },
  { code: 'RW', name: 'Rwanda', currency: 'KES' },
  { code: 'SD', name: 'South Sudan', currency: 'KES' },
]

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  KES: 'KSh ',
  UGX: 'USh ',
  TZS: 'TSh ',
  NGN: '₦ ',
  GHS: 'GH₵ ',
  ZAR: 'R ',
  USD: '$',
  EUR: '€ ',
  GBP: '£ ',
  INR: '₹ ',
  IDR: 'Rp ',
  BRL: 'R$ ',
  AUD: 'A$ ',
}

const PAYPAL_CHARGE_CURRENCIES: readonly CurrencyCode[] = ['USD', 'EUR', 'GBP', 'AUD']
const PLAN_IDS: readonly PlanId[] = ['free', 'pro', 'team', 'firm', 'enterprise']

export function getCountryOption(countryCode: string): CountryDisplayOption | undefined {
  return COUNTRY_OPTIONS.find((option) => option.code === countryCode.toUpperCase())
}

export const APPLICATION_LOCALE = 'en-US'

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const formattedAmount = new Intl.NumberFormat(APPLICATION_LOCALE).format(amount)
  return `${CURRENCY_SYMBOLS[currency] ?? `${currency} `}${formattedAmount}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && SUPPORTED_CURRENCIES.includes(value as CurrencyCode)
}

function isPaymentProvider(value: unknown): value is RegionalPaymentProvider {
  return value === 'mpesa' || value === 'paypal'
}

function isPaymentUnavailableReasonCode(
  value: unknown,
): value is PaymentUnavailableReasonCode {
  return typeof value === 'string'
    && PAYMENT_UNAVAILABLE_REASON_CODES.includes(value as PaymentUnavailableReasonCode)
}

export type PaymentEligibilityFailureReason =
  | 'invalid-request'
  | 'unavailable'
  | 'invalid-response'

export type PaymentEligibilityInspection =
  | { ok: true; eligibility: RegionalPaymentEligibility }
  | { ok: false; reason: PaymentEligibilityFailureReason }

/**
 * Inspect the complete server eligibility response atomically. A malformed
 * method invalidates the entire response; no member is silently skipped.
 */
export function inspectPaymentEligibility(
  payload: unknown,
  request: RegionalPaymentEligibilityRequest,
): PaymentEligibilityInspection {
  if (!/^[A-Z]{2}$/.test(request.countryCode)) return { ok: false, reason: 'invalid-request' }
  if (!isCurrencyCode(request.currency)) return { ok: false, reason: 'invalid-request' }
  if (!PLAN_IDS.includes(request.planId)) return { ok: false, reason: 'invalid-request' }
  if (!resolveSeatSelection(request.planId, request.seatCount).ok) {
    return { ok: false, reason: 'invalid-request' }
  }
  if (request.countryCode === 'KE' && request.currency !== 'KES') {
    return { ok: false, reason: 'invalid-request' }
  }
  if (!isRecord(payload)) return { ok: false, reason: 'invalid-response' }

  const eligibility = payload.eligibility
  if (!isRecord(eligibility)) return { ok: false, reason: 'invalid-response' }
  if (eligibility.ok !== true) return { ok: false, reason: 'unavailable' }

  const expectedMarket: RegionalPaymentMarket = request.countryCode === 'KE'
    ? 'kenya'
    : 'international'
  if (eligibility.market !== expectedMarket) return { ok: false, reason: 'invalid-response' }
  if (!isCurrencyCode(eligibility.currency) || eligibility.currency !== request.currency) {
    return { ok: false, reason: 'invalid-response' }
  }

  const rawMethods = eligibility.methods
  if (!Array.isArray(rawMethods)) return { ok: false, reason: 'invalid-response' }
  const hasReason = Object.prototype.hasOwnProperty.call(eligibility, 'reason')

  if (rawMethods.length === 0) {
    if (!hasReason) return { ok: false, reason: 'invalid-response' }
    const rawReason = eligibility.reason
    if (!isRecord(rawReason)) return { ok: false, reason: 'invalid-response' }
    if (
      Object.keys(rawReason).some((key) => key !== 'code' && key !== 'message')
      || !isPaymentUnavailableReasonCode(rawReason.code)
      || typeof rawReason.message !== 'string'
      || rawReason.message.trim().length === 0
    ) {
      return { ok: false, reason: 'invalid-response' }
    }

    return {
      ok: true,
      eligibility: {
        market: expectedMarket,
        currency: request.currency,
        methods: [],
        reason: {
          code: rawReason.code,
          message: rawReason.message.trim(),
        },
      },
    }
  }

  if (hasReason) return { ok: false, reason: 'invalid-response' }

  const methods: RegionalPaymentMethod[] = []
  const methodIds = new Set<RegionalPaymentProvider>()
  const providers = new Set<RegionalPaymentProvider>()

  for (const rawMethod of rawMethods) {
    if (!isRecord(rawMethod)) return { ok: false, reason: 'invalid-response' }

    const { id, provider, label, chargeCurrency, chargeAmount } = rawMethod
    if (!isPaymentProvider(id) || !isPaymentProvider(provider) || id !== provider) {
      return { ok: false, reason: 'invalid-response' }
    }
    if (typeof label !== 'string' || label.trim().length === 0) {
      return { ok: false, reason: 'invalid-response' }
    }
    if (!isCurrencyCode(chargeCurrency)) return { ok: false, reason: 'invalid-response' }
    if (!Number.isSafeInteger(chargeAmount) || (chargeAmount as number) <= 0) {
      return { ok: false, reason: 'invalid-response' }
    }

    if (id === 'mpesa' && chargeCurrency !== 'KES') {
      return { ok: false, reason: 'invalid-response' }
    }
    if (id === 'paypal' && !PAYPAL_CHARGE_CURRENCIES.includes(chargeCurrency)) {
      return { ok: false, reason: 'invalid-response' }
    }
    if (methodIds.has(id) || providers.has(provider)) {
      return { ok: false, reason: 'invalid-response' }
    }

    methodIds.add(id)
    providers.add(provider)
    methods.push({
      id,
      provider,
      label: label.trim(),
      chargeCurrency,
      chargeAmount: chargeAmount as number,
    })
  }

  const expectedProvider: RegionalPaymentProvider = request.countryCode === 'KE'
    ? 'mpesa'
    : 'paypal'
  if (methods.length !== 1 || methods[0].id !== expectedProvider) {
    return { ok: false, reason: 'invalid-response' }
  }

  return {
    ok: true,
    eligibility: {
      market: expectedMarket,
      currency: request.currency,
      methods,
    },
  }
}

/**
 * Validate the complete server eligibility response atomically. A malformed
 * method invalidates the entire response; no member is silently skipped.
 */
export function parsePaymentEligibility(
  payload: unknown,
  request: RegionalPaymentEligibilityRequest,
): RegionalPaymentEligibility | null {
  const inspection = inspectPaymentEligibility(payload, request)
  return inspection.ok ? inspection.eligibility : null
}

/** Explain why an eligibility response cannot be used, without exposing raw data. */
export function getPaymentEligibilityFailureReason(
  payload: unknown,
  request: RegionalPaymentEligibilityRequest,
): PaymentEligibilityFailureReason | undefined {
  const inspection = inspectPaymentEligibility(payload, request)
  return inspection.ok ? undefined : inspection.reason
}

/**
 * Detect an ISO alpha-2 region from a BCP 47 locale. Intl.Locale understands
 * the tag grammar; the fallback stops at extension/private-use singletons so
 * values such as `ca`, `co`, or `es` are never mistaken for regions.
 */
export function detectRegionFromLocale(locale: string): string | undefined {
  const normalized = locale.trim().replace(/_/g, '-')
  if (!normalized) return undefined

  if (typeof Intl.Locale === 'function') {
    try {
      const region = new Intl.Locale(normalized).region
      if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase()
    } catch {
      // Use the grammar-aware fallback below.
    }
  }

  const subtags = normalized.split('-')
  let index = 1

  if (subtags[index] && /^[A-Za-z]{4}$/.test(subtags[index])) index += 1

  const candidate = subtags[index]
  if (!candidate || candidate.length === 1) return undefined
  if (!/^[A-Za-z]{2}$/.test(candidate)) return undefined

  return candidate.toUpperCase()
}
