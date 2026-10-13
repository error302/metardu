import type { NMEAPosition, ParsedInstrumentData } from './protocolParsers'

export interface StreamedPoint {
  id: string
  pointName: string
  latitude?: number
  longitude?: number
  northing?: number
  easting?: number
  elevation: number | null
  timestamp: Date
  source: 'nmea' | 'gsi'
  quality?: number
  satellites?: number
  hdop?: number
  raw: unknown
}

let pointCounter = 0

/** Convert parsed instrument packets without inventing coordinates in another reference system. */
export function createStreamedPoint(data: ParsedInstrumentData): StreamedPoint | null {
  const sequence = pointCounter++
  const id = `stream-${Date.now()}-${sequence}`
  const validCoordinatePair = (easting: number | undefined, northing: number | undefined) =>
    typeof easting === 'number' && Number.isFinite(easting)
    && typeof northing === 'number' && Number.isFinite(northing)

  if (data.type === 'nmea') {
    const nmea = data.data as NMEAPosition
    if (typeof nmea.fixQuality !== 'number' || !Number.isFinite(nmea.fixQuality) || nmea.fixQuality <= 0
      || !Number.isFinite(nmea.latitude) || !Number.isFinite(nmea.longitude)
      || nmea.latitude < -90 || nmea.latitude > 90 || nmea.longitude < -180 || nmea.longitude > 180) return null
    return {
      id,
      pointName: `GNSS-${sequence + 1}`,
      latitude: nmea.latitude,
      longitude: nmea.longitude,
      elevation: nmea.altitude ?? null,
      timestamp: nmea.timestamp || new Date(),
      source: 'nmea',
      quality: nmea.fixQuality,
      satellites: nmea.satellites,
      hdop: nmea.hdop,
      raw: nmea,
    }
  }

  if (data.type === 'gsi') {
    const gsi = data.data
    if (!validCoordinatePair(gsi.easting, gsi.northing)) return null
    return {
      id,
      pointName: gsi.stationId || `TS-${gsi.pointNumber || sequence + 1}`,
      northing: gsi.northing,
      easting: gsi.easting,
      elevation: gsi.height ?? null,
      timestamp: new Date(),
      source: 'gsi',
      raw: gsi,
    }
  }

  if (data.type === 'topcon') {
    const point = data.data
    if (!validCoordinatePair(point.easting, point.northing)) return null
    return {
      id,
      pointName: `TS-${point.pointNumber || sequence + 1}`,
      northing: point.northing,
      easting: point.easting,
      elevation: point.elevation ?? null,
      timestamp: new Date(),
      source: 'gsi',
      raw: point,
    }
  }

  if (data.type === 'trimble') {
    const point = data.data
    if (!validCoordinatePair(point.easting, point.northing)) return null
    return {
      id,
      pointName: `TS-${point.pointNumber || sequence + 1}`,
      northing: point.northing,
      easting: point.easting,
      elevation: point.elevation ?? null,
      timestamp: new Date(),
      source: 'gsi',
      raw: point,
    }
  }

  if (data.type === 'sokkia') {
    const point = data.data
    if (!validCoordinatePair(point.easting, point.northing)) return null
    return {
      id,
      pointName: `TS-${point.pointNumber || sequence + 1}`,
      northing: point.northing,
      easting: point.easting,
      elevation: point.elevation ?? null,
      timestamp: new Date(),
      source: 'gsi',
      raw: point,
    }
  }

  return null
}
