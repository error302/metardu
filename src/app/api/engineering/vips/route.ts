import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db, setRlsContext } from '@/lib/db'

// POST: Save vertical intersection points for an alignment (upsert by chainage)
export const POST = apiHandler({ auth: true }, async (req, ctx) => {
  const { alignment_id, vips } = ctx.body as {
    alignment_id: string
    vips: {
      chainage: number
      reduced_level: number
      k_value?: number
    }[]
  }

  if (!alignment_id || !vips || !Array.isArray(vips)) {
    return NextResponse.json({ error: 'Missing required fields: alignment_id, vips' }, { status: 400 })
  }

  const client = await db.getClient()

  try {
    await client.query('BEGIN')
    // Set RLS context for this client — CRITICAL for row-level security
    await setRlsContext(client)

    const insertedRows: any[] = []
    for (const vip of vips) {
      const { rows } = await client.query(
        `INSERT INTO vertical_ips (alignment_id, chainage, reduced_level, k_value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (alignment_id, chainage) DO UPDATE SET
          reduced_level = EXCLUDED.reduced_level,
          k_value = EXCLUDED.k_value,
          updated_at = NOW()
         RETURNING *`,
        [alignment_id, vip.chainage, vip.reduced_level, vip.k_value ?? null]
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
