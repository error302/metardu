import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiHandler } from '@/lib/apiHandler'
import { UpdateParcelSchema } from '@/lib/validation/apiSchemas'

export const dynamic = 'force-dynamic'

export const PATCH = apiHandler(
  { auth: true, schema: UpdateParcelSchema, audit: 'parcel_updated' },
  async (req, ctx) => {
    const parcelId = ctx.params.id
    const validated = ctx.body as {
      parcel_number?: string; lr_number_proposed?: string; lr_number_confirmed?: string;
      area_ha?: number; status?: string; assigned_surveyor?: string | null; notes?: string;
      updated_at?: string
    }

    const check = await db.query(
      `SELECT p.id, p.project_id, p.block_id, p.updated_at FROM parcels p
      JOIN projects pr ON pr.id = p.project_id
      WHERE p.id = $1 AND pr.user_id = $2`,
      [parcelId, ctx.userId]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Parcel not found' }, { status: 404 })
    }

    if (validated.updated_at) {
      const dbUpdatedAt = new Date(check.rows[0].updated_at).toISOString()
      const clientUpdatedAt = new Date(validated.updated_at).toISOString()
      if (dbUpdatedAt !== clientUpdatedAt) {
        return NextResponse.json(
          { error: 'This parcel was modified by another user. Please refresh and retry.', code: 'CONFLICT' },
          { status: 409 }
        )
      }
    }

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

    updates.push(`updated_at = NOW()`)
    values.push(parcelId)
    const result = await db.query(
      `UPDATE parcels SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    )

    return NextResponse.json({ data: result.rows[0] })
  }
)

export const DELETE = apiHandler(
  { auth: true, audit: 'parcel_deleted' },
  async (req, ctx) => {
    const parcelId = ctx.params.id

    const check = await db.query(
      `SELECT p.id, p.parcel_number FROM parcels p
      JOIN projects pr ON pr.id = p.project_id
      WHERE p.id = $1 AND pr.user_id = $2`,
      [parcelId, ctx.userId]
    )
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Parcel not found' }, { status: 404 })
    }

    await db.query('DELETE FROM parcels WHERE id = $1', [parcelId])

    return NextResponse.json({
      message: `Parcel "${check.rows[0].parcel_number}" deleted successfully`
    })
  }
)
