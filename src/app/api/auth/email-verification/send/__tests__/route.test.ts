/** @jest-environment node */
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() }, setCurrentUserId: jest.fn() }))
jest.mock('@/lib/auth/emailVerification', () => ({ createEmailVerificationToken: jest.fn(() => 'signed-token') }))
jest.mock('@/lib/email-templates', () => ({ sendTemplatedEmail: jest.fn() }))
jest.mock('@/lib/security/rateLimit', () => ({ rateLimit: jest.fn() }))

import { getServerSession } from 'next-auth'
import { db, setCurrentUserId } from '@/lib/db'
import { createEmailVerificationToken } from '@/lib/auth/emailVerification'
import { sendTemplatedEmail } from '@/lib/email-templates'
import { rateLimit } from '@/lib/security/rateLimit'
import { mr } from '@/test-utils/mock-rows'
import { POST } from '../route'

const USER_ID = '5ff471be-c485-4d9b-afb2-24b6ec4ee5e4'
const mockSession = getServerSession as jest.Mock
const mockQuery = db.query as jest.Mock
const mockSend = sendTemplatedEmail as jest.Mock
const mockRateLimit = rateLimit as jest.Mock

describe('POST /api/auth/email-verification/send', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSession.mockResolvedValue({ user: { id: USER_ID, email: 'stale-session@example.test', name: 'Stale Name' } })
    mockQuery.mockResolvedValueOnce(mr([{
      email: 'survey.team+road@example.com',
      full_name: 'Road Survey Team',
      email_verified: false,
    }]))
    mockRateLimit.mockResolvedValue({ allowed: true })
    mockSend.mockResolvedValue({ success: true })
  })

  it('sends to the current account email, not a stale session address', async () => {
    const response = await POST()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ verified: false, sent: true })
    expect(setCurrentUserId).toHaveBeenCalledWith(USER_ID)
    expect(createEmailVerificationToken).toHaveBeenCalledWith(USER_ID, 'survey.team+road@example.com')
    const sendCalls = mockSend.mock.calls as unknown as Array<[
      string,
      { to: string; name: string; verifyUrl: string },
    ]>
    expect(sendCalls[0]?.[0]).toBe('emailVerification')
    expect(sendCalls[0]?.[1]).toMatchObject({ to: 'survey.team+road@example.com', name: 'Road Survey Team' })
    expect(sendCalls[0]?.[1].verifyUrl).toContain('token=signed-token')
  })

  it('does not send a duplicate when the account is already verified', async () => {
    mockQuery.mockReset().mockResolvedValueOnce(mr([{
      email: 'survey.team+road@example.com',
      full_name: 'Road Survey Team',
      email_verified: true,
    }]))

    const response = await POST()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ verified: true, sent: false })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('fails closed when the mail provider rejects delivery', async () => {
    mockSend.mockResolvedValueOnce({ success: false })

    const response = await POST()

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'METARDU could not send the verification email. Please try again later.' })
  })

  it('rate limits repeated resend attempts before querying or sending', async () => {
    mockRateLimit.mockResolvedValueOnce({ allowed: false })

    const response = await POST()

    expect(response.status).toBe(429)
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('returns a recoverable service response when account lookup is unavailable', async () => {
    mockQuery.mockReset().mockRejectedValueOnce(new Error('database unavailable'))
    const response = await POST()
    expect(response.status).toBe(503)
    expect(mockSend).not.toHaveBeenCalled()
  })
})
