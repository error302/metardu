/**
 * Phase 3 wiring guard (plan Phase 3 exit): static source contracts proving
 *   1. vertex edit on /map and /project/[id]/map shares ONE code path —
 *      both surfaces drive the same useVertexEditing hook and the same
 *      engine snap module, and
 *   2. the drawing/editing modules live in the engine (ol/) with pure
 *      re-export shims left at their old paths (move-then-shim, plan 3.1).
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

function readSource(relPath: string): string {
  const found = sources.find((s) => s.file === relPath);
  if (!found) throw new Error(`missing source file: ${relPath}`);
  return found.text;
}

const files = {
  snapping: 'src/lib/surveyMapEngine/ol/snapping.ts',
  drawing: 'src/lib/surveyMapEngine/ol/drawing.ts',
  olEditingTools: 'src/lib/surveyMapEngine/ol/editingTools.ts',
  olCadastralEditing: 'src/lib/surveyMapEngine/ol/cadastralEditing.ts',
  olDrawAnnotations: 'src/lib/surveyMapEngine/ol/drawAnnotations.ts',
  legacyEditingTools: 'src/lib/map/editingTools.ts',
  legacyCadastralEditing: 'src/lib/map/cadastralEditing.ts',
  legacyDrawAnnotations: 'src/app/map/utils/drawAnnotations.ts',
  snappingOptions: 'src/app/map/components/SnappingOptions.tsx',
  useVertexEditing: 'src/hooks/useVertexEditing.ts',
  mapClient: 'src/app/map/MapClient.tsx',
  surveyMap: 'src/components/map/SurveyMap.tsx',
  useMapInteractions: 'src/app/map/hooks/useMapInteractions.ts',
  useMapSnapping: 'src/app/map/hooks/useMapSnapping.ts',
  useSchemeLayers: 'src/app/map/hooks/useSchemeLayers.ts',
  useDigitizingTools: 'src/app/map/hooks/useDigitizingTools.ts',
};

describe('engine hosts the moved modules (plan 3.1)', () => {
  test('ol/ contains snapping + drawing entry + the three drawing modules', () => {
    for (const path of [
      files.snapping,
      files.drawing,
      files.olEditingTools,
      files.olCadastralEditing,
      files.olDrawAnnotations,
    ]) {
      expect(() => readSource(path)).not.toThrow();
    }
  });

  test('ol/drawing.ts re-exports all three drawing modules', () => {
    const text = readSource(files.drawing);
    expect(text).toContain(`from '@/lib/surveyMapEngine/ol/editingTools'`);
    expect(text).toContain(`from '@/lib/surveyMapEngine/ol/cadastralEditing'`);
    expect(text).toContain(`from '@/lib/surveyMapEngine/ol/drawAnnotations'`);
  });

  test('Phase 5: old drawing shim paths are deleted', () => {
    for (const path of [
      files.legacyEditingTools,
      files.legacyCadastralEditing,
      files.legacyDrawAnnotations,
    ]) {
      expect(sources.some((s) => s.file === path)).toBe(false);
    }
  });
});

describe('snap logic has a single engine implementation', () => {
  test('SnappingOptions imports its config model from ol/snapping', () => {
    const text = readSource(files.snappingOptions);
    expect(text).toContain(`@/lib/surveyMapEngine/ol/snapping`);
    // Local copies were deleted, not left behind:
    expect(text).not.toMatch(/const SNAP_TYPE_LABELS/);
    expect(text).not.toMatch(/type SnapMode =/);
    expect(text).not.toMatch(/type SnapType =/);
  });

  test('useVertexEditing delegates geometry + Snap creation to ol/snapping', () => {
    const text = readSource(files.useVertexEditing);
    expect(text).toContain(`@/lib/surveyMapEngine/ol/snapping`);
    expect(text).toMatch(/createSnapInteraction\(/);
    expect(text).not.toMatch(/function pointToSegmentDist/);
    expect(text).not.toMatch(/function nearestPointOnSegment/);
    expect(text).not.toMatch(/function vertexDist/);
    // The hook itself must no longer load ol/interaction/Snap at runtime
    // (type-position `import('ol/interaction/Snap').default` refs are fine):
    expect(text).not.toMatch(/new Snap\(/);
    expect(text).not.toContain(`await import('ol/interaction/Snap')`);
    expect(text).not.toMatch(/^\s*import\('ol\/interaction\/Snap'\),\s*$/m);
    // CRS contract (plan F4) unchanged:
    expect(text).toMatch(/epsg:\s*string/);
    expect(text).not.toMatch(/epsg\s*=\s*'EPSG/);
  });

  test('MapClient snap options drive one engine-backed interaction over selected sources', () => {
    const text = readSource(files.mapClient);
    const schemeHook = readSource(files.useSchemeLayers);
    const snappingHook = readSource(files.useMapSnapping);
    expect(text).toContain('useMapSnapping({');
    expect(text).toContain('pixelTolerance: snappingTolerance');
    expect(snappingHook).toMatch(/createSnapInteraction\(/);
    expect(snappingHook).toContain("snapTypes.has('drawn')");
    expect(snappingHook).toContain("snapTypes.has('parcels')");
    expect(snappingHook).toContain("snapTypes.has('beacons')");
    expect(schemeHook).not.toMatch(/createSnapInteraction\(/);
  });

  test('MapClient digitizing tools consume the engine path, not a legacy shim', () => {
    const text = readSource(files.mapClient);
    const toolsHook = readSource(files.useDigitizingTools);
    expect(text).not.toContain(`'@/lib/map/editingTools'`);
    expect(text).not.toContain(`'@/lib/surveyMapEngine/ol/editingTools'`);
    expect(toolsHook).toContain(`@/lib/surveyMapEngine/ol/editingTools`);
  });

  test('useMapInteractions consumes drawAnnotations from the engine path', () => {
    const text = readSource(files.useMapInteractions);
    expect(text).toContain(`@/lib/surveyMapEngine/ol/drawAnnotations`);
    expect(text).not.toContain(`'@/app/map/utils/drawAnnotations'`);
  });
});

describe('vertex edit shares one code path across surfaces (Phase 3 exit)', () => {
  test('exactly one useVertexEditing implementation exists', () => {
    const defining = sources.filter((s) =>
      /export function useVertexEditing\b/.test(s.text)
    ).map((s) => s.file);
    expect(defining).toEqual(['src/hooks/useVertexEditing.ts']);
  });

  test('/map and /project/[id]/map both drive that hook with snap options', () => {
    for (const path of [files.mapClient, files.surveyMap]) {
      const text = readSource(path);
      expect(text).toMatch(/useVertexEditing\(\{/);
      expect(text).toMatch(/snapTolerance/);
      expect(text).toMatch(/snapEnabled/);
      expect(text).toContain('VertexEditToolbar');
    }
  });

  test('only ol/snapping defines SNAP_TYPE_LABELS', () => {
    const defining = sources.filter((s) =>
      /export const SNAP_TYPE_LABELS\b/.test(s.text)
    ).map((s) => s.file);
    expect(defining).toEqual([files.snapping]);
  });
});
