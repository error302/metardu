process.env.AUTH_SECRET = 'test-only-oauth-identity-secret'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }))
jest.mock('@/lib/security/loginLimiter', () => ({
  checkLoginAllowed: jest.fn(), recordFailedLogin: jest.fn(),
  recordSuccessfulLogin: jest.fn(), getFailedAttemptCount: jest.fn(),
}))

import { db } from '@/lib/db'
import { authOptions } from '@/lib/auth'

const query = db.query as jest.Mock
const signIn = authOptions.callbacks!.signIn!
const existingUser = {
  id: 'account-1', email: 'surveyor@example.test', password_hash: 'password-hash',
  full_name: 'Surveyor', isk_number: null, verified_isk: false, role: 'user',
  provider: 'credentials', oauth_provider_id: null, oauth_avatar_url: null, email_verified: true,
}

function request(provider = 'azure-ad', subject = 'microsoft-subject', verified?: boolean) {
  return {
    user: { id: 'provider-user', email: existingUser.email, name: 'Surveyor' },
    account: { type: 'oauth' as const, provider, providerAccountId: subject },
    profile: { sub: subject, ...(provider === 'google' ? { hd: 'example.test' } : {}), ...(verified === undefined ? {} : { email_verified: verified }) },
  } as Parameters<typeof signIn>[0]
}

describe('OAuth identity resolution', () => {
  beforeEach(() => query.mockReset())

  it('rejects an unverified Microsoft email matching a verified password account', async () => {
    query.mockResolvedValue({ rows: [existingUser] })
    expect(await signIn(request())).toBe(false)
    expect(query.mock.calls.some(([sql]) => /^UPDATE users/.test(sql))).toBe(false)
  })

  it('rejects an unverified email matching a different OAuth identity', async () => {
    query.mockResolvedValue({ rows: [{ ...existingUser, password_hash: 'OAUTH_NO_PASSWORD', provider: 'google', oauth_provider_id: 'google-subject' }] })
    expect(await signIn(request())).toBe(false)
  })

  it('rejects Google when the email verification claim is missing', async () => {
    query.mockResolvedValue({ rows: [existingUser] })
    expect(await signIn(request('google', 'google-subject'))).toBe(false)
    expect(query).not.toHaveBeenCalled()
  })

  it('accepts a previously linked Microsoft subject when its email has changed', async () => {
    query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith('SELECT id, email')
        ? [{ ...existingUser, password_hash: 'OAUTH_NO_PASSWORD', provider: 'azure-ad', oauth_provider_id: 'microsoft-subject' }]
        : [],
    }))
    const input = request()
    input.user.email = 'changed@example.test'
    expect(await signIn(input)).toBe(true)
    expect(input.user.email).toBe(existingUser.email)
    expect(input.user.id).toBe(existingUser.id)
  })

  it('rejects a changed subject on an already linked provider', async () => {
    query.mockResolvedValue({ rows: [{ ...existingUser, provider: 'azure-ad', oauth_provider_id: 'original-subject' }] })
    expect(await signIn(request('azure-ad', 'different-subject', true))).toBe(false)
  })

  it('links verified Google email only to an already verified account', async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT id, email') ? [existingUser] : [] }))
    const input = request('google', 'google-subject', true)
    expect(await signIn(input)).toBe(true)
    expect(input.user.provider).toBe('google')
  })

  it('rejects a verified Google identity matching an unverified existing account', async () => {
    query.mockResolvedValue({ rows: [{ ...existingUser, email_verified: false }] })
    expect(await signIn(request('google', 'google-subject', true))).toBe(false)
  })

  it('rejects missing provider subjects before looking up accounts', async () => {
    expect(await signIn(request('azure-ad', ''))).toBe(false)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects ambiguous duplicate stable identities', async () => {
    const linked = { ...existingUser, provider: 'azure-ad', oauth_provider_id: 'microsoft-subject' }
    query.mockResolvedValue({ rows: [linked, { ...linked, id: 'account-2' }] })
    expect(await signIn(request())).toBe(false)
  })

  it('keeps an established identity when its new email belongs to another account', async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT id, email')
      ? [{ ...existingUser, provider: 'azure-ad', oauth_provider_id: 'microsoft-subject' }, { ...existingUser, id: 'other-account', email: 'changed@example.test' }]
      : [] }))
    const input = request()
    input.user.email = 'changed@example.test'
    expect(await signIn(input)).toBe(true)
    expect(input.user.id).toBe(existingUser.id)
    expect(query.mock.calls[0][1]).toEqual(['changed@example.test', 'azure-ad', 'microsoft-subject'])
  })

  it('creates a new Microsoft identity without claiming its email is verified', async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('INSERT INTO users')
      ? [{ id: 'new-account', email: existingUser.email, full_name: 'Surveyor', role: 'user', provider: 'azure-ad' }]
      : [] }))
    const input = request()
    expect(await signIn(input)).toBe(true)
    const insert = query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO users'))
    expect(insert?.[1][6]).toBe(false)
    expect(input.user.id).toBe('new-account')
    expect(input.user.role).toBe('user')
  })

  it('rejects a Microsoft email claim for automatic linking even if a tenant supplies email_verified', async () => {
    query.mockResolvedValue({ rows: [existingUser] })
    expect(await signIn(request('azure-ad', 'microsoft-subject', true))).toBe(false)
  })

  it('requires separate ownership proof for a third-party Google email without a hosted-domain claim', async () => {
    query.mockResolvedValue({ rows: [existingUser] })
    const input = request('google', 'google-subject', true)
    delete (input.profile as Record<string, unknown>).hd
    expect(await signIn(input)).toBe(false)
  })

  it('denies sign-in when the account suspension check cannot be completed', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT is_suspended')) throw new Error('database unavailable')
      return { rows: sql.startsWith('SELECT id, email')
        ? [{ ...existingUser, provider: 'azure-ad', oauth_provider_id: 'microsoft-subject' }]
        : [] }
    })
    expect(await signIn(request())).toBe(false)
  })
})
