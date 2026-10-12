import { getLevelingClosureStatus, runLevelingComputation } from '@/lib/compute/levelingRunner';
import { riseAndFall } from '@/lib/engine/leveling';
import { applyAutoCalculations } from '@/lib/workflows/autoCalculate';
import { computeCutFillVolume } from '@/lib/compute/volumeRunner';
import { compareEpochs } from '@/lib/survey/deformationMonitoring';

describe('non-cadastral survey computation evidence', () => {
  it('keeps zero readings and reports an unverified closure without a closing benchmark', () => {
    const result = runLevelingComputation({
      openingRL: 0,
      rows: [
        { station: 'BM1', bs: 1.25, rl: 0, chainage: 0 },
        { station: 'TP1', fs: 0.75, chainage: 50 },
        { station: 'TP1', bs: 0, chainage: 50 },
        { station: 'BM2', fs: 0.5, chainage: 100 },
      ],
      method: 'rise_and_fall',
    });

    expect(result.readings.some((row) => row.bs === 0)).toBe(true);
    expect(result.closingRLProvided).toBe(false);
    expect(getLevelingClosureStatus(result)).toMatchObject({ status: 'unknown' });
  });

  it('uses the surveyed chainage span for the allowable closure', () => {
    const result = runLevelingComputation({
      openingRL: 100,
      closingRL: 100,
      rows: [
        { station: 'BM1', bs: 1.2, chainage: 0 },
        { station: 'BM2', fs: 1.2, chainage: 2500 },
      ],
      method: 'rise_and_fall',
    });

    expect(result.allowableMisclosure).toBeCloseTo(0.015811, 6);
    expect(getLevelingClosureStatus(result).status).toBe('acceptable');
  });

  it('does not fabricate an opening benchmark in the engineering field book', () => {
    const rows = applyAutoCalculations('engineering', [
      { station: 'BM1', bs: '1.25', rl: '' },
      { station: 'TP1', fs: '0.75', rl: '' },
    ], 0);

    expect(rows[0].hpc).toBeUndefined();
    expect(rows[1].rl).toBe('');
  });

  it('accepts an explicit zero opening RL', () => {
    const rows = applyAutoCalculations('engineering', [
      { station: 'BM1', bs: '1.25', rl: '0' },
      { station: 'TP1', fs: '0.75', rl: '' },
    ], 0);

    expect(rows[0].hpc).toBe(1.25);
    expect(rows[1].rl).toBeCloseTo(0.5, 8);
  });

  it('does not emit Infinity for a vertical tacheometric sight', () => {
    const rows = applyAutoCalculations('topographic', [
      { point_no: 'P1', hd: '10', va: '90', rl: '100' },
    ], 0);

    expect(rows[0].rl).toBe('100');
  });

  it('calculates engineering HPC at turning points from the TP reduced level, not opening BM', () => {
    const rows = applyAutoCalculations('engineering', [
      { station: 'BM1', bs: '1.5', rl: '100.0' },
      { station: 'TP1', fs: '2.5', bs: '1.0', rl: '' },
      { station: 'BM2', fs: '0.5', rl: '' },
    ], 1);

    // Setup 1: HPC = 100.0 + 1.5 = 101.5
    expect(rows[0].hpc).toBeCloseTo(101.5, 6);
    // TP1: RL = 101.5 - 2.5 = 99.0
    expect(rows[1].rl).toBeCloseTo(99.0, 6);
    // Setup 2 at TP1: HPC = 99.0 + 1.0 = 100.0 (NOT 100.0 + 1.0 = 101.0!)
    expect(rows[1].hpc).toBeCloseTo(100.0, 6);
    // BM2: RL = 100.0 - 0.5 = 99.5
    expect(rows[2].rl).toBeCloseTo(99.5, 6);
  });

  it('prevents compounding elevation drift when topographic fieldbook is repeatedly re-evaluated', () => {
    // Setup: Station STN1 has RL 100. Sight to P1 with HD 10m, zenith angle 85° (+5° elevation).
    // Delta Z = 10 * tan(5°) = 0.8748866 m -> RL = 100.8748866 m.
    const initialRows = [
      { point_no: 'P1', hd: '10', va: '85', rl: '100' },
    ];
    const pass1 = applyAutoCalculations('topographic', initialRows, 0);
    const pass1RL = pass1[0].rl;
    expect(pass1RL).toBeCloseTo(100.8748866, 4);

    // Simulating user editing a second row: pass1 is re-evaluated
    const pass2 = applyAutoCalculations('topographic', pass1, 0);
    expect(pass2[0].rl).toBeCloseTo(pass1RL, 6); // Must not drift!
  });

  it('computes signed cut and fill sections for an engineering quantity check', () => {
    const result = computeCutFillVolume([
      { chainage: 0, area: 10 },
      { chainage: 30, area: -10 },
    ]);

    expect(result.cutVolume).toBeCloseTo(75, 8);
    expect(result.fillVolume).toBeCloseTo(75, 8);
    expect(result.netVolume).toBeCloseTo(0, 8);
  });

  it('marks a supplied closing benchmark as evidence-backed', () => {
    const result = riseAndFall({
      openingRL: 100,
      closingRL: 100,
      distanceKm: 1,
      method: 'rise_and_fall',
      readings: [{ station: 'BM1', bs: 1 }, { station: 'BM2', fs: 1 }],
    });

    expect(result.closingRLProvided).toBe(true);
    expect(getLevelingClosureStatus(result).status).toBe('acceptable');
  });

  it('rejects invalid deformation tolerances instead of producing misleading alerts', () => {
    expect(() => compareEpochs(
      { label: 'E0', epoch: 2024, monuments: [] },
      { label: 'E1', epoch: 2025, monuments: [] },
      { horizontal: 0 },
    )).toThrow('tolerances must be finite positive');
  });
});
