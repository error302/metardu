/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'

const mockQuery = jest.fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>()
type TransactionCallback = (client: { query: typeof mockQuery }) => Promise<unknown>
const mockTransaction = jest.fn<Promise<unknown>, [TransactionCallback]>()
const mockSetRlsRole = jest.fn<void, [unknown]>()
const mockLogAuditEvent = jest.fn<Promise<string>, [unknown, unknown?]>()

jest.mock('@/lib/apiHandler', () => {
  const { NextResponse } = jest.requireActual<typeof import('next/server')>('next/server')
  return {
    apiHandler: (_options: unknown, handler: unknown) => handler,
    apiSuccess: (data: unknown, status = 200) => NextResponse.json(data, { status }),
  }
})
jest.mock('@/lib/db', () => ({
  db: { transaction: (work: TransactionCallback): Promise<unknown> => mockTransaction(work) },
  setCurrentRlsServiceRole: (role: unknown): void => { mockSetRlsRole(role) },
}))
jest.mock('@/lib/enterprise/auditTrail', () => ({
  logAuditEvent: (event: unknown, connection?: unknown): Promise<string> => mockLogAuditEvent(event, connection),
}))

import { PATCH } from '../route'

const USER_ID = '90000000-0000-4000-8000-000000000001'
const ADMIN_ID = '90000000-0000-4000-8000-000000000002'
const request = () => new NextRequest('http://localhost/api/admin/users/override-plan', {
  method: 'PATCH',
  headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'METARDU admin test' },
})

async function callPatch(body: unknown) {
  const handler = PATCH as unknown as (
    request: NextRequest,
    context: { body: unknown; userId: string; session: null; params: Record<string, string> },
  ) => Promise<NextResponse>
  return handler(request(), { body, userId: ADMIN_ID, session: null, params: {} })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockTransaction.mockImplementation(async (work: (client: { query: jest.Mock }) => Promise<unknown>) => work({ query: mockQuery }))
  mockLogAuditEvent.mockResolvedValue('audit-id')
})

describe('PATCH /api/admin/users/override-plan', () => {
  it.each(['team', 'firm'])('applies the %s catalogue tier and audits the change atomically', async plan => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: USER_ID }] })
      .mockResolvedValueOnce({ rows: [{ plan_id: 'pro', status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] })

    const response = await callPatch({ email: 'founder@example.com', plan, days: 90 })
    const body: unknown = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ userId: USER_ID, email: 'founder@example.com', plan, days: 90, previousPlan: 'pro' })
    expect(mockSetRlsRole).toHaveBeenCalledWith('platform_admin')
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockQuery).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO user_subscriptions'), [USER_ID, plan, expect.any(String)])
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1)
    expect(mockLogAuditEvent.mock.calls[0]?.[0]).toMatchObject({
      userId: ADMIN_ID,
      action: 'subscription.plan.override',
      resourceId: USER_ID,
      details: { previousPlan: 'pro', newPlan: plan, durationDays: 90 },
      ipAddress: '203.0.113.9',
    })
    expect(mockLogAuditEvent.mock.calls[0]?.[1]).toEqual({ query: mockQuery })
  })

  it('does not write a subscription or audit record when the account does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const response = await callPatch({ email: 'missing@example.com', plan: 'firm', days: 30 })

    expect(response.status).toBe(404)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockLogAuditEvent).not.toHaveBeenCalled()
  })
})
