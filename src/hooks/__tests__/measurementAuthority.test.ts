/**
 * Phase 0 characterization tests (plan F1).
 *
 * The interactive measurement hook must produce the same numbers as the
 * authority path used by /map (`measureMath` → `@/lib/spatial/projectCrs`),
 * must differ from raw Web-Mercator planar math, and must fail closed when
 * the CRS is undeclared or not survey-grade.
 */
import {
  measurementArea,
  measurementBearing,
  measurementDistance,
  measurementPointFromDisplay,
} from '@/hooks/useMeasurement';
import {
  endpointsBearingInCrs,
  polygonAreaInCrs,
  polylineLengthInCrs,
} from '@/lib/surveyMapEngine/core/measure';
import { CrsError, toDisplay } from '@/lib/spatial/projectCrs';

const CRS = 'EPSG:21037';

// Nairobi-area display-CRS (EPSG:3857) points ~500 m apart.
const A3857: [number, number] = [4089000, -145000];
const B3857: [number, number] = [4089340, -144640];

// Closed 300 m × 300 m display-CRS square ring (Nairobi area).
const RING3857: Array<[number, number]> = [
  [4089000, -145000],
  [4089300, -145000],
  [4089300, -144700],
  [4089000, -144700],
  [4089000, -145000],
];

describe('useMeasurement authority math (plan F1)', () => {
  test('distance equals the /map authority path (measureMath)', () => {
    const expected = polylineLengthInCrs([A3857, B3857], CRS);
    const a = measurementPointFromDisplay(A3857[0], A3857[1], CRS);
    const b = measurementPointFromDisplay(B3857[0], B3857[1], CRS);
    const actual = measurementDistance(a, b, CRS);
    expect(actual).toBeCloseTo(expected, 9);
    expect(actual).toBeGreaterThan(400);
    expect(actual).toBeLessThan(600);
  });

  test('area equals the /map authority path (measureMath)', () => {
    const expected = polygonAreaInCrs(RING3857, CRS);
    const ring = RING3857.map(([x, y]) => measurementPointFromDisplay(x, y, CRS));
    const actual = measurementArea(ring, CRS);
    expect(actual).toBeCloseTo(expected, 6);
    expect(actual).toBeGreaterThan(70000);
    expect(actual).toBeLessThan(100000);
  });

  test('bearing equals the /map authority path (measureMath)', () => {
    const expected = endpointsBearingInCrs([A3857, B3857], CRS);
    if (expected === null) throw new Error('authority bearing returned null');
    const a = measurementPointFromDisplay(A3857[0], A3857[1], CRS);
    const b = measurementPointFromDisplay(B3857[0], B3857[1], CRS);
    const actual = measurementBearing(a, b, CRS);
    expect(actual).toBeCloseTo(expected, 9);
  });

  test('differs from raw Web-Mercator planar distance (never measure in EPSG:3857)', () => {
    const raw = Math.hypot(B3857[0] - A3857[0], B3857[1] - A3857[1]);
    const a = measurementPointFromDisplay(A3857[0], A3857[1], CRS);
    const b = measurementPointFromDisplay(B3857[0], B3857[1], CRS);
    const grid = measurementDistance(a, b, CRS);
    expect(Math.abs(grid - raw)).toBeGreaterThan(0.05);
  });

  test('click conversion round-trips through the display CRS', () => {
    const p = measurementPointFromDisplay(A3857[0], A3857[1], CRS);
    const [x, y] = toDisplay(p.easting, p.northing, CRS);
    // proj4 datum round-trip noise stays sub-millimetre (0.6 mm max measured).
    expect(Math.abs(x - A3857[0])).toBeLessThan(0.001);
    expect(Math.abs(y - A3857[1])).toBeLessThan(0.001);
  });

  test('fails closed for the display CRS (Web Mercator is not a survey CRS)', () => {
    const p = measurementPointFromDisplay(A3857[0], A3857[1], CRS);
    expect(() => measurementDistance(p, p, 'EPSG:3857')).toThrow(CrsError);
  });

  test('fails closed for an unregistered CRS (never guess a datum)', () => {
    const p = measurementPointFromDisplay(A3857[0], A3857[1], CRS);
    expect(() => measurementDistance(p, p, 'EPSG:9999')).toThrow(CrsError);
  });
});
