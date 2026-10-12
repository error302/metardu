/**
 * Projection constants — zero-dependency module.
 *
 * This module intentionally contains ONLY string constants so it is safe to
 * statically import from the root layout, landing page, and shared chrome
 * (NavBar, Footer) without dragging proj4/OpenLayers into their bundle graph.
 *
 * The full registration machinery lives in `projection.ts` — importing that
 * module from a marketing route makes webpack fulfill its dynamic imports
 * (proj4 + ol/proj/proj4 ≈ 46 chunks) on pages that never render a map.
 *
 * History: the landing page loaded ~600 KB of OpenLayers because layout.tsx
 * imported `SRID_21037` from `projection.ts` for a JSON-LD string.
 */

export const EPSG_21037_DEF =
  '+proj=utm +zone=37 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs';

// Both zones use the EPSG-registered Arc 1960 → WGS84 transformation
// EPSG:1122 ("Arc 1960 to WGS 84 (1)", 3-parameter geocentric translation
// -160/-6/-302, DMA, 35 m) — the exact TOWGS84 carried by the official EPSG
// definitions of EPSG:21036/21037 (and by PostGIS/GeoServer/PROJ).
// EPSG:1284 ("…(2)", -157/-2/-299, 6 m, Kenya onshore) is the more accurate
// Kenya fit but is a transformation, not the CRS definition.
// Never vary the shift per zone and never cite unregistered parameters.
export const EPSG_21036_DEF =
  '+proj=utm +zone=36 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs';

export const EPSG_32736_DEF =
  '+proj=utm +zone=36 +south +datum=WGS84 +units=m +no_defs';

export const EPSG_32737_DEF =
  '+proj=utm +zone=37 +south +datum=WGS84 +units=m +no_defs';

export const SRID_21037 = 'EPSG:21037';
export const SRID_21036 = 'EPSG:21036';
export const SRID_32736 = 'EPSG:32736';
export const SRID_32737 = 'EPSG:32737';
export const SRID_3857 = 'EPSG:3857';
export const SRID_4326 = 'EPSG:4326';

/** UTM zone auto-detection — pure math, no dependencies. */
export interface UtmZoneResult {
  wgs84: string
  zone: number
  hemisphere: 'N' | 'S'
  arc1960: string
}

/**
 * Auto-detect the appropriate UTM zone (and hemisphere) from coordinates.
 *
 * Kenya fast path: longitudes 30°E–42°E map to the national zones 36S/37S
 * regardless of latitude, matching the cadastral datum used in-app.
 * Worldwide fallback: zone derived mathematically from longitude (clamped to
 * 1–60, so lng = ±180 is valid) and hemisphere derived from the latitude sign.
 * When `lat` is omitted the result defaults to the southern hemisphere — the
 * historical behaviour for Kenya-only callers.
 *
 * Note: proj4 defs are only registered for EPSG:21036/21037 (Arc 1960,
 * Kenya). Outside those zones the returned `arc1960` code is valid notation
 * but must be registered with proj4 before use in transforms.
 *
 * @param lng — Longitude in decimal degrees (WGS84)
 * @param lat — Optional latitude in decimal degrees (WGS84). Enables
 *              correct northern-hemisphere EPSG codes (e.g. EPSG:32610).
 */
export function autoDetectUtmZone(lng: number, lat?: number): UtmZoneResult {
  let zone: number
  if (lng >= 30 && lng < 36) {
    zone = 36
  } else if (lng >= 36 && lng < 42) {
    zone = 37
  } else {
    // Fallback: compute zone mathematically for anywhere in the world,
    // clamped to the valid UTM range 1–60 (lng = 180°E would otherwise
    // produce zone 61).
    zone = Math.min(60, Math.max(1, Math.floor((lng + 180) / 6) + 1))
  }

  // Kenya is entirely in the southern hemisphere; the worldwide fallback
  // derives the hemisphere from the latitude sign (equator → northern).
  const hemisphere: 'N' | 'S' = lat === undefined ? 'S' : lat >= 0 ? 'N' : 'S'

  // WGS84 UTM EPSG codes zero-pad the zone to two digits (zone 1N =
  // EPSG:32601, not 3261); Kenya's zones 36/37 never exposed this.
  const zone2 = String(zone).padStart(2, '0')

  return {
    wgs84: `EPSG:32${hemisphere === 'S' ? '7' : '6'}${zone2}`,
    arc1960: `EPSG:210${zone}`,
    zone,
    hemisphere,
  }
}
