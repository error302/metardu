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
  prices: Record<CurrencyCode, number>
  annualPrices: Record<CurrencyCode, number>
  features: string[]
  billingInterval: 'monthly'
}

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    id: 'free',
    name: 'Free',
    billingInterval: 'monthly',
    prices: {
      KES: 0,
      UGX: 0,
      TZS: 0,
      NGN: 0,
      GHS: 0,
      ZAR: 0,
      INR: 0,
      IDR: 0,
      BRL: 0,
      AUD: 0,
      GBP: 0,
      EUR: 0,
      USD: 0,
    },
    annualPrices: {
      KES: 0, UGX: 0, TZS: 0, NGN: 0, GHS: 0, ZAR: 0,
      INR: 0, IDR: 0, BRL: 0, AUD: 0, GBP: 0, EUR: 0, USD: 0,
    },
    features: [
      'All quick calculation tools',
      '1 survey project',
      'Up to 50 survey points',
      'Basic PDF report',
      'CSV import',
      'Offline calculations',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    billingInterval: 'monthly',
    prices: {
      KES: 500,
      UGX: 15000,
      TZS: 10000,
      NGN: 2000,
      GHS: 50,
      ZAR: 75,
      INR: 350,
      IDR: 65000,
      BRL: 20,
      AUD: 6,
      GBP: 3,
      EUR: 4,
      USD: 4,
    },
    annualPrices: {
      KES: 5000, UGX: 150000, TZS: 100000, NGN: 20000, GHS: 500, ZAR: 750,
      INR: 3500, IDR: 650000, BRL: 200, AUD: 60, GBP: 30, EUR: 40, USD: 40,
    },
    features: [
      'Unlimited projects',
      'Unlimited survey points',
      'Full professional PDF reports',
      'DXF export',
      'LandXML export',
      'Report share link',
      'GPS Stakeout mode',
      'Process notes',
      'Priority support',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    billingInterval: 'monthly',
    prices: {
      KES: 2000,
      UGX: 60000,
      TZS: 40000,
      NGN: 8000,
      GHS: 200,
      ZAR: 280,
      INR: 1300,
      IDR: 230000,
      BRL: 75,
      AUD: 22,
      GBP: 12,
      EUR: 14,
      USD: 15,
    },
    annualPrices: {
      KES: 20000, UGX: 600000, TZS: 400000, NGN: 80000, GHS: 2000, ZAR: 2800,
      INR: 13000, IDR: 2300000, BRL: 750, AUD: 220, GBP: 120, EUR: 140, USD: 150,
    },
    features: [
      'Everything in Pro',
      '5 team members',
      'Real-time collaboration',
      'Role-based access',
      'Version history',
      'Audit trail',
      'Branded reports',
      'Dedicated support',
    ],
  },
  {
    id: 'firm',
    name: 'Firm',
    billingInterval: 'monthly',
    prices: {
      KES: 5000,
      UGX: 150000,
      TZS: 100000,
      NGN: 20000,
      GHS: 500,
      ZAR: 700,
      INR: 3500,
      IDR: 580000,
      BRL: 190,
      AUD: 55,
      GBP: 30,
      EUR: 35,
      USD: 38,
    },
    annualPrices: {
      KES: 50000, UGX: 1500000, TZS: 1000000, NGN: 200000, GHS: 5000, ZAR: 7000,
      INR: 35000, IDR: 5800000, BRL: 1900, AUD: 550, GBP: 300, EUR: 350, USD: 380,
    },
    features: [
      'Everything in Team',
      '20 team members',
      'Custom integrations',
      'API access',
      'White-label license',
      'Bulk export',
      'Advanced analytics',
      'Dedicated account manager',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    billingInterval: 'monthly',
    prices: {
      KES: 15000,
      UGX: 450000,
      TZS: 300000,
      NGN: 60000,
      GHS: 1500,
      ZAR: 2100,
      INR: 10500,
      IDR: 1740000,
      BRL: 570,
      AUD: 165,
      GBP: 90,
      EUR: 105,
      USD: 115,
    },
    annualPrices: {
      KES: 150000, UGX: 4500000, TZS: 3000000, NGN: 600000, GHS: 15000, ZAR: 21000,
      INR: 105000, IDR: 17400000, BRL: 5700, AUD: 1650, GBP: 900, EUR: 1050, USD: 1150,
    },
    features: [
      'Everything in Firm',
      'Unlimited team members',
      'On-premise deployment option',
      'Custom development',
      'SLA guarantee',
      '24/7 phone support',
      'Training sessions',
      'Regional data residency',
    ],
  },
]

export function getPlan(planId: string): PlanCatalogEntry | null {
  const found = PLAN_CATALOG.find((p) => p.id === planId)
  return found ?? null
}

export function getPlanPrice(planId: PlanId, currency: CurrencyCode): number {
  const plan = getPlan(planId)
  if (!plan) return 0
  return plan.prices[currency] ?? 0
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

