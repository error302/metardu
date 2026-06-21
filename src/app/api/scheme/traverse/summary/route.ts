import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')

  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
  }

  // Verify ownership
  const { rows: projects } = await db.query(
    'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, ctx.userId]
  )
  if (projects.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Get traverse accuracy summary per parcel
  const { rows } = await db.query(
    `SELECT
      pt.id as traverse_id,
      p.id as parcel_id,
      p.parcel_number,
      p.lr_number_proposed,
      b.block_number,
      pt.is_closed,
      pt.perimeter,
      pt.total_perimeter,
      pt.linear_error,
      pt.precision_ratio,
      pt.accuracy_order,
      pt.computed_area_ha,
      pt.status,
      pt.version,
      pt.computed_at
     FROM parcel_traverses pt
     JOIN parcels p ON p.id = pt.parcel_id
     JOIN blocks b ON b.id = p.block_id
     WHERE b.project_id = $1
     ORDER BY b.block_number, p.parcel_number`,
    [projectId]
  )

  // Add accuracy classification
  const classified = rows.map((r: any) => ({
    ...r,
    perimeter: r.perimeter || r.total_perimeter,
    accuracy_class: classifyAccuracy(r.accuracy_order, r.precision_ratio),
  }))

  // Summary stats
  const total = classified.length
  const computed = classified.filter((r: any) => r.status === 'computed' || r.status === 'approved').length
  const passed = classified.filter((r: any) => r.accuracy_class === 'pass').length
  const failed = classified.filter((r: any) => r.accuracy_class === 'fail').length
  const pending = total - computed

  return NextResponse.json({
    data: classified,
    summary: { total, computed, passed, failed, pending }
  })
})

function classifyAccuracy(order: string | null, ratio: number | null): 'pass' | 'warning' | 'fail' | 'pending' {
  if (!order || !ratio) return 'pending'

  // Kenya RDM 2011 accuracy orders
  const orderMap: Record<string, number> = {
    '1st order': 1,
    '2nd order': 2,
    '3rd order': 3,
    '4th order': 4,
  }

  const numericOrder = orderMap[order] || 4

  // Cadastral surveys require at least 3rd order (1:5000)
  if (numericOrder <= 2) return 'pass'       // 1st or 2nd order
  if (numericOrder === 3) return 'warning'    // 3rd order — acceptable but review
  return 'fail'                                // 4th order or worse
}
