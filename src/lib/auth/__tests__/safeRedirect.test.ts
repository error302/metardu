import { safeRedirectPath } from '../safeRedirect'

describe('safeRedirectPath', () => {
  it('preserves internal route paths and encoded OAuth query values', () => {
    const path = '/connect/chatgpt/authorize?redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcallback&state=a%2Fb'
    expect(safeRedirectPath(path)).toBe(path)
  })

  it.each([
    'https://example.com/steal-session',
    '//example.com/path',
    '/\\\\example.com/path',
    'dashboard',
    '/dashboard\nhttps://example.com',
  ])('falls back for unsafe redirect %s', (value) => {
    expect(safeRedirectPath(value)).toBe('/dashboard')
  })

  it('does not decode an already-parsed query value a second time', () => {
    const path = '/connect/chatgpt/authorize?resource=https%3A%2F%2Fmetardu.space'
    expect(safeRedirectPath(path)).toBe(path)
  })
})
