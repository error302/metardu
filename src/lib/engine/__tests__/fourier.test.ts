import {
  fft,
  ifft,
  computePSD,
  leastSquaresHarmonics,
  frequencyFilter,
  complexMag,
} from '../fourier';

describe('Fourier Engine', () => {
  describe('FFT and IFFT', () => {
    it('reconstructs a pure sinusoidal signal via FFT and IFFT (round-trip identity)', () => {
      const N = 64;
      const f0 = 4; // 4 cycles in 64 samples
      const signal: number[] = [];
      for (let i = 0; i < N; i++) {
        signal.push(Math.sin((2 * Math.PI * f0 * i) / N));
      }

      const spectrum = fft(signal);
      expect(spectrum.length).toBe(64);

      // In FFT, peak should be exactly at bin 4 (and symmetric bin 60)
      const mag4 = complexMag(spectrum[4]);
      const mag0 = complexMag(spectrum[0]);
      expect(mag4).toBeGreaterThan(30);
      expect(mag0).toBeLessThan(1e-5);

      const reconstructed = ifft(spectrum);
      expect(reconstructed.length).toBe(64);

      for (let i = 0; i < N; i++) {
        expect(reconstructed[i].re).toBeCloseTo(signal[i], 5);
        expect(reconstructed[i].im).toBeCloseTo(0, 5);
      }
    });

    it('handles zero padding when signal length is not a power of 2', () => {
      const signal = [1, 2, 3, 4, 5]; // length 5 -> padded to 8
      const spectrum = fft(signal);
      expect(spectrum.length).toBe(8);

      const reconstructed = ifft(spectrum);
      expect(reconstructed.length).toBe(8);
      // Original 5 points are preserved
      for (let i = 0; i < 5; i++) {
        expect(reconstructed[i].re).toBeCloseTo(signal[i], 5);
      }
    });
  });

  describe('Power Spectral Density (PSD)', () => {
    it('integrates density to window-corrected mean square, including zero padding', () => {
      for (const n of [63, 64]) {
        const signal = Array.from({ length: n }, (_, i) => 2 * Math.sin(2 * Math.PI * 8 * i / n))
        const result = computePSD(signal, 0.25)
        const window = signal.map((_, i) => 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1))))
        const expected = signal.reduce((s, v, i) => s + (v * window[i]) ** 2, 0) / window.reduce((s, w) => s + w * w, 0)
        const df = result.frequencies[1]
        expect(result.psd.reduce((s, p) => s + p * df, 0)).toBeCloseTo(expected, 10)
        expect(result.totalPower).toBeCloseTo(expected, 10)
      }
    })

    it('rejects invalid measurements, spacing and a degenerate Hann window', () => {
      expect(() => computePSD([1, 2], 1)).toThrow()
      expect(() => computePSD([1, NaN, 2], 1)).toThrow()
      expect(() => computePSD([1, 2, 3], Infinity)).toThrow()
      expect(() => ifft([{ re: 1, im: 0 }, { re: 1, im: 0 }, { re: 1, im: 0 }])).toThrow()
    })
    it('identifies dominant spatial wavelength of sinusoidal terrain', () => {
      // 100 meters length, sampled every 1 meter (dx = 1.0)
      // Dominant undulating wavelength = 20 meters (frequency = 0.05 cycles/m)
      const dx = 1.0;
      const L = 256;
      const wavelength = 20.0;
      const signal: number[] = [];
      for (let i = 0; i < L; i++) {
        const x = i * dx;
        signal.push(10.0 + 2.5 * Math.cos((2 * Math.PI * x) / wavelength));
      }

      const psd = computePSD(signal, dx, true);
      expect(psd.frequencies.length).toBeGreaterThan(10);
      expect(psd.nyquistFrequency).toBe(0.5); // 1 / (2 * 1.0)
      expect(Math.abs(psd.peakWavelength - wavelength)).toBeLessThan(1.0);
    });
  });

  describe('Least-Squares Harmonic Decomposition', () => {
    it('recovers known amplitudes and phases of mixed harmonics from unevenly spaced observations', () => {
      // Signal: y(t) = 15.0 + 3.0*cos(2*pi*f1*t + 45 deg) + 1.5*cos(2*pi*f2*t - 30 deg)
      const f1 = 0.0805; // ~12.42 hr tidal period
      const f2 = 0.0833; // 12.00 hr solar period
      const phi1Rad = (45 * Math.PI) / 180;
      const phi2Rad = (-30 * Math.PI) / 180;

      const a0_true = 15.0;
      const A1_true = 3.0;
      const A2_true = 1.5;

      const times: number[] = [];
      const values: number[] = [];

      // Generate unevenly sampled observations over 100 hours
      let t = 0;
      while (t <= 100) {
        times.push(t);
        const y =
          a0_true +
          A1_true * Math.cos(2 * Math.PI * f1 * t - phi1Rad) +
          A2_true * Math.cos(2 * Math.PI * f2 * t - phi2Rad);
        values.push(y);
        // irregular spacing between 0.8 and 1.5 hours
        t += 0.8 + 0.5 * Math.sin(t);
      }

      const fit = leastSquaresHarmonics(times, values, [
        { name: 'M2', frequency: f1 },
        { name: 'S2', frequency: f2 },
      ]);

      expect(fit.mean).toBeCloseTo(a0_true, 2);
      expect(fit.constituents[0].amplitude).toBeCloseTo(A1_true, 2);
      expect(fit.constituents[1].amplitude).toBeCloseTo(A2_true, 2);
      expect(fit.rSquared).toBeGreaterThan(0.999);
      expect(fit.rmse).toBeLessThan(0.01);
    });
  });

  describe('Frequency Filtering (Despeckling)', () => {
    it('does not restore the mean into a positive-frequency bandpass', () => {
      const filtered = frequencyFilter(Array<number>(64).fill(100), 1, 'bandpass', { low: 0.1, high: 0.3 })
      expect(filtered.every(v => Math.abs(v) < 1e-10)).toBe(true)
      expect(() => frequencyFilter([1, 2, 3], NaN, 'lowpass', { low: 0.1 })).toThrow()
      expect(() => frequencyFilter([1, 2, 3], 1, 'bandpass', { low: 0.3, high: 0.1 })).toThrow()
    })
    it('attenuates high-frequency noise from a smooth geodetic profile', () => {
      const N = 128;
      const dx = 1.0;
      const clean: number[] = [];
      const noisy: number[] = [];

      for (let i = 0; i < N; i++) {
        const x = i * dx;
        const base = 100.0 + 5.0 * Math.sin((2 * Math.PI * x) / 60.0); // smooth 60m wave
        const noise = 0.8 * Math.sin((2 * Math.PI * x) / 3.0); // high frequency 3m chatter
        clean.push(base);
        noisy.push(base + noise);
      }

      // Lowpass cutoff at 0.05 cycles/m (20m wavelength), so 3m noise is filtered out
      const filtered = frequencyFilter(noisy, dx, 'lowpass', { low: 0.05 });

      // Compare RMSE between clean and filtered vs clean and noisy
      let noisyError = 0;
      let filteredError = 0;
      for (let i = 10; i < N - 10; i++) {
        noisyError += Math.pow(noisy[i] - clean[i], 2);
        filteredError += Math.pow(filtered[i] - clean[i], 2);
      }
      expect(filteredError).toBeLessThan(noisyError * 0.2); // >80% noise reduction
    });
  });
});
