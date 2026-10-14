/** @jest-environment node */
import { NextRequest } from 'next/server'
const mockQuery = jest.fn<Promise<{ rows: Record<string, unknown>[] }>, [string, unknown[]?]>()
const mockTransaction = jest.fn(async (callback: (client: { query: typeof mockQuery }) => Promise<unknown>) => callback({ query: mockQuery }))
const mockSend = jest.fn<Promise<{ success: boolean }>, unknown[]>()
jest.mock('@/lib/db', () => ({ db: {
  query: (...args: Parameters<typeof mockQuery>) => mockQuery(...args),
  transaction: (callback: Parameters<typeof mockTransaction>[0]) => mockTransaction(callback),
}, setCurrentUserId: jest.fn() }))
jest.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'user-id', email: 'crew@example.com', name: 'Road crew' } }) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('bcryptjs', () => ({ compare: async () => true, hash: async () => 'new-hash' }))
jest.mock('@/lib/email-templates', () => ({ sendTemplatedEmail: (...args: unknown[]) => mockSend(...args) }))
jest.mock('@/lib/security/rateLimit', () => ({ rateLimit: async () => ({ allowed: true }), getClientIdentifier: () => 'test-client' }))
import { POST } from '../update-password/route'
it('revokes old sessions and sends a confirmation after an authenticated password change', async () => {
  mockQuery.mockResolvedValue({ rows: [{ password_hash: 'old-hash' }] })
  mockSend.mockResolvedValue({ success: true })
  const response = await POST(new NextRequest('https://metardu.space/api/auth/update-password', {
    method: 'POST', body: JSON.stringify({ currentPassword: 'old-password', password: 'new-password-123' }),
  }))
  expect(response.status).toBe(200)
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('session_version = session_version + 1'), expect.any(Array))
  expect(mockTransaction).toHaveBeenCalledTimes(1)
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE password_reset_tokens SET used_at'), ['user-id'])
  expect(mockSend).toHaveBeenCalledWith('passwordChanged', expect.objectContaining({ to: 'crew@example.com' }))
})
