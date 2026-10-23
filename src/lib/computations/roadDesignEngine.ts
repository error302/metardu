// METARDU road geometry and explicit project-criteria screening calculations.
// Formula references do not establish adoption of a design standard or field approval.

// ─── PART 1: HORIZONTAL CURVE ELEMENTS ──────────────────────────────────────
// Source: RDM 1.3 Section 5.2
// Source: Ghilani & Wolf, Elementary Surveying 16th Ed., Chapter 24

export interface HorizontalCurveInput {
  radius: number           // metres
  deflectionAngleDeg: number
  deflectionAngleMin: number
  deflectionAngleSec: number
  ipChainage: number      // metres (or km+m string)
}

export interface HorizontalCurveResult {
  delta: number           // radians
  tangentLength: number    // T = R × tan(Δ/2)
  curveLength: number     // L = πRΔ/180
  longChord: number       // C = 2R × sin(Δ/2)
  midOrdinate: number     // M = R × (1 - cos(Δ/2))
  externalDistance: number // E = R × (1/cos(Δ/2) - 1)
  degreeOfCurve: number   // D = 1718.873 / R (arc definition)
  tcChainage: number
  ccChainage: number
  ctChainage: number
  arithmeticCheck: { passed: boolean; diff: number }
  steps: Array<{ description: string; formula: string; value: string }>
}

function horizontalAngle(input: Pick<HorizontalCurveInput, 'radius' | 'deflectionAngleDeg' | 'deflectionAngleMin' | 'deflectionAngleSec'>): number {
  const { radius, deflectionAngleDeg: degrees, deflectionAngleMin: minutes, deflectionAngleSec: seconds } = input
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('Radius must be a finite positive number.')
  if (!Number.isInteger(degrees) || degrees < 0 || degrees >= 180) throw new Error('Degrees must be an integer from 0 to 179.')
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 60) throw new Error('Minutes must be an integer from 0 to 59.')
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= 60) throw new Error('Seconds must be from 0 up to, but excluding, 60.')
  const angle = (degrees + minutes / 60 + seconds / 3600) * Math.PI / 180
  if (!(angle > 0 && angle < Math.PI)) throw new Error('Central angle must be greater than 0 and less than 180 degrees.')
  return angle
}

// Round once, before splitting into D/M/S, so 59.99 seconds carries correctly.
function horizontalDms(degrees: number): string {
  const tenths = Math.round(degrees * 36000)
  const d = Math.floor(tenths / 36000)
  const m = Math.floor((tenths % 36000) / 600)
  const s = (tenths % 600) / 10
  return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(1).padStart(4, '0')}"`
}

export function horizontalCurveElements(input: HorizontalCurveInput): HorizontalCurveResult {
  const { radius, deflectionAngleDeg, deflectionAngleMin, deflectionAngleSec, ipChainage } = input

  const deltaRad = horizontalAngle(input)
  if (!Number.isFinite(ipChainage)) throw new Error('IP chainage must be a finite number.')
  const deltaDeg = deflectionAngleDeg + deflectionAngleMin / 60 + deflectionAngleSec / 3600
  const halfDelta = deltaRad / 2

  // Source: RDM 1.3 Section 5.2 — Tangent length: T = R × tan(Δ/2)
  const tangentLength = radius * Math.tan(halfDelta)

  // Source: RDM 1.3 Section 5.2 — Arc length: L = πRΔ/180 (Δ in degrees)
  const curveLength = Math.PI * radius * deltaDeg / 180

  // Source: RDM 1.3 Section 5.2 — Long chord
  const longChord = 2 * radius * Math.sin(halfDelta)

  // Source: RDM 1.3 Section 5.2 — Mid ordinate
  const midOrdinate = 2 * radius * Math.sin(halfDelta / 2) ** 2

  // Source: RDM 1.3 Section 5.2 — External distance
  const externalDistance = midOrdinate / Math.cos(halfDelta)

  // Source: RDM 1.3 Section 5.2 — Degree of curve (arc definition)
  const degreeOfCurve = (30 / radius) * 180 / Math.PI

  // Source: RDM 1.3 Section 5.2 — Chainage of key points
  const tcChainage = ipChainage - tangentLength
  const ccChainage = tcChainage + curveLength / 2
  const ctChainage = tcChainage + curveLength

  if (![tangentLength, curveLength, longChord, midOrdinate, externalDistance, degreeOfCurve, tcChainage, ccChainage, ctChainage].every(Number.isFinite) ||
      !(curveLength > 0 && tangentLength > 0 && longChord > 0 && tcChainage < ccChainage && ccChainage < ctChainage)) {
    throw new Error('Curve cannot be represented at this radius and chainage precision.')
  }

  // Numerical identity only: PI + T follows the tangent, not the curve stationing.
  const ctFromIP = ipChainage + (curveLength - tangentLength)
  const ctFromTC = tcChainage + curveLength
  const arithmeticCheck = { passed: Math.abs(ctFromIP - ctFromTC) <= 32 * Number.EPSILON * Math.max(1, Math.abs(ipChainage), tangentLength, curveLength), diff: ctFromIP - ctFromTC }

  const steps = [
    { description: `Δ = ${deflectionAngleDeg}° + ${deflectionAngleMin}'/60 + ${deflectionAngleSec}"/3600`, formula: `${deltaDeg.toFixed(6)}°`, value: `${deltaRad.toFixed(8)} rad` },
    { description: `T = R × tan(Δ/2)`, formula: `${radius} × tan(${halfDelta.toFixed(6)})`, value: `${tangentLength.toFixed(4)} m` },
    { description: `L = π × R × Δ / 180`, formula: `π × ${radius} × ${deltaDeg.toFixed(4)}° / 180`, value: `${curveLength.toFixed(4)} m` },
    { description: `C = 2R × sin(Δ/2)`, formula: `2 × ${radius} × sin(${halfDelta.toFixed(6)})`, value: `${longChord.toFixed(4)} m` },
    { description: `M = R × (1 - cos(Δ/2))`, formula: `${radius} × (1 - cos(${halfDelta.toFixed(6)}))`, value: `${midOrdinate.toFixed(4)} m` },
    { description: `E = R × (1/cos(Δ/2) - 1)`, formula: `${radius} × (1/cos(${halfDelta.toFixed(6)}) - 1)`, value: `${externalDistance.toFixed(4)} m` },
    { description: `D (30 m arc) = (30/R) × 180/π`, formula: `(30/${radius}) × 180/π`, value: `${degreeOfCurve.toFixed(4)}°` },
    { description: `TC = IP - T`, formula: `${ipChainage.toFixed(3)} - ${tangentLength.toFixed(4)}`, value: `${tcChainage.toFixed(4)} m` },
    { description: `CC = TC + L/2`, formula: `${tcChainage.toFixed(4)} + ${curveLength.toFixed(4)}/2`, value: `${ccChainage.toFixed(4)} m` },
    { description: `CT = TC + L`, formula: `${tcChainage.toFixed(4)} + ${curveLength.toFixed(4)}`, value: `${ctChainage.toFixed(4)} m` },
    { description: `Numerical identity: CT = IP + (L - T)`, formula: `${ipChainage.toFixed(4)} + (${curveLength.toFixed(4)} - ${tangentLength.toFixed(4)})`, value: `${ctFromIP.toFixed(4)} m; ${arithmeticCheck.passed ? 'consistent' : 'inconsistent'} (diff=${arithmeticCheck.diff.toExponential(2)} m)` },
  ]

  return {
    delta: deltaRad, tangentLength, curveLength, longChord, midOrdinate,
    externalDistance, degreeOfCurve,
    tcChainage, ccChainage, ctChainage,
    arithmeticCheck, steps,
  }
}

// ─── PART 2: CURVE SET-OUT TABLE (RANKINE DEFLECTION ANGLES) ─────────────────
// Source: N.N. Basak, Surveying and Levelling
// Source: Schofield & Breach, Engineering Surveying 7th Ed., Chapter 11

export interface SetOutInput {
  radius: number
  tcChainage: number
  ctChainage: number
  deflectionAngleDeg: number
  deflectionAngleMin: number
  deflectionAngleSec: number
  interval: number       // metres (default 20m)
}

export interface SetOutRow {
  peg: string
  chainage: number
  chord: number
  deflectionAngle: string
  totalDeflection: string
  remarks: string
}

export interface SetOutResult {
  rows: SetOutRow[]
  totalChord: number
  checkTotalDeflection: string
  arithmeticCheck: { passed: boolean; diffDeg: number }
  steps: Array<{ description: string; formula: string; value: string }>
}

export function curveSetOut(input: SetOutInput): SetOutResult {
  const { radius, tcChainage, ctChainage, interval } = input
  const delta = horizontalAngle(input)
  if (!Number.isFinite(tcChainage) || !Number.isFinite(ctChainage) || ctChainage <= tcChainage) {
    throw new Error('TC and CT chainages must be finite and strictly increasing.')
  }
  if (!Number.isFinite(interval) || interval <= 0) throw new Error('Peg interval must be a finite positive number.')
  const curveLength = ctChainage - tcChainage
  const expectedLength = radius * delta
  // Floating-point consistency, not an engineering or field acceptance tolerance.
  const precision = 32 * Number.EPSILON * Math.max(1, Math.abs(tcChainage), Math.abs(ctChainage), expectedLength)
  if (!Number.isFinite(curveLength) || !Number.isFinite(expectedLength) ||
      expectedLength <= 0 || precision > expectedLength * 1e-8 || Math.abs(curveLength - expectedLength) > precision) {
    throw new Error('TC/CT chainages must match the radius and central angle at sufficient numerical precision.')
  }
  const startIndex = Math.floor(tcChainage / interval) + 1
  const endIndex = Math.ceil(ctChainage / interval) - 1
  const count = Math.max(0, endIndex - startIndex + 1)
  if (!Number.isSafeInteger(startIndex) || !Number.isSafeInteger(endIndex) || count + 2 > 10000) {
    throw new Error('Peg interval exceeds the 10,000-row limit or available chainage precision; use a larger interval.')
  }

  const zero = horizontalDms(0)
  const rows: SetOutRow[] = [{ peg: 'TC', chainage: tcChainage, chord: 0, deflectionAngle: zero, totalDeflection: zero, remarks: 'Tangent/Curve' }]
  function append(chainage: number, peg: string, remarks: string) {
    const previous = rows[rows.length - 1].chainage
    if (!(chainage > previous)) throw new Error('Peg interval cannot advance at this chainage precision.')
    const arc = chainage - previous
    rows.push({
      peg, chainage,
      chord: radius * (2 * Math.sin(arc / radius / 2)),
      deflectionAngle: horizontalDms(arc / radius * 90 / Math.PI),
      totalDeflection: horizontalDms((chainage - tcChainage) / radius * 90 / Math.PI),
      remarks,
    })
  }
  for (let i = 0; i < count; i++) {
    const chainage = (startIndex + i) * interval
    // Exclude endpoints including roundoff at exact interval boundaries.
    if (chainage - tcChainage <= precision || ctChainage - chainage <= precision) continue
    append(chainage, String(rows.length), '')
  }
  append(ctChainage, 'CT', 'Curve/Tangent')
  const expectedTotal = delta * 90 / Math.PI
  const finalTotal = curveLength / radius * 90 / Math.PI
  const checkDiff = Math.abs(finalTotal - expectedTotal)
  return {
    rows,
    totalChord: rows.reduce((sum, row) => sum + row.chord, 0),
    checkTotalDeflection: `${horizontalDms(finalTotal)} (expected ${horizontalDms(expectedTotal)})`,
    arithmeticCheck: { passed: Math.abs(curveLength - expectedLength) <= precision, diffDeg: checkDiff },
    steps: [
      { description: 'Arc stationing L = CT - TC = RΔ', formula: `${ctChainage} - ${tcChainage}`, value: `${curveLength.toFixed(4)} m` },
      { description: 'Chord between consecutive pegs', formula: 'c = 2R sin((station - previous station)/(2R))', value: 'Metres; station interval is measured along the arc' },
      { description: 'Incremental deflection', formula: 'δ = (station - previous station)/(2R)', value: 'Radians, displayed as DMS' },
      { description: 'Cumulative deflection from TC tangent', formula: 'θ = (station - TC)/(2R)', value: `${horizontalDms(finalTotal)} at CT; Δ/2` },
    ],
  }
}

// ─── PART 3: VERTICAL CURVE DESIGN ────────────────────────────────────────────
// Source: RDM 1.3 Section 5.4
// Source: Ghilani & Wolf, Elementary Surveying 16th Ed., Chapter 25

export interface VerticalCurveInput {
  g1: number     // incoming grade (%)
  g2: number     // outgoing grade (%)
  vpiChainage: number
  vpiRL: number
  curveLength?: number   // if not given, compute from K
  kValue?: number          // if not given, compute from L
  interval?: number        // RL table interval (m)
}

export interface VerticalCurveRow {
  chainage: number
  rl: number
  y: number      // signed offset from the incoming tangent, metres
  x: number
  grade: number  // instantaneous grade, percent
  isBVC: boolean
  isEVC: boolean
  isPeak: boolean
  isSag: boolean
}

export interface VerticalCurveResult {
  A: number           // algebraic difference of grades
  L: number           // curve length
  K: number | null    // m/%; undefined for equal grades
  bvcChainage: number
  bvcRL: number
  evcChainage: number
  evcRL: number
  xPeak: number | null // stationary point in [BVC,EVC], otherwise absent
  chainagePeak: number | null
  rlPeak: number | null
  isCrest: boolean    // negative A (g2<g1) = crest, positive A (g2>g1) = sag
  curveType: 'crest' | 'sag' | 'straight'
  arithmeticCheck: { passed: boolean; diff: number }
  rows: VerticalCurveRow[]
  profileRows: VerticalCurveRow[] // bounded dense samples from the same equation
  steps: Array<{ description: string; formula: string; value: string }>
}

export function verticalCurve(input: VerticalCurveInput): VerticalCurveResult {
  const { g1, g2, vpiChainage, vpiRL, curveLength, kValue, interval = 20 } = input
  if (![g1, g2, vpiChainage, vpiRL].every(Number.isFinite)) throw new Error('Grades, VPI chainage and reduced level must be finite numbers.')
  if (!Number.isFinite(interval) || interval <= 0) throw new Error('RL table interval must be a finite positive number.')
  if ((curveLength === undefined) === (kValue === undefined)) throw new Error('Provide exactly one of curve length or K value.')
  const A = g2 - g1
  if (!Number.isFinite(A)) throw new Error('Grade difference exceeds numerical range.')
  const supplied = curveLength ?? kValue
  if (supplied === undefined || !Number.isFinite(supplied) || supplied <= 0) throw new Error('Curve length or K value must be a finite positive number.')
  if (kValue !== undefined && A === 0) throw new Error('K cannot determine a length for equal grades; enter an explicit length.')
  const L = curveLength ?? supplied * Math.abs(A)
  const K = A === 0 ? null : L / Math.abs(A)
  if (!Number.isFinite(L) || L <= 0 || (K !== null && (!Number.isFinite(K) || K <= 0))) throw new Error('Length or K exceeds numerical range.')
  const bvcChainage = vpiChainage - L / 2
  const evcChainage = vpiChainage + L / 2
  const bvcRL = vpiRL - (g1 / 100) * (L / 2)
  const evcRL = vpiRL + (g2 / 100) * (L / 2)
  const precision = 32 * Number.EPSILON * Math.max(1, Math.abs(bvcChainage), Math.abs(evcChainage), L)
  if (![bvcChainage, evcChainage, bvcRL, evcRL].every(Number.isFinite) ||
      !(bvcChainage < vpiChainage && vpiChainage < evcChainage) || precision > L * 1e-8) {
    throw new Error('Curve cannot be represented at this chainage or elevation precision.')
  }
  const startIndex = Math.floor(bvcChainage / interval) + 1
  const endIndex = Math.ceil(evcChainage / interval) - 1
  const count = Math.max(0, endIndex - startIndex + 1)
  if (!Number.isSafeInteger(startIndex) || !Number.isSafeInteger(endIndex) || count + 3 > 10000) {
    throw new Error('RL table interval exceeds the 10,000-row limit or available chainage precision; use a larger interval.')
  }
  const isCrest = A < 0
  const curveType = A === 0 ? 'straight' : isCrest ? 'crest' : 'sag'
  const candidateX = A === 0 ? NaN : (-g1 / A) * L
  const xPeak = Number.isFinite(candidateX) && candidateX >= 0 && candidateX <= L ? candidateX : null
  const chainagePeak = xPeak === null ? null : bvcChainage + xPeak
  function evaluate(chainage: number, x: number): VerticalCurveRow {
    const fraction = x / L
    const y = (A / 200) * x * fraction
    const rl = bvcRL + (g1 / 100) * x + y
    const grade = (1 - fraction) * g1 + fraction * g2
    if (![chainage, x, y, rl, grade].every(Number.isFinite)) throw new Error('Curve elevations exceed numerical range.')
    const stationary = chainagePeak !== null && Math.abs(chainage - chainagePeak) <= precision
    return { chainage, x, y, rl, grade, isBVC: x === 0, isEVC: x === L, isPeak: stationary && isCrest, isSag: stationary && A > 0 }
  }
  const rlPeak = xPeak === null || chainagePeak === null ? null : evaluate(chainagePeak, xPeak).rl
  const rlAtEVC = evaluate(evcChainage, L).rl
  const diff = rlAtEVC - evcRL
  const rlPrecision = 32 * Number.EPSILON * Math.max(1, Math.abs(vpiRL), Math.abs(bvcRL), Math.abs(evcRL), Math.abs(rlAtEVC))
  const arithmeticCheck = { passed: Math.abs(diff) <= rlPrecision, diff }
  if (!arithmeticCheck.passed) throw new Error('Endpoint elevation identity failed at available numerical precision.')
  const stations = [bvcChainage, evcChainage]
  for (let i = 0; i < count; i++) {
    const chainage = (startIndex + i) * interval
    if (chainage - bvcChainage > precision && evcChainage - chainage > precision &&
        (chainagePeak === null || Math.abs(chainage - chainagePeak) > precision)) stations.push(chainage)
  }
  if (chainagePeak !== null && chainagePeak - bvcChainage > precision && evcChainage - chainagePeak > precision) stations.push(chainagePeak)
  stations.sort((a, b) => a - b)
  const unique = stations.filter((station, i) => i === 0 || station - stations[i - 1] > precision)
  const rows = unique.map(station => evaluate(station, station === bvcChainage ? 0 : station === evcChainage ? L : station - bvcChainage))
  // Independent of requested peg density, so a long interval cannot flatten the drawing.
  const profileRows = Array.from({ length: 65 }, (_, i) => evaluate(bvcChainage + L * (i / 64), L * (i / 64)))
  if (chainagePeak !== null && xPeak !== null) {
    profileRows.push(evaluate(chainagePeak, xPeak))
    profileRows.sort((a, b) => a.chainage - b.chainage)
  }
  const steps = [
    { description: 'Grade change A = G₂ - G₁', formula: `${g2} - ${g1}`, value: `${A.toFixed(4)} percentage points` },
    { description: 'K = L / |A|', formula: A === 0 ? 'Equal grades: A = 0' : `${L} / ${Math.abs(A)}`, value: K === null ? 'Undefined for equal grades' : `${K.toFixed(4)} m/%` },
    { description: 'BVC = VPI - L/2; EVC = VPI + L/2', formula: `${vpiChainage} ± ${L / 2}`, value: `${bvcChainage.toFixed(4)} m to ${evcChainage.toFixed(4)} m` },
    { description: 'Elevation at horizontal distance x from BVC', formula: 'RL = BVC_RL + G₁x/100 + Ax²/(200L)', value: 'Grades in percent; distances and elevations in metres' },
    { description: 'Offset from incoming tangent', formula: 'y = Ax²/(200L)', value: 'Signed vertical offset, metres' },
    { description: 'Stationary point x = -G₁L/A', formula: 'Only retained when 0 ≤ x ≤ L and A ≠ 0', value: xPeak === null ? 'No unique stationary point on this curve' : `${xPeak.toFixed(4)} m from BVC` },
    { description: 'Endpoint elevation numerical identity', formula: `${rlAtEVC} versus ${evcRL}`, value: `Consistent; difference ${diff.toExponential(2)} m. Field acceptance is separate.` },
  ]
  return { A, L, K, bvcChainage, bvcRL, evcChainage, evcRL, xPeak, chainagePeak, rlPeak, isCrest, curveType, arithmeticCheck, rows, profileRows, steps }
}

// Road safety checks require explicit project criteria, with no inferred tables.
export { sightDistanceCheck, superelevationDesign, checkRadiusCompliance } from './roadSafetyCriteria'
export type { SightDistanceInput, SightDistanceResult, SuperelevationInput, SuperelevationResult } from './roadSafetyCriteria'
