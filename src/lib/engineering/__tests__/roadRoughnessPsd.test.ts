import { analyzeRoadProfileRoughness } from '../roadRoughnessPsd';

describe('Road profile diagnostic PSD', () => {
  it('reports profile evidence while withholding unvalidated ISO and IRI claims', () => {
    // 256 points at 0.25m interval = 64m profile
    const dx = 0.25;
    const n = 256;
    const elevations: number[] = [];

    // Smooth road with minimal millimetre-level undulations
    for (let i = 0; i < n; i++) {
      const x = i * dx;
      const z = 1200.0 + 0.002 * Math.sin((2 * Math.PI * x) / 20.0);
      elevations.push(z);
    }

    const result = analyzeRoadProfileRoughness(elevations, dx);

    expect(result.isoClass).toBeNull();
    expect(result.rideQuality).toBeNull();
    expect(result.estimatedIriMPerKm).toBeNull();
    expect(result.status).toBe('diagnostic');
    expect(result.hasCorrugations).toBe(false);
  });

  it('detects concentrated corrugation wavelengths without assigning a compliance class', () => {
    const dx = 0.1; // 10cm sampling
    const n = 256;
    const elevations: number[] = [];

    // Severe corrugations / washboarding with wavelength = 0.8m and amplitude = 0.08m (8cm)
    for (let i = 0; i < n; i++) {
      const x = i * dx;
      const z = 1200.0 + 0.08 * Math.sin((2 * Math.PI * x) / 0.8);
      elevations.push(z);
    }

    const result = analyzeRoadProfileRoughness(elevations, dx);

    expect(result.hasCorrugations).toBe(true);
    expect(result.corrugationWavelengthMeters).toBeCloseTo(0.8, 1);
    expect(result.isoClass).toBeNull();
    expect(result.wavelengthBands.find((b) => b.band === 'short')?.percentageOfTotal).toBeGreaterThan(40);
  });

  it('removes a straight road grade and leaves unresolved reference density unavailable', () => {
    const grade = Array.from({ length: 64 }, (_, i) => 100 + 0.01 * i)
    expect(analyzeRoadProfileRoughness(grade, 0.25).psd.totalPower).toBeLessThan(1e-20)
    expect(analyzeRoadProfileRoughness(grade.slice(0, 8), 0.25).roughnessCoefficientG0).toBeNull()
    expect(analyzeRoadProfileRoughness(grade, 10).roughnessCoefficientG0).toBeNull()
    expect(() => analyzeRoadProfileRoughness(grade, NaN)).toThrow()
  })
});
