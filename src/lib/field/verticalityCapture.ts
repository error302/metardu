import { evaluateVerticality, type VerticalityStandard, type VerticalityResult } from '@/lib/engineering/verticality'
import { assertProjectedCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { normalizeCaptureTime, type CaptureCoordinates } from './setoutCapture'

export interface VerticalityCriteria extends VerticalityStandard {
  acknowledged: true
  approvedBy: string
}
export interface VerticalityCaptureInput {
  projectId: string
  definitionId: string | null
  label: string
  level: string | null
  horizontalCrs: string
  capturedCrs: string | null
  verticalDatum: string | null
  capturedVerticalDatum: string | null
  capturedAt: string | null
  base: CaptureCoordinates
  top: CaptureCoordinates
  horizontalUncertaintyM: number | null
  heightUncertaintyM: number | null
  criteria: unknown
  instrument: string | null
  notes: string | null
}
export interface VerticalityCaptureSnapshot extends Omit<VerticalityCaptureInput, 'criteria'> {
  schemaVersion: 1
  algorithm: { id: 'metardu.column-plumb'; version: '1' }
  scope: 'numerical_comparison_only'
  criteria: VerticalityCriteria | null
  assessment: Omit<VerticalityResult, 'tiltRatio'> & {
    tiltRatio: number | null
    tiltRatioKind: 'finite' | 'infinite' | 'unknown'
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError('Capture evidence must be an object.')
  return value as Record<string, unknown>
}
function text(value: unknown, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new RangeError('Capture identifiers and references must be non-empty text within their length limit.')
  return value.trim()
}
function optionalText(value: unknown, max = 500): string | null {
  return value == null ? null : text(value, max)
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('Measurements must be finite numeric values.')
  return value
}
function coordinates(value: unknown): CaptureCoordinates {
  const row = record(value)
  return { easting: number(row.easting), northing: number(row.northing), rl: row.rl == null ? null : number(row.rl) }
}
function parseCriteria(value: unknown): VerticalityCriteria | null {
  if (value == null) return null
  const row = record(value)
  if (row.acknowledged !== true) throw new RangeError('Confirm the plumb criteria transcription from the project specification.')
  return { name: text(row.name, 100), reference: text(row.reference), version: text(row.version, 20), maxOffsetM: number(row.maxOffsetM), minTiltRatio: number(row.minTiltRatio), acknowledged: true, approvedBy: text(row.approvedBy, 150) }
}
export function createVerticalityCapture(input: VerticalityCaptureInput): VerticalityCaptureSnapshot {
  const horizontalCrs = assertProjectedCrs(input.horizontalCrs).code
  const capturedCrs = input.capturedCrs == null ? null : assertProjectedCrs(input.capturedCrs).code
  if (capturedCrs && capturedCrs !== horizontalCrs) throw new RangeError('Captured CRS must match the project reference.')
  const verticalDatum = optionalText(input.verticalDatum), capturedVerticalDatum = optionalText(input.capturedVerticalDatum)
  if (verticalDatum && capturedVerticalDatum && verticalDatum !== capturedVerticalDatum) throw new RangeError('Captured height reference must match the project reference.')
  const base = coordinates(input.base), top = coordinates(input.top)
  for (const point of [base, top]) {
    const range = validateCoordinateRange(point.easting, point.northing, horizontalCrs)
    if (!range.valid) throw new RangeError(range.errors.join('; '))
  }
  const heightM = base.rl !== null && top.rl !== null ? top.rl - base.rl : null
  if (heightM !== null && heightM <= 0) throw new RangeError('Top RL must exceed base RL; base-to-top height must be positive.')
  const criteria = parseCriteria(input.criteria), capturedAt = normalizeCaptureTime(input.capturedAt)
  const horizontalUncertaintyM = input.horizontalUncertaintyM == null ? null : number(input.horizontalUncertaintyM)
  const heightUncertaintyM = input.heightUncertaintyM == null ? null : number(input.heightUncertaintyM)
  const evaluated = evaluateVerticality({ baseE: base.easting, baseN: base.northing, topE: top.easting, topN: top.northing, heightM, horizontalUncertaintyM, heightUncertaintyM }, criteria)
  const issues = [...evaluated.issues]
  if (!capturedCrs) issues.push('Captured horizontal reference is not recorded.')
  if (!verticalDatum || !capturedVerticalDatum) issues.push('A common declared and captured height reference is not recorded.')
  if (!capturedAt) issues.push('Device capture time is not recorded.')
  const assessment: VerticalityCaptureSnapshot['assessment'] = {
    ...evaluated, tiltRatio: evaluated.tiltRatio === Infinity ? null : evaluated.tiltRatio,
    tiltRatioKind: evaluated.tiltRatio === null ? 'unknown' : evaluated.tiltRatio === Infinity ? 'infinite' : 'finite',
    issues, result: issues.length ? 'INFO' : evaluated.result, message: issues.length ? issues.join(' ') : evaluated.message,
  }
  return {
    schemaVersion: 1, algorithm: { id: 'metardu.column-plumb', version: '1' }, scope: 'numerical_comparison_only',
    projectId: text(input.projectId), definitionId: optionalText(input.definitionId), label: text(input.label, 40), level: optionalText(input.level, 40),
    horizontalCrs, capturedCrs, verticalDatum, capturedVerticalDatum, capturedAt, base, top, horizontalUncertaintyM, heightUncertaintyM,
    criteria, instrument: optionalText(input.instrument, 150), notes: optionalText(input.notes, 4000), assessment,
  }
}
export function sameVerticalityEvidence(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameVerticalityEvidence(value, right[index]))
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  const a = record(left), b = record(right), keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameVerticalityEvidence(a[key], b[key]))
}
/** Old rows have no snapshot; never synthesize new criteria or rerate old results. */
export function parseVerticalityCapture(value: unknown): VerticalityCaptureSnapshot | null {
  try {
    const row = record(value), algorithm = record(row.algorithm)
    if (row.schemaVersion !== 1 || algorithm.id !== 'metardu.column-plumb' || algorithm.version !== '1' || row.scope !== 'numerical_comparison_only') return null
    const snapshot = createVerticalityCapture(row as unknown as VerticalityCaptureInput)
    return sameVerticalityEvidence(row, snapshot) ? snapshot : null
  } catch { return null }
}
