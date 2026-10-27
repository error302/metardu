import { createEmailVerificationToken, verifyEmailVerificationToken } from '../emailVerification'

const USER_ID = '5ff471be-c485-4d9b-afb2-24b6ec4ee5e4'

describe('email verification tokens', () => {
  const previousSecret = process.env.AUTH_SECRET

  beforeEach(() => {
    process.env.AUTH_SECRET = 'email-verification-test-secret-at-least-32-characters'
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
  })

  afterEach(() => jest.restoreAllMocks())

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

    const [payload, signature] = valid.split('.')
    // Change a significant signature byte; the final base64 character has pad bits.
    const changedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
    expect(verifyEmailVerificationToken(`${payload}.${changedSignature}`)).toBeNull()
    expect(verifyEmailVerificationToken(expired)).toBeNull()
    expect(verifyEmailVerificationToken('not-a-verification-token')).toBeNull()
    expect(verifyEmailVerificationToken('x'.repeat(4097))).toBeNull()
  })

  it('rejects alternate base64 spellings of the same signature bytes', () => {
    const valid = createEmailVerificationToken(USER_ID, 'surveyor@example.com')
    const [payload, signature] = valid.split('.')
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const last = alphabet.indexOf(signature[signature.length - 1])
    // A SHA-256 signature has two unused low bits in its last base64 character.
    const alias = `${signature.slice(0, -1)}${alphabet[last + 1]}`
    expect(Buffer.from(alias, 'base64url')).toEqual(Buffer.from(signature, 'base64url'))
    expect(verifyEmailVerificationToken(valid)).not.toBeNull()
    for (const alternate of [alias, `${signature}=`, `${signature}\n`]) {
      expect(verifyEmailVerificationToken(`${payload}.${alternate}`)).toBeNull()
    }
  })
})
