/**
 * SurveyMapEngine snapping (plan §3.1 / Phase 3).
 *
 * Single home for the snap logic that previously lived in three places:
 *   - `SnappingOptions.tsx`  — config model (mode/type unions + labels)
 *   - `useVertexEditing.ts`  — ring geometry helpers + OL Snap creation
 *   - `MapClient.tsx`        — per-source Snap interactions for scheme
 *                              parcels/beacons
 *
 * Zero React. OL is only imported dynamically at runtime (type-only at
 * compile time) so bundle code-splitting behaviour is unchanged: every
 * consumer keeps lazy-loading `ol/interaction/Snap` exactly as before.
 *
 * Coordinate space: all geometry helpers operate on map-projection
 * coordinates (EPSG:3857 on the client) — they are pixel/metric proximity
 * tests for interaction thresholds, never survey math (plan §3.3).
 */
import type SnapInteraction from 'ol/interaction/Snap';
import type VectorSource from 'ol/source/Vector';
import type Collection from 'ol/Collection';
import type Feature from 'ol/Feature';

/* ------------------------------------------------------------------ */
/*  Config model (was: SnappingOptions.tsx)                            */
/* ------------------------------------------------------------------ */

export type SnapMode = 'vertex' | 'segment' | 'vertex_segment' | 'intersection';

/** Real vector sources exposed by the map. Raster basemaps and the display grid
 * are intentionally excluded because they are not editable snap geometries. */
export type SnapType = 'drawn' | 'parcels' | 'beacons';

export const SNAP_TYPE_LABELS: Record<SnapType, string> = {
  drawn: 'Drawn features',
  parcels: 'Parcels',
  beacons: 'Beacons',
};

export interface SnapModeOptions {
  vertex: boolean;
  edge: boolean;
  intersection: boolean;
}

/** Convert the user-facing mode to OpenLayers Snap options. */
export function getSnapModeOptions(mode: SnapMode): SnapModeOptions {
  switch (mode) {
    case 'vertex': return { vertex: true, edge: false, intersection: false };
    case 'segment': return { vertex: false, edge: true, intersection: false };
    case 'intersection': return { vertex: false, edge: false, intersection: true };
    case 'vertex_segment': return { vertex: true, edge: true, intersection: false };
  }
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers (was: useVertexEditing.ts)                        */
/* ------------------------------------------------------------------ */

export function pointToSegmentDist(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0)
    return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2);
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)
  );
  return Math.sqrt((p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2);
}

export function nearestPointOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [a[0], a[1]];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)
  );
  return [a[0] + t * dx, a[1] + t * dy];
}

export function vertexDist(
  p: [number, number],
  v: [number, number]
): number {
  return Math.sqrt((p[0] - v[0]) ** 2 + (p[1] - v[1]) ** 2);
}

/* ------------------------------------------------------------------ */
/*  Ring search (was: inline loops in useVertexEditing handlers)       */
/* ------------------------------------------------------------------ */

export interface RingHit {
  /** Vertex index on the OPEN ring (closing duplicate excluded). For edge
   *  hits this is the insertion position (the segment's end vertex). */
  index: number;
  /** Distance from the query coordinate to the hit (ring units). */
  distance: number;
}

/**
 * Nearest vertex on a polygon ring, excluding the closing duplicate
 * (last === first). Null when the ring has no open vertices.
 */
export function nearestVertexOnRing(
  ring: number[][],
  coord: [number, number]
): RingHit | null {
  let minDist = Infinity;
  let bestIdx = -1;
  for (let i = 0; i < ring.length - 1; i++) {
    const d = vertexDist(coord, ring[i] as [number, number]);
    if (d < minDist) {
      minDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  return { index: bestIdx, distance: minDist };
}

/**
 * Nearest edge on a polygon ring (segments i -> i+1, closing segment
 * excluded). Returns the insertion index (i + 1) used to splice a new
 * vertex into the ring; null when the ring has no edges.
 */
export function nearestEdgeOnRing(
  ring: number[][],
  coord: [number, number]
): RingHit | null {
  let minDist = Infinity;
  let bestIdx = -1;
  for (let i = 0; i < ring.length - 1; i++) {
    const d = pointToSegmentDist(
      coord,
      ring[i] as [number, number],
      ring[i + 1] as [number, number]
    );
    if (d < minDist) {
      minDist = d;
      bestIdx = i + 1;
    }
  }
  if (bestIdx < 0) return null;
  return { index: bestIdx, distance: minDist };
}

/* ------------------------------------------------------------------ */
/*  OL Snap creation (shared by useVertexEditing + MapClient scheme)   */
/* ------------------------------------------------------------------ */

/**
 * Lazily construct an OL Snap interaction over one vector source.
 * The dynamic import keeps `ol/interaction/Snap` out of eager bundles
 * (same loading behaviour as the previous inline `await import()` sites).
 *
 * @param source Vector source to snap against (map projection).
 * @param pixelTolerance Snap tolerance in pixels; omitted = OL default.
 */
export async function createSnapInteraction(
  source: VectorSource | Collection<Feature>,
  pixelTolerance?: number,
  mode: SnapMode = 'vertex_segment'
): Promise<SnapInteraction> {
  const { default: Snap } = await import('ol/interaction/Snap');
  const modeOptions = getSnapModeOptions(mode);
  const sourceOption = 'getFeatures' in source ? { source } : { features: source };
  return new Snap(
    pixelTolerance === undefined
      ? { ...sourceOption, ...modeOptions }
      : { ...sourceOption, pixelTolerance, ...modeOptions }
  );
}
