/** @jest-environment node */

import { createSign, generateKeyPairSync, type KeyObject } from 'crypto'
import { crc32 } from 'zlib'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { sendTemplatedEmail } from '@/lib/email-templates'
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
const mockedSendEmail = sendTemplatedEmail as jest.Mock

function signedRequest(event: Record<string, unknown>, privateKey: KeyObject): NextRequest {
  const webhookId = 'WH-METARDU-TEST'
  const transmissionId = `transmission-${Math.random().toString(36).slice(2)}`
  const transmissionTime = new Date().toISOString()
  const body = JSON.stringify(event)
  const crc = crc32(Buffer.from(body)) >>> 0
  const signer = createSign('sha256')
  signer.update(`${transmissionId}|${transmissionTime}|${webhookId}|${crc}`)
  signer.end()

  return new NextRequest('https://metardu.space/api/webhooks/paypal', {
    method: 'POST',
    headers: {
      'paypal-transmission-id': transmissionId,
      'paypal-transmission-time': transmissionTime,
      'paypal-cert-url': 'https://api-m.paypal.com/v1/notifications/certs/CERT-TEST',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': signer.sign(privateKey, 'base64'),
    },
    body,
  })
}

describe('PayPal recurring subscription webhooks', () => {
  const previousWebhookId = process.env.PAYPAL_WEBHOOK_ID

  beforeEach(() => {
    process.env.PAYPAL_WEBHOOK_ID = 'WH-METARDU-TEST'
    mockedSendEmail.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    mockedQuery.mockReset()
    mockedSendEmail.mockReset()
    if (previousWebhookId === undefined) delete process.env.PAYPAL_WEBHOOK_ID
    else process.env.PAYPAL_WEBHOOK_ID = previousWebhookId
  })

  it('records each completed sale once and extends the subscription for a renewal', async () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    const subscriptionId = 'I-PAYPAL-RECURRING-001'
    const paymentTime = new Date()
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const event = {
      id: 'WH-EVENT-RENEWAL-001',
      create_time: paymentTime.toISOString(),
      event_type: 'PAYMENT.SALE.COMPLETED',
      resource: {
        id: 'SALE-RENEWAL-001',
        billing_agreement_id: subscriptionId,
        amount: { value: '35.00', currency_code: 'USD' },
        create_time: paymentTime.toISOString(),
      },
    }
    const periodStart = new Date(paymentTime.getTime() - 30 * 24 * 60 * 60 * 1000)
    let recordedSaleCount = 0
    let renewalSql = ''
    let renewalValues: unknown[] = []

    mockedQuery.mockImplementation(async (query: string, values?: unknown[]) => {
      if (query.includes('metardu_payment_owner_for_provider_key')) return { rows: [{ user_id: userId }] }
      if (query.includes('SELECT ph.user_id, ph.plan_id, ph.amount, ph.currency')) {
        return { rows: [{
          user_id: userId,
          plan_id: 'team',
          amount: '35.00',
          currency: 'USD',
          current_period_start: periodStart.toISOString(),
          current_period_end: paymentTime.toISOString(),
        }] }
      }
      if (query.includes('WITH recorded AS')) {
        recordedSaleCount += 1
        renewalSql = query
        renewalValues = values ?? []
        return { rows: recordedSaleCount === 1 ? [{ user_id: userId, period_extended: true }] : [] }
      }
      if (query.includes('SELECT email, full_name')) return { rows: [{ email: 'member@example.com', full_name: 'METARDU Member' }] }
      return { rows: [], rowCount: 1 }
    })
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => publicKeyPem,
    } as Response)

    const response = await POST(signedRequest(event, privateKey))
    const replayResponse = await POST(signedRequest(event, privateKey))

    expect(response.status).toBe(200)
    expect(replayResponse.status).toBe(200)
    expect(recordedSaleCount).toBe(2)
    expect(renewalSql).toContain('ON CONFLICT (provider_id) DO NOTHING')
    expect(renewalSql).toContain("INTERVAL '30 days'")
    expect(renewalValues).toEqual(expect.arrayContaining([
      userId,
      35,
      'USD',
      'paypal-sale:SALE-RENEWAL-001',
      'SALE-RENEWAL-001',
      'team',
      expect.any(String),
      true,
    ]))
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedSendEmail).toHaveBeenCalledWith('paymentReceipt', expect.objectContaining({
      to: 'member@example.com',
      transactionId: 'SALE-RENEWAL-001',
      paymentMethod: 'PayPal',
    }))
  })

  it('records the initial subscription sale without granting a second billing period', async () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    const subscriptionId = 'I-PAYPAL-RECURRING-002'
    const paymentTime = new Date()
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    let renewalValues: unknown[] = []
    const event = {
      id: 'WH-EVENT-INITIAL-001',
      create_time: paymentTime.toISOString(),
      event_type: 'PAYMENT.SALE.COMPLETED',
      resource: {
        id: 'SALE-INITIAL-001',
        billing_agreement_id: subscriptionId,
        amount: { value: '19.00', currency_code: 'USD' },
        create_time: paymentTime.toISOString(),
      },
    }

    mockedQuery.mockImplementation(async (query: string, values?: unknown[]) => {
      if (query.includes('metardu_payment_owner_for_provider_key')) return { rows: [{ user_id: userId }] }
      if (query.includes('SELECT ph.user_id, ph.plan_id, ph.amount, ph.currency')) {
        return { rows: [{
          user_id: userId,
          plan_id: 'pro',
          amount: '19.00',
          currency: 'USD',
          current_period_start: paymentTime.toISOString(),
          current_period_end: new Date(paymentTime.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }] }
      }
      if (query.includes('WITH recorded AS')) {
        renewalValues = values ?? []
        return { rows: [{ user_id: userId, period_extended: false }] }
      }
      if (query.includes('SELECT email, full_name')) return { rows: [{ email: 'member@example.com', full_name: 'METARDU Member' }] }
      return { rows: [], rowCount: 1 }
    })
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => publicKeyPem,
    } as Response)

    const response = await POST(signedRequest(event, privateKey))
    expect(response.status).toBe(200)
    expect(renewalValues[7]).toBe(false)
    expect(mockedSendEmail).toHaveBeenCalledWith('paymentReceipt', expect.objectContaining({ transactionId: 'SALE-INITIAL-001' }))
  })

  it('records a failed billing attempt once, emails the owner, and leaves access to PayPal state', async () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    const subscriptionId = 'I-PAYPAL-RECURRING-003'
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const event = {
      id: 'WH-EVENT-FAILED-001',
      create_time: new Date().toISOString(),
      event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
      resource: { id: subscriptionId },
    }
    let insertCount = 0

    mockedQuery.mockImplementation(async (query: string) => {
      if (query.includes('metardu_payment_owner_for_provider_key')) return { rows: [{ user_id: userId }] }
      if (query.includes('SELECT ph.user_id, ph.plan_id, ph.amount, ph.currency')) {
        return { rows: [{
          user_id: userId,
          plan_id: 'firm',
          amount: '69.00',
          currency: 'USD',
          current_period_start: null,
          current_period_end: null,
        }] }
      }
      if (query.includes('INSERT INTO payment_history')) {
        insertCount += 1
        return { rows: insertCount === 1 ? [{ id: 'failure-row-1' }] : [] }
      }
      if (query.includes('SELECT email, full_name')) return { rows: [{ email: 'member@example.com', full_name: 'METARDU Member' }] }
      return { rows: [], rowCount: 1 }
    })
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => publicKeyPem,
    } as Response)

    const firstResponse = await POST(signedRequest(event, privateKey))
    const replayResponse = await POST(signedRequest(event, privateKey))

    expect(firstResponse.status).toBe(200)
    expect(replayResponse.status).toBe(200)
    expect(insertCount).toBe(2)
    expect(mockedQuery.mock.calls.some(([query]) => typeof query === 'string' && query.includes('UPDATE user_subscriptions'))).toBe(false)
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedSendEmail).toHaveBeenCalledWith('paymentFailed', expect.objectContaining({
      to: 'member@example.com',
      planName: 'firm',
      amount: 69,
    }))
  })
})
