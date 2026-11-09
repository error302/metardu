import { assertProjectedCrs, transformPoint, WGS84_CRS } from '@/lib/spatial/projectCrs'
import type { Point } from './geofenceEngine'

export const GEOFENCE_FIX_MAX_AGE_MS = 15_000

export interface GeofenceFix {
  point: Point
  timestamp: number
  reportedAccuracy: number
  gridAccuracy: number
}

export function supportsGeofenceGps(crs: string): boolean {
  return /^EPSG:32[67](0[1-9]|[1-5][0-9]|60)$/.test(crs)
}

export function geofenceGpsFix(position: GeolocationPosition, crs: string, now: number): GeofenceFix {
  const { longitude, latitude, accuracy } = position.coords
  const { timestamp } = position
  if (
    ![longitude, latitude, accuracy, timestamp].every(Number.isFinite) ||
    Math.abs(longitude) > 180 || accuracy <= 0 || accuracy > 10_000 ||
    timestamp > now || now - timestamp >= GEOFENCE_FIX_MAX_AGE_MS
  ) throw new Error('Waiting for a fresh device fix with reported accuracy.')

  if (!supportsGeofenceGps(crs)) throw new Error('Device positioning requires a WGS 84 UTM project grid.')
  const info = assertProjectedCrs(crs)
  if (info.zone === undefined || !info.hemisphere) throw new Error('The declared project grid has no UTM zone.')
  const centralMeridian = (info.zone - 1) * 6 - 177
  const longitudeOffset = Math.abs(((longitude - centralMeridian + 540) % 360) - 180)
  if (
    longitudeOffset > 3.5 ||
    (info.hemisphere === 'S' ? latitude < -80 || latitude > 0 : latitude < 0 || latitude > 84)
  ) throw new Error('Device position is outside the supported project grid area.')

  const [easting, northing] = transformPoint(longitude, latitude, WGS84_CRS, crs)
  if (![easting, northing].every(Number.isFinite)) throw new Error('Device position could not be projected.')
  // Allow for local UTM scale when comparing a device accuracy estimate to grid distances.
  return { point: { easting, northing }, timestamp, reportedAccuracy: accuracy, gridAccuracy: accuracy * 1.01 }
}
