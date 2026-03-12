import { LatLon, UTMCoord, SurveyResult, ok, err } from "./types";
import { toRadians, toDegrees, decimalToDMS } from "./angles";

// ─── COORDINATE CONVERSION ────────────────────────────────────────────────────
// WGS84 ellipsoid constants
const _a = 6_378_137.0;
const _f = 1 / 298.257_223_563;
const WGS84 = {
  a: _a,
  f: _f,
  b: _a * (1 - _f),
  e2: 2 * _f - _f ** 2,
  e_prime2: (2 * _f - _f ** 2) / (1 - (2 * _f - _f ** 2)),
};

const K0 = 0.9996;    // UTM scale factor
const E0 = 500_000;   // false easting, metres
const N0_S = 10_000_000; // false northing for southern hemisphere

/**
 * Convert WGS84 geographic coordinates to UTM.
 *
 * @param latLon  { latitude, longitude } in decimal degrees
 * @param zone    UTM zone number (1–60). If omitted, the zone is auto-computed.
 */
export function geographicToUTM(
  latLon: LatLon,
  zone?: number
): SurveyResult<UTMCoord> {
  const { latitude: lat, longitude: lon } = latLon;

  if (lat < -80 || lat > 84) {
    return err("UTM is not defined for latitudes outside −80° to +84°. Use UPS.");
  }
  if (lon < -180 || lon > 180) {
    return err("Longitude must be in the range −180° to +180°.");
  }

  const utmZone = zone ?? Math.floor((lon + 180) / 6) + 1;
  const lonOrigin = (utmZone - 1) * 6 - 180 + 3; // central meridian

  const { a, e2, e_prime2 } = WGS84;
  const latRad = toRadians(lat);
  const lonRad = toRadians(lon);
  const lonOriginRad = toRadians(lonOrigin);

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = e_prime2 * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (lonRad - lonOriginRad);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) *
        Math.sin(2 * latRad) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * latRad));

  const easting =
    K0 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T ** 2 + 72 * C - 58 * e_prime2) * A ** 5) / 120) +
    E0;

  const northing =
    K0 *
      (M +
        N *
          Math.tan(latRad) *
          (A ** 2 / 2 +
            ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
            ((61 - 58 * T + T ** 2 + 600 * C - 330 * e_prime2) * A ** 6) / 720));

  const hemisphere: "N" | "S" = lat >= 0 ? "N" : "S";
  const northingFinal = hemisphere === "S" ? northing + N0_S : northing;

  return ok({ easting, northing: northingFinal, zone: utmZone, hemisphere });
}

/**
 * Convert UTM coordinates to WGS84 geographic coordinates.
 */
export function utmToGeographic(coord: UTMCoord): SurveyResult<LatLon> {
  const { easting, northing, zone, hemisphere } = coord;

  if (zone < 1 || zone > 60) return err("UTM zone must be 1–60.");
  if (easting < 100_000 || easting > 900_000) {
    return err("Easting out of valid UTM range (100 000 – 900 000 m).");
  }

  const { a, e2, e_prime2 } = WGS84;
  const lonOrigin = (zone - 1) * 6 - 180 + 3;

  const x = easting - E0;
  const y = hemisphere === "S" ? northing - N0_S : northing;

  const M = y / K0;
  const mu =
    M /
    (a *
      (1 -
        e2 / 4 -
        (3 * e2 ** 2) / 64 -
        (5 * e2 ** 3) / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  // Footpoint latitude
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = e_prime2 * Math.cos(phi1) ** 2;
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = x / (N1 * K0);

  const latitude =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * e_prime2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * e_prime2 - 3 * C1 ** 2) *
          D ** 6) /
          720);

  const longitude =
    toRadians(lonOrigin) +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * e_prime2 + 24 * T1 ** 2) *
        D ** 5) /
        120) /
      Math.cos(phi1);

  return ok({
    latitude: toDegrees(latitude),
    longitude: toDegrees(longitude),
  });
}

/**
 * Convenience: format a LatLon as a human-readable DMS string.
 */
export function latLonToString(latLon: LatLon): string {
  const lat = decimalToDMS(latLon.latitude);
  const lon = decimalToDMS(latLon.longitude);
  const latHem = latLon.latitude >= 0 ? "N" : "S";
  const lonHem = latLon.longitude >= 0 ? "E" : "W";

  const fmt = (d: ReturnType<typeof decimalToDMS>, hem: string) =>
    `${hem} ${d.degrees}° ${d.minutes}' ${d.seconds.toFixed(4)}"`;

  return `${fmt(lat, latHem)}, ${fmt(lon, lonHem)}`;
}
