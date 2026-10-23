import { toCSV } from '@/lib/export/helpers'

export interface CurvePlanSnapshot {
  kind: 'simple' | 'compound' | 'reverse'
  input: Record<string, number>
  values: Record<string, number>
  points?: { chainage: number; chordLength: number; totalDeflection: string }[]
}

export function curvePlanDraftCsv(snapshot: CurvePlanSnapshot) {
  const meta = ['LOCAL_CALCULATION_DRAFT', 'NOT_ASSESSED', 'NOT_VERIFIED']
  return toCSV(['Record', 'Parameter', 'Value', 'Chainage_m', 'Chord_from_PC_m', 'Deflection_from_PC_tangent', 'Draft_status', 'Standard_compliance', 'CRS_status'], [
    ['MODEL', snapshot.kind, 'declared-circular-geometry', '', '', '', ...meta],
    ...Object.entries(snapshot.input).map(([name, value]) => ['INPUT', name, String(value), '', '', '', ...meta]),
    ...Object.entries(snapshot.values).map(([name, value]) => ['RESULT', name, String(value), '', '', '', ...meta]),
    ...(snapshot.points ?? []).map((row, index) => ['STATION', String(index), '', String(row.chainage), String(row.chordLength), row.totalDeflection, ...meta]),
  ])
}
