/**
 * Stakeout proximity bands (engine `ol/stakeout`).
 *
 * Device geolocation is only a navigation aid. Its reported uncertainty must
 * not make the UI or spoken prompts sound like survey acceptance.
 */
import {
  computeStakeoutState,
  ARRIVAL_TOLERANCE_M,
  NEAR_TARGET_TOLERANCE_M,
  CLOSE_TOLERANCE_M,
} from '../ol/stakeout';

const at = (easting: number, northing: number, accuracy: number) =>
  computeStakeoutState(
    { easting: 0, northing: 0, accuracy },
    { easting, northing }
  );

describe('stakeout proximity bands', () => {
  test('reported uncertainty fully inside the navigation band gets a device-estimate cue', () => {
    const state = at(0.2, 0, 0.3);
    expect(state.distance).toBeLessThanOrEqual(ARRIVAL_TOLERANCE_M);
    expect(state.distance + 0.3).toBeLessThanOrEqual(ARRIVAL_TOLERANCE_M);
    expect(state.proximityLabel).toBe('DEVICE ESTIMATE IN BAND');
    expect(state.proximityColor).toBe('green');
    expect(state.arrivalAssessment).toBe('device-estimate-within-navigation-band');
  });

  test.each([
    ['unknown accuracy (0)', 0, 'ACCURACY UNKNOWN', 'reported-accuracy-unknown'],
    ['NaN accuracy', Number.NaN, 'ACCURACY UNKNOWN', 'reported-accuracy-unknown'],
    ['negative accuracy', -1, 'ACCURACY UNKNOWN', 'reported-accuracy-unknown'],
    ['coarse accuracy', 10, 'POSITION UNCERTAIN', 'reported-uncertainty-overlaps-band'],
  ] as const)('does not imply arrival on %s', (_label, accuracy, label, assessment) => {
    const state = at(0.2, 0, accuracy);
    expect(state.proximityLabel).toBe(label);
    expect(state.proximityColor).toBe('amber');
    expect(state.arrivalAssessment).toBe(assessment);
  });

  test('an uncertainty radius that crosses the navigation band cannot show green', () => {
    const state = at(0.7, 0, 0.3);
    expect(state.proximityLabel).toBe('POSITION UNCERTAIN');
    expect(state.proximityColor).toBe('amber');
  });

  test('bands step outward: near target, close, approaching', () => {
    expect(at(NEAR_TARGET_TOLERANCE_M - 0.1, 0, 0.5).proximityLabel).toBe('NEAR TARGET');
    expect(at(CLOSE_TOLERANCE_M - 0.5, 0, 0.5).proximityLabel).toBe('CLOSE');
    expect(at(CLOSE_TOLERANCE_M + 1, 0, 0.5).proximityLabel).toBe('APPROACHING');
    expect(at(NEAR_TARGET_TOLERANCE_M + 0.1, 0, 0.5).arrivalAssessment).toBe('outside-navigation-band');
  });

  test('always publishes dE, dN and bearing for the field display', () => {
    const state = at(100, 50, 0.5);
    expect(state.dE).toBe(100);
    expect(state.dN).toBe(50);
    expect(state.bearing).toBeGreaterThanOrEqual(0);
    expect(state.bearing).toBeLessThan(360);
    expect(state.bearingWCB).toMatch(/^\d+°\d{2}'\d{2}"$/);
  });
});
