import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/scheme/team?project_id=X
 * Returns all surveyors assigned to blocks in a project, plus the project owner.
 */
export const GET = apiHandler({ auth: true }, async (req, ctx) => {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')

  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
  }

  // Get project owner
  const { rows: projects } = await db.query(
    'SELECT u.id, u.email, u.name as full_name, u.role, p.created_at as owner_since FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = $1',
    [projectId]
  )

  if (projects.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Get assigned surveyors
  const { rows: assignments } = await db.query(
    `SELECT
      ba.block_id, b.block_number, b.block_name,
      ba.assigned_to, u.email, u.name as full_name, u.role,
      ba.assigned_at, ba.assigned_by
     FROM block_assignments ba
     JOIN blocks b ON b.id = ba.block_id
     JOIN users u ON u.id = ba.assigned_to
     WHERE b.project_id = $1
     ORDER BY b.block_number`,
    [projectId]
  )

  // Get block stats per assignee
  const { rows: blockStats } = await db.query(
    `SELECT
      b.id as block_id, b.block_number,
      COUNT(p.id) as total_parcels,
      COUNT(CASE WHEN p.status = 'approved' THEN 1 END) as approved,
      COUNT(CASE WHEN p.status IN ('computed', 'plan_generated', 'submitted') THEN 1 END) as in_progress,
      COUNT(CASE WHEN p.status IN ('pending', 'field_complete') THEN 1 END) as pending
     FROM blocks b
     LEFT JOIN parcels p ON p.block_id = b.id
     WHERE b.project_id = $1
     GROUP BY b.id, b.block_number
     ORDER BY b.block_number`,
    [projectId]
  )

  // Build team view
  const owner = projects[0]
  const assigneeMap = new Map<string, {
    user: any
    blocks: any[]
  }>()

  assignments.forEach((a: any) => {
    if (!assigneeMap.has(a.assigned_to)) {
      assigneeMap.set(a.assigned_to, {
        user: { id: a.assigned_to, email: a.email, full_name: a.full_name, role: a.role },
        blocks: [],
      })
    }
    const stats = blockStats.find((s: any) => s.block_id === a.block_id)
    assigneeMap.get(a.assigned_to)!.blocks.push({
      block_id: a.block_id,
      block_number: a.block_number,
      block_name: a.block_name,
      assigned_at: a.assigned_at,
      stats: stats || { total_parcels: 0, approved: 0, in_progress: 0, pending: 0 },
    })
  })

  // Get unassigned blocks
  const assignedBlockIds = new Set(assignments.map((a: any) => a.block_id))
  const { rows: allBlocks } = await db.query(
    'SELECT id, block_number, block_name FROM blocks WHERE project_id = $1 ORDER BY block_number',
    [projectId]
  )
  const unassignedBlocks = allBlocks
    .filter((b: any) => !assignedBlockIds.has(b.id))
    .map((b: any) => {
      const stats = blockStats.find((s: any) => s.block_id === b.id)
      return { ...b, stats: stats || { total_parcels: 0, approved: 0, in_progress: 0, pending: 0 } }
    })

  return NextResponse.json({
    data: {
      owner: { id: owner.id, email: owner.email, full_name: owner.full_name, role: owner.role },
      team: Array.from(assigneeMap.values()),
      unassigned_blocks: unassignedBlocks,
    }
  })
})
