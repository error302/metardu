/**
 * Shared formatting helpers used by both HTML and text email templates.
 * Pure functions — no DOM access, no date libraries.
 */

/** Format an ISO date string as a friendly long date (e.g. "14 March 2026"). */
export function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

/** Format an ISO date string as a date + time (e.g. "14 Mar 2026, 15:30 EAT"). */
export function formatDateTime(iso: string, tzLabel = 'EAT'): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const date = d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    const time = d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return `${date}, ${time} ${tzLabel}`
  } catch {
    return iso
  }
}

/** Format a monetary amount with currency code. */
export function formatCurrency(amount: number, currency: string): string {
  if (typeof amount !== 'number' || !isFinite(amount)) return ''
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: currency || 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** Truncate a string at a max length, adding an ellipsis if truncated. */
export function truncate(value: string, max: number): string {
  if (!value) return ''
  if (value.length <= max) return value
  return value.slice(0, Math.max(0, max - 1)).trimEnd() + '…'
}

/** Initials from a full name (e.g. "John Mwangi" → "JM"). */
export function initials(name: string): string {
  if (!name) return ''
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')
}
