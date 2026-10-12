'use client';
/**
 * Projection Registration — EPSG:21037 (Arc 1960 / UTM 37S) + Zone 36S
 *
 * Registers Kenyan cadastral projections via proj4:
 *  - EPSG:21037 — Arc 1960 / UTM Zone 37S (Nairobi, Mombasa, eastern Kenya)
 *  - EPSG:21036 — Arc 1960 / UTM Zone 36S (Kisumu, Eldoret, western Kenya)
 *  - EPSG:32736 — WGS84 / UTM Zone 36S (geodetic, Zone 36)
 *  - EPSG:32737 — WGS84 / UTM Zone 37S (geodetic, Zone 37, already common)
 *
 * Also provides autoDetectUtmZone() for automatic zone selection based on longitude.
 */
import { logger } from '@/lib/logger'

// Constants live in the zero-dependency projectionConstants.ts so light
// importers (layout.tsx, landing page) never pull this module (and thereby
// proj4/OpenLayers) into their bundle graph. Re-exported here for the
// map-heavy consumers that already import this file.
import {
  EPSG_21037_DEF, EPSG_21036_DEF, EPSG_32736_DEF, EPSG_32737_DEF,
  SRID_21037, SRID_21036, SRID_32736, SRID_32737, SRID_3857, SRID_4326,
  autoDetectUtmZone, type UtmZoneResult,
} from './projectionConstants';

export {
  EPSG_21037_DEF, EPSG_21036_DEF, EPSG_32736_DEF, EPSG_32737_DEF,
  SRID_21037, SRID_21036, SRID_32736, SRID_32737, SRID_3857, SRID_4326,
  autoDetectUtmZone,
};
export type { UtmZoneResult };

let registered = false;
let _registrationFailed = false;

export function isProjectionRegistered(): boolean {
  return registered;
}

/**
 * Register all Kenyan cadastral projections with proj4 and OpenLayers.
 * Safe to call multiple times — will only register once.
 */
export async function registerProjections(): Promise<void> {
  if (registered || typeof window === 'undefined') return;

  try {
    const [proj4Module, { register }] = await Promise.all([
      import('proj4'),
      import('ol/proj/proj4'),
    ]);

    const proj4 = proj4Module.default;

    // Arc 1960 / UTM Zone 37S (primary — Nairobi, Mombasa, eastern Kenya)
    proj4.defs(SRID_21037, EPSG_21037_DEF);

    // Arc 1960 / UTM Zone 36S (western Kenya — Kisumu, Eldoret, Kakamega, Nakuru west)
    proj4.defs(SRID_21036, EPSG_21036_DEF);

    // WGS84 / UTM Zone 36S (geodetic / GNSS workflows)
    proj4.defs(SRID_32736, EPSG_32736_DEF);

    // WGS84 / UTM Zone 37S (geodetic / GNSS workflows)
    proj4.defs(SRID_32737, EPSG_32737_DEF);

    register(proj4);

    registered = true;
  } catch (err) {
    _registrationFailed = true;
    logger.error('[projection] Projection registration failed:', { error: err });
  }
}

/**
 * Register the declared project CRS for map display. The CRS authority decides
 * which definitions are valid; OpenLayers receives that same proj4 registry.
 */
export async function registerProjectProjection(code: string): Promise<void> {
  await registerProjections()
  const [{ resolveEpsg }, proj4Module, olProj4] = await Promise.all([
    import('@/lib/spatial/projectCrs'),
    import('proj4'),
    import('ol/proj/proj4'),
  ])
  const info = resolveEpsg(code)
  if (!info.projected || info.displayOnly || info.units !== 'metres') {
    throw new Error(`Project CRS ${code} cannot be used for survey coordinates`)
  }
  olProj4.register(proj4Module.default)
}

// ─── UTM Zone Auto-Detection ──────────────────────────────────────────────
// autoDetectUtmZone() and UtmZoneResult are re-exported from
// projectionConstants.ts above (pure math — no dependencies there).

// ─── Coordinate Transform Helpers ─────────────────────────────────────────

/**
 * Project CRS → Web Mercator. `fromSrid` is REQUIRED: a silent default
 * would reinterpret coordinates from a fixed zone (plan F4 — never guess a CRS).
 */
export async function to3857(easting: number, northing: number, fromSrid: string): Promise<[number, number]> {
  const { transform } = await import('ol/proj');
  return transform([easting, northing], fromSrid, SRID_3857) as [number, number];
}

/** Batch variant of {@link to3857}. `fromSrid` is REQUIRED (plan F4). */
export async function arrayTo3857(
  coords: Array<[number, number]>,
  fromSrid: string
): Promise<Array<[number, number]>> {
  const { transform } = await import('ol/proj');
  return coords.map(([e, n]) => transform([e, n], fromSrid, SRID_3857) as [number, number]);
}

/**
 * Web Mercator → explicit target CRS (e.g. converting a click into the
 * project's grid coordinates). Replaces the old hard-coded `to21037`.
 */
export async function toProjectCrs(x: number, y: number, targetSrid: string): Promise<[number, number]> {
  const { transform } = await import('ol/proj');
  return transform([x, y], SRID_3857, targetSrid) as [number, number];
}

/**
 * Transform from EPSG:4326 (WGS84 lat/lon) to the auto-detected Arc 1960 UTM zone.
 */
export async function toArc1960(lon: number, lat: number): Promise<{ easting: number; northing: number; srid: string }> {
  const zoneResult = autoDetectUtmZone(lon, lat)
  const { transform } = await import('ol/proj')
  const [easting, northing] = transform([lon, lat], SRID_4326, zoneResult.arc1960) as [number, number]
  return { easting, northing, srid: zoneResult.arc1960 }
}
