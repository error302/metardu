/** @jest-environment node */

import { createSign, generateKeyPairSync } from 'crypto'
import { crc32 } from 'zlib'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { POST } from '../route'

jest.mock('@/lib/db', () => ({
  db: { query: jest.fn(), getClient: jest.fn() },
  setCurrentRlsServiceRole: jest.fn(),
  setCurrentUserId: jest.fn(),
  setRlsContext: jest.fn(),
}))

jest.mock('@/lib/payments/paypal', () => ({ getPayPalService: jest.fn() }))
jest.mock('@/lib/email-templates', () => ({ sendTemplatedEmail: jest.fn() }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }))

const mockedQuery = db.query as jest.Mock

describe('PayPal recurring subscription webhooks', () => {
  const previousWebhookId = process.env.PAYPAL_WEBHOOK_ID

  afterEach(() => {
    jest.restoreAllMocks()
    mockedQuery.mockReset()
    if (previousWebhookId === undefined) delete process.env.PAYPAL_WEBHOOK_ID
    else process.env.PAYPAL_WEBHOOK_ID = previousWebhookId
  })

  it('extends the matching METARDU subscription after a signed renewal event', async () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    const subscriptionId = 'I-PAYPAL-RECURRING-001'
    const webhookId = 'WH-METARDU-TEST'
    const transmissionId = 'transmission-001'
    const transmissionTime = new Date().toISOString()
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const body = JSON.stringify({
      id: 'WH-EVENT-001',
      event_type: 'PAYMENT.SALE.COMPLETED',
      resource: { id: 'SALE-001', billing_agreement_id: subscriptionId },
    })
    const crc = crc32(Buffer.from(body)) >>> 0
    const signedMessage = `${transmissionId}|${transmissionTime}|${webhookId}|${crc}`
    const signer = createSign('sha256')
    signer.update(signedMessage)
    signer.end()
    const transmissionSignature = signer.sign(privateKey, 'base64')

    process.env.PAYPAL_WEBHOOK_ID = webhookId
    mockedQuery.mockImplementation(async (query: string) => {
      if (query.includes('metardu_payment_owner_for_provider_key')) return { rows: [{ user_id: userId }] }
      if (query.includes('SELECT ph.user_id FROM payment_history')) return { rows: [{ user_id: userId }] }
      return { rows: [], rowCount: 1 }
    })
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => publicKeyPem,
    } as Response)

    const request = new NextRequest('https://metardu.space/api/webhooks/paypal', {
      method: 'POST',
      headers: {
        'paypal-transmission-id': transmissionId,
        'paypal-transmission-time': transmissionTime,
        'paypal-cert-url': 'https://api-m.paypal.com/v1/notifications/certs/CERT-TEST',
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-transmission-sig': transmissionSignature,
      },
      body,
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("current_period_end = NOW() + INTERVAL '30 days'"),
      [userId],
    )
  })
})
