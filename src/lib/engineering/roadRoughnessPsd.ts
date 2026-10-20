/** Diagnostic spectra of uniformly spaced, metre-based road profiles.
 * No IRI/ISO compliance result is inferred from a periodogram or slope proxy.
 */
import { computePSD, type PSDResult } from '../engine/fourier'

export interface WavelengthBandEnergy {
  band: 'short' | 'medium' | 'long'
  description: string
  wavelengthRangeMeters: [number, number]
  spectralEnergy: number
  percentageOfTotal: number
}
export interface RoadRoughnessAnalysis {
  status: 'diagnostic'
  samplingIntervalMeters: number
  totalLengthMeters: number
  detrend: 'linear'
  isoClass: null
  isoClassDescription: string
  estimatedIriMPerKm: null
  rideQuality: null
  /** Interpolated density at 0.1 cycles/m in 10^-6 m^3, unavailable outside measured resolution. */
  roughnessCoefficientG0: number | null
  wavelengthBands: WavelengthBandEnergy[]
  psd: PSDResult
  /** Diagnostic concentration in the 0.5–2m band; not a field defect determination. */
  hasCorrugations: boolean
  corrugationWavelengthMeters?: number
  limitations: string[]
}

export function analyzeRoadProfileRoughness(elevations: number[], intervalMeters: number): RoadRoughnessAnalysis {
  if (elevations.length < 8 || !elevations.every(Number.isFinite)) throw new Error('At least 8 finite elevation samples required')
  if (!Number.isFinite(intervalMeters) || intervalMeters <= 0) throw new Error('Sampling interval must be positive and finite in metres')
  const n = elevations.length
  const center = (n - 1) / 2
  const mean = elevations.reduce((s, v) => s + v, 0) / n
  let xx = 0, xy = 0
  elevations.forEach((v, i) => { xx += (i - center) ** 2; xy += (i - center) * (v - mean) })
  const slope = xy / xx
  const residual = elevations.map((v, i) => v - mean - slope * (i - center))
  const psd = computePSD(residual, intervalMeters, false)
  const df = psd.frequencies[1]
  // Zero padding does not improve the underlying record's frequency resolution.
  const recordResolution = 1 / (n * intervalMeters)
  const reference = 0.1
  let g0: number | null = null
  if (recordResolution <= reference && reference <= psd.nyquistFrequency) {
    const upper = psd.frequencies.findIndex(f => f >= reference)
    const low = Math.max(0, upper - 1)
    const fraction = (reference - psd.frequencies[low]) / df
    g0 = (psd.psd[low] + fraction * (psd.psd[upper] - psd.psd[low])) * 1e6
  }
  const definitions: { band: WavelengthBandEnergy['band']; range: [number, number] }[] = [
    { band: 'short', range: [0.1, 1] }, { band: 'medium', range: [1, 10] }, { band: 'long', range: [10, 50] },
  ]
  const wavelengthBands = definitions.map(({ band, range }) => {
    const energy = psd.psd.reduce((sum, density, i) => {
      const wave = psd.wavelengths[i]
      return sum + (i > 0 && wave >= range[0] && (wave < range[1] || (band === 'long' && wave === 50)) ? density * df : 0)
    }, 0)
    return { band, description: band + ' wavelengths (metres)', wavelengthRangeMeters: range, spectralEnergy: energy, percentageOfTotal: psd.totalPower > 0 ? 100 * energy / psd.totalPower : 0 }
  })
  let corrugationEnergy = 0, peak = 0, wavelength: number | undefined
  psd.psd.forEach((density, i) => {
    if (i > 0 && psd.wavelengths[i] >= 0.5 && psd.wavelengths[i] <= 2) {
      corrugationEnergy += density * df
      if (density > peak) { peak = density; wavelength = psd.wavelengths[i] }
    }
  })
  const hasCorrugations = psd.totalPower > 1e-12 && corrugationEnergy / psd.totalPower > 0.4
  return {
    status: 'diagnostic', samplingIntervalMeters: intervalMeters, totalLengthMeters: (n - 1) * intervalMeters,
    detrend: 'linear', isoClass: null, isoClassDescription: 'Withheld: ISO 8608 reporting and measurement validation required',
    estimatedIriMPerKm: null, rideQuality: null, roughnessCoefficientG0: g0,
    wavelengthBands, psd, hasCorrugations, corrugationWavelengthMeters: hasCorrugations ? wavelength : undefined,
    limitations: ['Caller must verify uniform station spacing and metre units.', 'Hann periodogram with linear trend removed; band power uses density times bin width.', 'IRI requires a validated quarter-car computation; spectral concentration is not an ISO classification or construction acceptance.'],
  }
}
