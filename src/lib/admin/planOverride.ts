import { z } from 'zod'
import { PLAN_CATALOG, type PlanId } from '@/lib/subscription/catalog'

// Keep staff overrides aligned with the same plan source used by checkout and
// entitlements, so new or existing catalogue tiers cannot silently diverge.
const planIds = PLAN_CATALOG.map(plan => plan.id) as [PlanId, ...PlanId[]]

export const adminPlanOverrideSchema = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  plan: z.enum(planIds),
  days: z.coerce.number().int().min(1).max(3650).prefault(30),
}).strict()

export type AdminPlanOverride = z.infer<typeof adminPlanOverrideSchema>
