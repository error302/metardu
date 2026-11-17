/**
 * Capture-time fix verdict.
 *
 * The GNSS quality gate already existed but was display/export only: a point
 * could be stored with an autonomous GPS fix and nothing on screen said so. A
 * crew cannot re-walk a boundary from memory, so the verdict is stated at the
 * moment of capture and recorded with the point.
 *
 * Thresholds mirror the ones the field GNSS report uses (RTK Fixed required for
 * cadastral; HDOP < 2 and ≥ 6 satellites before the fix is treated as usable).
 */

export type FixVerdict = 'rtk-fixed' | 'rtk-float' | 'dgps' | 'single' | 'no-fix' | 'total-station'

export interface FixAssessment {
  verdict: FixVerdict
  /** Short label for the field badge, e.g. 'RTK Fixed'. */
  label: string
  /** Good enough for cadastral boundary work (deed plans, beacons). */
  cadastralGrade: boolean
  /** Good enough to keep working with (topographic / navigation). */
  usable: boolean
  /** One-line summary shown next to the capture button. */
  detail: string
  /** Everything that stands between this fix and survey grade. */
  reasons: string[]
}

export interface FixReading {
  source: 'nmea' | 'gsi' | 'manual'
  quality?: number
  hdop?: number
  satellites?: number
}

const NMEA_VERDICTS: Record<number, FixVerdict> = {
  0: 'no-fix',
  1: 'single',
  2: 'dgps',
  4: 'rtk-fixed',
  5: 'rtk-float',
}

const LABELS: Record<FixVerdict, string> = {
  'rtk-fixed': 'RTK Fixed',
  'rtk-float': 'RTK Float',
  dgps: 'DGPS',
  single: 'Autonomous GPS',
  'no-fix': 'No fix',
  'total-station': 'Total station',
}

/** Token stored with the point so the office can see how it was fixed. */
export function verdictToken(verdict: FixVerdict): string {
  return verdict.toUpperCase().replace(/-/g, '_')
}

export function assessFieldFix(reading: FixReading | null | undefined): FixAssessment {
  if (!reading) {
    return {
      verdict: 'no-fix',
      label: LABELS['no-fix'],
      cadastralGrade: false,
      usable: false,
      detail: 'No instrument reading yet',
      reasons: ['No reading has arrived from the instrument.'],
    }
  }

  // Optical observations do not carry a GNSS fix: judging them by HDOP would be
  // meaningless, so they are reported as what they are.
  if (reading.source !== 'nmea') {
    return {
      verdict: 'total-station',
      label: LABELS['total-station'],
      cadastralGrade: true,
      usable: true,
      detail: 'Optical observation — GNSS fix quality does not apply',
      reasons: [],
    }
  }

  const reasons: string[] = []
  const verdict: FixVerdict = reading.quality === undefined
    ? 'single'
    : NMEA_VERDICTS[reading.quality] ?? 'single'

  if (reading.quality === undefined) {
    reasons.push('The receiver did not report a fix type.')
  } else if (!NMEA_VERDICTS[reading.quality]) {
    reasons.push(`Unrecognised receiver fix code ${reading.quality} — treat this point as not survey grade.`)
  }

  if (verdict === 'no-fix') reasons.push('The receiver has no position fix.')
  if (verdict === 'single') reasons.push('Autonomous GPS positions are metres out — not survey grade.')
  if (verdict === 'rtk-float') reasons.push('RTK Float has not resolved the ambiguities yet; wait for Fixed before boundary work.')

  const hdop = typeof reading.hdop === 'number' && Number.isFinite(reading.hdop) && reading.hdop > 0 ? reading.hdop : undefined
  if (hdop === undefined) reasons.push('HDOP was not reported by the receiver.')
  else if (hdop >= 2) reasons.push(`HDOP ${hdop.toFixed(1)} is above the 2.0 working limit.`)

  const satellites = typeof reading.satellites === 'number' && Number.isFinite(reading.satellites) && reading.satellites > 0 ? reading.satellites : undefined
  if (satellites === undefined) reasons.push('Satellite count was not reported by the receiver.')
  else if (satellites < 6) reasons.push(`Only ${satellites} satellites — at least 6 are needed.`)

  const cadastralGrade = verdict === 'rtk-fixed'
    && (hdop === undefined || hdop < 2)
    && (satellites === undefined || satellites >= 6)

  const usable = cadastralGrade || verdict === 'rtk-float' || verdict === 'dgps'

  const parts = [LABELS[verdict]]
  if (hdop !== undefined) parts.push(`HDOP ${hdop.toFixed(1)}`)
  if (satellites !== undefined) parts.push(`${satellites} sats`)

  return {
    verdict,
    label: LABELS[verdict],
    cadastralGrade,
    usable,
    detail: parts.join(' · '),
    reasons,
  }
}
