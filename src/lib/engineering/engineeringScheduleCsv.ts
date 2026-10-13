/** Numeric measurements stay numeric; textual labels are inert in spreadsheets. */
export function engineeringScheduleCsv(headers: string[], rows: unknown[][]): string {
  const cell = (value: unknown): string => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new RangeError('Schedule measurements must be finite; invalid values are not exported as zero.')
    let text = value == null ? '' : String(value)
    if (typeof value !== 'number' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  return [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')
}
