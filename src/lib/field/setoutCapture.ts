import { assertProjectedCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { DEFAULT_SETOUT_TOLERANCE, DEFAULT_SETOUT_TOLERANCE_VERSION, evaluateSetoutShot, type SetoutShotResult } from '@/lib/engineering/verticality'
import { resolveSetoutToleranceProfile, type SetoutToleranceProfileSnapshot } from '@/lib/engineering/setoutToleranceProfile'

export interface CaptureCoordinates { easting: number; northing: number; rl: number | null }
export interface SetoutCaptureInput {
  projectId: string; definitionId: string; pointId: string; pointLabel: string; designRevision: number;
  horizontalCrs: string; definitionCrs: string | null; deviceCrs: string | null; verticalDatum: string | null;
  capturedAt: string | null; design: CaptureCoordinates; capturedDesign: CaptureCoordinates; observed: CaptureCoordinates;
  reportedAccuracyM: number | null; profile: SetoutToleranceProfileSnapshot | null;
}
export interface SetoutCaptureSnapshot extends Omit<SetoutCaptureInput, 'profile'> {
  schemaVersion: 1;
  algorithm: { id: 'metardu.setout-shot'; version: '1' };
  horizontalCrsEvidence: 'device_and_definition' | 'server_context_only';
  captureTimeSource: 'device_reported' | 'not_provided';
  tolerance: { horizontalM: number; verticalM: number; version: string; source: 'project_profile_transcription' | 'metardu_default'; profile: SetoutToleranceProfileSnapshot | null };
  assessment: SetoutShotResult;
}

export function normalizeCaptureTime(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new RangeError('Capture time must be an ISO timestamp with a timezone.')
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!parts) throw new RangeError('Capture time must include a full date, time, and timezone.')
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number)
  const lastDay = new Date(0)
  lastDay.setUTCFullYear(year, month, 0)
  const instant = Date.parse(value)
  if (month < 1 || month > 12 || day < 1 || day > lastDay.getUTCDate() || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(instant)) {
    throw new RangeError('Capture time is not a valid calendar timestamp.')
  }
  return new Date(instant).toISOString()
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError('Invalid capture evidence object.')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new RangeError('Capture evidence identifiers must be non-empty text.')
  return value
}
function optionalText(value: unknown): string | null {
  if (value == null) return null
  return text(value)
}
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('Capture measurements must be finite numbers.')
  return value
}
function coordinates(value: unknown): CaptureCoordinates {
  const row = object(value)
  return { easting: finite(row.easting), northing: finite(row.northing), rl: row.rl === null ? null : finite(row.rl) }
}
function profileFrom(value: unknown): SetoutToleranceProfileSnapshot | null {
  if (value === null) return null
  const row = object(value)
  const profile = resolveSetoutToleranceProfile({
    id: row.id, name: row.name, jurisdiction: row.jurisdiction, version: row.version,
    rules: { acknowledged: true, effectiveDate: row.effectiveDate, source: row.source, approvedBy: row.approvedBy,
      setout: { horizontalM: row.horizontalM, verticalM: row.verticalM } },
  })
  if (!profile) throw new RangeError('Capture tolerance profile is incomplete or invalid.')
  return profile
}

/** Persist server-assessed original numbers, not formatted/rounded table values. */
export function createSetoutCaptureSnapshot(input: SetoutCaptureInput): SetoutCaptureSnapshot {
  return buildSnapshot(input)
}
function buildSnapshot(input: SetoutCaptureInput, storedTolerance?: SetoutCaptureSnapshot['tolerance']): SetoutCaptureSnapshot {
  const horizontalCrs = assertProjectedCrs(input.horizontalCrs).code
  const definitionCrs = input.definitionCrs == null ? null : assertProjectedCrs(input.definitionCrs).code
  const deviceCrs = input.deviceCrs == null ? null : assertProjectedCrs(input.deviceCrs).code
  if ((definitionCrs != null && definitionCrs !== horizontalCrs) || (deviceCrs != null && deviceCrs !== horizontalCrs)) {
    throw new RangeError('The captured and definition CRS must match the project CRS.')
  }
  if (!Number.isSafeInteger(input.designRevision) || input.designRevision < 1) throw new RangeError('Capture design revision must be a positive integer.')
  const design = coordinates(input.design)
  const observed = coordinates(input.observed)
  const capturedDesign = coordinates(input.capturedDesign)
  for (const point of [design, observed, capturedDesign]) {
    const range = validateCoordinateRange(point.easting, point.northing, horizontalCrs)
    if (!range.valid) throw new RangeError(range.errors.join('; '))
  }
  const profile = profileFrom(input.profile)
  const horizontalM = storedTolerance?.horizontalM ?? profile?.horizontalM ?? DEFAULT_SETOUT_TOLERANCE.horizontalM
  const verticalM = storedTolerance?.verticalM ?? profile?.verticalM ?? DEFAULT_SETOUT_TOLERANCE.verticalM
  const reportedAccuracyM = input.reportedAccuracyM === null ? null : finite(input.reportedAccuracyM)
  const assessment = evaluateSetoutShot({ designE: design.easting, designN: design.northing, designZ: design.rl,
    observedE: observed.easting, observedN: observed.northing, observedZ: observed.rl }, { horizontalM, verticalM, accuracyM: reportedAccuracyM })
  const capturedAt = normalizeCaptureTime(input.capturedAt)
  return {
    schemaVersion: 1, algorithm: { id: 'metardu.setout-shot', version: '1' },
    projectId: text(input.projectId), definitionId: text(input.definitionId), pointId: text(input.pointId),
    pointLabel: text(input.pointLabel), designRevision: input.designRevision,
    horizontalCrs, definitionCrs, deviceCrs, verticalDatum: optionalText(input.verticalDatum),
    horizontalCrsEvidence: deviceCrs && definitionCrs ? 'device_and_definition' : 'server_context_only',
    capturedAt, captureTimeSource: capturedAt ? 'device_reported' : 'not_provided',
    design, observed, capturedDesign, reportedAccuracyM,
    tolerance: { horizontalM, verticalM, version: storedTolerance?.version ?? profile?.version ?? DEFAULT_SETOUT_TOLERANCE_VERSION,
      source: profile ? 'project_profile_transcription' : 'metardu_default', profile }, assessment,
  }
}

/** Unknown versions or inconsistent stored evidence fail closed; never upgrade a legacy row. */
export function parseSetoutCaptureSnapshot(value: unknown): SetoutCaptureSnapshot | null {
  try {
    const row = object(value)
    const algorithm = object(row.algorithm)
    const tolerance = object(row.tolerance)
    if (row.schemaVersion !== 1 || algorithm.id !== 'metardu.setout-shot' || algorithm.version !== '1') return null
    const savedProfile = profileFrom(tolerance.profile)
    const savedTolerance: SetoutCaptureSnapshot['tolerance'] = {
      horizontalM: finite(tolerance.horizontalM), verticalM: finite(tolerance.verticalM), version: text(tolerance.version),
      source: savedProfile ? 'project_profile_transcription' : 'metardu_default', profile: savedProfile,
    }
    if (savedProfile && (savedProfile.horizontalM !== savedTolerance.horizontalM || savedProfile.verticalM !== savedTolerance.verticalM || savedProfile.version !== savedTolerance.version)) return null
    const snapshot = buildSnapshot({
      projectId: text(row.projectId), definitionId: text(row.definitionId), pointId: text(row.pointId), pointLabel: text(row.pointLabel),
      designRevision: finite(row.designRevision), horizontalCrs: text(row.horizontalCrs),
      definitionCrs: optionalText(row.definitionCrs), deviceCrs: optionalText(row.deviceCrs), verticalDatum: optionalText(row.verticalDatum),
      capturedAt: optionalText(row.capturedAt), design: coordinates(row.design), capturedDesign: coordinates(row.capturedDesign),
      observed: coordinates(row.observed), reportedAccuracyM: row.reportedAccuracyM === null ? null : finite(row.reportedAccuracyM),
      profile: savedProfile,
    }, savedTolerance)
    if (row.horizontalCrsEvidence !== snapshot.horizontalCrsEvidence || row.captureTimeSource !== snapshot.captureTimeSource
      || tolerance.horizontalM !== snapshot.tolerance.horizontalM || tolerance.verticalM !== snapshot.tolerance.verticalM
      || tolerance.version !== snapshot.tolerance.version || tolerance.source !== snapshot.tolerance.source) return null
    const recorded = object(row.assessment)
    if (recorded.result !== snapshot.assessment.result || typeof recorded.message !== 'string') return null
    for (const key of ['dE', 'dN', 'dZ', 'moveE', 'moveN', 'moveZ', 'horizontalErrorM', 'verticalErrorM', 'distanceToTargetM'] as const) {
      const actual = snapshot.assessment[key]
      if (actual === null ? recorded[key] !== null : typeof recorded[key] !== 'number' || !Number.isFinite(recorded[key]) || Math.abs(actual - recorded[key]) > 1e-12) return null
    }
    snapshot.assessment.message = recorded.message
    return snapshot
  } catch { return null }
}
