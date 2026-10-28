/**
 * @module cadastralEditing
 * @description Cadastral parcel editing interactions for the Metardu surveying platform.
 *
 * Provides the core snap → modify → draw interaction chain used by surveyors for
 * boundary digitization and parcel subdivision on OpenLayers maps.
 *
 * Public API:
 *   - {@link createEditingInteractionStack} — full editing interaction stack
 *   - {@link createSubdivisionInteraction} — parcel split-line interaction
 *   - {@link createMeasureWhileDraw}     — real-time distance / bearing annotations
 *   - {@link createHistoryManager}       — standalone undo / redo manager
 *
 * OpenLayers classes are imported as values (for `new`) and types (for annotations)
 * from `ol/*` — the library ships its own `.d.ts` files. Next.js code-splits these
 * automatically. The async function signatures are retained for backward
 * compatibility with callers that `await` the factories.
 */

// ---------------------------------------------------------------------------
// Typed imports — values (for `new`) and types (for annotations)
// ---------------------------------------------------------------------------

import Map from 'ol/Map'
import Collection from 'ol/Collection'
import Feature from 'ol/Feature'
import Polygon from 'ol/geom/Polygon'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import VectorSource from 'ol/source/Vector'
import VectorLayer from 'ol/layer/Vector'
import Snap from 'ol/interaction/Snap'
import Modify from 'ol/interaction/Modify'
import Draw from 'ol/interaction/Draw'
import Select from 'ol/interaction/Select'
import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import Text from 'ol/style/Text'
import { unByKey } from 'ol/Observable'
import { assertProjectedCrs, resolveEpsg, surveyBearing, surveyDistance, transformPoint, type Position2D } from '@/lib/spatial/projectCrs'
import { splitPolygonWithLine } from './editingTools'

import type Geometry from 'ol/geom/Geometry'
import type SimpleGeometry from 'ol/geom/SimpleGeometry'
import type { FeatureLike } from 'ol/Feature'
import type { EventsKey } from 'ol/events'
import type { ModifyEvent } from 'ol/interaction/Modify'
import type { DrawEvent } from 'ol/interaction/Draw'
import type { GeometryFunction as DrawGeometryFunction } from 'ol/interaction/Draw'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

/**
 * Minimal source contract used by {@link HistoryManager} — a structural subset
 * of `ol/source/Vector` so that mocks (without every VectorSource method) can
 * satisfy the type in tests.
 */
export interface HistorySource {
  getFeatureById(id: string | number): Feature | null;
  getFeatures(): Feature[];
  addFeature(feature: Feature): void;
  removeFeature(feature: Feature): void;
}

/** Options for {@link createEditingInteractionStack}. */
export interface EditingOptions {
  /** OL VectorSource containing features to edit. */
  source: VectorSource<Feature>;
  /** Additional OL VectorSource to snap to (e.g. existing parcel boundaries). */
  snapSource?: VectorSource<Feature>;
  /** Snap tolerance in pixels (default: 10). */
  snapTolerance?: number;
  /** Constrain new edges to right angles relative to the previous edge (default: true). */
  orthogonalConstraint?: boolean;
  /** Callback fired when a new feature is added to the source. */
  onFeatureAdded?: (feature: Feature) => void;
  /** Callback fired when an existing feature geometry is modified. */
  onFeatureModified?: (feature: Feature) => void;
  /** Callback fired when a feature is deleted (receives the feature id). */
  onFeatureDeleted?: (featureId: string) => void;
}

/** The full editing interaction stack returned by {@link createEditingInteractionStack}. */
export interface InteractionStack {
  /** OL Snap interaction. */
  snap: Snap;
  /** OL Modify interaction. */
  modify: Modify;
  /** OL Draw interaction. */
  draw: Draw;
  /** History manager for undo / redo of all editing operations. */
  history: HistoryManager;
  /** Removes all keyboard listeners and clears history. Does NOT remove interactions from the map. */
  removeAll: () => void;
}

/** Options for {@link createSubdivisionInteraction}. */
export interface SubdivisionOptions {
  /** OL VectorSource containing parcel features. */
  source: VectorSource<Feature>;
  /** The OL Feature (polygon) to subdivide. */
  targetFeature: Feature;
  /** Snap tolerance in pixels (default: 10). */
  snapTolerance?: number;
  /** Declared CRS of the source geometry coordinates. */
  sourceProjection: string;
  /** Declared projected project CRS for subdivision mathematics. */
  projectCrs: string;
  /** Callback with the two resulting polygon features after subdivision. */
  onComplete: (polygonA: Feature, polygonB: Feature) => void;
  /** Callback if subdivision fails (e.g. split line does not cross the parcel). */
  onError?: (error: Error) => void;
}

/** Options for {@link createMeasureWhileDraw}. */
export interface MeasureWhileDrawOptions {
  /** OL Map instance. */
  map: Map;
  /** The OL Draw interaction to monitor. */
  drawInteraction: Draw;
  /** Declared source geometry projection. */
  projection: string;
  /** Declared projected project CRS for grid distances and bearings. */
  projectCrs: string;
  /** Whether to show per-edge bearing labels (default: true). */
  showBearing?: boolean;
  /** Whether to show cumulative distance (default: true). */
  showCumulativeDistance?: boolean;
  /** Whether to show per-edge distance (default: true). */
  showEdgeDistance?: boolean;
  /** Invalid geometry clears annotations and reports the error. */
  onError?: (error: Error) => void;
}

/** Handle returned by {@link createMeasureWhileDraw} for cleanup. */
export interface MeasureHandle {
  /** Remove all measurement features, event listeners, and the annotation layer from the map. */
  cleanup: () => void;
  /** The temporary OL VectorLayer containing measurement annotation features. */
  layer: VectorLayer<VectorSource<Feature>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of operations retained in the undo / redo history stacks. */
const MAX_HISTORY_DEPTH = 50;

/** Feature id prefix for auto-generated ids. */
const FEAT_ID_PREFIX = 'ce_';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;

/** Generate a unique feature id. */
function generateFeatureId(): string {
  _idCounter++;
  return `${FEAT_ID_PREFIX}${Date.now()}_${_idCounter}`;
}

/** Transform display geometry only through the declared project authority. */
function declaredFrames(source: string, project: string) {
  if (typeof project !== 'string' || !project.trim()) throw new Error('Declare the projected project CRS before surveying operations.')
  const grid = assertProjectedCrs(project).code
  if (typeof source !== 'string' || !source.trim()) throw new Error('Declare the source geometry projection.')
  const sourceCrs = resolveEpsg(source).code
  const convert = (coordinate: number[], from: string, to: string): Position2D => {
    if (coordinate.length < 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) throw new Error('Geometry coordinates must be finite before survey measurement.')
    const result: Position2D = from === to ? [coordinate[0], coordinate[1]] : transformPoint(coordinate[0], coordinate[1], from, to)
    if (!result.every(Number.isFinite)) throw new Error('The declared CRS conversion did not produce finite grid coordinates.')
    return result
  }
  return { grid, toGrid: (coordinate: number[]) => convert(coordinate, sourceCrs, grid), fromGrid: (coordinate: number[]) => convert(coordinate, grid, sourceCrs) }
}

/** OL Snap accepts a source or a feature Collection, never a sources array. */
function snapForSources(sources: VectorSource<Feature>[], pixelTolerance: number) {
  const features = new Collection<Feature>([], { unique: true })
  const references = new WeakMap<Feature, number>()
  const keys: EventsKey[] = []
  const memberships: Set<Feature>[] = []
  for (const source of new Set(sources)) {
    const members = new Set<Feature>()
    memberships.push(members)
    const add = (feature: Feature) => {
      if (members.has(feature)) return
      members.add(feature)
      const count = references.get(feature) ?? 0
      references.set(feature, count + 1)
      if (count === 0) features.push(feature)
    }
    const remove = (feature: Feature) => {
      if (!members.delete(feature)) return
      const count = references.get(feature) ?? 0
      if (count <= 1) { references.delete(feature); features.remove(feature) }
      else references.set(feature, count - 1)
    }
    source.getFeatures().forEach(add)
    keys.push(source.on('addfeature', event => { if (event.feature) add(event.feature) }))
    keys.push(source.on('removefeature', event => { if (event.feature) remove(event.feature) }))
    keys.push(source.on('clear', () => { for (const feature of members) remove(feature) }))
  }
  return { snap: new Snap({ features, pixelTolerance }), cleanup: () => { unByKey(keys); memberships.forEach(members => members.clear()); features.clear() } }
}

/**
 * Midpoint of two coordinates.
 * @param c1 - First coordinate.
 * @param c2 - Second coordinate.
 */
function midpoint(c1: number[], c2: number[]): number[] {
  return [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2];
}

/**
 * Format a distance with appropriate units.
 * @param metres - Distance in metres.
 * @returns Formatted string, e.g. "12.34 m" or "1.234 km".
 */
function formatDistance(metres: number): string {
  if (metres >= 1000) {
    return `${(metres / 1000).toFixed(3)} km`;
  }
  return `${metres.toFixed(2)} m`;
}

/**
 * Format a bearing as a cardinal direction with degrees.
 * @param deg - Whole-circle bearing in degrees (0–360).
 * @returns String like "45.0\u00b0 NE".
 */
function formatBearingCardinal(deg: number): string {
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(deg / 45) % 8;
  return `${deg.toFixed(1)}\u00b0 ${cardinals[idx]}`;
}

/**
 * Types of operations that can be recorded by HistoryManager.
 */
type HistoryOpType = 'add' | 'modify' | 'delete';

/**
 * A single recorded history entry — discriminated union so TypeScript can
 * narrow `before` / `after` correctly in {@link HistoryManager.undo} / `redo`.
 */
type HistoryEntry =
  | {
      op: 'add';
      /** Always null for 'add' (nothing existed before). */
      before: null;
      /** Cloned feature to re-add on redo. */
      after: Feature;
      featureId: string | number | undefined;
    }
  | {
      op: 'modify';
      /** Geometry snapshot before the modification (for undo). */
      before: Geometry | null;
      /** Geometry snapshot after the modification (for redo). */
      after: Geometry | null;
      featureId: string | number | undefined;
    }
  | {
      op: 'delete';
      /** Cloned feature to re-add on undo. */
      before: Feature;
      /** Always null for 'delete' (nothing exists after). */
      after: null;
      featureId: string | number | undefined;
    };

/**
 * Undo / redo history manager for OL VectorSource editing operations.
 *
 * Tracks add, modify, and delete operations up to {@link MAX_HISTORY_DEPTH}
 * entries. Call {@link undo} or {@link redo} to revert or replay operations.
 *
 * @example
 * ```ts
 * const history = new HistoryManager(vectorSource);
 *
 * // Record operations as they happen:
 * history.record('add', newFeature);
 * history.record('modify', changedFeature, originalGeometry);
 * history.record('delete', removedFeature);
 *
 * // Undo the last operation:
 * history.undo();
 *
 * // Redo it:
 * history.redo();
 * ```
 */
export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private source: HistorySource;

  /**
   * @param source - The OL VectorSource whose operations are being tracked.
   *                  Accepts a {@link HistorySource} (structural subset of VectorSource,
   *                  so mocks and fakes satisfy the type in tests).
   */
  constructor(source: HistorySource) {
    this.source = source;
  }

  /**
   * Record an operation for later undo / redo.
   *
   * @param op        - Operation type.
   * @param feature   - The OL Feature involved.
   * @param beforeGeo - Geometry snapshot *before* the operation (for 'modify' and 'delete').
   */
  record(op: HistoryOpType, feature: Feature, beforeGeo?: Geometry | null): void {
    const featureId = feature.getId() ?? generateFeatureId();

    if (op === 'add') {
      this.undoStack.push({ op: 'add', before: null, after: feature.clone(), featureId });
    } else if (op === 'modify') {
      const currentGeom = feature.getGeometry();
      this.undoStack.push({
        op: 'modify',
        before: beforeGeo ? beforeGeo.clone() : null,
        after: currentGeom ? currentGeom.clone() : null,
        featureId,
      });
    } else if (op === 'delete') {
      this.undoStack.push({ op: 'delete', before: feature.clone(), after: null, featureId });
    }

    // Enforce max depth — discard oldest entry
    if (this.undoStack.length > MAX_HISTORY_DEPTH) {
      this.undoStack.shift();
    }

    // Any new operation clears the redo branch
    this.redoStack = [];
  }

  /**
   * Undo the most recent operation.
   * @returns `true` if an operation was undone, `false` if nothing to undo.
   */
  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;

    if (entry.op === 'add') {
      // Undo add → remove the feature from the source
      const feature = this.findFeature(entry.featureId);
      if (feature) this.source.removeFeature(feature);
    } else if (entry.op === 'modify') {
      // Undo modify → restore the original geometry
      const feature = this.findFeature(entry.featureId);
      if (feature && entry.before) feature.setGeometry(entry.before);
    } else if (entry.op === 'delete') {
      // Undo delete → re-add the feature
      this.source.addFeature(entry.before);
    }

    this.redoStack.push(entry);
    return true;
  }

  /**
   * Redo the most recently undone operation.
   * @returns `true` if an operation was redone, `false` if nothing to redo.
   */
  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;

    if (entry.op === 'add') {
      // Redo add → re-add the feature
      this.source.addFeature(entry.after);
    } else if (entry.op === 'modify') {
      // Redo modify → restore the modified geometry
      const feature = this.findFeature(entry.featureId);
      if (feature && entry.after) feature.setGeometry(entry.after);
    } else if (entry.op === 'delete') {
      // Redo delete → remove the feature again
      const feature = this.findFeature(entry.featureId);
      if (feature) this.source.removeFeature(feature);
    }

    this.undoStack.push(entry);
    return true;
  }

  /** Whether at least one undo operation is available. */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether at least one redo operation is available. */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Number of undoable operations. */
  getUndoCount(): number {
    return this.undoStack.length;
  }

  /** Number of redoable operations. */
  getRedoCount(): number {
    return this.redoStack.length;
  }

  /** Clear all history (both undo and redo stacks). */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Look up a feature in the source by its id (supports string, number, or undefined). */
  private findFeature(id: string | number | undefined): Feature | null {
    if (id == null) return null;
    const byId = this.source.getFeatureById(id);
    if (byId) return byId;
    const features = this.source.getFeatures();
    for (let i = 0; i < features.length; i++) {
      if (features[i].getId() === id) return features[i];
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Orthogonal constraint — geometryFunction factory for OL Draw (Polygon)
// ---------------------------------------------------------------------------

/**
 * A geometry function that may carry an optional `_cleanupListeners` hook
 * (used to tear down global keyboard listeners attached by the factory).
 */
interface GeomFnWithCleanup {
  (coordinates: number[][], geometry: SimpleGeometry | undefined): SimpleGeometry;
  _cleanupListeners?: () => void;
}

/**
 * Creates an orthogonal geometry function for OL Draw (Polygon type).
 *
 * While the user draws a parcel polygon, each new edge is constrained to be at
 * exactly 90 degrees to the previous edge — the standard cadastral CAD behaviour.
 *
 * The constraint is active when the `enabled()` callback returns `true`.
 * Holding **Shift** temporarily disables the constraint for free-form drawing.
 *
 * The returned geometry function should be passed as the `geometryFunction`
 * option to the `ol/interaction/Draw` constructor.
 *
 * Attach a cleanup call later via the `_cleanupListeners` property on the
 * returned function to remove global keyboard listeners.
 *
 * @param enabled - Callback returning whether the orthogonal constraint is active.
 * @returns A geometry function compatible with OL Draw's `geometryFunction` option.
 */
function createOrthogonalGeometryFunction(
  enabled: () => boolean,
): GeomFnWithCleanup {
  let shiftHeld = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Shift') shiftHeld = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') shiftHeld = false;
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  const geomFn = ((coordinates: number[][], geometry: SimpleGeometry | undefined): SimpleGeometry => {
    // The wrapper (see createEditingInteractionStack) always supplies a geometry,
    // but be defensive: OL's DrawEvent calls geometryFunction with `undefined`
    // on the very first invocation of a sketch.
    if (!geometry) {
      // Returning a fresh empty Polygon is safe — the wrapper will overwrite
      // this on the next call. We can't construct one here without a circular
      // import, so fall back to returning the input (defensive no-op).
      throw new Error('createOrthogonalGeometryFunction: geometry must be supplied by the wrapper');
    }

    const constrained = enabled() && !shiftHeld;

    // Need at least 3 coordinates to establish a previous edge: [pN-1, pN, rubberBand]
    if (!constrained || coordinates.length < 3) {
      geometry.setCoordinates([coordinates.slice()] as unknown as number[][][]);
      return geometry;
    }

    // Work on a copy so we don't mutate the input
    const pts = coordinates.map((c) => c.slice());

    // Index of the second-to-last fixed point
    const prevIdx = pts.length - 3;
    const lastFixedIdx = pts.length - 2;
    const prevPt = pts[prevIdx];
    const lastFixed = pts[lastFixedIdx];
    const mousePos = pts[pts.length - 1];

    if (!prevPt || !lastFixed || !mousePos) {
      geometry.setCoordinates([pts] as unknown as number[][][]);
      return geometry;
    }

    // Direction vector of the previous edge: lastFixed - prevPt
    const dx = lastFixed[0] - prevPt[0];
    const dy = lastFixed[1] - prevPt[1];
    const lenSq = dx * dx + dy * dy;

    if (lenSq < 1e-12) {
      // Degenerate previous edge — pass through unconstrained
      geometry.setCoordinates([pts] as unknown as number[][][]);
      return geometry;
    }

    // Vector from lastFixed to mousePos
    const ex = mousePos[0] - lastFixed[0];
    const ey = mousePos[1] - lastFixed[1];

    // Scalar projection onto the previous edge direction
    const dot = (ex * dx + ey * dy) / lenSq;

    // Parallel projection (same direction as previous edge)
    const parX = lastFixed[0] + dot * dx;
    const parY = lastFixed[1] + dot * dy;

    // Perpendicular projection (90 degrees from previous edge)
    const perpX = lastFixed[0] + ex - dot * dx;
    const perpY = lastFixed[1] + ey - dot * dy;

    // Choose the projection closer to the actual mouse position
    const distPar = (mousePos[0] - parX) ** 2 + (mousePos[1] - parY) ** 2;
    const distPerp = (mousePos[0] - perpX) ** 2 + (mousePos[1] - perpY) ** 2;

    const snapped = distPar < distPerp ? [parX, parY] : [perpX, perpY];
    pts[pts.length - 1] = snapped;

    geometry.setCoordinates([pts] as unknown as number[][][]);
    return geometry;
  }) as GeomFnWithCleanup;

  // Expose cleanup so the caller can remove keyboard listeners on teardown
  geomFn._cleanupListeners = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    }
  };

  return geomFn;
}

// ---------------------------------------------------------------------------
// createEditingInteractionStack
// ---------------------------------------------------------------------------

/**
 * Creates the full editing interaction stack for cadastral parcel editing.
 *
 * Sets up the snap → modify → draw chain with optional orthogonal constraints,
 * automatic history tracking (undo / redo), keyboard shortcuts, and event
 * callbacks.
 *
 * **Keyboard shortcuts:**
 * - `Delete` / `Backspace` — remove the currently selected feature
 * - `Ctrl+Z` — undo the last operation
 * - `Ctrl+Shift+Z` / `Ctrl+Y` — redo
 * - `Shift` (hold while drawing) — temporarily disable orthogonal constraint
 *
 * @param options - Editing configuration. See {@link EditingOptions}.
 * @returns The interaction stack. Add `snap`, `modify`, and `draw` to the map
 *          via `map.addInteraction()`. Call `removeAll()` on teardown.
 *
 * @example
 * ```ts
 * const stack = await createEditingInteractionStack({
 *   source: parcelSource,
 *   snapSource: existingParcelsSource,
 *   snapTolerance: 15,
 *   orthogonalConstraint: true,
 *   onFeatureAdded: (f) => ),
 * });
 *
 * map.addInteraction(stack.snap);
 * map.addInteraction(stack.modify);
 * map.addInteraction(stack.draw);
 *
 * // Undo the last operation:
 * stack.history.undo();
 *
 * // Cleanup on unmount:
 * stack.removeAll();
 * ```
 */
export async function createEditingInteractionStack(
  options: EditingOptions,
): Promise<InteractionStack> {
  const {
    source,
    snapSource,
    snapTolerance = 10,
    orthogonalConstraint: orthoEnabled = true,
    onFeatureAdded,
    onFeatureModified,
    onFeatureDeleted,
  } = options;

  // ── History ────────────────────────────────────────────────────────────
  const history = new HistoryManager(source);

  // ── Select (required by Modify) ────────────────────────────────────────
  const select = new Select({ hitTolerance: 5 });

  // ── Snap ───────────────────────────────────────────────────────────────
  const snapping = snapForSources(snapSource ? [source, snapSource] : [source], snapTolerance);
  const snap = snapping.snap;

  // ── Modify ─────────────────────────────────────────────────────────────
  const modify = new Modify({ features: select.getFeatures() });

  // Track original geometries per ModifyEvent using a WeakMap (avoids
  // augmenting the event object with ad-hoc properties).
  const originalGeometriesByEvent = new WeakMap<
    ModifyEvent,
    Array<{ feature: Feature; geometry: Geometry | undefined }>
  >();

  modify.on('modifystart', (event: ModifyEvent) => {
    const features = event.features?.getArray();
    if (!features || features.length === 0) return;
    // Snapshot every feature's geometry before modification
    originalGeometriesByEvent.set(
      event,
      features.map((f) => ({
        feature: f,
        geometry: f.getGeometry()?.clone(),
      })),
    );
  });

  modify.on('modifyend', (event: ModifyEvent) => {
    const originals = originalGeometriesByEvent.get(event) ?? [];
    for (const { feature, geometry } of originals) {
      history.record('modify', feature, geometry);
      if (onFeatureModified) onFeatureModified(feature);
    }
    originalGeometriesByEvent.delete(event);
  });

  // ── Draw with optional orthogonal constraint ───────────────────────────
  const rawGeomFn = createOrthogonalGeometryFunction(() => orthoEnabled);

  // Wrap to lazily create the Polygon the first time OL calls the function.
  // OL's Draw calls geometryFunction with `undefined` on the first invocation
  // (see Draw.js — `this.geometryFunction_(this.sketchCoords_, undefined, projection)`),
  // so we materialise an empty Polygon in that case.
  const wrappedGeomFn: DrawGeometryFunction = (coordinates, geometry) => {
    let geom = geometry;
    if (!geom) {
      geom = new Polygon([]);
    }
    return rawGeomFn(coordinates as number[][], geom);
  };

  const draw = new Draw({
    source,
    type: 'Polygon',
    geometryFunction: wrappedGeomFn,
    snapTolerance: snapTolerance,
  });

  draw.on('drawend', (event: DrawEvent) => {
    const feature = event.feature;
    if (!feature.getId()) {
      feature.setId(generateFeatureId());
    }
    history.record('add', feature);
    if (onFeatureAdded) onFeatureAdded(feature);
  });

  // ── Keyboard shortcuts (Delete, Ctrl+Z, Ctrl+Y) ──────────────────────
  const onKeyDown = (event: KeyboardEvent) => {
    // Delete / Backspace — remove selected features
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const selected = select.getFeatures().getArray();
      for (const feature of selected) {
        const fid = feature.getId();
        history.record('delete', feature);
        source.removeFeature(feature);
        select.getFeatures().remove(feature);
        if (onFeatureDeleted && fid != null) onFeatureDeleted(String(fid));
      }
    }

    // Ctrl+Z — undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      history.undo();
    }

    // Ctrl+Shift+Z or Ctrl+Y — redo
    if (
      ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) ||
      ((event.ctrlKey || event.metaKey) && event.key === 'y')
    ) {
      event.preventDefault();
      history.redo();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', onKeyDown);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────
  const removeAll = () => {
    snapping.cleanup();
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', onKeyDown);
    }
    const cleanup = rawGeomFn._cleanupListeners;
    if (typeof cleanup === 'function') {
      cleanup();
    }
    history.clear();
  };

  return { snap, modify, draw, history, removeAll };
}

// ---------------------------------------------------------------------------
// createSubdivisionInteraction
// ---------------------------------------------------------------------------

/**
 * Creates a subdivision interaction that lets the surveyor draw a split line
 * across an existing parcel, dividing it into two new parcels.
 *
 * The split line snaps to the parcel edges. The shared grid splitter retains
 * the drawn path and delivers exactly two complete polygon features.
 *
 * Source geometry is transformed to the declared project grid for topology;
 * the resulting polygons are converted back for display.
 *
 * @param options - Subdivision configuration. See {@link SubdivisionOptions}.
 * @returns An object with the draw and snap interactions plus a cleanup function.
 *
 * @example
 * ```ts
 * const { draw, snap, cleanup } = await createSubdivisionInteraction({
 *   source: parcelSource,
 *   targetFeature: selectedParcel,
 *   sourceProjection: map.getView().getProjection().getCode(),
 *   projectCrs: declaredProjectCrs,
 *   onComplete: (polyA, polyB) => {
 *     parcelSource.removeFeature(selectedParcel);
 *     parcelSource.addFeature(polyA);
 *     parcelSource.addFeature(polyB);
 *   },
 * });
 *
 * map.addInteraction(snap);
 * map.addInteraction(draw);
 * ```
 */
export async function createSubdivisionInteraction(
  options: SubdivisionOptions,
): Promise<{ draw: Draw; snap: Snap; cleanup: () => void }> {
  const { source, targetFeature, snapTolerance = 10, sourceProjection, projectCrs, onComplete, onError } = options
  const frame = declaredFrames(sourceProjection, projectCrs)
  const parentGeometry = targetFeature.getGeometry()
  if (!(parentGeometry instanceof Polygon) || parentGeometry.getCoordinates().length !== 1) throw new Error('Subdivision requires one simple polygon without interior rings.')
  if (!source.hasFeature(targetFeature)) throw new Error('The parent parcel is not in the editing source.')
  const geometryRevision = parentGeometry.getRevision()
  const featureRevision = targetFeature.getRevision()
  const originalProperties = { ...targetFeature.getProperties() }
  delete originalProperties.geometry
  const parentId = targetFeature.getId()
  const originalStyle = targetFeature.getStyle()
  const parentGrid = parentGeometry.getCoordinates()[0].map(frame.toGrid)
  const splitSource = new VectorSource<Feature>()
  const targetSource = new VectorSource<Feature>({ features: [targetFeature] })
  const snapping = snapForSources([splitSource, targetSource], snapTolerance)
  const draw = new Draw({ source: splitSource, type: 'LineString', snapTolerance, minPoints: 2 })
  let cleanedUp = false
  const keys: EventsKey[] = []
  function cleanup(): void {
    if (cleanedUp) return
    cleanedUp = true
    unByKey(keys)
    snapping.cleanup()
    splitSource.clear()
    targetSource.clear()
  }
  keys.push(draw.on('drawend', (event: DrawEvent) => {
    if (cleanedUp) return
    try {
      if (!source.hasFeature(targetFeature) || targetFeature.getGeometry() !== parentGeometry || parentGeometry.getRevision() !== geometryRevision || targetFeature.getRevision() !== featureRevision) throw new Error('The parent parcel changed during drawing. Reopen subdivision on its current revision.')
      const line = event.feature.getGeometry()
      if (!(line instanceof LineString)) throw new Error('Draw a valid parcel dividing line.')
      const result = splitPolygonWithLine(parentGrid, line.getCoordinates().map(frame.toGrid), frame.grid)
      if (!result) throw new Error('The dividing line must create exactly two complete simple parcels. Review crossings, boundary overlaps and interior rings.')
      const children = [result.polygon1, result.polygon2].map(ring => {
        const child = new Feature({ geometry: new Polygon([ring.map(frame.fromGrid)]) })
        child.setId(generateFeatureId())
        child.setProperties({ ...originalProperties, subdivided_from: parentId })
        if (originalStyle) child.setStyle(originalStyle)
        return child
      })
      onComplete(children[0], children[1])
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      if (onError) onError(failure)
      else logger.error('[cadastralEditing] Subdivision refused:', { error: failure.message })
    } finally { cleanup() }
  }))
  keys.push(draw.on('drawabort', cleanup))
  return { draw, snap: snapping.snap, cleanup }
}

// ---------------------------------------------------------------------------
// createMeasureWhileDraw
// ---------------------------------------------------------------------------

/**
 * Displays real-time distance and bearing annotations while the user draws.
 *
 * As the surveyor clicks vertices during an OL Draw interaction, this module
 * renders measurement labels on a temporary overlay layer:
 * - **Per-edge distance** (e.g. "23.45 m") at the midpoint of each edge
 * - **Per-edge bearing** (e.g. "90.0° E") alongside the distance
 * - **Cumulative distance** (e.g. "Total: 67.89 m") at the cursor
 *
 * All source positions are converted to the declared projected project grid.
 * Distances and grid bearings use the shared CRS authority; no zone is guessed.
 *
 * @param options - Measurement configuration. See {@link MeasureWhileDrawOptions}.
 * @returns A handle with a `cleanup` function and a reference to the annotation layer.
 *
 * @example
 * ```ts
 * const measure = await createMeasureWhileDraw({
 *   map,
 *   drawInteraction: stack.draw,
 *   projection: map.getView().getProjection().getCode(),
 *   projectCrs: declaredProjectCrs,
 * });
 *
 * // When done (e.g. on unmount):
 * measure.cleanup();
 * ```
 */
export async function createMeasureWhileDraw(
  options: MeasureWhileDrawOptions,
): Promise<MeasureHandle> {
  const { map, drawInteraction, projection, projectCrs, showBearing = true, showCumulativeDistance = true, showEdgeDistance = true, onError } = options
  const frame = declaredFrames(projection, projectCrs)
  const measureSource = new VectorSource()
  const measureLayer = new VectorLayer({
    source: measureSource,
    style: (feature: FeatureLike) => new Style({
      text: new Text({
        font: '11px monospace', fill: new Fill({ color: '#1a237e' }),
        stroke: new Stroke({ color: '#ffffff', width: 3 }),
        text: (feature.get('measureLabel') as string) ?? '', offsetY: -14, placement: 'point',
      }),
    }),
    zIndex: 100,
  })
  map.addLayer(measureLayer)
  let active = false
  let cleanedUp = false
  let sketchFeature: Feature | null = null
  let geometryChangeKey: EventsKey | null = null
  const clearAnnotations = () => measureSource.clear()
  function updateAnnotations(coords: number[][]): void {
    clearAnnotations()
    if (coords.length < 2) return
    try {
      const grid = coords.map(frame.toGrid)
      const annotations: Array<{ coordinate: number[]; label: string; type: string }> = []
      let cumulative = 0
      for (let index = 1; index < grid.length; index++) {
        const from = grid[index - 1], to = grid[index]
        const edgeDistance = surveyDistance(from[0], from[1], to[0], to[1], frame.grid)
        cumulative += edgeDistance
        if (!Number.isFinite(edgeDistance) || !Number.isFinite(cumulative)) throw new Error('The sketch has no finite survey distance.')
        const parts: string[] = []
        if (showEdgeDistance) parts.push(formatDistance(edgeDistance))
        if (showBearing && edgeDistance > 0) parts.push(formatBearingCardinal(surveyBearing(from[0], from[1], to[0], to[1], frame.grid)))
        annotations.push({ coordinate: midpoint(coords[index - 1], coords[index]), label: parts.join('  '), type: 'edge' })
      }
      if (showCumulativeDistance && grid.length > 2) annotations.push({ coordinate: coords[coords.length - 1], label: 'Σ ' + formatDistance(cumulative), type: 'cumulative' })
      for (const annotation of annotations) {
        const feature = new Feature({ geometry: new Point(annotation.coordinate) })
        feature.set('measureLabel', annotation.label)
        feature.set('measureType', annotation.type)
        measureSource.addFeature(feature)
      }
    } catch (error) {
      clearAnnotations()
      const failure = error instanceof Error ? error : new Error(String(error))
      if (onError) onError(failure)
      else logger.error('[cadastralEditing] Measurement refused:', { error: failure.message })
    }
  }
  function readSketchCoords(): number[][] | null {
    const geometry = sketchFeature?.getGeometry()
    if (geometry?.getType() === 'Polygon') return (geometry as Polygon).getCoordinates()[0] ?? null
    if (geometry?.getType() === 'LineString') return (geometry as LineString).getCoordinates()
    return null
  }
  function detachSketchListener(): void {
    if (geometryChangeKey) unByKey(geometryChangeKey)
    geometryChangeKey = null
    sketchFeature = null
    active = false
  }
  function onDrawStart(event: DrawEvent): void {
    detachSketchListener()
    active = true
    sketchFeature = event.feature
    const geometry = sketchFeature.getGeometry()
    if (geometry) geometryChangeKey = geometry.on('change', () => {
      if (!active) return
      const coords = readSketchCoords()
      if (coords) updateAnnotations(coords)
    })
    clearAnnotations()
  }
  function onDrawEnd(): void {
    const coords = readSketchCoords()
    if (coords) updateAnnotations(coords)
    detachSketchListener()
  }
  function onDrawAbort(): void {
    clearAnnotations()
    detachSketchListener()
  }
  drawInteraction.on('drawstart', onDrawStart)
  drawInteraction.on('drawend', onDrawEnd)
  drawInteraction.on('drawabort', onDrawAbort)
  return { layer: measureLayer, cleanup: () => {
    if (cleanedUp) return
    cleanedUp = true
    detachSketchListener()
    drawInteraction.un('drawstart', onDrawStart)
    drawInteraction.un('drawend', onDrawEnd)
    drawInteraction.un('drawabort', onDrawAbort)
    clearAnnotations()
    map.removeLayer(measureLayer)
  } }
}

// ---------------------------------------------------------------------------
// createHistoryManager — standalone factory
// ---------------------------------------------------------------------------

/**
 * Creates a standalone HistoryManager for a given OL VectorSource.
 *
 * Use this when you need undo / redo support without the full editing
 * interaction stack (e.g. for programmatic feature manipulation).
 *
 * @param source - The OL VectorSource whose operations will be tracked.
 * @returns A new HistoryManager instance.
 *
 * @example
 * ```ts
 * const history = await createHistoryManager(parcelSource);
 *
 * // Manually record a feature addition:
 * parcelSource.addFeature(newParcel);
 * history.record('add', newParcel);
 *
 * // Undo:
 * history.undo();
 * ```
 */
export async function createHistoryManager(
  source: HistorySource,
): Promise<HistoryManager> {
  return new HistoryManager(source);
}
