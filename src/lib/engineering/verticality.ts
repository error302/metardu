/**
 * Verticality (plumb) checks for construction set-out — blueprint §11.4,
 * §10 (bridge pier example), §16 (`column_verticality` tolerance target).
 *
 * A column is plumb when its top is directly above its base. Two readings —
 * base centre and top centre — give the horizontal offset over the height;
 * the inverse is the tilt ratio a site engineer states as "1:850".
 *
 * PURE geometry: no IO, no framework, no OpenLayers. The surveyor supplies
 * observations; this decides whether the column is inside tolerance and
 * whether it needs a re-stake.
 */

/** Default plumb tolerance: 1:600 of the height, capped at 25 mm (blueprint §16). */
export interface VerticalityStandard {
  name: string;
  /** Maximum horizontal offset over the measured height, in metres. */
  maxOffsetM: number;
  /** Minimum acceptable tilt ratio, e.g. 600 means "not worse than 1:600". */
  minTiltRatio: number;
}

/**
 * Cap. 299 / common practice: plumb to 1:600 over the storey height, and never
 * more than 25 mm of offset at the top.
 */
export const DEFAULT_VERTICALITY_STANDARD: VerticalityStandard = {
  name: 'Cap. 299 column plumb (1:600, max 25 mm)',
  maxOffsetM: 0.025,
  minTiltRatio: 600,
};

export interface VerticalityReading {
  baseE: number;
  baseN: number;
  topE: number;
  topN: number;
  /** Height from base to top; derived from RLs when both are supplied. */
  heightM?: number | null;
}

export interface VerticalityResult {
  /** Horizontal offset of the top from the base, metres. */
  offsetM: number;
  /** Offset expressed as a ratio, e.g. 850 for 1:850 (Infinity for zero height). */
  tiltRatio: number;
  /** Bearing from base to top, degrees. */
  bearingDeg: number;
  heightM: number | null;
  result: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

/** Tilt as "1:x" for display; the raw number is returned alongside. */
export function formatTiltRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '∞';
  if (ratio >= 1000) return `1:${Math.round(ratio / 100) * 100}`;
  return `1:${Math.round(ratio)}`;
}

export function evaluateVerticality(
  reading: VerticalityReading,
  standard: VerticalityStandard = DEFAULT_VERTICALITY_STANDARD
): VerticalityResult {
  const dE = reading.topE - reading.baseE;
  const dN = reading.topN - reading.baseN;
  const offsetM = Math.sqrt(dE * dE + dN * dN);

  let heightM = reading.heightM ?? null;
  if (heightM == null || !Number.isFinite(heightM)) heightM = null;
  const tiltRatio = heightM && heightM > 0 ? heightM / offsetM : Infinity;

  let bearingDeg = (Math.atan2(dE, dN) * 180) / Math.PI;
  if (bearingDeg < 0) bearingDeg += 360;

  // Both criteria must hold: an absolute cap (so a very tall column is not
  // excused) and a ratio (so a short column is still tight). A ratio failure
  // is a genuine plumb failure and must FAIL outright — it is never softened
  // to a warning just because the millimetre offset happens to sit inside the
  // warning band.
  const withinAbsolute = offsetM <= standard.maxOffsetM;
  const withinRatio = offsetM === 0 ? true : tiltRatio >= standard.minTiltRatio;

  let result: 'PASS' | 'WARN' | 'FAIL' | 'INFO';
  if (withinAbsolute && withinRatio) {
    result = 'PASS';
  } else if (!withinRatio) {
    // Tilt ratio outside the standard: the column is not plumb, full stop.
    result = 'FAIL';
  } else if (offsetM <= standard.maxOffsetM * 2) {
    // Inside the absolute cap, plumb by ratio, but past the nominal figure.
    result = 'WARN';
  } else {
    result = 'FAIL';
  }

  const message =
    result === 'PASS'
      ? `Plumb within ${standard.name}: offset ${(offsetM * 1000).toFixed(1)} mm, tilt 1:${formatTiltRatio(tiltRatio).replace('1:', '')}`
      : result === 'WARN'
        ? `Marginally out: ${(offsetM * 1000).toFixed(1)} mm at the top; review before grouting`
        : `Out of plumb: ${(offsetM * 1000).toFixed(1)} mm offset exceeds ${standard.maxOffsetM * 1000} mm — re-stake or remediate`;

  return { offsetM, tiltRatio, bearingDeg, heightM, result, message };
}

/**
 * Judge a recorded shot against a design point (blueprint §27: DESIGN vs
 * MEASURED vs DELTA vs TOLERANCE vs STATUS — one model, not one per module).
 */
export interface SetoutShot {
  designE: number;
  designN: number;
  designZ?: number | null;
  observedE: number;
  observedN: number;
  observedZ?: number | null;
}

export interface SetoutShotResult {
  dE: number;
  dN: number;
  dZ: number | null;
  /** Signed project-grid correction to add to the observed coordinate. */
  moveE: number;
  /** Signed project-grid correction to add to the observed coordinate. */
  moveN: number;
  /** Signed level correction to add to the observed RL, when both RLs exist. */
  moveZ: number | null;
  horizontalErrorM: number;
  verticalErrorM: number | null;
  distanceToTargetM: number;
  result: 'PASS' | 'WARN' | 'FAIL' | 'INFO';
  message: string;
}

export interface SetoutTolerance {
  /** Maximum horizontal error to accept a shot, metres (default 10 mm). */
  horizontalM: number;
  /** Maximum vertical error, metres (default 5 mm). */
  verticalM: number;
  /** Accuracy of the GNSS/instrument fix; a shot cannot beat its own accuracy. */
  accuracyM?: number | null;
}

export const DEFAULT_SETOUT_TOLERANCE: SetoutTolerance = {
  horizontalM: 0.01,
  verticalM: 0.005,
};

/** Version string stored with shots judged against METARDU's built-in default. */
export const DEFAULT_SETOUT_TOLERANCE_VERSION = 'METARDU-1';

/** Raw entered-coordinate differences. No tolerance, accuracy or acceptance is inferred. */
export function computeSetoutDeltas(shot: SetoutShot): Omit<SetoutShotResult, 'result' | 'message'> {
  if (![shot.designE,shot.designN,shot.observedE,shot.observedN].every(Number.isFinite)
    || shot.designZ != null && !Number.isFinite(shot.designZ) || shot.observedZ != null && !Number.isFinite(shot.observedZ)) throw new RangeError('Design and observed coordinates must be finite.')
  const dE=shot.observedE-shot.designE,dN=shot.observedN-shot.designN
  const dZ=shot.designZ!=null&&shot.observedZ!=null?shot.observedZ-shot.designZ:null
  const horizontalErrorM=Math.hypot(dE,dN),verticalErrorM=dZ==null?null:Math.abs(dZ)
  const distanceToTargetM=Math.hypot(horizontalErrorM,verticalErrorM??0)
  if (![dE,dN,horizontalErrorM,distanceToTargetM].every(Number.isFinite)||dZ!=null&&!Number.isFinite(dZ)) throw new RangeError('Set-out differences exceed the finite calculation range.')
  return {dE,dN,dZ,moveE:-dE,moveN:-dN,moveZ:dZ==null?null:-dZ,horizontalErrorM,verticalErrorM,distanceToTargetM}
}

/**
 * Evaluate an as-staked shot. A coarse or zero-reported fix, or a missing
 * reading for a 3D target, cannot prove the shot: the verdict is INFO, never PASS.
 */
export function evaluateSetoutShot(
  shot: SetoutShot,
  tolerance: SetoutTolerance = DEFAULT_SETOUT_TOLERANCE
): SetoutShotResult {
  if (
    !Number.isFinite(shot.designE) || !Number.isFinite(shot.designN) ||
    !Number.isFinite(shot.observedE) || !Number.isFinite(shot.observedN) ||
    (shot.designZ != null && !Number.isFinite(shot.designZ)) ||
    (shot.observedZ != null && !Number.isFinite(shot.observedZ))
  ) {
    throw new RangeError('Design and observed coordinates must be finite numbers.')
  }
  if (
    !Number.isFinite(tolerance.horizontalM) || tolerance.horizontalM <= 0 ||
    !Number.isFinite(tolerance.verticalM) || tolerance.verticalM <= 0 ||
    (tolerance.accuracyM != null && (!Number.isFinite(tolerance.accuracyM) || tolerance.accuracyM < 0))
  ) {
    throw new RangeError('Set-out tolerances must be positive and fix accuracy must be non-negative.')
  }

  const dE = shot.observedE - shot.designE;
  const dN = shot.observedN - shot.designN;
  const dZ =
    shot.designZ != null && shot.observedZ != null ? shot.observedZ - shot.designZ : null;
  const moveE = -dE;
  const moveN = -dN;
  const moveZ = dZ == null ? null : -dZ;

  const horizontalErrorM = Math.sqrt(dE * dE + dN * dN);
  const verticalErrorM = dZ == null ? null : Math.abs(dZ);
  const distanceToTargetM = Math.sqrt(horizontalErrorM ** 2 + (verticalErrorM ?? 0) ** 2);

  const accuracy = tolerance.accuracyM;
  // Some device APIs report 0 when accuracy is unknown. Treat that sentinel as
  // missing evidence, never as a perfect fix.
  const zeroAccuracyIsUnknown = accuracy === 0;
  const fixCanProve = !zeroAccuracyIsUnknown && (accuracy == null || accuracy <= tolerance.horizontalM);

  const horizontalOk = horizontalErrorM <= tolerance.horizontalM;
  const verticalOk = verticalErrorM == null || verticalErrorM <= tolerance.verticalM;
  const requiredLevelMissing = shot.designZ != null && shot.observedZ == null;

  let result: 'PASS' | 'WARN' | 'FAIL' | 'INFO';
  if (!fixCanProve || requiredLevelMissing) {
    result = 'INFO';
  } else if (horizontalOk && verticalOk) {
    result = 'PASS';
  } else if (horizontalErrorM <= tolerance.horizontalM * 3 && (verticalErrorM ?? 0) <= tolerance.verticalM * 3) {
    result = 'WARN';
  } else {
    result = 'FAIL';
  }

  const message =
    result === 'PASS'
      ? `On target: ${(horizontalErrorM * 1000).toFixed(0)} mm horizontal${verticalErrorM != null ? `, ${(verticalErrorM * 1000).toFixed(0)} mm level` : ''}`
      : result === 'WARN'
        ? `Close — within 3x tolerance, verify before marking`
        : result === 'INFO'
          ? requiredLevelMissing
            ? 'An observed RL is required to verify this 3D set-out target.'
            : zeroAccuracyIsUnknown
              ? 'Reported fix accuracy is 0 (unknown); verify the instrument or enter a valid fix estimate before accepting this shot.'
              : `Fix accuracy (±${((accuracy ?? 0) * 1000).toFixed(0)} mm) cannot prove a ${(horizontalErrorM * 1000).toFixed(0)} mm shot — improve the fix or re-observe`
          : `Off target: ${(horizontalErrorM * 1000).toFixed(0)} mm horizontal${verticalErrorM != null ? `, ${(verticalErrorM * 1000).toFixed(0)} mm level` : ''}`;

  return { dE, dN, dZ, moveE, moveN, moveZ, horizontalErrorM, verticalErrorM, distanceToTargetM, result, message };
}
