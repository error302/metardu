/** @jest-environment node */
import { NextRequest } from 'next/server'
const mockQuery = jest.fn<Promise<unknown>, unknown[]>()
const mockAudit = jest.fn<Promise<unknown>, unknown[]>()
const mockRole = jest.fn<void, [string]>()
const mockOptions = jest.fn<void, [unknown]>()
jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (options: unknown, handler: unknown) => { mockOptions(options); return handler },
  apiSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
}))
jest.mock('@/lib/db', () => ({ db: { transaction: (work: (client: unknown) => Promise<unknown>) => work({ query: mockQuery }) }, setCurrentRlsServiceRole: (role: string) => mockRole(role) }))
jest.mock('@/lib/enterprise/auditTrail', () => ({ logAuditEvent: (...args: unknown[]) => mockAudit(...args) }))
import { PATCH } from '../route'
const id = '90000000-0000-4000-8000-000000000001'
const call = () => (PATCH as unknown as (req: NextRequest, ctx: unknown) => Promise<Response>)(new NextRequest('http://localhost/api/admin/feedback', { method: 'PATCH' }), { userId: 'admin', body: { id, status: 'resolved', expectedStatus: 'open', note: 'Issue fixed' } })
beforeEach(() => { mockQuery.mockReset(); mockAudit.mockReset(); mockRole.mockReset() })
it('restricts triage to platform admins', () => {
  expect(mockOptions).toHaveBeenCalledWith(expect.objectContaining({ auth: true, roles: ['super_admin', 'admin'] }))
})
it('updates only the observed version and audits using the same transaction', async () => {
  mockQuery.mockResolvedValue({ rows: [{ id }] }); mockAudit.mockResolvedValue('audit')
  expect((await call()).status).toBe(200)
  expect(mockRole).toHaveBeenCalledWith('platform_admin')
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1 AND status = $5'), [id, 'resolved', 'Issue fixed', 'admin', 'open'])
  expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'feedback.status.changed', details: { previousStatus: 'open', status: 'resolved', note: 'Issue fixed' } }), { query: mockQuery })
})
it('rejects stale feedback without writing an audit event', async () => {
  mockQuery.mockResolvedValue({ rows: [] })
  expect((await call()).status).toBe(409)
  expect(mockAudit).not.toHaveBeenCalled()
})
it('propagates audit failure so the transaction cannot commit an unaudited change', async () => {
  mockQuery.mockResolvedValue({ rows: [{ id }] }); mockAudit.mockRejectedValue(new Error('audit failed'))
  await expect(call()).rejects.toThrow('audit failed')
})
