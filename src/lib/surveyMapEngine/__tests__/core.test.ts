/**
 * Phase 1 characterization tests (plan §3.1 / F2 / F6).
 *
 * Move-then-shim: the old paths must expose the exact same functions and
 * outputs as core, the deprecated CRS-less math must fail closed in
 * dev/test, and the format service must keep byte-identical output.
 */
/**
 * Phase 1 characterization tests (plan §3.1 / F2 / F6).
 *
 * Phase 5: shim parity suites were removed when the legacy re-export shims
 * were deleted (see phase5Wiring for the consumer re-point greps). Remaining
 * suites pin the engine single-implementation of format/visit helpers and
 * the CRS authority behavior directly.
 */
import * as coreMeasure from '@/lib/surveyMapEngine/core/measure';
import * as geodesy from '@/lib/geodesy/coordinates';
import * as gnss from '@/lib/gnss/coordinates';
import {
  formatArea,
  formatBearingAzimuth,
  formatBearingWCB,
  formatCoordinate,
  formatDistance,
  formatGridPoint,
  formatPoint,
  latLonToString,
  squareMetersToHectares,
} from '@/lib/surveyMapEngine/core/format';
import { isValidMapExtent } from '@/lib/surveyMapEngine/core/extent';
import { CrsError, surveyDistance } from '@/lib/spatial/projectCrs';

describe('engine canonical implementations (plan Phase 1, shims deleted Phase 5)', () => {
  test('core.measure planar helpers live here (migrated from lib/map/measurements)', () => {
    expect(typeof coreMeasure.polylineLengthInCrs).toBe('function');
    expect(typeof coreMeasure.polygonAreaInCrs).toBe('function');
    expect(typeof coreMeasure.polygonPerimeterInCrs).toBe('function');
    expect(typeof coreMeasure.endpointsBearingInCrs).toBe('function');
    expect(typeof coreMeasure.calculateCentroid).toBe('function');
    expect(typeof coreMeasure.calculateOffsetPoint).toBe('function');
    expect(coreMeasure.calculateCentroid([
      { easting: 0, northing: 0 },
      { easting: 2, northing: 2 },
    ])).toEqual({ easting: 1, northing: 1 });
    expect(coreMeasure.planarDistance({ easting: 0, northing: 0 }, { easting: 3, northing: 4 })).toBe(5);
    // deprecated CRS-less bodies are gone, not silently re-added under the same name:
    expect('calculateDistance' in coreMeasure).toBe(false);
    expect('calculateBearing' in coreMeasure).toBe(false);
    expect('calculateArea' in coreMeasure).toBe(false);
  });

  test('deprecated CRS-less math is enforced by the CRS authority, not by legacy stubs', () => {
    expect(() => surveyDistance(0, 0, 1, 1, 'EPSG:3857')).toThrow(CrsError);
  });

  test('gnss.formatCoordinate wraps core.formatGridPoint with identical output', () => {
    const coord = { easting: 123.4567, northing: -789.012 };
    expect(gnss.formatCoordinate(coord, 3)).toBe(formatGridPoint(coord, 3));
    expect(gnss.formatCoordinate(coord, 3)).toBe('E 123.457  N -789.012');
  });

  test('latLonToString is the single geodesy implementation', () => {
    expect(latLonToString).toBe(geodesy.latLonToString);
  });
});

describe('format service output (plan F6)', () => {
  test('grid numbers and E–N pair (grouped, authority impl)', () => {
    expect(formatCoordinate(276443.215, 3)).toBe('276,443.215');
    expect(formatCoordinate(-1234.567, 2)).toBe('-1,234.57');
    expect(formatCoordinate(Number.NaN, 3)).toBe('—');
    expect(formatPoint(276443.215, 9950000, 3)).toBe(
      'E 276,443.215   N 9,950,000.000',
    );
  });

  test('metric result formats (moved from lib/map/measurements)', () => {
    expect(formatBearingWCB(45)).toBe(`N 45°00'00" E`);
    expect(formatDistance(1500, 3)).toBe('1.500 km');
    expect(formatDistance(12.345, 3)).toBe('12.345 m');
    expect(formatArea(5000)).toBe('5000.0 m²');
    expect(formatArea(25000)).toBe('2.5000 ha');
    expect(formatArea(150000)).toBe('15.0000 ha');
    expect(formatArea(1500000)).toBe('150.00 ha');
  });
});

describe('deprecated CRS-less math (plan F2) — removed with the Phase 5 shim deletion', () => {
  test('lib/map/measurements.ts no longer exists; CRS-less calculate* are gone', () => {
    // Pinned by singleImplementation + phase5Wiring greps; nothing may call
    // surveyDistance/surveyBearing/surveyArea with display CRS either.
    expect(() => surveyDistance(4089000, -145000, 4089340, -144640, 'EPSG:3857')).toThrow(/EPSG:3857|CRS|crs/i);
  });
});

describe('core/extent (plan §3.1)', () => {
  test('isValidMapExtent accepts the shared shape and rejects bad boxes', () => {
    expect(isValidMapExtent({ minLat: -1, minLon: 36, maxLat: 0, maxLon: 37 })).toBe(true);
    expect(isValidMapExtent({ minLat: 1, minLon: 36, maxLat: 0, maxLon: 37 })).toBe(false);
    expect(isValidMapExtent({ minLat: -91, minLon: 36, maxLat: 0, maxLon: 37 })).toBe(false);
    expect(isValidMapExtent(null)).toBe(false);
  });
});
