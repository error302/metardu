process.env.AUTH_SECRET = 'test-only-session-version-secret'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/security/loginLimiter', () => ({
  checkLoginAllowed: jest.fn(),
  recordFailedLogin: jest.fn(),
  recordSuccessfulLogin: jest.fn(),
  getFailedAttemptCount: jest.fn(),
}))

import { db } from '@/lib/db'
import type { JWT } from 'next-auth/jwt'
import type { Session } from 'next-auth'

const mockedQuery = db.query as jest.Mock
type TestCallbacks = {
  jwt(args: { token: Partial<JWT>; user?: Record<string, unknown>; account?: { provider: string } }): Promise<JWT>
  session(args: { session: { user: { id: string; email?: string }; expires?: string }; token: JWT }): Promise<Session | null>
}
let callbacks: TestCallbacks
beforeAll(async () => {
  callbacks = (await import('@/lib/auth')).authOptions.callbacks as unknown as TestCallbacks
})

describe('NextAuth per-user session version', () => {
  beforeEach(() => mockedQuery.mockReset())

  it('pins a new sign-in to the version stored for the authenticated user', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ session_version: '4', is_suspended: false }] })

    const token = await callbacks.jwt({
      token: {},
      user: { id: 'user-1', email: 'surveyor@example.test', name: 'Surveyor' },
      account: { provider: 'credentials' },
    })

    expect(token).toMatchObject({ id: 'user-1', sessionVersion: 4 })
    expect(token.metarduSessionRevoked).toBeUndefined()
  })

  it('keeps an existing token only while its version matches the database', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ session_version: 4, is_suspended: false }] })

    const token = await callbacks.jwt({ token: { id: 'user-1', sessionVersion: 4 } })

    expect(token.metarduSessionRevoked).toBeUndefined()
  })

  it('turns a stale token into a null NextAuth session', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ session_version: 5, is_suspended: false }] })

    const token = await callbacks.jwt({ token: { id: 'user-1', sessionVersion: 4 } })
    const session = await callbacks.session({
      session: { user: { id: 'user-1', email: 'surveyor@example.test' }, expires: new Date().toISOString() },
      token,
    })

    expect(token.metarduSessionRevoked).toBe(true)
    expect(session).toBeNull()
  })

  it('fails closed for legacy tokens and accounts removed from the database', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ session_version: 1, is_suspended: false }] })
    const legacyToken = await callbacks.jwt({ token: { id: 'user-1' } })
    expect(legacyToken.metarduSessionRevoked).toBe(true)

    mockedQuery.mockResolvedValueOnce({ rows: [] })
    const deletedUserToken = await callbacks.jwt({ token: { id: 'user-1', sessionVersion: 1 } })
    expect(deletedUserToken.metarduSessionRevoked).toBe(true)
  })

  it('does not turn a database error into an authenticated session', async () => {
    mockedQuery.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(callbacks.jwt({ token: { id: 'user-1', sessionVersion: 1 } })).rejects.toThrow('database unavailable')
  })

  it('revokes an active session when its account is suspended even without a version change', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ session_version: 4, is_suspended: true }] })
    const token = await callbacks.jwt({ token: { id: 'user-1', sessionVersion: 4 } })
    expect(token.metarduSessionRevoked).toBe(true)
    expect(await callbacks.session({ session: { user: { id: 'user-1' } }, token })).toBeNull()
  })

  it('does not issue a fresh session if suspension races with sign-in', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ session_version: 4, is_suspended: true }] })
    const token = await callbacks.jwt({ token: {}, user: { id: 'user-1' }, account: { provider: 'credentials' } })
    expect(token.metarduSessionRevoked).toBe(true)
  })
})
