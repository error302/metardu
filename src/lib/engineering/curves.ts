// All angles in decimal degrees. Distances in metres.
// Geometry alone does not establish design-standard adoption or a project CRS.
import { verticalCurve as sharedVerticalCurve } from '../computations/roadDesignEngine'

export interface SimpleCurveInput {
  radius: number          // R in metres
  deflectionAngle: number // Δ (total deflection) in decimal degrees
  chainage_IP: number     // chainage at intersection point
}

export interface SimpleCurveResult {
  radius: number
  deflectionAngle: number
  tangentLength: number       // T
  curveLength: number         // L
  longChord: number           // C
  midOrdinate: number         // M
  externalDistance: number    // E
  chainage_TC: number         // chainage at tangent-to-curve
  chainage_CC: number         // chainage at curve centre (mid)
  chainage_CT: number         // chainage at curve-to-tangent
  settingOutTable: SettingOutRow[]
}

export interface SettingOutRow {
  chainage: number
  deflectionFromTC: number    // cumulative deflection angle from TC
  chordFromTC: number         // chord from TC to this point
  chordIncrement: number      // chord from previous point
}

export function simpleCircularCurve(input: SimpleCurveInput): SimpleCurveResult {
  const { radius: R, deflectionAngle: Delta, chainage_IP } = input
  const DeltaRad = (Delta * Math.PI) / 180

  const T = R * Math.tan(DeltaRad / 2)
  const L = (Math.PI * R * Delta) / 180
  const C = 2 * R * Math.sin(DeltaRad / 2)
  const M = R * (1 - Math.cos(DeltaRad / 2))
  const E = R * (1 / Math.cos(DeltaRad / 2) - 1)

  const chainage_TC = chainage_IP - T
  const chainage_CT = chainage_TC + L
  const chainage_CC = chainage_TC + L / 2

  // Setting out table — pegs at every 20m chainage
  const pegInterval = 20
  const settingOutTable: SettingOutRow[] = []

  let peg = Math.ceil(chainage_TC / pegInterval) * pegInterval
  let prevChord = 0

  while (peg <= chainage_CT) {
    const arc = peg - chainage_TC
    const deflection = (arc / (2 * R)) * (180 / Math.PI)
    const chord = 2 * R * Math.sin((arc / R) / 2)
    const increment = chord - prevChord

    settingOutTable.push({
      chainage: peg,
      deflectionFromTC: parseFloat(deflection.toFixed(6)),
      chordFromTC: parseFloat(chord.toFixed(4)),
      chordIncrement: parseFloat(increment.toFixed(4))
    })

    prevChord = chord
    peg += pegInterval
  }

  // Always include CT
  if (settingOutTable[settingOutTable.length - 1]?.chainage !== chainage_CT) {
    const deflection = Delta / 2
    const chord = C
    settingOutTable.push({
      chainage: parseFloat(chainage_CT.toFixed(3)),
      deflectionFromTC: parseFloat(deflection.toFixed(6)),
      chordFromTC: parseFloat(chord.toFixed(4)),
      chordIncrement: parseFloat((chord - prevChord).toFixed(4))
    })
  }

  return {
    radius: R,
    deflectionAngle: Delta,
    tangentLength: parseFloat(T.toFixed(4)),
    curveLength: parseFloat(L.toFixed(4)),
    longChord: parseFloat(C.toFixed(4)),
    midOrdinate: parseFloat(M.toFixed(4)),
    externalDistance: parseFloat(E.toFixed(4)),
    chainage_TC: parseFloat(chainage_TC.toFixed(3)),
    chainage_CC: parseFloat(chainage_CC.toFixed(3)),
    chainage_CT: parseFloat(chainage_CT.toFixed(3)),
    settingOutTable
  }
}

export interface VerticalCurveInput {
  gradeIn: number        // g1 in percent (e.g. +3.5 = 3.5)
  gradeOut: number       // g2 in percent
  length: number         // explicit L in metres; standards assessment is separate
  chainage_VIP: number   // chainage at vertical intersection point
  elevation_VIP: number  // elevation at VIP
  interval?: number     // table sampling only; defaults to 20 metres
}

export interface VerticalCurveResult {
  gradeIn: number
  gradeOut: number
  algebraicDiff: number  // A = g2 - g1
  kValue: number | null  // K = L / |A|; undefined for equal grades
  length: number
  isCrest: boolean
  curveType: 'crest' | 'sag' | 'straight'
  chainage_VPC: number   // start of curve
  chainage_VPT: number   // end of curve
  elevationTable: VerticalCurvePoint[]
  standardCompliance: 'NOT_ASSESSED'
  verticalDatumStatus: 'NOT_VERIFIED'
}

export interface VerticalCurvePoint {
  chainage: number
  elevation: number
  grade: number          // grade at this point
  tangentOffset: number  // signed offset from incoming tangent; not ground cut/fill
}

export function verticalCurve(input: VerticalCurveInput): VerticalCurveResult {
  const { gradeIn, gradeOut, length, chainage_VIP, elevation_VIP, interval } = input
  const result = sharedVerticalCurve({ g1: gradeIn, g2: gradeOut, curveLength: length,
    vpiChainage: chainage_VIP, vpiRL: elevation_VIP, interval })
  return {
    gradeIn, gradeOut, algebraicDiff: result.A, kValue: result.K, length: result.L,
    isCrest: result.isCrest, curveType: result.curveType,
    chainage_VPC: result.bvcChainage, chainage_VPT: result.evcChainage,
    elevationTable: result.rows.map(row => ({ chainage: row.chainage, elevation: row.rl,
      grade: row.grade, tangentOffset: row.y })),
    standardCompliance: 'NOT_ASSESSED', verticalDatumStatus: 'NOT_VERIFIED',
  }
}
