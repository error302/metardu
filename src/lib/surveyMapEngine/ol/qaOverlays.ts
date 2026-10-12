/**
 * QA overlays (plan Phase 4 / §3.1 `ol/qaOverlays.ts`).
 *
 * Adopted into the survey map engine in Phase 4; the legacy module at
 * `@/lib/map/gridOverlay` is now a pure re-export shim.
 *
 * Contents:
 *  1. METARDU Kenya Grid Overlay — survey grid overlay on the map:
 *     - Grid lines computed in the project CRS (e.g. EPSG:21037)
 *     - Rendered in EPSG:3857 for display
 *     - Tick marks at viewport edges
 *     - E/N coordinate labels at intersections
 *     - Auto-scaling intervals based on zoom level
 *  2. Instant closure feedback computation — the pure traverse-misclosure
 *     evaluation that backs the Closure Check overlay (the React overlay
 *     itself stays on the /map surface and delegates here).
 *
 * All OL imports are dynamic to match existing project patterns.
 */

import { to3857 } from '../core/projection';
import type VectorSource from 'ol/source/Vector';
import { distanceBearing } from '@/lib/engine/distance';
import { evaluateTraverseClosure } from '@/lib/engine/traverse';
import type { Point2D } from '@/lib/engine/types';

/** Grid interval in meters */
export type GridInterval = 100 | 500 | 1000 | 5000 | 'auto';

/** Layer group ID for identification */
export const GRID_LAYER_ID = 'kenya-grid-overlay';

/**
 * Determine the appropriate grid interval based on the map zoom level.
 */
function getAutoInterval(zoom: number): 100 | 500 | 1000 | 5000 {
  if (zoom >= 18) return 100;
  if (zoom >= 15) return 500;
  if (zoom >= 12) return 1000;
  return 5000;
}

/**
 * Snap a value to the nearest grid interval.
 */
function snapToGrid(value: number, interval: number): number {
  return Math.floor(value / interval) * interval;
}

/**
 * Format a coordinate value for display.
 * Removes trailing zeros but keeps at least one decimal.
 */
function formatCoord(value: number, interval: number): string {
  if (interval >= 1000) {
    return value.toFixed(0);
  }
  if (interval >= 500) {
    return value.toFixed(0);
  }
  return value.toFixed(1);
}

/**
 * Create the Kenya grid overlay vector layer.
 * The layer is initially empty — call `updateGridOverlay()` on map `moveend` to refresh.
 */
export async function createGridOverlayLayer(): Promise<import('ol/layer/Vector').default> {
  const [
    { default: VectorLayer },
    { default: VectorSource },
  ] = await Promise.all([
    import('ol/layer/Vector'),
    import('ol/source/Vector'),
  ]);

  const source = new VectorSource();
  const layer = new VectorLayer({
    source,
    zIndex: 8,
    visible: false,
  });
  layer.set('layerId', GRID_LAYER_ID);
  return layer;
}

/**
 * Update the grid overlay features based on the current map view.
 *
 * @param map - The OpenLayers map instance
 * @param interval - Grid interval in meters, or 'auto' to select by zoom
 * @param epsg - Project UTM EPSG (e.g. 'EPSG:21037') — required; never defaulted (plan F4)
 */
export async function updateGridOverlay(
  map: import('ol/Map').default,
  interval: GridInterval = 'auto',
  epsg: string,
): Promise<void> {
  const { transform } = await import('ol/proj');
  const {
    default: Feature,
  } = await import('ol/Feature');
  const {
    default: LineString,
  } = await import('ol/geom/LineString');
  const {
    default: PointGeom,
  } = await import('ol/geom/Point');
  const {
    default: Style,
  } = await import('ol/style/Style');
  const {
    default: Stroke,
  } = await import('ol/style/Stroke');
  const {
    default: Fill,
  } = await import('ol/style/Fill');
  const {
    default: Text,
  } = await import('ol/style/Text');

  // Find the grid layer
  const layers = map.getLayers().getArray();
  let gridLayer: import('ol/layer/Vector').default | null = null;
  for (const layer of layers) {
    if (layer.get('layerId') === GRID_LAYER_ID) {
      gridLayer = layer as import('ol/layer/Vector').default;
      break;
    }
  }
  if (!gridLayer) return;

  const view = map.getView();
  const extent = view.calculateExtent(map.getSize());
  const zoom = view.getZoom() ?? 16;

  const resolvedInterval: number = interval === 'auto' ? getAutoInterval(zoom) : interval;

  // Convert extent corners from EPSG:3857 to UTM
  const bottomLeft3857: [number, number] = [extent[0], extent[1]];
  const topRight3857: [number, number] = [extent[2], extent[3]];

  const bottomLeftUtm = transform(bottomLeft3857, 'EPSG:3857', epsg) as [number, number];
  const topRightUtm = transform(topRight3857, 'EPSG:3857', epsg) as [number, number];

  const minE = bottomLeftUtm[0];
  const maxE = topRightUtm[0];
  const minN = bottomLeftUtm[1];
  const maxN = topRightUtm[1];

  // Snap to grid boundaries (add one interval padding)
  const startE = snapToGrid(minE, resolvedInterval) - resolvedInterval;
  const endE = snapToGrid(maxE, resolvedInterval) + resolvedInterval;
  const startN = snapToGrid(minN, resolvedInterval) - resolvedInterval;
  const endN = snapToGrid(maxN, resolvedInterval) + resolvedInterval;

  const features: InstanceType<typeof Feature>[] = [];

  // Grid line style
  const gridLineStyle = new Style({
    stroke: new Stroke({
      color: 'rgba(100, 100, 100, 0.25)',
      width: 1,
    }),
  });

  // Sub-grid (thinner) style for intervals > 100m
  const subGridLineStyle = new Style({
    stroke: new Stroke({
      color: 'rgba(150, 150, 150, 0.12)',
      width: 0.5,
    }),
  });

  // Tick mark style (short perpendicular lines at edges)
  const tickMarkStyle = new Style({
    stroke: new Stroke({
      color: 'rgba(27, 58, 92, 0.7)',
      width: 1.5,
    }),
  });

  const tickLength = (maxE - minE) * 0.012; // ~1.2% of viewport width

  // Grid lines are computed in the project CRS, then projected to the
  // display CRS — bind the required CRS once (plan F4: no silent defaults).
  const gridTo3857 = (e: number, n: number) => to3857(e, n, epsg);

  // ─── Vertical grid lines (constant Easting) ─────────────────────────────
  for (let e = startE; e <= endE; e += resolvedInterval) {
    const top3857 = await gridTo3857(e, endN);
    const bottom3857 = await gridTo3857(e, startN);

    const lineFeature = new Feature({
      geometry: new LineString([bottom3857, top3857]),
      type: 'grid-line',
    });
    lineFeature.setStyle(gridLineStyle);
    features.push(lineFeature);

    // Add sub-grid lines at half intervals
    if (resolvedInterval >= 1000) {
      const halfInterval = resolvedInterval / 2;
      const subE = e + halfInterval;
      if (subE <= endE) {
        const subTop3857 = await gridTo3857(subE, endN);
        const subBottom3857 = await gridTo3857(subE, startN);
        const subFeature = new Feature({
          geometry: new LineString([subBottom3857, subTop3857]),
          type: 'sub-grid-line',
        });
        subFeature.setStyle(subGridLineStyle);
        features.push(subFeature);
      }
    }

    // ─── Tick marks at bottom edge ──────────────────────────────────────
    const tickBottomStart = await gridTo3857(e - tickLength, minN);
    const tickBottomEnd = await gridTo3857(e + tickLength, minN);
    const tickBottom = new Feature({
      geometry: new LineString([tickBottomStart, tickBottomEnd]),
      type: 'tick-mark',
    });
    tickBottom.setStyle(tickMarkStyle);
    features.push(tickBottom);

    // Easting label at bottom edge
    const labelBottomCoord = await gridTo3857(e, minN);
    const labelBottom = new Feature({
      geometry: new PointGeom(labelBottomCoord),
      type: 'easting-label',
    });
    labelBottom.setStyle(new Style({
      text: new Text({
        text: `E ${formatCoord(e, resolvedInterval)}`,
        font: '10px Calibri, sans-serif',
        fill: new Fill({ color: '#1B3A5C' }),
        stroke: new Stroke({ color: '#FFFFFF', width: 3 }),
        offsetY: 14,
        textAlign: 'center',
      }),
    }));
    features.push(labelBottom);
  }

  // ─── Horizontal grid lines (constant Northing) ──────────────────────────
  for (let n = startN; n <= endN; n += resolvedInterval) {
    const left3857 = await gridTo3857(startE, n);
    const right3857 = await gridTo3857(endE, n);

    const lineFeature = new Feature({
      geometry: new LineString([left3857, right3857]),
      type: 'grid-line',
    });
    lineFeature.setStyle(gridLineStyle);
    features.push(lineFeature);

    // Add sub-grid lines at half intervals
    if (resolvedInterval >= 1000) {
      const halfInterval = resolvedInterval / 2;
      const subN = n + halfInterval;
      if (subN <= endN) {
        const subLeft3857 = await gridTo3857(startE, subN);
        const subRight3857 = await gridTo3857(endE, subN);
        const subFeature = new Feature({
          geometry: new LineString([subLeft3857, subRight3857]),
          type: 'sub-grid-line',
        });
        subFeature.setStyle(subGridLineStyle);
        features.push(subFeature);
      }
    }

    // ─── Tick marks at left edge ────────────────────────────────────────
    const tickLeftStart = await gridTo3857(minE, n - tickLength);
    const tickLeftEnd = await gridTo3857(minE, n + tickLength);
    const tickLeft = new Feature({
      geometry: new LineString([tickLeftStart, tickLeftEnd]),
      type: 'tick-mark',
    });
    tickLeft.setStyle(tickMarkStyle);
    features.push(tickLeft);

    // Northing label at left edge
    const labelLeftCoord = await gridTo3857(minE, n);
    const labelLeft = new Feature({
      geometry: new PointGeom(labelLeftCoord),
      type: 'northing-label',
    });
    labelLeft.setStyle(new Style({
      text: new Text({
        text: `N ${formatCoord(n, resolvedInterval)}`,
        font: '10px Calibri, sans-serif',
        fill: new Fill({ color: '#1B3A5C' }),
        stroke: new Stroke({ color: '#FFFFFF', width: 3 }),
        offsetX: -10,
        textAlign: 'right',
      }),
    }));
    features.push(labelLeft);
  }

  // ─── Update the source ──────────────────────────────────────────────────
  const source = gridLayer.getSource() as InstanceType<typeof VectorSource>;
  source.clear();
  source.addFeatures(features);
}

// ─── Instant traverse-closure feedback ──────────────────────────────────

/**
 * Accuracy grade for a live closure check, derived from the precision ratio
 * (perimeter / linear misclosure). Cadastral work in Kenya Survey
 * Regulations 1994 requires 1:5000, so "Excellent" starts at 2× that.
 */
export type ClosureGrade = 'Excellent' | 'Good' | 'Acceptable' | 'Poor' | 'Fail';

export function closureGrade(precisionRatio: number): ClosureGrade {
  if (precisionRatio >= 10000) return 'Excellent';
  if (precisionRatio >= 5000) return 'Good';
  if (precisionRatio >= 3000) return 'Acceptable';
  if (precisionRatio >= 1000) return 'Poor';
  return 'Fail';
}

/**
 * Result of a live traverse-closure evaluation against the cadastral
 * standard, as displayed by the Closure Check overlay.
 */
export interface TraverseClosureFeedback {
  sumDeltaE: number;
  sumDeltaN: number;
  linearMisclosure: number;
  perimeter: number;
  precisionRatio: number;
  passes: boolean;
  minimum: number;
  grade: ClosureGrade;
}

/**
 * Evaluate a polygon's traverse misclosure from its vertices (project CRS,
 * easting/northing order). Returns `null` when fewer than 3 vertices are
 * present — there is no polygon to close yet.
 *
 * This is the single implementation of the Closure Check overlay's math
 * (extracted from `app/map/components/InstantClosureFeedback.tsx` in
 * Phase 4); the React overlay only renders this result. Computations run in
 * the project CRS grid plane via `distanceBearing` (metres), never on
 * EPSG:3857 display coordinates.
 */
export function evaluateInstantClosure(
  vertices: ReadonlyArray<{ easting: number; northing: number }>
): TraverseClosureFeedback | null {
  if (!vertices || vertices.length < 3) return null;

  const n = vertices.length;
  let sumDeltaE = 0;
  let sumDeltaN = 0;
  let perimeter = 0;

  for (let i = 0; i < n; i++) {
    const from: Point2D = {
      easting: vertices[i].easting,
      northing: vertices[i].northing,
    };
    const to: Point2D = {
      easting: vertices[(i + 1) % n].easting,
      northing: vertices[(i + 1) % n].northing,
    };

    const leg = distanceBearing(from, to);
    sumDeltaE += leg.deltaE;
    sumDeltaN += leg.deltaN;
    perimeter += leg.distance;
  }

  const linearMisclosure = Math.sqrt(sumDeltaE ** 2 + sumDeltaN ** 2);
  const precisionRatio = linearMisclosure === 0 ? Infinity : perimeter / linearMisclosure;
  const evaluation = evaluateTraverseClosure(linearMisclosure, perimeter, 'cadastral');

  return {
    sumDeltaE,
    sumDeltaN,
    linearMisclosure,
    perimeter,
    precisionRatio,
    passes: evaluation.passes,
    minimum: evaluation.minimum,
    grade: closureGrade(precisionRatio),
  };
}
