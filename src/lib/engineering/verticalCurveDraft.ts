import { verticalCurve, type VerticalCurveInput, type VerticalCurveRow } from '@/lib/computations/roadDesignEngine'
import { generateEngineeringSchedulePdf } from './engineeringSchedulePdf'

function point(row: VerticalCurveRow) {
  return [row.isBVC && 'BVC', row.isEVC && 'EVC', row.isPeak && 'HIGH POINT', row.isSag && 'LOW POINT'].filter(Boolean).join(' | ')
}

export function verticalCurveDraftPdf(input: VerticalCurveInput, generatedAt = new Date()): Uint8Array {
  const result = verticalCurve(input)
  return generateEngineeringSchedulePdf({
    title: 'Vertical curve - local calculation draft', projectName: 'No project assigned (local draft)',
    coordinateReference: 'Caller-supplied stationing and levels; vertical datum NOT VERIFIED', generatedAt,
    sections: [
      { title: 'Supplied inputs', headers: ['Parameter', 'Value'], rows: [
        ['Incoming grade (%)', String(input.g1)], ['Outgoing grade (%)', String(input.g2)],
        ['VPI chainage (m)', String(input.vpiChainage)], ['VPI reduced level (m)', String(input.vpiRL)],
        ['Length authority', input.curveLength === undefined ? 'K (m/percent)' : 'Horizontal length (m)'],
        ['Supplied length or K', String(input.curveLength ?? input.kValue)], ['Sampling interval (m)', String(input.interval ?? 20)],
      ] },
      { title: 'Geometry summary', headers: ['Parameter', 'Value'], decimalPlaces: 4, rows: [
        ['Curve type', result.curveType], ['Horizontal length (m)', result.L], ['K (m/percent)', result.K ?? 'Undefined for equal grades'],
        ['BVC chainage (m)', result.bvcChainage], ['BVC level (m)', result.bvcRL],
        ['EVC chainage (m)', result.evcChainage], ['EVC level (m)', result.evcRL],
        ['Stationary chainage (m)', result.chainagePeak ?? 'No unique point on curve'],
        ['Stationary level (m)', result.rlPeak ?? 'Not applicable'],
      ] },
      { title: 'Profile schedule - exact endpoints and in-curve stationary point',
        headers: ['Chainage m', 'Level m', 'x from BVC m', 'Tangent offset m', 'Grade %', 'Point'], decimalPlaces: 4,
        rows: result.rows.map(row => [row.chainage, row.rl, row.x, row.y, row.grade, point(row)]),
      },
    ],
    notes: ['Symmetrical parabolic geometry only. Standard compliance NOT ASSESSED; design criteria and field acceptance require separate evidence.',
      'Levels and stationing are supplied by the caller. The vertical datum, control and project placement are not verified.',
      'Printed schedule values use four decimal places; this is display precision, not an engineering acceptance tolerance. CSV retains calculation precision.',
      'This local draft is not a saved project design, revision or approved construction document.'],
  })
}
