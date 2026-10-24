import { checkRadiusCompliance, checkSuperelevationLimit, sightDistanceCheck } from '../computations/roadSafetyCriteria'

export interface RoadQualityCriteria {
  reference: string
  minimumRadiusM?: number
  maximumSuperelevation?: number
  longitudinalFriction?: number
  reactionTimeSeconds?: number
  minimumStoppingDistanceM?: number
}

/** Declared measurements/criteria only. A reference is not verified adoption. */
export interface RoadQualityInput {
  designSpeedKph?: number // needed only for the stopping-distance model
  horizontalCurveRadiusM?: number
  gradePercent?: number
  availableSightDistanceM?: number
  superelevation?: number
  sideFriction?: number // legacy attribution only; never a guessed radius criterion
  criteria?: RoadQualityCriteria
}

export interface RoadQualityFinding {
  rule: string
  source: 'metardu_qc'
  severity: 'block' | 'info'
  message: string
  field: string
  actual?: number
  allowable?: number
  unit?: string
  assessment: 'PASS' | 'FAIL' | 'UNASSESSED'
  criteriaReference?: string
  roadEvidence?: Record<string, number | null>
  standardCompliance: 'NOT_ASSESSED'
}

export function roadAssessmentNotRequested(): RoadQualityFinding {
  return { rule: 'metardu_qc.road_unassessed', source: 'metardu_qc', severity: 'info', field: 'engineering',
    message: 'Road design is unassessed: no road measurements/criteria were requested. Other configured survey checks do not assess road design.',
    assessment: 'UNASSESSED', standardCompliance: 'NOT_ASSESSED' }
}

function compare(rule: string, field: string, unit: string, label: string,
  operation: () => { actual: number; allowable: number; passed: boolean; reference: string; evidence: Record<string, number | null> }): RoadQualityFinding[] {
  try {
    const result = operation()
    return [{ rule, source: 'metardu_qc', field, unit, actual: result.actual, allowable: result.allowable,
      severity: result.passed ? 'info' : 'block', assessment: result.passed ? 'PASS' : 'FAIL', criteriaReference: result.reference,
      roadEvidence: result.evidence, standardCompliance: 'NOT_ASSESSED', message: `${label} ${result.passed ? 'meets' : 'does not meet'} the declared criterion (${result.reference}). Only this comparison is assessed; standards adoption and complete road design remain unassessed.` }]
  } catch (error) {
    return [{ rule, source: 'metardu_qc', severity: 'block', field, assessment: 'UNASSESSED', standardCompliance: 'NOT_ASSESSED',
      message: `${label} unassessed: ${error instanceof Error ? error.message : 'Review the supplied road evidence.'}` }]
  }
}

export function roadRadiusFindings(input: RoadQualityInput): RoadQualityFinding[] {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return [{ ...roadAssessmentNotRequested(), severity: 'block',
    message: 'Road design is unassessed: the requested road evidence must be an object.' }]
  if (input.horizontalCurveRadiusM === undefined) {
    if (input.availableSightDistanceM === undefined && input.superelevation === undefined) return [{ ...roadAssessmentNotRequested(), severity: 'block',
      message: 'Road design is unassessed: a road-check request needs at least one supplied radius, available stopping distance or banking measurement.' }]
    return []
  }
  return compare('metardu_qc.road_radius', 'engineering.horizontalCurveRadiusM', 'm', 'Horizontal radius', () => {
    const result = checkRadiusCompliance(input.horizontalCurveRadiusM as number, input.criteria ? {
      reference: input.criteria.reference, minimumRadiusM: input.criteria.minimumRadiusM as number } : undefined)
    return { actual: input.horizontalCurveRadiusM as number, allowable: result.minRadius, passed: result.meetsMinimum, reference: result.criteriaReference,
      evidence: { horizontalCurveRadiusM: input.horizontalCurveRadiusM as number, minimumRadiusM: result.minRadius } }
  })
}

export function roadSightDistanceFindings(input: RoadQualityInput): RoadQualityFinding[] {
  if (input.availableSightDistanceM === undefined) return []
  return compare('metardu_qc.road_sight_distance', 'engineering.availableSightDistanceM', 'm', 'Available stopping sight distance', () => {
    if (!Number.isFinite(input.gradePercent)) throw new Error('An explicit finite signed road grade is required; level grade is not assumed.')
    const result = sightDistanceCheck({ designSpeed: input.designSpeedKph as number, gradient: input.gradePercent as number,
      proposedSSD: input.availableSightDistanceM, criteria: input.criteria ? { reference: input.criteria.reference,
        longitudinalFriction: input.criteria.longitudinalFriction as number, reactionTimeSeconds: input.criteria.reactionTimeSeconds as number,
        minimumStoppingDistanceM: input.criteria.minimumStoppingDistanceM } : undefined })
    return { actual: input.availableSightDistanceM as number, allowable: result.requiredSSD, passed: result.isSSDCompliant === true, reference: result.criteriaReference,
      evidence: { designSpeedKph: result.V, gradePercent: input.gradePercent as number, availableSightDistanceM: input.availableSightDistanceM as number,
        longitudinalFriction: result.criteria.longitudinalFriction, reactionTimeSeconds: result.criteria.reactionTimeSeconds,
        minimumStoppingDistanceM: result.ssdMin } }
  })
}

export function roadBankingFindings(input: RoadQualityInput): RoadQualityFinding[] {
  if (input.superelevation === undefined) return []
  return compare('metardu_qc.road_superelevation', 'engineering.superelevation', '%', 'Provided banking', () => {
    const result = checkSuperelevationLimit(input.superelevation as number, input.criteria ? { reference: input.criteria.reference,
      maximumSuperelevation: input.criteria.maximumSuperelevation as number } : undefined)
    return { actual: result.providedE * 100, allowable: result.maximumE * 100, passed: result.meetsLimit, reference: result.criteriaReference,
      evidence: { providedSuperelevation: result.providedE, maximumSuperelevation: result.maximumE } }
  })
}
