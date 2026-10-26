// METARDU Traverse Computation Engine
// Source: N.N. Basak, Surveying and Levelling, Chapters 10-11
// Source: Ghilani & Wolf, Elementary Surveying 16th Ed., Chapters 10, 12
// Numerical reduction only. A job-specific criterion must be supplied for a
// linear-closure comparison; no jurisdiction or accuracy order is inferred.

import { dmsToDecimal } from '@/lib/engine/angles'
import { bowditchCorrections } from '@/lib/engine/traverse'

function angleDMS(angleDeg: number): string {
  const norm = ((angleDeg % 360) + 360) % 360
  // Round display ticks before splitting, carrying 60 seconds/minutes correctly.
  const ticks = Math.round(norm * 36000) % 12960000
  const d = Math.floor(ticks / 36000)
  const m = Math.floor((ticks % 36000) / 600)
  const s = (ticks % 600) / 10
  return `${String(d).padStart(3,'0')}° ${String(m).padStart(2,'0')}' ${s.toFixed(1)}"`
}

export { angleDMS as formatTraverseAngleDMS }

export interface RawObservation {
  station: string
  bs: string
  fs: string
  hclDeg: string
  hclMin: string
  hclSec: string
  hcrDeg: string
  hcrMin: string
  hcrSec: string
  slopeDist: string
  vaDeg: string
  vaMin: string
  vaSec: string
  ih: string
  th: string
  remarks?: string
}

export interface ReducedObservation {
  station: string
  hcl: number
  hcr: number
  meanAngle: number
  meanAngleDMS: string
  faceDifferenceArcsec: number
  slopeDist: number
  verticalAngle: number
  verticalAngleRad: number
  horizontalDist: number
  horizontalGroundDist: number
  deltaH: number | null
  ih: number | null
  th: number | null
  remarks?: string
}

export interface TraverseComputationLeg {
  from: string
  to: string
  meanAngle: number
  meanAngleDMS: string
  wcb: number
  wcbDMS: string
  sd: number
  hd: number
  departure: number
  latitude: number
  depCorrection: number
  latCorrection: number
  adjDep: number
  adjLat: number
}

export interface TraverseComputationResult {
  rawObservations: RawObservation[]
  observations: ReducedObservation[]
  legs: TraverseComputationLeg[]
  coordinates: Array<{ station: string; easting: number; northing: number; rl?: number }>
  totalPerimeter: number
  horizontalScaleFactor: number
  sumDepartures: number
  sumLatitudes: number
  linearError: number | null
  precisionRatio: number | null
  accuracyOrder: string
  C_mm: number | null
  K_km: number
  formula: string
  /** Stated allowable linear misclosure, millimetres; null if not supplied. */
  allowable: number | null
  assessment: TraverseAssessment
  openingPoint: { easting: number; northing: number; rl?: number }
  closingPoint?: { easting: number; northing: number }
  isClosed: boolean
}

export interface TraverseCriterion {
  allowableMisclosureMm: number
  reference: string
}

export interface TraverseAssessment {
  status: 'not_assessed' | 'pass' | 'fail'
  reference: string | null
  reason: string
}

function finite(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`)
  return value
}

function decimal(value: string, label: string): number {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    throw new Error(`${label} requires a complete decimal value`)
  }
  return finite(Number(value), label)
}

/** Strict decimal admission shared by text-entry callers; never prefix-parse. */
export { decimal as parseTraverseDecimal }

function dms(degrees: number, minutes: number, seconds: number, maximum: number, label: string): number {
  if (![degrees, minutes, seconds].every(v => typeof v === 'number' && Number.isFinite(v)) ||
      !Number.isInteger(degrees) || !Number.isInteger(minutes) || degrees < 0 ||
      minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    throw new Error(`${label} requires valid degrees, minutes and seconds`)
  }
  const value = dmsToDecimal({ degrees, minutes, seconds, direction: 'N' })
  if (value > maximum) throw new Error(`${label} exceeds ${maximum} degrees`)
  return value
}

function optionalHeight(value: string, label: string): number | null {
  if (value === undefined || value === null || value.trim() === '') return null
  const height = decimal(value, label)
  if (height < 0) throw new Error(`${label} must be nonnegative`)
  return height
}

/** Paired clockwise BS-to-FS angles. Setup-network reduction is a separate step. */
export function reduceTraverseFaces(o: Pick<RawObservation, 'hclDeg' | 'hclMin' | 'hclSec' | 'hcrDeg' | 'hcrMin' | 'hcrSec'>) {
  const circle = (prefix: 'hcl' | 'hcr', label: string) => dms(decimal(o[`${prefix}Deg`], label), decimal(o[`${prefix}Min`], label), decimal(o[`${prefix}Sec`], label), 360, label)
  const hcl = circle('hcl', 'Face left')
  const hcr = circle('hcr', 'Face right')
  const hcrAdj = (hcr + 180) % 360
  const difference = ((hcrAdj - hcl + 540) % 360) - 180
  if (Math.abs(difference) === 180) throw new Error('Ambiguous opposite face readings')
  const meanAngle = ((hcl + difference / 2) % 360 + 360) % 360
  return { hcl, hcr, meanAngle, meanAngleDMS: angleDMS(meanAngle), faceDifferenceArcsec: difference * 3600 }
}

export function computeTraverse(input: {
  openingEasting: number
  openingNorthing: number
  openingRL?: number
  openingStation: string
  closingEasting?: number
  closingNorthing?: number
  closingStation?: string
  observations: RawObservation[]
  backsightBearingDeg: number
  backsightBearingMin: number
  backsightBearingSec: number
  criterion?: TraverseCriterion
  /** Adopted horizontal ground-to-grid factor. Never applied to vertical deltas. */
  horizontalScaleFactor?: number
}): TraverseComputationResult {
  const horizontalScaleFactor = finite(input.horizontalScaleFactor === undefined ? 1 : input.horizontalScaleFactor, 'Horizontal scale factor')
  if (horizontalScaleFactor <= 0) throw new Error('Horizontal scale factor must be positive')
  finite(input.openingEasting, 'Opening easting')
  finite(input.openingNorthing, 'Opening northing')
  if (input.openingRL !== undefined) finite(input.openingRL, 'Opening level')
  if (!input.openingStation?.trim()) throw new Error('Opening station is required')
  if ((input.closingEasting === undefined) !== (input.closingNorthing === undefined)) throw new Error('Both closing coordinate components are required')
  if (input.closingEasting !== undefined) finite(input.closingEasting, 'Closing easting')
  if (input.closingNorthing !== undefined) finite(input.closingNorthing, 'Closing northing')
  const criterion = input.criterion
  if (criterion && (finite(criterion.allowableMisclosureMm, 'Criterion limit') < 0 || !criterion.reference?.trim())) {
    throw new Error('Criterion requires a nonnegative limit and a reference')
  }
  const obs = input.observations
  if (!Array.isArray(obs) || obs.length === 0) throw new Error('At least one observation is required')

  const reduced: ReducedObservation[] = obs.map((o) => {
    // Source: Basak, Chapter 10 — Mean angle from face-left and face-right horizontal circle readings
    // Source: Ghilani & Wolf, Chapter 12 — HCR_adj = HCR + 180° when HCR < 180°
    if (!o?.station?.trim()) throw new Error('Every observation requires a target station')
    const faces = reduceTraverseFaces(o)

    const sd = decimal(o.slopeDist, 'Slope distance')
    if (sd <= 0) throw new Error('Slope distance must be positive')
    const va = dms(decimal(o.vaDeg, 'Zenith'), decimal(o.vaMin, 'Zenith'), decimal(o.vaSec, 'Zenith'), 180, 'Zenith')
    if (va <= 0 || va >= 180) throw new Error('A traverse leg requires a zenith strictly between 0 and 180 degrees')
    const vaRad = va * Math.PI / 180
    // Canonical: VA is zenith (90°=horizontal) — see verticalAngle.ts
    const horizontalGroundDist = finite(sd * Math.sin(vaRad), 'Horizontal ground distance')
    const hd = finite(horizontalGroundDist * horizontalScaleFactor, 'Horizontal grid distance')
    const ih = optionalHeight(o.ih, 'Instrument height')
    const th = optionalHeight(o.th, 'Target height')
    // ΔH = SD·cos(zenith) + IH − TH (zenith → vertical)
    const deltaH = ih === null || th === null ? null : finite(sd * Math.cos(vaRad) + ih - th, 'Height difference')

    return {
      station: o.station,
      ...faces,
      slopeDist: sd,
      verticalAngle: va,
      verticalAngleRad: vaRad,
      horizontalDist: hd,
      horizontalGroundDist,
      deltaH,
      ih,
      th,
      remarks: o.remarks,
    }
  })

  const backsightRad = dms(input.backsightBearingDeg, input.backsightBearingMin, input.backsightBearingSec, 360, 'Backsight bearing') * Math.PI / 180

  const legs: TraverseComputationLeg[] = []
  let currentWCB = backsightRad

  const stations = [input.openingStation, ...obs.map((o) => o.station)]

  for (let i = 0; i < obs.length; i++) {
    // Source: Basak, Chapter 10 — WCB propagation using observed angles
    // WCB(forward) = back_bearing(previous line) + observed angle (clockwise from BS to FS)
    // back_bearing(x) = x + 180°
    // currentWCB is initialized as the backsight bearing (already a back bearing),
    // then after each iteration it is updated to the back bearing of the computed line.
    const angle = reduced[i].meanAngle * Math.PI / 180
    let wcb = currentWCB + angle
    if (wcb < 0) wcb += 2 * Math.PI
    if (wcb >= 2 * Math.PI) wcb -= 2 * Math.PI
    const wcbDeg = wcb * 180 / Math.PI
    const hd = reduced[i].horizontalDist
    // Source: Basak, Eq. 10.3 — Departure = HD × sin(WCB), Latitude = HD × cos(WCB)
    const dep = hd * Math.sin(wcb)
    const lat = hd * Math.cos(wcb)
    legs.push({
      from: stations[i],
      to: stations[i + 1] || obs[i].fs || `T${i + 1}`,
      meanAngle: reduced[i].meanAngle,
      meanAngleDMS: reduced[i].meanAngleDMS,
      wcb: wcbDeg,
      wcbDMS: angleDMS(wcbDeg),
      sd: reduced[i].slopeDist,
      hd,
      departure: dep,
      latitude: lat,
      depCorrection: 0,
      latCorrection: 0,
      adjDep: dep,
      adjLat: lat,
    })

    // FIXED: Update currentWCB to the BACK BEARING of the line just computed.
    // Previous version set currentWCB = wcb (forward bearing), which caused all
    // subsequent WCBs to be wrong by 180°. The correct propagation requires:
    //   WCB_next = back_bearing(WCB_current) + angle_next
    // Source: Basak Ch.10, Ghilani & Wolf Ch.10
    currentWCB = wcb + Math.PI
    if (currentWCB >= 2 * Math.PI) currentWCB -= 2 * Math.PI
  }

  const closingE = input.closingEasting
  const closingN = input.closingNorthing
  const isClosed = closingE !== undefined && closingN !== undefined

  let sumDep = legs.reduce((s, l) => s + l.departure, 0)
  let sumLat = legs.reduce((s, l) => s + l.latitude, 0)

  let linearError: number | null = null
  let precisionRatio: number | null = null
  let C_mm: number | null = null
  const totalPerimeter = finite(legs.reduce((s, l) => s + l.hd, 0), 'Total horizontal distance')
  if (totalPerimeter <= 0) throw new Error('Horizontal distance must be positive')
  const K_km = totalPerimeter / 1000

  if (isClosed && closingE !== undefined && closingN !== undefined) {

    // FIXED: Previous version added actualDep/actualLat to sumDep/sumLat before
    // computing corrections. This was WRONG — for a loop traverse (closing=opening),
    // it made sumDep=0, resulting in ZERO Bowditch adjustment despite misclosure.
    //
    // Correct approach (Source: Basak Ch.11, Ghilani & Wolf Ch.12):
    //   Misclosure in departure = Σdep − (Eclosing − Eopening)
    //   Misclosure in latitude  = Σlat − (Nclosing − Nopening)
    //   Bowditch correction_i = −(misclosure/ΣD) × D_i
    //
    // After correction, ΣadjDep = Eclosing − Eopening, ΣadjLat = Nclosing − Nopening
    const eDep = sumDep - (closingE - input.openingEasting)   // departure misclosure
    const eLat = sumLat - (closingN - input.openingNorthing)  // latitude misclosure
    linearError = finite(Math.hypot(eDep, eLat), 'Linear misclosure')
    const ratio = linearError > 0 ? totalPerimeter / linearError : null
    precisionRatio = ratio !== null && Number.isFinite(ratio) ? ratio : null
    C_mm = finite(linearError * 1000, 'Linear misclosure in millimetres')

    // Bowditch rule via the shared kernel in engine/traverse (single
    // implementation of correction_i = −(misclosure/ΣD) × D_i).
    const { correctionE, correctionN } = bowditchCorrections(
      legs.map((l) => l.hd),
      eDep,
      eLat
    );
    for (let i = 0; i < legs.length; i++) {
      legs[i].depCorrection = correctionE[i];
      legs[i].latCorrection = correctionN[i];
      legs[i].adjDep = legs[i].departure + legs[i].depCorrection;
      legs[i].adjLat = legs[i].latitude + legs[i].latCorrection;
    }

    // Verify: adjusted sums should now equal (closing − opening)
    sumDep = legs.reduce((s, l) => s + l.adjDep, 0)
    sumLat = legs.reduce((s, l) => s + l.adjLat, 0)
  }

  const coords: Array<{ station: string; easting: number; northing: number; rl?: number }> = [
    { station: input.openingStation, easting: input.openingEasting, northing: input.openingNorthing, rl: input.openingRL },
  ]

  let adjE = input.openingEasting
  let adjN = input.openingNorthing
  let adjRL = input.openingRL

  for (let i = 0; i < legs.length; i++) {
    adjE = finite(adjE + legs[i].adjDep, 'Computed easting')
    adjN = finite(adjN + legs[i].adjLat, 'Computed northing')
    const deltaH = reduced[i].deltaH
    adjRL = adjRL === undefined || deltaH === null ? undefined : finite(adjRL + deltaH, 'Computed level')
    coords.push({ station: legs[i].to, easting: adjE, northing: adjN, rl: adjRL })
  }

  finite(sumDep, 'Sum of departures')
  finite(sumLat, 'Sum of latitudes')
  const assessment: TraverseAssessment = {
    status: C_mm === null || !criterion ? 'not_assessed' : C_mm <= criterion.allowableMisclosureMm ? 'pass' : 'fail',
    reference: criterion?.reference ?? null,
    reason: C_mm === null ? 'No closing control supplied; linear misclosure is unknown.' : !criterion
      ? 'No adopted job criterion supplied; no accuracy order or tolerance decision is inferred.'
      : 'Linear misclosure compared only to the supplied job limit. This is not survey approval.',
  }

  return {
    rawObservations: obs.map(observation => ({ ...observation })),
    observations: reduced,
    legs,
    coordinates: coords,
    totalPerimeter,
    horizontalScaleFactor,
    sumDepartures: sumDep,
    sumLatitudes: sumLat,
    linearError,
    precisionRatio,
    accuracyOrder: assessment.status === 'not_assessed' ? 'NOT ASSESSED' : assessment.status === 'pass' ? 'WITHIN STATED LIMIT' : 'EXCEEDS STATED LIMIT',
    C_mm,
    K_km,
    formula: criterion ? `Stated limit: ${criterion.allowableMisclosureMm} mm; ${criterion.reference}` : assessment.reason,
    allowable: criterion?.allowableMisclosureMm ?? null,
    assessment,
    openingPoint: { easting: input.openingEasting, northing: input.openingNorthing, rl: input.openingRL },
    closingPoint: isClosed ? { easting: closingE ?? 0, northing: closingN ?? 0 } : undefined,
    isClosed,
  }
}

export function computeBowditchAdjustment(legs: TraverseComputationLeg[], closingE: number, closingN: number): void {
  if (legs.length === 0) return
  const totalDist = legs.reduce((s, l) => s + l.hd, 0)
  if (totalDist === 0) return

  // Misclosure = closing point − computed endpoint
  // (closing point is known; sum of departures/latitudes is the computed endpoint offset from opening)
  const sumDep = legs.reduce((s, l) => s + l.departure, 0)
  const sumLat = legs.reduce((s, l) => s + l.latitude, 0)

  // Linear misclosure components
  // Source: Ghilani & Wolf, Chapter 12 — eE = Σdep − (Eclosing − Eopening)
  // Here closing coords are already offset from opening, so eE = sumDep − closingE
  // and eN = sumLat − closingN
  const eE = sumDep - closingE  // departure misclosure
  const eN = sumLat - closingN  // latitude misclosure

  // Bowditch rule via the shared kernel in engine/traverse
  const { correctionE, correctionN } = bowditchCorrections(
    legs.map((l) => l.hd),
    eE,
    eN
  );
  for (let i = 0; i < legs.length; i++) {
    legs[i].depCorrection = correctionE[i]
    legs[i].latCorrection = correctionN[i]
    legs[i].adjDep = legs[i].departure + legs[i].depCorrection
    legs[i].adjLat = legs[i].latitude + legs[i].latCorrection
  }
}

export interface LevelBookRow {
  station: string
  bs?: number
  is?: number
  fs?: number
  hi?: number
  rl?: number
  rise?: number
  fall?: number
  distance?: number
  remarks?: string
}

export interface LevelBookResult {
  rows: LevelBookRow[]
  method: 'rise_and_fall' | 'height_of_collimation'
  sumBS: number
  sumFS: number
  sumRise: number
  sumFall: number
  arithmeticCheck: number
  arithmeticPass: boolean
  misclosure: number
  allowableMisclosure: number
  isAcceptable: boolean
  openingRL: number
  closingRL?: number
  distanceKm: number
  formula: string
}

export function computeLevelBook(input: {
  openingRL: number
  closingRL?: number
  distanceKm: number
  method: 'rise_and_fall' | 'height_of_collimation'
  rows: Array<{ station: string; bs?: number; is?: number; fs?: number; distance?: number; remarks?: string }>
}): LevelBookResult {
  const { openingRL, closingRL, distanceKm, method, rows } = input
  const result: LevelBookRow[] = []

  let sumBS = 0, sumFS = 0, sumRise = 0, sumFall = 0
  let hi: number | null = null
  let currentRL = openingRL

  for (const row of rows) {
    const out: LevelBookRow = { station: row.station, distance: row.distance, remarks: row.remarks }

    if (row.bs !== undefined && row.bs !== null) {
      out.bs = row.bs
      sumBS += row.bs
      hi = currentRL + row.bs
      out.hi = hi
      // A backsight establishes the instrument height; it does not change the
      // reduced level of the station being sighted.
      out.rl = currentRL
    }

    if (row.is !== undefined && row.is !== null && hi !== null) {
      out.is = row.is
      const rl = hi - row.is
      out.rl = rl
      if (method === 'rise_and_fall') {
        const prevRL = result.length > 0 ? (result[result.length - 1].rl ?? currentRL) : currentRL
        // FIXED: Previous version had diff = prevRL - rl, which inverted rise/fall.
        // Convention: Rise = current RL > previous RL (ground goes UP)
        //             Fall = current RL < previous RL (ground goes DOWN)
        // Source: Basak, Chapter 5 — Rise and Fall method
        const diff = rl - prevRL
        if (diff >= 0) { out.rise = diff; sumRise += diff }
        else { out.fall = Math.abs(diff); sumFall += Math.abs(diff) }
      }
      currentRL = rl
    }

    if (row.fs !== undefined && row.fs !== null && hi !== null) {
      out.fs = row.fs
      sumFS += row.fs
      const rl = hi - row.fs
      out.rl = rl
      if (method === 'rise_and_fall') {
        const prevRL = result.length > 0 ? (result[result.length - 1].rl ?? currentRL) : currentRL
        // FIXED: Same rise/fall sign correction as IS case above
        const diff = rl - prevRL
        if (diff >= 0) { out.rise = diff; sumRise += diff }
        else { out.fall = Math.abs(diff); sumFall += Math.abs(diff) }
      }
      currentRL = rl
      hi = null
    }

    result.push(out)
  }

  const arithmeticCheck = (sumBS - sumFS) - (currentRL - openingRL)
  const arithmeticPass = Math.abs(arithmeticCheck) < 0.001

  const misclosure = closingRL !== undefined ? Math.abs(currentRL - closingRL) : 0
  const allowable = (10 * Math.sqrt(distanceKm)) / 1000 // Kenya RDM 1.1 Table 5.1: 10√K mm
  const isAcceptable = closingRL !== undefined ? misclosure <= allowable : true

  return {
    rows: result,
    method,
    sumBS,
    sumFS,
    sumRise,
    sumFall,
    arithmeticCheck,
    arithmeticPass,
    misclosure,
    allowableMisclosure: allowable,
    isAcceptable,
    openingRL,
    closingRL,
    distanceKm,
    formula: `Allowable = 10√K = 10√${distanceKm.toFixed(3)} = ${allowable.toFixed(3)} m (RDM 1.1 Table 5.1)`,
  }
}
