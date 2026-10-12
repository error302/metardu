/**
 * GET /api/project/[id]/evidence
 * Retrieve the append-only cryptographic evidence event timeline for a survey project.
 *
 * Blueprint reference:
 *   §14.3 Evidence events
 *   §19 Evidence events schema
 */

import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { getEvidenceTimeline } from '@/lib/observations/observationBatches'

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

    const events = await getEvidenceTimeline(projectId, 100)
    return apiSuccess({ events })
  }
)
