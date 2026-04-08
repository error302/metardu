/**
 * Tidal Reduction Engine — Phase 19
 * Reduces raw echo sounder depths to a common datum
 * by subtracting the interpolated water level at time of observation.
 *
 * Reference: IHO S-44 (6th edition), Section 4
 * Kenya datum: Mean Sea Level (MSL) referenced to KMD tide gauge network
 */

export interface RawSounding {
  x: number
  y: number
  depthM: number
  timestamp: string
}

export interface TideObservation {
  timestamp: string
  waterLevelM: number
}

export interface ReducedSounding {
  x: number
  y: number
  rawDepthM: number
  waterLevelM: number
  reducedDepthM: number
  timestamp: string
}

export interface TidalReductionResult {
  reducedSoundings: ReducedSounding[]
  meanWaterLevel: number
  maxWaterLevel: number
  minWaterLevel: number
  warnings: string[]
}

export function reduceSoundings(
  soundings: RawSounding[],
  tideObs: TideObservation[]
): TidalReductionResult {
  const warnings: string[] = []

  if (soundings.length === 0) {
    throw new Error('No soundings provided for tidal reduction.')
  }

  if (tideObs.length === 0) {
    warnings.push(
      'No tide observations provided. Applying zero tidal correction — ' +
      'reduced depths equal raw depths. Verify against tide tables before submission.'
    )
  }

  const sortedTide = [...tideObs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const waterLevels = sortedTide.map(t => t.waterLevelM)
  const meanWL = waterLevels.length > 0
    ? waterLevels.reduce((s, v) => s + v, 0) / waterLevels.length
    : 0
  const maxWL  = waterLevels.length > 0 ? Math.max(...waterLevels) : 0
  const minWL  = waterLevels.length > 0 ? Math.min(...waterLevels) : 0

  const tidalRange = maxWL - minWL
  if (tidalRange > 4.0) {
    warnings.push(
      `Tidal range of ${tidalRange.toFixed(2)}m exceeds 4m. ` +
      'Verify tide gauge is correctly referenced to chart datum.'
    )
  }

  const reducedSoundings: ReducedSounding[] = soundings.map(s => {
    const wl = interpolateWaterLevel(s.timestamp, sortedTide)
    return {
      x:              s.x,
      y:              s.y,
      rawDepthM:      s.depthM,
      waterLevelM:    wl,
      reducedDepthM:  s.depthM - wl,
      timestamp:      s.timestamp,
    }
  })

  const negative = reducedSoundings.filter(s => s.reducedDepthM < 0)
  if (negative.length > 0) {
    warnings.push(
      `${negative.length} sounding(s) have negative reduced depth ` +
      '(depth above datum). Check for instrument errors or incorrect tide observations.'
    )
  }

  return { reducedSoundings, meanWaterLevel: meanWL, maxWaterLevel: maxWL, minWaterLevel: minWL, warnings }
}

function interpolateWaterLevel(
  timestamp: string,
  sortedObs: TideObservation[]
): number {
  if (sortedObs.length === 0) return 0

  const t = new Date(timestamp).getTime()
  const first = new Date(sortedObs[0].timestamp).getTime()
  const last  = new Date(sortedObs[sortedObs.length - 1].timestamp).getTime()

  if (t <= first) return sortedObs[0].waterLevelM
  if (t >= last)  return sortedObs[sortedObs.length - 1].waterLevelM

  for (let i = 0; i < sortedObs.length - 1; i++) {
    const t0 = new Date(sortedObs[i].timestamp).getTime()
    const t1 = new Date(sortedObs[i + 1].timestamp).getTime()
    if (t >= t0 && t <= t1) {
      const fraction = (t - t0) / (t1 - t0)
      return sortedObs[i].waterLevelM +
             fraction * (sortedObs[i + 1].waterLevelM - sortedObs[i].waterLevelM)
    }
  }

  return sortedObs[sortedObs.length - 1].waterLevelM
}
