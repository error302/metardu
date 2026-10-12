/**
 * Phase 5 wiring guard (plan Phase 5: consumer rewiring + shim removal;
 * exit: banned-import greps clean).
 *
 * Static source contracts proving that:
 *   1. every legacy shim module is gone and nothing imports the old paths,
 *   2. all surfaces (project map, workspace map, /map) reach export/print
 *      through the engine io/react layers, and
 *   3. MapClient is a composition root again: the behaviour clusters live in
 *      `app/map/hooks/*`, and the engine keeps its CRS guard rails.
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

function lineCount(relPath: string): number {
  return readSource(relPath).split('\n').length;
}

const BANNED_IMPORTS = [
  "@/app/map/utils/measureMath",
  "@/lib/map/measurements",
  "@/lib/map/editingTools",
  "@/lib/map/cadastralEditing",
  "@/app/map/utils/drawAnnotations",
  "@/lib/map/stakeout",
  "@/lib/map/stakeoutVoice",
  "@/lib/map/projectPointsLayer",
  "@/lib/map/gridOverlay",
];

const files = {
  mapClient: 'src/app/map/MapClient.tsx',
  surveyMap: 'src/components/map/SurveyMap.tsx',
  workspaceMap: 'src/components/workspace/WorkspaceMap.tsx',
  annotations: 'src/lib/map/annotations.ts',
  useSchemeLayers: 'src/app/map/hooks/useSchemeLayers.ts',
  useDigitizingTools: 'src/app/map/hooks/useDigitizingTools.ts',
  useTraverseParcelPreview: 'src/app/map/hooks/useTraverseParcelPreview.ts',
  useGpsTracking: 'src/app/map/hooks/useGpsTracking.ts',
  useProjectPoints: 'src/app/map/hooks/useProjectPoints.ts',
  useMapPrintFlow: 'src/app/map/hooks/useMapPrintFlow.ts',
  engineStakeout: 'src/lib/surveyMapEngine/ol/stakeout.ts',
  engineDrawAnnotations: 'src/lib/surveyMapEngine/ol/drawAnnotations.ts',
  engineCoreMeasure: 'src/lib/surveyMapEngine/core/measure.ts',
};

describe('banned-import greps are clean (plan Phase 5 exit)', () => {
  test('no source file imports a deleted legacy module path', () => {
    const offenders: string[] = [];
    for (const s of sources) {
      for (const banned of BANNED_IMPORTS) {
        if (s.text.includes(`from '${banned}'`) || s.text.includes(`from "${banned}"`)) {
          offenders.push(`${s.file} -> ${banned}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('annotations use the engine measure service, not the deleted shim', () => {
    const annotations = readSource(files.annotations);
    expect(annotations).toContain(`@/lib/surveyMapEngine/core/measure`);
    expect(annotations).toContain(`@/lib/surveyMapEngine/core/types`);
    expect(annotations).not.toContain(`@/lib/map/measurements`);
  });

  test('engine core/measure hosts the planar helpers migrated from the shim', () => {
    const measure = readSource(files.engineCoreMeasure);
    for (const fn of [
      'calculateCentroid',
      'calculateOffsetPoint',
      'calculateBounds',
      'calculateMidpoint',
      'calculatePerimeter',
      'planarDistance',
      'pointInPolygon',
      'snapToVertex',
      'snapToLine',
    ]) {
      expect(measure).toMatch(new RegExp(`export function ${fn}\\b`));
    }
  });
});

describe('surfaces consume the engine (io + react layers)', () => {
  test('project map: provider + engine-context-driven print controls', () => {
    const survey = readSource(files.surveyMap);
    expect(survey).toContain(`@/lib/surveyMapEngine/react/useSurveyMapEngine`);
    expect(survey).toMatch(/useSurveyMapEngine\(\)/);
    expect(survey).toMatch(/<SurveyMapEngineProvider printApi=\{printApi\}>/);
    expect(survey).not.toContain(`from '@/lib/export/exportMapPDF'`);
  });

  test('workspace map: mounts the provider and prints through the engine io surface', () => {
    const workspace = readSource(files.workspaceMap);
    expect(workspace).toContain(`@/lib/surveyMapEngine/react/SurveyMapEngineContext`);
    expect(workspace).toContain(`@/lib/surveyMapEngine/react/useSurveyMapEngine`);
    expect(workspace).toContain(`@/lib/surveyMapEngine/io/exportSurface`);
    expect(workspace).toMatch(/<SurveyMapEngineProvider printApi=\{printApi\}>/);
    expect(workspace).toMatch(/exportApi\.exportMapPDF\(/);
  });

  test('/map: provider + print entries from the Phase 5 print-flow hook', () => {
    const client = readSource(files.mapClient);
    expect(client).toMatch(/<SurveyMapEngineProvider printApi=\{printApi\}>/);
    expect(client).toContain(`@/lib/surveyMapEngine/io/printSurface`);
    const printFlow = readSource(files.useMapPrintFlow);
    expect(printFlow).toMatch(/print: handlePrintMap/);
    expect(printFlow).toMatch(/loadSheetLayout\(\)/);
  });
});

describe('MapClient is a composition root again (plan Phase 5)', () => {
  const extracted = [
    files.useSchemeLayers,
    files.useDigitizingTools,
    files.useTraverseParcelPreview,
    files.useGpsTracking,
    files.useProjectPoints,
    files.useMapPrintFlow,
  ];

  test('the behaviour clusters live in app/map/hooks', () => {
    for (const path of extracted) {
      expect(() => readSource(path)).not.toThrow();
    }
    const client = readSource(files.mapClient);
    for (const path of extracted) {
      expect(client).toContain(path.split('/').pop()!.replace('.ts', ''));
    }
  });

  test('MapClient is wiring + layout only (no OL geometry effects inline)', () => {
    const client = readSource(files.mapClient);
    // The digitizing-tool OL interaction effect, scheme loading, traverse
    // preview and GPS tracking moved out; none of their internals remain.
    expect(client).not.toContain("await import('ol/interaction/Draw')");
    expect(client).not.toContain('createTraversePolygonPreview');
    expect(client).not.toContain('derivePlanGeometryFromDrawSource');
    // The continuous geolocation subscription moved; the one-shot GPS read stays.
    expect(client).not.toContain("geolocation.on('change:position'");
  });

  test('MapClient shrank toward the composition-root target', () => {
    // Plan target was a thin composition root; the remaining bulk is imports,
    // context assembly and layout.
    expect(lineCount(files.mapClient)).toBeLessThan(1200);
  });
});

describe('/field adopts core services only (plan Phase 5)', () => {
  const fieldFiles = sources.filter(
    (s) => s.file.startsWith('src/app/field/') || s.file.startsWith('src/components/field/')
  );

  test('field sources never import the engine OL adapters', () => {
    const offenders = fieldFiles
      .filter((s) => s.text.includes('surveyMapEngine/ol/'))
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  test('field sources take engine services from core/ only', () => {
    const engineImports = fieldFiles
      .flatMap((s) => s.text.match(/@\/lib\/surveyMapEngine\/[a-z]+\/[A-Za-z]+/g) || [])
      .map((p) => p.split('/')[3]);
    expect(engineImports.every((dir) => dir === 'core')).toBe(true);
  });
});

describe('engine CRS guard rails (metardu rules, plan §3.3)', () => {
  test('engine stakeout/annotations take an explicit project CRS — no defaults', () => {
    expect(readSource(files.engineStakeout)).not.toMatch(/epsg: string = '/);
    expect(readSource(files.engineDrawAnnotations)).not.toMatch(/epsg = '/);
    expect(readSource(files.engineDrawAnnotations)).toMatch(/epsg: string/);
  });

  test('no engine module defaults a CRS or measures on EPSG:3857', () => {
    const engineDir = join(srcRoot, 'lib', 'surveyMapEngine');
    const engineFiles: Array<{ file: string; text: string }> = [];
    const collect = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') collect(full);
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
          engineFiles.push({
            file: full.slice(repoRoot.length + 1).split(sep).join('/'),
            text: readFileSync(full, 'utf8'),
          });
        }
      }
    };
    collect(engineDir);
    expect(engineFiles.length).toBeGreaterThan(5);
    for (const f of engineFiles) {
      expect(f.text).not.toMatch(/=\s*'EPSG:(21|326|327)\d{3}'/);
    }
  });
});
