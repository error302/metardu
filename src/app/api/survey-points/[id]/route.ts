import { NextResponse } from 'next/server'
import { apiHandler, checkOptimisticLock } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/survey-points/[id]
 *
 * Update a survey point's mutable fields with optimistic locking.
 * Frontend MUST send `updated_at` in the request body — the value should be
 * the `updated_at` timestamp from the most recent GET/fetch of this point.
 * If the DB row's `updated_at` differs (another surveyor edited it), returns 409.
 */
const patchSurveyPointSchema = z.object({
  point_name: z.string().optional(),
  easting: z.number().nullable().optional(),
  northing: z.number().nullable().optional(),
  elevation: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  // Optimistic locking: frontend must send the updated_at value it last read
  updated_at: z.string(),
})

export const PATCH = apiHandler(
  { auth: true, optimisticLock: true, schema: patchSurveyPointSchema },
  async (_req, ctx) => {
    const { id } = ctx.params
    const body = ctx.body as z.infer<typeof patchSurveyPointSchema>

    // Fetch current row for optimistic lock check
    const { rows } = await db.query(
      'SELECT id, updated_at FROM survey_points WHERE id = $1',
      [id]
    )

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Survey point not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    // Optimistic lock check
    const conflict = checkOptimisticLock(body as unknown as Record<string, unknown>, rows[0])
    if (conflict) return conflict

    // Build dynamic UPDATE — only SET fields that were provided
    const fields: string[] = []
    const values: unknown[] = []
    let paramIdx = 1

    const allowedFields: Record<string, string> = {
      point_name: 'point_name',
      easting: 'easting',
      northing: 'northing',
      elevation: 'elevation',
      description: 'description',
      code: 'code',
    }

    for (const [bodyKey, colName] of Object.entries(allowedFields)) {
      if (bodyKey in body && body[bodyKey as keyof typeof body] !== undefined) {
        fields.push(`${colName} = $${paramIdx++}`)
        values.push(body[bodyKey as keyof typeof body])
      }
    }

    if (fields.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update', code: 'NO_FIELDS' },
        { status: 400 }
      )
    }

    // Always bump updated_at
    fields.push(`updated_at = NOW()`)
    values.push(id)

    const result = await db.query(
      `UPDATE survey_points SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    )

    return NextResponse.json({ data: result.rows[0] })
  }
)
