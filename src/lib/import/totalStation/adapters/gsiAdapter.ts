/**
 * GSI Adapter — wraps the already-excellent GSI parser.
 *
 * The GSI parser already produces structured records with angles,
 * distances, face position, and coordinates. This adapter simply
 * maps GSIRecord[] → UnifiedObservation[] and runs face pairing.
 */

import { parseGSI, pairFaces } from '../parseGSI'
import {
  UnifiedObservation,
  UnifiedRawPoint,
  UnifiedImportResult,
} from '../unifiedTypes'

/**
 * Adapt a GSI file content string into the unified import result.
 */
export function adaptGSI(content: string): UnifiedImportResult {
  const parsed = parseGSI(content)
  const warnings = [...parsed.warnings]
  const errors: string[] = []

  if (!parsed.ok) {
    errors.push('GSI parser returned ok=false — no usable records')
  }

  // ── Map raw records → observations + raw points ─────────────────────

  const observations: UnifiedObservation[] = []
  const rawPoints: UnifiedRawPoint[] = []

  for (const rec of parsed.records) {
    // Records with angles or distances are observations
    if (
      rec.horizontalAngle !== undefined ||
      rec.verticalAngle !== undefined ||
      rec.slopeDistance !== undefined
    ) {
      observations.push({
        stationId: '',   // GSI doesn't encode station explicitly per record
        targetId: rec.pointId,
        face: rec.facePosition || 'unknown',
        horizontalAngle: rec.horizontalAngle,
        verticalAngle: rec.verticalAngle,
        slopeDistance: rec.slopeDistance,
        horizontalDistance: rec.horizontalDistance,
        heightDifference: rec.heightDifference,
        prismConstant: rec.prismConstant != null ? rec.prismConstant / 1000 : undefined,
        prismHeight: rec.reflectorHeight,
        instrumentHeight: rec.instrumentHeight,
        ppm: rec.ppm,
        easting: rec.easting,
        northing: rec.northing,
        elevation: rec.elevation,
      })
    }

    // Records with coordinates go into rawPoints
    if (
      rec.easting !== undefined &&
      rec.northing !== undefined
    ) {
      rawPoints.push({
        id: rec.pointId,
        easting: rec.easting,
        northing: rec.northing,
        elevation: rec.elevation ?? 0,
        code: rec.featureCode || '',
      })
    }
  }

  // ── Face pairing → meaned observations ─────────────────────────────

  const meanedObservations: UnifiedObservation[] = []

  if (observations.length > 0) {
    const pairs = pairFaces(parsed.records)
    for (const pair of pairs) {
      meanedObservations.push({
        stationId: '',
        targetId: pair.pointId,
        face: 'FL',
        horizontalAngle: pair.meanHorizontalAngle,
        verticalAngle: pair.meanVerticalAngle,
        slopeDistance: pair.meanSlopeDistance,
        horizontalDistance: pair.horizontalDistance,
        heightDifference: pair.heightDifference,
        prismHeight: pair.faceLeft.reflectorHeight,
        instrumentHeight: pair.faceLeft.instrumentHeight,
      })
    }

    // Populate stationId from the first record if all observations share
    // a common station (heuristic: first record is often the station point)
    if (rawPoints.length > 0) {
      const firstCoord = rawPoints[0]
      // Use first coordinate record as station name
      for (const obs of observations) {
        if (!obs.stationId && obs.targetId !== firstCoord.id) {
          obs.stationId = firstCoord.id
        }
      }
      for (const obs of meanedObservations) {
        if (!obs.stationId) {
          obs.stationId = firstCoord.id
        }
      }
    }
  }

  // ── Detect station coordinates ──────────────────────────────────────

  let stationCoords: UnifiedImportResult['stationCoords'] = undefined
  if (rawPoints.length > 0) {
    const first = rawPoints[0]
    stationCoords = {
      easting: first.easting,
      northing: first.northing,
      elevation: first.elevation,
    }
  }

  return {
    format: 'gsi',
    instrument: 'Leica',
    stationName: rawPoints.length > 0 ? rawPoints[0].id : '',
    stationCoords,
    observations,
    meanedObservations,
    rawPoints,
    errors,
    warnings,
  }
}
