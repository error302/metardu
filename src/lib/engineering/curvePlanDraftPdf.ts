import { generateEngineeringSchedulePdf } from './engineeringSchedulePdf'
import type { CurvePlanSnapshot } from './curvePlanDraftCsv'

const labels: Record<string, string> = {
  radius: 'Radius R (m)', deflectionDeg: 'Deflection (degrees)', piChainage: 'PI chainage (m)', interval: 'Peg interval (m)',
  R1: 'First radius R1 (m)', R2: 'Second radius R2 (m)', delta1Deg: 'First arc deflection (degrees)', delta2Deg: 'Second arc deflection (degrees)',
  delta1: 'First arc deflection (degrees)', delta2: 'Second arc deflection (degrees)', junctionChainage: 'PCC chainage (m)', AB: 'PI1 to PI2 along common tangent (m)',
  tangent_m: 'Tangent length (m)', arc_m: 'Arc length (m)', long_chord_m: 'Long chord (m)', external_m: 'External distance (m)', mid_ordinate_m: 'Mid-ordinate (m)',
  PC_m: 'PC chainage (m)', PI_m: 'PI chainage (m)', PT_m: 'PT chainage (m)', PCC_m: 'PCC chainage (m)',
  first_tangent_m: 'First arc tangent (m)', second_tangent_m: 'Second arc tangent (m)', first_arc_m: 'First arc length (m)', second_arc_m: 'Second arc length (m)',
  total_arc_m: 'Total arc length (m)', intervening_tangent_m: 'Intervening tangent gap (m)', arc_sum_m: 'Sum of arc lengths (m)', total_path_m: 'Total path length (m)',
}

export function curvePlanDraftPdf(snapshot: CurvePlanSnapshot, generatedAt = new Date()) {
  return generateEngineeringSchedulePdf({ title: `${snapshot.kind} curve - local calculation draft`,
    projectName: 'No project assigned (local draft)', coordinateReference: 'Local geometry only; CRS and placement NOT VERIFIED', generatedAt,
    sections: [
      { title: 'Supplied inputs', headers: ['Parameter', 'Value'], rows: Object.entries(snapshot.input).map(([name, value]) => [labels[name] ?? name, String(value)]) },
      { title: 'Computed geometry', headers: ['Parameter', 'Value'], decimalPlaces: 4, rows: Object.entries(snapshot.values).map(([name, value]) => [labels[name] ?? name, value]) },
      ...(snapshot.points ? [{ title: 'Set-out - cumulative chords from PC', headers: ['Chainage m', 'Chord from PC m', 'Deflection from PC tangent'], decimalPlaces: 4,
        rows: snapshot.points.map(row => [row.chainage, row.chordLength, row.totalDeflection.replace(/°/g, 'deg')]) }] : []),
    ],
    notes: ['Standard compliance, sight distance, transitions, superelevation and field acceptance NOT ASSESSED.',
      snapshot.kind === 'compound' ? 'Junction is PCC: PC = PCC - first arc length; PT = PCC + second arc length.' : snapshot.kind === 'reverse' ? 'AB is PI1-to-PI2 distance along the common tangent. Gap = AB - T1 - T2. Total path = first arc + gap + second arc.' : 'Set-out deflections are magnitudes; no curve direction, bearing, control or coordinates are supplied.',
      'This local calculation is not an approved project design or revision. Printed values use four decimals; CSV retains calculation precision.'],
  })
}
