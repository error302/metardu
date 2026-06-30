export const dynamic = 'force-dynamic'

/**
 * Field Data Sync API Route
 * 
 * Handles batch upload of observations collected offline in the field.
 * Surveyors work all day offline (IndexedDB), then sync at end of day.
 * 
 * This is the ONLY way observations should be created — never one at a time.
 * Single observation creation is available for corrections/revisions only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { batchCreateObservations } from '@/lib/db/queries/observations';
import { createAuditLog } from '@/lib/db/queries/audit';
import prisma from '@/lib/db/client';
import { FieldSyncSchema } from '@/lib/validation/apiSchemas';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = FieldSyncSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 422 }
      );
    }

    const { surveyId, observations, surveyorId, surveyorName } = parsed.data;

    // Verify the survey exists
    const survey = await prisma.survey.findUnique({
      where: { id: surveyId },
    });

    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      );
    }

    // Batch create all observations
    const result = await batchCreateObservations({
      surveyId,
      observations: observations.map(obs => ({
        surveyId,
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
        observationDate: obs.observationDate ? new Date(obs.observationDate) : undefined,
      })),
    });

    // Audit log
    await createAuditLog({
      entityType: 'Survey',
      entityId: surveyId,
      action: 'SYNC_OBSERVATIONS',
      userId: surveyorId ?? 'unknown',
      userName: surveyorName ?? 'Unknown',
      changes: JSON.stringify({ count: observations.length }),
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `Synced ${result.count} observations`,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}

/**
 * GET: Retrieve synced observations for a survey.
 * Used by the client to verify what was synced.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const surveyId = searchParams.get('surveyId');
    
    if (!surveyId) {
      return NextResponse.json({ error: 'surveyId required' }, { status: 400 });
    }
    
    const observations = await prisma.observation.findMany({
      where: { surveyId },
      orderBy: { createdAt: 'asc' },
    });
    
    return NextResponse.json({ observations, count: observations.length });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
