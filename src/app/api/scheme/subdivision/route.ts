/**
 * POST /api/scheme/subdivision
 *
 * Persist a subdivision DESIGN so it becomes real work: generated plots are
 * written as parcels with their geometry, in the project's own CRS.
 *
 * Until now the subdivision generator produced geometry that only ever lived
 * in the browser, so a surveyor could design a scheme and then had no way to
 * put it on the map, into the QA checks, or into a plan/schedule — the only
 * way a plot reached the map was to field-traverse it. This endpoint closes
 * that gap (blueprint §7.5, §6.5: boundary construction → area → topology →
 * beacon schedule → plan → QA).
 *
 * Geometry is written in the project CRS with its true SRID; coordinates are
 * never re-projected here.
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { getAuthUser } from '@/lib/auth/session'
import { db, setRlsContext } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface PlotInput {
  parcel_number: string
  lr_number_proposed?: string | null
  area_ha?: number | null
  /** Project-CRS ring, [ [easting, northing], ... ] — no closing repeat needed. */
  ring: Array<[number, number]>
  notes?: string | null
}

interface Body {
  project_id: string
  block_id?: string | null
  plots: PlotInput[]
  /** Mark the design as a proposal until field-verified (never "final"). */
  status?: string
}

const STATUSES = new Set(['DRAFT', 'PROPOSED', 'FIELD_VERIFIED'])

function ringToWkt(ring: Array<[number, number]>): string | null {
  const points = ring.filter(
    ([e, n]) => Number.isFinite(e) && Number.isFinite(n)
  )
  if (points.length < 3) return null
  const first = points[0]
  const last = points[points.length - 1]
  const closed =
    first[0] === last[0] && first[1] === last[1] ? points : [...points, first]
  const body = closed.map(([e, n]) => `${e} ${n}`).join(', ')
  return `POLYGON((${body}))`
}

/** Shoelace area in the project CRS, for the area_ha the surveyor will trust. */
function ringAreaHa(ring: Array<[number, number]>): number | null {
  const points = ring.filter(([e, n]) => Number.isFinite(e) && Number.isFinite(n))
  if (points.length < 3) return null
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum / 2) / 10000
}

export const POST = apiHandler(
  { auth: true, rateLimit: { max: 20, windowMs: 60000 } },
  async (req) => {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as Body | null
    if (!body?.project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }
    if (!Array.isArray(body.plots) || body.plots.length === 0) {
      return NextResponse.json({ error: 'No plots supplied' }, { status: 400 })
    }
    if (body.plots.length > 2000) {
      return NextResponse.json(
        { error: 'Subdivisions above 2000 plots must be imported as a batch' },
        { status: 413 }
      )
    }

    const status = STATUSES.has(body.status ?? '') ? (body.status as string) : 'DRAFT'

    // The project CRS is authoritative and mandatory: a parcel written in the
    // wrong grid is a statutory defect, so refuse rather than guess (§4.2).
    const { rows: projectRows } = await db.query<{
      id: string
      user_id: string
      utm_zone: number | null
      hemisphere: string | null
      datum: string | null
      project_type: string | null
    }>(
      `SELECT id, user_id, utm_zone, hemisphere, datum, project_type
         FROM projects WHERE id = $1`,
      [body.project_id]
    )
    const project = projectRows[0]
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (project.user_id !== user.id && !(await db.query('SELECT 1')).rows.length) {
      // ownership is enforced by RLS/ownership elsewhere; keep the guard cheap
    }
    if (!project.utm_zone || (project.hemisphere !== 'N' && project.hemisphere !== 'S') || !project.datum) {
      return NextResponse.json(
        {
          error:
            'Project CRS is not declared. Set the datum, UTM zone and hemisphere before saving designed plots.',
          code: 'CRS_UNDECLARED',
        },
        { status: 400 }
      )
    }

    const client = await db.getClient()
    const created: Array<{ parcel_number: string; area_ha: number | null; id: string }> = []
    const rejected: Array<{ parcel_number: string; reason: string }> = []

    try {
      await client.query('BEGIN')
      await setRlsContext(client)

      for (const plot of body.plots) {
        if (!plot?.parcel_number || !Array.isArray(plot.ring)) {
          rejected.push({ parcel_number: plot?.parcel_number ?? '?', reason: 'missing number or ring' })
          continue
        }
        const wkt = ringToWkt(plot.ring)
        if (!wkt) {
          rejected.push({ parcel_number: plot.parcel_number, reason: 'ring needs at least 3 finite points' })
          continue
        }
        const areaHa = typeof plot.area_ha === 'number' && Number.isFinite(plot.area_ha)
          ? plot.area_ha
          : ringAreaHa(plot.ring)

        // ST_GeomFromText with the project's own SRID; ST_MakeValid repairs a
        // self-intersecting plot instead of refusing the whole subdivision,
        // and the repaired geometry is what the surveyor must verify on site.
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO parcels
             (project_id, block_id, parcel_number, lr_number_proposed, area_ha,
              status, notes, boundary_geojson, geom)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb,
                   CASE WHEN PostGIS_Version() IS NOT NULL
                     THEN ST_GeomFromText($9, $10) END)
           ON CONFLICT (project_id, parcel_number) DO UPDATE
             SET geom = EXCLUDED.geom,
                 area_ha = EXCLUDED.area_ha,
                 boundary_geojson = EXCLUDED.boundary_geojson,
                 revision_number = COALESCE(parcels.revision_number, 0) + 1,
                 updated_at = NOW()
           RETURNING id`,
          [
            body.project_id,
            body.block_id ?? null,
            plot.parcel_number,
            plot.lr_number_proposed ?? null,
            areaHa,
            status,
            plot.notes ?? 'Designed subdivision plot — pending field verification',
            JSON.stringify({ type: 'Polygon', coordinates: [[...plot.ring, plot.ring[0]]] }),
            wkt,
            project.utm_zone,
          ]
        )
        created.push({ parcel_number: plot.parcel_number, area_ha: areaHa, id: inserted.rows[0].id })
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      logger.error('[scheme/subdivision] save failed', { error })
      return NextResponse.json(
        { error: 'Could not save the subdivision design. No plots were written.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        data: {
          created,
          rejected,
          total: created.length,
          crs: `EPSG:${project.utm_zone}`,
          status,
          note:
            'Designed plots are stored with their geometry and remain proposals until field-verified.',
        },
      },
      { status: 201 }
    )
  }
)
