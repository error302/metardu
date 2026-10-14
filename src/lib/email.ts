import nodemailer from 'nodemailer'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { logger } from '@/lib/logger'

// Accept both names used by the checked-in deployment examples. Keeping the
// alias here prevents a configured SMTP_PASSWORD from silently disabling all
// branded onboarding, password-reset, and payment emails.
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com'
const smtpPort = Number(process.env.SMTP_PORT) || 465
const smtpUser = process.env.SMTP_USER
const smtpPassword = process.env.SMTP_PASS || process.env.SMTP_PASSWORD
const resendApiKey = process.env.RESEND_API_KEY

export function resolveDefaultFrom(options: {
  resendFromEmail?: string
  emailFrom?: string
  smtpUser?: string
}): string {
  // Prefer the provider-specific sender when Resend is configured. This keeps
  // an old generic EMAIL_FROM value from silently replacing the verified,
  // branded sender selected for transactional mail.
  return options.resendFromEmail || options.emailFrom || (options.smtpUser ? `"METARDU" <${options.smtpUser}>` : 'METARDU <noreply@metardu.space>')
}

const defaultFrom = resolveDefaultFrom({
  resendFromEmail: process.env.RESEND_FROM_EMAIL,
  emailFrom: process.env.EMAIL_FROM,
  smtpUser,
})
const defaultReplyTo = process.env.EMAIL_REPLY_TO || process.env.SUPPORT_EMAIL || smtpUser || defaultFrom

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  auth: {
    user: smtpUser,
    pass: smtpPassword,
  },
})

export interface SendEmailOptions {
  to: string
  subject: string
  text?: string
  html?: string
  /** Optional Reply-To address — defaults to EMAIL_REPLY_TO, SUPPORT_EMAIL, or the SMTP user. */
  replyTo?: string
  /** Optional custom "from" address — defaults to the SMTP user. */
  from?: string
  /** Optional message headers (e.g. for List-Unsubscribe). */
  headers?: Record<string, string>
  /** Provider-side duplicate-send protection for retryable mail. */
  idempotencyKey?: string
}

function getInlineBrandMark(html?: string): Buffer | null {
  if (!html?.includes('cid:metardu-email-mark')) return null
  try {
    return readFileSync(resolve(process.cwd(), 'public', 'metardu-email-mark.png'))
  } catch (error) {
    logger.warn('[email] Branded email mark is unavailable; sending the text wordmark only.', { error })
    return null
  }
}

export async function sendEmail({ to, subject, text, html, replyTo, from, headers, idempotencyKey }: SendEmailOptions) {
  if (!resendApiKey && (!smtpUser || !smtpPassword)) {
    logger.warn(`[email] Email service not configured. Would have sent "${subject}" to ${to}`)
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const inlineBrandMark = getInlineBrandMark(html)
    if (resendApiKey) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: from || defaultFrom,
          to: [to],
          reply_to: replyTo || defaultReplyTo,
          subject,
          text,
          html,
          headers,
          ...(inlineBrandMark ? {
            attachments: [{
              filename: 'metardu-email-mark.png',
              content: inlineBrandMark.toString('base64'),
              content_type: 'image/png',
              content_id: 'metardu-email-mark',
            }],
          } : {}),
        }),
      })
      if (!response.ok) {
        throw new Error(`Resend returned HTTP ${response.status}`)
      }
      const info: unknown = await response.json().catch(() => ({}))
      return { success: true, info }
    }

    const info = await transporter.sendMail({
      from: from || defaultFrom,
      to,
      replyTo: replyTo || defaultReplyTo,
      subject,
      text,
      html,
      headers,
      attachments: inlineBrandMark ? [{
        filename: 'metardu-email-mark.png',
        content: inlineBrandMark,
        contentType: 'image/png',
        cid: 'metardu-email-mark',
      }] : undefined,
    })
    return { success: true, info }
  } catch (error) {
    logger.error('[email] Error sending email:', { error: error })
    return { success: false, error }
  }
}
