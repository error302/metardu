/** @jest-environment node */
const mockQuery = jest.fn<Promise<{ rows: unknown[] }>, unknown[]>()
jest.mock('@/lib/db', () => ({ db: { query: (...args: unknown[]) => mockQuery(...args) } }))
import { loadAdminOperations } from '../operations'
import { feedbackUpdateSchema } from '../dashboardContract'

beforeEach(() => jest.clearAllMocks())

it('keeps test accounts separate and uses the correct trial end date for follow-up', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ accounts: 4, synthetic_accounts: 14, unverified: 1 }] })
    .mockResolvedValueOnce({ rows: [{ pending: 2, failed: 3 }] })
    .mockResolvedValueOnce({ rows: [{ count: 1 }] })
    .mockResolvedValueOnce({ rows: [{ count: 2 }] })
    .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'a@example.com', name: 'A', plan: 'team', status: 'trial', expires_at: new Date('2026-10-16T12:00:00Z') }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
  const result = await loadAdminOperations()
  expect(result).toMatchObject({ accounts: 4, syntheticAccounts: 14, unverifiedEmails: 1, pendingClaims: 2, failedPayments30d: 3, expiringSubscriptions7d: 1, openFeedback: 2 })
  expect(result.renewals[0]).toMatchObject({ plan: 'team', status: 'trial', expiresAt: '2026-10-16T12:00:00.000Z' })
  expect(mockQuery.mock.calls[0][0]).toContain("COALESCE(u.full_name, '') = 'SYNTHETIC PRODUCTION VERIFICATION'")
  expect(mockQuery.mock.calls[0][0]).toContain("AND u.email LIKE 'synthetic-production-check-%@example.invalid'")
  expect(mockQuery.mock.calls[4][0]).toContain("WHEN s.status = 'trial' THEN s.trial_ends_at ELSE s.current_period_end END")
  expect(mockQuery.mock.calls[4][0]).toContain("BETWEEN NOW() AND NOW() + INTERVAL '7 days'")
})

it('does not turn a failed database read into a misleading zero', async () => {
  mockQuery.mockRejectedValue(new Error('database unavailable'))
  await expect(loadAdminOperations()).rejects.toThrow('database unavailable')
})

it('requires a valid status, a review note and the last observed status', () => {
  const valid = { id: '90000000-0000-4000-8000-000000000001', status: 'resolved', expectedStatus: 'open', note: 'Fixed the reported issue' }
  expect(feedbackUpdateSchema.safeParse(valid).success).toBe(true)
  for (const patch of [{ status: 'deleted' }, { note: '  ' }, { expectedStatus: undefined }, { id: 'bad-id' }, { sendEmail: true }]) {
    expect(feedbackUpdateSchema.safeParse({ ...valid, ...patch }).success).toBe(false)
  }
})
