/**
 * GSI Adapter — preserves normalized measurements and original setup uncertainty.
 *
 * The GSI parser already produces structured records with angles,
 * distances, inferred face position, and coordinates. This adapter maps records
 * without inferring station identity or merging shots across unknown setups.
 */

import { parseGSI } from '../parseGSI'
import {
  UnifiedObservation,
  UnifiedRawPoint,
  UnifiedImportResult,
} from '../unifiedTypes'

/**
 * Adapt a GSI file content string into the unified import result.
 */
export function adaptGSI(content: string, foot?: 'international' | 'USSurveyFoot'): UnifiedImportResult {
  const parsed = parseGSI(content, { foot })
  const warnings = [...parsed.warnings]
  const errors: string[] = []

  if (!parsed.ok) {
    errors.push('GSI parser refused the file structure or found no usable records. Review its word-width and measurement diagnostics.')
  }

  // ── Map raw records → observations + raw points ─────────────────────

  const observations: UnifiedObservation[] = []
  const rawPoints: UnifiedRawPoint[] = []

  for (const rec of parsed.records) {
    // Records with angles or distances are observations
    if (
      rec.horizontalAngle !== undefined ||
      rec.verticalAngle !== undefined ||
      rec.slopeDistance !== undefined ||
      rec.horizontalDistance !== undefined ||
      rec.heightDifference !== undefined
    ) {
      observations.push({
        stationId: '',   // This adapter has not established the setup identity.
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
      rec.coordinateRecord || rec.easting !== undefined || rec.northing !== undefined
    ) {
      rawPoints.push({
        id: rec.pointId,
        easting: rec.easting,
        northing: rec.northing,
        elevation: rec.elevation,
        code: rec.featureCode || '',
      })
    }
  }

  // File order and repeated target IDs do not establish an instrument setup,
  // backsight or shared face-pair context. Keep originals for explicit review.
  if (observations.length > 0) {
    warnings.push('GSI station/backsight setup is not declared. Original observations are retained; review the setup before face pairing or reduction.')
  }
  if (parsed.records.some(record => record.stationCoordinateRecord)) {
    warnings.push('GSI station coordinate words (WI 84-86) are retained in the source and excluded from target points. Review station identity and setup separately.')
  }

  return {
    format: 'gsi',
    normalizedMetres: true,
    instrument: 'Leica',
    stationName: '',
    observations,
    meanedObservations: [],
    rawPoints,
    errors,
    warnings,
  }
}
