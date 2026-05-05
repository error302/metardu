import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const createBlockSchema = z.object({
  project_id: z.number().int().positive(),
  block_number: z.string().min(1, 'Block number is required'),
  block_name: z.string().optional(),
  description: z.string().optional(),
})

// POST /api/scheme/blocks — Create a new block
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { project_id, block_number, block_name, description } = createBlockSchema.parse(body)

    // Verify the project belongs to this user
    const projectCheck = await db.query(
      'SELECT id, project_type FROM projects WHERE id = $1 AND user_id = $2',
      [project_id, session.user.id]
    )
    if (projectCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (projectCheck.rows[0].project_type !== 'scheme') {
      return NextResponse.json({ error: 'Only scheme projects can have blocks' }, { status: 400 })
    }

    // Check for duplicate block number within this project
    const dupCheck = await db.query(
      'SELECT id FROM blocks WHERE project_id = $1 AND block_number = $2',
      [project_id, block_number]
    )
    if (dupCheck.rows.length > 0) {
      return NextResponse.json({ error: `Block "${block_number}" already exists in this project` }, { status: 409 })
    }

    // Insert block
    const result = await db.query(
      `INSERT INTO blocks (project_id, block_number, block_name, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [project_id, block_number, block_name || null, description || null]
    )

    return NextResponse.json({ data: result.rows[0] }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error('Block creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/scheme/blocks?project_id=X — List blocks for a project
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')

    if (!projectId) {
      return NextResponse.json({ error: 'project_id query parameter is required' }, { status: 400 })
    }

    // Verify project belongs to user
    const projectCheck = await db.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, session.user.id]
    )
    if (projectCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get blocks with parcel counts
    const result = await db.query(
      `SELECT b.*,
              COALESCE(pc.parcel_count, 0) as parcel_count,
              COALESCE(pc.completed_count, 0) as completed_count
       FROM blocks b
       LEFT JOIN (
         SELECT block_id,
                COUNT(*) as parcel_count,
                COUNT(*) FILTER (WHERE status IN ('approved', 'submitted')) as completed_count
         FROM parcels
         GROUP BY block_id
       ) pc ON pc.block_id = b.id
       WHERE b.project_id = $1
       ORDER BY b.block_number ASC`,
      [projectId]
    )

    return NextResponse.json({ data: result.rows })
  } catch (error) {
    console.error('Blocks fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
