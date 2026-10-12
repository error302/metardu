/**
 * Phase 0 source-contract tests (plan F3/F4).
 *
 * Static regression guards: silent CRS defaults and hard-coded zone helpers
 * must not creep back. These read the sources directly so refactors cannot
 * quietly re-introduce the defects the plan closes.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const repoRoot = join(__dirname, '..', '..', '..', '..');
const read = (relPath: string): string => readFileSync(join(repoRoot, relPath), 'utf8');

describe('no silent CRS defaults (plan F3/F4)', () => {
  test('projection.ts: no defaulted fromSrid, no hard-coded to21037/to21036', () => {
    const src = read('src/lib/map/projection.ts');
    expect(src).not.toMatch(/fromSrid:\s*string\s*=/);
    expect(src).not.toMatch(/export async function to21037/);
    expect(src).not.toMatch(/export async function to21036/);
    expect(src).toMatch(/export async function toProjectCrs/);
  });

  test('WorkspaceMap.tsx: epsg has no default', () => {
    const src = read('src/components/workspace/WorkspaceMap.tsx');
    expect(src).not.toMatch(/epsg\s*=\s*'EPSG/);
  });

  test('SurveyMap.tsx: epsg has no default', () => {
    const src = read('src/components/map/SurveyMap.tsx');
    expect(src).not.toMatch(/epsg\s*=\s*'EPSG/);
  });

  test('qaOverlays.ts (moved gridOverlay): updateGridOverlay epsg has no default', () => {
    const src = read('src/lib/surveyMapEngine/ol/qaOverlays.ts');
    expect(src).toMatch(/epsg:\s*string/);
    expect(src).not.toMatch(/epsg:\s*string\s*=/);
  });

  test('SheetLayout.tsx: epsg prop has no default', () => {
    const src = read('src/components/map/SheetLayout.tsx');
    expect(src).not.toMatch(/epsg\s*=\s*'EPSG/);
    expect(src).toMatch(/epsg:\s*string/);
  });

  test('useVertexEditing.ts: epsg option has no default', () => {
    const src = read('src/hooks/useVertexEditing.ts');
    expect(src).not.toMatch(/epsg\s*=\s*'EPSG/);
    expect(src).toMatch(/epsg:\s*string/);
  });
});

describe('measurement uses the authority path (plan F1)', () => {
  test('useMeasurement.ts: authority math only, no CRS-less calculate*', () => {
    const src = read('src/hooks/useMeasurement.ts');
    expect(src).not.toMatch(/calculate(Distance|Area|Bearing)\b/);
    expect(src).toMatch(/surveyDistance/);
    expect(src).toMatch(/surveyArea/);
    expect(src).toMatch(/surveyBearing/);
    expect(src).toMatch(/fromDisplay/);
    expect(src).toMatch(/toDisplay/);
  });

  test('MeasurementTool.tsx: passes an explicit crs into useMeasurement', () => {
    const src = read('src/components/map/MeasurementTool.tsx');
    expect(src).not.toMatch(/useMeasurement\(map\)/);
    expect(src).toMatch(/useMeasurement\(map,\s*crs\)/);
    expect(src).toMatch(/crs:\s*string\s*\|\s*null/);
  });
});
