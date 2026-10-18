/**
 * METARDU — Trimble DC File Parser (.dc)
 * 
 * Parses classic Trimble Data Collector raw and coordinate records:
 * - Record 00: Job Header / Coordinate System
 * - Record 01: Station Setup
 * - Record 02: Backsight Reference
 * - Record 03: Polar Measurement (HA, VA, SD)
 * - Record 10: Stored Coordinates (10,PointID,Northing,Easting,Elevation,Code)
 * - Record 11: Control Point
 */

import { coordinateNumber } from './coordinateNumber'
export interface TrimbleDcPoint {
  pointId: string
  northing: number
  easting: number
  elevation?: number
  code?: string
}

export interface TrimbleDcParsed {
  records: TrimbleDcPoint[]
  stationSetups: Array<{ stationId: string; heightOfInstrument?: number }>
  warnings: string[]
  pointCount: number
}

export function parseTrimbleDC(content: string): TrimbleDcParsed {
  const records: TrimbleDcPoint[] = []
  const stationSetups: TrimbleDcParsed['stationSetups'] = []
  const warnings: string[] = []

  const lines = content.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim()
    if (!rawLine) continue

    // Record type is the first token before comma or space
    const parts = rawLine.split(',').map((p) => p.trim())
    const recordType = parts[0]

    // Record 10 or 11: Point coordinates
    // Format: 10,PointID,Northing,Easting,Elevation,Code
    // Or space-delimited: 10 PointID Northing Easting Elevation Code
    if (recordType === '10' || recordType === '11') {
      if (parts.length >= 5) {
        const pointId = parts[1]
        const n = coordinateNumber(parts[2])
        const e = coordinateNumber(parts[3])
        const z = coordinateNumber(parts[4])
        const code = parts[5] || ''

        if (pointId && typeof n==='number' && Number.isFinite(n) && typeof e==='number' && Number.isFinite(e)) {
          records.push({
            pointId,
            northing: n,
            easting: e,
            elevation: z,
            code: code || undefined,
          })
        } else warnings.push(`Line ${i+1}: incomplete or invalid coordinate record`)
      }
    } else if (recordType === '01') {
      // Station Setup: 01,StnID,HI,...
      if (parts.length >= 2) {
        const stnId = parts[1]
        const hi = parts[2] ? parseFloat(parts[2]) : undefined
        stationSetups.push({ stationId: stnId, heightOfInstrument: isNaN(hi as number) ? undefined : hi })
      }
    }
  }

  if (records.length === 0) {
    warnings.push('No type 10/11 coordinate records found in Trimble DC file.')
  }

  return {
    records,
    stationSetups,
    warnings,
    pointCount: records.length,
  }
}
