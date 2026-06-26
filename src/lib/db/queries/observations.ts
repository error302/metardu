/**
 * Observation Database Queries
 * 
 * Handles all observation CRUD and batch operations.
 * Designed for efficient offline-to-server sync.
 */

import prisma from '../client';
import { computationCache, CacheKeys } from '../cache/memory-cache';

// ─── Types ───────────────────────────────────────────────────────

export interface CreateObservationInput {
  surveyId: string;
  fromStationId: string;
  toStationId: string;
  rawHorizontalAngle?: number;
  rawVerticalAngle?: number;
  rawSlopeDistance?: number;
  edmConstant?: number;
  ppmSetting?: number;
  temperature?: number;
  pressure?: number;
  humidity?: number;
  instrumentHeight?: number;
  targetHeight?: number;
  observationDate?: Date;
}

export interface BatchObservationInput {
  surveyId: string;
  observations: CreateObservationInput[];
}

// ─── Queries ─────────────────────────────────────────────────────

/**
 * Get all observations for a survey.
 */
export async function getObservations(surveyId: string) {
  return computationCache.getOrCompute(
    CacheKeys.surveyObservations(surveyId),
    async () => {
      return prisma.observation.findMany({
        where: { surveyId },
        orderBy: { createdAt: 'asc' },
      });
    },
    10 * 60 * 1000
  );
}

/**
 * Create a single observation.
 */
export async function createObservation(input: CreateObservationInput) {
  // Invalidate cache
  computationCache.invalidate(CacheKeys.surveyObservations(input.surveyId));
  
  return prisma.observation.create({
    data: {
      surveyId: input.surveyId,
      fromStationId: input.fromStationId,
      toStationId: input.toStationId,
      rawHorizontalAngle: input.rawHorizontalAngle,
      rawVerticalAngle: input.rawVerticalAngle,
      rawSlopeDistance: input.rawSlopeDistance,
      edmConstant: input.edmConstant,
      ppmSetting: input.ppmSetting,
      temperature: input.temperature,
      pressure: input.pressure,
      humidity: input.humidity,
      instrumentHeight: input.instrumentHeight,
      targetHeight: input.targetHeight,
      observationDate: input.observationDate,
    },
  });
}

/**
 * Batch create observations (for offline sync).
 * 
 * This is the primary way observations are created —
 * surveyors collect data offline and sync in one batch.
 * Uses Prisma createMany for efficient bulk insert.
 */
export async function batchCreateObservations(input: BatchObservationInput) {
  // Invalidate cache
  computationCache.invalidate(CacheKeys.surveyObservations(input.surveyId));
  
  const data = input.observations.map(obs => ({
    surveyId: input.surveyId,
    fromStationId: obs.fromStationId,
    toStationId: obs.toStationId,
    rawHorizontalAngle: obs.rawHorizontalAngle,
    rawVerticalAngle: obs.rawVerticalAngle,
    rawSlopeDistance: obs.rawSlopeDistance,
    edmConstant: obs.edmConstant,
    ppmSetting: obs.ppmSetting,
    temperature: obs.temperature,
    pressure: obs.pressure,
    humidity: obs.humidity,
    instrumentHeight: obs.instrumentHeight,
    targetHeight: obs.targetHeight,
    observationDate: obs.observationDate,
  }));
  
  return prisma.observation.createMany({
    data,
    skipDuplicates: true,
  });
}

/**
 * Update corrected values on an observation.
 * Called after the correction pipeline processes the observation.
 */
export async function updateCorrectedValues(
  id: string,
  corrected: {
    correctedDistance?: number;
    correctedHd?: number;
    correctedVd?: number;
    correctedBearing?: number;
    correctionsLog?: string;
    stdDevDistance?: number;
    stdDevAngle?: number;
  }
) {
  return prisma.observation.update({
    where: { id },
    data: corrected,
  });
}

/**
 * Delete all observations for a survey.
 */
export async function deleteObservationsBySurvey(surveyId: string) {
  computationCache.invalidate(CacheKeys.surveyObservations(surveyId));
  return prisma.observation.deleteMany({
    where: { surveyId },
  });
}
