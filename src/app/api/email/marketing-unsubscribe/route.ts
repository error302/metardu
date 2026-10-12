import { NextRequest, NextResponse } from 'next/server'
import { verifyMarketingUnsubscribeToken } from '@/lib/auth/marketingUnsubscribe'
import { db, setCurrentUserId } from '@/lib/db'

export const dynamic = 'force-dynamic'

function htmlPage(title: string, message: string, formAction?: string): NextResponse {
  const button = formAction
    ? `<form method="post" action="${escapeHtml(formAction)}"><button type="submit" style="border:0;border-radius:8px;background:#d17b47;color:#111;padding:12px 18px;font-weight:700;cursor:pointer">Unsubscribe</button></form>`
    : ''
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · METARDU</title><body style="margin:0;background:#f4f4f5;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5"><main style="box-sizing:border-box;max-width:560px;margin:10vh auto;padding:32px;background:#0a0a0f;border:1px solid #272733;border-radius:14px"><p style="margin:0 0 22px;color:#d17b47;font-size:22px;font-weight:800;letter-spacing:.03em">METARDU</p><h1 style="margin:0 0 12px;font-size:26px">${escapeHtml(title)}</h1><p style="margin:0 0 24px;color:#c4c4cc">${escapeHtml(message)}</p>${button}<p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">Account and payment emails are not affected. <a href="https://metardu.space/help" style="color:#f0a06b">METARDU Help Centre</a></p></main></body></html>`
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  })
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }
  return value.replace(/[&<>"']/g, (char) => replacements[char] ?? char)
}

function verifiedPayload(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  return verifyMarketingUnsubscribeToken(token)
}

export async function GET(request: NextRequest) {
  const payload = verifiedPayload(request)
  if (!payload) return htmlPage('This link is not valid', 'Please open the most recent METARDU product email or manage your preferences from your account settings.')

  const action = `/api/email/marketing-unsubscribe?token=${encodeURIComponent(request.nextUrl.searchParams.get('token') || '')}`
  return htmlPage('Manage product emails', 'You can stop product news and plan offers here. This does not affect project, security, or billing messages.', action)
}

export async function POST(request: NextRequest) {
  let token = request.nextUrl.searchParams.get('token') || ''
  if (!token) {
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData().catch(() => null)
      token = String(form?.get('token') || '')
    } else if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => null) as { token?: unknown } | null
      token = typeof body?.token === 'string' ? body.token : ''
    }
  }

  const payload = verifyMarketingUnsubscribeToken(token)
  if (!payload) return htmlPage('This link is not valid', 'Please open the most recent METARDU product email or manage your preferences from your account settings.')

  setCurrentUserId(payload.sub)
  try {
    const updated = await db.transaction(async (client) => {
      const account = await client.query<{ email: string }>(
        'SELECT email FROM users WHERE id = $1 LIMIT 1',
        [payload.sub],
      )
      if (!account.rows[0] || account.rows[0].email.toLowerCase() !== payload.email) return false

      await client.query<never>(
        `UPDATE profiles
         SET notification_preferences = COALESCE(notification_preferences, '{}'::jsonb)
           || jsonb_build_object('email', COALESCE(notification_preferences->'email', '{}'::jsonb)
             || jsonb_build_object('marketing', false)),
             notification_preferences_updated_at = NOW()
         WHERE id = $1`,
        [payload.sub],
      )
      await client.query<never>(
        `INSERT INTO user_consents (user_id, consent_type, granted, revoked_at, version)
         VALUES ($1, 'marketing', false, NOW(), 'mkt-v1')
         ON CONFLICT (user_id, consent_type)
         DO UPDATE SET granted = false, revoked_at = NOW(), version = 'mkt-v1'`,
        [payload.sub],
      )
      return true
    })

    return updated
      ? htmlPage('You are unsubscribed', 'You will no longer receive METARDU product news and plan offers. Account, security, and payment emails will continue.')
      : htmlPage('This link is no longer valid', 'The email address attached to this link has changed. Please manage preferences from your account settings.')
  } catch {
    return htmlPage('We could not update your preferences', 'Please try again shortly or contact the METARDU Help Centre.')
  }
}
