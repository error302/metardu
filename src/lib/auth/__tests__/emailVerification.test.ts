import { createEmailVerificationToken, verifyEmailVerificationToken } from '../emailVerification'

const USER_ID = '5ff471be-c485-4d9b-afb2-24b6ec4ee5e4'

describe('email verification tokens', () => {
  const previousSecret = process.env.AUTH_SECRET

  beforeEach(() => {
    process.env.AUTH_SECRET = 'email-verification-test-secret-at-least-32-characters'
  })

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
  })

  it('binds a signed 48-hour token to the normalized account email', () => {
    const before = Math.floor(Date.now() / 1000)
    const token = createEmailVerificationToken(USER_ID, 'Survey.Team+Road@Example.COM')
    const payload = verifyEmailVerificationToken(token)

    expect(payload).toMatchObject({ sub: USER_ID, email: 'survey.team+road@example.com' })
    expect(payload?.exp).toBeGreaterThanOrEqual(before + 48 * 60 * 60)
    expect(payload?.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 48 * 60 * 60)
  })

  it('rejects a modified, expired, or malformed token', () => {
    const valid = createEmailVerificationToken(USER_ID, 'surveyor@example.com')
    const expired = createEmailVerificationToken(USER_ID, 'surveyor@example.com', -1)

    expect(verifyEmailVerificationToken(`${valid.slice(0, -1)}x`)).toBeNull()
    expect(verifyEmailVerificationToken(expired)).toBeNull()
    expect(verifyEmailVerificationToken('not-a-verification-token')).toBeNull()
    expect(verifyEmailVerificationToken('x'.repeat(4097))).toBeNull()
  })
})
