/** @jest-environment node */
process.env.AUTH_SECRET = 'test-only-credentials-secret-at-least-32-characters'
const mockQuery = jest.fn<Promise<unknown>, unknown[]>()
jest.mock('@/lib/db', () => ({ db: { query: (...args: unknown[]) => mockQuery(...args) }, setCurrentUserId: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }))
jest.mock('@/lib/security/loginLimiter', () => ({
  checkLoginAllowed: async () => ({ allowed: true }), recordFailedLogin: jest.fn(),
  recordSuccessfulLogin: jest.fn(), getFailedAttemptCount: async () => 0,
}))
import { authOptions } from '@/lib/auth'
const provider = authOptions.providers[0] as unknown as { options: {
  authorize(credentials: { email: string; password: string }, req: { headers: Record<string, string> }): Promise<unknown>
} }
it('distinguishes database outages from incorrect credentials', async () => {
  mockQuery.mockRejectedValue(new Error('database unavailable'))
  await expect(provider.options.authorize({ email: 'crew@example.com', password: 'test-password' }, { headers: {} }))
    .rejects.toThrow('AUTH_SERVICE_UNAVAILABLE')
})
