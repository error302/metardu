'use client';

// ---------------------------------------------------------------------------
// nativeProjectionView.ts — Native Kenyan CRS view support for Metardu
// ---------------------------------------------------------------------------
// Provides EPSG:21037 (Arc 1960 / UTM 37S) and related Kenyan projections so
// surveyors can view the map in Eastings/Northings instead of Web Mercator.
//
// All OpenLayers imports use dynamic import() for SSR safety.
// No `import type` used (Jest 30 + Babel constraint).
// ---------------------------------------------------------------------------

// ---- Imports from sibling projection module --------------------------------
import {
  registerProjections,
  EPSG_21037_DEF,
  SRID_21037,
} from '@/lib/map/projection';

// ---- Interfaces -----------------------------------------------------------

/** Options for creating a native projection view. */
interface NativeViewOptions {
  /** EPSG code of the target projection, e.g. 'EPSG:21037'. */
  projection: string;
  /** Center coordinates in the projection's CRS [Easting, Northing]. */
  center?: [number, number];
  /** Initial zoom level (default 14). */
  zoom?: number;
  /** Minimum allowed zoom level (default 4). */
  minZoom?: number;
  /** Maximum allowed zoom level (default 22). */
  maxZoom?: number;
  /** Optional extent constraint [west, south, east, north]. */
  extent?: [number, number, number, number];
}

/** Metadata about a registered Kenyan projection. */
interface ProjectionConfig {
  /** EPSG code, e.g. 'EPSG:21037'. */
  code: string;
  /** Human-readable projection name. */
  name: string;
  /** Geodetic datum — 'Arc 1960' or 'WGS84'. */
  datum: string;
  /** UTM zone number. */
  zone: number;
  /** Hemisphere — 'N' or 'S'. */
  hemisphere: 'N' | 'S';
  /** Valid extent [west, south, east, north] in projected metres. */
  extent: [number, number, number, number];
  /** Full proj4 definition string. */
  proj4def: string;
}

// ---- Internal registry -----------------------------------------------------

/** Flag ensuring projections are only registered once per session. */
let extendedRegistered = false;

// -- Approximate Kenya-wide extents per zone ---------------------------------
// Southern-hemisphere zones cover Kenya ~5°N to ~5°S (false northing 10 000 000).
// Northern-hemisphere zones cover Kenya ~0° to ~5°N.
const KENYA_EXTENT_S: [number, number, number, number] = [
  100_000, 9_400_000, 900_000, 10_600_000,
];
const KENYA_EXTENT_N: [number, number, number, number] = [
  100_000, 0, 900_000, 600_000,
];

// -- Arc 1960 (Clarke 1880) projections --------------------------------------
const ARC1960_DEFS: Array<{
  code: string;
  name: string;
  zone: number;
  hemisphere: 'N' | 'S';
  proj4def: string;
  extent: [number, number, number, number];
}> = [
  {
    code: 'EPSG:21037',
    name: 'Arc 1960 / UTM zone 37S',
    datum: 'Arc 1960',
    zone: 37,
    hemisphere: 'S',
    proj4def: EPSG_21037_DEF,
    extent: KENYA_EXTENT_S,
  },
  {
    code: 'EPSG:21036',
    name: 'Arc 1960 / UTM zone 36S',
    datum: 'Arc 1960',
    zone: 36,
    hemisphere: 'S',
    proj4def:
      '+proj=utm +zone=36 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs',
    extent: KENYA_EXTENT_S,
  },
  {
    code: 'EPSG:21035',
    name: 'Arc 1960 / UTM zone 35S',
    datum: 'Arc 1960',
    zone: 35,
    hemisphere: 'S',
    proj4def:
      '+proj=utm +zone=35 +south +ellps=clrk80 +towgs84=-160,-6,-302,0,0,0,0 +units=m +no_defs',
    extent: KENYA_EXTENT_S,
  },
];

// -- WGS 84 projections -----------------------------------------------------
const WGS84_DEFS: Array<{
  code: string;
  name: string;
  zone: number;
  hemisphere: 'N' | 'S';
  proj4def: string;
  extent: [number, number, number, number];
}> = [
  {
    code: 'EPSG:32737',
    name: 'WGS 84 / UTM zone 37S',
    datum: 'WGS84',
    zone: 37,
    hemisphere: 'S',
    proj4def: '+proj=utm +zone=37 +south +datum=WGS84 +units=m +no_defs',
    extent: KENYA_EXTENT_S,
  },
  {
    code: 'EPSG:32736',
    name: 'WGS 84 / UTM zone 36S',
    datum: 'WGS84',
    zone: 36,
    hemisphere: 'S',
    proj4def: '+proj=utm +zone=36 +south +datum=WGS84 +units=m +no_defs',
    extent: KENYA_EXTENT_S,
  },
  {
    code: 'EPSG:32735',
    name: 'WGS 84 / UTM zone 35S',
    datum: 'WGS84',
    zone: 35,
    hemisphere: 'S',
    proj4def: '+proj=utm +zone=35 +south +datum=WGS84 +units=m +no_defs',
    extent: KENYA_EXTENT_S,
  },
  {
    code: 'EPSG:32637',
    name: 'WGS 84 / UTM zone 37N',
    datum: 'WGS84',
    zone: 37,
    hemisphere: 'N',
    proj4def: '+proj=utm +zone=37 +north +datum=WGS84 +units=m +no_defs',
    extent: KENYA_EXTENT_N,
  },
  {
    code: 'EPSG:32636',
    name: 'WGS 84 / UTM zone 36N',
    datum: 'WGS84',
    zone: 36,
    hemisphere: 'N',
    proj4def: '+proj=utm +zone=36 +north +datum=WGS84 +units=m +no_defs',
    extent: KENYA_EXTENT_N,
  },
];

/** Combined lookup of all Kenyan projection definitions. */
const ALL_DEFS = [...ARC1960_DEFS, ...WGS84_DEFS];

// ---- Exported functions ----------------------------------------------------

/**
 * Registers all Kenyan UTM projections with OpenLayers via proj4.
 *
 * Calls {@link registerProjections} first (which registers EPSG:21037),
 * then adds the remaining seven Kenyan CRS definitions.  Each projection
 * is registered with its proj4 string, a Kenya-wide extent, and
 * `metersPerUnit: 1`.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @returns {Promise<void>} Resolves when all projections are ready.
 */
export async function registerExtendedProjections(): Promise<void> {
  if (extendedRegistered || typeof window === 'undefined') return;

  // Ensure the base EPSG:21037 registration from projection.ts is done first.
  await registerProjections();

  const [proj4Module, { register }, { get: getProjection }] = await Promise.all(
    [import('proj4'), import('ol/proj/proj4'), import('ol/proj')],
  );

  const proj4 = proj4Module.default;

  for (const def of ALL_DEFS) {
    // Skip EPSG:21037 — already registered by projection.ts.
    if (def.code === SRID_21037) continue;

    proj4.defs(def.code, def.proj4def);
  }

  // Re-register so OL picks up the newly added defs.
  register(proj4);

  // Apply extents and metersPerUnit to each registered projection.
  for (const def of ALL_DEFS) {
    const proj = getProjection(def.code);
    if (proj) {
      proj.setExtent(def.extent);
      proj.setMetersPerUnit(1);
    }
  }

  extendedRegistered = true;
}

/**
 * Creates an OpenLayers View in a given Kenyan CRS.
 *
 * @param {NativeViewOptions} options - View configuration.
 * @returns {Promise<import('ol/View').default>} The configured OL View.
 *
 * @example
 *   const view = await createNativeView({
 *     projection: 'EPSG:21037',
 *     center: [500000, 9840000],
 *     zoom: 16,
 *   });
 */
export async function createNativeView(
  options: NativeViewOptions,
): Promise<import('ol/View').default> {
  await registerExtendedProjections();

  const { default: View } = await import('ol/View');

  const config = getProjectionConfig(options.projection);
  const extent = options.extent ?? config?.extent;

  return new View({
    projection: options.projection,
    center: options.center ?? (config?.extent
      ? [
          (config.extent[0] + config.extent[2]) / 2,
          (config.extent[1] + config.extent[3]) / 2,
        ]
      : [500000, 9840000]),
    zoom: options.zoom ?? 14,
    minZoom: options.minZoom ?? 4,
    maxZoom: options.maxZoom ?? 22,
    ...(extent ? { extent } : {}),
  });
}

/**
 * Convenience function: creates a View in EPSG:21037 (Arc 1960 / UTM 37S).
 *
 * Defaults to a center near the Nairobi cadastral area at zoom 14.
 *
 * @param {number[]}  [center] - Optional [Easting, Northing] center.
 *   Defaults to [500000, 9840000].
 * @param {number}    [zoom]   - Optional zoom level. Defaults to 14.
 * @returns {Promise<import('ol/View').default>} The configured OL View.
 *
 * @example
 *   const view = await createArc1960View();
 *   const view2 = await createArc1960View([512345, 9834567], 16);
 */
export async function createArc1960View(
  center?: [number, number],
  zoom?: number,
): Promise<import('ol/View').default> {
  return createNativeView({
    projection: SRID_21037,
    center: center ?? [500_000, 9_840_000],
    zoom: zoom ?? 14,
  });
}

/**
 * Returns metadata about a registered Kenyan projection.
 *
 * @param {string} code - EPSG code, e.g. 'EPSG:21037'.
 * @returns {ProjectionConfig | undefined} Configuration object, or
 *   `undefined` if the code is not recognised.
 *
 * @example
 *   const cfg = getProjectionConfig('EPSG:21037');
 *   // => { code: 'EPSG:21037', name: 'Arc 1960 / UTM zone 37S', ... }
 */
export function getProjectionConfig(code: string): ProjectionConfig | undefined {
  const def = ALL_DEFS.find((d) => d.code === code);
  if (!def) return undefined;

  return {
    code: def.code,
    name: def.name,
    datum: def.datum,
    zone: def.zone,
    hemisphere: def.hemisphere,
    extent: def.extent,
    proj4def: def.proj4def,
  };
}

/**
 * Switches an existing map to a different projection.
 *
 * Transforms the current view centre from the source CRS to the target CRS,
 * preserves the zoom level, and replaces the map's view.  The target
 * projection must be one of the registered Kenyan codes.
 *
 * @param {Object}   map              - An OpenLayers Map instance (must expose
 *   `getView()` and `setView()`).
 * @param {string}   targetProjection - EPSG code of the desired projection.
 * @returns {Promise<import('ol/View').default>} The newly created and applied view.
 *
 * @example
 *   await switchMapView(map, 'EPSG:32737');
 */
export async function switchMapView(
  map: { getView: () => import('ol/View').default | null; setView: (view: import('ol/View').default) => void },
  targetProjection: string,
): Promise<import('ol/View').default> {
  await registerExtendedProjections();

  const { transform } = await import('ol/proj');

  const currentView = map.getView();
  if (!currentView) {
    throw new Error('switchMapView: map has no current view');
  }

  const sourceProjection = currentView.getProjection();
  if (!sourceProjection) {
    throw new Error('switchMapView: current view has no projection');
  }

  // Ensure the target projection is recognised.
  const targetConfig = getProjectionConfig(targetProjection);
  if (!targetConfig) {
    throw new Error(
      `switchMapView: unknown projection "${targetProjection}". ` +
        `Expected one of: ${ALL_DEFS.map((d) => d.code).join(', ')}`,
    );
  }

  // Transform centre coordinates.
  const sourceCenter = currentView.getCenter();
  const targetCenter = sourceCenter
    ? (transform(sourceCenter, sourceProjection, targetProjection) as [number, number])
    : undefined;

  // Preserve zoom. Since all Kenyan UTM projections use metres per unit = 1,
  // the resolution-to-zoom mapping is practically identical.
  const zoom = currentView.getZoom() ?? 14;

  const newView = await createNativeView({
    projection: targetProjection,
    center: targetCenter,
    zoom,
    minZoom: currentView.getMinZoom() ?? 4,
    maxZoom: currentView.getMaxZoom() ?? 22,
  });

  map.setView(newView);

  return newView;
}
