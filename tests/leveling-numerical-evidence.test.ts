import { riseAndFall, heightOfCollimation } from '@/lib/engine/leveling';
import { runLevelingComputation, getLevelingClosureStatus } from '@/lib/compute/levelingRunner';
import { FieldBookRow } from '@/types/fieldbook';

describe('Leveling Numerical Evidence & Turning Point Sequence', () => {
  // Opening 100.0, BM BS 1.5, TP FS 2.0 / BS 1.0, close FS 0.5 -> TP 99.5, Final 100.0
  const sampleReadings = [
    { station: 'BM1', bs: 1.5 },
    { station: 'TP1', fs: 2.0, bs: 1.0 },
    { station: 'BM2', fs: 0.5 },
  ];

  test('Height of Collimation evaluates TP FS before BS to establish correct TP RL and new HI', () => {
    const result = heightOfCollimation({
      readings: sampleReadings,
      openingRL: 100.0,
      closingRL: 100.0,
      method: 'height_of_collimation',
      distanceKm: 0.5,
    });

    const tpRow = result.readings.find((r) => r.station === 'TP1');
    const closeRow = result.readings.find((r) => r.station === 'BM2');

    expect(tpRow).toBeDefined();
    // Old HI = 100.0 + 1.5 = 101.5
    // TP RL = 101.5 - 2.0 (FS) = 99.5
    expect(tpRow?.reducedLevel).toBeCloseTo(99.5, 4);
    // New HI = 99.5 + 1.0 (BS) = 100.5
    // Final RL = 100.5 - 0.5 (FS) = 100.0
    expect(closeRow?.reducedLevel).toBeCloseTo(100.0, 4);
    expect(result.misclosure).toBeCloseTo(0.0, 4);
    expect(result.arithmeticCheck).toBe(true);
    expect(result.isAcceptable).toBe(true);
  });

  test('Rise and Fall evaluates TP FS before BS to establish correct TP RL and final RL', () => {
    const result = riseAndFall({
      readings: sampleReadings,
      openingRL: 100.0,
      closingRL: 100.0,
      method: 'rise_and_fall',
      distanceKm: 0.5,
    });

    const tpRow = result.readings.find((r) => r.station === 'TP1');
    const closeRow = result.readings.find((r) => r.station === 'BM2');

    expect(tpRow).toBeDefined();
    expect(tpRow?.reducedLevel).toBeCloseTo(99.5, 4);
    expect(closeRow?.reducedLevel).toBeCloseTo(100.0, 4);
    expect(result.misclosure).toBeCloseTo(0.0, 4);
    expect(result.arithmeticCheck).toBe(true);
    expect(result.isAcceptable).toBe(true);
  });

  test('Zero readings for BS, IS, or FS are accepted and not dropped or treated as missing', () => {
    const zeroReadings = [
      { station: 'BM1', bs: 0.0 },
      { station: 'IS1', is: 0.0 },
      { station: 'BM2', fs: 0.0 },
    ];
    const result = heightOfCollimation({
      readings: zeroReadings,
      openingRL: 50.0,
      closingRL: 50.0,
      method: 'height_of_collimation',
      distanceKm: 0.1,
    });

    expect(result.readings.find((r) => r.station === 'IS1')?.reducedLevel).toBeCloseTo(50.0, 4);
    expect(result.readings.find((r) => r.station === 'BM2')?.reducedLevel).toBeCloseTo(50.0, 4);
    expect(result.misclosure).toBeCloseTo(0.0, 4);
    expect(result.arithmeticCheck).toBe(true);
  });

  test('Repeated station IDs maintain correct sequence without cross-contaminating earlier setups', () => {
    const repeated = [
      { station: 'STA1', bs: 1.0 },
      { station: 'STA2', fs: 1.5, bs: 2.0 },
      { station: 'STA1', fs: 1.5 }, // Instrument re-observes STA1
    ];
    const result = heightOfCollimation({
      readings: repeated,
      openingRL: 100.0,
      method: 'height_of_collimation',
    });

    // Setup 1: HI = 100 + 1.0 = 101.0
    // STA2: RL = 101.0 - 1.5 = 99.5
    // Setup 2 at STA2: HI = 99.5 + 2.0 = 101.5
    // STA1 second visit: RL = 101.5 - 1.5 = 100.0
    const rowsSTA1 = result.readings.filter((r) => r.station === 'STA1');
    expect(rowsSTA1.length).toBe(2);
    expect(rowsSTA1[0].reducedLevel).toBeCloseTo(100.0, 4);
    expect(rowsSTA1[1].reducedLevel).toBeCloseTo(100.0, 4);
  });

  test('Missing distanceKm or missing closing RL cannot fabricate acceptable closure', () => {
    const noDistance = riseAndFall({
      readings: sampleReadings,
      openingRL: 100.0,
      closingRL: 100.0,
      method: 'rise_and_fall',
      // distanceKm not provided
    });
    expect(noDistance.allowableMisclosure).toBeUndefined();
    expect(noDistance.isAcceptable).toBe(false);

    const noCloseBM = riseAndFall({
      readings: sampleReadings,
      openingRL: 100.0,
      method: 'rise_and_fall',
      distanceKm: 1.0,
    });
    expect(noCloseBM.closingRLProvided).toBe(false);
    expect(noCloseBM.isAcceptable).toBe(false);
  });

  test('levelingRunner rejects non-numeric non-blank cells with station and column message', () => {
    const badRows: FieldBookRow[] = [
      { station: 'BM1', bs: '1.5' },
      { station: 'TP1', fs: 'abc', bs: '1.0' },
      { station: 'BM2', fs: '0.5' },
    ];
    expect(() =>
      runLevelingComputation({
        rows: badRows,
        openingRL: 100.0,
        closingRL: 100.0,
        method: 'height_of_collimation',
      })
    ).toThrow(/Invalid non-numeric value "abc" at station "TP1", column "FS"/i);
  });

  test('levelingRunner does not convert empty/null chainage cells to zero when calculating span', () => {
    const rowsWithBlankChainages: FieldBookRow[] = [
      { station: 'BM1', bs: '1.5', chainage: '' },
      { station: 'TP1', fs: '2.0', bs: '1.0', chainage: null },
      { station: 'BM2', fs: '0.5', chainage: '500' },
    ];
    // Since only one row has chainage, distance cannot be inferred, must not convert blanks to 0 and infer 500m
    const result = runLevelingComputation({
      rows: rowsWithBlankChainages,
      openingRL: 100.0,
      closingRL: 100.0,
      method: 'height_of_collimation',
    });
    const status = getLevelingClosureStatus(result);
    // Should be unverified because route length is unknown
    expect(status.status).toBe('unknown');
  });
});
