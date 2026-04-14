import 'server-only'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { WebhookPayload, WebhookEvent, WEBHOOK_SIGNATURE_HEADER } from './types'

export async function dispatchWebhook(
  event: WebhookEvent,
  data: Record<string, unknown>,
  options?: { userId?: string; projectId?: string }
): Promise<{ delivered: number; failed: number }> {
  const supabaseAdmin = await createClient()
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
    userId: options?.userId,
    projectId: options?.projectId
  }

  const result = await supabaseAdmin
    .from('webhooks')
    .select('*')
    .eq('active', true)
    .contains('events', [event])

  const webhooks = (result as any).data
  const error = (result as any).error

  if (error || !webhooks || webhooks.length === 0) {
    return { delivered: 0, failed: 0 }
  }

  let delivered = 0
  let failed = 0

  for (const webhook of webhooks) {
    try {
      const signature = generateSignature(payload, webhook.secret)

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [WEBHOOK_SIGNATURE_HEADER]: signature
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      })

      if (response.ok) {
        delivered++
        await recordDelivery(webhook.id, event, payload, 'success', response.status)
      } else {
        failed++
        await recordDelivery(webhook.id, event, payload, 'failed', response.status, await response.text())
      }
    } catch {
      failed++
      await recordDelivery(
        webhook.id,
        event,
        payload,
        'failed',
        undefined,
        'Unknown error'
      )
    }
  }

  return { delivered, failed }
}

function generateSignature(payload: WebhookPayload, secret: string): string {
  const raw = JSON.stringify(payload)
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  return `sha256=${digest}`
}

async function recordDelivery(
  webhookId: string,
  event: WebhookEvent,
  payload: WebhookPayload,
  status: 'success' | 'failed',
  responseCode?: number,
  responseBody?: string
) {
  const supabaseAdmin = await createClient()
  await supabaseAdmin.from('webhook_deliveries').insert({
    webhook_id: webhookId,
    event,
    payload,
    status,
    response_code: responseCode,
    response_body: responseBody,
    attempts: 1,
    delivered_at: status === 'success' ? new Date().toISOString() : null
  })
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`
  try {
    const a = Buffer.from(String(signature || ''), 'utf8')
    const b = Buffer.from(expected, 'utf8')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
