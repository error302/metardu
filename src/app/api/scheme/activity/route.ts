import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

const validActions = [
  'block_created', 'block_updated', 'block_deleted',
  'parcel_created', 'parcel_updated', 'parcel_deleted', 'parcel_computed',
  'traverse_saved', 'deed_plan_generated', 'form_generated',
  'batch_generated', 'rim_generated', 'block_assigned', 'status_changed',
] as const
const validEntities = ['block', 'parcel', 'traverse', 'scheme', 'project'] as const

// POST /api/scheme/activity — Log an activity
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { project_id, action, entity_type, entity_id, details } = body

    if (!project_id || !action || !entity_type) {
      return NextResponse.json({ error: 'project_id, action, and entity_type are required' }, { status: 400 })
    }

    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 })
    }

    if (!validEntities.includes(entity_type)) {
      return NextResponse.json({ error: `Invalid entity_type: ${entity_type}` }, { status: 400 })
    }

    // Verify project belongs to user
    const check = await db.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [project_id, session.user.id]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const result = await db.query(
      `INSERT INTO scheme_activity_log (project_id, user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        project_id,
        session.user.id,
        action,
        entity_type,
        entity_id || null,
        details ? JSON.stringify(details) : null,
      ]
    )

    return NextResponse.json({ data: result.rows[0] }, { status: 201 })
  } catch (error) {
    console.error('Activity log error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/scheme/activity?project_id=X — Get activity log for a project
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const check = await db.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, session.user.id]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const result = await db.query(
      `SELECT al.*, u.name as user_name, u.email as user_email
       FROM scheme_activity_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.project_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2`,
      [projectId, limit]
    )

    return NextResponse.json({ data: result.rows })
  } catch (error) {
    console.error('Activity fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
