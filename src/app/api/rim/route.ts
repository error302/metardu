// ============================================================
// METARDU — RIM Editor API Route
// Resurvey and Index Map CRUD + PDF Generation
//
// Install at: src/app/api/rim/route.ts
//
// GET    /api/rim?projectId=xxx              → List RIM sections
// POST   /api/rim                             → Create section / add parcel / add beacon / generate PDF
// PUT    /api/rim                             → Update section
// DELETE /api/rim?rimSectionId=xxx            → Delete section + related parcels & beacons
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import db from '@/lib/db'
import { apiSuccess, apiError } from '@/lib/api/response'
import { createRimTables } from '@/lib/rim'
import { generateRimPdf } from '@/lib/rim'
import type { RimSection, RimParcel, RimBeacon } from '@/lib/rim'

export const dynamic = 'force-dynamic'

// ────────────────────────────────────────────────────────────
// GET — List RIM sections for a project
// ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized'), { status: 401 })
    }

    const projectId = request.nextUrl.searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json(apiError('projectId is required'), { status: 400 })
    }

    const { rows } = await db.query(
      `SELECT
         rs.*,
         (SELECT COUNT(*)::int FROM rim_parcels WHERE rim_section_id = rs.id) AS parcel_count,
         (SELECT COUNT(*)::int FROM rim_beacons WHERE rim_section_id = rs.id) AS beacon_count
       FROM rim_sections rs
       WHERE rs.user_id = $1 AND rs.project_id = $2
       ORDER BY rs.updated_at DESC`,
      [session.user.id, projectId],
    )

    return NextResponse.json(apiSuccess(rows))
  } catch (error) {
    console.error('[rim] GET error:', error)
    return NextResponse.json(
      apiError('Failed to fetch RIM sections'),
      { status: 500 },
    )
  }
}

// ────────────────────────────────────────────────────────────
// POST — Create section / add parcel / add beacon / generate PDF
// ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized'), { status: 401 })
    }

    // Ensure tables exist
    await createRimTables()

    const body = await request.json()
    const { action } = body

    // ── Create Section ────────────────────────────────────────
    if (action === 'create_section') {
      const data = body.data as Partial<RimSection>
      if (!data.project_id) {
        return NextResponse.json(apiError('project_id is required'), { status: 400 })
      }

      const { rows } = await db.query(
        `INSERT INTO rim_sections (
           user_id, project_id, section_name, registry, district,
           map_sheet_number, scale, datum, projection,
           total_area, parcels_count, status, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          session.user.id,
          data.project_id,
          data.section_name || '',
          data.registry || '',
          data.district || '',
          data.map_sheet_number || '',
          data.scale || '1:2500',
          data.datum || 'Arc 1960',
          data.projection || 'UTM Zone 37S',
          data.total_area || 0,
          data.parcels_count || 0,
          data.status || 'draft',
          data.notes || '',
        ],
      )

      return NextResponse.json(apiSuccess(rows[0]), { status: 201 })
    }

    // ── Add Parcel ────────────────────────────────────────────
    if (action === 'add_parcel') {
      const { rimSectionId, ...parcelData } = body.data as Partial<RimParcel> & { rimSectionId: string }

      if (!rimSectionId) {
        return NextResponse.json(apiError('rimSectionId is required'), { status: 400 })
      }

      const { rows } = await db.query(
        `INSERT INTO rim_parcels (
           rim_section_id, parcel_number, area, land_use,
           owner_name, beacon_count, northings, eastings, is_landmark
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          rimSectionId,
          parcelData.parcel_number || '',
          parcelData.area || 0,
          parcelData.land_use || '',
          parcelData.owner_name || '',
          parcelData.beacon_count || 0,
          parcelData.northings || [],
          parcelData.eastings || [],
          parcelData.is_landmark || false,
        ],
      )

      // Update parcels_count on the section
      await db.query(
        `UPDATE rim_sections
         SET parcels_count = (SELECT COUNT(*) FROM rim_parcels WHERE rim_section_id = $1),
             updated_at = NOW()
         WHERE id = $1`,
        [rimSectionId],
      )

      return NextResponse.json(apiSuccess(rows[0]), { status: 201 })
    }

    // ── Add Beacon ────────────────────────────────────────────
    if (action === 'add_beacon') {
      const { rimSectionId, ...beaconData } = body.data as Partial<RimBeacon> & { rimSectionId: string }

      if (!rimSectionId) {
        return NextResponse.json(apiError('rimSectionId is required'), { status: 400 })
      }

      const { rows } = await db.query(
        `INSERT INTO rim_beacons (
           rim_section_id, beacon_number, easting, northing,
           description, type, survey_status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          rimSectionId,
          beaconData.beacon_number || '',
          beaconData.easting || 0,
          beaconData.northing || 0,
          beaconData.description || '',
          beaconData.type || 'Pillar',
          beaconData.survey_status || 'Original',
        ],
      )

      return NextResponse.json(apiSuccess(rows[0]), { status: 201 })
    }

    // ── Generate PDF ──────────────────────────────────────────
    if (action === 'generate_pdf') {
      const { rimSectionId } = body

      if (!rimSectionId) {
        return NextResponse.json(apiError('rimSectionId is required'), { status: 400 })
      }

      // Fetch section
      const sectionResult = await db.query(
        'SELECT * FROM rim_sections WHERE id = $1 AND user_id = $2',
        [rimSectionId, session.user.id],
      )
      if (sectionResult.rows.length === 0) {
        return NextResponse.json(apiError('RIM section not found'), { status: 404 })
      }
      const section: RimSection = sectionResult.rows[0]

      // Fetch parcels
      const parcelsResult = await db.query(
        'SELECT * FROM rim_parcels WHERE rim_section_id = $1 ORDER BY parcel_number',
        [rimSectionId],
      )
      const parcels: RimParcel[] = parcelsResult.rows

      // Fetch beacons
      const beaconsResult = await db.query(
        'SELECT * FROM rim_beacons WHERE rim_section_id = $1 ORDER BY beacon_number',
        [rimSectionId],
      )
      const beacons: RimBeacon[] = beaconsResult.rows

      // Generate PDF
      const pdfBytes = generateRimPdf(section, parcels, beacons)
      const buffer = Buffer.from(pdfBytes)

      const filename = `RIM_${section.map_sheet_number || 'draft'}_${section.section_name.replace(/\s+/g, '_')}.pdf`

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(buffer.byteLength),
        },
      })
    }

    return NextResponse.json(
      apiError(`Unknown action: ${action || '(missing)'}. Supported: create_section, add_parcel, add_beacon, generate_pdf`),
      { status: 400 },
    )
  } catch (error) {
    console.error('[rim] POST error:', error)
    const message = error instanceof Error ? error.message : 'Failed to process RIM request'
    return NextResponse.json(apiError(message), { status: 500 })
  }
}

// ────────────────────────────────────────────────────────────
// PUT — Update RIM section
// ────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized'), { status: 401 })
    }

    const body = await request.json()
    const { action, id, data } = body

    if (action === 'update_section') {
      if (!id) {
        return NextResponse.json(apiError('id is required'), { status: 400 })
      }

      // Build dynamic SET clause from provided fields
      const fields: string[] = []
      const values: unknown[] = []
      let paramIdx = 1

      const allowedFields = [
        'section_name', 'registry', 'district', 'map_sheet_number',
        'scale', 'datum', 'projection', 'total_area', 'parcels_count',
        'status', 'notes',
      ] as const

      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          fields.push(`${field} = $${paramIdx}`)
          values.push(data[field])
          paramIdx++
        }
      }

      if (fields.length === 0) {
        return NextResponse.json(apiError('No fields to update'), { status: 400 })
      }

      // Always update updated_at
      fields.push(`updated_at = NOW()`)
      values.push(session.user.id) // for WHERE clause

      const sql = `UPDATE rim_sections SET ${fields.join(', ')}
                   WHERE id = $${paramIdx} AND user_id = $${paramIdx + 1}
                   RETURNING *`

      const { rows } = await db.query(sql, [...values, id, session.user.id])

      if (rows.length === 0) {
        return NextResponse.json(apiError('RIM section not found'), { status: 404 })
      }

      return NextResponse.json(apiSuccess(rows[0]))
    }

    return NextResponse.json(
      apiError(`Unknown action: ${action || '(missing)'}. Supported: update_section`),
      { status: 400 },
    )
  } catch (error) {
    console.error('[rim] PUT error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update RIM section'
    return NextResponse.json(apiError(message), { status: 500 })
  }
}

// ────────────────────────────────────────────────────────────
// DELETE — Remove RIM section and all related data
// ────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized'), { status: 401 })
    }

    const rimSectionId = request.nextUrl.searchParams.get('rimSectionId')
    if (!rimSectionId) {
      return NextResponse.json(apiError('rimSectionId is required'), { status: 400 })
    }

    // CASCADE deletes parcels and beacons automatically via FK ON DELETE CASCADE
    const { rows } = await db.query(
      `DELETE FROM rim_sections
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [rimSectionId, session.user.id],
    )

    if (rows.length === 0) {
      return NextResponse.json(apiError('RIM section not found'), { status: 404 })
    }

    return NextResponse.json(apiSuccess({ deleted: true, id: rows[0].id }))
  } catch (error) {
    console.error('[rim] DELETE error:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete RIM section'
    return NextResponse.json(apiError(message), { status: 500 })
  }
}
