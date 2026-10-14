/** @jest-environment node */
jest.mock('next-auth/jwt', () => ({ getToken: async () => ({ id: 'user-id', email: 'crew@example.com' }) }))
jest.mock('@/lib/security/rateLimit', () => ({ rateLimit: jest.fn(), RATE_LIMITS: {}, getClientIdentifier: () => 'test-client' }))
jest.mock('@/lib/security/csp', () => ({ generateNonce: () => 'test-nonce', getCspHeaders: () => ({}) }))
jest.mock('@/lib/cors', () => ({ corsHeaders: () => ({}), mcpCorsHeaders: () => ({}) }))
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

it('lets a signed-in user request a fresh reset link instead of redirecting away', async () => {
  const response = await middleware(new NextRequest('https://metardu.space/login?recovery=1'))
  expect(response.headers.get('location')).toBeNull()
  expect(response.headers.get('x-middleware-next')).toBe('1')
})
