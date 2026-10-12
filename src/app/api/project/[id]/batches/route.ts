/**
 * GET/POST /api/project/[id]/batches
 * Record observation batch metadata and source-file hashes for a survey project.
 *
 * Blueprint reference:
 *   §2.3 Raw observations are immutable
 *   §5.2 Observe — observation batches and source metadata
 *   §6.4 Observation batches (traceability, rollback, instrument link)
 */

import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import {
  createObservationBatch,
  listObservationBatches,
  type ObservationSourceType,
} from '@/lib/observations/observationBatches'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(
  { auth: true },
  async (req, ctx) => {
    const params = await ctx.params
    const projectId = params?.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
    }

    const ownership = await requireProjectOwnership(projectId, ctx.userId)
    if (!ownership.ok) {
      if (!ownership.error) throw new Error('Ownership check failed without an error response')
      return ownership.error
    }
    if (ownership.projectUserId !== ctx.userId) {
      return NextResponse.json({ error: 'Project owner required' }, { status: 403 })
    }

    const batches = await listObservationBatches(projectId)
    return apiSuccess({ batches })
  }
)

export const POST = apiHandler(
  { auth: true },
  async (req, ctx) => {
    const params = await ctx.params
    const projectId = params?.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
    }

    const ownership = await requireProjectOwnership(projectId, ctx.userId)
    if (!ownership.ok) {
      if (!ownership.error) throw new Error('Ownership check failed without an error response')
      return ownership.error
    }
    if (ownership.projectUserId !== ctx.userId) {
      return NextResponse.json({ error: 'Project owner required' }, { status: 403 })
    }

    const body = ctx.body as {
      batchNumber: string
      sourceType: ObservationSourceType
      sourceFileName?: string
      sourceFileContent?: string
      operator?: string
      crew?: string
      instrumentId?: string
      instrumentName?: string
      instrumentSerial?: string
      station?: string
      backsight?: string
      instrumentHeight?: number
      targetHeight?: number
      prismConstant?: number
      sourceCrs?: string
      qualityMetadata?: Record<string, unknown>
      pointCount?: number
      observationCount?: number
      notes?: string
    }

    if (!body.batchNumber || !body.sourceType) {
      return NextResponse.json(
        { error: 'batchNumber and sourceType are required' },
        { status: 400 }
      )
    }

    const batch = await createObservationBatch({
      projectId,
      batchNumber: body.batchNumber,
      sourceType: body.sourceType,
      sourceFileName: body.sourceFileName,
      sourceFileContent: body.sourceFileContent,
      operator: body.operator,
      crew: body.crew,
      instrumentId: body.instrumentId,
      instrumentName: body.instrumentName,
      instrumentSerial: body.instrumentSerial,
      station: body.station,
      backsight: body.backsight,
      instrumentHeight: body.instrumentHeight,
      targetHeight: body.targetHeight,
      prismConstant: body.prismConstant,
      sourceCrs: body.sourceCrs,
      qualityMetadata: body.qualityMetadata,
      pointCount: body.pointCount,
      observationCount: body.observationCount,
      notes: body.notes,
      userId: ctx.userId,
    })

    return apiSuccess({ batch, message: 'Observation batch created' }, 201)
  }
)
