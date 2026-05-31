import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db, setRlsContext } from '@/lib/db'

// POST: Save computed earthworks results for an alignment
export const POST = apiHandler({ auth: true }, async (req, ctx) => {
  const { alignment_id, method, results } = ctx.body as {
    alignment_id: string
    method: string
    results: {
      chainage: number
      cut_area: number
      fill_area: number
      cut_volume: number
      fill_volume: number
      cumulative_cut: number
      cumulative_fill: number
      net_volume: number
      mass_ordinate: number
    }[]
  }

  if (!alignment_id || !method || !results || !Array.isArray(results)) {
    return NextResponse.json({ error: 'Missing required fields: alignment_id, method, results' }, { status: 400 })
  }

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
