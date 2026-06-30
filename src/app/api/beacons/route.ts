import { NextResponse } from 'next/server'
import { apiHandler, apiSuccess } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth/session'
import { validateBody, beaconInputSchema } from '@/lib/validation/apiValidation'

export const dynamic = 'force-dynamic'

/**
 * GET /api/beacons
 * Search the global beacon registry.
 * Query: q (text), easting+northing+radius (proximity), county, beacon_type
 */
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 120, windowMs: 60000 } },
  async (req, ctx) => {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const q = url.searchParams.get('q') || ''
    const easting = url.searchParams.get('easting')
    const northing = url.searchParams.get('northing')
    const radius = parseInt(url.searchParams.get('radius') || '500', 10)
    const county = url.searchParams.get('county')
    const beaconType = url.searchParams.get('beacon_type')
    const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10))

    // Proximity search
    if (easting && northing) {
      const e = parseFloat(easting)
      const n = parseFloat(northing)
      if (!isFinite(e) || !isFinite(n)) {
        return NextResponse.json({ error: 'Invalid easting/northing' }, { status: 400 })
      }
      const result = await db.query(
        `SELECT * FROM find_nearby_beacons($1, $2, $3, $4)`,
        [e, n, radius, limit],
      )
      return apiSuccess({
        beacons: result.rows,
        searchType: 'proximity',
        center: { easting: e, northing: n },
        radiusM: radius,
      })
    }

    // Text search
    let whereClause = 'WHERE 1=1'
    const params: unknown[] = []
    let paramIdx = 1

    if (q) {
      whereClause += ` AND beacon_number ILIKE $${paramIdx}`
      params.push(`%${q}%`)
      paramIdx++
    }
    if (county) {
      whereClause += ` AND county ILIKE $${paramIdx}`
      params.push(`%${county}%`)
      paramIdx++
    }
    if (beaconType) {
      whereClause += ` AND beacon_type = $${paramIdx}`
      params.push(beaconType)
      paramIdx++
    }
    params.push(limit)

    const result = await db.query(
      `SELECT id, beacon_number, beacon_type, easting, northing, elevation, utm_zone,
              datum, county, sub_county, locality, sheet_number, established_by,
              established_date, condition, description, is_adopted, source, created_at
       FROM beacon_registry ${whereClause}
       ORDER BY beacon_number ASC LIMIT $${paramIdx}`,
      params,
    )

    return apiSuccess({ beacons: result.rows, searchType: 'text', total: result.rows.length })
  },
)

/**
 * POST /api/beacons
 * Add a beacon to the registry.
 */
export const POST = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60000 } },
  async (req, ctx) => {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = validateBody(ctx.body, beaconInputSchema)
    const beaconNumber = body.beaconNumber
    const easting = body.easting
    const northing = body.northing

    const result = await db.query(
      `INSERT INTO beacon_registry (beacon_number, beacon_type, easting, northing, elevation, county, sub_county, locality, sheet_number, established_by, established_date, condition, description, is_adopted, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, beacon_number, easting, northing, created_at`,
      [
        beaconNumber, String(body.beaconType || 'concrete'), easting, northing,
        body.elevation || null, body.county || null, body.subCounty || null,
        body.locality || null, body.sheetNumber || null, body.establishedBy || null,
        body.establishedDate || null, body.condition || 'good',
        body.description || null, body.isAdopted || false, user.id,
      ],
    )

    return apiSuccess({ beacon: result.rows[0], message: 'Beacon added to registry' })
  },
)
