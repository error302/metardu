export const dynamic = 'force-dynamic'

/**
 * Field Data Sync API Route
 *
 * Handles batch upload of observations collected offline in the field.
 * Surveyors work all day offline (IndexedDB), then sync at end of day.
 *
 * SECURITY: This route requires authentication. The surveyorId and
 * surveyorName are taken from the session, NOT from the request body,
 * to prevent impersonation. (Previously unauthenticated + body-supplied
 * identity — CRITICAL IDOR fixed 2026-07.)
 *
 * This is the ONLY way observations should be created — never one at a time.
 * Single observation creation is available for corrections/revisions only.
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { batchCreateObservations } from '@/lib/db/queries/observations'
import { createAuditLog } from '@/lib/db/queries/audit'
import prisma from '@/lib/db/client'
import { FieldSyncSchema } from '@/lib/validation/apiSchemas'

export const POST = apiHandler(
  { auth: true, schema: FieldSyncSchema, rateLimit: { max: 30, windowMs: 60000 } },
  async (req, ctx) => {
    const { surveyId, observations } = ctx.body as {
      surveyId: string
      observations: Array<Record<string, unknown>>
    }

    // Use session identity — never trust client-supplied surveyorId/Name
    const sessionUserId = (ctx.session?.user as { id?: string })?.id ?? 'unknown'
    const sessionUserName =
      (ctx.session?.user as { name?: string })?.name ??
      (ctx.session?.user as { email?: string })?.email ??
      'Unknown'

    // Verify the survey exists AND its project belongs to the requesting user.
    // Prisma's Project model doesn't expose user_id, so we use raw SQL
    // (the projects table has user_id — see migration 000_canonical_schema.sql).
    const surveyResult = await prisma.$queryRaw<Array<{ project_user_id: string | null }>>`
      SELECT p.user_id as project_user_id
      FROM surveys s
      JOIN projects p ON p.id = s.project_id
      WHERE s.id = ${surveyId}
      LIMIT 1
    `

    if (surveyResult.length === 0) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }

    // Ownership check — survey's project must belong to the requesting user
    const projectUserId = surveyResult[0].project_user_id
    if (projectUserId && projectUserId !== sessionUserId) {
      return NextResponse.json(
        { error: 'Forbidden: survey belongs to another user', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    // Batch create all observations
    const result = await batchCreateObservations({
      surveyId,
      observations: observations.map((obs) => ({
        surveyId,
        fromStationId: (obs.fromStationId as string) ?? '',
        toStationId: (obs.toStationId as string) ?? '',
        rawHorizontalAngle: obs.rawHorizontalAngle as number | undefined,
        rawVerticalAngle: obs.rawVerticalAngle as number | undefined,
        rawSlopeDistance: obs.rawSlopeDistance as number | undefined,
        edmConstant: obs.edmConstant as number | undefined,
        ppmSetting: obs.ppmSetting as number | undefined,
        temperature: obs.temperature as number | undefined,
        pressure: obs.pressure as number | undefined,
        humidity: obs.humidity as number | undefined,
        instrumentHeight: obs.instrumentHeight as number | undefined,
        targetHeight: obs.targetHeight as number | undefined,
        observationDate: obs.observationDate
          ? new Date(obs.observationDate as string)
          : undefined,
      })),
    })

    // Audit log — uses session identity, not client-supplied
    await createAuditLog({
      entityType: 'Survey',
      entityId: surveyId,
      action: 'SYNC_OBSERVATIONS',
      userId: sessionUserId,
      userName: sessionUserName,
      changes: JSON.stringify({ count: observations.length }),
    })

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `Synced ${result.count} observations`,
    })
  }
)

/**
 * GET: Retrieve synced observations for a survey.
 * Used by the client to verify what was synced.
 */
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const url = new URL(req.url)
    const surveyId = url.searchParams.get('surveyId')

    if (!surveyId) {
      return NextResponse.json({ error: 'surveyId required' }, { status: 400 })
    }

    const sessionUserId = (ctx.session?.user as { id?: string })?.id

    // Ownership check — only return observations for surveys the user owns
    const surveyResult = await prisma.$queryRaw<Array<{ project_user_id: string | null }>>`
      SELECT p.user_id as project_user_id
      FROM surveys s
      JOIN projects p ON p.id = s.project_id
      WHERE s.id = ${surveyId}
      LIMIT 1
    `

    if (surveyResult.length === 0) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }

    const projectUserId = surveyResult[0].project_user_id
    if (projectUserId && projectUserId !== sessionUserId) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    const observations = await prisma.observation.findMany({
      where: { surveyId },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ observations, count: observations.length })
  }
)
