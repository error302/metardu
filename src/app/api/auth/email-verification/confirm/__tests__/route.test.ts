/** @jest-environment node */
const mockQuery = jest.fn()
jest.mock('@/lib/db', () => ({ db: { transaction: (run: (client: {query: typeof mockQuery}) => unknown) => run({query: mockQuery}) }, setCurrentUserId: jest.fn() }))
jest.mock('@/lib/email-templates', () => ({ sendTemplatedEmail: jest.fn(async () => ({ success: true })) }))
jest.mock('@/lib/auth/emailVerification', () => ({ verifyEmailVerificationToken: jest.fn() }))

import { NextRequest } from 'next/server'
import { setCurrentUserId } from '@/lib/db'
import { verifyEmailVerificationToken } from '@/lib/auth/emailVerification'
import { mr } from '@/test-utils/mock-rows'
import { POST } from '../route'

const USER_ID = '5ff471be-c485-4d9b-afb2-24b6ec4ee5e4'
const mockVerifyToken = verifyEmailVerificationToken as jest.Mock

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/email-verification/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/email-verification/confirm', () => {
  beforeEach(() => jest.clearAllMocks())

  it('verifies only the account and address bound into the signed token', async () => {
    mockVerifyToken.mockReturnValue({ sub: USER_ID, email: 'survey.team+road@example.com', exp: 1_900_000_000 })
    mockQuery.mockResolvedValueOnce(mr([{ id: USER_ID }])).mockResolvedValueOnce(mr([{ trial_ends_at: new Date('2026-12-13T00:00:00Z') }]))

    const response = await POST(request({ token: 'signed-token' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ verified: true, trialStarted: true })
    expect(setCurrentUserId).toHaveBeenCalledWith(USER_ID)
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1 AND email = $2'), [USER_ID, 'survey.team+road@example.com'])
    expect(mockQuery).toHaveBeenCalledWith('SELECT public.metardu_activate_verified_trial() AS trial_ends_at')
  })

  it('accepts a repeat verification without restarting a trial', async () => {
    mockVerifyToken.mockReturnValue({ sub: USER_ID, email: 'crew@example.com' })
    mockQuery.mockResolvedValueOnce(mr([{ id: USER_ID }])).mockResolvedValueOnce(mr([{ trial_ends_at: null }]))
    expect(await (await POST(request({ token: 'signed-token' }))).json()).toEqual({ verified: true, trialStarted: false })
  })

  it('rejects invalid tokens without touching the database', async () => {
    mockVerifyToken.mockReturnValue(null)

    const response = await POST(request({ token: 'expired-or-forged' }))

    expect(response.status).toBe(400)
    expect(mockQuery).not.toHaveBeenCalled()
    expect(setCurrentUserId).not.toHaveBeenCalled()
  })

  it('rejects a signed address that no longer matches the account', async () => {
    mockVerifyToken.mockReturnValue({ sub: USER_ID, email: 'previous@example.com', exp: 1_900_000_000 })
    mockQuery.mockResolvedValueOnce(mr([]))

    const response = await POST(request({ token: 'signed-token' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'This verification link no longer matches your account.' })
  })

  it('reports a recoverable outage instead of leaving verification without a response', async () => {
    mockVerifyToken.mockReturnValue({ sub: USER_ID, email: 'crew@example.com', exp: 1_900_000_000 })
    mockQuery.mockRejectedValueOnce(new Error('database unavailable'))
    expect((await POST(request({ token: 'signed-token' }))).status).toBe(503)
  })
})
