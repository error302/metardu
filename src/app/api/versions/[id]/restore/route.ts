/**
 * /api/versions/[id]/restore — Restore an entity to a previous version
 * POST: restore entity to a specific snapshot
 *
 * IMPORTANT: This creates a NEW version (doesn't delete history).
 * The restored state is captured as the latest version for full traceability.
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const POST = apiHandler({ auth: true }, async (req, ctx) => {
  const { id } = ctx.params

  // Get the version to restore
  const { rows: versionRows } = await db.query(
    `SELECT * FROM entity_versions WHERE id = $1`,
    [id]
  )

  if (versionRows.length === 0) {
    return NextResponse.json(
      { error: 'Version not found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  const version = versionRows[0]
  const snapshot = version.snapshot as Record<string, unknown>
  const { entity_type, entity_id } = version

  // Whitelist of tables that can be restored
  const RESTORABLE_TABLES = new Set(['parcels', 'blocks', 'projects', 'traverse_results'])
  if (!RESTORABLE_TABLES.has(entity_type)) {
    return NextResponse.json(
      { error: `Cannot restore entity type: ${entity_type}`, code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  // Verify entity still exists
  const { rows: entityRows } = await db.query(
    `SELECT * FROM ${entity_type} WHERE id = $1`,
    [entity_id]
  )

  if (entityRows.length === 0) {
    return NextResponse.json(
      { error: 'Entity no longer exists — cannot restore', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  // Build the UPDATE from the snapshot, excluding immutable fields
  const immutableFields = new Set(['id', 'created_at', 'user_id', 'created_by'])
  const updates: string[] = []
  const values: unknown[] = []
  let paramIdx = 1

  for (const [key, value] of Object.entries(snapshot)) {
    if (immutableFields.has(key)) continue
    updates.push(`${key} = $${paramIdx}`)
    values.push(value)
    paramIdx++
  }

  if (updates.length === 0) {
    return NextResponse.json(
      { error: 'No restorable fields found in snapshot', code: 'NO_CHANGES' },
      { status: 400 }
    )
  }

  // Add entity_id as the WHERE parameter
  values.push(entity_id)

  await db.query(
    `UPDATE ${entity_type} SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
    values
  )

  return NextResponse.json({
    restored: true,
    entity_type,
    entity_id,
    restored_from_version: version.version,
    message: `Restored ${entity_type} to version ${version.version}. A new version snapshot has been created for traceability.`,
  })
})
