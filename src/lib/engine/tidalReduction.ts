/**
 * Hydrographic Tidal Reduction — Reduce soundings to Chart Datum.
 *
 * Standards:
 *   - IHO S-44, Edition 6 (2022) §5.2 — Hydrographic survey accuracy standards
 *   - IHO S-32 (Hydrographic Dictionary) — Chart Datum (CD) definition
 *   - Admiralty Tide Tables (ATT) — Tidal prediction and reduction
 *   - RDM 1.1 Kenya 2025, §12 — Hydrographic survey procedures
 *
 * Conventions:
 *   - Observed depth: measured below water surface at time of observation (m).
 *   - Tide level: water surface elevation above Chart Datum (m).
 *   - Reduced depth: depth below Chart Datum = observed depth + tide level.
 *   - All times in ISO 8601 (UTC or local as specified).
 *   - No intermediate rounding; full floating point throughout.
 */

// ─── TYPES ─────────────────────────────────────────────────────────────────────

export interface Sounding {
  easting: number
  northing: number
  observedDepth: number // metres below water surface at time of observation
  time: string // ISO 8601
}

export interface TideObservation {
  time: string // ISO 8601
  tideLevel: number // metres above Chart Datum (CD)
}

export interface ReducedSounding {
  easting: number
  northing: number
  observedDepth: number
  reducedDepth: number // metres below Chart Datum
  tideLevel: number // interpolated tide level at observation time
  time: string
  correction: number // tideLevel (added to observed depth)
}

export interface TidalConstants {
  MHWS: number // Mean High Water Springs (m above CD)
  MLWS: number // Mean Low Water Springs (m above CD)
  MSL: number  // Mean Sea Level (m above CD)
  MHWN: number // Mean High Water Neaps (m above CD)
  MLWN: number // Mean Low Water Neaps (m above CD)
  springRange: number // MHWS - MLWS
  neapRange: number // MHWN - MLWN
  observationCount: number
  periodHours: number
}

export interface TideCurvePoint {
  time: string
  level: number
}

// ─── TIME HELPERS ──────────────────────────────────────────────────────────────

/**
 * Parse ISO 8601 time string to Unix timestamp (ms).
 */
function parseTime(t: string): number {
  return new Date(t).getTime()
}

/**
 * Linear interpolation of tide level at a given time.
 *
 * For a sounding at time t, find the bracketing tide observations (t1, t2)
 * and linearly interpolate:
 *
 *   tide(t) = tide1 + (tide2 − tide1) × (t − t1) / (t2 − t1)
 *
 * If t is before the first observation or after the last, extrapolate
 * using the nearest segment (with a warning flag).
 *
 * Ref: Admiralty Tide Tables — Tidal interpolation method (IHO S-32).
 *
 * @returns { level, extrapolated }
 */
function interpolateTide(
  time: string,
  tideObservations: TideObservation[]
): { level: number; extrapolated: boolean } {
  if (tideObservations.length === 0) {
    throw new Error('No tide observations provided for interpolation.')
  }

  const t = parseTime(time)

  // Sort observations by time
  const sorted = [...tideObservations].sort(
    (a, b) => parseTime(a.time) - parseTime(b.time)
  )

  // Before first observation — extrapolate
  if (t <= parseTime(sorted[0].time)) {
    if (sorted.length < 2) {
      return { level: sorted[0].tideLevel, extrapolated: true }
    }
    const t1 = parseTime(sorted[0].time)
    const t2 = parseTime(sorted[1].time)
    const z1 = sorted[0].tideLevel
    const z2 = sorted[1].tideLevel
    const dt = t2 - t1
    if (dt === 0) return { level: z1, extrapolated: true }
    const level = z1 + (z2 - z1) * ((t - t1) / dt)
    return { level, extrapolated: true }
  }

  // After last observation — extrapolate
  if (t >= parseTime(sorted[sorted.length - 1].time)) {
    const n = sorted.length
    if (n < 2) {
      return { level: sorted[0].tideLevel, extrapolated: true }
    }
    const t1 = parseTime(sorted[n - 2].time)
    const t2 = parseTime(sorted[n - 1].time)
    const z1 = sorted[n - 2].tideLevel
    const z2 = sorted[n - 1].tideLevel
    const dt = t2 - t1
    if (dt === 0) return { level: z2, extrapolated: true }
    const level = z2 + (z2 - z1) * ((t - t2) / dt)
    return { level, extrapolated: true }
  }

  // Between observations — interpolate
  for (let i = 0; i < sorted.length - 1; i++) {
    const t1 = parseTime(sorted[i].time)
    const t2 = parseTime(sorted[i + 1].time)
    if (t >= t1 && t <= t2) {
      const z1 = sorted[i].tideLevel
      const z2 = sorted[i + 1].tideLevel
      const dt = t2 - t1
      if (dt === 0) return { level: (z1 + z2) / 2, extrapolated: false }
      const level = z1 + (z2 - z1) * ((t - t1) / dt)
      return { level, extrapolated: false }
    }
  }

  return { level: 0, extrapolated: true }
}

// ─── MAIN FUNCTIONS ────────────────────────────────────────────────────────────

/**
 * Reduce soundings to Chart Datum using tidal observations.
 *
 * For each sounding:
 *   1. Find tide level at observation time by linear interpolation.
 *   2. Reduced depth = observed depth + tide level.
 *
 * Convention (IHO S-44):
 *   - Tide level > 0 means water surface is above CD.
 *   - Reduced depth is always positive (below CD).
 *   - If reduced depth ≤ 0, the sounding is above Chart Datum (drying area).
 *
 * Ref: IHO S-44 Ed. 6 §5.2 — "All depths shall be reduced to Chart Datum."
 *
 * @param soundings - Observed soundings with positions, depths, and timestamps
 * @param tideObservations - Tide gauge readings (time, level above CD)
 * @returns Array of reduced soundings with interpolated tide corrections
 */
export function reduceSoundings(
  soundings: Sounding[],
  tideObservations: TideObservation[]
): ReducedSounding[] {
  if (soundings.length === 0) return []
  if (tideObservations.length === 0) {
    throw new Error('At least one tide observation is required for tidal reduction.')
  }

  const sortedTides = [...tideObservations].sort(
    (a, b) => parseTime(a.time) - parseTime(b.time)
  )

  return soundings.map(s => {
    const { level: tideLevel } = interpolateTide(s.time, sortedTides)
    const reducedDepth = s.observedDepth + tideLevel

    return {
      easting: s.easting,
      northing: s.northing,
      observedDepth: s.observedDepth,
      reducedDepth,
      tideLevel,
      time: s.time,
      correction: tideLevel,
    }
  })
}

/**
 * Compute tidal constants from a series of tide observations.
 *
 * This simplified analysis computes:
 *   - MSL (Mean Sea Level): average of all observations
 *   - MHWS (Mean High Water Springs): average of the upper quartile of high waters
 *   - MLWS (Mean Low Water Springs): average of the lower quartile of low waters
 *   - MHWN (Mean High Water Neaps): average of all observations above MSL
 *   - MLWN (Mean Low Water Neaps): average of all observations below MSL
 *
 * Note: For production tidal analysis, a full harmonic analysis using
 *       least-squares fitting of constituent amplitudes is recommended
 *       (Ref: Admiralty Manual of Tides, NP120).
 *
 * Ref: IHO S-32 — Tidal datum definitions.
 *       Admiralty Tide Tables — Method of determining tidal constants.
 *
 * @param tideObservations - Time series of tide gauge readings
 * @returns TidalConstants object with MHWS, MLWS, MSL, etc.
 */
export function computeTidalConstants(
  tideObservations: TideObservation[]
): TidalConstants {
  if (tideObservations.length < 2) {
    throw new Error('At least 2 tide observations required for tidal constant computation.')
  }

  const levels = tideObservations.map(t => t.tideLevel).sort((a, b) => a - b)
  const n = levels.length

  // Mean Sea Level — arithmetic mean of all observations
  const sum = levels.reduce((a, b) => a + b, 0)
  const MSL = sum / n

  // Identify local maxima (high waters) and minima (low waters)
  const sorted = [...tideObservations].sort(
    (a, b) => parseTime(a.time) - parseTime(b.time)
  )
  const highWaters: number[] = []
  const lowWaters: number[] = []

  for (let i = 1; i < sorted.length - 1; i++) {
    const prev = sorted[i - 1].tideLevel
    const curr = sorted[i].tideLevel
    const next = sorted[i + 1].tideLevel
    if (curr >= prev && curr >= next) highWaters.push(curr)
    if (curr <= prev && curr <= next) lowWaters.push(curr)
  }

  // If not enough turning points, use quartile-based approach
  let MHWS: number
  let MLWS: number
  let MHWN: number
  let MLWN: number

  if (highWaters.length >= 2 && lowWaters.length >= 2) {
    // Sort high waters and take upper portion (springs)
    highWaters.sort((a, b) => b - a)
    lowWaters.sort((a, b) => a - b)

    const springCount = Math.max(1, Math.ceil(highWaters.length * 0.3))
    MHWS = highWaters.slice(0, springCount).reduce((a, b) => a + b, 0) / springCount
    MLWS = lowWaters.slice(0, springCount).reduce((a, b) => a + b, 0) / springCount

    // Neaps: use all high/low waters below/above median
    const aboveMsl = highWaters.filter(h => h <= MSL + (MHWS - MSL) * 0.5)
    const belowMsl = lowWaters.filter(l => l >= MSL - (MSL - MLWS) * 0.5)
    MHWN = aboveMsl.length > 0
      ? aboveMsl.reduce((a, b) => a + b, 0) / aboveMsl.length
      : MSL + (MHWS - MSL) * 0.5
    MLWN = belowMsl.length > 0
      ? belowMsl.reduce((a, b) => a + b, 0) / belowMsl.length
      : MSL - (MSL - MLWS) * 0.5
  } else {
    // Quartile-based estimation
    const upperQ = levels.slice(Math.floor(n * 0.75))
    const lowerQ = levels.slice(0, Math.ceil(n * 0.25))
    MHWS = upperQ.reduce((a, b) => a + b, 0) / upperQ.length
    MLWS = lowerQ.reduce((a, b) => a + b, 0) / lowerQ.length

    const midUpper = levels.slice(Math.floor(n * 0.5), Math.floor(n * 0.75))
    const midLower = levels.slice(Math.ceil(n * 0.25), Math.floor(n * 0.5))
    MHWN = midUpper.length > 0
      ? midUpper.reduce((a, b) => a + b, 0) / midUpper.length
      : (MSL + MHWS) / 2
    MLWN = midLower.length > 0
      ? midLower.reduce((a, b) => a + b, 0) / midLower.length
      : (MSL + MLWS) / 2
  }

  const springRange = MHWS - MLWS
  const neapRange = MHWN - MLWN

  // Period in hours
  const firstTime = parseTime(sorted[0].time)
  const lastTime = parseTime(sorted[sorted.length - 1].time)
  const periodHours = (lastTime - firstTime) / (1000 * 60 * 60)

  return {
    MHWS,
    MLWS,
    MSL,
    MHWN,
    MLWN,
    springRange,
    neapRange,
    observationCount: n,
    periodHours,
  }
}

// ─── TIDE CURVE GENERATION ────────────────────────────────────────────────────

/**
 * Generate a tide curve (time, level) for charting purposes.
 * Returns evenly-spaced interpolated points between first and last observation.
 *
 * @param tideObservations - Tide gauge readings
 * @param numPoints - Number of points to generate (default 100)
 * @returns Array of { time, level } points
 */
export function generateTideCurve(
  tideObservations: TideObservation[],
  numPoints: number = 100
): TideCurvePoint[] {
  if (tideObservations.length < 2) return []

  const sorted = [...tideObservations].sort(
    (a, b) => parseTime(a.time) - parseTime(b.time)
  )

  const firstTime = parseTime(sorted[0].time)
  const lastTime = parseTime(sorted[sorted.length - 1].time)
  const dt = lastTime - firstTime

  if (dt === 0) return [{ time: sorted[0].time, level: sorted[0].tideLevel }]

  const points: TideCurvePoint[] = []
  for (let i = 0; i < numPoints; i++) {
    const t = firstTime + (i / (numPoints - 1)) * dt
    const isoTime = new Date(t).toISOString()
    const { level } = interpolateTide(isoTime, sorted)
    points.push({ time: isoTime, level })
  }

  return points
}

// ─── CSV PARSING ───────────────────────────────────────────────────────────────

/**
 * Parse CSV text into Sounding array.
 * Expected format: easting,northing,depth,time (header optional).
 */
export function parseSoundingCSV(csv: string): Sounding[] {
  const lines = csv.trim().split(/\r?\n/)
  const soundings: Sounding[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('easting')) continue

    const parts = trimmed.split(/[,\t;]+/)
    if (parts.length >= 4) {
      const easting = parseFloat(parts[0].trim())
      const northing = parseFloat(parts[1].trim())
      const depth = parseFloat(parts[2].trim())
      const time = parts[3].trim()
      if (!isNaN(easting) && !isNaN(northing) && !isNaN(depth) && time) {
        soundings.push({ easting, northing, observedDepth: depth, time })
      }
    }
  }

  return soundings
}

/**
 * Parse CSV text into TideObservation array.
 * Expected format: time,level (header optional).
 * Time should be parseable ISO 8601 string.
 */
export function parseTideCSV(csv: string): TideObservation[] {
  const lines = csv.trim().split(/\r?\n/)
  const observations: TideObservation[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('time')) continue

    const parts = trimmed.split(/[,\t;]+/)
    if (parts.length >= 2) {
      const time = parts[0].trim()
      const level = parseFloat(parts[1].trim())
      if (!isNaN(level) && time) {
        observations.push({ time, tideLevel: level })
      }
    }
  }

  return observations
}

/**
 * Export reduced soundings to CSV.
 */
export function reducedSoundingsToCSV(soundings: ReducedSounding[]): string {
  const header = 'Easting,Northing,Observed Depth (m),Tide Level (m),Reduced Depth (m),Time'
  const rows = soundings.map(s =>
    `${s.easting.toFixed(3)},${s.northing.toFixed(3)},${s.observedDepth.toFixed(3)},${s.tideLevel.toFixed(3)},${s.reducedDepth.toFixed(3)},${s.time}`
  )
  return [header, ...rows].join('\n')
}
