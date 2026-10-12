/**
 * Single-implementation guard (plan Phase 1 exit: "grep shows a single
 * implementation of each function"; extended in Phase 3 for the snapping +
 * drawing moves).
 *
 * Walks src/ and asserts that functions relocated into the engine core/ol
 * are defined exactly once — old paths may only re-export, never
 * re-implement.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, sep } from 'path';

const repoRoot = join(__dirname, '..', '..', '..', '..');
const srcRoot = join(repoRoot, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules' && entry.name !== '.next') {
        walk(full, out);
      }
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const sources = walk(srcRoot).map((file) => ({
  file: file.slice(repoRoot.length + 1).split(sep).join('/'),
  text: readFileSync(file, 'utf8'),
}));

function definingFiles(pattern: RegExp): string[] {
  return sources.filter((s) => pattern.test(s.text)).map((s) => s.file);
}

describe('single implementation of relocated functions (Phase 1 exit)', () => {
  test.each([
    ['polylineLengthInCrs', /export function polylineLengthInCrs\b/, 'src/lib/surveyMapEngine/core/measure.ts'],
    ['polygonAreaInCrs', /export function polygonAreaInCrs\b/, 'src/lib/surveyMapEngine/core/measure.ts'],
    ['polygonPerimeterInCrs', /export function polygonPerimeterInCrs\b/, 'src/lib/surveyMapEngine/core/measure.ts'],
    ['endpointsBearingInCrs', /export function endpointsBearingInCrs\b/, 'src/lib/surveyMapEngine/core/measure.ts'],
    // Phase 4 rename: stakeout's integer-seconds DMS formatter (no quadrant
    // letters) is now `formatBearingDmsInt` in ol/stakeout; the legacy
    // `formatBearingWCB` name at the old path is an alias re-export, never a
    // definition. (Distinct from lib/spatial/projectCrs.formatBearingDms,
    // which renders decimal seconds.)
    ['formatBearingWCB (quadrant style)', /export function formatBearingWCB\b/, 'src/lib/surveyMapEngine/core/format.ts'],
    ['formatBearingDmsInt', /export function formatBearingDmsInt\b/, 'src/lib/surveyMapEngine/ol/stakeout.ts'],
    ['formatDistance (moved body)', /export function formatDistance\(meters: number, precision: number = 3\)/, 'src/lib/surveyMapEngine/core/format.ts'],
    ['formatArea (moved body)', /export function formatArea\(areaM2: number\)/, 'src/lib/surveyMapEngine/core/format.ts'],
    ['formatGridPoint', /export function formatGridPoint\b/, 'src/lib/surveyMapEngine/core/format.ts'],
    // Phase 3 (snapping): geometry + labels consolidated into ol/snapping.
    ['pointToSegmentDist', /export function pointToSegmentDist\b/, 'src/lib/surveyMapEngine/ol/snapping.ts'],
    ['nearestPointOnSegment', /export function nearestPointOnSegment\b/, 'src/lib/surveyMapEngine/ol/snapping.ts'],
    ['vertexDist', /export function vertexDist\b/, 'src/lib/surveyMapEngine/ol/snapping.ts'],
    ['nearestVertexOnRing', /export function nearestVertexOnRing\b/, 'src/lib/surveyMapEngine/ol/snapping.ts'],
    ['nearestEdgeOnRing', /export function nearestEdgeOnRing\b/, 'src/lib/surveyMapEngine/ol/snapping.ts'],
    ['SNAP_TYPE_LABELS', /export const SNAP_TYPE_LABELS\b/, 'src/lib/surveyMapEngine/ol/snapping.ts'],
    // Phase 3 (drawing): moved into ol/ behind re-export shims.
    ['splitPolygonWithLine', /export function splitPolygonWithLine\b/, 'src/lib/surveyMapEngine/ol/editingTools.ts'],
    ['mergePolygons', /export function mergePolygons\b/, 'src/lib/surveyMapEngine/ol/editingTools.ts'],
    ['rotatePolygon', /export function rotatePolygon\b/, 'src/lib/surveyMapEngine/ol/editingTools.ts'],
    ['createOffset', /export function createOffset\b/, 'src/lib/surveyMapEngine/ol/editingTools.ts'],
    ['reshapePolygon', /export function reshapePolygon\b/, 'src/lib/surveyMapEngine/ol/editingTools.ts'],
    ['createDrawAnnotationLayer', /export (async )?function createDrawAnnotationLayer\b/, 'src/lib/surveyMapEngine/ol/drawAnnotations.ts'],
    ['HistoryManager', /export class HistoryManager\b/, 'src/lib/surveyMapEngine/ol/cadastralEditing.ts'],
    // Phase 4: stakeout / point loading / QA overlays moved into ol/ behind shims.
    ['computeStakeoutState', /export function computeStakeoutState\b/, 'src/lib/surveyMapEngine/ol/stakeout.ts'],
    ['createStakeoutOverlay', /export (async )?function createStakeoutOverlay\b/, 'src/lib/surveyMapEngine/ol/stakeout.ts'],
    ['createStakeoutAudioAlert', /export function createStakeoutAudioAlert\b/, 'src/lib/surveyMapEngine/ol/stakeout.ts'],
    ['stakeoutVoice singleton', /export const stakeoutVoice\b/, 'src/lib/surveyMapEngine/ol/stakeoutVoice.ts'],
    ['createProjectPointsLayer', /export (async )?function createProjectPointsLayer\b/, 'src/lib/surveyMapEngine/ol/pointLoading.ts'],
    ['GRID_LAYER_ID', /export const GRID_LAYER_ID\b/, 'src/lib/surveyMapEngine/ol/qaOverlays.ts'],
    ['createGridOverlayLayer', /export (async )?function createGridOverlayLayer\b/, 'src/lib/surveyMapEngine/ol/qaOverlays.ts'],
    ['updateGridOverlay', /export (async )?function updateGridOverlay\b/, 'src/lib/surveyMapEngine/ol/qaOverlays.ts'],
    ['evaluateInstantClosure', /export function evaluateInstantClosure\b/, 'src/lib/surveyMapEngine/ol/qaOverlays.ts'],
    ['closureGrade', /export function closureGrade\b/, 'src/lib/surveyMapEngine/ol/qaOverlays.ts'],
  ])('%s is defined in exactly one place', (_name, pattern, expected) => {
    expect(definingFiles(pattern as RegExp)).toEqual([expected]);
  });

  test('Phase 5: legacy shim modules are deleted (no re-export shells left)', () => {
    const deleted = [
      'src/app/map/utils/measureMath.ts',
      'src/lib/map/measurements.ts',
      'src/lib/map/editingTools.ts',
      'src/lib/map/cadastralEditing.ts',
      'src/app/map/utils/drawAnnotations.ts',
      'src/lib/map/stakeout.ts',
      'src/lib/map/stakeoutVoice.ts',
      'src/lib/map/projectPointsLayer.ts',
      'src/lib/map/gridOverlay.ts',
    ];
    for (const shim of deleted) {
      expect(sources.find((s) => s.file === shim)).toBeUndefined();
    }
  });

  test('nothing imports from the deleted shim paths', () => {
    const banned = [
      "'@/app/map/utils/measureMath'",
      "'@/lib/map/measurements'",
      "'@/lib/map/editingTools'",
      "'@/lib/map/cadastralEditing'",
      "'@/app/map/utils/drawAnnotations'",
      "'@/lib/map/stakeout'",
      "'@/lib/map/stakeoutVoice'",
      "'@/lib/map/projectPointsLayer'",
      "'@/lib/map/gridOverlay'",
    ];
    for (const s of sources) {
      for (const bannedPath of banned) {
        expect(s.text).not.toContain(`from ${bannedPath}`);
        expect(s.text).not.toContain(`from("${bannedPath.slice(1, -1)}")`);
      }
    }
  });

  test('gnss.formatCoordinate has no local formatting body (wraps core)', () => {
    const gnss = sources.find((s) => s.file === 'src/lib/gnss/coordinates.ts');
    expect(gnss).toBeDefined();
    expect(gnss?.text).not.toMatch(/toFixed\(decimals\)/);
    expect(gnss?.text).toMatch(/formatGridPoint\(/);
  });

  test('annotations use the engine measure path (no CRS-less calculate*)', () => {
    const annotations = sources.find((s) => s.file === 'src/lib/map/annotations.ts');
    expect(annotations).toBeDefined();
    expect(annotations?.text).not.toMatch(/\bcalculate(Bearing|Distance|Area)\s*\(/);
    expect(annotations?.text).toMatch(/\bsurvey(Bearing|Distance|Area)\b/);
    expect(annotations?.text).toContain(`@/lib/surveyMapEngine/core/measure`);
  });
});
