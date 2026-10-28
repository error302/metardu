import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth/session'
import { validateEquipmentBody as validateBody, equipmentSuccess as apiSuccess } from '@/lib/equipment/validation'
import { assessCalibration, equipmentRegistrationSchema, equipmentUpdateSchema } from '@/lib/equipment/calibration'

interface EquipmentRow {
  id: string
  user_id: string
  name: string
  type: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  purchase_date: string | null
  purchase_cost: string | null
  status: string
  notes: string | null
  interval_days: number
  location: string | null
  created_at: string | Date
  updated_at: string | Date
}

interface EquipmentWithCalibrationRow extends EquipmentRow {
  last_calibrated: string | null
  next_calibration: string | null
  calibration_result: string | null
}

export const dynamic = 'force-dynamic'

/**
 * GET /api/equipment
 * List user's equipment with calibration status.
 * Query: ?include_calibration=true to include latest calibration info
 */
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 120, windowMs: 60000 } },
  async (req, _ctx) => {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const includeCal = url.searchParams.get('include_calibration') === 'true'
    const status = url.searchParams.get('status') || 'active'

    if (includeCal) {
      const result = await db.query<EquipmentWithCalibrationRow>(
        `SELECT e.*, e.purchase_date::text AS purchase_date,
          c.calibration_date::text as last_calibrated,
          c.next_calibration_date::text as next_calibration,
          c.results as calibration_result
         FROM equipment e
         LEFT JOIN LATERAL (
           SELECT * FROM equipment_calibration
           WHERE equipment_id = e.id AND user_id = e.user_id
           ORDER BY calibration_date DESC, created_at DESC, id DESC LIMIT 1
         ) c ON true
         WHERE e.user_id = $1 AND ($2 = 'all' OR e.status = $2)
         ORDER BY e.name ASC`,
        [user.id, status],
      )
      return apiSuccess({ equipment: result.rows.map(row => {
        const assessment = assessCalibration({ date: row.last_calibrated, nextDate: row.next_calibration, intervalDays: row.interval_days, result: row.calibration_result })
        const status = assessment.status === 'ok' ? 'current' : assessment.status === 'due_soon' ? 'expiring' : assessment.status === 'not_recorded' ? 'never' : assessment.status
        return { ...row, calibration_status: status, days_until_expiry: assessment.daysUntilDue, calibration_reason: assessment.statusReason }
      }) })
    }

    const result = await db.query<EquipmentRow>(
      `SELECT *, purchase_date::text AS purchase_date FROM equipment WHERE user_id = $1 AND ($2 = 'all' OR status = $2) ORDER BY name ASC`,
      [user.id, status],
    )
    return apiSuccess({ equipment: result.rows })
  },
)

/**
 * POST /api/equipment
 * Add new equipment.
 */
export const POST = apiHandler(
  {
    auth: true,
    rateLimit: { max: 30, windowMs: 60000 },
    // P1-3 (2026-07-24): Equipment registration affects calibration
    // compliance — total stations with expired calibration produce
    // legally indefensible measurements. Audit chain proves who
    // registered what and when.
    auditChain: {
      entityType: 'system',
      action: 'create',
      reason: 'equipment registration',
    },
  },
  async (req, ctx) => {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = validateBody(ctx.body, equipmentRegistrationSchema)
    const name = body.name
    const type = body.type

    if (!name || !type) {
      return NextResponse.json({ error: 'name and type are required' }, { status: 400 })
    }

    const result = await db.query<EquipmentRow>(
      `INSERT INTO equipment (user_id, name, type, manufacturer, model, serial_number, purchase_date, purchase_cost, status, notes, interval_days, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *, purchase_date::text AS purchase_date`,
      [
        user.id, name, type,
        body.manufacturer || null, body.model || null, body.serialNumber || null,
        body.purchaseDate || null, body.purchaseCost ?? null,
        body.status || 'active', body.notes || null,
        body.intervalDays ?? 365, body.location || null,
      ],
    )

    if (!result.rows[0]) throw new Error('Equipment save was not acknowledged')
    return apiSuccess({ equipment: result.rows[0], message: 'Equipment added' })
  },
)

/**
 * PATCH /api/equipment?id=<id>
 * Update equipment.
 */
export const PATCH = apiHandler(
  {
    auth: true,
    rateLimit: { max: 60, windowMs: 60000 },
    auditChain: {
      entityType: 'system',
      action: 'update',
      reason: 'equipment update',
    },
  },
  async (req, ctx) => {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const equipId = url.searchParams.get('id')
    if (!equipId) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const body = validateBody(ctx.body, equipmentUpdateSchema) as Record<string, unknown>
    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1

    for (const field of ['name', 'type', 'manufacturer', 'model', 'serial_number', 'status', 'notes', 'interval_days', 'location', 'purchase_date', 'purchase_cost']) {
      const camelField = field.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())
      if (body[camelField] !== undefined || body[field] !== undefined) {
        updates.push(`${field} = $${idx}`)
        const value = Object.prototype.hasOwnProperty.call(body, camelField) ? body[camelField] : body[field]
        params.push(field === 'purchase_date' && value === '' ? null : value)
        idx++
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push(`updated_at = NOW()`)
    params.push(equipId, user.id)

    const result = await db.query<EquipmentRow>(
      `UPDATE equipment SET ${updates.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *, purchase_date::text AS purchase_date`,
      params,
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Equipment not found' }, { status: 404 })
    }

    return apiSuccess({ equipment: result.rows[0] })
  },
)

/**
 * DELETE /api/equipment?id=<id> archives the instrument and retains history.
 */
export const DELETE = apiHandler(
  {
    auth: true,
    rateLimit: { max: 30, windowMs: 60000 },
    auditChain: {
      entityType: 'system',
      action: 'delete',
      reason: 'equipment archive',
    },
  },
  async (req, _ctx) => {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const equipId = url.searchParams.get('id')
    if (!equipId) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const archived = await db.query<{ id: string }>(`UPDATE equipment SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id`, [equipId, user.id])
    if (!archived.rows[0]) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 })
    return apiSuccess({ id: archived.rows[0].id, deleted: true, archived: true })
  },
)
