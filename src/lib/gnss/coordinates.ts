/**
 * Coordinate conversion utilities
 * Convert between WGS84 (GPS) and Kenya SRID 21037 (Arc 1960 / UTM Zone 37S)
 */

export interface WGS84Coordinate {
  latitude: number;
  longitude: number;
  altitude: number;
}

export interface UTMCoordinate {
  easting: number;
  northing: number;
  zone: number;
  hemisphere: 'N' | 'S';
}

export interface KenyanCoordinate {
  easting: number;
  northing: number;
  height?: number;
}

export function wgs84ToUTM(lat: number, lon: number): UTMCoordinate {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const hemisphere = lat >= 0 ? 'N' : 'S';

  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e = Math.sqrt(2 * f - f * f);
  const e2 = e * e;
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = (e2 * Math.cos(latRad) ** 2) / (1 - e2);
  const A = Math.cos(latRad) * (lonRad - lon0);

  const M = a * (
    (1 - e2 / 4 - e4 / 64 - e6 / 256) * latRad -
    (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * latRad) +
    (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * latRad) -
    (35 * e6 / 3072) * Math.sin(6 * latRad)
  );

  const easting = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * e2) * A ** 5 / 120) + 500000;
  const northing = hemisphere === 'S'
    ? k0 * (M + N * Math.tan(latRad) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * e2) * A ** 6 / 720))
    : k0 * (M + N * Math.tan(latRad) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * e2) * A ** 6 / 720));

  return {
    easting: Math.round(easting * 1000) / 1000,
    northing: Math.round(northing * 1000) / 1000,
    zone,
    hemisphere,
  };
}

export function wgs84ToKenya(wgs: WGS84Coordinate): KenyanCoordinate {
  const utm = wgs84ToUTM(wgs.latitude, wgs.longitude);
  
  const datumShiftE = -160;
  const datumShiftN = -302;
  
  return {
    easting: utm.easting + datumShiftE,
    northing: utm.northing + datumShiftN,
    height: wgs.altitude,
  };
}

export function formatCoordinate(coord: KenyanCoordinate, decimals: number = 3): string {
  return `E ${coord.easting.toFixed(decimals)}  N ${coord.northing.toFixed(decimals)}`;
}

export function distance(coord1: KenyanCoordinate, coord2: KenyanCoordinate): number {
  const dE = coord2.easting - coord1.easting;
  const dN = coord2.northing - coord1.northing;
  return Math.sqrt(dE ** 2 + dN ** 2);
}