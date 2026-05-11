/**
 * Topcon Adapter
 *
 * The Topcon parser currently only extracts coordinate points
 * (pointId, easting, northing, elevation, code).
 * No angular observation data is parsed.
 *
 * Therefore this adapter populates rawPoints only —
 * observations and meanedObservations will be empty.
 */

import { parseTopcon } from '../parseTopcon'
import {
  UnifiedRawPoint,
  UnifiedImportResult,
} from '../unifiedTypes'

/**
 * Adapt a Topcon CSV file content string into the unified import result.
 */
export function adaptTopcon(content: string): UnifiedImportResult {
  const parsed = parseTopcon(content)
  const warnings = [...parsed.warnings]
  const errors: string[] = []

  if (!parsed.ok) {
    errors.push('Topcon parser returned ok=false')
  }

  const rawPoints: UnifiedRawPoint[] = parsed.records.map(function (rec) {
    return {
      id: rec.pointId,
      easting: rec.easting ?? 0,
      northing: rec.northing ?? 0,
      elevation: rec.elevation ?? 0,
      code: rec.code || '',
    }
  })

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
    format: 'topcon',
    instrument: 'Topcon',
    stationName: rawPoints.length > 0 ? rawPoints[0].id : '',
    stationCoords,
    observations: [],
    meanedObservations: [],
    rawPoints,
    errors,
    warnings,
  }
}
