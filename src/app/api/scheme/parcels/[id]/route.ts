import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateParcelSchema = z.object({
  parcel_number: z.string().min(1).optional(),
  lr_number_proposed: z.string().nullable().optional(),
  lr_number_confirmed: z.string().nullable().optional(),
  area_ha: z.number().nonnegative().nullable().optional(),
  status: z.enum(['pending', 'field_complete', 'computed', 'plan_generated', 'submitted', 'approved']).optional(),
  assigned_surveyor: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
})

// PATCH /api/scheme/parcels/[id] — Update a parcel
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parcelId = params.id
    const body = await request.json()
    const validated = updateParcelSchema.parse(body)

    // Verify parcel belongs to user's project
    const check = await db.query(
      `SELECT p.id, p.project_id, p.block_id FROM parcels p
       JOIN projects pr ON pr.id = p.project_id
       WHERE p.id = $1 AND pr.user_id = $2`,
      [parcelId, session.user.id]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Parcel not found' }, { status: 404 })
    }

    // If updating parcel_number, check for duplicates within block
    if (validated.parcel_number) {
      const dupCheck = await db.query(
        `SELECT id FROM parcels WHERE block_id = $1 AND parcel_number = $2 AND id != $3`,
        [check.rows[0].block_id, validated.parcel_number, parcelId]
      )
      if (dupCheck.rows.length > 0) {
        return NextResponse.json(
          { error: `Parcel "${validated.parcel_number}" already exists in this block` },
          { status: 409 }
        )
      }
    }

    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    const fieldMap: Record<string, any> = {
      parcel_number: validated.parcel_number,
      lr_number_proposed: validated.lr_number_proposed,
      lr_number_confirmed: validated.lr_number_confirmed,
      area_ha: validated.area_ha,
      status: validated.status,
      assigned_surveyor: validated.assigned_surveyor,
      notes: validated.notes,
    }

    for (const [field, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        updates.push(`"${field}" = $${paramIndex++}`)
        values.push(value)
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    values.push(parcelId)
    const result = await db.query(
      `UPDATE parcels SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    )

    return NextResponse.json({ data: result.rows[0] })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 })
    }
    console.error('Parcel update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/scheme/parcels/[id] — Delete a parcel
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parcelId = params.id

    // Verify parcel belongs to user's project
    const check = await db.query(
      `SELECT p.id, p.parcel_number FROM parcels p
       JOIN projects pr ON pr.id = p.project_id
       WHERE p.id = $1 AND pr.user_id = $2`,
      [parcelId, session.user.id]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Parcel not found' }, { status: 404 })
    }

    await db.query('DELETE FROM parcels WHERE id = $1', [parcelId])

    return NextResponse.json({
      message: `Parcel "${check.rows[0].parcel_number}" deleted successfully`
    })
  } catch (error) {
    console.error('Parcel delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
