jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  },
}))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() }, setCurrentUserId: jest.fn() }))
jest.mock('@/lib/security/rateLimit', () => ({
  getClientIdentifier: jest.fn(() => 'test-client'),
  rateLimit: jest.fn(async () => ({ allowed: true })),
}))

import { getServerSession } from 'next-auth'
import { db, setCurrentUserId } from '@/lib/db'
import { rateLimit } from '@/lib/security/rateLimit'
import { POST } from './route'

const mockedGetSession = getServerSession as jest.Mock
const mockedQuery = db.query as jest.Mock
const mockedSetCurrentUserId = setCurrentUserId as jest.Mock
const mockedRateLimit = rateLimit as jest.Mock

describe('POST /api/auth/sessions/revoke', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedRateLimit.mockResolvedValue({ allowed: true })
  })

  it('requires an authenticated account and performs no write when signed out', async () => {
    mockedGetSession.mockResolvedValueOnce(null)

    const response = await POST(new Request('https://metardu.test/api/auth/sessions/revoke', { method: 'POST' }))

    expect(response.status).toBe(401)
    expect(mockedQuery).not.toHaveBeenCalled()
  })

  it('increments only the authenticated user version', async () => {
    mockedGetSession.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mockedQuery.mockResolvedValueOnce({ rows: [{ session_version: '8' }] })

    const response = await POST(new Request('https://metardu.test/api/auth/sessions/revoke', { method: 'POST' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mockedSetCurrentUserId).toHaveBeenCalledWith('user-1')
    expect(mockedQuery).toHaveBeenCalledWith(expect.stringContaining('session_version = session_version + 1'), ['user-1'])
  })

  it('does not write when rate limited', async () => {
    mockedGetSession.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mockedRateLimit.mockResolvedValueOnce({ allowed: false })

    const response = await POST(new Request('https://metardu.test/api/auth/sessions/revoke', { method: 'POST' }))

    expect(response.status).toBe(429)
    expect(mockedQuery).not.toHaveBeenCalled()
  })
})
