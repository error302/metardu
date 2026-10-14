/**
 * Verticality (plumb) checks for construction set-out — blueprint §11.4,
 * §10 (bridge pier example), §16 (`column_verticality` tolerance target).
 *
 * A column is plumb when its top is directly above its base. Two readings —
 * base centre and top centre — give the horizontal offset over the height;
 * the inverse is the tilt ratio a site engineer states as "1:850".
 *
 * PURE geometry: no IO, no framework, no OpenLayers. The surveyor supplies
 * observations and explicit criteria. Numerical comparison does not establish
 * survey control, design approval or construction acceptance.
 */

/** Limits transcribed from the applicable project drawing/specification. */
export interface VerticalityStandard {
  name: string;
  reference: string;
  version: string;
  /** Maximum horizontal offset over the measured height, in metres. */
  maxOffsetM: number;
  /** Minimum acceptable tilt ratio, e.g. 600 means "not worse than 1:600". */
  minTiltRatio: number;
}

/**
 * Historical example retained for compatibility and explicit training only.
 * It is not a regulatory standard or automatically adopted project criterion.
 */
export const DEFAULT_VERTICALITY_STANDARD: VerticalityStandard = {
  name: 'Historical example — not issued project criteria',
  reference: 'METARDU historical example only',
  version: 'LEGACY-EXAMPLE',
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
  /** Entered uncertainty of the measured horizontal displacement, not one fix. */
  horizontalUncertaintyM?: number | null;
  /** Entered uncertainty of the measured base-to-top height difference. */
  heightUncertaintyM?: number | null;
}

export interface VerticalityResult {
  /** Horizontal offset of the top from the base, metres. */
  offsetM: number;
  /** Height/offset; null without height, Infinity only for zero offset with height. */
  tiltRatio: number | null;
  /** Bearing from base to top, degrees. */
  bearingDeg: number | null;
  heightM: number | null;
  result: 'PASS' | 'FAIL' | 'INFO';
  message: string;
  issues: string[];
}

/** Tilt as "1:x" for display; the raw number is returned alongside. */
export function formatTiltRatio(ratio: number | null): string {
  if (ratio === null) return 'Not assessed';
  if (ratio === Infinity) return '∞';
  if (!Number.isFinite(ratio) || ratio <= 0) throw new RangeError('Tilt ratio must be positive, infinite or unknown.');
  if (ratio >= 1000) return `1:${Math.round(ratio / 100) * 100}`;
  return `1:${Math.round(ratio)}`;
}

export function evaluateVerticality(
  reading: VerticalityReading,
  standard: VerticalityStandard | null = null
): VerticalityResult {
  if (![reading.baseE, reading.baseN, reading.topE, reading.topN].every(Number.isFinite)) {
    throw new RangeError('Base and top coordinates must be finite.');
  }
  const heightM = reading.heightM ?? null;
  if (heightM !== null && (!Number.isFinite(heightM) || heightM <= 0)) throw new RangeError('Measured height must be finite and positive.');
  for (const uncertainty of [reading.horizontalUncertaintyM, reading.heightUncertaintyM]) {
    if (uncertainty != null && (!Number.isFinite(uncertainty) || uncertainty < 0)) throw new RangeError('Reported uncertainties must be finite and non-negative.');
  }
  if (standard && (!standard.name?.trim() || !standard.reference?.trim() || !standard.version?.trim()
    || !Number.isFinite(standard.maxOffsetM) || standard.maxOffsetM <= 0
    || !Number.isFinite(standard.minTiltRatio) || standard.minTiltRatio <= 0)) {
    throw new RangeError('Plumb criteria need positive finite limits, name, source reference and version.');
  }
  const dE = reading.topE - reading.baseE;
  const dN = reading.topN - reading.baseN;
  const offsetM = Math.hypot(dE, dN);
  if (!Number.isFinite(offsetM)) throw new RangeError('Plumb displacement exceeds the finite calculation range.');
  const tiltRatio = heightM === null ? null : offsetM === 0 ? Infinity : heightM / offsetM;
  if (tiltRatio !== null && offsetM !== 0 && (!Number.isFinite(tiltRatio) || tiltRatio <= 0)) throw new RangeError('Tilt ratio exceeds the finite calculation range.');
  const bearingDeg = offsetM === 0 ? null : ((Math.atan2(dE, dN) * 180) / Math.PI + 360) % 360;
  const issues: string[] = [];
  if (!standard) issues.push('Project plumb criteria are not recorded; no standard is inferred.');
  if (heightM === null) issues.push('Measured base-to-top height is missing; tilt ratio is not assessed.');
  const h = reading.horizontalUncertaintyM, v = reading.heightUncertaintyM;
  if (h == null || h === 0) issues.push('Reported displacement uncertainty is missing or zero (unknown).');
  else if (standard && h > Math.min(standard.maxOffsetM, heightM === null ? standard.maxOffsetM : heightM / standard.minTiltRatio)) issues.push('Reported displacement uncertainty exceeds the entered criterion.');
  if (v == null || v === 0) issues.push('Reported height-difference uncertainty is missing or zero (unknown).');
  else if (heightM !== null && v >= heightM) issues.push('Reported height uncertainty cannot establish a positive height.');
  let result: VerticalityResult['result'] = 'INFO';
  let message = issues.join(' ');
  if (issues.length === 0 && standard && tiltRatio !== null) {
    const withinAbsolute = offsetM <= standard.maxOffsetM;
    const withinRatio = tiltRatio >= standard.minTiltRatio;
    result = withinAbsolute && withinRatio ? 'PASS' : 'FAIL';
    message = result === 'PASS'
      ? 'Within entered numerical plumb limits. Survey control and construction acceptance are not verified.'
      : `Numerical plumb limits exceeded: ${[!withinAbsolute ? 'absolute offset cap' : '', !withinRatio ? 'minimum tilt ratio' : ''].filter(Boolean).join(' and ')}. Review observations and project criteria.`;
  }
  return { offsetM, tiltRatio, bearingDeg, heightM, result, message, issues };
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
