// Screening calculations against explicitly declared project criteria.
// A reference supplied by a caller is provenance, not independent verification.
export interface CriterionReference { reference: string }
export interface SightDistanceCriteria extends CriterionReference {
  longitudinalFriction: number
  reactionTimeSeconds: number
  minimumStoppingDistanceM?: number
  minimumPassingDistanceM?: number
}
export interface SightDistanceInput {
  designSpeed: number
  gradient: number
  proposedSSD?: number // available distance, metres; zero is retained
  proposedPSD?: number
  criteria?: SightDistanceCriteria // required at runtime; legacy omissions fail closed
}
export interface SuperelevationCriteria extends CriterionReference {
  lateralFriction: number
  maximumSuperelevation: number // slope ratio, e.g. 0.08 = 8%
  maximumRelativeGradient: number // edge-to-axis gradient ratio, e.g. 0.005 = 0.5%
}
export interface SuperelevationInput {
  designSpeed: number
  radius: number
  numLanes: number // lanes actually rotated about the declared axis
  laneWidth: number
  initialCrossfall: number // signed slope ratio; adverse crossfall is negative
  providedSuperelevation: number // inward slope ratio; never automatically capped
  criteria?: SuperelevationCriteria
}
export interface RadiusCriteria extends CriterionReference { minimumRadiusM: number }
type Step = { description: string; formula: string; value: string }
type AssessmentStatus = 'PASS' | 'FAIL' | 'UNASSESSED'

function reference(criteria: CriterionReference | undefined): string {
  if (!criteria || typeof criteria !== 'object' || typeof criteria.reference !== 'string' || !criteria.reference.trim() || criteria.reference.trim().length > 512) {
    throw new Error('Explicit project criteria and a reference/revision (up to 512 characters) are required.')
  }
  return criteria.reference.trim()
}
function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`)
  return value
}
function positive(value: number, label: string): number {
  if (finite(value, label) <= 0) throw new Error(`${label} must be positive.`)
  return value
}
function fraction(value: number, label: string, allowZero = true): number {
  finite(value, label)
  if (value < 0 || value >= 1 || (!allowZero && value === 0)) throw new Error(`${label} must be ${allowZero ? 'at least zero' : 'positive'} and less than one as a ratio.`)
  return value
}
function optionalPositive(value: number | undefined, label: string) {
  if (value !== undefined) positive(value, label)
}
function available(value: number | undefined, label: string) {
  if (value !== undefined && finite(value, label) < 0) throw new Error(`${label} must be zero or positive.`)
}
function status(value: boolean | null): AssessmentStatus { return value === null ? 'UNASSESSED' : value ? 'PASS' : 'FAIL' }

export function sightDistanceCheck(input: SightDistanceInput) {
  const criteriaReference = reference(input.criteria)
  const criteria = input.criteria as SightDistanceCriteria
  const V = positive(input.designSpeed, 'Design speed')
  const gradient = finite(input.gradient, 'Gradient')
  const f = fraction(criteria.longitudinalFriction, 'Longitudinal friction', false)
  const t = positive(criteria.reactionTimeSeconds, 'Reaction time')
  optionalPositive(criteria.minimumStoppingDistanceM, 'Declared minimum SSD')
  optionalPositive(criteria.minimumPassingDistanceM, 'Declared minimum PSD')
  available(input.proposedSSD, 'Available SSD')
  available(input.proposedPSD, 'Available PSD')
  const denominator = f + gradient / 100
  if (denominator <= 0) throw new Error('Longitudinal friction plus signed grade must be positive; this braking model cannot assess the supplied downhill grade.')
  const reactionDistance = V * t / 3.6
  const brakingDistance = V * V / (254 * denominator)
  const ssdFlat = V * V / (254 * f) + reactionDistance
  const ssdComputed = brakingDistance + reactionDistance
  const ssdGradeCorrection = ssdComputed - ssdFlat
  const requiredSSD = Math.max(ssdComputed, criteria.minimumStoppingDistanceM ?? 0)
  if (![reactionDistance, brakingDistance, ssdFlat, ssdComputed, ssdGradeCorrection, requiredSSD].every(Number.isFinite) || reactionDistance <= 0 || brakingDistance <= 0 || ssdComputed <= 0) throw new Error('Stopping distance exceeds numerical range.')
  const isSSDCompliant = input.proposedSSD === undefined ? null : input.proposedSSD >= requiredSSD
  const isPSDCompliant = input.proposedPSD === undefined || criteria.minimumPassingDistanceM === undefined ? null : input.proposedPSD >= criteria.minimumPassingDistanceM
  const steps: Step[] = [
    { description: 'Declared criteria reference', formula: criteriaReference, value: 'User-declared; standard adoption and independent verification remain separate' },
    { description: 'Reaction distance', formula: `Vt/3.6 = ${V} × ${t}/3.6`, value: `${reactionDistance.toFixed(4)} m` },
    { description: 'Braking distance', formula: `V²/[254(f + grade/100)]; f = ${f}, grade = ${gradient}%`, value: `${brakingDistance.toFixed(4)} m` },
    { description: 'Model SSD on grade', formula: 'Reaction distance + braking distance', value: `${ssdComputed.toFixed(4)} m` },
    { description: 'Signed grade correction', formula: 'SSD on grade - SSD on level', value: `${ssdGradeCorrection.toFixed(4)} m` },
    { description: 'Required SSD for this comparison', formula: 'max(model SSD, supplied minimum SSD if any)', value: `${requiredSSD.toFixed(4)} m` },
    { description: 'Available SSD comparison', formula: input.proposedSSD === undefined ? 'Available distance not supplied' : `${input.proposedSSD} m ≥ ${requiredSSD.toFixed(4)} m`, value: status(isSSDCompliant) },
    { description: 'Available PSD comparison', formula: 'Both available PSD and an adopted minimum PSD are required', value: status(isPSDCompliant) },
  ]
  return { V, ssdFlat, reactionDistance, brakingDistance, ssdComputed, ssdGradeCorrection, requiredSSD,
    ssdMin: criteria.minimumStoppingDistanceM ?? null, psdMin: criteria.minimumPassingDistanceM ?? null,
    frictionFactor: f, isSSDCompliant, isPSDCompliant, ssdStatus: status(isSSDCompliant), psdStatus: status(isPSDCompliant),
    criteria: { ...criteria, reference: criteriaReference }, criteriaReference,
    assessmentBasis: 'declared-project-criteria' as const, standardCompliance: 'NOT_ASSESSED' as const, steps }
}
export type SightDistanceResult = ReturnType<typeof sightDistanceCheck>

export function superelevationDesign(input: SuperelevationInput) {
  const criteriaReference = reference(input.criteria)
  const criteria = input.criteria as SuperelevationCriteria
  const V = positive(input.designSpeed, 'Design speed')
  const radius = positive(input.radius, 'Radius')
  const lanes = positive(input.numLanes, 'Lanes rotated')
  if (!Number.isSafeInteger(lanes)) throw new Error('Lanes rotated must be a positive integer.')
  const width = lanes * positive(input.laneWidth, 'Lane width')
  const f = fraction(criteria.lateralFriction, 'Lateral friction')
  const maximumE = fraction(criteria.maximumSuperelevation, 'Maximum superelevation', false)
  const relativeGradient = fraction(criteria.maximumRelativeGradient, 'Maximum relative gradient', false)
  const providedE = fraction(input.providedSuperelevation, 'Provided superelevation')
  const initial = finite(input.initialCrossfall, 'Initial crossfall')
  if (Math.abs(initial) >= 1) throw new Error('Initial crossfall must be between -1 and 1 as a signed ratio.')
  const lateralDemand = V * V / (127 * radius)
  const requiredE = Math.max(0, lateralDemand - f)
  const crossfallChange = Math.abs(providedE - initial)
  const transitionLength = width * (crossfallChange / relativeGradient)
  const minimumRadiusAtLimit = V * V / (127 * (f + maximumE))
  if (![width, lateralDemand, requiredE, transitionLength, minimumRadiusAtLimit].every(Number.isFinite) || width <= 0 || lateralDemand <= 0 || minimumRadiusAtLimit <= 0 || (crossfallChange > 0 && transitionLength <= 0)) throw new Error('Superelevation calculation exceeds numerical range.')
  const checks = { withinSuperelevationLimit: providedE <= maximumE, lateralDemandMet: providedE + f >= lateralDemand }
  const steps: Step[] = [
    { description: 'Declared criteria reference', formula: criteriaReference, value: 'User-declared; no automatic jurisdiction or design-standard approval' },
    { description: 'Lateral demand', formula: `V²/(127R) = ${V}²/(127 × ${radius})`, value: lateralDemand.toFixed(6) },
    { description: 'Minimum banking from declared side friction', formula: `max(0, V²/(127R) - ${f})`, value: `${(requiredE * 100).toFixed(4)}%` },
    { description: 'Provided banking', formula: 'Retained as entered; not silently capped', value: `${(providedE * 100).toFixed(4)}%` },
    { description: 'Rotated width', formula: `${lanes} × ${input.laneWidth}`, value: `${width.toFixed(4)} m` },
    { description: 'Crossfall rotation length', formula: 'width × |final crossfall - initial crossfall| / relative gradient', value: `${transitionLength.toFixed(4)} m` },
  ]
  return { requiredE, designE: providedE, transitionLength, rotatedWidth: width, minimumRadiusAtLimit, checks,
    status: checks.withinSuperelevationLimit && checks.lateralDemandMet ? 'PASS' as const : 'FAIL' as const,
    criteria: { ...criteria, reference: criteriaReference }, criteriaReference,
    assessmentBasis: 'declared-project-criteria' as const, standardCompliance: 'NOT_ASSESSED' as const, steps }
}
export type SuperelevationResult = ReturnType<typeof superelevationDesign>

export function checkRadiusCompliance(proposedRadius: number, criteria?: RadiusCriteria) {
  const criteriaReference = reference(criteria)
  const minRadius = positive((criteria as RadiusCriteria).minimumRadiusM, 'Declared minimum radius')
  positive(proposedRadius, 'Proposed radius')
  const ratio = proposedRadius / minRadius
  if (!Number.isFinite(ratio)) throw new Error('Radius ratio exceeds numerical range.')
  const meetsMinimum = proposedRadius >= minRadius
  return { minRadius, ratio, meetsMinimum, status: meetsMinimum ? 'PASS' as const : 'FAIL' as const,
    criteriaReference, assessmentBasis: 'declared-project-criteria' as const, standardCompliance: 'NOT_ASSESSED' as const }
}
