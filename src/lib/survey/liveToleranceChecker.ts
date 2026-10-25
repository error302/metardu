/**
 * Field-side numerical closure comparison.
 *
 * Survey type is descriptive metadata, not an adopted accuracy specification.
 * Angular closure needs an explicit observation/layout model and remains unknown
 * here. Bowditch corrections are allocated corrections, not observation residuals.
 */
import { computeTraverse, type RawObservation, type TraverseComputationResult, type TraverseCriterion } from '@/lib/computations/traverseEngine'
import type { RDMConformanceResult } from '@/lib/standards/rdm11'
import { globalChiSquareTest } from '@/lib/survey/lsaStatisticalTesting'

export type SurveyType = 'cadastral' | 'engineering' | 'topographic' | 'control' | 'monitoring' | 'leveling' | 'construction'
export type ToleranceStatus = 'pass' | 'marginal' | 'fail' | 'insufficient_data' | 'not_assessed'

export interface ToleranceCheckInput {
  surveyType: SurveyType
  observations: RawObservation[]
  openingEasting: number
  openingNorthing: number
  openingStation: string
  closingEasting?: number
  closingNorthing?: number
  closingStation?: string
  backsightBearingDeg: number
  backsightBearingMin: number
  backsightBearingSec: number
  criterion?: TraverseCriterion
  levelingMisclosureMm?: number
  levelingDistanceKm?: number
  sigmaZero?: number
  degreesOfFreedom?: number
}

export interface WorstLegInfo {
  station: string
  from: string
  to: string
  /** Largest allocated Bowditch correction, not an observed residual. */
  residualMm: number
  diagnosis: string
  recommendation: string
}

export interface ToleranceCheckResult {
  /** Linear closure comparison only; not overall survey acceptance. */
  status: ToleranceStatus
  summary: string
  /** Compatibility field: no RDM conformance is inferred from survey type. */
  rdmChecks: RDMConformanceResult
  achievedOrder: string | null
  /** Supplied criterion reference, or Not specified. */
  requiredOrder: string
  precisionRatio: number | null
  linearMisclosureMm: number | null
  angularMisclosureArcsec: number | null
  perimeterKm: number
  worstLeg: WorstLegInfo | null
  lsaGlobalTest?: {
    passed: boolean
    chiSquareObserved: number
    chiSquareCritical: number
    interpretation: string
  }
  hasEnoughData: boolean
  recommendations: string[]
  timestamp: string
}

export function checkTolerance(input: ToleranceCheckInput): ToleranceCheckResult {
  const base: ToleranceCheckResult = {
    status: 'not_assessed',
    summary: 'Linear closure has not been assessed.',
    rdmChecks: { passed: false, checks: [], overallGrade: null },
    achievedOrder: null,
    requiredOrder: input.criterion?.reference || 'Not specified',
    precisionRatio: null,
    linearMisclosureMm: null,
    angularMisclosureArcsec: null,
    perimeterKm: 0,
    worstLeg: null,
    hasEnoughData: false,
    recommendations: [],
    timestamp: new Date().toISOString(),
  }
  if (!input.observations.length) return {
    ...base, status: 'insufficient_data', summary: 'At least one complete observation is required.',
    recommendations: ['Capture observations and declare the opening control and orientation.'],
  }
  let result: TraverseComputationResult
  try {
    result = computeTraverse(input)
  } catch (error) {
    return {
      ...base, status: 'fail',
      summary: `Traverse computation failed: ${error instanceof Error ? error.message : String(error)}`,
      recommendations: ['Review every source row, control coordinate and angle convention. No incomplete row was discarded.'],
    }
  }
  const recommendations = [
    result.assessment.reason,
    'Angular closure is unknown without an explicit setup, angle and closing-orientation model.',
    'This numerical comparison is not independent field verification or professional approval.',
  ]
  if (input.levelingMisclosureMm !== undefined || input.levelingDistanceKm !== undefined) {
    recommendations.push('Leveling tolerance was not assessed here; supply a separately adopted leveling specification and retained level-book evidence.')
  }
  let lsaGlobalTest: ToleranceCheckResult['lsaGlobalTest']
  if (input.sigmaZero !== undefined || input.degreesOfFreedom !== undefined) {
    const sigma = input.sigmaZero, dof = input.degreesOfFreedom
    if (typeof sigma === 'number' && Number.isFinite(sigma) && sigma >= 0 &&
        typeof dof === 'number' && Number.isSafeInteger(dof) && dof > 0 && Number.isFinite(dof * sigma * sigma)) {
      const test = globalChiSquareTest(sigma, dof, 0.05)
      if (Number.isFinite(test.chiSquareObserved) && Number.isFinite(test.chiSquareCritical)) {
        lsaGlobalTest = {
          passed: test.passed, chiSquareObserved: test.chiSquareObserved, chiSquareCritical: test.chiSquareCritical,
          interpretation: 'Statistical comparison of supplied sigma and degrees of freedom only; network provenance and stochastic model are not verified.',
        }
        if (!test.passed) recommendations.push('The supplied least-squares global-test values exceed the stated 95% critical limit; review the retained adjustment.')
      }
    }
    if (!lsaGlobalTest) recommendations.push('No statistical decision: valid sigma and positive integer degrees of freedom are required.')
  }
  const misclosure = result.C_mm
  return {
    ...base,
    status: result.assessment.status,
    summary: result.assessment.status === 'not_assessed' || misclosure === null
      ? `NOT ASSESSED — ${result.assessment.reason}`
      : `Linear closure ${result.assessment.status === 'pass' ? 'within' : 'exceeds'} stated limit: ${misclosure.toFixed(3)} mm; limit ${result.allowable} mm (${input.criterion?.reference ?? 'Not specified'}).`,
    precisionRatio: result.precisionRatio,
    linearMisclosureMm: misclosure,
    perimeterKm: result.K_km,
    worstLeg: largestAllocatedCorrection(result),
    lsaGlobalTest,
    hasEnoughData: true,
    recommendations,
  }
}

function largestAllocatedCorrection(result: TraverseComputationResult): WorstLegInfo | null {
  let selected: TraverseComputationResult['legs'][number] | undefined
  let magnitude = 0
  for (const leg of result.legs) {
    const correction = Math.hypot(leg.depCorrection, leg.latCorrection) * 1000
    if (correction > magnitude) { magnitude = correction; selected = leg }
  }
  if (!selected || magnitude < 1) return null
  return {
    station: selected.from, from: selected.from, to: selected.to, residualMm: magnitude,
    diagnosis: `Largest allocated Bowditch correction: ${magnitude.toFixed(1)} mm on ${selected.from} → ${selected.to}. This does not identify a bad observation.`,
    recommendation: 'Recheck the original observations and control network. Bowditch allocation is proportional to length and cannot locate a blunder.',
  }
}

export function getToleranceBadgeColor(status: ToleranceStatus): string {
  return status === 'pass' ? 'green' : status === 'fail' ? 'red' : status === 'marginal' ? 'yellow' : 'gray'
}
export function getToleranceBadgeLabel(status: ToleranceStatus): string {
  return status === 'pass' ? 'CLOSURE OK' : status === 'fail' ? 'CLOSURE FAIL' : status === 'marginal' ? 'MARGINAL' : status === 'not_assessed' ? 'NOT ASSESSED' : 'NEED MORE DATA'
}
/** Legacy text fallback; product badges use geometric SVG icons. */
export function getToleranceIcon(status: ToleranceStatus): string {
  return status === 'pass' ? '✓' : status === 'fail' ? '✗' : status === 'marginal' ? '!' : status === 'not_assessed' ? '—' : '···'
}
