import { buildRevenueDashboardMetrics, buildSubscriptionDashboardMetrics } from '../dashboardMetrics'

describe('admin subscription metrics', () => {
  it('keeps trials separate and reports every active plan tier', () => {
    const metrics = buildSubscriptionDashboardMetrics([
      { plan_id: null, status: 'active', count: 2 },
      { plan_id: 'free', status: 'active', count: 3 },
      { plan_id: 'pro', status: 'active', count: 4 },
      { plan_id: 'team', status: 'active', count: 2 },
      { plan_id: 'firm', status: 'active', count: 1 },
      { plan_id: 'enterprise', status: 'active', count: 1 },
      { plan_id: 'pro', status: 'trial', count: 5 },
    ])

    expect(metrics).toEqual({
      activeByPlan: { free: 5, pro: 4, team: 2, firm: 1, enterprise: 1 },
      trialCount: 5,
    })
  })

  it('does not count cancelled, expired, or invalid aggregate rows as active', () => {
    const metrics = buildSubscriptionDashboardMetrics([
      { plan_id: 'team', status: 'cancelled', count: 8 },
      { plan_id: 'firm', status: 'expired', count: 3 },
      { plan_id: 'pro', status: 'active', count: -2 },
      { plan_id: 'pro', status: 'trial', count: Number.NaN },
    ])

    expect(metrics).toEqual({
      activeByPlan: { free: 0, pro: 0, team: 0, firm: 0, enterprise: 0 },
      trialCount: 0,
    })
  })
})

describe('admin revenue metrics', () => {
  it('uses KES for the headline and keeps foreign currencies separate', () => {
    const metrics = buildRevenueDashboardMetrics([
      { currency: 'KES', total: 12_500 },
      { currency: 'usd', total: 34.75 },
      { currency: 'EUR', total: 19.2 },
    ])

    expect(metrics).toEqual({
      kesTotal: 12_500,
      byCurrency: [
        { currency: 'EUR', total: 19.2 },
        { currency: 'KES', total: 12_500 },
        { currency: 'USD', total: 34.75 },
      ],
    })
  })

  it('does not let a foreign-currency amount inflate KES revenue', () => {
    const metrics = buildRevenueDashboardMetrics([
      { currency: 'USD', total: 350 },
      { currency: 'GBP', total: 80 },
    ])

    expect(metrics.kesTotal).toBe(0)
    expect(metrics.byCurrency).toEqual([
      { currency: 'GBP', total: 80 },
      { currency: 'USD', total: 350 },
    ])
  })
})
