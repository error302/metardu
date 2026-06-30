export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'

/**
 * GET /api/project/[id]/points
 *
 * Fetch all survey points for a project, ordered by point name.
 * Used by the deed plan generator to auto-populate boundary points
 * from the project's traverse adjustment.
 *
 * Returns: { data: SurveyPoint[] }
 *   where SurveyPoint = {
 *     id, point_name, easting, northing, elevation, code, description, is_control
 *   }
 */
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60000 } },
  async (_req, ctx) => {
    const { id } = ctx.params

    const { rows } = await db.query(
      `SELECT id, point_name, easting, northing, elevation, code, description, is_control
       FROM survey_points
       WHERE project_id = $1
         AND easting IS NOT NULL
         AND northing IS NOT NULL
       ORDER BY point_name ASC`,
      [id]
    )

    return NextResponse.json({ data: rows })
  }
)
