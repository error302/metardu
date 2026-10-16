import { z } from 'zod'

const count = z.number().int().nonnegative()
const person = z.object({ id: z.string(), email: z.string(), name: z.string() })
export const dashboardResponseSchema = z.object({
  users: z.object({ total: count, newThisMonth: count, active: count }),
  projects: z.object({ total: count, byStatus: z.record(count) }),
  parcels: count,
  beacons: count,
  revenue: z.object({ total: z.number().finite(), byMonth: z.array(z.object({ month: z.string(), total: z.number().finite() })), byCurrency: z.array(z.object({ currency: z.string(), total: z.number().finite() })) }),
  recentSignups: z.array(person.extend({ role: z.string(), plan: z.string(), createdAt: z.string() })),
  iskPendingCount: count,
  iskQueue: z.array(person.extend({ iskNumber: z.string(), submittedAt: z.string(), updatedAt: z.string() })),
  activeSubscriptions: z.record(count), trialSubscriptions: count, submissionsThisMonth: count,
  operations: z.object({
    accounts: count, syntheticAccounts: count, unverifiedEmails: count,
    pendingClaims: count, failedPayments30d: count, expiringSubscriptions7d: count,
    openFeedback: count,
    renewals: z.array(person.extend({ plan: z.string(), status: z.string(), expiresAt: z.string() })),
    feedback: z.array(z.object({ id: z.string(), type: z.string(), message: z.string(), email: z.string().nullable(), status: z.string(), createdAt: z.string(), resolutionNote: z.string().nullable() })),
    announcements: z.array(z.object({ id: z.string(), title: z.string(), body: z.string(), target: z.string(), createdAt: z.string() })),
  }),
  generatedAt: z.string(),
  system: z.object({ database: z.object({ status: z.string(), latencyMs: count }), uptime: count, memory: z.object({ heapUsedMb: count, heapTotalMb: count, rssMb: count }), responseTimeMs: count }),
})

export type DashboardData = z.infer<typeof dashboardResponseSchema>

// Match only the deliberately labelled verification fixtures. Never delete or
// infer that a normal account is synthetic just because its email looks unusual.
export const syntheticAccountSql = `(COALESCE(u.full_name, '') = 'SYNTHETIC PRODUCTION VERIFICATION'
  AND u.email LIKE 'synthetic-production-check-%@example.invalid')`

export const feedbackUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['open', 'in_progress', 'resolved']),
  expectedStatus: z.enum(['open', 'in_progress', 'resolved']),
  note: z.string().trim().min(3).max(2000),
}).strict()
