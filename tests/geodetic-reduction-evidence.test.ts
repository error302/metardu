import { reduceGroundToGrid, approximateLatitudeFromNorthing } from '@/lib/engine/geodeticReduction';

describe('Geodetic Ground-to-Grid Reduction & Equatorial Geodesy', () => {
  // Typical Central Kenya station (Nairobi / Kiambu in UTM Zone 37S)
  const nairobiInput = {
    groundDistance: 1250.45,
    fromPoint: {
      easting: 254120.5,
      northing: 9860340.2, // ~1°15' S in UTM 37S
      elevation: 1680.0,
      geoidUndulation: -16.2,
    },
    toPoint: {
      easting: 255140.8,
      northing: 9861120.6,
      elevation: 1710.5,
      geoidUndulation: -16.2,
    },
    ellipsoid: 'clarke1880_modified' as const,
  };

  test('approximateLatitudeFromNorthing correctly computes southern hemisphere near equator', () => {
    // Northing 9,860,000 in Southern Hemisphere is ~140 km South of equator -> ~ -1.26 degrees
    const latRad = approximateLatitudeFromNorthing(9860000, 'S');
    const latDeg = (latRad * 180) / Math.PI;

    expect(latDeg).toBeLessThan(0); // Must be negative (South)
    expect(latDeg).toBeCloseTo(-1.2597, 2);
  });

  test('reduceGroundToGrid does not confuse southern hemisphere UTM with 88° North near North Pole', () => {
    const result = reduceGroundToGrid(nairobiInput);

    // Meridian convergence angle: gamma = (L - L0) * sin(phi)
    // In southern hemisphere at lat -1.25°, sin(phi) is ~ -0.022.
    // If lat was falsely ~88.7° N, sin(phi) was ~0.9997 (error by 45x!).
    // Absolute meridian convergence in degrees must be small (< 0.1°), NOT ~2.2°
    expect(Math.abs(result.gridConvergenceAngleDegrees)).toBeLessThan(0.15);
  });

  test('explicit hemisphere parameter overrides automatic inference', () => {
    const northernPoint = {
      groundDistance: 1000.0,
      fromPoint: { easting: 500000, northing: 200000, elevation: 500 },
      toPoint: { easting: 501000, northing: 200000, elevation: 500 },
      hemisphere: 'N' as const,
    };
    const resN = reduceGroundToGrid(northernPoint);
    expect(resN.calculationSteps.some((s) => s.includes('N') || s.includes('North'))).toBe(true);
  });

  test('does not silently fabricate -15.0m geoid undulation when unsupplied', () => {
    const noN = {
      groundDistance: 1000.0,
      fromPoint: { easting: 500000, northing: 9860000, elevation: 1500 },
      toPoint: { easting: 501000, northing: 9860000, elevation: 1500 },
      // geoidUndulation omitted
    };
    const res = reduceGroundToGrid(noN);

    // Must be 0 when unsupplied, NOT -15.0
    expect(res.meanGeoidUndulation).toBe(0);
    expect(res.ellipsoidalHeight).toBe(1500);
    expect(res.calculationSteps[1]).toMatch(/unsupplied|assumed zero/i);
  });
});
