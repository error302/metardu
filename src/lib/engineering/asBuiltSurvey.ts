// METARDU As-Built comparison helpers.
// The presets below are legacy defaults and must be checked against each
// project's approved specification; they are not statutory acceptance rules.

// ─── TYPES ─────────────────────────────────────────────────────────────────────

export interface DesignPoint {
  chainage: number
  designLevel: number
  designEasting?: number
  designNorthing?: number
}

export interface AsBuiltPoint {
  chainage: number
  surveyedLevel: number
  surveyedEasting?: number
  surveyedNorthing?: number
  timestamp?: string
  surveyor?: string
}

export interface ToleranceBand {
  level: number     // mm — vertical tolerance (±)
  horizontal: number // mm — horizontal tolerance (±)
}

export interface AsBuiltComparisonRow {
  chainage: number
  designLevel: number
  asBuiltLevel: number
  deviation: number      // mm — positive = built higher
  tolerance: number      // mm
  pass: boolean
  designEasting?: number
  designNorthing?: number
  asBuiltEasting?: number
  asBuiltNorthing?: number
  horizontalDeviation?: number
  horizontalPass?: boolean
}

export interface AsBuiltSummary {
  /** Total supplied observations, including records outside design coverage. */
  totalPoints: number
  /** Supplied observations that could not be compared to a valid design profile. */
  unassessedPoints: number
  passCount: number
  failCount: number
  passRate: number
  maxLevelDeviation: number | null
  maxHorizontalDeviation: number
  horizontalPointsAssessed: number
  meanLevelDeviation: number | null
  standardDeviation: number | null
  rmsError: number | null
  allPointsWithinTolerance: boolean
  issues: string[]
}

export interface AsBuiltSurveyResult {
  comparisons: AsBuiltComparisonRow[]
  summary: AsBuiltSummary
  toleranceBand: ToleranceBand
}

// ─── Legacy comparison presets (not a substitute for contract tolerances) ─────

export const TOLERANCE_BANDS: Record<string, ToleranceBand> = {
  paved: { level: 25, horizontal: 50 },
  gravel: { level: 50, horizontal: 100 },
  earth: { level: 100, horizontal: 150 },
  bridge: { level: 10, horizontal: 25 },
}

export const DEFAULT_TOLERANCE = TOLERANCE_BANDS.paved

// ─── STATISTICS ────────────────────────────────────────────────────────────────

export interface Statistics {
  mean: number
  stdDev: number
  rms: number
  max: number
  min: number
}

export function computeStatistics(deviations: number[]): Statistics {
  if (deviations.length === 0) {
    return { mean: 0, stdDev: 0, rms: 0, max: 0, min: 0 }
  }

  const n = deviations.length
  const mean = deviations.reduce((s, d) => s + d, 0) / n
  const variance = deviations.reduce((s, d) => s + (d - mean) ** 2, 0) / n
  const stdDev = Math.sqrt(variance)
  const rms = Math.sqrt(deviations.reduce((s, d) => s + d ** 2, 0) / n)

  let max = Number.NEGATIVE_INFINITY
  let min = Number.POSITIVE_INFINITY
  for (const deviation of deviations) {
    max = Math.max(max, deviation)
    min = Math.min(min, deviation)
  }

  return {
    mean,
    stdDev,
    rms,
    max,
    min,
  }
}

// ─── INTERPOLATION ─────────────────────────────────────────────────────────────

function prepareProfile<T extends { chainage: number }>(points: T[]): T[] | null {
  if (points.some(point => !Number.isFinite(point.chainage))) return null
  const sorted = [...points].sort((a, b) => a.chainage - b.chainage)
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].chainage === sorted[index - 1].chainage) return null
  }
  return sorted
}

function findProfileBracket<T extends { chainage: number }>(points: T[], targetChainage: number): [T, T] | T | null {
  if (!Number.isFinite(targetChainage) || points.length === 0) return null
  let low = 0
  let high = points.length - 1
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2)
    const point = points[middle]
    if (targetChainage === point.chainage) return point
    if (targetChainage < point.chainage) high = middle - 1
    else low = middle + 1
  }
  if (high < 0 || low >= points.length) return null
  return [points[high], points[low]]
}

function interpolateLevel(points: Array<{ chainage: number; level: number }>, targetChainage: number): number | null {
  const bracket = findProfileBracket(points, targetChainage)
  if (!bracket) return null
  if (!Array.isArray(bracket)) return bracket.level
  const [before, after] = bracket
  const fraction = (targetChainage - before.chainage) / (after.chainage - before.chainage)
  return before.level + fraction * (after.level - before.level)
}

function interpolateCoord(points: Array<{ chainage: number; easting: number; northing: number }>, targetChainage: number): { easting: number; northing: number } | null {
  const bracket = findProfileBracket(points, targetChainage)
  if (!bracket) return null
  if (!Array.isArray(bracket)) return { easting: bracket.easting, northing: bracket.northing }
  const [before, after] = bracket
  const fraction = (targetChainage - before.chainage) / (after.chainage - before.chainage)
  return {
    easting: before.easting + fraction * (after.easting - before.easting),
    northing: before.northing + fraction * (after.northing - before.northing),
  }
}

// ─── MAIN COMPARISON ──────────────────────────────────────────────────────────

export function compareDesignVsAsBuilt(
  design: DesignPoint[],
  asBuilt: AsBuiltPoint[],
  tolerance: ToleranceBand = DEFAULT_TOLERANCE
): AsBuiltSurveyResult {
  const comparisons: AsBuiltComparisonRow[] = []
  const issues: string[] = []

  if (!Number.isFinite(tolerance.level) || tolerance.level < 0 || !Number.isFinite(tolerance.horizontal) || tolerance.horizontal < 0) {
    throw new RangeError('Vertical and horizontal tolerances must be finite, non-negative project values.')
  }

  if (asBuilt.length === 0) {
    return {
      comparisons: [],
      summary: {
        totalPoints: 0, unassessedPoints: 0, passCount: 0, failCount: 0, passRate: 0,
        maxLevelDeviation: null, maxHorizontalDeviation: 0, horizontalPointsAssessed: 0,
        meanLevelDeviation: null, standardDeviation: null, rmsError: null,
        allPointsWithinTolerance: false, issues: ['No as-built survey data provided'],
      },
      toleranceBand: tolerance,
    }
  }

  // Prepare and validate profiles once; each observation then uses binary search.
  const designLevels = design.every(d => Number.isFinite(d.chainage) && Number.isFinite(d.designLevel))
    ? prepareProfile(design.map(d => ({ chainage: d.chainage, level: d.designLevel })))
    : null
  const designCoords = design
    .filter((d): d is typeof d & { designEasting: number; designNorthing: number } => Number.isFinite(d.designEasting) && Number.isFinite(d.designNorthing))
    .map(d => ({ chainage: d.chainage, easting: d.designEasting, northing: d.designNorthing }))
  const sortedDesignCoords = prepareProfile(designCoords)

  if (!designLevels) issues.push('The design profile contains non-finite values or duplicate chainages; observations were not assessed.')

  for (const ab of asBuilt) {
    if (!designLevels || !Number.isFinite(ab.chainage) || !Number.isFinite(ab.surveyedLevel)) continue
    const designLevel = interpolateLevel(designLevels, ab.chainage)
    if (designLevel === null) {
      // No design data at this chainage — skip or warn
      continue
    }

    const levelDeviation = (ab.surveyedLevel - designLevel) * 1000 // convert m to mm
    const levelPass = Math.abs(levelDeviation) <= tolerance.level

    // Horizontal comparison
    let horizontalDeviation: number | undefined
    let horizontalPass: boolean | undefined

    // Interpolate design coordinates at this chainage
    const designCoord = sortedDesignCoords && sortedDesignCoords.length > 0
      ? interpolateCoord(sortedDesignCoords, ab.chainage)
      : null

    if (ab.surveyedEasting !== undefined && ab.surveyedNorthing !== undefined && Number.isFinite(ab.surveyedEasting) && Number.isFinite(ab.surveyedNorthing) && designCoord) {
      const dE = ab.surveyedEasting - designCoord.easting
      const dN = ab.surveyedNorthing - designCoord.northing
      horizontalDeviation = Math.sqrt(dE * dE + dN * dN) * 1000 // m to mm
      horizontalPass = horizontalDeviation <= tolerance.horizontal
    }

    comparisons.push({
      chainage: ab.chainage,
      designLevel,
      asBuiltLevel: ab.surveyedLevel,
      deviation: Math.round(levelDeviation * 10) / 10,
      tolerance: tolerance.level,
      pass: levelPass && (horizontalPass ?? true),
      designEasting: designCoord?.easting,
      designNorthing: designCoord?.northing,
      asBuiltEasting: ab.surveyedEasting,
      asBuiltNorthing: ab.surveyedNorthing,
      horizontalDeviation: horizontalDeviation !== undefined ? Math.round(horizontalDeviation * 10) / 10 : undefined,
      horizontalPass,
    })
  }

  // Compute statistics
  const levelDeviations = comparisons.map(c => Math.abs(c.deviation))
  const stats = computeStatistics(levelDeviations)

  const passCount = comparisons.filter(c => c.pass).length
  const failCount = comparisons.length - passCount

  // Max horizontal deviation
  const horizDevs = comparisons
    .filter((c): c is typeof c & { horizontalDeviation: number } => c.horizontalDeviation !== undefined)
    .map(c => c.horizontalDeviation)
  const maxHorizontalDeviation = horizDevs.reduce((max, deviation) => Math.max(max, deviation), 0)
  const unassessedPoints = asBuilt.length - comparisons.length
  const allPointsWithinTolerance = comparisons.length > 0 && comparisons.length === asBuilt.length && passCount === comparisons.length && horizDevs.length === comparisons.length

  // Generate issues
  if (failCount > 0) {
    issues.push(`${failCount} evaluated point(s) exceed the selected tolerance. Confirm acceptance criteria against the approved project specification.`)
  }
  if (stats.max > tolerance.level * 2) {
    issues.push(`Maximum deviation (${stats.max.toFixed(1)}mm) exceeds 2x tolerance (${tolerance.level * 2}mm)`)
  }
  if (stats.mean > tolerance.level * 0.5) {
    issues.push(`Mean deviation (${stats.mean.toFixed(1)}mm) indicates systematic error`)
  }
  if (comparisons.length < 20) {
    issues.push(`Only ${comparisons.length} matched point(s) were evaluated. Confirm that the observations provide adequate coverage of the works.`)
  }
  if (unassessedPoints > 0) issues.push(`${unassessedPoints} supplied observation(s) could not be compared and remain not assessed.`)
  if (comparisons.length === 0 && designLevels) issues.push('No as-built chainages fall within the supplied design profile; no comparison was made.')
  if (comparisons.some((c) => c.horizontalDeviation === undefined)) {
    issues.push('Horizontal tolerance was not evaluated for every point because design or as-built coordinates were missing.')
  }

  return {
    comparisons,
    summary: {
      totalPoints: asBuilt.length,
      unassessedPoints,
      passCount,
      failCount,
      passRate: asBuilt.length > 0 ? Math.round((passCount / asBuilt.length) * 1000) / 10 : 0,
      maxLevelDeviation: comparisons.length > 0 ? stats.max : null,
      maxHorizontalDeviation,
      horizontalPointsAssessed: horizDevs.length,
      meanLevelDeviation: comparisons.length > 0 ? Math.round(stats.mean * 10) / 10 : null,
      standardDeviation: comparisons.length > 0 ? Math.round(stats.stdDev * 10) / 10 : null,
      rmsError: comparisons.length > 0 ? Math.round(stats.rms * 10) / 10 : null,
      allPointsWithinTolerance,
      issues,
    },
    toleranceBand: tolerance,
  }
}

// ─── CERTIFICATE DATA ──────────────────────────────────────────────────────────

export interface AsBuiltCertificate {
  certificateNumber: string
  status: 'draft'
  issueDate: string
  projectName: string
  roadName: string
  roadClass: string
  chainageStart: number
  chainageEnd: number
  surveyorName: string
  surveyorLicense: string
  result: AsBuiltSummary
}

export function generateAsBuiltCertificate(data: {
  projectName: string
  roadName: string
  roadClass: string
  chainageStart: number
  chainageEnd: number
  surveyorName: string
  surveyorLicense: string
  date: string
  result: AsBuiltSurveyResult
}): AsBuiltCertificate {
  return {
    certificateNumber: `DRAFT-ABC-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    status: 'draft',
    issueDate: data.date,
    projectName: data.projectName,
    roadName: data.roadName,
    roadClass: data.roadClass,
    chainageStart: data.chainageStart,
    chainageEnd: data.chainageEnd,
    surveyorName: data.surveyorName,
    surveyorLicense: data.surveyorLicense,
    result: data.result.summary,
  }
}

// ─── CSV PARSING ───────────────────────────────────────────────────────────────

export function parseAsBuiltCSV(csv: string): AsBuiltPoint[] {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return []

  const points: AsBuiltPoint[] = []
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim())
    if (cols.length < 2) continue

    const chainage = parseFloat(cols[0])
    const level = parseFloat(cols[1])
    if (isNaN(chainage) || isNaN(level)) continue

    points.push({
      chainage,
      surveyedLevel: level,
      surveyedEasting: cols[2] ? parseFloat(cols[2]) : undefined,
      surveyedNorthing: cols[3] ? parseFloat(cols[3]) : undefined,
    })
  }

  return points
}
