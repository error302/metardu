/** @jest-environment node */
import { NextRequest } from 'next/server'
import type { QueryResult, QueryResultRow } from 'pg'
import { GET, POST, PATCH, DELETE } from './route'
import { db } from '@/lib/db'
import { canAccessProject } from '@/lib/auth/rbac'

const projectId = '22222222-2222-4222-8222-222222222222'
const ownerId = '11111111-1111-4111-8111-111111111111'
const memberId = '33333333-3333-4333-8333-333333333333'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/auth/rbac', () => ({ canAccessProject: jest.fn() }))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn().mockResolvedValue({}) }))
jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: (req: NextRequest, context: unknown) => unknown) =>
    async (req: NextRequest) => handler(req, {
      params: { id: projectId },
      userId: ownerId,
      body: req.method === 'GET' || req.method === 'DELETE' ? {} : await req.json() as unknown,
    }),
}))

const context = { params: Promise.resolve({ id: projectId }) }
const mockQuery = jest.mocked(db.query)

/** db.query returns a full QueryResult; the mock rows alone must satisfy it. */
function result(rows: unknown[]): QueryResult<QueryResultRow> {
  return { rows: rows as QueryResultRow[], command: '', rowCount: rows.length, oid: 0, fields: [] }
}

function request(method: string, body?: unknown, query = '') {
  return new NextRequest(`http://localhost/api/projects/${projectId}/members${query}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('organization_id FROM projects')) {
      return result([{ user_id: ownerId, organization_id: null }])
    }
    if (sql.includes('AS owner_id')) {
      return result([{ owner_id: ownerId, owner_name: 'Owner', owner_email: 'owner@example.com' }])
    }
    if (sql.includes('FROM project_members pm')) {
      return result([{ id: 'm1', user_id: memberId, role: 'surveyor', created_at: new Date(0), name: 'Member', email: 'member@example.com' }])
    }
    if (sql.includes('FROM users WHERE lower(email)')) {
      return result([{ id: memberId, email: 'member@example.com', full_name: 'Member' }])
    }
    if (sql.includes('SELECT id FROM project_members WHERE')) return result([])
    if (sql.includes('INSERT INTO project_members')) return result([{ id: 'm1' }])
    if (sql.includes('UPDATE project_members')) return result([{ id: 'm1' }])
    if (sql.includes('DELETE FROM project_members')) {
      return result([{ id: 'm1', user_id: memberId, role: 'surveyor' }])
    }
    return result([])
  })
})

it('rejects callers with no project access before reading members', async () => {
  jest.mocked(canAccessProject).mockResolvedValue(null)
  const res = await GET(request('GET'), context)
  expect(res.status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})

it('lists owner and members for a recognized reader, with caller policy resolved', async () => {
  jest.mocked(canAccessProject).mockResolvedValue('viewer')
  const res = await GET(request('GET'), context)
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: { owner: { email: string }; members: Array<{ userId: string; role: string }>; callerRole: string; canManage: boolean } }
  expect(body.data.owner.email).toBe('owner@example.com')
  expect(body.data.members[0]).toMatchObject({ userId: memberId, role: 'surveyor' })
  // The mocked caller owns the project scope row, so manage rights follow
  // ownership even when the (mocked) access role is only viewer.
  expect(body.data).toMatchObject({ callerRole: 'viewer', canManage: true })
})

it('owner can invite a member with a grantable role', async () => {
  jest.mocked(canAccessProject).mockResolvedValue('owner')
  const res = await POST(request('POST', { email: 'Member@Example.com', role: 'surveyor' }), context)
  expect(res.status).toBe(201)
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO project_members'),
    [projectId, memberId, 'surveyor'],
  )
})

it('a viewer member cannot invite, change roles, or revoke', async () => {
  jest.mocked(canAccessProject).mockResolvedValue('viewer')
  // Caller is a member here, not the owner in the scope row.
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('organization_id FROM projects')) {
      return result([{ user_id: '99999999-9999-4999-8999-999999999999', organization_id: null }])
    }
    return result([])
  })
  expect((await POST(request('POST', { email: 'member@example.com', role: 'surveyor' }), context)).status).toBe(403)
  expect((await PATCH(request('PATCH', { userId: memberId, role: 'viewer' }), context)).status).toBe(403)
  expect((await DELETE(request('DELETE', undefined, `?userId=${memberId}`), context)).status).toBe(403)
  expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO project_members'))).toBe(false)
})

it('owner can change a role and revoke a membership', async () => {
  jest.mocked(canAccessProject).mockResolvedValue('owner')
  expect((await PATCH(request('PATCH', { userId: memberId, role: 'project_manager' }), context)).status).toBe(200)
  expect((await DELETE(request('DELETE', undefined, `?userId=${memberId}`), context)).status).toBe(200)
})

it('inviting the project owner is a conflict, not a shadow membership', async () => {
  jest.mocked(canAccessProject).mockResolvedValue('owner')
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('organization_id FROM projects')) return result([{ user_id: ownerId, organization_id: null }])
    if (sql.includes('FROM users WHERE lower(email)')) {
      return result([{ id: ownerId, email: 'owner@example.com', full_name: 'Owner' }])
    }
    return result([])
  })
  const res = await POST(request('POST', { email: 'owner@example.com', role: 'viewer' }), context)
  expect(res.status).toBe(409)
})
