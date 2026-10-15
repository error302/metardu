/** @jest-environment node */
jest.mock('next-auth/jwt', () => ({ getToken: async () => null }))
jest.mock('@/lib/security/csp', () => ({ generateNonce: () => 'test-nonce', getCspHeaders: () => ({}) }))
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'
import { RATE_LIMITS } from '@/lib/security/rateLimit'

const originalUrl = process.env.UPSTASH_REDIS_REST_URL
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
})
afterAll(() => {
  if (originalUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = originalUrl
  if (originalToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken
})
const call = (path: string, method: string, ip: string) => middleware(new NextRequest(`https://metardu.space${path}`, { method, headers: { 'x-real-ip': ip } }))

it('does not let routine project requests consume the sign-in allowance', async () => {
  const ip = '192.0.2.91'
  for (let i = 0; i <= RATE_LIMITS.auth.max; i++) {
    expect((await call('/api/project/example/points', 'GET', ip)).status).toBe(200)
  }
  expect((await call('/api/auth/callback/credentials', 'POST', ip)).status).toBe(200)
})

it('still throttles auth posts across endpoints without blocking routine reads', async () => {
  const ip = '192.0.2.92'
  for (let i = 0; i < RATE_LIMITS.auth.max; i++) {
    const path = i % 2 ? '/api/auth/register' : '/api/auth/callback/credentials'
    expect((await call(path, 'POST', ip)).status).toBe(200)
  }
  const blocked = await call('/api/auth/forgot-password', 'POST', ip)
  expect(blocked.status).toBe(429)
  expect(blocked.headers.get('retry-after')).toBeTruthy()
  expect((await call('/api/project/example/points', 'GET', ip)).status).toBe(200)
  expect((await call('/api/auth/session', 'GET', ip)).status).toBe(200)
})
