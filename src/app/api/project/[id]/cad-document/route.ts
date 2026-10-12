export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { cadDocumentSchema } from '@/lib/cad/cadDocumentValidation'

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' }

export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60_000 } },
  async (_request, context) => {
    const projectId = context.params.id
    const ownership = await requireProjectOwnership(projectId, context.userId)
    if (!ownership.ok) {
      if (!ownership.error) throw new Error('Ownership check failed without its error response')
      return ownership.error
    }

    const { rows } = await db.query<{ cad_document: unknown }>(
      `SELECT boundary_data -> 'cadDocument' AS cad_document
         FROM projects
        WHERE id = $1
          AND (user_id = $2 OR user_id IS NULL)
          AND (boundary_data IS NULL OR jsonb_typeof(boundary_data) = 'object')`,
      [projectId, context.userId],
    )
    if (!rows.length) {
      return NextResponse.json({ error: 'Project CAD document was not found.' }, { status: 404, headers: PRIVATE_NO_STORE })
    }

    const parsed = cadDocumentSchema.safeParse(rows[0].cad_document)
    if (!parsed.success) {
      return NextResponse.json({ error: 'This project has no valid saved CAD document.' }, { status: 404, headers: PRIVATE_NO_STORE })
    }

    return NextResponse.json({ document: parsed.data }, { headers: PRIVATE_NO_STORE })
  },
)

export const PUT = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60_000 } },
  async (_request, context) => {
    const body = context.body && typeof context.body === 'object'
      ? context.body as Record<string, unknown>
      : null
    const parsed = cadDocumentSchema.safeParse(body?.document)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'The CAD document is invalid; no project data was changed.' },
        { status: 400, headers: PRIVATE_NO_STORE },
      )
    }

    const projectId = context.params.id
    const ownership = await requireProjectOwnership(projectId, context.userId)
    if (!ownership.ok) {
      if (!ownership.error) throw new Error('Ownership check failed without an error response')
      return ownership.error
    }

    // Save the drawing as its own project artifact. Do not replace
    // boundary_data.adjustedStations: those are survey/computation results,
    // not editable CAD vertices.
    const { rows } = await db.query<{ id: string; updated_at: Date }>(
      `UPDATE projects
          SET boundary_data = jsonb_set(
                COALESCE(boundary_data, '{}'::jsonb),
                '{cadDocument}',
                $2::jsonb,
                true
              ),
              updated_at = NOW()
        WHERE id = $1
          AND (user_id = $3 OR user_id IS NULL)
          AND (boundary_data IS NULL OR jsonb_typeof(boundary_data) = 'object')
        RETURNING id, updated_at`,
      [projectId, JSON.stringify(parsed.data), context.userId],
    )

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Project data could not be saved because its boundary data is not an object.' },
        { status: 409, headers: PRIVATE_NO_STORE },
      )
    }

    return NextResponse.json({ saved: true, updatedAt: rows[0].updated_at }, { headers: PRIVATE_NO_STORE })
  },
)
