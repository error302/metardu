/** @jest-environment node */
import { types } from 'pg'
import { dashboardResponseSchema } from '@/lib/admin/dashboardContract'

const mockQuery = jest.fn<Promise<{ rows: unknown[] }>, [string]>()
jest.mock('@/lib/db', () => ({
  db: { query: (sql: string) => mockQuery(sql) },
  setCurrentRlsServiceRole: jest.fn(),
}))
// Exercise the response producer without authentication or a customer database.
jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: unknown) => handler,
  apiSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
}))
import { GET } from './route'

const createdAt = new Date('2026-10-20T12:00:00.000Z')

beforeEach(() => {
  mockQuery.mockReset().mockImplementation(async sql => {
    // PostgreSQL COUNT and bigint addition use int8; only the query's explicit
    // int cast makes pg use the int4 parser, just like neighboring count queries.
    if (sql.includes('public_beacons')) {
      const oid = /\)::int\s+AS count/i.test(sql) ? 23 : 20
      const parse = types.getTypeParser(oid) as (value: string) => unknown
      return { rows: [{ count: parse('13') }] }
    }
    if (sql.includes('AS synthetic_accounts')) return { rows: [{ accounts: 4, synthetic_accounts: 2, unverified: 1 }] }
    if (sql.includes('AS pending')) return { rows: [{ pending: 1, failed: 2 }] }
    if (sql.includes('GROUP BY status')) return { rows: [{ status: 'active', count: 3 }] }
    if (sql.includes('GROUP BY plan_id, status')) return { rows: [{ plan_id: 'pro', status: 'active', count: 2 }, { plan_id: 'team', status: 'trial', count: 1 }] }
    if (sql.includes('payment_history') && sql.includes('GROUP BY COALESCE')) return { rows: [{ currency: 'KES', total: 12_500 }, { currency: 'USD', total: 34.75 }] }
    if (sql.includes('payment_history') && sql.includes('TO_CHAR')) return { rows: [{ month: '2026-10', total: 12_500 }] }
    if (sql.includes('LEFT JOIN user_subscriptions')) return { rows: [{ id: 'u1', email: 'amina@example.com', full_name: null, role: 'surveyor', plan_id: 'pro', created_at: createdAt }] }
    if (sql.includes('updated_at::text')) return { rows: [{ id: 'u1', email: 'amina@example.com', full_name: 'Amina', isk_number: 'ISK123', created_at: createdAt, updated_at: '2026-10-20 12:00:00.123456+00' }] }
    if (sql.includes('AS expires_at')) return { rows: [{ id: 'u1', email: 'amina@example.com', name: 'Amina', plan: 'team', status: 'trial', expires_at: createdAt }] }
    if (sql.includes('SELECT id, type, message')) return { rows: [{ id: 'f1', type: 'bug', message: 'Review needed', email: null, status: 'open', created_at: createdAt, resolution_note: null }] }
    if (sql.includes('FROM announcements')) return { rows: [{ id: 'a1', title: 'Maintenance', body: 'Save your work', target: 'all', created_at: createdAt }] }
    if (sql.includes('COUNT(*)::int')) return { rows: [{ count: 3 }] }
    if (sql === 'SELECT 1') return { rows: [] }
    throw new Error(`Unexpected dashboard query: ${sql}`)
  })
})

it('returns beacon counts and the complete response in the strict client contract', async () => {
  const response = await (GET as unknown as () => Promise<Response>)()
  const payload: unknown = await response.json()
  const parsed = dashboardResponseSchema.safeParse(payload)
  expect(parsed.success ? [] : parsed.error.issues).toEqual([])
  if (!parsed.success) throw parsed.error
  expect(parsed.data.beacons).toBe(13)
  expect(parsed.data.revenue).toEqual({ total: 12_500, byCurrency: [{ currency: 'KES', total: 12_500 }, { currency: 'USD', total: 34.75 }], byMonth: [{ month: '2026-10', total: 12_500 }] })
  expect(parsed.data.recentSignups[0]).toMatchObject({ name: 'amina', createdAt: '2026-10-20T12:00:00.000Z' })
  expect(parsed.data.iskQueue[0].updatedAt).toBe('2026-10-20 12:00:00.123456+00')
  expect(parsed.data.activeSubscriptions.pro).toBe(2)
  expect(parsed.data.trialSubscriptions).toBe(1)
})

it('propagates a failed metrics read instead of returning a zero dashboard', async () => {
  mockQuery.mockRejectedValue(new Error('database unavailable'))
  await expect((GET as unknown as () => Promise<Response>)()).rejects.toThrow('database unavailable')
})
