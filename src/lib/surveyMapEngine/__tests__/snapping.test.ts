/**
 * Phase 3 snapping guard (plan Phase 3): the snap logic that previously
 * lived in SnappingOptions.tsx + useVertexEditing.ts + MapClient.tsx now
 * has a single implementation in `@/lib/surveyMapEngine/ol/snapping`.
 */
import VectorSource from 'ol/source/Vector';
import {
  SNAP_TYPE_LABELS,
  type SnapMode,
  type SnapType,
  createSnapInteraction,
  getSnapModeOptions,
  nearestEdgeOnRing,
  nearestPointOnSegment,
  nearestVertexOnRing,
  pointToSegmentDist,
  vertexDist,
} from '@/lib/surveyMapEngine/ol/snapping';

describe('snap config model (was: SnappingOptions.tsx)', () => {
  test('SNAP_TYPE_LABELS covers every SnapType', () => {
    expect(Object.keys(SNAP_TYPE_LABELS).sort()).toEqual(
      ['beacons', 'drawn', 'parcels']
    );
    expect(SNAP_TYPE_LABELS.drawn).toBe('Drawn features');
    expect(SNAP_TYPE_LABELS.parcels).toBe('Parcels');
    expect(SNAP_TYPE_LABELS.beacons).toBe('Beacons');
  });

  test('supported snap modes map to explicit OpenLayers options', () => {
    const modes: SnapMode[] = ['vertex', 'segment', 'vertex_segment', 'intersection'];
    const types: SnapType[] = ['drawn', 'parcels', 'beacons'];
    expect(modes.map(getSnapModeOptions)).toEqual([
      { vertex: true, edge: false, intersection: false },
      { vertex: false, edge: true, intersection: false },
      { vertex: true, edge: true, intersection: false },
      { vertex: false, edge: false, intersection: true },
    ]);
    expect(types).toHaveLength(3);
  });
});

describe('geometry helpers (was: useVertexEditing.ts, verbatim math)', () => {
  test('pointToSegmentDist: perpendicular hit inside the segment', () => {
    expect(pointToSegmentDist([2, 2], [0, 0], [10, 0])).toBeCloseTo(2, 10);
  });

  test('pointToSegmentDist: clamps before the segment start', () => {
    expect(pointToSegmentDist([-5, 3], [0, 0], [10, 0])).toBeCloseTo(
      Math.sqrt(34),
      10
    );
  });

  test('pointToSegmentDist: clamps after the segment end', () => {
    expect(pointToSegmentDist([14, 3], [0, 0], [10, 0])).toBeCloseTo(5, 10);
  });

  test('pointToSegmentDist: degenerate segment falls back to point distance', () => {
    expect(pointToSegmentDist([3, 4], [1, 1], [1, 1])).toBeCloseTo(
      Math.sqrt(13),
      10
    );
  });

  test('nearestPointOnSegment projects onto the segment', () => {
    expect(nearestPointOnSegment([2, 5], [0, 0], [10, 0])).toEqual([2, 0]);
  });

  test('nearestPointOnSegment clamps to the endpoints', () => {
    expect(nearestPointOnSegment([-3, 5], [0, 0], [10, 0])).toEqual([0, 0]);
    expect(nearestPointOnSegment([13, 5], [0, 0], [10, 0])).toEqual([10, 0]);
  });

  test('nearestPointOnSegment: degenerate segment returns the point', () => {
    expect(nearestPointOnSegment([5, 5], [1, 1], [1, 1])).toEqual([1, 1]);
  });

  test('vertexDist is euclidean', () => {
    expect(vertexDist([0, 0], [3, 4])).toBe(5);
  });
});

describe('ring search (single implementation for insert/remove/hover)', () => {
  // Open ring + closing duplicate, as OL Polygon rings are built by the hook.
  const square: number[][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];

  test('nearestVertexOnRing excludes the closing duplicate', () => {
    // Query at the closing coordinate: the open-ring duplicate (index 0)
    // must win; index 4 is never considered.
    const hit = nearestVertexOnRing(square, [0, 0]);
    expect(hit).toEqual({ index: 0, distance: 0 });
  });

  test('nearestVertexOnRing finds the closest open vertex', () => {
    const hit = nearestVertexOnRing(square, [9, 1]);
    expect(hit?.index).toBe(1);
    expect(hit?.distance).toBeCloseTo(Math.sqrt(2), 10);
  });

  test('nearestVertexOnRing returns null when there is no open vertex', () => {
    expect(nearestVertexOnRing([[0, 0]], [1, 1])).toBeNull();
    expect(nearestVertexOnRing([], [1, 1])).toBeNull();
  });

  test('nearestEdgeOnRing returns the insertion index (segment end vertex)', () => {
    // Query above the top edge (segment 0 -> 1): insertion index 1.
    const top = nearestEdgeOnRing(square, [5, 1]);
    expect(top).toEqual({ index: 1, distance: 1 });

    // Query inside near the bottom edge (segment 2 -> 10,10... see ring):
    // segment [10,10] -> [0,10] is index i=2, insertion index 3.
    const bottom = nearestEdgeOnRing(square, [5, 9]);
    expect(bottom?.index).toBe(3);
    expect(bottom?.distance).toBe(1);
  });

  test('nearestEdgeOnRing returns null when the ring has no edges', () => {
    expect(nearestEdgeOnRing([[0, 0]], [1, 1])).toBeNull();
    expect(nearestEdgeOnRing([], [1, 1])).toBeNull();
  });
});

describe('createSnapInteraction (shared by useVertexEditing + MapClient scheme)', () => {
  test('builds an OL Snap with an explicit pixel tolerance', async () => {
    const snap = await createSnapInteraction(new VectorSource(), 12);
    expect(snap).toBeTruthy();
    expect(typeof (snap as unknown as { setMap?: unknown }).setMap).toBe(
      'function'
    );
  });

  test('builds an OL Snap with the OL default tolerance', async () => {
    const snap = await createSnapInteraction(new VectorSource());
    expect(snap).toBeTruthy();
  });
});
