/**
 * Cassini ↔ UTM — Constants
 *
 * proj4 CRS definitions and ellipsoid constants for the Kenyan Cassini-Soldner
 * ↔ UTM coordinate conversion subsystem.
 *
 * ALL Cassini inputs/outputs are in FEET on Clarke 1858.
 * ALL UTM inputs/outputs are in METRES on Clarke 1880 / Arc 1960.
 */

import proj4 from 'proj4'

// ─── proj4 Definitions ──────────────────────────────────────────────────────

/** WGS84 geographic CRS (lat/lon in degrees) */
export const WGS84_DEF = '+proj=longlat +datum=WGS84 +no_defs'

/** UTM Zone 37 South — Arc 1960 datum (Clarke 1880 ellipsoid, EPSG:1122 3-param shift to WGS84) */
export const ARC1960_UTM37S_DEF = '+proj=utm +zone=37 +south +a=6378249.145 +b=6356514.87 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs'

/** UTM Zone 36 South — Arc 1960 datum (for sheets near zone boundary) */
export const ARC1960_UTM36S_DEF = '+proj=utm +zone=36 +south +a=6378249.145 +b=6356514.87 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs'

/**
 * Kenyan UTM zone — the projection zone of the Kenyan Cassini-Soldner
 * network that this whole module converts into.
 *
 * This is a NAMED JURISDICTION CONSTANT, not a silent default: the Cassini
 * subsystem is explicitly the Kenyan sheet network, whose western 105/3
 * sheet group is the only exception (zone 36 — see `getUtmZone()` in
 * `sheets.ts`, which callers use to pass the right zone explicitly).
 *
 * Naming the constant keeps the jurisdiction visible in the code and is
 * what `metardu/no-hardcoded-crs-default` requires: a bare `?? 37` is a
 * silent default, a named constant is configuration.
 */
export const KENYA_UTM_ZONE = 37

/**
 * Central meridian of the Kenyan Cassini-Soldner network, in degrees east.
 * Named for the same reason as {@link KENYA_UTM_ZONE}.
 */
export const KENYA_CASSINI_CENTRAL_MERIDIAN_DEG = 37

export { proj4 }

// ─── Ellipsoid Constants ──────────────────────────────────────────────────

export const CLARKE_1858_A_FT = 20_926_348
export const CLARKE_1858_B_FT = 20_855_232.84
export const CLARKE_1858_F = 0.003398355
export const CLARKE_1880_A_M = 6_378_249.145
export const CLARKE_1880_B_M = 6_356_514.87
export const CLARKE_1880_F = (CLARKE_1880_A_M - CLARKE_1880_B_M) / CLARKE_1880_A_M
export const FT_TO_M = 0.3048
export const DEG_TO_RAD = Math.PI / 180
export const RAD_TO_DEG = 180 / Math.PI
export const CLARKE_1858_A_M = CLARKE_1858_A_FT * FT_TO_M
export const CLARKE_1858_B_M = CLARKE_1858_B_FT * FT_TO_M
