export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { z } from 'zod'
import { declaredUtmReferenceSchema } from '@/lib/validation/declaredUtmReference'
import { validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { AppError } from '@/lib/api/errors'

interface CorridorNetworkRow {
  id: string
  name: string
  description: string | null
  corridor_name: string | null
  start_chainage: number | null
  end_chainage: number | null
  version: number
  parent_version_id: string | null
  is_active: boolean
  utm_zone: number | null
  hemisphere: string | null
  datum: string | null
  epsg_code: string | null
  established_by: string | null
  status: string | null
  created_by: string | null
  created_at: Date | string
  updated_at: Date | string
  control_points?: CorridorPointRow[]
}

interface CorridorPointRow {
  id: string
  network_id: string
  point_name: string
  point_type: string | null
  easting: number
  northing: number
  elevation: number | null
  chainage: number | null
  offset: number | null
  sigma_e: number | null
  sigma_n: number | null
  sigma_h: number | null
  order: number | null
  epoch_year: number | null
  observation_date: Date | string | null
  description: string | null
}

/**
 * GET /api/corridor-networks
 *   ?corridor_name=A8    — filter by corridor
 *   ?active=true          — only active versions
 *   ?with_points=true     — include control points in response
 *
 * POST /api/corridor-networks
 *   Create a new corridor control network (version 1 or a new version of existing)
 */

export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60000 } },
  async (req, _ctx) => {
    const { searchParams } = new URL(req.url)
    const corridorName = searchParams.get('corridor_name')
    const activeOnly = searchParams.get('active') === 'true'
    const withPoints = searchParams.get('with_points') === 'true'

    let sql = `SELECT * FROM corridor_control_networks WHERE 1=1`
    const params: unknown[] = []
    let idx = 1

    if (corridorName) {
      sql += ` AND corridor_name ILIKE $${idx++}`
      params.push(`%${corridorName}%`)
    }
    if (activeOnly) {
      sql += ` AND is_active = TRUE`
    }
    sql += ` ORDER BY corridor_name, version DESC`

    const { rows: networks } = await db.query<CorridorNetworkRow>(sql, params)

    // Optionally load control points for each network
    if (withPoints && networks.length > 0) {
      const networkIds = networks.map(n => n.id)
      const { rows: points } = await db.query<CorridorPointRow>(
        `SELECT * FROM corridor_control_points WHERE network_id = ANY($1::uuid[]) ORDER BY chainage`,
        [networkIds],
      )
      // Group points by network_id
      const pointsByNetwork = new Map<string, typeof points>()
      for (const p of points) {
        const networkPoints = pointsByNetwork.get(p.network_id)
        if (networkPoints) networkPoints.push(p)
        else pointsByNetwork.set(p.network_id, [p])
      }
      // Attach points to networks
      for (const n of networks) {
        n.control_points = pointsByNetwork.get(n.id) || []
      }
    }

    return NextResponse.json({ data: networks, count: networks.length })
  },
)

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  corridor_name: z.string().optional(),
  start_chainage: z.number().optional(),
  end_chainage: z.number().optional(),
  established_by: z.string().optional(),
  control_points: z.array(z.object({
    point_name: z.string(),
    point_type: z.string().default('traverse'),
    easting: z.number().finite(),
    northing: z.number().finite(),
    elevation: z.number().finite().optional(),
    chainage: z.number().optional(),
    offset: z.number().default(0),
    sigma_e: z.number().optional(),
    sigma_n: z.number().optional(),
    sigma_h: z.number().optional(),
    order: z.string().optional(),
    epoch_year: z.number().int().optional(),
    observation_date: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
}).and(declaredUtmReferenceSchema).transform((body, ctx) => {
  // A transform runs only after successful reference admission. Zod refinements
  // can also run on a dirty intersection, where the CRS is not yet usable.
  body.control_points?.forEach((point, index) => {
    const range = validateCoordinateRange(point.easting, point.northing, body.epsg_code)
    if (!range.valid) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['control_points', index], message: range.errors.join('; ') })
  })
  return body
})

export const POST = apiHandler(
  {
    auth: true,
    schema: createSchema,
    rateLimit: { max: 20, windowMs: 60000 },
    auditChain: {
      entityType: 'document',
      action: 'create',
      reason: 'Corridor control network created',
    },
  },
  async (_req, ctx) => {
    const body = ctx.body as z.infer<typeof createSchema>

    const network = await db.transaction(async client => {
      // Also serialize an empty version stream; row locks alone cannot do this.
      await client.query<never>('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`corridor-network:${body.name}`])
      const { rows: existing } = await client.query<Pick<CorridorNetworkRow, 'id' | 'version' | 'created_by'>>(
        `SELECT id, version, created_by FROM corridor_control_networks
         WHERE name = $1 ORDER BY version DESC, id DESC LIMIT 2 FOR UPDATE`,
        [body.name],
      )

      if (existing[0] && existing[0].created_by !== ctx.userId) {
        throw new AppError('Only the recorded owner can create a new version of this named control network.', 403, 'CORRIDOR_OWNER')
      }
      if (existing[0] && (!Number.isSafeInteger(existing[0].version) || existing[0].version < 1 || existing[1]?.version === existing[0].version)) {
        throw new AppError('The existing network version history is ambiguous. Review it before creating another version.', 409, 'CORRIDOR_VERSION')
      }
      const { rows: activeHeads } = await client.query<Pick<CorridorNetworkRow, 'id'>>(
        `SELECT id FROM corridor_control_networks WHERE name = $1 AND is_active = TRUE FOR UPDATE`,
        [body.name],
      )
      if (activeHeads.length > 1 || activeHeads.some(head => head.id !== existing[0]?.id)) {
        throw new AppError('The existing network has inconsistent active versions. Review its history before creating another version.', 409, 'CORRIDOR_VERSION')
      }
      const newVersion = existing.length > 0 ? existing[0].version + 1 : 1
      const parentId = existing.length > 0 ? existing[0].id : null

      // Deactivate old version
      if (parentId) {
        const deactivated = await client.query<{ id: string }>(
          `UPDATE corridor_control_networks SET is_active = FALSE WHERE id = $1 AND created_by = $2 RETURNING id`,
          [parentId, ctx.userId],
        )
        if (deactivated.rows.length !== 1) throw new AppError('The previous network version could not be superseded.', 409, 'CORRIDOR_VERSION')
      }

      // Create new network
      const { rows: networkRows } = await client.query<CorridorNetworkRow>(
        `INSERT INTO corridor_control_networks
          (name, description, corridor_name, start_chainage, end_chainage,
           version, parent_version_id, is_active,
           utm_zone, hemisphere, datum, epsg_code, established_by, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $10, $11, $12, 'draft', $13)
         RETURNING *`,
        [
          body.name, body.description, body.corridor_name,
          body.start_chainage, body.end_chainage,
          newVersion, parentId,
          body.utm_zone, body.hemisphere, body.datum, body.epsg_code,
          body.established_by, ctx.userId,
        ],
      )

      const createdNetwork = networkRows[0]
      if (!createdNetwork) throw new AppError('The network version was not stored.', 500, 'CORRIDOR_VERSION')

      // Insert control points if provided
      if (body.control_points && body.control_points.length > 0) {
        for (const cp of body.control_points) {
          const savedPoint = await client.query<{ id: string }>(
            `INSERT INTO corridor_control_points
              (network_id, point_name, point_type, easting, northing, elevation,
               chainage, "offset", sigma_e, sigma_n, sigma_h, "order", epoch_year,
               observation_date, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
            [
              createdNetwork.id, cp.point_name, cp.point_type, cp.easting, cp.northing,
              cp.elevation, cp.chainage, cp.offset,
              cp.sigma_e, cp.sigma_n, cp.sigma_h, cp.order,
              cp.epoch_year, cp.observation_date, cp.description,
            ],
          )
          if (savedPoint.rows.length !== 1) throw new AppError('A control point was not stored. No network version was saved.', 500, 'CORRIDOR_POINT')
        }
      }

      return createdNetwork
    })

    return NextResponse.json({ data: network }, { status: 201 })
  },
)
