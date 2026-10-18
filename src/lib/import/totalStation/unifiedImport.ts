/**
 * Unified Total Station Import — Single Entry Point
 *
 * Usage:
 *   import { importTotalStation } from '@/lib/import/totalStation/unifiedImport'
 *
 *   const result = importTotalStation(fileContent, 'traverse.dat')
 *   // result.format, result.observations, result.rawPoints, etc.
 *
 * Pipeline:  detectFormat → parse → adapt → UnifiedImportResult
 */

import { detectTotalStationFormat } from './detectFormat'
import type { TotalStationFormat } from './detectFormat'
import { parseCoordinateCsv, type CoordinateColumnOrder } from './parseCoordinateCsv'
import { adaptGSI } from './adapters/gsiAdapter'
import { adaptSDR } from './adapters/sdrAdapter'
import { adaptSouth } from './adapters/southAdapter'
import { adaptTopcon } from './adapters/topconAdapter'
import { adaptJobXML } from './adapters/jobXmlAdapter'
import { adaptLandXML } from './adapters/landxmlAdapter'
import { adaptTrimbleDC } from './adapters/trimbleDcAdapter'
import { adaptCarlsonRW5 } from './adapters/carlsonAdapter'
import type { UnifiedImportResult } from './unifiedTypes'

/**
 * Import a total station data file of any supported format.
 *
 * @param content  - Raw file content as a string
 * @param filename - File name (used for extension-based format detection)
 * @returns UnifiedImportResult with observations, raw points, and diagnostics
 */
export function importTotalStation(
  content: string,
  filename: string = 'unknown.dat',
  options: { format?: TotalStationFormat; csvOrder?: CoordinateColumnOrder; gsiFootUnit?: 'international' | 'USSurveyFoot' } = {},
): UnifiedImportResult {
  const format = options.format && options.format !== 'unknown' ? options.format : detectTotalStationFormat(content, filename)

  switch (format) {
    case 'csv':
      return parseCoordinateCsv(content, options.csvOrder)
    case 'gsi':
      return adaptGSI(content, options.gsiFootUnit)

    case 'sokkia':
      return adaptSDR(content)

    case 'south':
      return adaptSouth(content)

    case 'topcon':
      return adaptTopcon(content)

    case 'jobxml':
      return adaptJobXML(content)

    case 'landxml':
      return adaptLandXML(content)

    case 'trimble_dc':
      return adaptTrimbleDC(content)

    case 'carlson_rw5':
      return adaptCarlsonRW5(content)

    default:
      return unknownFormatFallback(content, filename)
  }
}

/**
 * Fallback for unrecognised formats.
 *
 * Unknown formats require an explicit supported format or controller export.
 * Never guess a CSV axis order or synthesize a station origin.
 */
function unknownFormatFallback(
  _content: string,
  filename: string
): UnifiedImportResult {
  const errors: string[] = [
    'Unrecognised total station format for file "' + filename + '"',
  ]
  return {
    format: 'unknown',
    instrument: 'Unknown',
    stationName: '',
    observations: [],
    meanedObservations: [],
    rawPoints: [],
    errors: errors,
    warnings: [],
  }
}

// Re-export types for convenience
export type {
  UnifiedObservation,
  UnifiedRawPoint,
  UnifiedImportResult,
} from './unifiedTypes'
