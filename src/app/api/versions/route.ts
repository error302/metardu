/**
 * /api/versions — Entity version history
 * GET: list version history for an entity
 * POST: create manual snapshot
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { z } from 'zod'

const ListVersionsSchema = z.object({
  entity_type: z.enum(['parcels', 'blocks', 'projects', 'traverse_results', 'traverse_history']).optional(),
  entity_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entity_type')
  const entityId = searchParams.get('entity_id')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const offset = parseInt(searchParams.get('offset') || '0')

  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: 'entity_type and entity_id are required', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { rows } = await db.query(
    `SELECT id, entity_type, entity_id, version, snapshot, delta, change_summary, created_by, created_at
     FROM entity_versions
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY version DESC
     LIMIT $3 OFFSET $4`,
    [entityType, entityId, limit, offset]
  )

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*) as total FROM entity_versions WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, entityId]
  )

  return NextResponse.json({
    data: rows,
    total: parseInt(countRows[0]?.total || '0'),
    limit,
    offset,
  })
})

const CreateSnapshotSchema = z.object({
  entity_type: z.string().min(1).max(100),
  entity_id: z.string().uuid(),
  change_summary: z.string().max(500).optional(),
})

export const POST = apiHandler({ auth: true, schema: CreateSnapshotSchema }, async (req, ctx) => {
  const { entity_type, entity_id, change_summary } = ctx.body as z.infer<typeof CreateSnapshotSchema>

  // Get current state from the source table
  const { rows: entityRows } = await db.query(
    `SELECT * FROM ${entity_type} WHERE id = $1`,
    [entity_id]
  )

  if (entityRows.length === 0) {
    return NextResponse.json(
      { error: 'Entity not found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  // Get next version number
  const { rows: versionRows } = await db.query(
    `SELECT COALESCE(MAX(version), 0) + 1 as next_version
     FROM entity_versions WHERE entity_type = $1 AND entity_id = $2`,
    [entity_type, entity_id]
  )

  const nextVersion = versionRows[0]?.next_version || 1

  // Insert snapshot
  const { rows } = await db.query(
    `INSERT INTO entity_versions (entity_type, entity_id, version, snapshot, change_summary, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [entity_type, entity_id, nextVersion, JSON.stringify(entityRows[0]), change_summary || null, ctx.userId]
  )

  return NextResponse.json({ data: rows[0] }, { status: 201 })
})
