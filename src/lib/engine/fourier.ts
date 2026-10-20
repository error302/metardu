/**
 * @module fourier — Fourier Series, Discrete Fourier Transform (DFT/FFT),
 * Power Spectral Density (PSD), and Harmonic Least-Squares Analysis
 *
 * Applications in Surveying & Civil Engineering:
 * Diagnostic harmonic fits, profile spectra and derived filtering previews.
 * These routines do not establish survey datums, IRI, or compliance classifications.
 */

export interface Complex {
  re: number;
  im: number;
}

export interface PSDResult {
  /** Spatial frequencies (cycles/m or cycles/unit) or temporal frequencies (Hz or cycles/hr) */
  frequencies: number[];
  /** Corresponding wavelengths (1 / frequency) */
  wavelengths: number[];
  /** One-sided Power Spectral Density values */
  psd: number[];
  /** Total spectral power (integral of PSD) */
  totalPower: number;
  /** Frequency with highest power */
  peakFrequency: number;
  /** Wavelength with highest power */
  peakWavelength: number;
  /** Nyquist frequency (1 / (2 * delta)) */
  nyquistFrequency: number;
}

export interface HarmonicConstituent {
  name?: string;
  frequency: number; // cycles per unit time/distance
  period: number;    // 1 / frequency
  cosCoeff: number;  // a_k
  sinCoeff: number;  // b_k
  amplitude: number; // sqrt(a_k^2 + b_k^2)
  phaseDeg: number;  // atan2(b_k, a_k) in degrees [-180, 180]
  phaseRad: number;  // phase in radians
}

export interface HarmonicFitResult {
  mean: number; // a_0
  constituents: HarmonicConstituent[];
  fittedValues: number[];
  residuals: number[];
  rmse: number;
  rSquared: number;
  predict: (times: number[]) => number[];
}

export interface FilterOptions {
  transitionBand?: number; // Fraction of cutoff for smooth transition (0 = step, 0.1 = 10% transition)
}

/**
 * Creates a complex number
 */
export function complex(re = 0, im = 0): Complex {
  return { re, im };
}

/**
 * Complex addition
 */
export function complexAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

/**
 * Complex subtraction
 */
export function complexSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

/**
 * Complex multiplication
 */
export function complexMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

/**
 * Complex magnitude |z|
 */
export function complexMag(z: Complex): number {
  return Math.hypot(z.re, z.im);
}

/**
 * Complex phase angle in radians
 */
export function complexPhase(z: Complex): number {
  return Math.atan2(z.im, z.re);
}

/**
 * Next power of 2 for FFT sizing
 */
export function nextPowerOfTwo(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0 || n > 1048576) throw new Error('Signal length must be an integer between 0 and 1048576');
  if (n <= 1) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Radix-2 Cooley-Tukey Fast Fourier Transform (FFT).
 * If signal length is not a power of 2, it is zero-padded to the next power of 2.
 */
export function fft(signal: (number | Complex)[]): Complex[] {
  const n = signal.length;
  if (n === 0) return [];

  const paddedLength = nextPowerOfTwo(n);
  const data = new Array<Complex>(paddedLength);

  for (let i = 0; i < paddedLength; i++) {
    if (i < n) {
      const val = signal[i];
      if (typeof val === 'number' ? !Number.isFinite(val) : !val || !Number.isFinite(val.re) || !Number.isFinite(val.im)) throw new Error('Signal values must be finite');
      data[i] = typeof val === 'number' ? { re: val, im: 0 } : { re: val.re, im: val.im };
    } else {
      data[i] = { re: 0, im: 0 };
    }
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < paddedLength - 1; i++) {
    if (i < j) {
      const temp = data[i];
      data[i] = data[j];
      data[j] = temp;
    }
    let k = paddedLength >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Cooley-Tukey decimation-in-time
  for (let len = 2; len <= paddedLength; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wStep = { re: Math.cos(angle), im: Math.sin(angle) };

    for (let i = 0; i < paddedLength; i += len) {
      let w = { re: 1, im: 0 };
      for (let k = 0; k < halfLen; k++) {
        const u = data[i + k];
        const v = complexMul(data[i + k + halfLen], w);
        data[i + k] = complexAdd(u, v);
        data[i + k + halfLen] = complexSub(u, v);
        w = complexMul(w, wStep);
      }
    }
  }

  return data;
}

/**
 * Inverse Fast Fourier Transform (IFFT).
 */
export function ifft(spectrum: Complex[]): Complex[] {
  const n = spectrum.length;
  if (n === 0) return [];
  if (nextPowerOfTwo(n) !== n) throw new Error('IFFT spectrum length must be a power of two');

  // Take complex conjugate
  const conjugated: Complex[] = spectrum.map((z) => ({ re: z.re, im: -z.im }));
  const transformed = fft(conjugated);

  // Take conjugate again and divide by N
  return transformed.map((z) => ({
    re: z.re / n,
    im: -z.im / n,
  }));
}

/**
 * Computes One-Sided Power Spectral Density (PSD) of a real discrete signal.
 *
 * @param signal Real numerical observations (e.g. elevation readings or water levels)
 * @param samplingInterval Spacing between samples (e.g. dx in meters or dt in seconds/hours)
 * @param removeMean Whether to subtract mean to avoid DC dominance at 0 Hz (default true)
 */
export function computePSD(
  signal: number[],
  samplingInterval: number,
  removeMean = true
): PSDResult {
  const n = signal.length;
  if (n < 3) {
    throw new Error('Signal must have at least 3 points for a nonzero Hann window');
  }
  if (!signal.every(Number.isFinite)) throw new Error('Signal values must be finite');
  if (!Number.isFinite(samplingInterval) || samplingInterval <= 0) {
    throw new Error('Sampling interval must be positive');
  }

  let processed = signal.slice();
  if (removeMean) {
    const mean = processed.reduce((sum, v) => sum + v, 0) / n;
    processed = processed.map((v) => v - mean);
  }

  // Windowing with Hann window to suppress spectral leakage
  const windowed = processed.map((v, i) => {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    return v * w;
  });

  const spectrum = fft(windowed);
  const fftLength = spectrum.length;
  const numFreqs = Math.floor(fftLength / 2) + 1;
  const df = 1 / (fftLength * samplingInterval);
  const nyquist = 1 / (2 * samplingInterval);

  // Window power correction factor: sum(w^2) / N
  let windowPowerSum = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    windowPowerSum += w * w;
  }

  const frequencies: number[] = [];
  const wavelengths: number[] = [];
  const psd: number[] = [];

  let maxPsd = 0;
  let peakFreq = 0;
  let totalPower = 0;

  for (let i = 0; i < numFreqs; i++) {
    const f = i * df;
    frequencies.push(f);
    wavelengths.push(f > 0 ? 1 / f : Infinity);

    const mag = complexMag(spectrum[i]);
    // One-sided scaling: DC (i=0) and Nyquist (i=N/2) counted once, other bins doubled
    const factor = (i === 0 || i === numFreqs - 1) ? 1 : 2;
    // Density = |FFT(window*x)|² / (sample rate * sum(window²)).
    // Padding changes bin width, never the measured record or its power.
    const power = factor * mag * mag * samplingInterval / windowPowerSum;
    psd.push(power);
    totalPower += power * df;

    if (i > 0 && power > maxPsd) {
      maxPsd = power;
      peakFreq = f;
    }
  }

  return {
    frequencies,
    wavelengths,
    psd,
    totalPower,
    peakFrequency: peakFreq,
    peakWavelength: peakFreq > 0 ? 1 / peakFreq : 0,
    nyquistFrequency: nyquist,
  };
}

/**
 * Least-Squares Harmonic Regression (Continuous / Non-Uniform Fourier Analysis)
 *
 * Decomposes an unevenly or evenly sampled series y(t) into specified harmonic frequencies:
 *   y(t) = a_0 + sum_{k=1}^K [ a_k * cos(2*pi*f_k*t) + b_k * sin(2*pi*f_k*t) ]
 *
 * Essential for tidal analysis (arbitrary tidal constituents like M2, S2, K1, O1)
 * and survey series with gaps or irregular intervals.
 */
export function leastSquaresHarmonics(
  times: number[],
  values: number[],
  frequencies: { name?: string; frequency: number }[]
): HarmonicFitResult {
  frequencies = frequencies.map(definition => ({ ...definition }));
  const n = times.length;
  if (!times.every(Number.isFinite) || !values.every(Number.isFinite)) throw new Error('Harmonic observations must be finite');
  if (frequencies.some(f => !Number.isFinite(f.frequency) || f.frequency <= 0) || new Set(frequencies.map(f => f.frequency)).size !== frequencies.length) throw new Error('Harmonic frequencies must be distinct, finite and positive');
  if (n !== values.length) {
    throw new Error('times and values arrays must have equal length');
  }
  if (n > 16384 || frequencies.length > 32) throw new Error('Harmonic fit supports up to 16384 observations and 32 frequencies');
  const k = frequencies.length;
  const numParams = 1 + 2 * k; // a_0, plus (a_k, b_k) for each frequency
  if (n < numParams) {
    throw new Error(`At least ${numParams} data points required to fit ${k} harmonic frequencies`);
  }

  // Construct design matrix A (n x numParams)
  // Column 0: 1 (for a_0)
  // Column 1 + 2*j: cos(2*pi*f_j*t_i)
  // Column 2 + 2*j: sin(2*pi*f_j*t_i)
  const A = new Array<number[]>(n);
  for (let i = 0; i < n; i++) {
    const t = times[i];
    const row = new Array<number>(numParams);
    row[0] = 1;
    for (let j = 0; j < k; j++) {
      const omega = 2 * Math.PI * frequencies[j].frequency;
      row[1 + 2 * j] = Math.cos(omega * t);
      row[2 + 2 * j] = Math.sin(omega * t);
    }
    A[i] = row;
  }

  // Householder QR avoids squaring the condition number via normal equations.
  // Reject unresolved columns rather than emitting plausible coefficients.
  const R = A.map(row => row.slice());
  const rhs = values.slice();
  for (let col = 0; col < numParams; col++) {
    const norm = Math.hypot(...R.slice(col).map(row => row[col]));
    if (!Number.isFinite(norm) || norm <= 1e-10 * Math.sqrt(n)) throw new Error('Harmonic design is singular or unresolved');
    const v = R.slice(col).map(row => row[col]);
    v[0] += (v[0] >= 0 ? 1 : -1) * norm;
    const vNorm = Math.hypot(...v);
    for (let i = 0; i < v.length; i++) v[i] /= vNorm;
    for (let j = col; j < numParams; j++) {
      let dot = 0;
      for (let i = 0; i < v.length; i++) dot += v[i] * R[col + i][j];
      for (let i = 0; i < v.length; i++) R[col + i][j] -= 2 * v[i] * dot;
    }
    let dot = 0;
    for (let i = 0; i < v.length; i++) dot += v[i] * rhs[col + i];
    for (let i = 0; i < v.length; i++) rhs[col + i] -= 2 * v[i] * dot;
  }
  const params = new Array<number>(numParams).fill(0);
  for (let i = numParams - 1; i >= 0; i--) {
    let value = rhs[i];
    for (let j = i + 1; j < numParams; j++) value -= R[i][j] * params[j];
    params[i] = value / R[i][i];
    if (!Number.isFinite(params[i])) throw new Error('Harmonic solution is not finite');
  }

  const a0 = params[0];

  const constituents: HarmonicConstituent[] = [];
  for (let j = 0; j < k; j++) {
    const ak = params[1 + 2 * j];
    const bk = params[2 + 2 * j];
    const amp = Math.hypot(ak, bk);
    const phaseRad = Math.atan2(bk, ak);
    const phaseDeg = (phaseRad * 180) / Math.PI;

    const f = frequencies[j].frequency;
    const constituent: HarmonicConstituent = {
      name: frequencies[j].name,
      frequency: f,
      period: f !== 0 ? 1 / f : Infinity,
      cosCoeff: ak,
      sinCoeff: bk,
      amplitude: amp,
      phaseDeg,
      phaseRad,
    };
    constituents.push(constituent);
  }

  // Prediction function
  const predict = (evalTimes: number[]): number[] => {
    if (!evalTimes.every(Number.isFinite)) throw new Error('Prediction times must be finite');
    return evalTimes.map((t) => {
      let val = a0;
      for (let j = 0; j < k; j++) {
        const omega = 2 * Math.PI * frequencies[j].frequency;
        val += params[1 + 2 * j] * Math.cos(omega * t) + params[2 + 2 * j] * Math.sin(omega * t);
      }
      return val;
    });
  };

  const fittedValues = predict(times);
  const residuals = values.map((val, idx) => val - fittedValues[idx]);

  let ssRes = 0;
  let ssTot = 0;
  const meanVal = values.reduce((s, v) => s + v, 0) / n;
  for (let i = 0; i < n; i++) {
    ssRes += residuals[i] * residuals[i];
    const diff = values[i] - meanVal;
    ssTot += diff * diff;
  }

  const rmse = Math.sqrt(ssRes / n);
  const rSquared = ssTot > 1e-12 ? Math.max(0, 1 - ssRes / ssTot) : 1;

  return {
    mean: a0,
    constituents,
    fittedValues,
    residuals,
    rmse,
    rSquared,
    predict,
  };
}

/**
 * Zero-phase frequency domain filter (lowpass, highpass, bandpass).
 * Filters real spatial or time signals (e.g. cross-section elevations) without phase shift.
 */
export function frequencyFilter(
  signal: number[],
  sampleInterval: number,
  filterType: 'lowpass' | 'highpass' | 'bandpass',
  cutoffs: { low?: number; high?: number },
  options: FilterOptions = {}
): number[] {
  const n = signal.length;
  if (!signal.every(Number.isFinite) || !Number.isFinite(sampleInterval) || sampleInterval <= 0) throw new Error('Finite samples and positive finite spacing required');
  const nyquist = 1 / (2 * sampleInterval);
  const cutoff = filterType === 'lowpass' ? cutoffs.low ?? cutoffs.high : cutoffs.high ?? cutoffs.low;
  if (filterType === 'bandpass') {
    if (typeof cutoffs.low !== 'number' || typeof cutoffs.high !== 'number' || !Number.isFinite(cutoffs.low) || !Number.isFinite(cutoffs.high) || cutoffs.low < 0 || cutoffs.high <= cutoffs.low || cutoffs.high > nyquist) throw new Error('Bandpass limits must be ordered within Nyquist');
  } else if (!['lowpass', 'highpass'].includes(filterType) || typeof cutoff !== 'number' || !Number.isFinite(cutoff) || cutoff <= 0 || cutoff > nyquist) throw new Error('Cutoff must be positive and within Nyquist');
  if (!Number.isFinite(options.transitionBand ?? 0.15) || (options.transitionBand ?? 0.15) < 0 || (options.transitionBand ?? 0.15) > 1) throw new Error('Transition band must be between 0 and 1');
  if (n < 2) return signal.slice();

  const paddedLen = nextPowerOfTwo(n);
  const meanVal = signal.reduce((sum, v) => sum + v, 0) / n;
  const zeroMean = signal.map((v) => v - meanVal);

  const spectrum = fft(zeroMean);
  const df = 1 / (paddedLen * sampleInterval);
  const transition = options.transitionBand ?? 0.15;

  const filteredSpectrum: Complex[] = spectrum.map((z, idx) => {
    const fIdx = idx <= paddedLen / 2 ? idx : paddedLen - idx;
    const freq = fIdx * df;

    let gain = 1;
    if (filterType === 'lowpass') {
      const fc = cutoffs.low ?? cutoffs.high ?? df;
      if (freq <= fc * (1 - transition)) {
        gain = 1;
      } else if (freq >= fc * (1 + transition)) {
        gain = 0;
      } else {
        // Smooth raised-cosine transition
        const t = (freq - fc * (1 - transition)) / (2 * fc * transition);
        gain = 0.5 * (1 + Math.cos(Math.PI * t));
      }
    } else if (filterType === 'highpass') {
      const fc = cutoffs.high ?? cutoffs.low ?? df;
      if (freq >= fc * (1 + transition)) {
        gain = 1;
      } else if (freq <= fc * (1 - transition)) {
        gain = 0;
      } else {
        const t = (freq - fc * (1 - transition)) / (2 * fc * transition);
        gain = 0.5 * (1 - Math.cos(Math.PI * t));
      }
    } else if (filterType === 'bandpass') {
      const fLow = cutoffs.low ?? 0;
      const fHigh = cutoffs.high ?? Infinity;
      if (freq < fLow || freq > fHigh) {
        gain = 0;
      } else {
        gain = 1;
      }
    }

    return { re: z.re * gain, im: z.im * gain };
  });

  const reconstructed = ifft(filteredSpectrum);

  // Restore DC mean for lowpass, exclude DC mean for highpass
  const offset = filterType === 'lowpass' || (filterType === 'bandpass' && cutoffs.low === 0) ? meanVal : 0;
  return reconstructed.slice(0, n).map((z) => z.re + offset);
}
