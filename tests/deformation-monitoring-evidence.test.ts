import { compareEpochs, MonumentObservation } from '@/lib/survey/deformationMonitoring';

describe('Deformation Monitoring Statistical & Engineering Evidence', () => {
  const basePoint: MonumentObservation = {
    monumentId: 'DM-01',
    latitude: -1.28333,
    longitude: 36.81667,
    height: 1680.0,
    frame: 'ITRF2014',
    epoch: 2024.0,
    sigmaE: 0.001, // 1 mm sigma
    sigmaN: 0.001, // 1 mm sigma
    sigmaH: 0.001, // 1 mm sigma
  };

  test('safely handles numeric or untrimmed monument IDs', () => {
    const epoch0 = {
      label: 'Epoch 0',
      epoch: 2024.0,
      monuments: [{ ...basePoint, monumentId: 101 as unknown as string }],
    };
    const epoch1 = {
      label: 'Epoch 1',
      epoch: 2025.0,
      monuments: [{ ...basePoint, monumentId: 101 as unknown as string }],
    };

    expect(() =>
      compareEpochs({
        baseline: epoch0,
        current: epoch1,
        tolerance: { horizontal: 0.005, vertical: 0.003 },
      })
    ).not.toThrow();
  });

  test('detects directional horizontal movement without sqrt(2) dilution', () => {
    // 3 mm movement strictly in East direction. With sigmaE_comb = sqrt(1^2 + 1^2) = 1.414 mm,
    // Mahalanobis distance = 3 / 1.414 = 2.12 (or for 3.5mm: 3.5 / 1.414 = 2.47 > critical 2.45).
    // In the old diluted code: 3.5 / sqrt(1.414^2 + 1.414^2) = 3.5 / 2 = 1.75 < 2.45 (failed to detect!).
    const deltaLonMeters = 0.0035; // 3.5 mm east
    const deltaLonDeg = (deltaLonMeters / (6371000 * Math.cos(-1.28333 * Math.PI / 180))) * (180 / Math.PI);

    const epoch0 = {
      label: 'Epoch 0',
      epoch: 2024.0,
      monuments: [basePoint],
    };
    const epoch1 = {
      label: 'Epoch 1',
      epoch: 2024.0,
      monuments: [{ ...basePoint, longitude: basePoint.longitude + deltaLonDeg }],
    };

    const report = compareEpochs({
      baseline: epoch0,
      current: epoch1,
      tolerance: { horizontal: 0.005, vertical: 0.003 },
      confidenceLevel: 0.95,
    });

    const vec = report.vectors[0];
    expect(vec.isSignificant).toBe(true);
    expect(vec.significance?.testStatistic).toBeGreaterThanOrEqual(2.45);
  });

  test('detects statistically significant vertical subsidence even with zero horizontal movement', () => {
    // 4 mm subsidence with sigmaH = 1mm each -> combined sigmaH = 1.414 mm.
    // Normalized vertical test stat = 4 / 1.414 = 2.83 > critical 1.96 (p < 0.05).
    const epoch0 = {
      label: 'Epoch 0',
      epoch: 2024.0,
      monuments: [basePoint],
    };
    const epoch1 = {
      label: 'Epoch 1',
      epoch: 2024.0,
      monuments: [{ ...basePoint, height: basePoint.height - 0.004 }], // 4mm down
    };

    const report = compareEpochs({
      baseline: epoch0,
      current: epoch1,
      tolerance: { horizontal: 0.005, vertical: 0.003 }, // 3mm vertical tolerance exceeded!
      confidenceLevel: 0.95,
    });

    const vec = report.vectors[0];
    expect(vec.exceedsTolerance).toBe(true);
    expect(vec.isSignificant).toBe(true);
    expect(report.alerts.length).toBeGreaterThan(0);
    expect(report.verdict).toBe('DEFORMING');
  });

  test('does not declare STABLE when movement exceeds tolerance even if noise is high', () => {
    // Movement is 10mm (tolerance is 5mm), but sigma is 15mm (noisy).
    // Should NOT be silently declared 'STABLE'.
    const noisyPoint: MonumentObservation = {
      ...basePoint,
      sigmaE: 0.015,
      sigmaN: 0.015,
    };
    const deltaLonMeters = 0.010; // 10 mm
    const deltaLonDeg = (deltaLonMeters / (6371000 * Math.cos(-1.28333 * Math.PI / 180))) * (180 / Math.PI);

    const epoch0 = { label: 'Epoch 0', epoch: 2024.0, monuments: [noisyPoint] };
    const epoch1 = { label: 'Epoch 1', epoch: 2024.0, monuments: [{ ...noisyPoint, longitude: noisyPoint.longitude + deltaLonDeg }] };

    const report = compareEpochs({
      baseline: epoch0,
      current: epoch1,
      tolerance: { horizontal: 0.005, vertical: 0.003 },
      confidenceLevel: 0.95,
    });

    expect(report.verdict).not.toBe('STABLE');
    expect(report.alerts.length).toBeGreaterThan(0);
  });
});
