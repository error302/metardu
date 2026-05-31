'use client';

import { to3857 } from '@/lib/map/projection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents a single traverse leg in a cadastral survey.
 * All coordinates are in EPSG:21037 (Arc 1960 / UTM zone 37S).
 */
interface TraverseLeg {
  /** Starting station name, e.g. "A" */
  fromStation: string;
  /** Ending station name, e.g. "B" */
  toStation: string;
  /** Easting of the starting station (EPSG:21037) */
  fromE: number;
  /** Northing of the starting station (EPSG:21037) */
  fromN: number;
  /** Easting of the ending station (EPSG:21037) */
  toE: number;
  /** Northing of the ending station (EPSG:21037) */
  toN: number;
  /** Mean horizontal distance in metres (computed from coords when omitted) */
  meanDistance?: number;
  /** Mean observed angle in decimal degrees */
  meanAngle?: number;
  /** Angular misclosure in seconds of arc (closing legs only) */
  misclosure?: number;
}

/**
 * Configuration options for the traverse overlay layer.
 */
interface TraverseLayerOptions {
  /** Show distance labels at leg midpoints (default `true`) */
  showDistances?: boolean;
  /** Misclosure in seconds for orange "warning" colour (default `15`) */
  misclosureWarningThreshold?: number;
  /** Misclosure in seconds for red "error" colour (default `30`) */
  misclosureErrorThreshold?: number;
  /** Radius of the direction-arrow triangle in px (default `8`) */
  arrowSize?: number;
  /** Map z-index for the layer (default `15`) */
  zIndex?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Normal leg colour — blue */
const COLOR_NORMAL = '#0066CC';
/** Warning leg colour — orange (misclosure above warning threshold) */
const COLOR_WARNING = '#FF8C00';
/** Error leg colour — red (misclosure above error threshold) */
const COLOR_ERROR = '#CC0000';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the display colour for a leg based on its misclosure value.
 *
 * - `undefined` / `null` misclosure  → {@link COLOR_NORMAL}
 * - `> errorThreshold`               → {@link COLOR_ERROR}
 * - `> warningThreshold`             → {@link COLOR_WARNING}
 * - otherwise                        → {@link COLOR_NORMAL}
 */
function legColor(
  misclosure: number | undefined,
  warnThreshold: number,
  errorThreshold: number,
): string {
  if (misclosure === undefined || misclosure === null) return COLOR_NORMAL;
  if (misclosure > errorThreshold) return COLOR_ERROR;
  if (misclosure > warnThreshold) return COLOR_WARNING;
  return COLOR_NORMAL;
}

/**
 * Compute the grid bearing from (fromE, fromN) → (toE, toN) in **radians**.
 *
 * The result uses the surveying convention:
 * - `0` = north
 * - `π / 2` = east
 * - `π` = south
 * - `-π / 2` = west
 *
 * This is compatible with `ol/style/RegularShape` `rotation` (clockwise
 * from the positive-Y / north axis).
 */
function calcBearing(
  fromE: number,
  fromN: number,
  toE: number,
  toN: number,
): number {
  const dE = toE - fromE;
  const dN = toN - fromN;
  return Math.atan2(dE, dN);
}

/**
 * Planar (Euclidean) distance between two EPSG:21037 points, in metres.
 *
 * This is sufficiently accurate for the short legs typical of cadastral
 * traverses under a UTM projection.
 */
function planarDistance(
  fromE: number,
  fromN: number,
  toE: number,
  toN: number,
): number {
  const dE = toE - fromE;
  const dN = toN - fromN;
  return Math.sqrt(dE * dE + dN * dN);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a traverse overlay layer that renders cadastral traverse legs with
 * direction arrows, station labels, and optional distance annotations.
 *
 * **Visual elements per leg:**
 * - Dashed line colour-coded by misclosure (blue → orange → red)
 * - Red/orange glow for legs exceeding the warning/error threshold
 * - Small triangular arrow at the midpoint indicating direction of travel
 * - Optional distance label above the arrow
 *
 * **Station labels** are placed once per unique station name (white halo,
 * dark text, offset above the point).
 *
 * All coordinates are converted from EPSG:21037 → EPSG:3857 before rendering.
 *
 * @param legs   - Array of traverse leg definitions
 * @param options - Optional configuration (thresholds, arrow size, z-index …)
 * @returns A `VectorLayer` ready to add to an OpenLayers map
 */
export async function createTraverseLayer(
  legs: TraverseLeg[],
  options?: TraverseLayerOptions,
): Promise<import('ol/layer/Vector').default> {
  const {
    showDistances = true,
    misclosureWarningThreshold = 15,
    misclosureErrorThreshold = 30,
    arrowSize = 8,
    zIndex = 15,
  } = options ?? {};

  // ── Dynamic OpenLayers imports (SSR-safe) ─────────────────────────────────
  const [
    { default: VectorLayer },
    { default: VectorSource },
    { default: Feature },
    { default: LineString },
    { default: PointGeom },
    { default: Style },
    { default: Stroke },
    { default: Fill },
    { default: Text },
    { default: RegularShape },
  ] = await Promise.all([
    import('ol/layer/Vector'),
    import('ol/source/Vector'),
    import('ol/Feature'),
    import('ol/geom/LineString'),
    import('ol/geom/Point'),
    import('ol/style/Style'),
    import('ol/style/Stroke'),
    import('ol/style/Fill'),
    import('ol/style/Text'),
    import('ol/style/RegularShape'),
  ]);

  const features: InstanceType<typeof Feature>[] = [];

  // Collect unique stations: name → { e, n } (first occurrence wins so that
  // closing legs that revisit a station don't duplicate the label).
  const stations = new Map<string, { e: number; n: number }>();

  // ── One feature set per traverse leg ──────────────────────────────────────
  for (const leg of legs) {
    const color = legColor(
      leg.misclosure,
      misclosureWarningThreshold,
      misclosureErrorThreshold,
    );

    const bearing = calcBearing(leg.fromE, leg.fromN, leg.toE, leg.toN);
    const dist =
      leg.meanDistance ??
      planarDistance(leg.fromE, leg.fromN, leg.toE, leg.toN);

    // Midpoint in EPSG:21037
    const midE = (leg.fromE + leg.toE) / 2;
    const midN = (leg.fromN + leg.toN) / 2;

    // Batch the three coordinate transforms for this leg
    const [fromCoord, toCoord, midCoord] = await Promise.all([
      to3857(leg.fromE, leg.fromN),
      to3857(leg.toE, leg.toN),
      to3857(midE, midN),
    ]);

    // ── 1. Leg line (dashed) ───────────────────────────────────────────────
    const lineFeature = new Feature({
      geometry: new LineString([fromCoord, toCoord]),
      type: 'traverse-leg',
    });

    const lineStyles: InstanceType<typeof Style>[] = [];

    // Glow behind legs that exceed the warning threshold
    if (leg.misclosure !== undefined && leg.misclosure > misclosureWarningThreshold) {
      const glowAlpha =
        leg.misclosure > misclosureErrorThreshold ? 0.35 : 0.20;
      lineStyles.push(
        new Style({
          stroke: new Stroke({
            color: `rgba(204, 0, 0, ${glowAlpha})`,
            width: 12,
          }),
        }),
      );
    }

    lineStyles.push(
      new Style({
        stroke: new Stroke({
          color,
          width: 2,
          lineDash: [8, 4],
        }),
      }),
    );

    lineFeature.setStyle(lineStyles);
    features.push(lineFeature);

    // ── 2. Direction arrow at midpoint ──────────────────────────────────────
    const arrowFeature = new Feature({
      geometry: new PointGeom(midCoord),
      type: 'traverse-arrow',
    });
    arrowFeature.setStyle(
      new Style({
        image: new RegularShape({
          points: 3,
          radius: arrowSize,
          rotation: bearing,
          rotateWithView: false,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: '#FFFFFF', width: 1.5 }),
        }),
      }),
    );
    features.push(arrowFeature);

    // ── 3. Distance label at midpoint (optional) ───────────────────────────
    if (showDistances) {
      const distFeature = new Feature({
        geometry: new PointGeom(midCoord),
        type: 'traverse-distance',
      });
      distFeature.setStyle(
        new Style({
          text: new Text({
            text: `${dist.toFixed(2)} m`,
            font: '11px Calibri, sans-serif',
            fill: new Fill({ color }),
            stroke: new Stroke({ color: '#FFFFFF', width: 3 }),
            textAlign: 'center',
            textBaseline: 'bottom',
            offsetY: -(arrowSize + 4),
          }),
        }),
      );
      features.push(distFeature);
    }

    // ── Collect unique stations ─────────────────────────────────────────────
    if (!stations.has(leg.fromStation)) {
      stations.set(leg.fromStation, { e: leg.fromE, n: leg.fromN });
    }
    if (!stations.has(leg.toStation)) {
      stations.set(leg.toStation, { e: leg.toE, n: leg.toN });
    }
  }

  // ── Station labels ────────────────────────────────────────────────────────
  const stationTransforms = await Promise.all(
    Array.from(stations.entries()).map(async ([name, coord]) => {
      const pos = await to3857(coord.e, coord.n);
      return { name, pos };
    }),
  );

  for (const { name, pos } of stationTransforms) {
    const labelFeature = new Feature({
      geometry: new PointGeom(pos),
      type: 'traverse-station',
    });
    labelFeature.setStyle(
      new Style({
        text: new Text({
          text: name,
          font: 'bold 13px Calibri, sans-serif',
          fill: new Fill({ color: '#1a1a2e' }),
          stroke: new Stroke({ color: '#FFFFFF', width: 4 }),
          textAlign: 'center',
          textBaseline: 'middle',
          offsetY: -16,
        }),
      }),
    );
    features.push(labelFeature);
  }

  // ── Assemble and return the layer ─────────────────────────────────────────
  const source = new VectorSource({ features });
  return new VectorLayer({ source, zIndex });
}
