/**
 * Branded email layout for METARDU transactional emails.
 *
 * Used by every template in src/lib/email-templates/*. Provides:
 *   - Branded header (orange METARDU wordmark + tagline)
 *   - Plain content area (dark surface in dark-mode clients, light in others)
 *   - Footer with help and privacy links, plus optional notification settings
 *
 * All styles are inline — required because Gmail, Outlook, and Yahoo strip
 * <style> tags. Only table-based layouts + inline CSS render reliably.
 */

import { escapeHtml } from './components'

export interface EmailBranding {
  appName: string
  tagline: string
  brandColor: string
  brandColorDim: string
  supportEmail?: string
  appUrl: string
  year: number
}

const BRANDING: EmailBranding = {
  appName: 'METARDU',
  tagline: 'Survey software built for Kenya',
  brandColor: '#D17B47',
  brandColorDim: '#c66e15',
  supportEmail: process.env.SUPPORT_EMAIL,
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.space',
  year: new Date().getFullYear(),
}

/**
 * A small, static PNG works in more email clients than SVG/WebP and avoids
 * embedding a large data URI that some clients strip from messages.
 */
const LOGO_SRC: string = (() => {
  try {
    const appUrl = new URL(BRANDING.appUrl)
    if (appUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(appUrl.hostname)) {
      return 'https://metardu.space/metardu-email-mark.png'
    }
    return new URL('/metardu-email-mark.png', appUrl).toString()
  } catch {
    return 'https://metardu.space/metardu-email-mark.png'
  }
})()

export interface LayoutOptions {
  /** Email-specific title shown when the message is opened in a browser. */
  title?: string
  /** Optional preheader text shown in inbox preview (~85 chars max). */
  preheader?: string
  /** Optional notification settings URL for digest emails. */
  notificationSettingsUrl?: string
  /** Show notification settings for optional digest or marketing emails. */
  showNotificationSettings?: boolean
  /** Direct signed opt-out link for a marketing email. */
  unsubscribeUrl?: string
}

/**
 * Render an email body inside the branded METARDU layout.
 *
 * @param bodyHtml Inner HTML — already-escaped content (use components below)
 * @param opts Optional layout options (preheader, unsubscribe)
 * @returns Complete HTML document ready for `sendEmail({ html })`
 */
export function renderEmailLayout(
  bodyHtml: string,
  opts: LayoutOptions = {},
): string {
  const notificationSettingsUrl = opts.notificationSettingsUrl || `${BRANDING.appUrl}/settings/profile`
  const showNotificationSettings = opts.showNotificationSettings === true
  const preheaderHtml = opts.preheader
    ? `<div lang="en" dir="ltr" style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}</div>`
    : ''

  const notificationSettingsLink = showNotificationSettings
    ? `<a href="${escapeHtml(notificationSettingsUrl)}" style="color:#F0A06B;text-decoration:underline;">Manage notifications</a>`
    : ''
  const unsubscribeLink = opts.unsubscribeUrl
    ? `<a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#F0A06B;text-decoration:underline;">Unsubscribe from product and plan emails</a>`
    : ''
  const supportMessage = BRANDING.supportEmail
    ? `If you need help, email <a href="mailto:${escapeHtml(BRANDING.supportEmail)}" style="color:#F0A06B;text-decoration:underline;">${escapeHtml(BRANDING.supportEmail)}</a>.`
    : `If you need help, visit <a href="${escapeHtml(BRANDING.appUrl)}/help" style="color:#F0A06B;text-decoration:underline;">the METARDU Help Centre</a>.`

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(opts.title || opts.preheader || 'Email from METARDU')}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">
  ${preheaderHtml}
  <table lang="en" dir="ltr" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;min-height:100vh;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#0a0a0f;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 22px;text-align:center;background-color:#0a0a0f;border-bottom:1px solid #1f1f2a;">
              <img src="${escapeHtml(LOGO_SRC)}" alt="" role="presentation" width="56" height="56" style="display:block;margin:0 auto 10px;border-radius:12px;" />
              <p style="margin:0;color:${BRANDING.brandColor};font-size:26px;font-weight:800;letter-spacing:-0.02em;">METARDU</p>
              <p style="margin:6px 0 0;color:#a1a1aa;font-size:13px;letter-spacing:0.01em;">${escapeHtml(BRANDING.tagline)}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 8px;background-color:#0a0a0f;color:#e5e5e5;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 28px;background-color:#0a0a0f;border-top:1px solid #1f1f2a;">
              <p style="margin:0 0 8px;color:#a1a1aa;font-size:13px;line-height:1.6;">
                This message was sent by METARDU. ${supportMessage}
              </p>
              <p style="margin:0 0 4px;color:#a1a1aa;font-size:12px;line-height:1.6;">
                ${notificationSettingsLink}
                ${showNotificationSettings ? '&nbsp;&middot;&nbsp;' : ''}
                ${unsubscribeLink}
                ${unsubscribeLink ? '&nbsp;&middot;&nbsp;' : ''}
                <a href="${escapeHtml(BRANDING.appUrl)}/docs/privacy" style="color:#F0A06B;text-decoration:underline;">Privacy</a>
                &nbsp;&middot;&nbsp;
                <a href="${escapeHtml(BRANDING.appUrl)}/help" style="color:#F0A06B;text-decoration:underline;">Help Centre</a>
              </p>
              <p style="margin:8px 0 0;color:#a1a1aa;font-size:12px;line-height:1.6;">
                &copy; ${BRANDING.year} METARDU. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export { BRANDING }
