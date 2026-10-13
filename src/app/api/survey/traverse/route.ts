export const dynamic = 'force-dynamic'

/**
 * Traverse Computation API Route
 *
 * Accepts raw observations, runs them through the correction pipeline,
 * performs traverse adjustment, and returns adjusted coordinates.
 *
 * SECURITY: Requires authentication. Previously unauthenticated —
 * pure math so no data leak, but unauthenticated CPU-heavy work
 * was a DoS vector.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/requireAuth';
import {
  processObservation,
  KENYA_DEFAULT_CONFIG,
  type PipelineConfig,
  type RawObservation,
} from '@/lib/survey/pipeline/correction-pipeline';
import {
  bowditchAdjustment,
  type TraverseStation,
  type TraverseLeg,
} from '@/lib/survey/traverse/engine';
import {
  leastSquaresAdjustment,
  type LSObservation,
  type LSStation,
} from '@/lib/survey/traverse/least-squares';
import { TraverseComputeSchema } from '@/lib/validation/apiSchemas';
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  // SECURITY: Require authentication to prevent DoS via unauthenticated compute
  const { error } = await requireAuth()
  if (error) return error

  try {
    const rawBody: unknown = await request.json().catch(() => null)
    const parsed = TraverseComputeSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 422 }
      )
    }

    const { observations, stations, method, order, config } = parsed.data

    const pipelineConfig = { ...KENYA_DEFAULT_CONFIG, ...config } as PipelineConfig

    const invalidObservations = observations.flatMap((observation, index) => {
      const issues: string[] = []
      if (typeof observation.rawSlopeDistance !== 'number' || !Number.isFinite(observation.rawSlopeDistance) || observation.rawSlopeDistance <= 0) {
        issues.push(`observation ${index + 1}: measured slope distance is required`)
      }
      if (typeof observation.trueBearing !== 'number' || !Number.isFinite(observation.trueBearing) || observation.trueBearing < 0 || observation.trueBearing > 360) {
        issues.push(`observation ${index + 1}: true bearing is required; horizontal angle alone does not establish an absolute bearing`)
      }
      if (pipelineConfig.applyConvergence && (
        typeof observation.latitude !== 'number' || !Number.isFinite(observation.latitude) ||
        typeof observation.longitude !== 'number' || !Number.isFinite(observation.longitude)
      )) {
        issues.push(`observation ${index + 1}: latitude and longitude are required to apply grid convergence`)
      }
      return issues
    })

    if (invalidObservations.length > 0) {
      return NextResponse.json(
        { error: 'Traverse observations are incomplete', details: invalidObservations },
        { status: 422 }
      )
    }

    const stationIssues: string[] = []
    const stationNames = new Set(stations.map(station => station.name))
    if (stationNames.size !== stations.length) stationIssues.push('station names must be unique')
    for (const [index, observation] of observations.entries()) {
      if (!stationNames.has(observation.fromStation) || !stationNames.has(observation.toStation)) {
        stationIssues.push(`observation ${index + 1}: both endpoint stations must be included in stations`)
      }
    }
    const fixedControls = stations.filter(station => station.isFixed &&
      Number.isFinite(station.easting) && Number.isFinite(station.northing))
    if (method === 'bowditch' && fixedControls.length < 2) {
      stationIssues.push('Bowditch adjustment requires two fixed control stations with coordinates')
    }
    if (method === 'least_squares') {
      if (stations.some(station => !Number.isFinite(station.easting) || !Number.isFinite(station.northing))) {
        stationIssues.push('least-squares adjustment requires approximate easting and northing for every station')
      }
      if (fixedControls.length < 1) stationIssues.push('least-squares adjustment requires at least one fixed control station')
      const freeStationCount = stations.filter(station => !station.isFixed).length
      if (freeStationCount === 0) stationIssues.push('least-squares adjustment requires at least one free station')
      if (observations.length <= freeStationCount) {
        stationIssues.push('least-squares adjustment requires at least one redundant observation to estimate uncertainty')
      }
    }
    if (stationIssues.length > 0) {
      return NextResponse.json(
        { error: 'Traverse station inputs are incomplete', details: stationIssues },
        { status: 422 }
      )
    }

    // Step 1: Process all validated observations through the correction pipeline
    const processedObservations = observations.map(obs =>
      processObservation(obs as RawObservation, pipelineConfig)
    )

    // Step 2: Build traverse legs from processed observations
    const legs: TraverseLeg[] = processedObservations.map(obs => {
      const bearing = obs.gridBearing ?? obs.trueBearing
      if (typeof bearing !== 'number' || !Number.isFinite(bearing)) {
        throw new Error(`No usable grid bearing was produced for ${obs.fromStation} → ${obs.toStation}`)
      }
      return {
        fromStation: obs.fromStation,
        toStation: obs.toStation,
        bearing,
        distance: obs.gridDistance,
        stdDevDistance: 0.005 + obs.gridDistance * 0.00002, // 5mm + 20ppm
        stdDevBearing: 5, // 5 arc-seconds
      }
    })

    // Step 3: Perform traverse adjustment
    let result;

    if (method === 'bowditch') {
      result = bowditchAdjustment(stations as TraverseStation[], legs, order)
    } else {
      // Build least squares inputs from processed observations
      const lsStations: LSStation[] = stations.map(s => {
        if (typeof s.easting !== 'number' || typeof s.northing !== 'number') {
          throw new Error(`Least-squares station ${s.name} is missing approximate coordinates`)
        }
        return {
          name: s.name,
          easting: s.easting,
          northing: s.northing,
          isFixed: s.isFixed ?? false,
        }
      })

      const lsObservations: LSObservation[] = legs.flatMap(leg => [
        {
          type: 'distance' as const,
          fromStation: leg.fromStation,
          toStation: leg.toStation,
          value: leg.distance,
          stdDev: 0.005 + leg.distance * 0.00002, // 5mm + 20ppm
        },
        {
          type: 'azimuth' as const,
          fromStation: leg.fromStation,
          toStation: leg.toStation,
          value: leg.bearing,
          stdDev: 5 / 3600, // 5 arc-seconds expressed in decimal degrees
        },
      ])

      result = leastSquaresAdjustment(lsStations, lsObservations)
    }

    return NextResponse.json({
      processedObservations,
      adjustmentResult: result,
      pipelineConfig,
      correctionsApplied: processedObservations.map(obs => ({
        from: obs.fromStation,
        to: obs.toStation,
        rawDistance: obs.rawSlopeDistance,
        gridDistance: obs.gridDistance,
        atmosphericPPM: obs.atmosphericPPM,
        seaLevelPPM: obs.seaLevelPPM,
        lineScaleFactor: obs.lineScaleFactor,
        convergence: obs.convergence,
        warnings: obs.warnings,
      })),
    })
  } catch (error) {
    logger.error('Traverse computation error:', { error: error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Computation failed' },
      { status: 500 }
    );
  }
}
