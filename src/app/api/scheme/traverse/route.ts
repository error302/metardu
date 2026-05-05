import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const saveTraverseSchema = z.object({
  parcel_id: z.number().int().positive(),
  opening_station: z.string().min(1),
  closing_station: z.string().optional(),
  opening_easting: z.number(),
  opening_northing: z.number(),
  opening_rl: z.number().optional(),
  closing_easting: z.number().optional(),
  closing_northing: z.number().optional(),
  backsight_bearing_deg: z.number().optional(),
  backsight_bearing_min: z.number().optional(),
  backsight_bearing_sec: z.number().optional(),
  observations: z.array(z.object({
    station: z.string().min(1),
    bs: z.string().min(1),
    fs: z.string().min(1),
    hcl_deg: z.number().default(0),
    hcl_min: z.number().default(0),
    hcl_sec: z.number().default(0),
    hcr_deg: z.number().default(0),
    hcr_min: z.number().default(0),
    hcr_sec: z.number().default(0),
    slope_dist: z.number().optional(),
    va_deg: z.number().default(0),
    va_min: z.number().default(0),
    va_sec: z.number().default(0),
    ih: z.number().default(0),
    th: z.number().default(0),
    remarks: z.string().optional(),
  })).min(1, 'At least one observation is required'),
})

// POST /api/scheme/traverse — Save observations and compute
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { parcel_id, observations, ...config } = saveTraverseSchema.parse(body)

    // Verify parcel belongs to user's project
    const parcelCheck = await db.query(
      `SELECT p.id, p.project_id FROM parcels p
       JOIN projects pr ON pr.id = p.project_id
       WHERE p.id = $1 AND pr.user_id = $2`,
      [parcel_id, session.user.id]
    )
    if (parcelCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Parcel not found' }, { status: 404 })
    }

    const projectId = parcelCheck.rows[0].project_id
    const isClosed = config.closing_easting !== undefined && config.closing_northing !== undefined

    // Build backsight bearing decimal
    const bsBearing = (config.backsight_bearing_deg || 0) +
      (config.backsight_bearing_min || 0) / 60 +
      (config.backsight_bearing_sec || 0) / 3600

    // Upsert parcel_traverse
    const upsertResult = await db.query(
      `INSERT INTO parcel_traverses (
        parcel_id, project_id, opening_station, closing_station,
        opening_easting, opening_northing, opening_rl,
        closing_easting, closing_northing, backsight_bearing, is_closed, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'computed')
      ON CONFLICT (parcel_id) DO UPDATE SET
        opening_station = EXCLUDED.opening_station,
        closing_station = EXCLUDED.closing_station,
        opening_easting = EXCLUDED.opening_easting,
        opening_northing = EXCLUDED.opening_northing,
        opening_rl = EXCLUDED.opening_rl,
        closing_easting = EXCLUDED.closing_easting,
        closing_northing = EXCLUDED.closing_northing,
        backsight_bearing = EXCLUDED.backsight_bearing,
        is_closed = EXCLUDED.is_closed,
        status = 'computed',
        updated_at = NOW()
      RETURNING *`,
      [
        parcel_id, projectId, config.opening_station, config.closing_station || null,
        config.opening_easting, config.opening_northing, config.opening_rl || null,
        config.closing_easting || null, config.closing_northing || null,
        bsBearing, isClosed,
      ]
    )

    const traverseId = upsertResult.rows[0].id

    // Delete old observations
    await db.query('DELETE FROM traverse_observations WHERE traverse_id = $1', [traverseId])
    await db.query('DELETE FROM traverse_coordinates WHERE traverse_id = $1', [traverseId])

    // Insert new observations
    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i]
      await db.query(
        `INSERT INTO traverse_observations (
          traverse_id, observation_order, station, bs, fs,
          hcl_deg, hcl_min, hcl_sec, hcr_deg, hcr_min, hcr_sec,
          slope_dist, va_deg, va_min, va_sec, ih, th, remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          traverseId, i + 1, obs.station, obs.bs, obs.fs,
          obs.hcl_deg, obs.hcl_min, obs.hcl_sec, obs.hcr_deg, obs.hcr_min, obs.hcr_sec,
          obs.slope_dist || null, obs.va_deg, obs.va_min, obs.va_sec, obs.ih, obs.th,
          obs.remarks || null,
        ]
      )
    }

    // Run computation using the existing traverse engine
    const { computeTraverse } = await import('@/lib/computations/traverseEngine')
    const result = computeTraverse({
      openingEasting: config.opening_easting,
      openingNorthing: config.opening_northing,
      openingRL: config.opening_rl,
      openingStation: config.opening_station,
      closingEasting: config.closing_easting,
      closingNorthing: config.closing_northing,
      closingStation: config.closing_station,
      backsightBearingDeg: config.backsight_bearing_deg || 0,
      backsightBearingMin: config.backsight_bearing_min || 0,
      backsightBearingSec: config.backsight_bearing_sec || 0,
      observations: observations.map(obs => ({
        station: obs.station,
        bs: obs.bs,
        fs: obs.fs,
        hclDeg: String(obs.hcl_deg),
        hclMin: String(obs.hcl_min),
        hclSec: String(obs.hcl_sec),
        hcrDeg: String(obs.hcr_deg),
        hcrMin: String(obs.hcr_min),
        hcrSec: String(obs.hcr_sec),
        slopeDist: String(obs.slope_dist || 0),
        vaDeg: String(obs.va_deg),
        vaMin: String(obs.va_min),
        vaSec: String(obs.va_sec),
        ih: String(obs.ih),
        th: String(obs.th),
        remarks: obs.remarks,
      })),
    })

    // Store computed coordinates
    for (const coord of result.coordinates) {
      await db.query(
        `INSERT INTO traverse_coordinates (traverse_id, station, easting, northing, rl)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (traverse_id, station) DO UPDATE SET
           easting = EXCLUDED.easting, northing = EXCLUDED.northing, rl = EXCLUDED.rl`,
        [traverseId, coord.station, coord.easting, coord.northing, coord.rl || null]
      )
    }

    // Compute area using coordinate method (shoelace)
    let computedAreaHa: number | null = null
    if (result.coordinates.length >= 3) {
      const { coordinateArea } = await import('@/lib/engine/area')
      const areaResult = coordinateArea(
        result.coordinates.map(c => ({ easting: c.easting, northing: c.northing }))
      )
      computedAreaHa = areaResult.areaHa
    }

    // Update traverse with computation results
    await db.query(
      `UPDATE parcel_traverses SET
        total_perimeter = $2,
        linear_error = $3,
        precision_ratio = $4,
        accuracy_order = $5,
        computed_area_ha = $6
      WHERE id = $1`,
      [
        traverseId,
        result.totalPerimeter,
        result.linearError,
        result.precisionRatio,
        result.accuracyOrder,
        computedAreaHa,
      ]
    )

    // Update parcel area if computed
    if (computedAreaHa !== null) {
      await db.query(
        `UPDATE parcels SET area_ha = $2, status = 'computed' WHERE id = $1`,
        [parcel_id, computedAreaHa]
      )
    }

    return NextResponse.json({
      data: {
        traverse: upsertResult.rows[0],
        legs: result.legs,
        coordinates: result.coordinates,
        area_ha: computedAreaHa,
        accuracy: {
          order: result.accuracyOrder,
          precision_ratio: result.precisionRatio,
          linear_error: result.linearError,
          formula: result.formula,
          is_closed: result.isClosed,
        },
      },
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error('Traverse computation error:', error)
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 })
  }
}

// GET /api/scheme/traverse?parcel_id=X — Get existing traverse for a parcel
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const parcelId = searchParams.get('parcel_id')

    if (!parcelId) {
      return NextResponse.json({ error: 'parcel_id is required' }, { status: 400 })
    }

    // Verify parcel belongs to user
    const check = await db.query(
      `SELECT pt.id FROM parcel_traverses pt
       JOIN parcels p ON p.id = pt.parcel_id
       JOIN projects pr ON pr.id = p.project_id
       WHERE pt.parcel_id = $1 AND pr.user_id = $2`,
      [parcelId, session.user.id]
    )

    if (check.rows.length === 0) {
      return NextResponse.json({ data: null })
    }

    const traverseId = check.rows[0].id

    const [traverseRes, obsRes, coordsRes] = await Promise.all([
      db.query('SELECT * FROM parcel_traverses WHERE id = $1', [traverseId]),
      db.query('SELECT * FROM traverse_observations WHERE traverse_id = $1 ORDER BY observation_order', [traverseId]),
      db.query('SELECT * FROM traverse_coordinates WHERE traverse_id = $1 ORDER BY station', [traverseId]),
    ])

    return NextResponse.json({
      data: {
        traverse: traverseRes.rows[0],
        observations: obsRes.rows,
        coordinates: coordsRes.rows,
      },
    })
  } catch (error) {
    console.error('Traverse fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
