// All angles in decimal degrees. Distances in metres.
// Geometry alone does not establish design-standard adoption or a project CRS.
import { verticalCurve as sharedVerticalCurve, horizontalCurveInputFromDecimal,
  horizontalCurveElements, curveSetOut } from '../computations/roadDesignEngine'

export interface SimpleCurveInput {
  radius: number          // R in metres
  deflectionAngle: number // Δ (total deflection) in decimal degrees
  chainage_IP: number     // chainage at intersection point
  interval?: number      // arc peg interval, defaults to 20 m
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
  chainage_CC: number         // arc-midpoint station, not circle-centre coordinates
  chainage_CT: number         // chainage at curve-to-tangent
  settingOutTable: SettingOutRow[]
  standardCompliance: 'NOT_ASSESSED'
  coordinateReferenceStatus: 'NOT_VERIFIED'
}

export interface SettingOutRow {
  chainage: number
  deflectionFromTC: number    // cumulative deflection angle from TC
  chordFromTC: number         // chord from TC to this point
  chordIncrement: number      // actual chord from previous peg; not a difference of cumulative chords
}

export function simpleCircularCurve(input: SimpleCurveInput): SimpleCurveResult {
  const { radius, deflectionAngle, chainage_IP, interval = 20 } = input
  const geometry = horizontalCurveInputFromDecimal(radius, deflectionAngle, chainage_IP)
  const result = horizontalCurveElements(geometry)
  const setout = curveSetOut({ ...geometry, tcChainage: result.tcChainage, ctChainage: result.ctChainage, interval })
  return {
    radius, deflectionAngle, tangentLength: result.tangentLength, curveLength: result.curveLength,
    longChord: result.longChord, midOrdinate: result.midOrdinate, externalDistance: result.externalDistance,
    chainage_TC: result.tcChainage, chainage_CC: result.ccChainage, chainage_CT: result.ctChainage,
    settingOutTable: setout.rows.map(row => ({ chainage: row.chainage,
      deflectionFromTC: (row.chainage - result.tcChainage) / radius * 90 / Math.PI,
      chordFromTC: radius * (2 * Math.sin((row.chainage - result.tcChainage) / radius / 2)),
      chordIncrement: row.chord })),
    standardCompliance: 'NOT_ASSESSED', coordinateReferenceStatus: 'NOT_VERIFIED',
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
