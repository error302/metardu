/**
 * /api/equipment/calibration
 *
 * POST — Add a calibration record for a piece of equipment.
 *
 * AUDIT FIX (2026-07-03): This route previously INSERTed into a
 * `calibration_records` table that doesn't exist. The actual table
 * (created in migration 020) is `equipment_calibration` with columns:
 *
 *   equipment_id, user_id, calibration_date, next_calibration_date,
 *   calibrated_by, calibration_lab, certificate_number, results,
 *   notes, report_url
 *
 * We now:
 *   - INSERT into `equipment_calibration` with the correct column
 *     names (mapping the request body fields)
 *   - UPDATE equipment with the last/next calibration dates +
 *     certificate number + lab, matching the existing columns
 *     (last_calibration, next_calibration_due, cert_number,
 *     calibration_lab)
 *
 * Body shape is unchanged so existing UI calls keep working:
 *   { equipmentId, date, certNumber, lab, technician, result,
 *     findings, corrections, nextDueDate, documentPath }
 */

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'
import type { CreateCalibrationRecordRequest } from '@/types/equipment'

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { equipmentId, date, certNumber, lab, technician, result, findings, corrections, nextDueDate, documentPath } =
    ctx.body as { equipmentId: string } & CreateCalibrationRecordRequest

  if (!equipmentId || !date || !nextDueDate) {
    return NextResponse.json(
      { error: 'Missing required fields (equipmentId, date, nextDueDate)' },
      { status: 400 }
    )
  }

  // ── Verify ownership ────────────────────────────────────────────────────
  const equipmentResult = await db.query(
    'SELECT user_id FROM equipment WHERE id = $1',
    [equipmentId]
  )

  if (equipmentResult.rows.length === 0 || equipmentResult.rows[0].user_id !== ctx.userId) {
    return NextResponse.json(
      { error: 'Equipment not found or access denied' },
      { status: 403 }
    )
  }

  // ── INSERT into equipment_calibration ───────────────────────────────────
  // Map request body → actual columns:
  //   date            → calibration_date
  //   nextDueDate     → next_calibration_date
  //   technician      → calibrated_by
  //   lab             → calibration_lab
  //   certNumber      → certificate_number
  //   result          → results
  //   findings + corrections → notes (combined)
  //   documentPath    → report_url
  const notes = [findings, corrections].filter(Boolean).join('\n\n')

  const insertResult = await db.query(
    `INSERT INTO equipment_calibration
       (equipment_id, user_id, calibration_date, next_calibration_date,
        calibrated_by, calibration_lab, certificate_number,
        results, notes, report_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      equipmentId,
      ctx.userId,
      date,              // calibration_date
      nextDueDate,       // next_calibration_date
      technician || null,
      lab || null,
      certNumber || null,
      result || 'pass',  // results
      notes || null,
      documentPath || null,
    ]
  )

  if (insertResult.rows.length === 0) {
    return NextResponse.json(
      { error: 'Failed to add calibration record' },
      { status: 500 }
    )
  }

  // ── UPDATE equipment with calibration summary ───────────────────────────
  // equipment (migration 020) doesn't have these columns by default,
  // so we wrap the UPDATE in a try/catch — if the columns don't exist
  // (older deployments), the calibration record is still saved.
  try {
    await db.query(
      `UPDATE equipment
          SET last_calibration      = $1,
              next_calibration_due  = $2,
              cert_number           = $3,
              calibration_lab       = $4
        WHERE id = $5
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_name = 'equipment'
               AND column_name IN
                   ('last_calibration','next_calibration_due','cert_number','calibration_lab')
             GROUP BY table_name
             HAVING COUNT(*) = 4
          )`,
      [date, nextDueDate, certNumber, lab, equipmentId]
    )
  } catch {
    // Non-fatal — equipment row may lack the optional calibration
    // summary columns. The calibration record itself was saved.
  }

  return NextResponse.json({ recordId: insertResult.rows[0].id })
})
