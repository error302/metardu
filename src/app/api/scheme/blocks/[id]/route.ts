import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateBlockSchema = z.object({
  block_number: z.string().min(1).optional(),
  block_name: z.string().optional(),
  description: z.string().optional(),
})

// PATCH /api/scheme/blocks/[id] — Update a block
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const blockId = params.id
    const body = await request.json()
    const { block_number, block_name, description } = updateBlockSchema.parse(body)

    // Verify block belongs to user's project
    const check = await db.query(
      `SELECT b.id, b.project_id FROM blocks b
       JOIN projects p ON p.id = b.project_id
       WHERE b.id = $1 AND p.user_id = $2`,
      [blockId, session.user.id]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 })
    }

    // If updating block_number, check for duplicates
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

    values.push(blockId)
    const result = await db.query(
      `UPDATE blocks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    )

    return NextResponse.json({ data: result.rows[0] })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error('Block update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/scheme/blocks/[id] — Delete a block and its parcels
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const blockId = params.id

    // Verify block belongs to user's project
    const check = await db.query(
      `SELECT b.id, b.project_id, b.block_number FROM blocks b
       JOIN projects p ON p.id = b.project_id
       WHERE b.id = $1 AND p.user_id = $2`,
      [blockId, session.user.id]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 })
    }

    // Delete block (parcels cascade-delete due to FK ON DELETE CASCADE)
    await db.query('DELETE FROM blocks WHERE id = $1', [blockId])

    return NextResponse.json({
      message: `Block "${check.rows[0].block_number}" deleted successfully`
    })
  } catch (error) {
    console.error('Block delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
