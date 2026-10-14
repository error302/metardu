/** @jest-environment node */
import { resolveDefaultFrom } from '../email'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('resolveDefaultFrom', () => {
  it('uses the Resend-specific branded sender ahead of the generic sender', () => {
    expect(resolveDefaultFrom({
      resendFromEmail: 'METARDU <noreply@metardu.space>',
      emailFrom: 'old-sender@example.com',
      smtpUser: 'smtp@example.com',
    })).toBe('METARDU <noreply@metardu.space>')
  })

  it('keeps the generic sender as the fallback when Resend is not configured', () => {
    expect(resolveDefaultFrom({ emailFrom: 'METARDU <noreply@metardu.space>' }))
      .toBe('METARDU <noreply@metardu.space>')
  })

  it('uses the branded METARDU sender when no sender settings are provided', () => {
    expect(resolveDefaultFrom({})).toBe('METARDU <noreply@metardu.space>')
  })
})

describe('Resend branded email delivery', () => {
  it('embeds the METARDU mark as a CID attachment instead of depending on the public image URL', async () => {
    const oldApiKey = process.env.RESEND_API_KEY
    const oldFrom = process.env.RESEND_FROM_EMAIL
    const oldFetch = global.fetch
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email-test-id' }),
    })
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.RESEND_FROM_EMAIL = 'METARDU <noreply@metardu.space>'
    global.fetch = fetchMock as unknown as typeof fetch

    try {
      jest.resetModules()
      const { sendEmail } = await import('../email')
      const html = '<img src="cid:metardu-email-mark" alt="METARDU">'
      const result = await sendEmail({ to: 'owner@example.com', subject: 'Verification test', html })

      expect(result.success).toBe(true)
      const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(request.signal).toBeDefined()
      const requestBody = JSON.parse(String(request.body)) as {
        html: string
        attachments: Array<{ filename: string; content: string; content_type: string; content_id: string }>
      }
      const [logo] = requestBody.attachments
      const expectedLogo = readFileSync(resolve(process.cwd(), 'public', 'metardu-email-mark.png'))

      expect(requestBody.html).toContain('cid:metardu-email-mark')
      expect(logo).toEqual({
        filename: 'metardu-email-mark.png',
        content: expectedLogo.toString('base64'),
        content_type: 'image/png',
        content_id: 'metardu-email-mark',
      })
    } finally {
      global.fetch = oldFetch
      if (oldApiKey === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = oldApiKey
      if (oldFrom === undefined) delete process.env.RESEND_FROM_EMAIL
      else process.env.RESEND_FROM_EMAIL = oldFrom
    }
  })
})
