/**
 * @module tidalHarmonics — Diagnostic harmonic analysis in the supplied gauge reference
 *
 * Implements harmonic decomposition of tide gauge water level observations into
 * principal astronomical tidal constituents (M2, S2, N2, K2, K1, O1, P1, M4)
 * This finite-record fit does not establish MSL, LAT, HAT or Chart Datum.
 * Nodal corrections, astronomical epoch arguments and datum control are not implemented.
 *
 * Standard Reference:
 * - IHO S-44: Standards for Hydrographic Surveys
 * - Admiralty Manual of Tides / NOAA Tidal Analysis
 */

import { leastSquaresHarmonics, HarmonicConstituent } from './fourier';

/**
 * Standard astronomical speeds in degrees per mean solar hour and cycles per hour
 */
export const STANDARD_TIDAL_CONSTITUENTS: { name: string; speedDegHr: number; cyclesPerHour: number; description: string }[] = [
  { name: 'M2', speedDegHr: 28.9841042, cyclesPerHour: 28.9841042 / 360, description: 'Principal lunar semidiurnal' },
  { name: 'S2', speedDegHr: 30.0000000, cyclesPerHour: 30.0000000 / 360, description: 'Principal solar semidiurnal' },
  { name: 'N2', speedDegHr: 28.4397295, cyclesPerHour: 28.4397295 / 360, description: 'Larger lunar elliptic semidiurnal' },
  { name: 'K2', speedDegHr: 30.0821373, cyclesPerHour: 30.0821373 / 360, description: 'Lunisolar semidiurnal' },
  { name: 'K1', speedDegHr: 15.0410686, cyclesPerHour: 15.0410686 / 360, description: 'Lunisolar diurnal' },
  { name: 'O1', speedDegHr: 13.9430356, cyclesPerHour: 13.9430356 / 360, description: 'Principal lunar diurnal' },
  { name: 'P1', speedDegHr: 14.9589314, cyclesPerHour: 14.9589314 / 360, description: 'Principal solar diurnal' },
  { name: 'M4', speedDegHr: 57.9682084, cyclesPerHour: 57.9682084 / 360, description: 'Shallow water overtide' },
];

export interface WaterLevelObservation {
  /** Timestamp in hours from reference epoch (e.g. 0, 1.0, 2.0...) or ISO date */
  timeHours: number;
  /** Observed water level in meters relative to gauge zero / staff gauge */
  waterLevelMeters: number;
}

export interface TidalAnalysisResult {
  status: 'diagnostic';
  fittedMeanMeters: number;
  /** Algebraic bounds on the fitted harmonics, not astronomical tide datums. */
  amplitudeEnvelopeMeters: { lower: number; upper: number };
  limitations: string[];
  /** Mean Spring Tidal Range (2 * (H_M2 + H_S2)) in meters */
  meanSpringRangeMeters: number | null;
  /** Mean Neap Tidal Range (2 * (H_M2 - H_S2)) in meters */
  meanNeapRangeMeters: number | null;
  /** Form Factor F = (H_K1 + H_O1) / (H_M2 + H_S2) */
  formFactor: number | null;
  /** Tidal regime classification */
  regime: 'semidiurnal' | 'mixed-mainly-semidiurnal' | 'mixed-mainly-diurnal' | 'diurnal' | null;
  /** Resolved constituents with amplitude H and phase lag g */
  constituents: {
    name: string;
    amplitudeMeters: number;
    phaseLagDegrees: number;
    periodHours: number;
    description: string;
  }[];
  /** Goodness of fit */
  rmseMeters: number;
  rSquared: number;
  /** Fitted value within the observed time span; no operational tide forecast. */
  predictTideHeight: (timeHours: number) => number;
  /** Reduces a raw sounder depth to sounding datum (e.g. Chart Datum / LAT) */
  reduceSounding: (timeHours: number, rawDepthMeters: number, datumOffsetMeters: number) => number;
}

/**
 * Perform harmonic tidal analysis on water level time-series observations.
 *
 * @param observations Series of (timeHours, waterLevelMeters)
 * @param constituentNames Specific constituents to fit (defaults to M2, S2, K1, O1, N2, M4)
 */
export function analyzeTidalObservations(
  observations: WaterLevelObservation[],
  constituentNames: string[] = ['M2', 'S2', 'K1', 'O1', 'N2', 'M4']
): TidalAnalysisResult {
  if (observations.length < 12) {
    throw new Error('At least 12 water level observations required for tidal harmonic analysis');
  }
  if (!observations.every(o => Number.isFinite(o.timeHours) && Number.isFinite(o.waterLevelMeters))) throw new Error('Water level observations must be finite');
  if (!constituentNames.length || new Set(constituentNames).size !== constituentNames.length || constituentNames.some(name => !STANDARD_TIDAL_CONSTITUENTS.some(c => c.name === name))) throw new Error('Select distinct known tidal constituents');

  // Sort by time
  const sorted = observations.slice().sort((a, b) => a.timeHours - b.timeHours);
  const times = sorted.map((o) => o.timeHours);
  const levels = sorted.map((o) => o.waterLevelMeters);
  if (new Set(times).size !== times.length) throw new Error('Duplicate observation times require explicit reconciliation');

  const selectedDefs = STANDARD_TIDAL_CONSTITUENTS.filter((c) =>
    constituentNames.includes(c.name)
  );

  const freqDefs = selectedDefs.map((c) => ({
    name: c.name,
    frequency: c.cyclesPerHour,
  }));
  const span = times[times.length - 1] - times[0];
  for (let i = 0; i < freqDefs.length; i++) {
    if (span * freqDefs[i].frequency < 2) throw new Error('Observation span is too short for selected constituents');
    for (let j = i + 1; j < freqDefs.length; j++) {
      if (span * Math.abs(freqDefs[i].frequency - freqDefs[j].frequency) < 1) throw new Error('Observation span cannot resolve selected constituents');
    }
  }

  const fit = leastSquaresHarmonics(times, levels, freqDefs);

  const constituentMap = new Map<string, HarmonicConstituent>();
  fit.constituents.forEach((c) => {
    if (c.name) constituentMap.set(c.name, c);
  });

  const m2Amp = constituentMap.get('M2')?.amplitude ?? 0;
  const s2Amp = constituentMap.get('S2')?.amplitude ?? 0;
  const k1Amp = constituentMap.get('K1')?.amplitude ?? 0;
  const o1Amp = constituentMap.get('O1')?.amplitude ?? 0;

  // Form factor: F = (H_K1 + H_O1) / (H_M2 + H_S2)
  const semiSum = m2Amp + s2Amp;
  const hasMain = ['M2', 'S2', 'K1', 'O1'].every(name => constituentMap.has(name));
  const formFactor = hasMain && semiSum > 1e-10 ? (k1Amp + o1Amp) / semiSum : null;

  let regime: TidalAnalysisResult['regime'];
  if (formFactor === null) { regime = null;
  } else if (formFactor < 0.25) {
    regime = 'semidiurnal';
  } else if (formFactor < 1.5) {
    regime = 'mixed-mainly-semidiurnal';
  } else if (formFactor < 3.0) {
    regime = 'mixed-mainly-diurnal';
  } else {
    regime = 'diurnal';
  }

  // Mean Spring and Neap ranges
  const hasSemi = constituentMap.has('M2') && constituentMap.has('S2');
  const meanSpringRange = hasSemi ? 2 * (m2Amp + s2Amp) : null;
  const meanNeapRange = hasSemi ? 2 * Math.abs(m2Amp - s2Amp) : null;

  // Triangle-inequality envelope, not an astronomically attained extreme.
  const totalAmpSum = fit.constituents.reduce((sum, c) => sum + c.amplitude, 0);
  const msl = fit.mean;
  const lat = msl - totalAmpSum;
  const hat = msl + totalAmpSum;

  const constituents = fit.constituents.map((c) => {
    const def = STANDARD_TIDAL_CONSTITUENTS.find((d) => d.name === c.name);
    return {
      name: c.name || 'Harmonic',
      amplitudeMeters: c.amplitude,
      phaseLagDegrees: (c.phaseDeg + 360) % 360,
      periodHours: c.period,
      description: def?.description || '',
    };
  });

  const predictTideHeight = (t: number): number => {
    if (!Number.isFinite(t) || t < times[0] || t > times[times.length - 1]) throw new Error('Tide fit is limited to the observed time span');
    return fit.predict([t])[0];
  };

  /**
   * Sounding Reduction:
   * Sounding depth below Chart Datum = Raw echo sounder depth - (Tide height above Chart Datum)
   * The caller must supply an independently verified datum offset in the same gauge reference.
   * Raw depth must already include instrument/draft corrections; this helper only applies water level.
   */
  const reduceSounding = (
    timeHours: number,
    rawDepthMeters: number,
    datumOffsetMeters: number
  ): number => {
    if (!Number.isFinite(datumOffsetMeters) || !Number.isFinite(rawDepthMeters) || rawDepthMeters < 0) throw new Error('Finite nonnegative corrected depth and explicit verified datum offset required');
    const tideHeight = predictTideHeight(timeHours);
    const tideAboveDatum = tideHeight - datumOffsetMeters;
    return rawDepthMeters - tideAboveDatum;
  };

  return {
    status: 'diagnostic',
    fittedMeanMeters: msl,
    amplitudeEnvelopeMeters: { lower: lat, upper: hat },
    limitations: ['Finite-record fit in the supplied gauge reference; no MSL, LAT, HAT or Chart Datum determination.', 'No nodal or astronomical epoch corrections; phase is relative to input time zero.', 'Rayleigh span screening does not establish record quality, uncertainty or operational forecasting suitability.'],
    meanSpringRangeMeters: meanSpringRange,
    meanNeapRangeMeters: meanNeapRange,
    formFactor,
    regime,
    constituents,
    rmseMeters: fit.rmse,
    rSquared: fit.rSquared,
    predictTideHeight,
    reduceSounding,
  };
}
