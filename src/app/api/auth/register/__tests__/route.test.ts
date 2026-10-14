/** @jest-environment node */
import { NextRequest } from 'next/server'
const mockSend = jest.fn<Promise<{ success: boolean }>, unknown[]>()
const mockQuery = jest.fn<Promise<{ rows: Record<string, unknown>[] }>, [string, unknown[]?]>()
const mockTxQuery = jest.fn()
jest.mock('@/lib/email-templates', () => ({ sendTemplatedEmail: (...args: unknown[]) => mockSend(...args) }))
jest.mock('@/lib/auth/emailVerification', () => ({ createEmailVerificationToken: () => 'signed-token' }))
jest.mock('@/lib/db', () => ({ db: {
  query: (...args: Parameters<typeof mockQuery>) => mockQuery(...args),
  transaction: (work: (client: { query: typeof mockTxQuery }) => Promise<unknown>) => work({ query: mockTxQuery }),
}, setCurrentUserId: jest.fn() }))
jest.mock('bcryptjs', () => ({ hash: async () => 'hash' }))
jest.mock('@/lib/security/rateLimit', () => ({ rateLimit: async () => ({ allowed: true }), getClientIdentifier: () => 'test-client' }))
import { POST } from '../route'
beforeEach(() => {
  jest.clearAllMocks()
  mockQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT email, full_name')
    ? [{ email: 'crew+road@example.com', full_name: 'Road Crew', email_verified: false }]
    : sql.includes('INSERT INTO user_subscriptions') ? [{ trial_ends_at: '2026-10-28T00:00:00Z' }] : [] }))
  mockTxQuery.mockImplementation(async (sql: string) => ({ rows: sql.includes('INSERT INTO users')
    ? [{ id: 'new-user', email: 'crew+road@example.com', full_name: 'Road Crew' }] : [] }))
  mockSend.mockResolvedValue({ success: true })
})
it('completes branded onboarding on the server before responding, without requiring client auto-login', async () => {
  const response = await POST(new NextRequest('https://metardu.space/api/auth/register', {
    method: 'POST', body: JSON.stringify({ email: 'crew+road@example.com', password: 'test-password-123', fullName: 'Road Crew' }),
  }))
  expect(response.status).toBe(200)
  expect(mockSend).toHaveBeenCalledWith('emailVerification', expect.objectContaining({ to: 'crew+road@example.com' }))
  expect(await response.json()).toMatchObject({ success: true, verificationEmailSent: true })
})
