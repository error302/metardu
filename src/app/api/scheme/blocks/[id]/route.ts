import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiHandler } from '@/lib/apiHandler'
import { UpdateBlockSchema } from '@/lib/validation/apiSchemas'

export const PATCH = apiHandler(
  { auth: true, schema: UpdateBlockSchema, audit: 'block_updated' },
  async (req, ctx) => {
    const blockId = ctx.params.id
    const { block_number, block_name, description } = ctx.body as {
      block_number?: string; block_name?: string; description?: string
    }

    const check = await db.query(
      `SELECT b.id, b.project_id FROM blocks b
      JOIN projects p ON p.id = b.project_id
      WHERE b.id = $1 AND p.user_id = $2`,
      [blockId, ctx.userId]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 })
    }

    if (block_number) {
      const dupCheck = await db.query(
        `SELECT id FROM blocks WHERE project_id = $1 AND block_number = $2 AND id != $3`,
        [check.rows[0].project_id, block_number, blockId]
      )
      if (dupCheck.rows.length > 0) {
        return NextResponse.json({ error: `Block "${block_number}" already exists` }, { status: 409 })
      }
    }

    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (block_number !== undefined) {
      updates.push(`block_number = $${paramIndex++}`)
      values.push(block_number)
    }
    if (block_name !== undefined) {
      updates.push(`block_name = $${paramIndex++}`)
      values.push(block_name || null)
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      values.push(description || null)
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
  { auth: true, audit: 'block_deleted' },
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
