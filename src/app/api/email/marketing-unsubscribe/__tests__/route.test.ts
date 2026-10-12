/** @jest-environment node */
jest.mock('@/lib/db', () => ({
  db: { transaction: jest.fn() },
  setCurrentUserId: jest.fn(),
}))

import { db, setCurrentUserId } from '@/lib/db'
import { createMarketingUnsubscribeToken } from '@/lib/auth/marketingUnsubscribe'
import { mr } from '@/test-utils/mock-rows'
import { makeRequest } from '@/test-utils/request'
import { POST } from '../route'

const USER_ID = 'fbc7bf84-c8d6-4b78-9f12-b14801e9da8f'
const EMAIL = 'person@example.com'
const mockTransaction = db.transaction as jest.Mock

describe('POST /api/email/marketing-unsubscribe', () => {
  const originalAuthSecret = process.env.AUTH_SECRET

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.AUTH_SECRET = 'test-secret-with-at-least-thirty-two-characters'
  })

  afterAll(() => {
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = originalAuthSecret
  })

  it('revokes only marketing preference and records the consent withdrawal', async () => {
    const client = { query: jest.fn().mockResolvedValue(mr([])) }
    const clientCalls = client.query.mock.calls as unknown as Array<[string, unknown[]?]>
    client.query.mockResolvedValueOnce(mr([{ email: EMAIL }]))
    mockTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback(client))
    const token = createMarketingUnsubscribeToken(USER_ID, EMAIL)

    const response = await POST(makeRequest(`/api/email/marketing-unsubscribe?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('You are unsubscribed')
    expect(setCurrentUserId).toHaveBeenCalledWith(USER_ID)
    expect(client.query).toHaveBeenCalledTimes(3)
    expect(clientCalls[1][0]).toContain("jsonb_build_object('marketing', false)")
    expect(clientCalls[2][0]).toContain("consent_type, granted, revoked_at, version")
    expect(clientCalls[2][1]).toEqual([USER_ID])
  })

  it('does not change an account if the signed email no longer matches', async () => {
    const client = { query: jest.fn().mockResolvedValue(mr([{ email: 'changed@example.com' }])) }
    mockTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback(client))
    const token = createMarketingUnsubscribeToken(USER_ID, EMAIL)

    const response = await POST(makeRequest(`/api/email/marketing-unsubscribe?token=${encodeURIComponent(token)}`, { method: 'POST' }))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('This link is no longer valid')
    expect(client.query).toHaveBeenCalledTimes(1)
  })
})
