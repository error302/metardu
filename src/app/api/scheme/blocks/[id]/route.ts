import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiHandler, checkOptimisticLock } from '@/lib/apiHandler'
import { UpdateBlockSchema } from '@/lib/validation/apiSchemas'

export const dynamic = 'force-dynamic'

export const PATCH = apiHandler(
  { auth: true, schema: UpdateBlockSchema, optimisticLock: true, audit: 'block_updated' , rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const blockId = ctx.params.id
    const validated = ctx.body as Record<string, unknown> & {
      block_number?: string; block_name?: string; description?: string; updated_at?: string
    }

    const check = await db.query(
      `SELECT b.id, b.project_id, b.updated_at FROM blocks b
      JOIN projects p ON p.id = b.project_id
      WHERE b.id = $1 AND p.user_id = $2`,
      [blockId, ctx.userId]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 })
    }

    // Optimistic locking — check if the record was modified since the client last read it
    const conflict = checkOptimisticLock(validated, check.rows[0])
    if (conflict) return conflict

    if (validated.block_number) {
      const dupCheck = await db.query(
        `SELECT id FROM blocks WHERE project_id = $1 AND block_number = $2 AND id != $3`,
        [check.rows[0].project_id, validated.block_number, blockId]
      )
      if (dupCheck.rows.length > 0) {
        return NextResponse.json({ error: `Block "${validated.block_number}" already exists` }, { status: 409 })
      }
    }

    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (validated.block_number !== undefined) {
      updates.push(`block_number = $${paramIndex++}`)
      values.push(validated.block_number)
    }
    if (validated.block_name !== undefined) {
      updates.push(`block_name = $${paramIndex++}`)
      values.push(validated.block_name || null)
    }
    if (validated.description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      values.push(validated.description || null)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push(`updated_at = NOW()`)
    values.push(blockId)
    const result = await db.query(
      `UPDATE blocks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    )

    return NextResponse.json({ data: result.rows[0] })
  }
)

export const DELETE = apiHandler(
  { auth: true, audit: 'block_deleted' , rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const blockId = ctx.params.id

    const check = await db.query(
      `SELECT b.id, b.project_id, b.block_number FROM blocks b
      JOIN projects p ON p.id = b.project_id
      WHERE b.id = $1 AND p.user_id = $2`,
      [blockId, ctx.userId]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 })
    }

    await db.query('DELETE FROM blocks WHERE id = $1', [blockId])

    return NextResponse.json({
      message: `Block "${check.rows[0].block_number}" deleted successfully`
    })
  }
)
