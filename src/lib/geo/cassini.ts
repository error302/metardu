/**
 * Cassini-Soldner Projection Library for Kenya Cadastral Surveys
 *
 * Implements Cassini-Soldner ↔ UTM coordinate conversion using the Clarke 1858
 * ellipsoid, which was the standard for Kenya's colonial-era cadastral grid
 * systems. Each district had its own local Cassini origin (false origin).
 *
 * Transformation chain:
 *   Cassini (Clarke 1858) → Geographic (Clarke 1858/Approx WGS84) → UTM (Arc 1960)
 *
 * References:
 * - Kenya Survey Regulations 1994 — historic coordinate reference systems
 * - Snyder, J.P. (1987) "Map Projections — A Working Manual", USGS PP 1395, p.101
 * - EPSG Guidance Note 7-2 — Cassini-Soldner projection formulas
 * - Clarke 1858 ellipsoid: a = 6,378,351m, 1/f = 294.26
 *
 * IMPORTANT: The datum shift from Clarke 1858 to WGS84 uses approximate Molodensky
 * parameters. For cadastral-grade accuracy (<0.1m), users should apply district-
 * specific transformation parameters derived from known control points.
 */

import proj4 from 'proj4'

// ─── Clarke 1858 Ellipsoid ────────────────────────────────────────────────
export const CLARKE_1858_A = 6378351.0
export const CLARKE_1858_RF = 294.26

// ─── Cassini Origin Presets (Kenya) ──────────────────────────────────────
/**
 * Known Cassini-Soldner local grid origins used in Kenya cadastral surveys.
 *
 * Each entry defines:
 * - lat0, lon0: latitude/longitude of the false origin (decimal degrees)
 * - fe, fn: false easting and false northing (metres)
 * - name: human-readable district/region name
 *
 * NOTE: These are the most commonly referenced origins. Many additional
 * district-specific origins exist in the Kenya Survey Department records.
 * Users should verify the origin parameters against their source documents.
 */
export interface CassiniOrigin {
  id: string
  name: string
  description: string
  lat0: number    // Latitude of false origin (decimal degrees, negative = South)
  lon0: number    // Longitude of false origin (decimal degrees)
  fe: number      // False Easting (metres)
  fn: number      // False Northing (metres)
}

export const KENYA_CASSINI_ORIGINS: CassiniOrigin[] = [
  {
    id: 'mount-kenya',
    name: 'Mount Kenya (Equator)',
    description: 'Cassini origin on the equator at 37°15\'E. Used for central Kenya cadastral surveys.',
    lat0: 0.0,
    lon0: 37.25,
    fe: 10000,
    fn: 10000,
  },
  {
    id: 'tana-river',
    name: 'Tana River',
    description: 'Cassini origin for the Tana River basin region, eastern Kenya.',
    lat0: -0.25,
    lon0: 40.0,
    fe: 10000,
    fn: 10000,
  },
  {
    id: 'lake-victoria',
    name: 'Lake Victoria (Kisumu)',
    description: 'Cassini origin for the Lake Victoria basin, western Kenya. Near Kisumu.',
    lat0: -0.083333,
    lon0: 34.75,
    fe: 10000,
    fn: 10000,
  },
  {
    id: 'coast-mombasa',
    name: 'Coast (Mombasa)',
    description: 'Cassini origin for the coastal strip, near Mombasa.',
    lat0: -4.05,
    lon0: 39.6667,
    fe: 10000,
    fn: 10000,
  },
  {
    id: 'nairobi',
    name: 'Nairobi (Central)',
    description: 'Cassini origin near Nairobi. Verify against your RIM/GIS records before use.',
    lat0: -1.2921,
    lon0: 36.8219,
    fe: 10000,
    fn: 10000,
  },
  {
    id: 'nakuru',
    name: 'Nakuru (Rift Valley)',
    description: 'Cassini origin for the central Rift Valley near Nakuru.',
    lat0: -0.3030,
    lon0: 36.0833,
    fe: 10000,
    fn: 10000,
  },
  {
    id: 'garissa',
    name: 'Garissa (NE Province)',
    description: 'Cassini origin for North Eastern Province surveys.',
    lat0: -0.4544,
    lon0: 39.6542,
    fe: 10000,
    fn: 10000,
  },
  {
    id: 'kisii',
    name: 'Kisii (Nyanza)',
    description: 'Cassini origin for the Kisii highlands, Nyanza Province.',
    lat0: -0.6769,
    lon0: 34.7792,
    fe: 10000,
    fn: 10000,
  },
]

// ─── UTM CRS References ──────────────────────────────────────────────────
const WGS84 = 'EPSG:4326'
const ARC1960_UTM37S = '+proj=utm +zone=37 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs'
const ARC1960_UTM36S = '+proj=utm +zone=36 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs'
const WGS84_UTM37S = '+proj=utm +zone=37 +south +datum=WGS84 +units=m +no_defs'
const WGS84_UTM36S = '+proj=utm +zone=36 +south +datum=WGS84 +units=m +no_defs'

// ─── CRS Registry (memoized) ─────────────────────────────────────────────
const crsRegistry = new Map<string, string>()

/**
 * Build and register a proj4 CRS definition for a Cassini-Soldner grid.
 *
 * The datum shift from Clarke 1858 to WGS84 uses the approximate parameters
 * dx=-160, dy=-6, dz=-302 (same as Arc 1960 → WGS84). This is a commonly
 * used approximation in Kenyan survey practice, though for cadastral-grade
 * accuracy users should apply district-specific parameters.
 */
function getCassiniCRS(origin: CassiniOrigin): string {
  const key = origin.id || `custom-${origin.lat0}-${origin.lon0}-${origin.fe}-${origin.fn}`
  if (crsRegistry.has(key)) return crsRegistry.get(key)!

  const def = [
    '+proj=cass',
    `+lat_0=${origin.lat0}`,
    `+lon_0=${origin.lon0}`,
    `+x_0=${origin.fe}`,
    `+y_0=${origin.fn}`,
    `+a=${CLARKE_1858_A}`,
    `+rf=${CLARKE_1858_RF}`,
    // Approximate datum shift — see header comments
    '+towgs84=-160,-6,-302,0,0,0,0',
    '+units=m',
    '+no_defs',
  ].join(' ')

  crsRegistry.set(key, def)
  return def
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface CassiniPoint {
  id?: string
  easting: number
  northing: number
}

export interface UTMPoint {
  id?: string
  easting: number
  northing: number
  zone: number
  hemisphere: 'N' | 'S'
}

export interface LatLonPoint {
  id?: string
  lat: number
  lon: number
}

export interface ConversionResult {
  id?: string
  cassiniE?: number
  cassiniN?: number
  utmE?: number
  utmN?: number
  utmZone?: number
  lat?: number
  lon?: number
  roundTripError?: number  // metres
  warning?: string
}

export type UTMOutputDatum = 'arc1960' | 'wgs84'
export type UTMZone = 36 | 37

/**
 * Convert Cassini-Soldner coordinates to UTM.
 *
 * @param points - Array of Cassini coordinates (Easting, Northing)
 * @param origin - Cassini origin definition
 * @param utmDatum - Output UTM datum: 'arc1960' (Kenya cadastral) or 'wgs84' (GPS)
 * @param utmZone - UTM zone (36 or 37 for Kenya)
 * @returns Array of conversion results with UTM coordinates
 */
export function cassiniToUTM(
  points: CassiniPoint[],
  origin: CassiniOrigin,
  utmDatum: UTMOutputDatum = 'arc1960',
  utmZone: UTMZone = 37,
): ConversionResult[] {
  const cassiniDef = getCassiniCRS(origin)
  const utmDef = utmDatum === 'arc1960'
    ? (utmZone === 36 ? ARC1960_UTM36S : ARC1960_UTM37S)
    : (utmZone === 36 ? WGS84_UTM36S : WGS84_UTM37S)

  return points.map((pt) => {
    try {
      // Cassini → WGS84 geographic
      const [lon, lat] = proj4(cassiniDef, WGS84, [pt.easting, pt.northing])

      // WGS84 geographic → UTM
      const [utmE, utmN] = proj4(WGS84, utmDef, [lon, lat])

      // Round-trip check: UTM → WGS84 → Cassini
      const [lon2, lat2] = proj4(utmDef, WGS84, [utmE, utmN])
      const [cE2, cN2] = proj4(WGS84, cassiniDef, [lon2, lat2])
      const roundTripError = Math.hypot(pt.easting - cE2, pt.northing - cN2)

      return {
        id: pt.id,
        cassiniE: pt.easting,
        cassiniN: pt.northing,
        utmE,
        utmN,
        utmZone,
        lat,
        lon,
        roundTripError,
      }
    } catch (err) {
      return {
        id: pt.id,
        cassiniE: pt.easting,
        cassiniN: pt.northing,
        warning: `Conversion failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  })
}

/**
 * Convert UTM coordinates to Cassini-Soldner.
 *
 * @param points - Array of UTM coordinates
 * @param origin - Cassini origin definition
 * @param utmDatum - Input UTM datum: 'arc1960' or 'wgs84'
 * @param utmZone - UTM zone
 * @returns Array of conversion results with Cassini coordinates
 */
export function utmToCassini(
  points: UTMPoint[],
  origin: CassiniOrigin,
  utmDatum: UTMOutputDatum = 'arc1960',
  utmZone?: number,
): ConversionResult[] {
  const cassiniDef = getCassiniCRS(origin)
  const zone = utmZone ?? points[0]?.zone ?? 37
  const hem = points[0]?.hemisphere ?? 'S'
  const utmDef = utmDatum === 'arc1960'
    ? (zone === 36 ? ARC1960_UTM36S : ARC1960_UTM37S)
    : (zone === 36 ? WGS84_UTM36S : WGS84_UTM37S)

  return points.map((pt) => {
    try {
      // UTM → WGS84 geographic
      const [lon, lat] = proj4(utmDef, WGS84, [pt.easting, pt.northing])

      // WGS84 geographic → Cassini
      const [cassE, cassN] = proj4(WGS84, cassiniDef, [lon, lat])

      // Round-trip check: Cassini → WGS84 → UTM
      const [lon2, lat2] = proj4(cassiniDef, WGS84, [cassE, cassN])
      const [utmE2, utmN2] = proj4(WGS84, utmDef, [lon2, lat2])
      const roundTripError = Math.hypot(pt.easting - utmE2, pt.northing - utmN2)

      return {
        id: pt.id,
        cassiniE: cassE,
        cassiniN: cassN,
        utmE: pt.easting,
        utmN: pt.northing,
        utmZone: zone,
        lat,
        lon,
        roundTripError,
      }
    } catch (err) {
      return {
        id: pt.id,
        utmE: pt.easting,
        utmN: pt.northing,
        warning: `Conversion failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  })
}

/**
 * Convert a single Cassini point to geographic (WGS84 lat/lon).
 */
export function cassiniToGeographic(
  point: CassiniPoint,
  origin: CassiniOrigin,
): { lat: number; lon: number } {
  const cassiniDef = getCassiniCRS(origin)
  const [lon, lat] = proj4(cassiniDef, WGS84, [point.easting, point.northing])
  return { lat, lon }
}

/**
 * Convert geographic (WGS84 lat/lon) to Cassini-Soldner.
 */
export function geographicToCassini(
  lat: number,
  lon: number,
  origin: CassiniOrigin,
): { easting: number; northing: number } {
  const cassiniDef = getCassiniCRS(origin)
  const [easting, northing] = proj4(WGS84, cassiniDef, [lon, lat])
  return { easting, northing }
}

/**
 * Get the proj4 CRS definition string for a given origin (for debugging/display).
 */
export function getCassiniProj4String(origin: CassiniOrigin): string {
  return getCassiniCRS(origin)
}

/**
 * Build a custom Cassini origin from user-supplied parameters.
 */
export function makeCassiniOrigin(params: {
  lat0: number
  lon0: number
  fe: number
  fn: number
  name?: string
}): CassiniOrigin {
  return {
    id: `custom-${params.lat0}-${params.lon0}`,
    name: params.name || 'Custom Origin',
    description: `User-defined Cassini origin at (${params.lat0}°, ${params.lon0}°)`,
    lat0: params.lat0,
    lon0: params.lon0,
    fe: params.fe,
    fn: params.fn,
  }
}
