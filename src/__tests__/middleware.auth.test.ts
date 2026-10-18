/** @jest-environment node */
jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }))
jest.mock('@/lib/security/rateLimit', () => ({ rateLimit: jest.fn(), RATE_LIMITS: {}, getClientIdentifier: () => 'test-client' }))
jest.mock('@/lib/security/csp', () => ({ generateNonce: () => 'test-nonce', getCspHeaders: () => ({}) }))
jest.mock('@/lib/cors', () => ({ corsHeaders: () => ({}), mcpCorsHeaders: () => ({}) }))
import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { middleware } from '../middleware'

beforeEach(() => {
  jest.mocked(getToken).mockResolvedValue({ id: 'user-id', email: 'crew@example.com' })
})

it('lets a signed-in user request a fresh reset link instead of redirecting away', async () => {
  const response = await middleware(new NextRequest('https://metardu.space/login?recovery=1'))
  expect(response.headers.get('location')).toBeNull()
  expect(response.headers.get('x-middleware-next')).toBe('1')
})

it('keeps sign-in on the browser origin when the application sees an internal host', async () => {
  jest.mocked(getToken).mockResolvedValue(null)
  const response = await middleware(new NextRequest('http://localhost:3021/checkout?plan=pro&currency=USD', {
    headers: { host: '127.0.0.1:3021' },
  }))
  expect(response.status).toBe(307)
  expect(response.headers.get('location')).toBe('http://127.0.0.1:3021/login?next=%2Fcheckout%3Fplan%3Dpro%26currency%3DUSD')
})

it('returns a signed-in crew member to the requested internal workflow', async () => {
  const response = await middleware(new NextRequest('https://metardu.space/login?next=%2Fimport'))
  expect(response.headers.get('location')).toBe('https://metardu.space/import')
})

it('preserves checkout options and refuses a return loop into sign-in', async () => {
  const response = await middleware(new NextRequest('https://metardu.space/login?next=%2Fcheckout%3Fplan%3Dpro%26currency%3DUSD'))
  expect(response.headers.get('location')).toBe('https://metardu.space/checkout?plan=pro&currency=USD')
  const loop = await middleware(new NextRequest('https://metardu.space/login?next=%2Flogin%3Fnext%3D%252Fimport'))
  expect(loop.headers.get('location')).toBe('https://metardu.space/dashboard')
})

it.each(['https://other.example/collect', '//other.example/collect', '/\\other.example/collect'])(
  'rejects an external authenticated return destination: %s', async destination => {
    const response = await middleware(new NextRequest(`https://metardu.space/login?next=${encodeURIComponent(destination)}`))
    expect(response.headers.get('location')).toBe('https://metardu.space/dashboard')
  },
)

it('keeps non-admin redirects on the current browser origin', async () => {
  const response = await middleware(new NextRequest('http://localhost:3021/admin', {
    headers: { host: '127.0.0.1:3021' },
  }))
  expect(response.headers.get('location')).toBe('http://127.0.0.1:3021/dashboard')
})

it('does not reflect arbitrary or credential-bearing hosts into a redirect', async () => {
  jest.mocked(getToken).mockResolvedValue(null)
  for (const host of ['other.example', 'other.example@localhost:3021', 'localhost:3021/other']) {
    const response = await middleware(new NextRequest('http://localhost:3021/fieldbook', { headers: { host } }))
    expect(response.headers.get('location')).toBe('http://localhost:3021/login?next=%2Ffieldbook')
  }
})
