/** @jest-environment node */
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn() }, setCurrentUserId: jest.fn() }))
jest.mock('@/lib/email-templates', () => ({ sendTemplatedEmail: jest.fn() }))
jest.mock('@/lib/security/rateLimit', () => ({ rateLimit: async () => ({ allowed: true }) }))
jest.mock('@/lib/auth/emailVerification', () => ({
  createEmailVerificationToken: jest.fn(() => 'signed-verification-token'),
}))

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { sendTemplatedEmail } from '@/lib/email-templates'
import { mr } from '@/test-utils/mock-rows'
import { POST } from '../route'

const USER_ID = '5ff471be-c485-4d9b-afb2-24b6ec4ee5e4'
const USER_EMAIL = 'survey.team+new@fieldmail.example'
const mockGetServerSession = getServerSession as jest.Mock
const mockQuery = db.query as jest.Mock
const mockSend = sendTemplatedEmail as jest.Mock

describe('POST /api/auth/register-complete', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: USER_ID, email: 'stale-session@example.test', name: 'Field Team' } })
    mockQuery
      .mockResolvedValueOnce(mr([{ email: USER_EMAIL, full_name: 'Road Survey Team', email_verified: false }]))
      .mockResolvedValueOnce(mr([{ trial_ends_at: '2026-10-28T00:00:00Z' }]))
    mockSend.mockResolvedValue({ success: true })
  })

  it('waits for a branded verification send to the account email and reports success', async () => {
    const response = await POST(new NextRequest('http://localhost/api/auth/register-complete', { method: 'POST' }))
    const body: unknown = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, verificationEmailSent: true, welcomeEmailSent: true })
    expect(mockSend).toHaveBeenCalledWith('emailVerification', expect.objectContaining({
      to: USER_EMAIL,
      name: 'Road Survey Team',
    }))
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO user_subscriptions"), expect.any(Array))
  })

  it('keeps onboarding and sign-in available when the mail provider rejects delivery', async () => {
    mockSend.mockReset()
    mockSend
      .mockResolvedValueOnce({ success: false, error: 'Provider unavailable' })
      .mockResolvedValueOnce({ success: true })

    const response = await POST(new NextRequest('http://localhost/api/auth/register-complete', { method: 'POST' }))
    const body: unknown = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, verificationEmailSent: false, welcomeEmailSent: true })
    expect(mockSend).toHaveBeenNthCalledWith(1, 'emailVerification', expect.objectContaining({ to: USER_EMAIL }))
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO user_subscriptions"), expect.any(Array))
  })

  it('preserves an existing subscription and does not issue another trial welcome email', async () => {
    mockQuery.mockReset()
      .mockResolvedValueOnce(mr([{ email: USER_EMAIL, full_name: 'Road Survey Team', email_verified: true }]))
      .mockResolvedValueOnce(mr([]))
    const response = await POST(new NextRequest('http://localhost/api/auth/register-complete', { method: 'POST' }))
    expect(response.status).toBe(200)
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (user_id) DO NOTHING'), expect.any(Array))
    expect(mockSend).not.toHaveBeenCalled()
  })
})
