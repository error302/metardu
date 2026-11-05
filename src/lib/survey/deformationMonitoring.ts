/**
 * Deformation Monitoring Engine — repeat-epoch comparison + alerting
 *
 * THE PROBLEM
 * -----------
 * For dam monitoring, landslide monitoring, and repeat-epoch boundary work,
 * a surveyor needs to compare coordinates from different observation epochs
 * and determine whether a monument has ACTUALLY MOVED — vs. just drifted
 * due to tectonic plate motion or measurement noise.
 *
 * Doing this by hand in Excel across months of readings is exactly the kind
 * of tedious, error-prone work an engineer will pay to never do again. This
 * module automates it.
 *
 * WHAT IT DOES
 * ------------
 * 1. Takes two (or more) adjustment results from different epochs
 * 2. Propagates both to a common epoch (using the epoch manager — plate
 *    velocity propagation) so tectonic drift is removed
 * 3. Computes the deformation vector (dE, dN, dH) per monument
 * 4. Runs a statistical significance test (is the movement real, or just
 *    measurement noise at the monument's accuracy level?)
 * 5. Flags monuments that have moved beyond the project's tolerance
 * 6. Produces a time-series analysis (trend, velocity, acceleration) when
 *    multiple epochs are available
 *
 * USAGE
 * -----
 *   import { compareEpochs, analyzeTimeSeries } from '@/lib/survey/deformationMonitoring'
 *
 *   const report = compareEpochs({
 *     baseline: { epoch: 2024.0, monuments: [...] },
 *     current: { epoch: 2025.5, monuments: [...] },
 *     tolerance: { horizontal: 0.005, vertical: 0.003 }, // 5mm H, 3mm V
 *     confidenceLevel: 0.95,
 *   })
 *
 *   if (report.alerts.length > 0) {
 *     // "Monument DM-07 has moved 8.2mm north (exceeds 5mm tolerance)."
 *   }
 */

import { readMonitoringEpoch } from './deformationInput'
import { type ReferenceFrame } from '@/lib/geo/epochManager'
import { propagateToEpochRigorous } from '@/lib/geo/epochManagerRigorous'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MonumentObservation {
  /** Monument ID (e.g., 'DM-07' for Dam Monument 7) */
  monumentId: string
  /** Latitude (WGS84 degrees) */
  latitude: number
  /** Longitude (WGS84 degrees) */
  longitude: number
  /** Ellipsoidal height (meters) */
  height: number
  /** Reference frame */
  frame: ReferenceFrame
  /** Decimal year epoch (e.g., 2024.5 = July 2024) */
  epoch: number
  /** Standard deviation in East (meters) */
  sigmaE?: number
  /** Standard deviation in North (meters) */
  sigmaN?: number
  /** Standard deviation in Height (meters) */
  sigmaH?: number
  /** Covariance E-N (meters²) */
  sigmaEN?: number
}

export interface EpochSet {
  /** Epoch label (e.g., 'Baseline 2024-01', 'Q2 2025') */
  label: string
  /** Decimal year */
  epoch: number
  /** Monument observations for this epoch */
  monuments: MonumentObservation[]
}

export interface DeformationVector {
  monumentId: string
  /** Displacement East (meters) — positive = eastward movement */
  deltaE: number
  /** Displacement North (meters) — positive = northward movement */
  deltaN: number
  /** Displacement Up (meters) — positive = uplift */
  deltaH: number
  /** Horizontal displacement magnitude (meters) */
  horizontalDisplacement: number
  /** Bearing of movement (degrees, 0=N, 90=E) */
  bearing: number
  /** Whether the movement is statistically significant */
  isSignificant: boolean
  /** Whether the movement exceeds the tolerance */
  exceedsTolerance: boolean
  /** The statistical test result (if sigma values were available) */
  significance?: {
    testStatistic: number
    criticalValue: number
    passed: boolean
    interpretation: string
    assessedDimensions?: Array<'horizontal' | 'vertical'>
  }
}

export interface DeformationTolerance {
  /** Horizontal movement tolerance (meters). Default: 0.005 (5mm) */
  horizontal?: number
  /** Vertical movement tolerance (meters). Default: 0.003 (3mm) */
  vertical?: number
}

export interface DeformationAlert {
  monumentId: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  /** Movement magnitude in mm */
  magnitudeMm: number
  /** Direction of movement */
  direction: string
}

export interface DeformationReport {
  /** Per-monument deformation vectors */
  vectors: DeformationVector[]

  /** Monuments that have moved beyond tolerance */
  alerts: DeformationAlert[]

  /** Monuments that are stable (within tolerance) */
  stable: string[]

  /** Monuments present in baseline but missing in current epoch */
  missingMonuments: string[]

  /** Monuments present in current but not in baseline (new monuments) */
  newMonuments: string[]

  /** Epochs compared */
  baselineEpoch: number
  currentEpoch: number
  commonEpoch: number

  /** Tolerances used */
  tolerance: Required<DeformationTolerance>

  /** Overall verdict */
  verdict: 'STABLE' | 'DEFORMING' | 'INCONCLUSIVE'
  /** Human-readable summary */
  summary: string

  /** Timestamp */
  timestamp: string
}

// ─── Time-Series Types ──────────────────────────────────────────────────────

export interface TimeSeriesPoint {
  epoch: number
  /** Position at this epoch (after propagation to common frame) */
  latitude: number
  longitude: number
  height: number
  /** Displacement from the first epoch (meters) */
  deltaE: number
  deltaN: number
  deltaH: number
  horizontalDisplacement: number
}

export interface TimeSeriesAnalysis {
  monumentId: string
  /** All epochs in the series */
  points: TimeSeriesPoint[]

  /** Linear trend (velocity) — meters per year */
  velocityE: number
  velocityN: number
  velocityH: number
  velocityHorizontal: number
  velocityBearing: number

  /** Acceleration (change in velocity) — meters per year² */
  accelerationHorizontal: number

  /** Whether the trend is statistically significant */
  trendSignificant: boolean

  /** R² of the linear fit (0-1) */
  rSquared: number

  /** Projected position 1 year from the last epoch */
  projectedDeltaE: number
  projectedDeltaN: number
  projectedDeltaH: number
  projectedHorizontalDisplacement: number

  /** Whether the projected movement will exceed tolerance */
  projectedExceedsTolerance: boolean

  /** Interpretation for display */
  interpretation: string
}

function validateMonitoringUncertainty(observation: MonumentObservation): void {
  for (const field of ['sigmaE', 'sigmaN', 'sigmaH'] as const) {
    const sigma = observation[field]
    if (sigma !== undefined && (!Number.isFinite(sigma) || sigma <= 0 || !Number.isFinite(sigma ** 2) || sigma ** 2 === 0)) {
      throw new Error('Monitoring standard deviation must be finite and positive for ' + observation.monumentId + '.')
    }
  }
  if (observation.sigmaEN !== undefined && (!Number.isFinite(observation.sigmaEN)
    || observation.sigmaE === undefined || observation.sigmaN === undefined
    || Math.abs(observation.sigmaEN) >= observation.sigmaE * observation.sigmaN)) {
    throw new Error('Monitoring horizontal covariance must define a positive-definite uncertainty matrix for ' + observation.monumentId + '.')
  }
}

// ─── Main: Compare Two Epochs ───────────────────────────────────────────────

/**
 * Compare monument positions between two epochs and detect deformation.
 *
 * This is the core function for dam/boundary monitoring. It:
 *   1. Matches monuments by ID between the two epochs
 *   2. Propagates both to a common epoch (removing tectonic plate drift)
 *   3. Computes the deformation vector per monument
 *   4. Runs a statistical significance test (if accuracy data available)
 *   5. Flags monuments that exceed tolerance
 *
 * @returns DeformationReport with per-monument vectors + alerts
 */
export function compareEpochs(
  baselineOrOptions: EpochSet | {
    baseline: EpochSet
    current: EpochSet
    tolerance?: DeformationTolerance
    confidenceLevel?: number
  },
  currentArg?: EpochSet,
  toleranceArg: DeformationTolerance = {},
  confidenceLevelArg: number = 0.95,
): DeformationReport {
  const isOptionsObject = typeof baselineOrOptions === 'object' && baselineOrOptions !== null && 'baseline' in baselineOrOptions && 'current' in baselineOrOptions
  const baseline = readMonitoringEpoch(isOptionsObject ? (baselineOrOptions as { baseline: EpochSet }).baseline : baselineOrOptions)
  const current = readMonitoringEpoch(isOptionsObject ? (baselineOrOptions as { current: EpochSet }).current : currentArg)
  const tolerance = isOptionsObject ? (baselineOrOptions as { tolerance?: DeformationTolerance }).tolerance ?? {} : toleranceArg
  const confidenceLevel = isOptionsObject ? (baselineOrOptions as { confidenceLevel?: number }).confidenceLevel ?? 0.95 : confidenceLevelArg

  const tolH = tolerance.horizontal ?? 0.005  // 5mm default
  const tolV = tolerance.vertical ?? 0.003    // 3mm default
  if (!baseline || !current || !Number.isFinite(baseline.epoch) || !Number.isFinite(current.epoch)) {
    throw new Error('Baseline and current epochs must be finite decimal years.')
  }
  if (!Number.isFinite(tolH) || tolH <= 0 || !Number.isFinite(tolV) || tolV <= 0) {
    throw new Error('Deformation tolerances must be finite positive distances in metres.')
  }
  if (!Number.isFinite(confidenceLevel) || confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new Error('Confidence level must be between 0 and 1.')
  }
  if (confidenceLevel !== 0.95 && confidenceLevel !== 0.99) {
    throw new Error('This comparison supports 95% or 99% component-test confidence only.')
  }
  const commonEpoch = Math.max(baseline.epoch, current.epoch)

  // Build lookup maps
  const baselineMap = new Map<string, MonumentObservation>()
  for (const m of baseline.monuments) {
    const id = String(m?.monumentId ?? '').trim()
    if (!id || ![m.latitude, m.longitude, m.height, m.epoch].every(Number.isFinite)) {
      throw new Error(`Invalid baseline observation for monument ${m?.monumentId || '(unnamed)'}`)
    }
    validateMonitoringUncertainty(m)
    if (baselineMap.has(id)) throw new Error(`Duplicate baseline monument ${id}`)
    baselineMap.set(id, { ...m, monumentId: id })
  }

  const currentMap = new Map<string, MonumentObservation>()
  for (const m of current.monuments) {
    const id = String(m?.monumentId ?? '').trim()
    if (!id || ![m.latitude, m.longitude, m.height, m.epoch].every(Number.isFinite)) {
      throw new Error(`Invalid current observation for monument ${m?.monumentId || '(unnamed)'}`)
    }
    validateMonitoringUncertainty(m)
    if (currentMap.has(id)) throw new Error(`Duplicate current monument ${id}`)
    currentMap.set(id, { ...m, monumentId: id })
  }

  // Find common, missing, and new monuments
  const commonIds = [...baselineMap.keys()].filter(id => currentMap.has(id))
  const missingIds = [...baselineMap.keys()].filter(id => !currentMap.has(id))
  const newIds = [...currentMap.keys()].filter(id => !baselineMap.has(id))

  const vectors: DeformationVector[] = []
  const alerts: DeformationAlert[] = []
  const stable: string[] = []
  const incompleteUncertainty: string[] = []

  for (const id of commonIds) {
    const baseMon = baselineMap.get(id)
    const currMon = currentMap.get(id)
    if (!baseMon || !currMon) {
      throw new Error(`Missing monitoring epoch for point ${id}`)
    }

    if (baseMon.frame !== currMon.frame) throw new Error('Monitoring epochs need the same verified reference frame; align the source coordinates before comparison.')

    // Propagate both to the common epoch using the existing Somali plate model.
    // Use the RIGOROUS Rodrigues' rotation formula (no linearization error)
    // — critical for dam monitoring where sub-mm precision is needed.
    const baseProp = propagateToEpochRigorous(
      {
        latitude: baseMon.latitude,
        longitude: baseMon.longitude,
        height: baseMon.height,
        frame: baseMon.frame,
        epoch: baseMon.epoch,
      },
      commonEpoch,
    )

    const currProp = propagateToEpochRigorous(
      {
        latitude: currMon.latitude,
        longitude: currMon.longitude,
        height: currMon.height,
        frame: currMon.frame,
        epoch: currMon.epoch,
      },
      commonEpoch,
    )

    // Compute deformation vector
    // Convert lat/lon differences to meters (local ENU approximation)
    const lat0 = baseProp.latitude * Math.PI / 180
    const cosLat = Math.cos(lat0)
    const R = 6371000 // Earth radius in meters

    const deltaLat = currProp.latitude - baseProp.latitude
    const deltaLon = currProp.longitude - baseProp.longitude
    const deltaH = currProp.height - baseProp.height

    const deltaN = deltaLat * R * Math.PI / 180
    const deltaE = deltaLon * R * Math.PI / 180 * cosLat
    const horizontalDisplacement = Math.sqrt(deltaE ** 2 + deltaN ** 2)
    const bearing = (Math.atan2(deltaE, deltaN) * 180 / Math.PI + 360) % 360

    // Statistical significance test (if sigma values available)
    let significance: DeformationVector['significance']
    let isSignificant = false

    const hasHorizontalSigmas =
      baseMon.sigmaE !== undefined && currMon.sigmaE !== undefined &&
      baseMon.sigmaN !== undefined && currMon.sigmaN !== undefined
    const hasVerticalSigmas = baseMon.sigmaH !== undefined && currMon.sigmaH !== undefined
    if (!hasHorizontalSigmas || !hasVerticalSigmas) incompleteUncertainty.push(id)

    if (hasHorizontalSigmas || hasVerticalSigmas) {
      let isSigH = false
      let isSigV = false
      let testStatH = 0
      let critValH = 0
      let testStatV = 0
      let critValV = 0

      // 2D Horizontal Significance Test (Chi-square Mahalanobis distance)
      if (hasHorizontalSigmas) {
        const sigmaE_comb = Math.sqrt((baseMon.sigmaE as number) ** 2 + (currMon.sigmaE as number) ** 2)
        const sigmaN_comb = Math.sqrt((baseMon.sigmaN as number) ** 2 + (currMon.sigmaN as number) ** 2)

        if (sigmaE_comb > 0 && sigmaN_comb > 0) {
          // Epoch errors are assumed independent; include the supplied within-epoch E-N covariances.
          const varianceE = sigmaE_comb ** 2, varianceN = sigmaN_comb ** 2
          const covariance = (baseMon.sigmaEN ?? 0) + (currMon.sigmaEN ?? 0)
          const determinant = varianceE * varianceN - covariance ** 2
          if (!Number.isFinite(determinant) || determinant <= 0) throw new Error('Combined monitoring covariance is singular.')
          testStatH = Math.sqrt(Math.max(0, (varianceN * deltaE ** 2 - 2 * covariance * deltaE * deltaN + varianceE * deltaN ** 2) / determinant))
          // Chi-square with two degrees of freedom: CDF inverse is -2 ln(1-p).
          // NIST EDA 1.3.6.7.4, df=2: 95%=5.991, 99%=9.210 before square root.
          critValH = Math.sqrt(-2 * Math.log(1 - confidenceLevel))
          isSigH = testStatH > critValH
        }
      }

      // 1D Vertical Significance Test (Standard Normal Z-score)
      if (hasVerticalSigmas) {
        const sigmaH_comb = Math.sqrt((baseMon.sigmaH as number) ** 2 + (currMon.sigmaH as number) ** 2)
        if (!Number.isFinite(sigmaH_comb) || sigmaH_comb <= 0) throw new Error('Combined vertical uncertainty is not finite and positive.')
        if (sigmaH_comb > 0) {
          testStatV = Math.abs(deltaH) / sigmaH_comb
          critValV = confidenceLevel === 0.99 ? 2.5758293035489004 : 1.959963984540054
          isSigV = testStatV > critValV
        }
      }

      isSignificant = isSigH || isSigV
      const primaryIsHorizontal = critValH > 0 && (critValV === 0 || testStatH / critValH >= testStatV / critValV)
      const primaryTestStat = primaryIsHorizontal ? testStatH : testStatV
      const primaryCritVal = primaryIsHorizontal ? critValH : critValV

      let interpretation = ''
      if (isSignificant) {
        interpretation = `A tested component is statistically significant at ${(confidenceLevel * 100).toFixed(0)}% component-test confidence ` +
          `(${isSigH ? `horizontal test stat ${testStatH.toFixed(2)} > ${critValH.toFixed(2)}` : ''}` +
          `${isSigH && isSigV ? ', ' : ''}` +
          `${isSigV ? `vertical test stat ${testStatV.toFixed(2)} > ${critValV.toFixed(2)}` : ''}). Review the observation and reference/control evidence.`
      } else {
        interpretation = `No tested component is statistically significant at ${(confidenceLevel * 100).toFixed(0)}% component-test confidence ` +
          `(test stat ${primaryTestStat.toFixed(2)} ≤ ${primaryCritVal.toFixed(2)}). Measurement noise cannot be ruled out.`
      }

      significance = {
        testStatistic: primaryTestStat,
        criticalValue: primaryCritVal,
        passed: !isSignificant,
        interpretation,
        assessedDimensions: [...(hasHorizontalSigmas ? ['horizontal' as const] : []), ...(hasVerticalSigmas ? ['vertical' as const] : [])],
      }
    }

    const exceedsTolerance = horizontalDisplacement > tolH || Math.abs(deltaH) > tolV

    const vector: DeformationVector = {
      monumentId: id,
      deltaE,
      deltaN,
      deltaH,
      horizontalDisplacement,
      bearing,
      isSignificant,
      exceedsTolerance,
      significance,
    }
    vectors.push(vector)

    // Generate alert if exceeds tolerance
    if (exceedsTolerance) {
      const severity = horizontalDisplacement > tolH * 3 || Math.abs(deltaH) > tolV * 3
        ? 'critical'
        : 'warning'

      const directionStr = formatBearing(bearing)
      const magMm = horizontalDisplacement * 1000

      let message = `${id} has moved ${magMm.toFixed(1)}mm ${directionStr}` +
        (Math.abs(deltaH) > tolV ? ` and ${(deltaH * 1000).toFixed(1)}mm ${deltaH > 0 ? 'up' : 'down'}` : '') +
        ` (tolerance: ${tolH * 1000}mm H / ${tolV * 1000}mm V).`

      if (significance) {
        message += ` ${significance.interpretation}`
      }

      alerts.push({
        monumentId: id,
        severity,
        message,
        magnitudeMm: magMm,
        direction: directionStr,
      })
    } else if (hasHorizontalSigmas && hasVerticalSigmas) {
      stable.push(id)
    }
  }

  const coverageNotes: string[] = []
  if (missingIds.length) coverageNotes.push('Missing baseline monuments: ' + missingIds.join(', ') + '.')
  if (newIds.length) coverageNotes.push('No baseline for new monuments: ' + newIds.join(', ') + '.')
  if (incompleteUncertainty.length) coverageNotes.push('Incomplete horizontal/vertical uncertainty: ' + incompleteUncertainty.join(', ') + '.')

  // Overall verdict
  let verdict: 'STABLE' | 'DEFORMING' | 'INCONCLUSIVE'
  let summary: string

  if (vectors.length === 0) {
    verdict = 'INCONCLUSIVE'
    summary = 'No common monuments between epochs. Cannot compare.'
  } else if (alerts.length === 0 && coverageNotes.length) {
    verdict = 'INCONCLUSIVE'
    summary = 'The available readings do not establish a complete monitoring comparison.'
  } else if (alerts.length === 0) {
    verdict = 'STABLE'
    summary = `All ${stable.length} compared monuments have measured changes within the supplied tolerance (±${tolH * 1000}mm H / ±${tolV * 1000}mm V) between ${baseline.label} and ${current.label}.`
  } else {
    verdict = 'DEFORMING'
    const criticalCount = alerts.filter(a => a.severity === 'critical').length
    summary = `${alerts.length} monument(s) exceeded tolerance between ${baseline.label} and ${current.label}.` +
      (criticalCount > 0 ? ` ${criticalCount} CRITICAL.` : '') +
      ` Affected: ${alerts.map(a => a.monumentId).join(', ')}.`
  }

  summary += (coverageNotes.length ? ' ' + coverageNotes.join(' ') : '') + ' This is not a determination of structural safety.'

  return {
    vectors,
    alerts,
    stable,
    missingMonuments: missingIds,
    newMonuments: newIds,
    baselineEpoch: baseline.epoch,
    currentEpoch: current.epoch,
    commonEpoch,
    tolerance: { horizontal: tolH, vertical: tolV },
    verdict,
    summary,
    timestamp: new Date().toISOString(),
  }
}

// ─── Time-Series Analysis ───────────────────────────────────────────────────

/**
 * Analyze a time series of monument positions across multiple epochs.
 *
 * Computes:
 *   - Linear trend (velocity) in E, N, H — meters per year
 *   - Acceleration (change in velocity)
 *   - R² goodness of fit
 *   - 1-year projection
 *   - Whether the projection exceeds tolerance
 *
 * @param epochs - Array of EpochSets (at least 2, ideally 3+ for trend)
 * @param monumentId - Which monument to analyze
 * @param tolerance - Movement tolerance for projection check
 */
export function analyzeTimeSeries(
  epochs: EpochSet[],
  monumentId: string,
  tolerance: DeformationTolerance = {},
): TimeSeriesAnalysis {
  const tolH = tolerance.horizontal ?? 0.005
  const tolV = tolerance.vertical ?? 0.003

  // Collect all observations of this monument across epochs
  const observations: TimeSeriesPoint[] = []
  let firstObs: { lat: number; lon: number; h: number } | null = null

  // Sort epochs chronologically
  const sortedEpochs = [...epochs].sort((a, b) => a.epoch - b.epoch)

  for (const epochSet of sortedEpochs) {
    const mon = epochSet.monuments.find(m => m.monumentId === monumentId)
    if (!mon) continue

    // Propagate to a common reference (the first epoch)
    if (!firstObs) {
      firstObs = { lat: mon.latitude, lon: mon.longitude, h: mon.height }
    }

    const commonEpoch = sortedEpochs[0].epoch
    const prop = propagateToEpochRigorous(
      {
        latitude: mon.latitude,
        longitude: mon.longitude,
        height: mon.height,
        frame: mon.frame,
        epoch: mon.epoch,
      },
      commonEpoch,
    )

    // Compute displacement from first observation
    const lat0 = firstObs.lat * Math.PI / 180
    const cosLat = Math.cos(lat0)
    const R = 6371000

    const deltaLat = prop.latitude - firstObs.lat
    const deltaLon = prop.longitude - firstObs.lon
    const deltaH = prop.height - firstObs.h

    const deltaN = deltaLat * R * Math.PI / 180
    const deltaE = deltaLon * R * Math.PI / 180 * cosLat
    const horizontalDisplacement = Math.sqrt(deltaE ** 2 + deltaN ** 2)

    observations.push({
      epoch: mon.epoch,
      latitude: prop.latitude,
      longitude: prop.longitude,
      height: prop.height,
      deltaE,
      deltaN,
      deltaH,
      horizontalDisplacement,
    })
  }

  if (observations.length < 2) {
    return {
      monumentId,
      points: observations,
      velocityE: 0,
      velocityN: 0,
      velocityH: 0,
      velocityHorizontal: 0,
      velocityBearing: 0,
      accelerationHorizontal: 0,
      trendSignificant: false,
      rSquared: 0,
      projectedDeltaE: 0,
      projectedDeltaN: 0,
      projectedDeltaH: 0,
      projectedHorizontalDisplacement: 0,
      projectedExceedsTolerance: false,
      interpretation: 'Insufficient data for trend analysis (need ≥2 epochs).',
    }
  }

  // Linear regression: displacement vs time
  // y = a + b×t, where t = epoch, y = displacement
  const t0 = observations[0].epoch
  const tValues = observations.map(o => o.epoch - t0) // years from first epoch
  const eValues = observations.map(o => o.deltaE)
  const nValues = observations.map(o => o.deltaN)
  const hValues = observations.map(o => o.deltaH)
  const hDispValues = observations.map(o => o.horizontalDisplacement)

  const { slope: velE } = linearRegression(tValues, eValues)
  const { slope: velN } = linearRegression(tValues, nValues)
  const { slope: velH } = linearRegression(tValues, hValues)
  const { r2: r2Hdisp } = linearRegression(tValues, hDispValues)

  const velocityHorizontal = Math.sqrt(velE ** 2 + velN ** 2)
  const velocityBearing = (Math.atan2(velE, velN) * 180 / Math.PI + 360) % 360

  // Acceleration: difference in velocity between first and second half
  let accelerationHorizontal = 0
  if (observations.length >= 4) {
    const midIdx = Math.floor(observations.length / 2)
    const firstHalf = observations.slice(0, midIdx + 1)
    const secondHalf = observations.slice(midIdx)

    const t1 = firstHalf.map(o => o.epoch - t0)
    const h1 = firstHalf.map(o => o.horizontalDisplacement)
    const t2 = secondHalf.map(o => o.epoch - t0)
    const h2 = secondHalf.map(o => o.horizontalDisplacement)

    const vel1 = linearRegression(t1, h1).slope
    const vel2 = linearRegression(t2, h2).slope

    const dt = (secondHalf[secondHalf.length - 1].epoch - firstHalf[0].epoch) / 2
    if (dt > 0) {
      accelerationHorizontal = (vel2 - vel1) / dt
    }
  }

  // R² for horizontal displacement
  const rSquared = r2Hdisp

  // Trend significance: R² > 0.7 AND velocity > tolerance/year
  const trendSignificant = rSquared > 0.7 && velocityHorizontal > tolH

  // Project 1 year from last epoch
  const lastT = tValues[tValues.length - 1]
  const projectedT = lastT + 1.0
  const projectedDeltaE = velE * projectedT
  const projectedDeltaN = velN * projectedT
  const projectedDeltaH = velH * projectedT
  const projectedHorizontalDisplacement = Math.sqrt(projectedDeltaE ** 2 + projectedDeltaN ** 2)
  const projectedExceedsTolerance = projectedHorizontalDisplacement > tolH || Math.abs(projectedDeltaH) > tolV

  // Interpretation
  let interpretation: string
  if (velocityHorizontal < tolH) {
    interpretation = `Stable: velocity ${(velocityHorizontal * 1000).toFixed(1)}mm/yr is within tolerance. No action needed.`
  } else if (trendSignificant) {
    interpretation = `DEFORMING: velocity ${(velocityHorizontal * 1000).toFixed(1)}mm/yr ${formatBearing(velocityBearing)} (R²=${rSquared.toFixed(2)}).` +
      (projectedExceedsTolerance ? ` Projected to exceed tolerance within 1 year. Investigate.` : ` Trend is significant but projection is within tolerance.`)
  } else {
    interpretation = `Marginal: velocity ${(velocityHorizontal * 1000).toFixed(1)}mm/yr but R²=${rSquared.toFixed(2)} indicates high variability. More epochs needed to confirm trend.`
  }

  return {
    monumentId,
    points: observations,
    velocityE: velE,
    velocityN: velN,
    velocityH: velH,
    velocityHorizontal,
    velocityBearing,
    accelerationHorizontal,
    trendSignificant,
    rSquared,
    projectedDeltaE,
    projectedDeltaN,
    projectedDeltaH,
    projectedHorizontalDisplacement,
    projectedExceedsTolerance,
    interpretation,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Simple linear regression: y = a + b×x
 * Returns slope (b), intercept (a), and R².
 */
function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = x.length
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 }

  const sumX = x.reduce((s, v) => s + v, 0)
  const sumY = y.reduce((s, v) => s + v, 0)
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0)
  const sumX2 = x.reduce((s, v) => s + v * v, 0)

  const denom = n * sumX2 - sumX * sumX
  if (Math.abs(denom) < 1e-12) return { slope: 0, intercept: y[0], r2: 0 }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  // R²
  const meanY = sumY / n
  const ssTot = y.reduce((s, v) => s + (v - meanY) ** 2, 0)
  const ssRes = y.reduce((s, v, i) => s + (v - (intercept + slope * x[i])) ** 2, 0)
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

  return { slope, intercept, r2 }
}

/**
 * Format a bearing in degrees as a compass direction.
 * e.g., 45° → "NE", 180° → "S", 270° → "W"
 */
function formatBearing(bearing: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  const idx = Math.round(bearing / 22.5) % 16
  return `${dirs[idx]} (${bearing.toFixed(1)}°)`
}

// ─── Display Helpers ────────────────────────────────────────────────────────

/**
 * Get the verdict color for deformation status.
 */
export function getDeformationVerdictColor(verdict: 'STABLE' | 'DEFORMING' | 'INCONCLUSIVE'): string {
  switch (verdict) {
    case 'STABLE': return 'green'
    case 'DEFORMING': return 'red'
    case 'INCONCLUSIVE': return 'yellow'
    default: return 'gray'
  }
}

/**
 * Get the alert severity color.
 */
export function getAlertSeverityColor(severity: 'info' | 'warning' | 'critical'): string {
  switch (severity) {
    case 'info': return 'blue'
    case 'warning': return 'yellow'
    case 'critical': return 'red'
    default: return 'gray'
  }
}

/**
 * Format a deformation vector for display.
 */
export function formatDeformationVector(v: DeformationVector): string {
  const parts: string[] = []
  parts.push(`dE=${(v.deltaE * 1000).toFixed(1)}mm`)
  parts.push(`dN=${(v.deltaN * 1000).toFixed(1)}mm`)
  if (v.deltaH !== 0) {
    parts.push(`dH=${(v.deltaH * 1000).toFixed(1)}mm`)
  }
  parts.push(`|H|=${(v.horizontalDisplacement * 1000).toFixed(1)}mm`)
  parts.push(formatBearing(v.bearing))
  if (v.significance) {
    parts.push(v.isSignificant ? 'SIGNIFICANT' : 'not significant')
  }
  if (v.exceedsTolerance) {
    parts.push('EXCEEDS TOLERANCE')
  }
  return parts.join('  ')
}
