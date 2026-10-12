/** @jest-environment node */
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: { transaction: jest.fn(), query: jest.fn() },
  setCurrentUserId: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { mr } from '@/test-utils/mock-rows'
import { makeRequest } from '@/test-utils/request'
import { PATCH } from '../route'

const USER_ID = 'fbc7bf84-c8d6-4b78-9f12-b14801e9da8f'
const mockGetServerSession = getServerSession as jest.Mock
const mockTransaction = db.transaction as jest.Mock
const mockDbQuery = db.query as jest.Mock

describe('PATCH /api/profile/settings marketing consent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: USER_ID, email: 'person@example.com' } })
    mockDbQuery.mockResolvedValue(mr([{ notification_preferences: { email: { marketing: true } } }]))
  })

  it('records a marketing grant only when the user explicitly sends the consent decision', async () => {
    const client = { query: jest.fn().mockResolvedValue(mr([], 1)) }
    const clientCalls = client.query.mock.calls as unknown as Array<[string, unknown[]?]>
    mockTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback(client))

    const response = await PATCH(makeRequest('/api/profile/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: {
        notification_preferences: { email: { marketing: true } },
        marketingConsent: true,
      },
    }))

    expect(response.status).toBe(200)
    expect(client.query).toHaveBeenCalledTimes(2)
    expect(clientCalls[1][0]).toContain("'marketing', true, NOW(), NULL, 'mkt-v1'")
    expect(clientCalls[1][1]).toEqual([USER_ID])
  })

  it('does not turn an unrelated notification save into marketing consent', async () => {
    const client = { query: jest.fn().mockResolvedValue(mr([], 1)) }
    const clientCalls = client.query.mock.calls as unknown as Array<[string, unknown[]?]>
    mockTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback(client))

    const response = await PATCH(makeRequest('/api/profile/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: { notification_preferences: { email: { weekly_digest: false } } },
    }))

    expect(response.status).toBe(200)
    expect(client.query).toHaveBeenCalledTimes(1)
    expect(clientCalls[0][0]).toContain('UPDATE profiles SET')
  })

  it('rejects a preference update that conflicts with the explicit consent value', async () => {
    const response = await PATCH(makeRequest('/api/profile/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: {
        notification_preferences: { email: { marketing: false } },
        marketingConsent: true,
      },
    }))

    expect(response.status).toBe(422)
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
