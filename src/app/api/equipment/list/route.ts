import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const result = await db.query(
    'SELECT * FROM equipment WHERE user_id = $1 ORDER BY created_at DESC',
    [ctx.userId]
  )

  const formatted = (result.rows || []).map((eq: Record<string, unknown>) => ({
    id: eq.id,
    userId: eq.user_id,
    name: eq.name,
    type: eq.type,
    make: eq.manufacturer,
    model: eq.model,
    serialNumber: eq.serial_number,
    purchaseDate: eq.purchase_date,
    status: eq.status,
    notes: eq.notes,
    calibrationHistory: []
  }))

  return NextResponse.json({ equipment: formatted })
})
