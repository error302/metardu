/**
 * @module spectralEngine — UI-facing computation engine for Fourier & Spectral Analysis
 *
 * Provides display-ready tables, formatted statistics, and charts-ready data
 * for Road Roughness PSD, Hydrographic Tidal Analysis, and Elevation Despeckling.
 */

import { frequencyFilter } from '../engine/fourier';
import { analyzeRoadProfileRoughness, RoadRoughnessAnalysis } from '../engineering/roadRoughnessPsd';
import { analyzeTidalObservations, TidalAnalysisResult, WaterLevelObservation } from '../engine/tidalHarmonics';

export interface SpectralAnalysisReport {
  timestamp: string;
  roadRoughness?: RoadRoughnessAnalysis;
  tidalAnalysis?: TidalAnalysisResult;
  filteredProfile?: {
    original: number[];
    filtered: number[];
    samplingInterval: number;
    cutoffWavelength: number;
    varianceReductionPercent: number;
  };
}

/**
 * Perform road roughness spectral analysis for UI display
 */
export function computeRoadRoughnessReport(
  elevations: number[],
  intervalMeters: number
): RoadRoughnessAnalysis {
  return analyzeRoadProfileRoughness(elevations, intervalMeters);
}

/**
 * Perform tidal harmonic analysis for UI hydrographic display
 */
export function computeTidalHarmonicReport(
  observations: WaterLevelObservation[],
  constituents?: string[]
): TidalAnalysisResult {
  return analyzeTidalObservations(observations, constituents);
}

/**
 * Filter high-frequency noise from a topographic elevation profile
 */
export function filterProfileNoise(
  elevations: number[],
  intervalMeters: number,
  cutoffWavelengthMeters = 5.0
): {
  original: number[];
  filtered: number[];
  samplingInterval: number;
  cutoffWavelength: number;
  varianceReductionPercent: number;
} {
  if (!Number.isFinite(cutoffWavelengthMeters) || cutoffWavelengthMeters <= 0) throw new Error('Cutoff wavelength must be positive and finite');
  const cutoffFreq = 1 / cutoffWavelengthMeters;
  const filtered = frequencyFilter(elevations, intervalMeters, 'lowpass', { low: cutoffFreq });

  let origVar = 0;
  let diffVar = 0;
  const mean = elevations.reduce((s, v) => s + v, 0) / elevations.length;
  const filteredMean = filtered.reduce((s, v) => s + v, 0) / filtered.length;

  for (let i = 0; i < elevations.length; i++) {
    origVar += Math.pow(elevations[i] - mean, 2);
    diffVar += Math.pow(filtered[i] - filteredMean, 2);
  }

  const reduction = origVar > 0 ? (1 - diffVar / origVar) * 100 : 0;

  return {
    original: elevations.slice(),
    filtered,
    samplingInterval: intervalMeters,
    cutoffWavelength: cutoffWavelengthMeters,
    varianceReductionPercent: Number(reduction.toFixed(1)),
  };
}
