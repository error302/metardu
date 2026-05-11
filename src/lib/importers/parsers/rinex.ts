/**
 * METARDU — RINEX Parser (Basic)
 * Phase C1: RINEX Parser for GNSS data
 * 
 * Extracts header metadata (approximate position, antenna height, receiver type)
 * from standard RINEX observation files (v2 and v3).
 */

import { registerParser } from '../registry'
import { ParseResult, ParsedPoint } from '@/types/importer'

export interface RinexHeader {
  version: string
  fileType: string
  markerName: string
  markerNumber?: string
  observer?: string
  agency?: string
  receiverType?: string
  receiverSn?: string
  antennaType?: string
  antennaSn?: string
  approxPosECEF?: { x: number; y: number; z: number }
  antennaDelta?: { h: number; e: number; n: number }
  timeOfFirstObs?: string
}

export interface RinexParseResult extends ParseResult {
  format: 'rinex'
  header: RinexHeader
}

export function parseRinexHeader(content: string): RinexHeader {
  const lines = content.split('\n')
  const header: Partial<RinexHeader> = {}

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd() // Keep exact column spacing
    if (line.length < 60) continue

    const label = line.substring(60).trim()

    if (label === 'RINEX VERSION / TYPE') {
      header.version = line.substring(0, 9).trim()
      header.fileType = line.substring(20, 21) // 'O' for Observation
    } else if (label === 'MARKER NAME') {
      header.markerName = line.substring(0, 60).trim()
    } else if (label === 'MARKER NUMBER') {
      header.markerNumber = line.substring(0, 20).trim()
    } else if (label === 'OBSERVER / AGENCY') {
      header.observer = line.substring(0, 20).trim()
      header.agency = line.substring(20, 60).trim()
    } else if (label === 'REC # / TYPE / VERS') {
      header.receiverSn = line.substring(0, 20).trim()
      header.receiverType = line.substring(20, 40).trim()
    } else if (label === 'ANT # / TYPE') {
      header.antennaSn = line.substring(0, 20).trim()
      header.antennaType = line.substring(20, 40).trim()
    } else if (label === 'APPROX POSITION XYZ') {
      const x = parseFloat(line.substring(0, 14))
      const y = parseFloat(line.substring(14, 28))
      const z = parseFloat(line.substring(28, 42))
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        header.approxPosECEF = { x, y, z }
      }
    } else if (label === 'ANTENNA: DELTA H/E/N') {
      const h = parseFloat(line.substring(0, 14))
      const e = parseFloat(line.substring(14, 28))
      const n = parseFloat(line.substring(28, 42))
      if (!isNaN(h) && !isNaN(e) && !isNaN(n)) {
        header.antennaDelta = { h, e, n }
      }
    } else if (label === 'TIME OF FIRST OBS') {
      header.timeOfFirstObs = line.substring(0, 43).trim()
    } else if (label === 'END OF HEADER') {
      break
    }
  }

  return header as RinexHeader
}

export function parseRinex(content: string): RinexParseResult {
  const header = parseRinexHeader(content)
  const points: ParsedPoint[] = []

  // If we have an approximate position, we can export it as a point
  if (header.approxPosECEF) {
    // ECEF to Lat/Lon/Height would normally happen here or in the engine
    // For now, we return the raw ECEF in the raw data
    points.push({
      point_no: header.markerName || 'UNKNOWN',
      feature_code: 'GNSS_STATIC',
      instrument_height: header.antennaDelta?.h || 0,
      raw: {
        ecef_x: header.approxPosECEF.x,
        ecef_y: header.approxPosECEF.y,
        ecef_z: header.approxPosECEF.z,
        receiver: header.receiverType,
        antenna: header.antennaType
      }
    })
  }

  return {
    format: 'rinex',
    header,
    points,
    warnings: []
  }
}

registerParser({
  format: 'rinex',
  label: 'RINEX Observation File (v2/v3)',
  extensions: ['rnx', 'obs', 'O', 'o', '21O', '22O', '23O'], // standard extensions
  detect: (content) => {
    return content.includes('RINEX VERSION / TYPE') && content.includes('END OF HEADER')
  },
  parse: (content): ParseResult => {
    return parseRinex(content)
  }
})
