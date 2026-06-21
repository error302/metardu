/**
 * /api/versions/[id]/diff — Compare two versions of an entity
 * GET: get diff between two versions
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { id } = ctx.params
  const { searchParams } = new URL(req.url)
  const compareWith = searchParams.get('compare_with') // version number to compare against

  if (!compareWith) {
    return NextResponse.json(
      { error: 'compare_with query parameter (version number) is required', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  // Get the target version
  const { rows: targetRows } = await db.query(
    `SELECT * FROM entity_versions WHERE id = $1`,
    [id]
  )

  if (targetRows.length === 0) {
    return NextResponse.json(
      { error: 'Version not found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  const target = targetRows[0]

  // Get the comparison version
  const { rows: compareRows } = await db.query(
    `SELECT * FROM entity_versions
     WHERE entity_type = $1 AND entity_id = $2 AND version = $3`,
    [target.entity_type, target.entity_id, parseInt(compareWith)]
  )

  if (compareRows.length === 0) {
    return NextResponse.json(
      { error: `Version ${compareWith} not found for this entity`, code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  const compare = compareRows[0]

  // Compute diff between the two snapshots
  const targetSnapshot = target.snapshot as Record<string, unknown>
  const compareSnapshot = compare.snapshot as Record<string, unknown>

  const changes: Array<{
    field: string
    old_value: unknown
    new_value: unknown
  }> = []

  const allKeys = Array.from(new Set([
    ...Object.keys(targetSnapshot),
    ...Object.keys(compareSnapshot),
  ]))

  for (const key of allKeys) {
    // Skip internal fields
    if (['id', 'created_at', 'updated_at'].includes(key)) continue

    const oldVal = compareSnapshot[key]
    const newVal = targetSnapshot[key]

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, old_value: oldVal, new_value: newVal })
    }
  }

  return NextResponse.json({
    entity_type: target.entity_type,
    entity_id: target.entity_id,
    from_version: compare.version,
    to_version: target.version,
    from_date: compare.created_at,
    to_date: target.created_at,
    changes,
    change_count: changes.length,
  })
})
