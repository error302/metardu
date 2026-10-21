/**
 * Phase 2 wiring guard (plan Phase 2 exit): static source contracts proving
 *   1. all three map surfaces write the same selection store shape, and
 *   2. layer toggle logic is no longer duplicated across contexts — the
 *      basemap/opacity loops exist only in ol/layers.ts.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, sep } from 'path';
import ProjectMapPage from '@/app/project/[id]/map/page';
import { redirect } from 'next/navigation';
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

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
  mapClient: 'src/app/map/MapClient.tsx',
  projectMapPage: 'src/app/project/[id]/map/page.tsx',
  workspaceMap: 'src/components/workspace/WorkspaceMap.tsx',
  bridge: 'src/hooks/useWorkspaceBridge.tsx',
  layerControl: 'src/components/map/LayerControl.tsx',
  useMapBasemaps: 'src/app/map/hooks/useMapBasemaps.ts',
  useMapInteractions: 'src/app/map/hooks/useMapInteractions.ts',
  selectionStore: 'src/lib/surveyMapEngine/ol/selection.ts',
  layersRegistry: 'src/lib/surveyMapEngine/ol/layers.ts',
};

function definingFiles(pattern: RegExp): string[] {
  return sources.filter((s) => pattern.test(s.text)).map((s) => s.file);
}

describe('selection store wiring (Phase 2 exit)', () => {
  test.each([
    ['/map MapClient', files.mapClient, "kind: 'feature'", "surface: 'map'", "clearSelectionFrom('map')"],
    ['WorkspaceMap', files.workspaceMap, "kind: 'station'", "surface: 'workspace'", "clearSelectionFrom('workspace')"],
    ['workspace bridge (grid selection)', files.bridge, "kind: 'station'", "surface: 'workspace'", "clearSelectionFrom('workspace')"],
  ])('%s mirrors into the unified store', (_name, relPath, ...needles) => {
    const text = readSource(relPath);
    expect(text).toContain('@/lib/surveyMapEngine/ol/selection');
    for (const needle of needles) expect(text).toContain(needle);
  });

  test.each(['synthetic-project', 'project?name=synthetic&part=1#corner'])('the legacy project map forwards %s into the shared map', async (id) => {
    jest.mocked(redirect).mockClear();
    await ProjectMapPage({ params: Promise.resolve({ id }) });
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(`/map?projectId=${encodeURIComponent(id)}`);
  });

  test('only the engine defines the selection store', () => {
    expect(definingFiles(/export const useSelectionStore\b/)).toEqual([files.selectionStore]);
  });

  test('workspace map and grid bridge share the workspace surface tag', () => {
    expect(readSource(files.workspaceMap)).toContain("surface: 'workspace'");
    expect(readSource(files.bridge)).toContain("surface: 'workspace'");
  });
});

describe('layer toggle de-duplication (Phase 2 exit)', () => {
  test.each([
    ['LayerControl', files.layerControl],
    ['useMapBasemaps', files.useMapBasemaps],
    ['useMapInteractions', files.useMapInteractions],
    ['WorkspaceMap', files.workspaceMap],
  ])('%s routes toggles through ol/layers', (_name, relPath) => {
    expect(readSource(relPath)).toContain('@/lib/surveyMapEngine/ol/layers');
  });

  test('legacy duplicated basemap/opacity loops are gone', () => {
    expect(readSource(files.workspaceMap)).not.toContain('layer.setVisible(id ===');
    expect(readSource(files.useMapBasemaps)).not.toContain('basemapIds.includes');
    expect(readSource(files.useMapInteractions)).not.toContain('layer.setOpacity(opacity)');
    expect(readSource(files.layerControl)).not.toContain('setVisible(target ===');
    expect(readSource(files.layerControl)).not.toContain("basemapId === 'osm'");
    expect(readSource(files.layerControl)).not.toContain("startsWith('custom-')");
  });

  test.each([
    ['switchBasemapById', /export function switchBasemapById\b/],
    ['applyOverlayOpacity', /export function applyOverlayOpacity\b/],
    ['setLayerVisibleByLayerId', /export function setLayerVisibleByLayerId\b/],
    ['describeMapLayers', /export function describeMapLayers\b/],
  ])('%s is defined exactly once', (_name, pattern) => {
    expect(definingFiles(pattern as RegExp)).toEqual([files.layersRegistry]);
  });

  test('LayerControl grid + custom toggles use the registry helpers', () => {
    const text = readSource(files.layerControl);
    expect(text).toContain('setLayerVisibleByLayerId(map, GRID_LAYER_ID');
    expect(text).toContain('toggleLayerVisibleByBasemapId(map, id)');
    expect(text).toContain('findLayerByBasemapId(mapInstance');
  });
});
