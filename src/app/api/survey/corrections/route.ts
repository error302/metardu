/**
 * Corrections API Route
 * 
 * Apply corrections to a single observation or batch of observations.
 * Returns corrected values with full audit trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  processObservation,
  processObservations,
  generateCorrectionReport,
  KENYA_DEFAULT_CONFIG,
  type PipelineConfig,
  type RawObservation,
} from '@/lib/survey/pipeline/correction-pipeline';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { observation, observations, config = {}, report = false } = body as {
      observation?: RawObservation;
      observations?: RawObservation[];
      config?: Partial<PipelineConfig>;
      report?: boolean;
    };
    
    const pipelineConfig = { ...KENYA_DEFAULT_CONFIG, ...config };
    
    if (observation) {
      // Single observation
      const result = processObservation(observation, pipelineConfig);
      return NextResponse.json({ result });
    }
    
    if (observations) {
      // Batch observations
      const results = processObservations(observations, pipelineConfig);
      
      if (report) {
        const correctionReport = generateCorrectionReport(results);
        return NextResponse.json({ results, report: correctionReport });
      }
      
      return NextResponse.json({ results });
    }
    
    return NextResponse.json(
      { error: 'Provide observation or observations' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Corrections API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Correction failed' },
      { status: 500 }
    );
  }
}
