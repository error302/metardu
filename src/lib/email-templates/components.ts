/**
 * HTML escaping + reusable email component helpers.
 *
 * Email HTML is rendered without React (it's a string), so we use plain
 * functions returning HTML strings. Each helper escapes its inputs.
 */

/** Escape HTML special characters in user-supplied strings. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A primary CTA button (orange). */
export function PrimaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:6px;background-color:#D17B47;">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 32px;color:#0a0a0f;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.01em;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`
}

/** A secondary CTA button (outline). */
export function SecondaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
    <tr>
      <td style="border-radius:6px;border:1px solid #2a2a35;">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 28px;color:#e5e5e5;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`
}

/** Section heading (h2). */
export function Heading(text: string): string {
  return `<h2 style="margin:0 0 16px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(text)}</h2>`
}

/** Paragraph. */
export function Paragraph(text: string, opts: { muted?: boolean; small?: boolean } = {}): string {
  const color = opts.muted ? '#8a8a96' : '#cccccc'
  const fontSize = opts.small ? '13px' : '15px'
  return `<p style="margin:0 0 16px;color:${color};font-size:${fontSize};line-height:1.65;">${escapeHtml(text)}</p>`
}

/** Paragraph that allows inline HTML (for bold tags, links). */
export function RichParagraph(html: string, opts: { muted?: boolean; small?: boolean } = {}): string {
  const color = opts.muted ? '#8a8a96' : '#cccccc'
  const fontSize = opts.small ? '13px' : '15px'
  return `<p style="margin:0 0 16px;color:${color};font-size:${fontSize};line-height:1.65;">${html}</p>`
}

/** Unordered list. */
export function List(items: string[]): string {
  const itemsHtml = items
    .map(
      (item) =>
        `<li style="margin-bottom:8px;color:#cccccc;font-size:15px;line-height:1.5;">${item}</li>`,
    )
    .join('')
  return `<ul style="margin:0 0 20px;padding-left:22px;color:#cccccc;">${itemsHtml}</ul>`
}

/** Inline emphasis (orange). */
export function Accent(text: string): string {
  return `<strong style="color:#D17B47;font-weight:600;">${escapeHtml(text)}</strong>`
}

/** Inline link. */
export function Link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:#D17B47;text-decoration:none;">${escapeHtml(label)}</a>`
}

/** Divider line. */
export function Divider(): string {
  return `<hr style="margin:24px 0;border:none;border-top:1px solid #1f1f2a;">`
}

/** Info callout box. */
export function CalloutBox(title: string, bodyHtml: string, opts: { tone?: 'info' | 'warning' | 'danger' } = {}): string {
  const tone = opts.tone ?? 'info'
  const colors = {
    info: { bg: 'rgba(209, 123, 71, 0.06)', border: 'rgba(209, 123, 71, 0.3)', title: '#D17B47' },
    warning: { bg: 'rgba(250, 204, 21, 0.06)', border: 'rgba(250, 204, 21, 0.3)', title: '#facc15' },
    danger: { bg: 'rgba(248, 113, 113, 0.06)', border: 'rgba(248, 113, 113, 0.3)', title: '#f87171' },
  }[tone]
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;background-color:${colors.bg};border:1px solid ${colors.border};border-radius:8px;">
    <tr><td style="padding:16px 20px;">
      <p style="margin:0 0 6px;color:${colors.title};font-size:13px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;">${escapeHtml(title)}</p>
      <p style="margin:0;color:#cccccc;font-size:14px;line-height:1.55;">${bodyHtml}</p>
    </td></tr>
  </table>`
}

/** Statistic row (label + value). */
export function StatRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#8a8a96;font-size:13px;">${escapeHtml(label)}</td>
    <td style="padding:8px 0;text-align:right;color:#ffffff;font-size:15px;font-weight:600;font-family:ui-monospace,SFMono-Regular,monospace;">${escapeHtml(value)}</td>
  </tr>`
}

/** Wrap stat rows in a clean table. */
export function StatTable(rowsHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-top:1px solid #1f1f2a;border-bottom:1px solid #1f1f2a;">${rowsHtml}</table>`
}
