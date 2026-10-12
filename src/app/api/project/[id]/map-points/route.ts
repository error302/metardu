export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { requireProjectReadAccess } from '@/lib/auth/ownership'
import { db } from '@/lib/db'

// Keep the response and OpenLayers feature count bounded even when a viewport
// contains an entire ward-scale project. The extra row establishes truncation.
const VIEWPORT_POINT_LIMIT = 500

interface PointRow {
  id: string
  point_name: string | null
  easting: number | string
  northing: number | string
  elevation: number | string | null
  code: string | null
  description: string | null
  is_control: boolean
}

interface ClusterFeatureRow {
  id: string | null
  point_name: string | null
  easting: number | string
  northing: number | string
  elevation: number | string | null
  code: string | null
  description: string | null
  is_control: boolean
  feature_kind: 'point' | 'cluster'
  cluster_count: number | string
  cell_min_e: number | string | null
  cell_min_n: number | string | null
  cell_max_e: number | string | null
  cell_max_n: number | string | null
}

interface ExtentRow {
  min_e: number | string | null
  min_n: number | string | null
  max_e: number | string | null
  max_n: number | string | null
  total: number | string
  horizontal_crs: string | null
}

function parseBbox(raw: string | null): [number, number, number, number] | null {
  if (!raw) return null
  const parts = raw.split(',')
  if (parts.length !== 4 || parts.some(part => part.trim() === '')) return null
  const values = parts.map(Number)
  if (values.some(value => !Number.isFinite(value))) return null
  const [minE, minN, maxE, maxN] = values
  if (minE >= maxE || minN >= maxN) return null
  return [minE, minN, maxE, maxN]
}

function parseCellSize(raw: string | null, bbox: [number, number, number, number]): number | null {
  if (!raw || raw.trim() === '') return null
  const value = Number(raw)
  const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1])
  if (!Number.isFinite(value) || value <= 0 || value > span || value < span / 1000) return null
  return value
}

/**
 * Read-only map data. Coordinates are in the project's registered CRS, not
 * Web Mercator. Owners and authorized project or organization members may read it.
 */
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 120, windowMs: 60000 } },
  async (req, ctx) => {
    const projectId = ctx.params.id
    const ownership = await requireProjectReadAccess(projectId, ctx.userId)
    if (!ownership.ok) {
      if (!ownership.error) throw new Error('Ownership check failed without an error response')
      return ownership.error
    }
    const url = new URL(req.url)
    if (url.searchParams.get('mode') === 'extent') {
      const { rows } = await db.query<ExtentRow>(
        `SELECT MIN(easting) AS min_e, MIN(northing) AS min_n,
                MAX(easting) AS max_e, MAX(northing) AS max_n,
                COUNT(*)::bigint AS total,
                (SELECT horizontal_crs
                   FROM project_reference_systems
                  WHERE project_id = $1
                  LIMIT 1) AS horizontal_crs
           FROM survey_points
          WHERE project_id = $1
            AND deleted_at IS NULL
            AND easting IS NOT NULL AND northing IS NOT NULL`,
        [projectId],
      )
      const row = rows[0]
      const coordinates = row && [row.min_e, row.min_n, row.max_e, row.max_n]
      const bounds = coordinates?.every(value => value !== null && value !== undefined)
        ? coordinates.map(Number)
        : null
      const extent = bounds?.every(Number.isFinite)
        ? bounds as [number, number, number, number]
        : null
      return NextResponse.json({
        extent,
        total: Number(row?.total ?? 0),
        meta: {
          project_crs: row?.horizontal_crs
            ? { horizontal_crs: row.horizontal_crs }
            : null,
        },
      })
    }

    const bbox = parseBbox(url.searchParams.get('bbox'))
    const clustered = url.searchParams.get('clustered') === 'true'
    if (!bbox || url.searchParams.has('mode') || (url.searchParams.has('clustered') && !clustered)) {
      return NextResponse.json({ error: 'Valid bbox=minE,minN,maxE,maxN required' }, { status: 400 })
    }

    if (clustered) {
      const cellSize = parseCellSize(url.searchParams.get('cellSize'), bbox)
      if (cellSize === null) {
        return NextResponse.json({
          error: 'Valid cellSize between one-thousandth of the viewport span and the full span is required',
        }, { status: 400 })
      }

      const { rows } = await db.query<ClusterFeatureRow>(
        `WITH viewport_points AS MATERIALIZED (
           SELECT id, point_name, easting, northing, elevation, code, description,
                  COALESCE(is_control, FALSE) AS is_control
             FROM survey_points
            WHERE project_id = $1
              AND deleted_at IS NULL
              AND easting BETWEEN $2 AND $4
              AND northing BETWEEN $3 AND $5
         ), map_features AS (
           SELECT id::text AS id, point_name, easting, northing, elevation,
                  code, description, is_control, 'point'::text AS feature_kind,
                  1::bigint AS cluster_count,
                  NULL::double precision AS cell_min_e,
                  NULL::double precision AS cell_min_n,
                  NULL::double precision AS cell_max_e,
                  NULL::double precision AS cell_max_n
             FROM viewport_points
            WHERE is_control
           UNION ALL
           SELECT CASE WHEN COUNT(*) = 1 THEN MIN(id::text) ELSE NULL END AS id,
                  CASE WHEN COUNT(*) = 1 THEN MIN(point_name)
                       ELSE COUNT(*)::text || ' topo points' END AS point_name,
                  AVG(easting) AS easting,
                  AVG(northing) AS northing,
                  CASE WHEN COUNT(*) = 1 THEN MIN(elevation) ELSE NULL END AS elevation,
                  CASE WHEN COUNT(*) = 1 THEN MIN(code) ELSE NULL END AS code,
                  CASE WHEN COUNT(*) = 1 THEN MIN(description) ELSE NULL END AS description,
                  FALSE AS is_control,
                  CASE WHEN COUNT(*) = 1 THEN 'point' ELSE 'cluster' END AS feature_kind,
                  COUNT(*)::bigint AS cluster_count,
                  CASE WHEN COUNT(*) > 1 THEN MIN(FLOOR(easting / $6) * $6) END AS cell_min_e,
                  CASE WHEN COUNT(*) > 1 THEN MIN(FLOOR(northing / $6) * $6) END AS cell_min_n,
                  CASE WHEN COUNT(*) > 1 THEN MIN(FLOOR(easting / $6) * $6) + $6 END AS cell_max_e,
                  CASE WHEN COUNT(*) > 1 THEN MIN(FLOOR(northing / $6) * $6) + $6 END AS cell_max_n
             FROM viewport_points
            WHERE NOT is_control
            GROUP BY FLOOR(easting / $6), FLOOR(northing / $6)
         )
         SELECT * FROM map_features
          ORDER BY is_control DESC, easting, northing, id NULLS LAST
          LIMIT ${VIEWPORT_POINT_LIMIT + 1}`,
        [projectId, ...bbox, cellSize],
      )
      const truncated = rows.length > VIEWPORT_POINT_LIMIT
      // Controls sort before topo features. This lets the client distinguish a
      // clipped control network (which requires a clear partial-data warning)
      // from a view that simply needs finer topo aggregation.
      const truncationReason = truncated
        ? rows[VIEWPORT_POINT_LIMIT]?.is_control
          ? 'control-points'
          : 'topographic-density'
        : null
      const points = rows.slice(0, VIEWPORT_POINT_LIMIT).map(row => ({
        id: row.id,
        name: row.point_name,
        easting: Number(row.easting),
        northing: Number(row.northing),
        elevation: row.elevation == null ? null : Number(row.elevation),
        code: row.code,
        description: row.description,
        is_control: row.is_control,
        feature_kind: row.feature_kind,
        cluster_count: Number(row.cluster_count),
        cell_extent: row.feature_kind === 'cluster' &&
          row.cell_min_e != null && row.cell_min_n != null &&
          row.cell_max_e != null && row.cell_max_n != null
          ? [Number(row.cell_min_e), Number(row.cell_min_n), Number(row.cell_max_e), Number(row.cell_max_n)]
          : null,
      }))
      return NextResponse.json({ points, truncated, truncationReason, limit: VIEWPORT_POINT_LIMIT, clustered: true })
    }

    if (url.searchParams.has('cellSize')) {
      return NextResponse.json({ error: 'cellSize is only valid with clustered=true' }, { status: 400 })
    }

    const { rows } = await db.query<PointRow>(
      `SELECT id, point_name, easting, northing, elevation,
              code, description, COALESCE(is_control, FALSE) AS is_control
         FROM survey_points
        WHERE project_id = $1
          AND deleted_at IS NULL
          AND easting BETWEEN $2 AND $4
          AND northing BETWEEN $3 AND $5
        ORDER BY easting, northing, id
        LIMIT ${VIEWPORT_POINT_LIMIT + 1}`,
      [projectId, ...bbox],
    )
    const truncated = rows.length > VIEWPORT_POINT_LIMIT
    const points = rows.slice(0, VIEWPORT_POINT_LIMIT).map(row => ({
      id: row.id,
      name: row.point_name,
      easting: Number(row.easting),
      northing: Number(row.northing),
      elevation: row.elevation == null ? null : Number(row.elevation),
      code: row.code,
      description: row.description,
      is_control: row.is_control,
    }))
    return NextResponse.json({ points, truncated, limit: VIEWPORT_POINT_LIMIT })
  },
)
