import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/scheme/assign — Assign a surveyor to a block
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { project_id, block_id, assigned_to } = await request.json()

    if (!project_id || !block_id) {
      return NextResponse.json({ error: 'project_id and block_id are required' }, { status: 400 })
    }

    const check = await db.query(
      `SELECT b.id, b.project_id FROM blocks b
       JOIN projects p ON p.id = b.project_id
       WHERE b.id = $1 AND p.user_id = $2`,
      [block_id, session.user.id]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 })
    }

    const result = await db.query(
      `INSERT INTO block_assignments (block_id, project_id, assigned_to, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (block_id) DO UPDATE SET
         assigned_to = EXCLUDED.assigned_to,
         assigned_by = EXCLUDED.assigned_by,
         assigned_at = NOW()
       RETURNING *`,
      [block_id, project_id, assigned_to || null, session.user.id]
    )

    if (assigned_to) {
      await db.query(
        `INSERT INTO scheme_activity_log (project_id, user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'block_assigned', 'block', $3, $4)`,
        [project_id, session.user.id, block_id, JSON.stringify({ assigned_to })]
      )
    }

    return NextResponse.json({ data: result.rows[0] }, { status: 201 })
  } catch (error) {
    console.error('Block assignment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/scheme/assign?block_id=X — Remove assignment
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const blockId = searchParams.get('block_id')

    if (!blockId) {
      return NextResponse.json({ error: 'block_id is required' }, { status: 400 })
    }

    const check = await db.query(
      `SELECT ba.id, ba.project_id FROM block_assignments ba
       JOIN projects p ON p.id = ba.project_id
       WHERE ba.block_id = $1 AND p.user_id = $2`,
      [blockId, session.user.id]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    await db.query('DELETE FROM block_assignments WHERE id = $1', [check.rows[0].id])

    return NextResponse.json({ message: 'Assignment removed' })
  } catch (error) {
    console.error('Block unassignment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
