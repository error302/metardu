import { verticalCurve, type VerticalCurveInput, type VerticalCurveRow } from '@/lib/computations/roadDesignEngine'
import { toCSV } from '@/lib/export/helpers'

function point(row: VerticalCurveRow) {
  return [row.isBVC && 'BVC', row.isEVC && 'EVC', row.isPeak && 'HIGH POINT', row.isSag && 'LOW POINT'].filter(Boolean).join(' | ')
}

export function verticalCurveDraftCsv(input: VerticalCurveInput): string {
  const result = verticalCurve(input)
  return toCSV([
    'Chainage_m', 'RL_m', 'X_from_BVC_m', 'Offset_from_incoming_tangent_m', 'Grade_percent', 'Point',
    'VPI_chainage_m', 'VPI_RL_m', 'Incoming_grade_percent', 'Outgoing_grade_percent', 'Length_m', 'K_m_per_percent',
    'K_status', 'Length_authority', 'Requested_length_m', 'Requested_K_m_per_percent', 'Sampling_interval_m',
    'Model', 'Draft_status', 'Standard_compliance', 'Vertical_datum_status',
  ], result.rows.map(row => [row.chainage, row.rl, row.x, row.y, row.grade, point(row),
    input.vpiChainage, input.vpiRL, input.g1, input.g2, result.L, result.K ?? '',
    result.K === null ? 'UNDEFINED_EQUAL_GRADES' : 'DEFINED', input.curveLength === undefined ? 'K' : 'L',
    input.curveLength ?? '', input.kValue ?? '', input.interval ?? 20,
    'symmetric-parabolic', 'LOCAL_CALCULATION_DRAFT', 'NOT_ASSESSED', 'NOT_VERIFIED',
  ].map(String)))
}
