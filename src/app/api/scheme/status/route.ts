import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth/rbac'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * Scheme status workflow:
 * planning â†’ in_progress â†’ review â†’ approved
 *
 * Only admin users can advance status.
 * Any status can go back to 'planning' (reset).
 */

const VALID_TRANSITIONS: Record<string, string[]> = {
  planning: ['in_progress'],
  in_progress: ['review', 'planning'],
  review: ['approved', 'in_progress'],
  approved: [], // Terminal â€” only DBA can reopen
}

const statusSchema = z.object({
  project_id: z.string().min(1),
  new_status: z.enum(['planning', 'in_progress', 'review', 'approved']),
  reason: z.string().max(500).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const { rows } = await db.query(
      'SELECT status, updated_at FROM scheme_details WHERE project_id = $1',
      [projectId]
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Scheme not found' }, { status: 404 })
    }

    const current = rows[0].status
    const allowed = VALID_TRANSITIONS[current] || []

    return NextResponse.json({
      data: {
        current_status: current,
        allowed_transitions: allowed,
        workflow: Object.entries(VALID_TRANSITIONS).map(([from, tos]) => ({ from, to: tos })),
      }
    })
  } catch (err: any) {
    console.error('[GET scheme status] Error:', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const userRole = (session.user as any).role || 'surveyor'

    // Only admins can change scheme status
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: 'Only admins can change scheme status' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = statusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
    }

    const { project_id, new_status, reason } = parsed.data
    const userId = session.user.id

    // Get current status
    const { rows: current } = await db.query(
      'SELECT status FROM scheme_details WHERE project_id = $1',
      [project_id]
    )
    if (current.length === 0) {
      return NextResponse.json({ error: 'Scheme not found' }, { status: 404 })
    }

    // Validate transition
    const allowed = VALID_TRANSITIONS[current[0].status] || []
    if (!allowed.includes(new_status) && current[0].status !== new_status) {
      return NextResponse.json({
        error: `Invalid transition: ${current[0].status} â†’ ${new_status}. Allowed: ${allowed.join(', ') || 'none'}`,
        status: 400,
      })
    }

    // Update status
    const { rows } = await db.query(
      'UPDATE scheme_details SET status = $1, updated_at = NOW() WHERE project_id = $2 RETURNING status, updated_at',
      [new_status, project_id]
    )

    // Log activity
    await db.query(
      `INSERT INTO scheme_activity_log (project_id, user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, 'scheme', $1, $4)`,
      [
        project_id,
        userId,
        `status_change:${new_status}`,
        JSON.stringify({ from: current[0].status, to: new_status, reason: reason || null }),
      ]
    )

    return NextResponse.json({
      data: {
        previous_status: current[0].status,
        new_status: rows[0].status,
        updated_at: rows[0].updated_at,
      }
    })
  } catch (err: any) {
    console.error('[POST scheme status] Error:', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
