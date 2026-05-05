import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const createParcelSchema = z.object({
  project_id: z.number().int().positive(),
  block_id: z.number().int().positive(),
  parcel_number: z.string().min(1, 'Parcel number is required'),
  lr_number_proposed: z.string().optional(),
  lr_number_confirmed: z.string().optional(),
  area_ha: z.number().nonnegative().optional(),
  status: z.enum(['pending', 'field_complete', 'computed', 'plan_generated', 'submitted', 'approved']).optional().default('pending'),
  assigned_surveyor: z.number().int().optional(),
  notes: z.string().optional(),
})

// POST /api/scheme/parcels — Create a new parcel
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validated = createParcelSchema.parse(body)
    const { project_id, block_id, parcel_number } = validated

    // Verify project belongs to user
    const projectCheck = await db.query(
      'SELECT id, project_type FROM projects WHERE id = $1 AND user_id = $2',
      [project_id, session.user.id]
    )
    if (projectCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Verify block belongs to this project
    const blockCheck = await db.query(
      'SELECT id FROM blocks WHERE id = $1 AND project_id = $2',
      [block_id, project_id]
    )
    if (blockCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Block not found in this project' }, { status: 404 })
    }

    // Check for duplicate parcel number within this block
    const dupCheck = await db.query(
      'SELECT id FROM parcels WHERE block_id = $1 AND parcel_number = $2',
      [block_id, parcel_number]
    )
    if (dupCheck.rows.length > 0) {
      return NextResponse.json(
        { error: `Parcel "${parcel_number}" already exists in this block` },
        { status: 409 }
      )
    }

    // Insert parcel
    const result = await db.query(
      `INSERT INTO parcels (project_id, block_id, parcel_number, lr_number_proposed, lr_number_confirmed, area_ha, status, assigned_surveyor, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        project_id,
        block_id,
        parcel_number,
        validated.lr_number_proposed || null,
        validated.lr_number_confirmed || null,
        validated.area_ha || null,
        validated.status,
        validated.assigned_surveyor || null,
        validated.notes || null,
      ]
    )

    return NextResponse.json({ data: result.rows[0] }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error('Parcel creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/scheme/parcels?block_id=X — List parcels for a block
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const blockId = searchParams.get('block_id')
    const projectId = searchParams.get('project_id')

    if (!blockId && !projectId) {
      return NextResponse.json(
        { error: 'block_id or project_id query parameter is required' },
        { status: 400 }
      )
    }

    if (blockId) {
      // Verify block belongs to user's project
      const check = await db.query(
        `SELECT b.id FROM blocks b
         JOIN projects p ON p.id = b.project_id
         WHERE b.id = $1 AND p.user_id = $2`,
        [blockId, session.user.id]
      )
      if (check.rows.length === 0) {
        return NextResponse.json({ error: 'Block not found' }, { status: 404 })
      }

      const result = await db.query(
        `SELECT p.*, b.block_number, b.block_name
         FROM parcels p
         JOIN blocks b ON b.id = p.block_id
         WHERE p.block_id = $1
         ORDER BY p.parcel_number ASC`,
        [blockId]
      )

      return NextResponse.json({ data: result.rows })
    }

    // If only project_id, get all parcels across all blocks
    if (projectId) {
      const check = await db.query(
        'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
        [projectId, session.user.id]
      )
      if (check.rows.length === 0) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      const result = await db.query(
        `SELECT p.*, b.block_number, b.block_name
         FROM parcels p
         JOIN blocks b ON b.id = p.block_id
         WHERE p.project_id = $1
         ORDER BY b.block_number ASC, p.parcel_number ASC`,
        [projectId]
      )

      return NextResponse.json({ data: result.rows })
    }

    return NextResponse.json({ data: [] })
  } catch (error) {
    console.error('Parcels fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
