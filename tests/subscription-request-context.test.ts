/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { GET, POST } from '@/app/api/subscription/route'
import { GET as projectCount } from '@/app/api/subscription/project-count/route'
import { db, setCurrentUserId } from '@/lib/db'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/auth/session', () => ({ isAdmin: jest.fn(async () => false) }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() }, setCurrentUserId: jest.fn(), setCurrentOrgId: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))
const OWNER = '99f15c47-7a36-43c4-b98c-1171da777039'
const query = jest.mocked(db.query)
const session = { user: { id: OWNER, email: 'ordinary@example.invalid' }, expires: '2099-01-01' }
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue(session)
})
function contextBound() { return jest.mocked(setCurrentUserId).mock.calls.some(([id]) => id === OWNER) }
test('ordinary paid subscription reads bind the authenticated RLS identity before SQL', async () => {
  query.mockImplementation(async () => ({ rows: contextBound() ? [{ plan_id: 'pro', status: 'active', current_period_end: '2099-01-01', seat_count: 0 }] : [], rowCount: contextBound() ? 1 : 0 }) as never)
  const response = await GET()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ plan: 'pro', isAdmin: false })
  expect(setCurrentUserId).toHaveBeenCalledWith(OWNER)
})
test('ordinary project usage uses the same authenticated identity before querying', async () => {
  query.mockImplementation(async () => ({ rows: [{ count: contextBound() ? '1' : '0' }], rowCount: 1 }) as never)
  const response = await projectCount()
  expect(await response.json()).toEqual({ count: 1 })
  expect(query).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM projects WHERE user_id = $1', [OWNER])
})
test('owner cancellation establishes RLS context before the guarded owner update', async () => {
  query.mockImplementation(async () => {
    if (!contextBound()) throw new Error('Synthetic RLS refusal')
    return { rows: [], rowCount: 1 } as never
  })
  const response = await POST(new NextRequest('http://localhost/api/subscription', { method: 'POST', body: JSON.stringify({ action: 'cancel' }) }))
  expect(response.status).toBe(200)
  expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = $1'), [OWNER])
})
test('anonymous callers never query subscription or usage data', async () => {
  jest.mocked(getServerSession).mockResolvedValue(null)
  expect((await GET()).status).toBe(401)
  expect((await projectCount()).status).toBe(401)
  expect(query).not.toHaveBeenCalled()
  expect(setCurrentUserId).not.toHaveBeenCalled()
})
test('client plan-upgrade attempts remain refused without SQL writes', async () => {
  const response = await POST(new NextRequest('http://localhost/api/subscription', { method: 'POST', body: JSON.stringify({ action: 'upgrade', planId: 'pro' }) }))
  expect(response.status).toBe(400)
  expect(query).not.toHaveBeenCalled()
})
