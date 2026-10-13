/** @jest-environment node */
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() }, setCurrentUserId: jest.fn() }))
jest.mock('@/lib/auth/emailVerification', () => ({ verifyEmailVerificationToken: jest.fn() }))

import { NextRequest } from 'next/server'
import { db, setCurrentUserId } from '@/lib/db'
import { verifyEmailVerificationToken } from '@/lib/auth/emailVerification'
import { mr } from '@/test-utils/mock-rows'
import { POST } from '../route'

const USER_ID = '5ff471be-c485-4d9b-afb2-24b6ec4ee5e4'
const mockQuery = db.query as jest.Mock
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
    mockQuery.mockResolvedValueOnce(mr([{ id: USER_ID }]))

    const response = await POST(request({ token: 'signed-token' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ verified: true })
    expect(setCurrentUserId).toHaveBeenCalledWith(USER_ID)
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1 AND email = $2'), [USER_ID, 'survey.team+road@example.com'])
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
})
