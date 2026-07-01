export const dynamic = 'force-dynamic'

/**
 * Field Data Sync API Route
 *
 * Handles batch upload of observations collected offline in the field.
 * Surveyors work all day offline (IndexedDB), then sync at end of day.
 *
 * SECURITY (audit C2, fixed 2026-07-02):
 *   Previously this route accepted `surveyorId` and `surveyorName` from
 *   the request body and wrote them to the audit log without verifying
 *   the session. Any authenticated user could impersonate any surveyor.
 *   Now the route uses `getServerSession` to derive the user identity
 *   from the JWT, ignoring any client-supplied surveyorId/surveyorName.
 *
 * TODO (audit H1): This route uses Prisma models (Survey, Observation)
 *   that don't match the actual SQL schema (which has traverse_observations
 *   and level_observations, not a generic observations table). The Prisma
 *   schema needs reconciliation with the SQL migrations — see
 *   docs/AUDIT.md finding H1.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { batchCreateObservations } from '@/lib/db/queries/observations'
import { createAuditLog } from '@/lib/db/queries/audit'
import prisma from '@/lib/db/client'
import { FieldSyncSchema } from '@/lib/validation/apiSchemas'
import { appendAuditEntry } from '@/lib/audit/auditLog'

export async function POST(request: NextRequest) {
  // ── Auth: derive identity from session, never from body ───────────────
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }
  const userId = session.user.id
  const userName = (session.user as { name?: string }).name ?? session.user.email ?? 'Unknown'

  try {
    const rawBody = await request.json().catch(() => null)
    const parsed = FieldSyncSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 422 }
      )
    }

    // surveyorId/surveyorName from body are IGNORED — identity comes from session.
    const { surveyId, observations } = parsed.data

    // Verify the survey exists AND the user has access to it
    const survey = await prisma.survey.findUnique({
      where: { id: surveyId },
    })

    if (!survey) {
      return NextResponse.json(
        { error: 'Survey not found' },
        { status: 404 }
      )
    }

    // TODO: proper survey-access check once Prisma schema is reconciled (H1).
    // For now, reject if the survey's userId doesn't match the session user.
    // (survey as any).userId avoids TS error on the Prisma type mismatch.
    const surveyOwner = (survey as unknown as { userId?: string }).userId
    if (surveyOwner && surveyOwner !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: survey belongs to another user' },
        { status: 403 }
      )
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
    })

    // Audit log — identity from session, never from body
    await createAuditLog({
      entityType: 'Survey',
      entityId: surveyId,
      action: 'SYNC_OBSERVATIONS',
      userId,
      userName,
      changes: JSON.stringify({ count: observations.length }),
    })

    // Tamper-evident audit chain (audit C3 — wire into more routes)
    try {
      await appendAuditEntry({
        projectId: (survey as unknown as { projectId?: string }).projectId ?? surveyId,
        userId,
        entityType: 'custom',
        entityId: surveyId,
        action: 'import',
        payload: {
          metadata: {
            operation: 'SYNC_OBSERVATIONS',
            count: observations.length,
            syncedAt: new Date().toISOString(),
          },
        },
      })
    } catch {
      // Audit chain failure should NOT block the sync — log and continue.
      console.warn('[sync] appendAuditEntry failed — chain integrity check recommended')
    }

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `Synced ${result.count} observations`,
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}

/**
 * GET: Retrieve synced observations for a survey.
 * Used by the client to verify what was synced.
 */
export async function GET(request: NextRequest) {
  // ── Auth: same fix as POST ────────────────────────────────────────────
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const surveyId = searchParams.get('surveyId')

    if (!surveyId) {
      return NextResponse.json({ error: 'surveyId required' }, { status: 400 })
    }

    const observations = await prisma.observation.findMany({
      where: { surveyId },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ observations, count: observations.length })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
