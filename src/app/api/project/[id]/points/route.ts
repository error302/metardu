export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { requireProjectOwnership, requireProjectReadAccess } from '@/lib/auth/ownership'
import { z } from 'zod'
import { AppError } from '@/lib/api/errors'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { resolveEpsg, transformPoint, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'

interface SurveyPointFullRow {
  id: string
  point_name: string
  easting: number | null
  northing: number | null
  elevation: number | null
  code: string | null
  description: string | null
  is_control: boolean
  datum: string | null
  projection: string | null
  utm_zone: string | null
  hemisphere: string | null
  horizontal_crs: string | null
  vertical_datum: string | null
  epoch_year: number | null
  std_dev_e: number | null
  std_dev_n: number | null
  std_dev_z: number | null
  error_ellipse_major: number | null
  error_ellipse_minor: number | null
  error_ellipse_orient: number | null
  confidence_level: string | null
  source: string | null
  instrument_id: string | null
  observer_id: string | null
  import_session_id: string | null
  observation_date: Date | null
  created_at: Date
  updated_at: Date
}

/**
 * GET /api/project/[id]/points
 *
 * Fetch projected survey points for a project, ordered by point name.
 * includeIncomplete=true also returns missing coordinates for complete terrain
 * source review; the consumer must reject unknowns rather than infer zero.
 * Used by the deed plan generator, contour generator, mutation plan,
 * cross-sections, and earthworks tools to auto-populate from project data.
 *
 * AUDIT FIX (C5, 2026-07-02): Expanded SELECT to include the CRS,
 * accuracy, and provenance columns added by migration 027. This lets
 * downstream tools (LSA, deformation analysis, deed plan generation)
 * know the datum, zone, accuracy, and source of each coordinate.
 *
 * Read access is limited to the owner and authorized project/organization
 * members. Write operations still use owner/role-specific checks below.
 *
 * Returns: { data: SurveyPoint[], meta: { project_crs } }
 *   where SurveyPoint = {
 *     id, point_name, easting, northing, elevation, code, description, is_control,
 *     datum, projection, utm_zone, hemisphere, epoch_year,
 *     std_dev_e, std_dev_n, std_dev_z,
 *     error_ellipse_major, error_ellipse_minor, error_ellipse_orient, confidence_level,
 *     source, instrument_id, observer_id, import_session_id, observation_date
 *   }
 *   meta.project_crs = { horizontal_crs } from the declared project reference system;
 *   null means the surveyor has not declared a CRS and map placement must fail closed.
 */
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const { id } = ctx.params

    // T1.7: Verify project ownership before returning data (IDOR fix).
    const ownership = await requireProjectReadAccess(id, ctx.userId)
    if (!ownership.ok) {
  if (!ownership.error) throw new Error('Ownership check failed without an error response')
  return ownership.error
}

    const reviewFlag = new URL(req.url).searchParams.get('includeIncomplete')
    if (reviewFlag !== null && reviewFlag !== 'true' && reviewFlag !== 'false') {
      return NextResponse.json({ error: 'includeIncomplete must be true or false.' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } })
    }
    const includeIncomplete = reviewFlag === 'true'

    const { rows } = await db.query<SurveyPointFullRow>(
      `SELECT
         -- Identity
         id, point_name,
         easting::double precision AS easting,
         northing::double precision AS northing,
         elevation::double precision AS elevation,
         code, description, is_control,
         -- CRS (migration 027)
         datum, projection, utm_zone, hemisphere, horizontal_crs, vertical_datum, epoch_year,
         -- Accuracy (migration 027)
         std_dev_e, std_dev_n, std_dev_z,
         error_ellipse_major, error_ellipse_minor, error_ellipse_orient, confidence_level,
         -- Provenance (migration 027)
         source, instrument_id, observer_id, import_session_id, observation_date,
         -- Timestamps
         created_at, updated_at
       FROM survey_points
       WHERE project_id = $1
         AND deleted_at IS NULL
         ${includeIncomplete ? '' : 'AND easting IS NOT NULL AND northing IS NOT NULL'}
       ORDER BY point_name ASC ${includeIncomplete ? 'LIMIT 10001' : ''}`,
      [id]
    )

    if (includeIncomplete && rows.length > 10000) {
      return NextResponse.json({ code: 'CONTOUR_SOURCE_TOO_LARGE', error: 'This project exceeds the 10,000-row terrain review limit. Import an explicitly selected survey area; no rows were silently truncated.' }, { status: 413, headers: { 'Cache-Control': 'private, no-store' } })
    }

    // Map coordinates use the explicit project declaration. The legacy
    // projects.datum/utm_zone columns may contain values materialized from
    // retired defaults and are not evidence of a surveyor declaration.
    const projectResult = await db.query<{ horizontal_crs: string | null }>(
      `SELECT horizontal_crs
       FROM project_reference_systems
       WHERE project_id = $1`,
      [id]
    )
    const projectCrs = projectResult.rows[0] ?? null

    return NextResponse.json({
      data: rows,
      meta: {
        project_id: id,
        project_crs: projectCrs
          ? {
              horizontal_crs: projectCrs.horizontal_crs,
            }
          : null,
        count: rows.length,
        includes_incomplete: includeIncomplete,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
)

/**
 * POST /api/project/[id]/points
 * Create or register a survey point / control mark for a project.
 */
const pointSchema = z.object({
  pointName: z.string().trim().min(1).max(100),
  easting: z.number().finite(), northing: z.number().finite(),
  elevation: z.number().finite().min(-10000).max(100000).nullable().prefault(null),
  code: z.string().trim().max(20).optional(), description: z.string().trim().max(4000).optional(),
  isControl: z.boolean().prefault(false),
}).strict()
export const POST = apiHandler(
  { auth: true, schema: pointSchema, rateLimit: { max: 60, windowMs: 60000 } },
  async (_req, ctx) => {
    const { id } = ctx.params
    const ownership = await requireProjectOwnership(id, ctx.userId)
    if (!ownership.ok) {
      if (!ownership.error) throw new Error('Ownership check failed without an error response')
      return ownership.error
    }

    const body = ctx.body as z.infer<typeof pointSchema>
    const point = await db.transaction(async client => {
      const project = (await client.query<{ user_id: string | null }>('SELECT user_id FROM projects WHERE id=$1 FOR UPDATE', [id])).rows[0]
      if (project?.user_id !== ctx.userId) throw new AppError('An owned project is required', 403, 'POINT_REFERENCE')
      const referenceRow = (await client.query<Record<string, unknown>>('SELECT * FROM project_reference_systems WHERE project_id=$1 FOR SHARE', [id])).rows[0]
      const reference = resolveStageReference(referenceRow, {})
      if (!reference.code || reference.source !== 'declared') throw new AppError('Declare the project reference before registering coordinates', 400, 'POINT_REFERENCE')
      if (body.elevation !== null && !reference.verticalDatum) throw new AppError('Declare a vertical datum before registering a height', 400, 'POINT_REFERENCE')
      const info = resolveEpsg(reference.code), range = validateCoordinateRange(body.easting, body.northing, reference.code)
      if (!range.valid) throw new AppError(range.errors.join('; '), 400, 'POINT_REFERENCE')
      if ((await client.query<{ '?column?': number }>('SELECT 1 FROM survey_points WHERE project_id=$1 AND point_name=$2 AND deleted_at IS NULL', [id, body.pointName])).rowCount) throw new AppError('This project already has a point with that name', 409, 'POINT_REFERENCE')
      const [lon, lat] = transformPoint(body.easting, body.northing, info.code, 'EPSG:4326')
      const saved = (await client.query<SurveyPointFullRow>(`INSERT INTO survey_points(project_id,point_name,easting,northing,elevation,code,description,is_control,source,horizontal_crs,vertical_datum,datum,projection,utm_zone,hemisphere,geom)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9,$10,$11,$12,$13,$14,ST_SetSRID(ST_MakePoint($15,$16),4326))
        RETURNING *,easting::double precision AS easting,northing::double precision AS northing,elevation::double precision AS elevation`,
        [id,body.pointName,body.easting,body.northing,body.elevation,body.code||null,body.description||null,body.isControl,info.code,body.elevation===null?null:reference.verticalDatum,info.datum,info.zone?'UTM':info.name.slice(0,20),info.zone??null,info.hemisphere??null,lon,lat])).rows[0]
      await logAuditEvent({userId:ctx.userId,action:'create',resourceType:'survey_points',resourceId:saved.id,timestamp:new Date(),details:{input:body,reference:referenceRow,fieldVerified:false}},client)
      return saved
    })
    return NextResponse.json({ data: point, fieldVerified: false }, { status: 201 })
  }
)
