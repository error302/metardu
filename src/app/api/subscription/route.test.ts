jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      }),
  },
}))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/subscription/subscriptionEngine', () => ({ getSubscription: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))

import { getServerSession } from 'next-auth'
import { getSubscription } from '@/lib/subscription/subscriptionEngine'
import { GET } from './route'

const mockedGetServerSession = getServerSession as jest.Mock
const mockedGetSubscription = getSubscription as jest.Mock

describe('GET /api/subscription', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns an authentication error instead of an active free payload when signed out', async () => {
    mockedGetServerSession.mockResolvedValueOnce(null)

    const response = await GET()

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'Authentication required', code: 'UNAUTHORIZED' })
    expect(mockedGetSubscription).not.toHaveBeenCalled()
  })

  it('returns the authenticated account subscription, including a valid free account', async () => {
    mockedGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1', email: 'surveyor@example.test' } })
    mockedGetSubscription.mockResolvedValueOnce(null)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ plan: 'free', status: 'active', isAdmin: false })
    expect(mockedGetSubscription).toHaveBeenCalledWith('user-1', 'surveyor@example.test')
  })

  it('returns an unavailable error rather than an active free payload when the subscription service fails', async () => {
    mockedGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1', email: 'surveyor@example.test' } })
    mockedGetSubscription.mockRejectedValueOnce(new Error('database unavailable'))

    const response = await GET()

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      error: 'Subscription status is temporarily unavailable',
      code: 'SUBSCRIPTION_UNAVAILABLE',
    })
  })
})