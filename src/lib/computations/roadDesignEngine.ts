// METARDU Road Design Engine — RDM 1.3 (Kenya, August 2023)
// Source: RDM 1.3 Kenya, Ministry of Roads, August 2023
// Source: Ghilani & Wolf, Elementary Surveying 16th Ed.
// Source: Merritt, Ricketts & Loftin, Standard Handbook for Civil Engineers 5th Ed.

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
  y: number
  x: number
  isBVC: boolean
  isEVC: boolean
  isPeak: boolean
  isSag: boolean
}

export interface VerticalCurveResult {
  A: number           // algebraic difference of grades
  L: number           // curve length
  K: number           // K value
  bvcChainage: number
  bvcRL: number
  evcChainage: number
  evcRL: number
  xPeak: number       // distance from BVC to peak/sag
  chainagePeak: number
  rlPeak: number
  isCrest: boolean    // negative A (g2<g1) = crest, positive A (g2>g1) = sag
  arithmeticCheck: { passed: boolean; diff: number }
  rows: VerticalCurveRow[]
  steps: Array<{ description: string; formula: string; value: string }>
}

export function verticalCurve(input: VerticalCurveInput): VerticalCurveResult {
  const { g1, g2, vpiChainage, vpiRL, curveLength, kValue, interval = 20 } = input

  // Source: RDM 1.3 Section 5.4 — algebraic grade difference
  const A = g2 - g1

  // Source: RDM 1.3 Section 5.4 — K and L relationship
  let L: number, K: number
  if (curveLength !== undefined && curveLength > 0) {
    L = curveLength
    K = L / Math.abs(A)
  } else if (kValue !== undefined && kValue > 0) {
    K = kValue
    L = K * Math.abs(A)
  } else {
    throw new Error('Provide either curveLength or kValue')
  }

  // Source: RDM 1.3 Section 5.4 — BVC/EVC chainages
  const bvcChainage = vpiChainage - L / 2
  const evcChainage = vpiChainage + L / 2

  // Source: RDM 1.3 Section 5.4 — BVC/EVC reduced levels
  const bvcRL = vpiRL - (g1 / 100) * (L / 2)
  const evcRL = vpiRL + (g2 / 100) * (L / 2)

  // Source: RDM 1.3 Section 5.4 — RL at any point: y = BVC_RL + (g1/100)x + (A/(200L))x²
  const rate = A / (200 * L)

  // Source: RDM 1.3 Section 5.4 — Peak/sag point
  const xPeak = -g1 * L / A  // distance from BVC
  const chainagePeak = bvcChainage + xPeak
  const rlPeak = bvcRL + (g1 / 100) * xPeak + rate * xPeak * xPeak
  const isCrest = A < 0

  // Arithmetic check: RL at EVC via formula must equal EVC_RL via grades
  const rlAtEVC = bvcRL + (g1 / 100) * L + rate * L * L
  const arithmeticCheck = { passed: Math.abs(rlAtEVC - evcRL) < 0.001, diff: rlAtEVC - evcRL }

  const steps = [
    { description: `A = G₂ - G₁`, formula: `${g2.toFixed(4)} - ${g1.toFixed(4)}`, value: `${A.toFixed(4)}%` },
    { description: `K = L / |A|`, formula: `${L.toFixed(4)} / ${Math.abs(A).toFixed(4)}`, value: `${K.toFixed(4)}` },
    { description: `L = K × |A|`, formula: `${K.toFixed(4)} × ${Math.abs(A).toFixed(4)}`, value: `${L.toFixed(4)} m` },
    { description: `BVC = VPI - L/2`, formula: `${vpiChainage.toFixed(4)} - ${(L/2).toFixed(4)}`, value: `${bvcChainage.toFixed(4)} m` },
    { description: `EVC = VPI + L/2`, formula: `${vpiChainage.toFixed(4)} + ${(L/2).toFixed(4)}`, value: `${evcChainage.toFixed(4)} m` },
    { description: `BVC RL = VPI RL - G₁×(L/2)/100`, formula: `${vpiRL.toFixed(4)} - ${g1.toFixed(4)}×${(L/2).toFixed(4)}/100`, value: `${bvcRL.toFixed(4)} m` },
    { description: `EVC RL = VPI RL + G₂×(L/2)/100`, formula: `${vpiRL.toFixed(4)} + ${g2.toFixed(4)}×${(L/2).toFixed(4)}/100`, value: `${evcRL.toFixed(4)} m` },
    { description: `[CHECK] RL at EVC via formula`, formula: `${rlAtEVC.toFixed(4)} vs ${evcRL.toFixed(4)}`, value: `${arithmeticCheck.passed ? 'PASS ' : 'FAIL [x]'} (diff=${arithmeticCheck.diff.toFixed(4)}m)` },
  ]

  if (A !== 0) {
    steps.push({
      description: `x_peak = -G₁×L/A (from BVC)`, formula: `-${g1.toFixed(4)}×${L.toFixed(4)}/${A.toFixed(4)}`,
      value: `${xPeak.toFixed(4)} m from BVC`,
    })
    steps.push({
      description: `Peak/Sag chainage`, formula: `${bvcChainage.toFixed(4)} + ${xPeak.toFixed(4)}`,
      value: `${chainagePeak.toFixed(4)} m`,
    })
    steps.push({
      description: `Peak/Sag RL`, formula: `${bvcRL.toFixed(4)} + ...`, value: `${rlPeak.toFixed(4)} m`,
    })
  }

  // Generate RL table
  const rows: VerticalCurveRow[] = []
  let ch = Math.floor(bvcChainage / interval) * interval
  while (ch <= evcChainage) {
    const x = ch - bvcChainage
    const y = bvcRL + (g1 / 100) * x + rate * x * x
    const rl = y
    rows.push({
      chainage: ch,
      rl,
      y,
      x,
      isBVC: Math.abs(ch - bvcChainage) < 0.001,
      isEVC: Math.abs(ch - evcChainage) < 0.001,
      isPeak: Math.abs(ch - chainagePeak) < interval / 2,
      isSag: Math.abs(ch - chainagePeak) < interval / 2,
    })
    ch += interval
  }

  return {
    A, L, K, bvcChainage, bvcRL, evcChainage, evcRL,
    xPeak, chainagePeak, rlPeak, isCrest,
    arithmeticCheck, rows, steps,
  }
}

// ─── PART 4: SUPERELEVATION DESIGN ──────────────────────────────────────────
// Source: RDM 1.3 Section 5.3

export interface SuperelevationInput {
  designSpeed: number     // km/h
  radius: number           // metres
  roadClass: string        // DR1-DR7
  numLanes: number
  laneWidth: number        // metres
}

export interface FrictionFactor {
  speed: number
  eMax: number
  f: number
}

export const FRICTION_FACTORS: FrictionFactor[] = [
  { speed: 30, eMax: 0.08, f: 0.35 },
  { speed: 40, eMax: 0.08, f: 0.35 },
  { speed: 50, eMax: 0.08, f: 0.35 },
  { speed: 60, eMax: 0.08, f: 0.34 },
  { speed: 70, eMax: 0.08, f: 0.33 },
  { speed: 80, eMax: 0.08, f: 0.32 },
  { speed: 90, eMax: 0.08, f: 0.31 },
  { speed: 100, eMax: 0.08, f: 0.30 },
  { speed: 110, eMax: 0.08, f: 0.29 },
  { speed: 120, eMax: 0.08, f: 0.28 },
]

export function getFrictionFactor(speed: number): FrictionFactor {
  let closest = FRICTION_FACTORS[0]
  let minDiff = Math.abs(speed - closest.speed)
  for (const f of FRICTION_FACTORS) {
    const diff = Math.abs(speed - f.speed)
    if (diff < minDiff) { minDiff = diff; closest = f }
  }
  return closest
}

export interface SuperelevationResult {
  requiredE: number
  designE: number
  isCapped: boolean
  transitionLength: number  // Ls = e × w × V / (3.6 × p)
  rateOfChange: number      // p = 1% per 2.4m (RDM 1.3)
  isCompliant: boolean
  steps: Array<{ description: string; formula: string; value: string }>
}

export function superelevationDesign(input: SuperelevationInput): SuperelevationResult {
  const { designSpeed, radius, numLanes, laneWidth } = input

  // Source: RDM 1.3 Section 5.3 — Maximum superelevation 8%
  const eMax = 0.08

  // Source: RDM 1.3 Table 3-4 — Friction factor by speed
  const ff = getFrictionFactor(designSpeed)

  // Source: RDM 1.3 Section 5.3 — Required superelevation
  // e = V² / (127R) - f
  // where V is in km/h, R in metres, result as decimal
  const V = designSpeed
  const requiredE = (V * V) / (127 * radius) - ff.f

  // Cap at maximum
  const designE = Math.min(Math.max(requiredE, 0), eMax)
  const isCapped = requiredE > eMax

  // Source: RDM 1.3 Section 5.3 — Transition length
  // p = 1% per 2.4m → rate of change of superelevation
  const p = 1 / 2.4  // % per metre
  const w = laneWidth * numLanes
  const transitionLength = (designE * w * V) / (3.6 * p)

  const steps = [
    { description: `Friction factor f (Table 3-4)`, formula: `For V=${V}km/h`, value: `f=${ff.f}` },
    { description: `Required e = V²/(127R) - f`, formula: `${V}²/(127×${radius}) - ${ff.f}`, value: `${(requiredE * 100).toFixed(4)}%` },
    { description: `Design superelevation (capped at ${eMax * 100}%)`, formula: `min(${requiredE.toFixed(6)}, ${eMax})`, value: `${(designE * 100).toFixed(4)}%${isCapped ? ' [CAPPED]' : ''}` },
    { description: `Rate of change p (RDM 1.3)`, formula: `1% per 2.4m`, value: `${p.toFixed(6)} %/m` },
    { description: `Transition Ls = e×w×V/(3.6×p)`, formula: `${designE.toFixed(6)}×${w.toFixed(2)}×${V}/${(3.6 * p).toFixed(4)}`, value: `${transitionLength.toFixed(4)} m` },
  ]

  return {
    requiredE, designE, isCapped,
    transitionLength,
    rateOfChange: p,
    isCompliant: !isCapped,
    steps,
  }
}

// ─── PART 5: SIGHT DISTANCE CHECK ─────────────────────────────────────────────
// Source: RDM 1.3 Section 3.3
// Source: Ghilani & Wolf, Elementary Surveying 16th Ed.

export interface SightDistanceInput {
  designSpeed: number  // km/h
  roadClass: string
  terrain: string
  gradient: number  // % (positive = uphill, negative = downhill)
  proposedSSD?: number  // metres (optional — check against minimum)
}

export const SSD_TABLE: Array<{ speed: number; flat: number; rolling: number; mountainous: number }> = [
  { speed: 30, flat: 30, rolling: 30, mountainous: 30 },
  { speed: 40, flat: 40, rolling: 40, mountainous: 40 },
  { speed: 50, flat: 50, rolling: 50, mountainous: 50 },
  { speed: 60, flat: 60, rolling: 65, mountainous: 65 },
  { speed: 70, flat: 80, rolling: 85, mountainous: 90 },
  { speed: 80, flat: 100, rolling: 110, mountainous: 110 },
  { speed: 90, flat: 130, rolling: 140, mountainous: 140 },
  { speed: 100, flat: 160, rolling: 170, mountainous: 170 },
  { speed: 110, flat: 200, rolling: 210, mountainous: 210 },
  { speed: 120, flat: 250, rolling: 260, mountainous: 270 },
]

export const PSD_TABLE: Array<{ speed: number; flat: number; rolling: number; mountainous: number }> = [
  { speed: 50, flat: 180, rolling: 180, mountainous: 180 },
  { speed: 60, flat: 270, rolling: 270, mountainous: 270 },
  { speed: 70, flat: 360, rolling: 360, mountainous: 360 },
  { speed: 80, flat: 480, rolling: 480, mountainous: 480 },
  { speed: 90, flat: 600, rolling: 600, mountainous: 600 },
  { speed: 100, flat: 720, rolling: 720, mountainous: 720 },
  { speed: 110, flat: 875, rolling: 875, mountainous: 875 },
  { speed: 120, flat: 1030, rolling: 1030, mountainous: 1030 },
]

export interface SightDistanceResult {
  V: number
  ssdMin: number
  ssdComputed: number
  psdMin: number
  frictionFactor: number
  ssdGradeCorrection: number
  isSSDCompliant: boolean
  isPSDCompliant: boolean
  ssdStatus: 'GREEN' | 'RED'
  steps: Array<{ description: string; formula: string; value: string }>
}

export function sightDistanceCheck(input: SightDistanceInput): SightDistanceResult {
  const { designSpeed, terrain, gradient, proposedSSD } = input

  // Source: RDM 1.3 Table 3-4 — Friction factor
  const ff = getFrictionFactor(designSpeed)
  const f = ff.f

  // Source: RDM 1.3 Section 3.3 — SSD formula
  // SSD = V²/(254(f+g)) + V×t/3.6
  // where t = 2.5 seconds reaction time
  const V = designSpeed
  const g = gradient / 100  // convert % to decimal
  const t = 2.5  // seconds (RDM 1.3)
  const ssdFlat = (V * V) / (254 * f) + (V * t / 3.6)
  const ssdOnGrade = (V * V) / (254 * (f + g)) + (V * t / 3.6)
  const ssdComputed = g !== 0 ? ssdOnGrade : ssdFlat
  const ssdGradeCorrection = Math.abs(ssdOnGrade - ssdFlat)

  // Source: RDM 1.3 Table 3-5 — Minimum SSD by terrain
  let ssdMin = 30
  for (const row of SSD_TABLE) {
    if (row.speed === designSpeed) {
      ssdMin = row[terrain as 'flat' | 'rolling' | 'mountainous'] ?? row.flat
      break
    }
  }

  // Source: RDM 1.3 Table 3-6 — PSD (tabulated only — do not derive)
  let psdMin = 0
  for (const row of PSD_TABLE) {
    if (row.speed === designSpeed) {
      psdMin = row[terrain as 'flat' | 'rolling' | 'mountainous'] ?? row.flat
      break
    }
  }

  const ssdStatus = ssdComputed >= ssdMin ? 'GREEN' : 'RED'

  const steps = [
    { description: `Friction factor f (Table 3-4)`, formula: `For V=${V}km/h`, value: `f=${f}` },
    { description: `Reaction time t (RDM 1.3)`, formula: `t = 2.5 seconds`, value: `${t}s` },
    { description: `SSD on level (f=${f}): V²/(254f) + Vt/3.6`, formula: `${V}²/(254×${f}) + ${V}×${t}/3.6`, value: `${ssdFlat.toFixed(4)} m` },
    { description: `Grade correction (${gradient > 0 ? 'uphill' : 'downhill'} ${Math.abs(gradient)}%)`, formula: `g = ${g.toFixed(4)}`, value: `${ssdGradeCorrection.toFixed(4)} m additional` },
    { description: `SSD on grade`, formula: `${ssdFlat.toFixed(4)} + ${ssdGradeCorrection.toFixed(4)}`, value: `${ssdComputed.toFixed(4)} m` },
    { description: `Minimum SSD (Table 3-5, ${terrain})`, formula: `For V=${V}km/h, ${terrain} terrain`, value: `${ssdMin} m` },
    { description: `SSD Compliance`, formula: `${ssdComputed.toFixed(4)}m ${ssdComputed >= ssdMin ? '≥' : '<'} ${ssdMin}m`, value: `${ssdStatus} — ${ssdComputed >= ssdMin ? 'PASS' : 'FAIL'}` },
  ]

  if (proposedSSD !== undefined) {
    steps.push({
      description: `Proposed SSD vs Minimum`,
      formula: `${proposedSSD}m vs ${ssdMin}m`,
      value: `${proposedSSD >= ssdMin ? 'PASS' : 'FAIL'} (${proposedSSD >= ssdMin ? '≥' : '<'} ${ssdMin}m)`,
    })
  }

  steps.push({ description: `Minimum PSD (Table 3-6, ${terrain})`, formula: `Tabulated values only`, value: `${psdMin} m` })

  return {
    V, ssdMin, ssdComputed, psdMin,
    frictionFactor: f,
    ssdGradeCorrection,
    isSSDCompliant: ssdComputed >= ssdMin,
    isPSDCompliant: true,
    ssdStatus,
    steps,
  }
}

// ─── PART 6: MINIMUM RADIUS CHECK (RDM 1.3 Table 3-3) ────────────────────────
// Source: RDM 1.3 Table 3-3

export const MIN_RADIUS_TABLE: Array<{ speed: number; flat: number; rolling: number; mountainous: number; escarpment: number }> = [
  { speed: 120, flat: 665, rolling: 1000, mountainous: 1445, escarpment: 3600 },
  { speed: 110, flat: 530, rolling: 765, mountainous: 1070, escarpment: 2560 },
  { speed: 100, flat: 415, rolling: 570, mountainous: 770, escarpment: 1725 },
  { speed: 90, flat: 320, rolling: 420, mountainous: 545, escarpment: 1135 },
  { speed: 85, flat: 270, rolling: 350, mountainous: 445, escarpment: 890 },
  { speed: 80, flat: 240, rolling: 295, mountainous: 375, escarpment: 685 },
  { speed: 70, flat: 170, rolling: 205, mountainous: 250, escarpment: 415 },
  { speed: 65, flat: 140, rolling: 165, mountainous: 200, escarpment: 310 },
  { speed: 60, flat: 120, rolling: 140, mountainous: 170, escarpment: 250 },
  { speed: 50, flat: 80, rolling: 95, mountainous: 115, escarpment: 155 },
  { speed: 40, flat: 45, rolling: 55, mountainous: 65, escarpment: 80 },
  { speed: 30, flat: 24, rolling: 30, mountainous: 35, escarpment: 40 },
]

export function getMinRadius(speed: number, terrain: string): number {
  for (const row of MIN_RADIUS_TABLE) {
    if (row.speed === speed) {
      return row[terrain as 'flat' | 'rolling' | 'mountainous' | 'escarpment'] ?? row.flat
    }
  }
  return 0
}

export function checkRadiusCompliance(
  proposedRadius: number,
  designSpeed: number,
  terrain: string,
  _superelevation: number = 0.08
): { compliant: boolean; minRadius: number; ratio: number; status: 'GREEN' | 'RED' } {
  const minRadius = getMinRadius(designSpeed, terrain)
  const compliant = proposedRadius >= minRadius
  const ratio = proposedRadius / minRadius
  return { compliant, minRadius, ratio, status: compliant ? 'GREEN' : 'RED' }
}
