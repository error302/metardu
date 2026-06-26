/**
 * Traverse Computation API Route
 * 
 * Accepts raw observations, runs them through the correction pipeline,
 * performs traverse adjustment, and returns adjusted coordinates.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  processObservation,
  KENYA_DEFAULT_CONFIG,
  type PipelineConfig,
  type RawObservation,
} from '@/lib/survey/pipeline/correction-pipeline';
import {
  bowditchAdjustment,
  type TraverseStation,
  type TraverseLeg,
} from '@/lib/survey/traverse/engine';
import {
  leastSquaresAdjustment,
  type LSObservation,
  type LSStation,
} from '@/lib/survey/traverse/least-squares';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      observations,
      stations,
      method = 'bowditch',
      order = 3,
      config = {},
    } = body as {
      observations: RawObservation[];
      stations: TraverseStation[];
      method?: 'bowditch' | 'least_squares';
      order?: number;
      config?: Partial<PipelineConfig>;
    };
    
    if (!observations || !stations) {
      return NextResponse.json(
        { error: 'observations and stations are required' },
        { status: 400 }
      );
    }
    
    // Step 1: Process all observations through the correction pipeline
    const pipelineConfig = { ...KENYA_DEFAULT_CONFIG, ...config };
    const processedObservations = observations.map(obs => 
      processObservation(obs, pipelineConfig)
    );
    
    // Step 2: Build traverse legs from processed observations
    const legs: TraverseLeg[] = processedObservations.map(obs => ({
      fromStation: obs.fromStation,
      toStation: obs.toStation,
      bearing: obs.gridBearing ?? obs.trueBearing ?? 0,
      distance: obs.gridDistance,
      stdDevDistance: 0.005 + obs.gridDistance * 0.00002, // 5mm + 20ppm
      stdDevBearing: 5, // 5 arc-seconds
    }));
    
    // Step 3: Perform traverse adjustment
    let result;
    
    if (method === 'bowditch') {
      result = bowditchAdjustment(stations, legs, order);
    } else {
      // Build least squares inputs from processed observations
      const lsStations: LSStation[] = stations.map(s => ({
        name: s.name,
        easting: s.easting ?? 0,
        northing: s.northing ?? 0,
        isFixed: s.isFixed,
      }));
      
      const lsObservations: LSObservation[] = processedObservations.map(obs => ({
        type: 'distance' as const,
        fromStation: obs.fromStation,
        toStation: obs.toStation,
        value: obs.gridDistance,
        stdDev: 0.005 + obs.gridDistance * 0.00002, // 5mm + 20ppm
      }));
      
      result = leastSquaresAdjustment(lsStations, lsObservations);
    }
    
    return NextResponse.json({
      processedObservations,
      adjustmentResult: result,
      pipelineConfig,
      correctionsApplied: processedObservations.map(obs => ({
        from: obs.fromStation,
        to: obs.toStation,
        rawDistance: obs.rawSlopeDistance,
        gridDistance: obs.gridDistance,
        atmosphericPPM: obs.atmosphericPPM,
        seaLevelPPM: obs.seaLevelPPM,
        lineScaleFactor: obs.lineScaleFactor,
        convergence: obs.convergence,
        warnings: obs.warnings,
      })),
    });
  } catch (error) {
    console.error('Traverse computation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Computation failed' },
      { status: 500 }
    );
  }
}
