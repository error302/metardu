/**
 * @deprecated This module contains approximate coordinate math and must NOT be
 * used for any legal submission, QA computation, or coordinate storage.
 * Use @/lib/geo/transform for all authoritative coordinate transformations.
 */

// src/math/coordinates.ts
// Arc 1960 Datum → UTM Zone 37N / 38N (Kenya standard)

export interface GeoPoint {
  easting: number;
  northing: number;
  zone: 37 | 38;
}

export const latLonToUTM = (lat: number, lon: number): GeoPoint => {
  const zone = lon >= 36 && lon < 42 ? (lon < 39 ? 37 : 38) : 37;
  
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  
  console.warn("Full datum transformation should use proj4js in production");

  return {
    easting: Number((500000 + (lon - (zone * 6 - 183)) * 111320 * Math.cos(lat * Math.PI/180)).toFixed(3)),
    northing: Number(((lat - 0) * 111139).toFixed(3)),
    zone
  };
};

export const bearingDistanceToDelta = (bearingDeg: number, distanceM: number) => {
  const brRad = (bearingDeg * Math.PI) / 180;
  return {
    deltaE: Number((distanceM * Math.sin(brRad)).toFixed(4)),
    deltaN: Number((distanceM * Math.cos(brRad)).toFixed(4))
  };
};
