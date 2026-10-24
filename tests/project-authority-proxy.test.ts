/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
const mockQuery = jest.fn().mockResolvedValue({ rows: [{ id: 'synthetic' }], rowCount: 1 })
jest.mock('@/lib/db', () => ({ db: { query: (...args: unknown[]) => mockQuery(...args) }, setCurrentRlsServiceRole: jest.fn(), setCurrentTillClaimCode: jest.fn() }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn(async () => ({ user: { id: '11111111-1111-4111-8111-111111111111', email: 'synthetic@example.invalid' } })) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/auth/requestContext', () => ({ setAuthenticatedDatabaseContext: jest.fn(), resolveAuthenticatedOrganization: jest.fn(async () => null) }))
jest.mock('@/lib/security/projectAccess', () => ({ checkProjectAccess: jest.fn(async () => ({ allowed: true })) }))
jest.mock('@/lib/env', () => ({ env: { ADMIN_EMAILS: '' } }))
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: (req: NextRequest, ctx: { body: unknown }) => Promise<NextResponse>) => async (req: NextRequest) => handler(req, { body: await req.json() as unknown }) }))
import { POST } from '@/app/api/db/route'
const request = (table: string, operation: string, payload: unknown) => new NextRequest('http://127.0.0.1/api/db', { method: 'POST', body: JSON.stringify({ table, operation, payload, onConflict: 'id', filters: [{ op: 'eq', column: 'id', value: '22222222-2222-4222-8222-222222222222' }] }) })
beforeEach(() => mockQuery.mockClear())
test.each(['update', 'upsert'])('project %s cannot bypass reference declaration with protected columns', async operation => {
  expect((await POST(request('projects', operation, { name: 'Synthetic', datum: 'ARC1960', utm_zone: 37, hemisphere: 'S' }))).status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})
test('batch upsert checks every row for protected reference columns', async () => {
  expect((await POST(request('projects', 'upsert', [{ name: 'A' }, { name: 'B', datum: null }]))).status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})
test.each(['insert', 'update', 'upsert', 'delete'])('subscription %s cannot grant or remove entitlement through the generic proxy', async operation => {
  expect((await POST(request('user_subscriptions', operation, { plan_id: 'pro', status: 'active' }))).status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})
test.each(['projects', 'user_subscriptions'])('%s reads remain available to the owner', async table => {
  expect((await POST(request(table, 'select', null))).status).toBe(200)
  expect(mockQuery).toHaveBeenCalled()
})
test('workflow progress writes remain available without reference changes', async () => {
  expect((await POST(request('projects', 'update', { workflow_step: 2, workflow_max_unlocked: 2 }))).status).toBe(200)
  expect(mockQuery).toHaveBeenCalled()
})
