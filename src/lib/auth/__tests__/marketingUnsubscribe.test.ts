import { createMarketingUnsubscribeToken, verifyMarketingUnsubscribeToken } from '../marketingUnsubscribe'

const USER_ID = 'fbc7bf84-c8d6-4b78-9f12-b14801e9da8f'

describe('marketing unsubscribe token', () => {
  const originalAuthSecret = process.env.AUTH_SECRET
  const originalNextAuthSecret = process.env.NEXTAUTH_SECRET

  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    delete process.env.NEXTAUTH_SECRET
  })

  afterAll(() => {
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalAuthSecret
    if (originalNextAuthSecret === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = originalNextAuthSecret
  })

  it('binds a durable unsubscribe token to one account and normalized email address', () => {
    const token = createMarketingUnsubscribeToken(USER_ID, ' Person@Example.com ')
    expect(verifyMarketingUnsubscribeToken(token)).toEqual({
      sub: USER_ID,
      email: 'person@example.com',
      v: 1,
    })
  })

  it('rejects altered, malformed, and overlong tokens', () => {
    const token = createMarketingUnsubscribeToken(USER_ID, 'person@example.com')
    expect(verifyMarketingUnsubscribeToken(`${token}x`)).toBeNull()
    expect(verifyMarketingUnsubscribeToken('not-a-token')).toBeNull()
    expect(verifyMarketingUnsubscribeToken('x'.repeat(4097))).toBeNull()
  })

  it('requires an application signing secret', () => {
    delete process.env.AUTH_SECRET
    expect(() => createMarketingUnsubscribeToken(USER_ID, 'person@example.com')).toThrow('AUTH_SECRET or NEXTAUTH_SECRET')
  })
})
