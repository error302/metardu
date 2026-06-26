/**
 * Coordinate Database Queries
 */

import prisma from '../client';
import { computationCache, CacheKeys } from '../cache/memory-cache';

// ─── Types ───────────────────────────────────────────────────────

export interface CreateCoordinateInput {
  surveyId: string;
  stationId: string;
  easting: number;
  northing: number;
  elevation?: number;
  datum?: string;
  projection?: string;
  zone?: number;
  stdDevEasting?: number;
  stdDevNorthing?: number;
  stdDevElevation?: number;
  errorEllipseSemiMajor?: number;
  errorEllipseSemiMinor?: number;
  errorEllipseOrientation?: number;
  confidenceLevel?: number;
  pointScaleFactor?: number;
  gridConvergence?: number;
  isFixed?: boolean;
}

// ─── Queries ─────────────────────────────────────────────────────

/**
 * Get all coordinates for a survey.
 */
export async function getCoordinates(surveyId: string) {
  return computationCache.getOrCompute(
    CacheKeys.surveyCoordinates(surveyId),
    async () => {
      return prisma.coordinate.findMany({
        where: { surveyId },
        include: { station: true },
        orderBy: { station: { order: 'asc' } },
      });
    },
    30 * 60 * 1000
  );
}

/**
 * Create or update a coordinate.
 * Uses upsert to handle re-computation gracefully.
 */
export async function upsertCoordinate(input: CreateCoordinateInput) {
  computationCache.invalidate(CacheKeys.surveyCoordinates(input.surveyId));
  
  return prisma.coordinate.upsert({
    where: { stationId: input.stationId },
    create: {
      surveyId: input.surveyId,
      stationId: input.stationId,
      easting: input.easting,
      northing: input.northing,
      elevation: input.elevation,
      datum: (input.datum as any) ?? 'ARC1960',
      projection: (input.projection as any) ?? 'UTM37S',
      zone: input.zone,
      stdDevEasting: input.stdDevEasting,
      stdDevNorthing: input.stdDevNorthing,
      stdDevElevation: input.stdDevElevation,
      errorEllipseSemiMajor: input.errorEllipseSemiMajor,
      errorEllipseSemiMinor: input.errorEllipseSemiMinor,
      errorEllipseOrientation: input.errorEllipseOrientation,
      confidenceLevel: input.confidenceLevel,
      pointScaleFactor: input.pointScaleFactor,
      gridConvergence: input.gridConvergence,
      isFixed: input.isFixed ?? false,
    },
    update: {
      easting: input.easting,
      northing: input.northing,
      elevation: input.elevation,
      stdDevEasting: input.stdDevEasting,
      stdDevNorthing: input.stdDevNorthing,
      stdDevElevation: input.stdDevElevation,
      errorEllipseSemiMajor: input.errorEllipseSemiMajor,
      errorEllipseSemiMinor: input.errorEllipseSemiMinor,
      errorEllipseOrientation: input.errorEllipseOrientation,
      confidenceLevel: input.confidenceLevel,
      pointScaleFactor: input.pointScaleFactor,
      gridConvergence: input.gridConvergence,
      isFixed: input.isFixed ?? false,
    },
  });
}

/**
 * Batch upsert coordinates (after traverse adjustment).
 */
export async function batchUpsertCoordinates(coords: CreateCoordinateInput[]) {
  // Invalidate all relevant caches
  const surveyIds = new Set(coords.map(c => c.surveyId));
  for (const id of surveyIds) {
    computationCache.invalidate(CacheKeys.surveyCoordinates(id));
  }
  
  // Use transaction for atomic batch operation
  return prisma.$transaction(
    coords.map(coord => 
      prisma.coordinate.upsert({
        where: { stationId: coord.stationId },
        create: {
          surveyId: coord.surveyId,
          stationId: coord.stationId,
          easting: coord.easting,
          northing: coord.northing,
          elevation: coord.elevation,
          datum: (coord.datum as any) ?? 'ARC1960',
          projection: (coord.projection as any) ?? 'UTM37S',
          zone: coord.zone,
          stdDevEasting: coord.stdDevEasting,
          stdDevNorthing: coord.stdDevNorthing,
          errorEllipseSemiMajor: coord.errorEllipseSemiMajor,
          errorEllipseSemiMinor: coord.errorEllipseSemiMinor,
          errorEllipseOrientation: coord.errorEllipseOrientation,
          pointScaleFactor: coord.pointScaleFactor,
          gridConvergence: coord.gridConvergence,
          isFixed: coord.isFixed ?? false,
        },
        update: {
          easting: coord.easting,
          northing: coord.northing,
          elevation: coord.elevation,
          stdDevEasting: coord.stdDevEasting,
          stdDevNorthing: coord.stdDevNorthing,
          errorEllipseSemiMajor: coord.errorEllipseSemiMajor,
          errorEllipseSemiMinor: coord.errorEllipseSemiMinor,
          errorEllipseOrientation: coord.errorEllipseOrientation,
          pointScaleFactor: coord.pointScaleFactor,
          gridConvergence: coord.gridConvergence,
          isFixed: coord.isFixed ?? false,
        },
      })
    )
  );
}
