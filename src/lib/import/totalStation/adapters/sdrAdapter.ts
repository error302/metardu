/**
 * SDR33 Adapter
 *
 * The SDR parser currently only extracts coordinate points
 * (pointId, easting, northing, elevation). It does NOT parse
 * angular observations from the raw SDR records.
 *
 * Therefore this adapter populates rawPoints only —
 * observations and meanedObservations will be empty.
 */

import { parseSDR } from '../parseSDR'
import {
  UnifiedRawPoint,
  UnifiedImportResult,
} from '../unifiedTypes'

/**
 * Adapt an SDR33 file content string into the unified import result.
 */
export function adaptSDR(content: string): UnifiedImportResult {
  const parsed = parseSDR(content)
  const warnings = [...parsed.warnings]
  const errors: string[] = []

  if (!parsed.ok) {
    errors.push('SDR parser returned ok=false')
  }

  const rawPoints: UnifiedRawPoint[] = parsed.records.map(function (rec) {
    return {
      id: rec.pointId,
      easting: rec.easting ?? 0,
      northing: rec.northing ?? 0,
      elevation: rec.elevation ?? 0,
      code: '',
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
    format: 'sdr',
    instrument: 'Sokkia',
    stationName: rawPoints.length > 0 ? rawPoints[0].id : '',
    stationCoords,
    observations: [],
    meanedObservations: [],
    rawPoints,
    errors,
    warnings,
  }
}
