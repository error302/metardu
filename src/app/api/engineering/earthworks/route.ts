export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db, setRlsContext } from '@/lib/db'
import { SaveEarthworksSchema } from '@/lib/validation/apiSchemas'

// POST: Save computed earthworks results for an alignment
export const POST = apiHandler({ auth: true, schema: SaveEarthworksSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { alignment_id, method, results } = ctx.body as z.infer<typeof SaveEarthworksSchema>

  const client = await db.getClient()

  try {
    await client.query('BEGIN')
    // Set RLS context for this client — CRITICAL for row-level security
    await setRlsContext(client)

    // Delete existing earthworks results for this alignment + method
    await client.query(
      'DELETE FROM earthworks_results WHERE alignment_id = $1 AND method = $2',
      [alignment_id, method]
    )

    const insertedRows: any[] = []
    for (const row of results) {
      const { rows } = await client.query(
        `INSERT INTO earthworks_results (
          alignment_id, method, chainage,
          cut_area, fill_area, cut_volume, fill_volume,
          cumulative_cut, cumulative_fill, net_volume, mass_ordinate
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          alignment_id,
          method,
          row.chainage,
          row.cut_area,
          row.fill_area,
          row.cut_volume,
          row.fill_volume,
          row.cumulative_cut,
          row.cumulative_fill,
          row.net_volume,
          row.mass_ordinate,
        ]
      )
      insertedRows.push(rows[0])
    }

    await client.query('COMMIT')

    return NextResponse.json({ data: insertedRows })
  } catch (txErr) {
    await client.query('ROLLBACK')
    throw txErr
  } finally {
    client.release()
  }
})
