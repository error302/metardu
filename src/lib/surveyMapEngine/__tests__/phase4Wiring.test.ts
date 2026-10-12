/**
 * Phase 4 wiring guard (plan Phase 4: "point loading, stakeout, export,
 * print, QA overlays"; exit: export/print entry points reachable from the
 * engine context on both surfaces).
 *
 * Static source contracts proving that:
 *   1. the adopted modules live in the engine (ol/), with pure re-export
 *      shims at the legacy paths (move-then-shim, plan §3.1), and
 *   2. export/print entries flow through the io/ surfaces and are exposed
 *      via the react/ engine context on BOTH map surfaces.
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
  olStakeout: 'src/lib/surveyMapEngine/ol/stakeout.ts',
  olStakeoutVoice: 'src/lib/surveyMapEngine/ol/stakeoutVoice.ts',
  olPointLoading: 'src/lib/surveyMapEngine/ol/pointLoading.ts',
  olQaOverlays: 'src/lib/surveyMapEngine/ol/qaOverlays.ts',
  ioExport: 'src/lib/surveyMapEngine/io/exportSurface.ts',
  ioPrint: 'src/lib/surveyMapEngine/io/printSurface.ts',
  reactContext: 'src/lib/surveyMapEngine/react/SurveyMapEngineContext.tsx',
  reactHook: 'src/lib/surveyMapEngine/react/useSurveyMapEngine.ts',
  shimStakeout: 'src/lib/map/stakeout.ts',
  shimStakeoutVoice: 'src/lib/map/stakeoutVoice.ts',
  shimPointLoading: 'src/lib/map/projectPointsLayer.ts',
  shimGridOverlay: 'src/lib/map/gridOverlay.ts',
  mapClient: 'src/app/map/MapClient.tsx',
  useProjectPoints: 'src/app/map/hooks/useProjectPoints.ts',
  useMapPrintFlow: 'src/app/map/hooks/useMapPrintFlow.ts',
  surveyMap: 'src/components/map/SurveyMap.tsx',
  useMapInteractions: 'src/app/map/hooks/useMapInteractions.ts',
  mapReactContext: 'src/app/map/MapReactContext.tsx',
  stakeoutPanel: 'src/components/map/StakeoutPanel.tsx',
  layerControl: 'src/components/map/LayerControl.tsx',
  instantClosureFeedback: 'src/app/map/components/InstantClosureFeedback.tsx',
  engineLayers: 'src/lib/surveyMapEngine/ol/layers.ts',
};

describe('engine hosts the Phase 4 modules (plan §3.1)', () => {
  test('ol/ contains stakeout, stakeoutVoice, pointLoading, qaOverlays', () => {
    for (const path of [
      files.olStakeout,
      files.olStakeoutVoice,
      files.olPointLoading,
      files.olQaOverlays,
    ]) {
      expect(() => readSource(path)).not.toThrow();
    }
  });

  test('io/ contains exportSurface + printSurface', () => {
    for (const path of [files.ioExport, files.ioPrint]) {
      expect(() => readSource(path)).not.toThrow();
    }
  });

  test('react/ contains SurveyMapEngineContext + useSurveyMapEngine', () => {
    expect(readSource(files.reactContext)).toMatch(/createContext/);
    const hook = readSource(files.reactHook);
    expect(hook).toMatch(/export function useSurveyMapEngine\b/);
    expect(hook).toContain('useSurveyMapEngineContext');
    // Fail-closed: using the hook outside a provider must throw, not no-op.
    expect(hook).toMatch(/throw new Error/);
  });

  test('Phase 5: legacy module shim paths are deleted', () => {
    for (const path of [
      files.shimStakeout,
      files.shimStakeoutVoice,
      files.shimPointLoading,
      files.shimGridOverlay,
    ]) {
      expect(sources.some((s) => s.file === path)).toBe(false);
    }
  });

  test('Phase 4 rename: stakeout exposes formatBearingDmsInt (no WCB-named DMS formatter anywhere)', () => {
    const engine = readSource(files.olStakeout);
    expect(engine).toMatch(/export function formatBearingDmsInt\b/);
    const wcbDefs = sources.filter((s) => /export (function|const) formatBearingWCB\b/.test(s.text)).map((s) => s.file);
    expect(wcbDefs).toEqual(['src/lib/surveyMapEngine/core/format.ts']);
  });
});

describe('io/ surfaces delegate to existing generators', () => {
  test('io/exportSurface re-exports the generators without reimplementing them', () => {
    const text = readSource(files.ioExport);
    expect(text).toContain(`from '@/lib/map/deedPlanExport'`);
    expect(text).toContain(`from '@/lib/export/exportMapPDF'`);
    expect(text).toContain(`from '@/lib/export/generateGeoJSON'`);
    expect(text).toContain(`from '@/lib/export/generateLandXML'`);
    // Delegation only — no generator bodies of its own (fail-closed CRS
    // behavior stays in the underlying exporters):
    expect(text).not.toMatch(/export (async )?function/);
    expect(text).not.toMatch(/export const \w+ =/);
  });

  test('io/printSurface re-exports usePrint family and lazy-loads SheetLayout', () => {
    const text = readSource(files.ioPrint);
    expect(text).toContain(`from '@/hooks/usePrint'`);
    expect(text).toMatch(/export async function loadSheetLayout\b/);
    expect(text).toContain(`import('@/components/map/SheetLayout')`);
  });
});

describe('React consumers use the engine paths', () => {
  test('stakeout consumers import from ol/stakeout / ol/stakeoutVoice', () => {
    const interactions = readSource(files.useMapInteractions);
    expect(interactions).toContain(`from '@/lib/surveyMapEngine/ol/stakeout'`);
    expect(interactions).not.toContain(`'@/lib/map/stakeout'`);
    expect(readSource(files.mapReactContext)).toContain(`@/lib/surveyMapEngine/ol/stakeout`);
    const panel = readSource(files.stakeoutPanel);
    expect(panel).toContain(`from '@/lib/surveyMapEngine/ol/stakeoutVoice'`);
    expect(panel).not.toContain(`'@/lib/map/stakeoutVoice'`);
  });

  test('point loading comes from ol/pointLoading (Phase 5: hook on the /map surface)', () => {
    const client = readSource(files.mapClient);
    const hook = readSource(files.useProjectPoints);
    expect(hook).toContain(`from '@/lib/surveyMapEngine/ol/pointLoading'`);
    expect(hook).toMatch(/createProjectPointsLayer\(/);
    expect(client).not.toContain(`'@/lib/map/projectPointsLayer'`);
  });

  test('grid overlay comes from ol/qaOverlays and the engine no longer imports the legacy path', () => {
    const control = readSource(files.layerControl);
    expect(control).toContain(`from '@/lib/surveyMapEngine/ol/qaOverlays'`);
    expect(control).not.toContain(`'@/lib/map/gridOverlay'`);
    const layers = readSource(files.engineLayers);
    expect(layers).toContain(`from './qaOverlays'`);
    expect(layers).not.toContain(`'@/lib/map/gridOverlay'`);
  });

  test('InstantClosureFeedback renders engine-computed closure feedback (no local closure math)', () => {
    const component = readSource(files.instantClosureFeedback);
    expect(component).toMatch(/evaluateInstantClosure\(/);
    expect(component).toContain(`@/lib/surveyMapEngine/ol/qaOverlays`);
    expect(component).not.toMatch(/distanceBearing\(/);
    expect(component).not.toMatch(/evaluateTraverseClosure\(/);
    expect(component).not.toMatch(/function getGrade\(/);
  });
});

describe('export/print entries are reachable from the engine context on both surfaces (Phase 4 exit)', () => {
  test('context exposes the io export + print surfaces', () => {
    const ctx = readSource(files.reactContext);
    expect(ctx).toContain(`from '../io/exportSurface'`);
    expect(ctx).toContain(`from '../io/printSurface'`);
    expect(ctx).toMatch(/exportMapPDF/);
    expect(ctx).toMatch(/downloadDeedPlan/);
    expect(ctx).toMatch(/loadSheetLayout/);
    expect(ctx).toMatch(/export function SurveyMapEngineProvider\b/);
  });

  test('MapClient mounts the provider and routes print entries through it', () => {
    const client = readSource(files.mapClient);
    expect(client).toContain(`from '@/lib/surveyMapEngine/react/SurveyMapEngineContext'`);
    expect(client).toContain(`from '@/lib/surveyMapEngine/io/printSurface'`);
    expect(client).not.toContain(`from '@/hooks/usePrint'`);
    expect(client).toMatch(/<SurveyMapEngineProvider printApi=\{printApi\}>/);
    // The printApi itself is assembled by the Phase 5 print-flow hook.
    const printFlow = readSource(files.useMapPrintFlow);
    expect(printFlow).toMatch(/print: handlePrintMap/);
    expect(printFlow).toMatch(/loadSheetLayout\(\)/);
  });

  test('SurveyMap mounts the provider and routes export entries through it', () => {
    const survey = readSource(files.surveyMap);
    expect(survey).toContain(`from '@/lib/surveyMapEngine/react/SurveyMapEngineContext'`);
    expect(survey).toContain(`from '@/lib/surveyMapEngine/io/exportSurface'`);
    expect(survey).not.toContain(`from '@/lib/export/exportMapPDF'`);
    expect(survey).toMatch(/<SurveyMapEngineProvider printApi=\{printApi\}>/);
    expect(survey).toMatch(/print: handlePrint/);
    // Phase 5: the toolbar controls read the engine context.
    expect(survey).toContain(`from '@/lib/surveyMapEngine/react/useSurveyMapEngine'`);
    expect(survey).toMatch(/useSurveyMapEngine\(\)/);
  });
});
