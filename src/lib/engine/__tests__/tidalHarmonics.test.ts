import {
  analyzeTidalObservations,
  STANDARD_TIDAL_CONSTITUENTS,
} from '../tidalHarmonics';

describe('Tidal Harmonics Engine', () => {
  it('fits synthetic harmonics without claiming a tidal datum and requires an explicit reduction offset', () => {
    // Simulate Kilindini Harbour / Mombasa tidal regime:
    // Semidiurnal dominated, M2 = 1.25m, S2 = 0.55m, MSL = 2.10m
    const msl = 2.1;
    const m2Amp = 1.25;
    const s2Amp = 0.55;
    const k1Amp = 0.15;
    const o1Amp = 0.1;

    const frequency = (name: string) => {
      const entry = STANDARD_TIDAL_CONSTITUENTS.find(c => c.name === name)
      if (!entry) throw new Error('Missing synthetic constituent definition')
      return entry.cyclesPerHour
    }
    const m2Freq = frequency('M2');
    const s2Freq = frequency('S2');
    const k1Freq = frequency('K1');
    const o1Freq = frequency('O1');

    const observations = [];
    // Thirty days resolve these selected constituents; this is still synthetic.
    for (let t = 0; t <= 720; t += 1.0) {
      const tide =
        msl +
        m2Amp * Math.cos(2 * Math.PI * m2Freq * t) +
        s2Amp * Math.cos(2 * Math.PI * s2Freq * t) +
        k1Amp * Math.cos(2 * Math.PI * k1Freq * t) +
        o1Amp * Math.cos(2 * Math.PI * o1Freq * t);
      observations.push({ timeHours: t, waterLevelMeters: tide });
    }

    const result = analyzeTidalObservations(observations, ['M2', 'S2', 'K1', 'O1']);

    expect(result.fittedMeanMeters).toBeCloseTo(msl, 2);
    expect(result.status).toBe('diagnostic');
    expect(result).not.toHaveProperty('lowestAstronomicalTideMeters');
    expect(result.meanSpringRangeMeters).toBeCloseTo(2 * (m2Amp + s2Amp), 2); // 3.60m
    expect(result.meanNeapRangeMeters).toBeCloseTo(2 * (m2Amp - s2Amp), 2); // 1.40m
    expect(result.regime).toBe('semidiurnal'); // F = (0.15 + 0.10) / (1.25 + 0.55) = 0.138 < 0.25
    expect(result.rSquared).toBeGreaterThan(0.99);

    // Test sounding reduction:
    // Suppose at t = 6h, raw echo sounder reports 12.50m.
    // Reduced depth below LAT = raw depth - (tide - LAT)
    const predictedTide = result.predictTideHeight(6);
    const reduced = result.reduceSounding(6, 12.5, 0.2);
    const expectedReduced = 12.5 - (predictedTide - 0.2);
    expect(reduced).toBeCloseTo(expectedReduced, 4);
    expect(() => result.reduceSounding(6, 12.5, undefined as unknown as number)).toThrow();
    expect(() => result.predictTideHeight(721)).toThrow();
  });

  it('rejects unresolved constituents, bad samples and unknown names', () => {
    const short = Array.from({ length: 49 }, (_, timeHours) => ({ timeHours, waterLevelMeters: 2 }))
    expect(() => analyzeTidalObservations(short, ['M2', 'S2'])).toThrow(/resolve/)
    expect(() => analyzeTidalObservations(short, ['fake'])).toThrow(/known/)
    expect(() => analyzeTidalObservations(short.map(o => ({ ...o, waterLevelMeters: NaN })), ['M2'])).toThrow(/finite/)
  })
});
