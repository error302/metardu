/**
 * JobXML Adapter
 *
 * The JobXML parser extracts coordinate points from
 * Trimble/JobXML data files. It also detects raw observations
 * that have no computed coordinates (reported as warnings).
 *
 * Therefore this adapter populates rawPoints only —
 * observations and meanedObservations will be empty.
 */

import { parseJobXML } from '../parseJobXML'
import {
  UnifiedRawPoint,
  UnifiedImportResult,
} from '../unifiedTypes'

/**
 * Adapt a JobXML (.job/.jxl) file content string into the unified import result.
 */
export function adaptJobXML(content: string): UnifiedImportResult {
  const parsed = parseJobXML(content)
  const warnings = [...parsed.warnings]
  const errors: string[] = []

  if (!parsed.ok) {
    errors.push('JobXML parser returned ok=false')
  }

  const rawPoints: UnifiedRawPoint[] = parsed.records.map(function (rec) {
    return {
      id: rec.pointId,
      easting: rec.easting ?? 0,
      northing: rec.northing ?? 0,
      elevation: rec.elevation ?? 0,
      code: rec.code || rec.note || '',
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
    format: 'jobxml',
    instrument: 'Trimble',
    stationName: rawPoints.length > 0 ? rawPoints[0].id : '',
    stationCoords,
    observations: [],
    meanedObservations: [],
    rawPoints,
    errors,
    warnings,
  }
}
