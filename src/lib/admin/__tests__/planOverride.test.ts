import { PLAN_CATALOG } from '@/lib/subscription/catalog'
import { adminPlanOverrideSchema } from '../planOverride'

describe('admin subscription override input', () => {
  it.each(PLAN_CATALOG.map(plan => [plan.id, plan.name] as const))(
    'accepts the canonical %s tier',
    (planId) => {
      expect(adminPlanOverrideSchema.parse({ email: 'admin-test@example.com', plan: planId })).toMatchObject({
        email: 'admin-test@example.com',
        plan: planId,
        days: 30,
      })
    },
  )

  it('normalizes the account email and accepts an explicit whole-day duration', () => {
    expect(adminPlanOverrideSchema.parse({ email: '  Founder+ops@Example.COM ', plan: 'team', days: '90' })).toEqual({
      email: 'founder+ops@example.com',
      plan: 'team',
      days: 90,
    })
  })

  it.each([
    { email: 'not-an-email', plan: 'team' },
    { email: 'admin-test@example.com', plan: 'starter' },
    { email: 'admin-test@example.com', plan: 'firm', days: 0 },
    { email: 'admin-test@example.com', plan: 'firm', days: 3651 },
    { email: 'admin-test@example.com', plan: 'firm', days: 1.5 },
    { email: 'admin-test@example.com', plan: 'firm', unexpected: true },
  ])('rejects malformed or out-of-range override input %#', value => {
    expect(adminPlanOverrideSchema.safeParse(value).success).toBe(false)
  })
})
