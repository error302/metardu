/** @jest-environment node */
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/project/[id]/points/route'
import { db } from '@/lib/db'
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_: unknown, handler: (req: NextRequest, ctx: Record<string, unknown>) => Promise<Response>) => (req: NextRequest, ctx: Record<string, unknown>) => handler(req, { ...ctx, userId: 'alice' }) }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/auth/ownership', () => ({ requireProjectReadAccess: jest.fn().mockResolvedValue({ ok: true }), requireProjectOwnership: jest.fn() }))
jest.mock('@/lib/enterprise/auditTrail', () => ({ logAuditEvent: jest.fn() }))
const query = db.query as jest.Mock
const calls = () => query.mock.calls as unknown as Array<[string, unknown[]]>
beforeEach(() => { query.mockReset().mockResolvedValue({ rows: [] }) })
const load = (suffix = '') => GET(new NextRequest(`https://metardu.space/api/project/job-a/points${suffix}`), { params: { id: 'job-a' } })
test('terrain review can request every retained point, including missing projected coordinates', async () => {
  await load('?includeIncomplete=true')
  const sql = calls().find(([statement]) => statement.includes('FROM survey_points'))?.[0]
  expect(sql).not.toContain('AND easting IS NOT NULL')
  expect(sql).not.toContain('AND northing IS NOT NULL')
  expect(sql).toContain('deleted_at IS NULL')
})
test('the default point/map response retains its existing projected-only scope', async () => {
  const response = await load()
  const sql = calls().find(([statement]) => statement.includes('FROM survey_points'))?.[0]
  expect(sql).toContain('AND easting IS NOT NULL')
  expect(sql).toContain('AND northing IS NOT NULL')
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
})
test('malformed review flags fail without silently returning a partial dataset', async () => {
  expect((await load('?includeIncomplete=perhaps')).status).toBe(400)
  expect(calls().some(([statement]) => statement.includes('FROM survey_points'))).toBe(false)
})
test('oversized terrain review fails explicitly instead of transferring or truncating a large project', async () => {
  query.mockResolvedValueOnce({ rows: Array.from({ length: 10001 }, () => ({ id: 'synthetic-row' })) })
  const response = await load('?includeIncomplete=true')
  expect(response.status).toBe(413)
  expect((await response.json() as { code: string }).code).toBe('CONTOUR_SOURCE_TOO_LARGE')
  expect(calls().find(([statement]) => statement.includes('FROM survey_points'))?.[0]).toContain('LIMIT 10001')
})
