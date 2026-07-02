export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db, setRlsContext } from '@/lib/db'
import { SaveStationsSchema } from '@/lib/validation/apiSchemas'

// POST: Save cross-section station data (bulk upsert)
export const POST = apiHandler({ auth: true, schema: SaveStationsSchema, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { alignment_id, stations } = ctx.body as z.infer<typeof SaveStationsSchema>

  const client = await db.getClient()

  try {
    await client.query('BEGIN')
    // Set RLS context for this client — CRITICAL for row-level security
    await setRlsContext(client)

    const insertedRows: any[] = []
    for (const station of stations) {
      const { rows } = await client.query(
        `INSERT INTO cross_section_stations (alignment_id, chainage, ground_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (alignment_id, chainage) DO UPDATE SET
          ground_level = EXCLUDED.ground_level,
          updated_at = NOW()
         RETURNING *`,
        [alignment_id, station.chainage, station.ground_level]
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

// GET: Retrieve stations for an alignment
export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { searchParams } = new URL(req.url)
  const alignmentId = searchParams.get('alignment_id')

  if (!alignmentId) {
    return NextResponse.json({ error: 'Missing alignment_id query parameter' }, { status: 400 })
  }

  const { rows } = await db.query(
    'SELECT * FROM cross_section_stations WHERE alignment_id = $1 ORDER BY chainage ASC',
    [alignmentId]
  )

  return NextResponse.json({ data: rows })
})
