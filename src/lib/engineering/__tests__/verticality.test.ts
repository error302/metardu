/**
 * Setting-out judgements (blueprint §27: DESIGN / MEASURED / DELTA / TOLERANCE /
 * STATUS, one model rather than one per module).
 *
 * These are safety judgements, so the tests pin the cases that matter on site:
 * a shot that is dead on target, a shot that misses, and — most importantly —
 * a fix too coarse or a missing level reading that cannot prove the target.
 */
import {
  DEFAULT_SETOUT_TOLERANCE,
  DEFAULT_VERTICALITY_STANDARD,
  evaluateSetoutShot,
  evaluateVerticality,
  formatTiltRatio,
} from '../verticality';

describe('as-staked shot evaluation', () => {
  const design = { designE: 500000, designN: 9860000, designZ: 100.5 };

  test('a shot on the design point passes', () => {
    const result = evaluateSetoutShot({
      ...design,
      observedE: design.designE,
      observedN: design.designN,
      observedZ: design.designZ,
    });
    expect(result.dE).toBeCloseTo(0, 6);
    expect(result.horizontalErrorM).toBeCloseTo(0, 6);
    expect(result.result).toBe('PASS');
  });

  test('deltas are observed minus design, with a signed level difference', () => {
    const result = evaluateSetoutShot({
      ...design,
      observedE: design.designE + 0.02,
      observedN: design.designN - 0.01,
      observedZ: design.designZ - 0.03,
    });
    expect(result.dE).toBeCloseTo(0.02, 6);
    expect(result.dN).toBeCloseTo(-0.01, 6);
    expect(result.dZ).toBeCloseTo(-0.03, 6);
    expect(result.horizontalErrorM).toBeCloseTo(Math.hypot(0.02, 0.01), 6);
    expect(result.result).not.toBe('PASS');
  });

  test('movement corrections reverse the measured deltas in grid coordinates', () => {
    const result = evaluateSetoutShot({
      ...design,
      observedE: design.designE + 0.02,
      observedN: design.designN - 0.01,
      observedZ: design.designZ - 0.03,
    });

    expect(result.moveE).toBeCloseTo(-result.dE, 9);
    expect(result.moveN).toBeCloseTo(-result.dN, 9);
    expect(result.moveZ).toBeCloseTo(-result.dZ!, 9);
  });

  test('a coarse fix cannot certify a fine shot (no unearned PASS)', () => {
    const fine = evaluateSetoutShot(
      { ...design, observedE: design.designE + 0.001, observedN: design.designN, observedZ: design.designZ },
      { ...DEFAULT_SETOUT_TOLERANCE, accuracyM: 0.001 }
    );
    expect(fine.result).toBe('PASS');

    const coarse = evaluateSetoutShot(
      { ...design, observedE: design.designE + 0.001, observedN: design.designN, observedZ: design.designZ },
      { ...DEFAULT_SETOUT_TOLERANCE, accuracyM: 0.05 }
    );
    expect(coarse.result).toBe('INFO');
    expect(coarse.message).toMatch(/cannot prove/i);
  });

  test('zero reported fix accuracy is unknown and cannot certify a shot', () => {
    const result = evaluateSetoutShot(
      { ...design, observedE: design.designE, observedN: design.designN, observedZ: design.designZ },
      { ...DEFAULT_SETOUT_TOLERANCE, accuracyM: 0 }
    );

    expect(result.result).toBe('INFO');
    expect(result.message).toMatch(/zero.*unknown|accuracy.*unknown/i);
  });

  test('a large miss fails outright', () => {
    const result = evaluateSetoutShot({
      ...design,
      observedE: design.designE + 0.4,
      observedN: design.designN,
      observedZ: design.designZ,
    });
    expect(result.result).toBe('FAIL');
  });

  test('no RL on either side means no invented vertical verdict', () => {
    const result = evaluateSetoutShot({
      designE: 500000,
      designN: 9860000,
      observedE: 500000,
      observedN: 9860000,
    });
    expect(result.dZ).toBeNull();
    expect(result.verticalErrorM).toBeNull();
    expect(result.result).toBe('PASS');
  });

  test('a target with a design RL cannot pass until an observed RL is supplied', () => {
    const result = evaluateSetoutShot({
      ...design,
      observedE: design.designE,
      observedN: design.designN,
    });

    expect(result.dZ).toBeNull();
    expect(result.verticalErrorM).toBeNull();
    expect(result.result).toBe('INFO');
    expect(result.message).toMatch(/observed RL is required/i);
  });
});

describe('verticality (plumb) evaluation', () => {
  const base = { baseE: 500000, baseN: 9860000 };

  test('a plumb column passes with no offset', () => {
    const result = evaluateVerticality({ ...base, topE: base.baseE, topN: base.baseN, heightM: 3 });
    expect(result.offsetM).toBeCloseTo(0, 9);
    expect(result.result).toBe('PASS');
  });

  test('offset is the horizontal displacement and the ratio is height over offset', () => {
    // 15 mm over a 3 m storey = 1:200, outside the 1:600 standard.
    const result = evaluateVerticality({
      ...base,
      topE: base.baseE + 0.015,
      topN: base.baseN,
      heightM: 3,
    });
    expect(result.offsetM).toBeCloseTo(0.015, 6);
    expect(result.tiltRatio).toBeCloseTo(200, 6);
    expect(result.result).toBe('FAIL');
    expect(result.message).toMatch(/out of plumb/i);
  });

  test('within 1:600 over three metres passes the 25 mm cap', () => {
    const result = evaluateVerticality({
      ...base,
      topE: base.baseE + 0.004,
      topN: base.baseN,
      heightM: 3,
    });
    expect(result.result).toBe('PASS');
    expect(result.tiltRatio).toBeGreaterThanOrEqual(DEFAULT_VERTICALITY_STANDARD.minTiltRatio);
  });

  test('height is unknown when no levels were read', () => {
    const result = evaluateVerticality({ ...base, topE: base.baseE + 0.01, topN: base.baseN });
    expect(result.heightM).toBeNull();
    expect(result.tiltRatio).toBe(Infinity);
    expect(formatTiltRatio(Infinity)).toBe('∞');
    // The absolute cap alone still judges it.
    expect(['PASS', 'WARN', 'FAIL']).toContain(result.result);
  });
});
