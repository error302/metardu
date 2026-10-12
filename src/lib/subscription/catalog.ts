export type CurrencyCode =
  | 'KES'
  | 'UGX'
  | 'TZS'
  | 'NGN'
  | 'GHS'
  | 'ZAR'
  | 'INR'
  | 'IDR'
  | 'BRL'
  | 'AUD'
  | 'GBP'
  | 'EUR'
  | 'USD'

export type PlanId = 'free' | 'pro' | 'team' | 'firm' | 'enterprise'

export interface PlanCatalogEntry {
  id: PlanId
  name: string
  /** Base monthly prices per currency. For per-seat plans this is the base (platform fee). */
  prices: Record<CurrencyCode, number>
  /** Base annual prices per currency (10× monthly — 2 months free). */
  annualPrices: Record<CurrencyCode, number>
  features: string[]
  billingInterval: 'monthly'
  /** Number of seats included in the base price. -1 = unlimited. */
  includedSeats: number
  /** Whether additional seats can be purchased beyond includedSeats. */
  isPerSeat: boolean
  /** Per-seat monthly price for additional seats (only meaningful when isPerSeat = true). */
  perSeatPrices: Record<CurrencyCode, number>
  /** Per-seat annual price for additional seats (only meaningful when isPerSeat = true). */
  perSeatAnnualPrices: Record<CurrencyCode, number>
  /** If true, pricing is negotiated — hide price and show "Contact Sales". */
  contactSales: boolean
}

const ZERO_PRICES: Record<CurrencyCode, number> = {
  KES: 0, UGX: 0, TZS: 0, NGN: 0, GHS: 0, ZAR: 0,
  INR: 0, IDR: 0, BRL: 0, AUD: 0, GBP: 0, EUR: 0, USD: 0,
}

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  // ── Free ────────────────────────────────────────────────────────────
  {
    id: 'free',
    name: 'Free',
    billingInterval: 'monthly',
    prices: { ...ZERO_PRICES },
    annualPrices: { ...ZERO_PRICES },
    perSeatPrices: { ...ZERO_PRICES },
    perSeatAnnualPrices: { ...ZERO_PRICES },
    includedSeats: 1,
    isPerSeat: false,
    contactSales: false,
    features: [
      'All quick calculation tools',
      '1 survey project',
      'Up to 50 survey points',
      'Basic PDF report (watermarked)',
      'CSV import',
      'Offline calculations',
    ],
  },

  // ── Pro — single surveyor ───────────────────────────────────────────
  {
    id: 'pro',
    name: 'Pro',
    billingInterval: 'monthly',
    prices: {
      KES: 2500,
      UGX: 75000,
      TZS: 50000,
      NGN: 10000,
      GHS: 250,
      ZAR: 375,
      INR: 1750,
      IDR: 325000,
      BRL: 100,
      AUD: 29,
      GBP: 15,
      EUR: 19,
      USD: 19,
    },
    annualPrices: {
      KES: 25000,
      UGX: 750000,
      TZS: 500000,
      NGN: 100000,
      GHS: 2500,
      ZAR: 3750,
      INR: 17500,
      IDR: 3250000,
      BRL: 1000,
      AUD: 290,
      GBP: 150,
      EUR: 190,
      USD: 190,
    },
    perSeatPrices: { ...ZERO_PRICES },
    perSeatAnnualPrices: { ...ZERO_PRICES },
    includedSeats: 1,
    isPerSeat: false,
    contactSales: false,
    features: [
      'Unlimited projects',
      'Unlimited survey points',
      'Full professional PDF reports',
      'DXF & LandXML export',
      'Report share link',
      'GPS Stakeout mode',
      'Total station & GNSS connection',
      'Process notes',
      'Priority email support',
    ],
  },

  // ── Team — 3 seats included, per-seat above ─────────────────────────
  {
    id: 'team',
    name: 'Team',
    billingInterval: 'monthly',
    prices: {
      KES: 4500,
      UGX: 135000,
      TZS: 90000,
      NGN: 18000,
      GHS: 450,
      ZAR: 650,
      INR: 2900,
      IDR: 540000,
      BRL: 175,
      AUD: 52,
      GBP: 27,
      EUR: 32,
      USD: 35,
    },
    annualPrices: {
      KES: 45000,
      UGX: 1350000,
      TZS: 900000,
      NGN: 180000,
      GHS: 4500,
      ZAR: 6500,
      INR: 29000,
      IDR: 5400000,
      BRL: 1750,
      AUD: 520,
      GBP: 270,
      EUR: 320,
      USD: 350,
    },
    perSeatPrices: {
      KES: 1500,
      UGX: 45000,
      TZS: 30000,
      NGN: 6000,
      GHS: 150,
      ZAR: 220,
      INR: 1000,
      IDR: 185000,
      BRL: 60,
      AUD: 18,
      GBP: 9,
      EUR: 11,
      USD: 12,
    },
    perSeatAnnualPrices: {
      KES: 15000,
      UGX: 450000,
      TZS: 300000,
      NGN: 60000,
      GHS: 1500,
      ZAR: 2200,
      INR: 10000,
      IDR: 1850000,
      BRL: 600,
      AUD: 180,
      GBP: 90,
      EUR: 110,
      USD: 120,
    },
    includedSeats: 3,
    isPerSeat: true,
    contactSales: false,
    features: [
      'Everything in Pro',
      '3 seats included',
      'Additional seats available',
      'Real-time collaboration',
      'Role-based access control',
      'Version history',
      'Audit trail',
      'Branded reports with firm logo',
      'Dedicated support',
    ],
  },

  // ── Firm — 5 seats included, per-seat above ─────────────────────────
  {
    id: 'firm',
    name: 'Firm',
    billingInterval: 'monthly',
    prices: {
      KES: 9000,
      UGX: 270000,
      TZS: 180000,
      NGN: 36000,
      GHS: 900,
      ZAR: 1300,
      INR: 5800,
      IDR: 1070000,
      BRL: 350,
      AUD: 100,
      GBP: 55,
      EUR: 65,
      USD: 69,
    },
    annualPrices: {
      KES: 90000,
      UGX: 2700000,
      TZS: 1800000,
      NGN: 360000,
      GHS: 9000,
      ZAR: 13000,
      INR: 58000,
      IDR: 10700000,
      BRL: 3500,
      AUD: 1000,
      GBP: 550,
      EUR: 650,
      USD: 690,
    },
    perSeatPrices: {
      KES: 2500,
      UGX: 75000,
      TZS: 50000,
      NGN: 10000,
      GHS: 250,
      ZAR: 350,
      INR: 1600,
      IDR: 295000,
      BRL: 95,
      AUD: 28,
      GBP: 15,
      EUR: 18,
      USD: 19,
    },
    perSeatAnnualPrices: {
      KES: 25000,
      UGX: 750000,
      TZS: 500000,
      NGN: 100000,
      GHS: 2500,
      ZAR: 3500,
      INR: 16000,
      IDR: 2950000,
      BRL: 950,
      AUD: 280,
      GBP: 150,
      EUR: 180,
      USD: 190,
    },
    includedSeats: 5,
    isPerSeat: true,
    contactSales: false,
    features: [
      'Everything in Team',
      '5 seats included',
      'Additional seats available',
      'Custom integrations',
      'API access',
      'White-label license',
      'Bulk export',
      'Advanced analytics',
      'Dedicated account manager',
    ],
  },

  // ── Enterprise — custom / contact sales ─────────────────────────────
  {
    id: 'enterprise',
    name: 'Enterprise',
    billingInterval: 'monthly',
    prices: { ...ZERO_PRICES },
    annualPrices: { ...ZERO_PRICES },
    perSeatPrices: { ...ZERO_PRICES },
    perSeatAnnualPrices: { ...ZERO_PRICES },
    includedSeats: -1,
    isPerSeat: false,
    contactSales: true,
    features: [
      'Everything in Firm',
      'Unlimited seats',
      'On-premise deployment option',
      'Custom development',
      'SLA guarantee',
      '24/7 phone support',
      'Training sessions',
      'Regional data residency',
    ],
  },
]

// ── Helpers ────────────────────────────────────────────────────────────

export function getPlan(planId: string): PlanCatalogEntry | null {
  const found = PLAN_CATALOG.find((p) => p.id === planId)
  return found ?? null
}

export function getPlanPrice(planId: PlanId, currency: CurrencyCode): number {
  const plan = getPlan(planId)
  if (!plan) return 0
  return plan.prices[currency] ?? 0
}

export function getPerSeatPrice(planId: PlanId, currency: CurrencyCode): number {
  const plan = getPlan(planId)
  if (!plan || !plan.isPerSeat) return 0
  return plan.perSeatPrices[currency] ?? 0
}

/**
 * Calculate total monthly price for a plan with a given number of total seats.
 * For non-per-seat plans, returns the flat base price.
 * For per-seat plans, returns base + (extraSeats × perSeatPrice).
 */
export function getTotalPrice(
  planId: PlanId,
  currency: CurrencyCode,
  totalSeats: number,
): number {
  const plan = getPlan(planId)
  if (!plan) return 0
  if (plan.contactSales) return 0

  const base = plan.prices[currency] ?? 0
  if (!plan.isPerSeat) return base

  const extraSeats = Math.max(0, totalSeats - plan.includedSeats)
  const seatPrice = plan.perSeatPrices[currency] ?? 0
  return base + extraSeats * seatPrice
}

/**
 * Calculate total annual price for a plan with a given number of total seats.
 */
export function getTotalAnnualPrice(
  planId: PlanId,
  currency: CurrencyCode,
  totalSeats: number,
): number {
  const plan = getPlan(planId)
  if (!plan) return 0
  if (plan.contactSales) return 0

  const base = plan.annualPrices[currency] ?? 0
  if (!plan.isPerSeat) return base

  const extraSeats = Math.max(0, totalSeats - plan.includedSeats)
  const seatPrice = plan.perSeatAnnualPrices[currency] ?? 0
  return base + extraSeats * seatPrice
}

export const SUPPORTED_CURRENCIES: CurrencyCode[] = [
  'KES',
  'UGX',
  'TZS',
  'NGN',
  'GHS',
  'ZAR',
  'USD',
  'EUR',
  'GBP',
  'INR',
  'IDR',
  'BRL',
  'AUD',
]
