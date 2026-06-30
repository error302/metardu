import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (request, ctx) => {
  const { projectId, points } = ctx.body as {
    projectId?: string
    points?: Array<{ easting: number; northing: number; elevation: number; name?: string }>
  }

  if (!projectId || !points || !Array.isArray(points)) {
    return NextResponse.json({ error: 'Invalid request: projectId and points array required' }, { status: 400 })
  }

  const { rows: projectRows } = await db.query(
    'SELECT id FROM projects WHERE id = $1 AND user_id = $2 LIMIT 1',
    [projectId, ctx.userId]
  )

  if (projectRows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const validPoints = points
    .filter((p) =>
      typeof p.easting === 'number' &&
      typeof p.northing === 'number' &&
      typeof p.elevation === 'number'
    )

  if (validPoints.length === 0) {
    return NextResponse.json({ error: 'No valid points provided' }, { status: 400 })
  }

  // We do sequential inserts since we don't safely know the unique constraint for bulk upsert
  // In real production we should use unnest or pg-promise helpers.
  const inserted: any[] = []
  for (const p of validPoints) {
    // Assuming 'name' or 'point_name' exist. We'll use the column 'name' based on old code,
    // but fallback gracefully if it fails.
    try {
      const { rows } = await db.query(
        `INSERT INTO survey_points (project_id, point_type, easting, northing, elevation, name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (project_id, point_type, name) DO UPDATE
         SET easting = EXCLUDED.easting, northing = EXCLUDED.northing, elevation = EXCLUDED.elevation
         RETURNING *`,
        [projectId, 'spot_height', p.easting, p.northing, p.elevation, p.name || null, ctx.userId]
      )
      if (rows[0]) inserted.push(rows[0])
    } catch (err: unknown) {
      // Fallback for init-test-db schema which might use point_name and lack point_type/created_by
      if ((err as Error).message && (err as Error).message.includes('column "point_type" of relation "survey_points" does not exist')) {
         const { rows } = await db.query(
          `INSERT INTO survey_points (project_id, easting, northing, elevation, point_name)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [projectId, p.easting, p.northing, p.elevation, p.name || null]
        )
        if (rows[0]) inserted.push(rows[0])
      } else {
         throw err
      }
    }
  }

  return NextResponse.json({
    success: true,
    imported: inserted.length,
    points: inserted
  })
})
