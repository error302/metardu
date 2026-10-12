/**
 * core/format — THE coordinate-format service (plan §3.1 / F6, Phase 1).
 *
 * One import point for everything a map/plan surface renders as text:
 *  - grid numbers / E–N pairs (grouped): authority implementation in projectCrs
 *  - plain grid pair ('E x  N y'): moved here from lib/gnss/coordinates (F6)
 *  - lat/lon DMS + MGRS strings: single implementation in lib/geodesy/coordinates
 *  - metric result formats (m/km, m²/ha, WCB bearings): moved here from
 *    lib/map/measurements (F2/F6) — that module re-exports them for compatibility.
 *
 * No formatting logic should be added anywhere else (blueprint §12.4).
 */
export { formatCoordinate, formatPoint } from '@/lib/spatial/projectCrs';
export type { FormatOptions } from '@/lib/spatial/projectCrs';
export { latLonToString, latLonToMGRS, mgrsToLatLon } from '@/lib/geodesy/coordinates';

/**
 * Plain grid pair — 'E 123.456  N 456.789' (no thousands grouping).
 * Moved from `lib/gnss/coordinates.formatCoordinate`, which now wraps this.
 */
export function formatGridPoint(
  coord: { easting: number; northing: number },
  decimals: number = 3,
): string {
  return `E ${coord.easting.toFixed(decimals)}  N ${coord.northing.toFixed(decimals)}`;
}

// ── Metric result formatting (moved verbatim from lib/map/measurements) ──────

export function squareMetersToHectares(areaM2: number): number {
  return areaM2 / 10000;
}

export function squareMetersToAcres(areaM2: number): number {
  return areaM2 / 4046.86;
}

export function formatBearingWCB(bearing: number): string {
  let quadrant: string;
  let angle: number;

  if (bearing >= 0 && bearing < 90) {
    quadrant = 'NE';
    angle = bearing;
  } else if (bearing >= 90 && bearing < 180) {
    quadrant = 'SE';
    angle = 180 - bearing;
  } else if (bearing >= 180 && bearing < 270) {
    quadrant = 'SW';
    angle = bearing - 180;
  } else {
    quadrant = 'NW';
    angle = 360 - bearing;
  }

  const degrees = Math.floor(angle);
  const minutesFloat = (angle - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60);

  const degStr = degrees.toString();
  const minStr = minutes.toString().padStart(2, '0');
  const secStr = seconds.toString().padStart(2, '0');

  const [ns, ew] = quadrant.split('');

  return `${ns} ${degStr}°${minStr}'${secStr}" ${ew}`;
}

export function formatBearingAzimuth(bearing: number): string {
  return `${bearing.toFixed(4)}°`;
}

export function formatDistance(meters: number, precision: number = 3): string {
  if (meters < 1000) {
    return `${meters.toFixed(precision)} m`;
  } else {
    return `${(meters / 1000).toFixed(precision)} km`;
  }
}

export function formatArea(areaM2: number): string {
  const ha = squareMetersToHectares(areaM2);

  if (ha < 1) {
    return `${areaM2.toFixed(1)} m²`;
  } else if (ha < 100) {
    return `${ha.toFixed(4)} ha`;
  } else {
    return `${ha.toFixed(2)} ha`;
  }
}
