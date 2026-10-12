export interface SubscriptionAggregateRow {
  plan_id: string | null
  status: string
  count: number
}

export interface SubscriptionDashboardMetrics {
  activeByPlan: Record<string, number>
  trialCount: number
}

export interface RevenueCurrencyAggregateRow {
  currency: string
  total: number
}

export interface RevenueDashboardMetrics {
  kesTotal: number
  byCurrency: RevenueCurrencyAggregateRow[]
}

/** Keep provider currencies separate; KES is the dashboard's local-currency headline. */
export function buildRevenueDashboardMetrics(
  rows: RevenueCurrencyAggregateRow[],
): RevenueDashboardMetrics {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const normalizedCurrency = row.currency.trim().toUpperCase()
    const currency = /^[A-Z]{3}$/.test(normalizedCurrency) ? normalizedCurrency : 'KES'
    const total = Number.isFinite(row.total) ? row.total : 0
    totals.set(currency, (totals.get(currency) ?? 0) + total)
  }

  const byCurrency = [...totals.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
  return { kesTotal: totals.get('KES') ?? 0, byCurrency }
}

/** Split currently entitled subscriptions from trial accounts for admin reporting. */
export function buildSubscriptionDashboardMetrics(
  rows: SubscriptionAggregateRow[],
): SubscriptionDashboardMetrics {
  const activeByPlan: Record<string, number> = {
    free: 0,
    pro: 0,
    team: 0,
    firm: 0,
    enterprise: 0,
  }
  let trialCount = 0

  for (const row of rows) {
    const count = Number.isFinite(row.count) ? Math.max(0, Math.trunc(row.count)) : 0
    if (row.status === 'trial') {
      trialCount += count
    } else if (row.status === 'active') {
      const plan = row.plan_id?.trim() || 'free'
      activeByPlan[plan] = (activeByPlan[plan] ?? 0) + count
    }
  }

  return { activeByPlan, trialCount }
}
