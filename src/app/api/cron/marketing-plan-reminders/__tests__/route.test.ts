/** @jest-environment node */
jest.mock('@/lib/db', () => ({
  db: { transaction: jest.fn(), query: jest.fn() },
  setCurrentRlsServiceRole: jest.fn(),
}))
jest.mock('@/lib/email-templates', () => ({ sendTemplatedEmail: jest.fn() }))

import { db, setCurrentRlsServiceRole } from '@/lib/db'
import { sendTemplatedEmail } from '@/lib/email-templates'
import { mr } from '@/test-utils/mock-rows'
import { makeRequest } from '@/test-utils/request'
import { POST } from '../route'

const USER_ID = 'fbc7bf84-c8d6-4b78-9f12-b14801e9da8f'
const mockTransaction = db.transaction as jest.Mock
const mockDbQuery = db.query as jest.Mock
const mockSend = sendTemplatedEmail as jest.Mock

describe('POST /api/cron/marketing-plan-reminders', () => {
  const originalEnv = {
    API_ADMIN_KEY: process.env.API_ADMIN_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    AUTH_SECRET: process.env.AUTH_SECRET,
    METARDU_MARKETING_EMAILS_ENABLED: process.env.METARDU_MARKETING_EMAILS_ENABLED,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.API_ADMIN_KEY = 'test-admin-key'
    process.env.RESEND_API_KEY = 're_test'
    process.env.AUTH_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    process.env.METARDU_MARKETING_EMAILS_ENABLED = 'true'
    mockSend.mockResolvedValue({ success: true })
    mockDbQuery.mockResolvedValue(mr([], 1))
  })

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('fails closed while marketing email sending is disabled', async () => {
    process.env.METARDU_MARKETING_EMAILS_ENABLED = 'false'
    const response = await POST(makeRequest('/api/cron/marketing-plan-reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-admin-key' },
    }))

    expect(response.status).toBe(403)
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('previews only a consent-filtered audience count without sending or requiring send configuration', async () => {
    process.env.METARDU_MARKETING_EMAILS_ENABLED = 'false'
    delete process.env.RESEND_API_KEY
    delete process.env.AUTH_SECRET
    mockDbQuery.mockResolvedValueOnce(mr([{ eligible_count: 137 }]))

    const response = await POST(makeRequest('/api/cron/marketing-plan-reminders?dryRun=true', {
      method: 'POST',
      headers: { authorization: 'Bearer test-admin-key' },
    }))
    const body = await response.json() as {
      success: boolean
      dryRun: boolean
      eligibleCount: number
      nextBatchCount: number
      batchLimit: number
      sent: number
    }
    const previewQueryCalls = mockDbQuery.mock.calls as unknown as Array<[string, unknown[]?]>
    const sql = previewQueryCalls[0]?.[0] ?? ''

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      dryRun: true,
      eligibleCount: 137,
      nextBatchCount: 100,
      batchLimit: 100,
      sent: 0,
    })
    expect(Object.keys(body).sort()).toEqual([
      'batchLimit',
      'campaignKey',
      'dryRun',
      'eligibleCount',
      'nextBatchCount',
      'sent',
      'success',
    ])
    expect(sql).toContain("c.consent_type = 'marketing' AND c.granted = true")
    expect(sql).toContain("p.notification_preferences->'email'->>'marketing' = 'true'")
    expect(sql).toContain('u.email_verified = true')
    expect(sql).toContain('d.attempt_count < 3')
    expect(sql).toContain("d.claimed_at < NOW() - interval '10 minutes'")
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sends only the consent-filtered candidate and records a successful monthly touch', async () => {
    const candidate = { user_id: USER_ID, email: 'person@example.com', full_name: 'Ada Surveyor' }
    const client = { query: jest.fn() }
    client.query
      .mockResolvedValueOnce(mr([])) // review attempts outside Resend's retry window
      .mockResolvedValueOnce(mr([candidate])) // eligible opted-in Free account
      .mockResolvedValueOnce(mr([{ user_id: USER_ID }])) // delivery claim
    mockTransaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback(client))
    mockDbQuery.mockResolvedValueOnce(mr([{ eligible: true }]))

    const response = await POST(makeRequest('/api/cron/marketing-plan-reminders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-admin-key' },
    }))
    const body = await response.json() as { success: boolean; eligible: number; sent: number; failed: number; skipped: number }
    const clientCalls = client.query.mock.calls as unknown as Array<[string, unknown[]?]>
    const dbQueryCalls = mockDbQuery.mock.calls as unknown as Array<[string, unknown[]?]>
    const sendCalls = mockSend.mock.calls as unknown as Array<[
      string,
      { to: string; name: string; unsubscribeUrl: string },
      { idempotencyKey: string },
    ]>

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, eligible: 1, sent: 1, failed: 0, skipped: 0 })
    expect(setCurrentRlsServiceRole).toHaveBeenCalledWith('billing_reconciliation')
    const candidateSql = clientCalls[1][0]
    expect(candidateSql).toContain("c.consent_type = 'marketing' AND c.granted = true")
    expect(candidateSql).toContain("p.notification_preferences->'email'->>'marketing' = 'true'")
    expect(candidateSql).toContain('u.email_verified = true')
    expect(candidateSql).toContain("s.status IN ('trial', 'past_due')")
    expect(candidateSql).toContain("d.sent_at > NOW() - interval '30 days'")
    expect(dbQueryCalls[0][0]).toContain('AS eligible')
    expect(sendCalls).toHaveLength(1)
    expect(sendCalls[0][0]).toBe('planReminder')
    expect(sendCalls[0][1]).toMatchObject({ to: candidate.email, name: candidate.full_name })
    expect(sendCalls[0][1].unsubscribeUrl).toContain('/api/email/marketing-unsubscribe?token=')
    expect(sendCalls[0][2].idempotencyKey).toMatch(/^plan-nudge-\d{4}-\d{2}\//)
    expect(dbQueryCalls[1]).toEqual([
      expect.stringContaining("SET status = $3, sent_at = CASE WHEN $3 = 'sent'"),
      [USER_ID, expect.stringMatching(/^plan-nudge-\d{4}-\d{2}$/), 'sent'],
    ])
  })
})
