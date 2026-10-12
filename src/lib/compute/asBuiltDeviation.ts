/**
 * As-built deviation screening against a user-supplied design profile and
 * project tolerance. These calculations do not determine contractual or
 * regulatory acceptance.
 */

export type DeviationStatus = 'pass' | 'marginal' | 'fail' | 'unassessed'

export interface DesignStation {
  /** Chainage in metres */
  chainage: number
  /** Design elevation (reduced level) in metres */
  elevation: number
}

export interface AsBuiltPoint {
  id: string
  /** Chainage in metres */
  chainage: number
  /** Measured (as-built) elevation (reduced level) in metres */
  elevation: number
  /** Optional offset from centerline (metres, negative=left, positive=right) */
  offset?: number
  /** Optional description (e.g., "left edge", "centreline") */
  description?: string
}

export interface DeviationResult {
  pointId: string
  chainage: number
  asBuiltElevation: number
  designElevation: number | null
  /** ΔZ = as-built - design (positive = too high, negative = too low) */
  deltaZ: number | null
  /** Absolute deviation in mm */
  deviationMm: number | null
  status: DeviationStatus
  offset?: number
  description?: string
  assessmentNote?: string
}

export interface ToleranceBand {
  label: string
  /** User-supplied maximum vertical deviation in mm (absolute). */
  passLimit: number
  /** User-supplied review band upper limit in mm. */
  marginalLimit: number
}

export interface DeviationReport {
  results: DeviationResult[]
  stats: {
    /** All entered as-built records, including records that could not be assessed. */
    total: number
    pass: number
    marginal: number
    fail: number
    unassessed: number
    maxDeviationMm: number | null
    avgDeviationMm: number | null
    /** Share of all entered records inside the selected pass band. */
    passRate: number
  }
  issues: string[]
  tolerance: ToleranceBand
}

/** Illustrative values only; do not treat these as current authority specifications. */
export const TOLERANCE_SCREENING_PRESETS: ToleranceBand[] = [
  { label: 'Earthworks screening (±20 mm)', passLimit: 20, marginalLimit: 25 },
  { label: 'Subbase screening (±10 mm)', passLimit: 10, marginalLimit: 15 },
  { label: 'Base course screening (±5 mm)', passLimit: 5, marginalLimit: 8 },
  { label: 'Concrete pavement screening (±5 mm)', passLimit: 5, marginalLimit: 8 },
  { label: 'Bituminous surface screening (±5 mm)', passLimit: 5, marginalLimit: 8 },
  { label: 'Custom project values', passLimit: Number.NaN, marginalLimit: Number.NaN },
]

interface PreparedDesignProfile {
  stations: DesignStation[]
  issue: string | null
}

/** Sort once, reject ambiguous/invalid controls, then reuse for all observations. */
function prepareDesignProfile(designStations: DesignStation[]): PreparedDesignProfile {
  if (designStations.length === 0) return { stations: [], issue: 'No design stations were supplied.' }
  if (designStations.some(station => !Number.isFinite(station.chainage) || !Number.isFinite(station.elevation))) {
    return { stations: [], issue: 'Design stations must have finite chainages and elevations.' }
  }

  const stations = [...designStations].sort((a, b) => a.chainage - b.chainage)
  for (let index = 1; index < stations.length; index += 1) {
    if (stations[index].chainage === stations[index - 1].chainage) {
      return { stations: [], issue: `Design chainage ${stations[index].chainage} is duplicated; the profile is ambiguous.` }
    }
  }
  return { stations, issue: null }
}

function interpolateSortedProfile(stations: DesignStation[], chainage: number): number | null {
  if (!Number.isFinite(chainage) || stations.length === 0) return null
  if (chainage < stations[0].chainage || chainage > stations[stations.length - 1].chainage) return null
  if (stations.length === 1) return chainage === stations[0].chainage ? stations[0].elevation : null

  let low = 0
  let high = stations.length - 1
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2)
    const station = stations[middle]
    if (chainage === station.chainage) return station.elevation
    if (chainage < station.chainage) high = middle - 1
    else low = middle + 1
  }

  const before = stations[high]
  const after = stations[low]
  if (!before || !after) return null
  const fraction = (chainage - before.chainage) / (after.chainage - before.chainage)
  return before.elevation + fraction * (after.elevation - before.elevation)
}

/** Interpolate only inside supplied design coverage; never extrapolate a profile. */
export function interpolateDesignElevation(
  designStations: DesignStation[],
  chainage: number,
): number | null {
  const prepared = prepareDesignProfile(designStations)
  return prepared.issue ? null : interpolateSortedProfile(prepared.stations, chainage)
}

/**
 * Compare as-built elevations against user-entered limits. Each input record
 * appears in the report: invalid records and chainages outside the supplied
 * design range are marked unassessed and never assigned a fabricated delta.
 */
export function checkDeviations(
  designStations: DesignStation[],
  asBuiltPoints: AsBuiltPoint[],
  tolerance: ToleranceBand,
): DeviationReport {
  if (!tolerance.label.trim() || !Number.isFinite(tolerance.passLimit) || tolerance.passLimit < 0
    || !Number.isFinite(tolerance.marginalLimit) || tolerance.marginalLimit < tolerance.passLimit) {
    throw new RangeError('Enter a finite non-negative pass limit and a marginal limit greater than or equal to it.')
  }

  const profile = prepareDesignProfile(designStations)
  let invalidPointCount = 0
  let uncoveredPointCount = 0

  const results = asBuiltPoints.map((point, index): DeviationResult => {
    const pointId = point.id.trim() || `Point ${index + 1}`
    if (!Number.isFinite(point.chainage) || !Number.isFinite(point.elevation)) {
      invalidPointCount += 1
      return {
        pointId,
        chainage: point.chainage,
        asBuiltElevation: point.elevation,
        designElevation: null,
        deltaZ: null,
        deviationMm: null,
        status: 'unassessed',
        offset: point.offset,
        description: point.description,
        assessmentNote: 'Enter finite chainage and observed RL values; no deviation was calculated.',
      }
    }

    if (profile.issue) {
      return {
        pointId,
        chainage: point.chainage,
        asBuiltElevation: point.elevation,
        designElevation: null,
        deltaZ: null,
        deviationMm: null,
        status: 'unassessed',
        offset: point.offset,
        description: point.description,
        assessmentNote: profile.issue,
      }
    }

    const designElevation = interpolateSortedProfile(profile.stations, point.chainage)
    if (designElevation === null) {
      uncoveredPointCount += 1
      return {
        pointId,
        chainage: point.chainage,
        asBuiltElevation: point.elevation,
        designElevation: null,
        deltaZ: null,
        deviationMm: null,
        status: 'unassessed',
        offset: point.offset,
        description: point.description,
        assessmentNote: 'Chainage is outside the supplied design profile; no extrapolation was used.',
      }
    }

    const deltaZ = point.elevation - designElevation
    const deviationMm = Math.abs(deltaZ) * 1000
    const status: DeviationStatus = deviationMm <= tolerance.passLimit
      ? 'pass'
      : deviationMm <= tolerance.marginalLimit
        ? 'marginal'
        : 'fail'

    return {
      pointId,
      chainage: point.chainage,
      asBuiltElevation: point.elevation,
      designElevation,
      deltaZ,
      deviationMm,
      status,
      offset: point.offset,
      description: point.description,
    }
  })

  let pass = 0
  let marginal = 0
  let fail = 0
  let unassessed = 0
  let assessedCount = 0
  let deviationSum = 0
  let maxDeviationMm = 0
  for (const result of results) {
    if (result.status === 'pass') pass += 1
    else if (result.status === 'marginal') marginal += 1
    else if (result.status === 'fail') fail += 1
    else unassessed += 1

    if (result.deviationMm !== null) {
      assessedCount += 1
      deviationSum += result.deviationMm
      maxDeviationMm = Math.max(maxDeviationMm, result.deviationMm)
    }
  }

  const issues: string[] = []
  if (profile.issue) issues.push(`Design profile not assessed: ${profile.issue}`)
  if (invalidPointCount > 0) issues.push(`${invalidPointCount} as-built record(s) have invalid chainage or observed RL and were not assessed.`)
  if (uncoveredPointCount > 0) issues.push(`${uncoveredPointCount} as-built point(s) fall outside the supplied design chainage range; they were not extrapolated.`)
  if (marginal > 0) issues.push(`${marginal} point(s) are in the selected review band and need project-specific review.`)
  if (fail > 0) issues.push(`${fail} point(s) exceed the selected screening band; acceptance criteria must come from the approved project specification.`)
  if (results.length === 0) issues.push('No as-built points were supplied.')

  return {
    results,
    stats: {
      total: results.length,
      pass,
      marginal,
      fail,
      unassessed,
      maxDeviationMm: assessedCount > 0 ? maxDeviationMm : null,
      avgDeviationMm: assessedCount > 0 ? deviationSum / assessedCount : null,
      passRate: results.length > 0 ? (pass / results.length) * 100 : 0,
    },
    issues,
    tolerance: { ...tolerance },
  }
}

export function getStatusColor(status: DeviationStatus): string {
  switch (status) {
    case 'pass': return 'var(--success)'
    case 'marginal': return 'var(--warning)'
    case 'fail': return 'var(--error)'
    case 'unassessed': return 'var(--text-muted)'
  }
}

export function getStatusLabel(status: DeviationStatus): string {
  switch (status) {
    case 'pass': return 'WITHIN BAND'
    case 'marginal': return 'NEAR LIMIT'
    case 'fail': return 'OUTSIDE BAND'
    case 'unassessed': return 'NOT ASSESSED'
  }
}
