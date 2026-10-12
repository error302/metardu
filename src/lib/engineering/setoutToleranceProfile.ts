/** Project-issued setting-out tolerances and their approval provenance. */
export interface SetoutToleranceProfileDraft {
  name: string
  jurisdiction: string
  version: string
  horizontalMm: string
  verticalMm: string
  effectiveDate: string
  source: string
  approvedBy: string
  acknowledged: boolean
}

export interface SetoutToleranceProfileValues {
  name: string
  jurisdiction: string
  version: string
  horizontalM: number
  verticalM: number
  effectiveDate: string
  source: string
  approvedBy: string
}

export interface SetoutToleranceProfileSnapshot extends SetoutToleranceProfileValues {
  id: string
}

export const EMPTY_SETOUT_TOLERANCE_PROFILE: SetoutToleranceProfileDraft = {
  name: '',
  jurisdiction: '',
  version: '',
  horizontalMm: '',
  verticalMm: '',
  effectiveDate: '',
  source: '',
  approvedBy: '',
  acknowledged: false,
}

export interface ParsedSetoutToleranceProfile {
  provided: boolean
  profile: SetoutToleranceProfileValues | null
  issues: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function positiveMillimetres(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Blank form data means "no profile"; a partly filled profile is an error. */
export function parseSetoutToleranceProfileDraft(value: unknown): ParsedSetoutToleranceProfile {
  if (value == null) return { provided: false, profile: null, issues: [] }
  if (!isRecord(value)) {
    return { provided: true, profile: null, issues: ['Set-out tolerance profile must be an object.'] }
  }

  const name = text(value.name)
  const jurisdiction = text(value.jurisdiction)
  const version = text(value.version)
  const horizontalMm = positiveMillimetres(value.horizontalMm)
  const verticalMm = positiveMillimetres(value.verticalMm)
  const effectiveDate = text(value.effectiveDate)
  const source = text(value.source)
  const approvedBy = text(value.approvedBy)
  const acknowledged = value.acknowledged === true
  const provided = [name, jurisdiction, version, value.horizontalMm, value.verticalMm, effectiveDate, source, approvedBy]
    .some((field) => field !== undefined && field !== null && String(field).trim() !== '')

  if (!provided && !acknowledged) return { provided: false, profile: null, issues: [] }

  const issues: string[] = []
  if (!name) issues.push('Enter a tolerance profile name.')
  if (name.length > 100) issues.push('Tolerance profile name must be 100 characters or fewer.')
  if (!jurisdiction) issues.push('Enter the client, contract, or jurisdiction this tolerance profile applies to.')
  if (jurisdiction.length > 100) issues.push('Tolerance profile jurisdiction must be 100 characters or fewer.')
  if (!version) issues.push('Enter the issued tolerance profile version or revision.')
  if (version.length > 20) issues.push('Tolerance profile version must be 20 characters or fewer.')
  if (horizontalMm == null) issues.push('Enter a finite positive horizontal tolerance in millimetres.')
  if (verticalMm == null) issues.push('Enter a finite positive vertical tolerance in millimetres.')
  if (!isCalendarDate(effectiveDate)) issues.push('Enter a valid tolerance effective date (YYYY-MM-DD).')
  if (!source) issues.push('Enter the drawing, specification, or contract reference for these tolerances.')
  if (source.length > 500) issues.push('Tolerance source reference must be 500 characters or fewer.')
  if (!approvedBy) issues.push('Enter the responsible approver named by the project documents.')
  if (approvedBy.length > 150) issues.push('Approver name must be 150 characters or fewer.')
  if (!acknowledged) issues.push('Confirm these values were transcribed from the approved project requirement.')

  if (issues.length > 0 || horizontalMm == null || verticalMm == null) {
    return { provided: true, profile: null, issues }
  }

  return {
    provided: true,
    profile: {
      name,
      jurisdiction,
      version,
      horizontalM: horizontalMm / 1000,
      verticalM: verticalMm / 1000,
      effectiveDate,
      source,
      approvedBy,
    },
    issues: [],
  }
}

/** Store criteria and who transcribed them in the profile's immutable rule snapshot. */
export function serializeSetoutToleranceRules(
  profile: SetoutToleranceProfileValues,
  recordedBy: string,
  recordedAt: string,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    setout: {
      horizontalM: profile.horizontalM,
      verticalM: profile.verticalM,
      unit: 'm',
    },
    effectiveDate: profile.effectiveDate,
    source: profile.source,
    approvedBy: profile.approvedBy,
    transcribedBy: recordedBy,
    transcribedAt: recordedAt,
    acknowledged: true,
  }
}

/** Fail closed when an older, unrelated, or malformed tolerance profile is attached. */
export function resolveSetoutToleranceProfile(
  value: unknown,
): SetoutToleranceProfileSnapshot | null {
  if (!isRecord(value)) return null
  const rules = value.rules
  if (!isRecord(rules) || rules.acknowledged !== true || !isRecord(rules.setout)) return null

  const setout = rules.setout
  const horizontalM = typeof setout.horizontalM === 'number' ? setout.horizontalM : Number.NaN
  const verticalM = typeof setout.verticalM === 'number' ? setout.verticalM : Number.NaN
  const id = text(value.id)
  const name = text(value.name)
  const jurisdiction = text(value.jurisdiction)
  const version = text(value.version)
  const effectiveDate = text(rules.effectiveDate)
  const source = text(rules.source)
  const approvedBy = text(rules.approvedBy)

  if (!id || !name || !jurisdiction || !version || !effectiveDate || !isCalendarDate(effectiveDate)
    || !source || !approvedBy || !Number.isFinite(horizontalM) || horizontalM <= 0
    || !Number.isFinite(verticalM) || verticalM <= 0) return null

  return { id, name, jurisdiction, version, horizontalM, verticalM, effectiveDate, source, approvedBy }
}
