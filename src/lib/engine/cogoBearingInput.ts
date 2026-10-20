export type CogoBearingFormat = 'decimal' | 'packed-dms'

/** Bearings are grid-relative clockwise angles; their notation is explicit. */
export function parseCogoBearing(input: string, format: CogoBearingFormat): number | null {
  const value = input.trim()
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric > 360) return null
  if (format === 'decimal') return numeric
  const [degreeText, fraction = ''] = value.split('.')
  if (fraction.length > 4) return null
  const digits = fraction.padEnd(4, '0')
  const degrees = Number(degreeText)
  const minutes = Number(digits.slice(0, 2))
  const seconds = Number(digits.slice(2, 4))
  if (minutes >= 60 || seconds >= 60 || (degrees === 360 && (minutes || seconds))) return null
  return degrees + minutes / 60 + seconds / 3600
}
