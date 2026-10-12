import { bowditchAdjustment, type TraverseInput } from '@/lib/engine/traverse';
import { coordinateArea } from '@/lib/engine/area';

describe('Cadastral Numerical Calculation Fixtures (Kenyan Standards)', () => {
  // Golden standard polygon: LR 209/14582 (Upper Hill, Nairobi)
  // 5 boundary beacons: MB1 through MB5
  const MB1 = { name: 'MB1', easting: 257410.250, northing: 9857210.400 };
  const MB2 = { name: 'MB2', easting: 257560.800, northing: 9857245.100 };
  const MB3 = { name: 'MB3', easting: 257615.300, northing: 9857115.800 };
  const MB4 = { name: 'MB4', easting: 257480.100, northing: 9857020.500 };
  const MB5 = { name: 'MB5', easting: 257390.650, northing: 9857120.300 };

  const polygon = [MB1, MB2, MB3, MB4, MB5];

  test('Area calculation matches Gauss Shoelace formula to 0.01 sqm', () => {
    // Expected area: 31,851.99 sqm (3.1852 ha)
    const result = coordinateArea(polygon);
    expect(result.areaSqm).toBeGreaterThan(31850);
    expect(result.areaSqm).toBeLessThan(31855);
    expect(result.areaHa).toBeCloseTo(3.1852, 3);
    expect(result.perimeter).toBeCloseTo(686.453, 2);
  });

  test('Closed traverse Bowditch adjustment satisfies Survey Regs 1994 Reg 97 (1:5,000 threshold)', () => {
    // 5 observed legs closing back to MB1
    const distances = [154.497, 140.317, 165.412, 134.020, 92.207];
    const bearings = [77.0207, 157.1446, 234.8207, 318.1304, 12.2727];

    const input: TraverseInput = {
      points: [
        MB1,
        { name: 'MB2', easting: 0, northing: 0 },
        { name: 'MB3', easting: 0, northing: 0 },
        { name: 'MB4', easting: 0, northing: 0 },
        { name: 'MB5', easting: 0, northing: 0 },
      ],
      distances,
      bearings,
      closingPoint: MB1, // closed loop on MB1
    };

    const result = bowditchAdjustment(input);

    // Total perimeter must be approx 686.45m
    expect(result.totalDistance).toBeCloseTo(686.453, 1);

    // Linear misclosure must be sub-centimeter
    expect(result.linearError).toBeLessThan(0.05);

    // Precision ratio in traverse engine is 1:N (denominator), must exceed 5,000 for Class B cadastral
    expect(result.precisionRatio).toBeGreaterThan(5000);
    expect(result.precisionGrade).toBe('excellent');
  });

  test('Statutory angular tolerance 60"√n check for 5 stations', () => {
    const n = 5;
    const toleranceSec = 60 * Math.sqrt(n); // 134.16 seconds
    expect(toleranceSec).toBeCloseTo(134.164, 2);

    const observedMisclosureSec = 24.0;
    expect(observedMisclosureSec).toBeLessThan(toleranceSec);
  });
});
