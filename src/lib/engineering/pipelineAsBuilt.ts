/** Measured longitudinal pipe profile. Numerical screening only, not issue approval. */
import { outsideCrownRiseM, coverBelowMinimum } from './pipeGeometry'
export const PIPELINE_AS_BUILT_VERSION = '2.0.0'
export const MAX_PIPELINE_POINTS = 1000
export interface PipelinePoint {
  id?: string
  chainage: number
  /** Bottom INSIDE the pipe, in the declared height reference. */
  invertElevation: number
  groundElevation?: number | null
  /** Actual internal diameter (mm), not a nominal catalogue size. */
  pipeDiameter?: number | null
  /** Actual manufacturer outside diameter (mm). */
  outsideDiameter?: number | null
  jointType?: string
  remarks?: string
}
export interface PipelineCoverCriterion {
  minimumCoverM: number
  source: string
  revision: string
}
export interface AnalyzedPipelinePoint extends PipelinePoint {
  groundElevation: number | null
  pipeDiameter: number | null
  outsideDiameter: number | null
  outsideCrownRl: number | null
  coverDepth: number | null
  coverAdequate: boolean | null
  /** Positive fall downstream; null for the final observation. */
  grade: number | null
  segmentLengthM: number | null
  assessmentNote: string
}
export interface PipelineAnalysisResult {
  points: AnalyzedPipelinePoint[]
  criterion: PipelineCoverCriterion | null
  minCover: number | null
  minCoverLocation: number | null
  inadequateCoverCount: number
  unassessedCoverCount: number
  maxGrade: number | null
  issues: string[]
  algorithmVersion: string
  summary: string
}
function finite(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite.`)
  return value
}
function optional(value: number | null | undefined, label: string, positive = false): number | null {
  if (value === undefined || value === null) return null
  const number = finite(value, label)
  if (positive && number <= 0) throw new Error(`${label} must be positive.`)
  return number
}
export function analyzePipelineAsBuilt(points: PipelinePoint[], criterion?: PipelineCoverCriterion | null): PipelineAnalysisResult {
  if (!Array.isArray(points) || !points.length) throw new Error('Enter at least one measured pipe observation.')
  if (points.length > MAX_PIPELINE_POINTS) throw new Error(`The profile limit is ${MAX_PIPELINE_POINTS} observations; no rows are truncated.`)
  let adopted: PipelineCoverCriterion | null = null
  if (criterion != null) {
    if (typeof criterion !== 'object' || !Number.isFinite(criterion.minimumCoverM) || criterion.minimumCoverM <= 0
      || typeof criterion.source !== 'string' || !criterion.source.trim()
      || typeof criterion.revision !== 'string' || !criterion.revision.trim()) throw new Error('Cover comparison needs a positive minimum, specification reference and revision.')
    adopted = { minimumCoverM: criterion.minimumCoverM, source: criterion.source.trim(), revision: criterion.revision.trim() }
  }
  const names = new Set<string>()
  const measured = points.map((point, index) => {
    const label = `Observation ${index + 1}`
    if (!point || typeof point !== 'object') throw new Error(`${label} is invalid.`)
    if (point.id !== undefined && (typeof point.id !== 'string' || !point.id.trim())) throw new Error(`${label}: enter a nonempty observation ID.`)
    if (point.id && names.has(point.id.trim())) throw new Error(`${label}: observation ID is duplicated.`)
    if (point.id) names.add(point.id.trim())
    finite(point.chainage, `${label} chainage`); finite(point.invertElevation, `${label} internal invert RL`)
    if (index && point.chainage <= points[index - 1].chainage) throw new Error(`${label}: chainage must strictly increase in the entered downstream order.`)
    const internal = optional(point.pipeDiameter, `${label} internal diameter`, true)
    const outside = optional(point.outsideDiameter, `${label} outside diameter`, true)
    if (internal !== null && outside !== null && outside < internal) throw new Error(`${label}: outside diameter cannot be less than internal diameter.`)
    return { ...point, id: point.id?.trim(), groundElevation: optional(point.groundElevation, `${label} ground RL`), pipeDiameter: internal, outsideDiameter: outside }
  })
  const issues: string[] = []
  const analyzed: AnalyzedPipelinePoint[] = measured.map((point, index) => {
    // Wall thickness = (OD - ID) / 2; outer crown above INTERNAL invert = ID + wall.
    const outsideCrownRl = point.pipeDiameter !== null && point.outsideDiameter !== null
      ? finite(point.invertElevation + outsideCrownRiseM(point.pipeDiameter, point.outsideDiameter), 'Calculated outside crown RL') : null
    const coverDepth = point.groundElevation !== null && outsideCrownRl !== null
      ? finite(point.groundElevation - outsideCrownRl, 'Calculated cover') : null
    const next = measured[index + 1]
    const segmentLengthM = next ? finite(next.chainage - point.chainage, 'Segment length') : null
    const grade = next && segmentLengthM !== null
      ? finite((point.invertElevation - next.invertElevation) / segmentLengthM * 100, 'Calculated invert grade') : null
    if (grade !== null && grade <= 0) issues.push(`${point.id || `Observation ${index + 1}`}: ${grade < 0 ? 'invert rises' : 'invert is level'} towards the next entered observation; review the intended flow direction/design.`)
    const coverAdequate = coverDepth !== null && adopted !== null
      ? !coverBelowMinimum(coverDepth, adopted.minimumCoverM, point.groundElevation as number, point.invertElevation) : null
    const assessmentNote = coverDepth === null ? 'Cover not assessed: surveyed ground RL and actual internal/outside diameters are required.'
      : adopted === null ? 'Cover measured; no referenced project minimum was supplied.'
        : coverAdequate ? 'Meets the entered numerical minimum only.' : 'Below the entered numerical minimum.'
    return { ...point, outsideCrownRl, coverDepth, coverAdequate, grade, segmentLengthM, assessmentNote }
  })
  const covers = analyzed.filter(point => point.coverDepth !== null)
  const lowest = covers.reduce<AnalyzedPipelinePoint | null>((best, point) => !best || (point.coverDepth as number) < (best.coverDepth as number) ? point : best, null)
  const grades = analyzed.flatMap(point => point.grade === null ? [] : [Math.abs(point.grade)])
  const unassessedCoverCount = analyzed.filter(point => point.coverAdequate === null).length
  const inadequateCoverCount = analyzed.filter(point => point.coverAdequate === false).length
  return {
    points: analyzed, criterion: adopted, minCover: lowest?.coverDepth ?? null, minCoverLocation: lowest?.chainage ?? null,
    inadequateCoverCount, unassessedCoverCount, maxGrade: grades.length ? Math.max(...grades) : null,
    issues, algorithmVersion: PIPELINE_AS_BUILT_VERSION,
    summary: `${analyzed.length} measured observation(s); ${covers.length} with calculable cover. ${adopted ? `${inadequateCoverCount} below the entered minimum; ${unassessedCoverCount} unassessed.` : 'No project cover criterion: all cover comparisons unassessed.'} Control, design compliance, uncertainty, utilities and contractual acceptance are not assessed by this profile.`,
  }
}
