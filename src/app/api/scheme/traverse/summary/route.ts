import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ─── DB Row Interfaces ───────────────────────────────────────────────────────

interface ProjectRow {
  id: string
}

interface TraverseResultRow {
  traverse_id: string
  project_id: string
  traverse_name: string | null
  method: string | null
  status: string | null
  results: Record<string, unknown> | null
  created_at: Date | string
  updated_at: Date | string
}

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')

  if (!z.string().uuid().safeParse(projectId).success) {
    return NextResponse.json({ error: 'A valid project_id is required' }, { status: 400 })
  }

  // Verify ownership
  const { rows: projects } = await db.query<ProjectRow>(
    'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, ctx.userId]
  )
  if (projects.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // A failed read must remain unavailable rather than become an empty register.
  const { rows } = await db.query<TraverseResultRow>(
    `SELECT
        tr.id as traverse_id,
        tr.project_id,
        tr.traverse_name,
        tr.method,
        tr.status,
        tr.results,
        tr.created_at,
        tr.updated_at
       FROM traverse_results tr
       JOIN projects p ON p.id=tr.project_id
       WHERE tr.project_id = $1 AND p.user_id=$2
       ORDER BY tr.created_at DESC,tr.id DESC`,
    [projectId, ctx.userId]
  )

  const classified = rows.map((r) => {
    const res = r.results ?? {}
    return {
      ...r,
      is_closed: res.is_closed ?? null,
      perimeter: res.perimeter ?? res.total_perimeter ?? null,
      linear_error: res.linear_error ?? null,
      precision_ratio: res.precision_ratio ?? null,
      accuracy_order: res.accuracy_order ?? null,
      computed_area_ha: res.computed_area_ha ?? null,
      computed_at: r.updated_at,
      // Recorded order/ratio alone do not provide adopted criteria or the
      // underlying field evidence needed for an accuracy assessment.
      accuracy_class: 'pending',
      assessment: 'unassessed',
    }
  })

  // Summary stats
  const total = classified.length
  const computed = classified.filter((r) => r.status === 'computed' || r.status === 'approved').length
  const pending = total - computed

  return NextResponse.json({
    data: classified,
    summary: { total, computed, passed: 0, failed: 0, pending, unassessed: total },
    assessment: 'unassessed',
  }, { headers: { 'Cache-Control': 'private, no-store' } })
})
