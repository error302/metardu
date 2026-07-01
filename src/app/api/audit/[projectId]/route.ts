/**
 * GET /api/audit/[projectId]
 *
 * Returns the audit chain for a project, plus chain integrity status.
 *
 * SECURITY: Verifies the requesting user owns the project before
 * returning audit data. Audit chains contain user IDs, timestamps,
 * and change history — sensitive for compliance and dispute resolution.
 *
 * Query params:
 *   ?entityType=parcel   — filter by entity type
 *   ?entityId=parcel/P1  — filter by entity id
 *   ?limit=100           — max entries (default 200)
 *   ?newestFirst=true    — reverse order (default: oldest first)
 *   ?summary=true        — return only the summary, not the entries
 *
 * Response:
 *   200: { entries: AuditEntry[], summary: ChainSummary, verification: ChainVerification }
 *   200 (summary=true): { summary: ChainSummary, verification: ChainVerification }
 *   403: project belongs to another user (IDOR protection)
 *   404: project not found
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import db from '@/lib/db'
import {
  queryAuditEntries,
  verifyChain,
  getChainSummary,
  type AuditEntityType,
} from '@/lib/audit/auditLog'

export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const { id } = ctx.params
    const userId = ctx.userId
    const url = new URL(req.url)
    const entityType = url.searchParams.get('entityType') as AuditEntityType | null
    const entityId = url.searchParams.get('entityId')
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 200
    const newestFirst = url.searchParams.get('newestFirst') === 'true'
    const summaryOnly = url.searchParams.get('summary') === 'true'

    // IDOR protection — verify the project belongs to the requesting user
    const ownershipResult = await db.query(
      'SELECT user_id FROM projects WHERE id = $1',
      [id]
    )
    if (ownershipResult.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const projectUserId = ownershipResult.rows[0].user_id
    if (projectUserId && projectUserId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: project belongs to another user', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    if (summaryOnly) {
      const summary = await getChainSummary({ projectId: id })
      const verification = await verifyChain({ projectId: id })
      return apiSuccess({ summary, verification })
    }

    const entries = await queryAuditEntries({
      projectId: id,
      entityType: entityType ?? undefined,
      entityId: entityId ?? undefined,
      limit,
      newestFirst,
    })

    const summary = await getChainSummary({ projectId: id })
    const verification = await verifyChain({ projectId: id })

    return apiSuccess({ entries, summary, verification })
  }
)
