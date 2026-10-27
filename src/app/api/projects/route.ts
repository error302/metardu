export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler, AppError } from '@/lib/api/handler'
import { db, setRlsContext } from '@/lib/db'
import { checkProjectLimit } from '@/lib/subscription/subscriptionEngine'
import { createProjectSchema } from '@/lib/validation/projectCreation'
import { logger } from '@/lib/logger'
import { horizontalCrsFor } from '@/lib/spatial/projectReferenceSystem'
import { measureMapGridDrawing } from '@/lib/mapDrawing/metrics'

interface ProjectRow {
  id: string
  name: string
  survey_type: string | null
  location: string | null
  utm_zone: number | null
  hemisphere: string | null
  project_type: string
  client_name: string | null
  surveyor_name: string | null
  country: string | null
  datum: string | null
  created_at: string | Date
}

export const POST = apiHandler({
  requireAuth: true,
  schema: createProjectSchema,
  handler: async (ctx) => {
    const validated = ctx.input
    const boundaryToSave = (() => {
      const drawing = validated.boundary_data
      if (drawing?.source !== 'map-drawing') return drawing
      if (!validated.datum || validated.utm_zone == null || !validated.hemisphere) throw new AppError('The drawing grid is incomplete',400,'DRAWING_REFERENCE_REQUIRED')
      const grid = horizontalCrsFor(validated.datum,validated.utm_zone,validated.hemisphere)
      const metrics = measureMapGridDrawing(drawing.drawnFeatures,grid)
      return { ...drawing,drawnAreaSqM:metrics.areaSqM,drawnPerimeterM:metrics.totalLengthM,
        mapDrawing:{ coordinateCrs:'EPSG:4326',evidenceStatus:'map_drawing_unverified',referenceSource:'selected_grid_preview',metrics } }
    })()

    const client = await db.getClient()
    let discardClient = false
    try {
      await client.query<never>('BEGIN')
      await setRlsContext(client)
      // Every admitted create for this account counts after the previous create commits.
      await client.query<{ pg_advisory_xact_lock: unknown }>('SELECT pg_advisory_xact_lock(hashtext($1))', [`project-create:${ctx.userId}`])
      const limitCheck = await checkProjectLimit(ctx.userId, ctx.userEmail, client)
      if (!limitCheck.allowed) throw new AppError(limitCheck.reason || 'Plan limit reached', 402, 'PLAN_LIMIT_REACHED')

      const projectResult = await client.query<ProjectRow>(
        `INSERT INTO projects (user_id, name, survey_type, location, utm_zone, hemisphere,
          project_type, client_name, surveyor_name, country, datum, boundary_data, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,NOW())
         RETURNING id, name, survey_type, location, utm_zone, hemisphere, project_type, created_at`,
        [
          ctx.userId, validated.name, validated.survey_type, validated.location,
          validated.utm_zone ?? null, validated.hemisphere ?? null, validated.project_type,
          validated.client_name ?? null, validated.surveyor_name ?? null,
          validated.country ?? null, validated.datum ?? null,
          boundaryToSave ? JSON.stringify(boundaryToSave) : null,
        ],
      )
      if (projectResult.rowCount !== 1 || projectResult.rows.length !== 1 || !projectResult.rows[0].id) {
        throw new AppError('Project creation was not confirmed', 500, 'PROJECT_CREATE_FAILED')
      }
      const project = projectResult.rows[0]
      if (validated.project_type === 'scheme') {
        const scheme = await client.query<{ project_id: string }>(
          `INSERT INTO scheme_details (project_id, scheme_number, county, sub_county, ward,
              planned_parcels, adjudication_section)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING project_id`,
          [project.id, validated.scheme_number ?? null, validated.county ?? null,
            validated.sub_county ?? null, validated.ward ?? null, validated.planned_parcels ?? 0,
            validated.adjudication_section ?? null],
        )
        if (scheme.rowCount !== 1 || scheme.rows.length !== 1 || scheme.rows[0].project_id !== project.id) {
          throw new AppError('Scheme creation was not confirmed', 500, 'SCHEME_CREATE_FAILED')
        }
      }
      await client.query<never>('COMMIT')
      return NextResponse.json({ data: project }, { status: 201 })
    } catch (error) {
      try { await client.query<never>('ROLLBACK') }
      catch {
        discardClient = true
        logger.error('[POST /api/projects] Rollback failed; discarding the database connection')
      }
      throw error
    } finally { client.release(discardClient ? true : undefined) }

  },
})

export const GET = apiHandler({
  requireAuth: true,
  rateLimit: { max: 60, windowMs: 60000 },
  handler: async (ctx) => {
    // ByteByteGo audit fix: cursor-based pagination (avoids offset performance issues)
    const url = new URL(ctx.req.url)
    const cursor = url.searchParams.get('cursor')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)

    let query: string
    let params: unknown[]

    if (cursor) {
      // Cursor is the created_at of the last item from the previous page
      query = `SELECT id, name, survey_type, location, utm_zone, hemisphere, project_type,
                      client_name, surveyor_name, country, datum, created_at
               FROM projects
               WHERE user_id = $1 AND created_at < $2
               ORDER BY created_at DESC
               LIMIT $3`
      params = [ctx.userId, cursor, limit + 1]
    } else {
      query = `SELECT id, name, survey_type, location, utm_zone, hemisphere, project_type,
                      client_name, surveyor_name, country, datum, created_at
               FROM projects
               WHERE user_id = $1
               ORDER BY created_at DESC
               LIMIT $2`
      params = [ctx.userId, limit + 1]
    }

    const result = await db.query<ProjectRow>(query, params)

    // Check if there are more results
    const hasMore = result.rows.length > limit
    const data = hasMore ? result.rows.slice(0, limit) : result.rows
    const nextCursor = hasMore ? data[data.length - 1]?.created_at : null

    return NextResponse.json({
      data,
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
    })
  },
})
