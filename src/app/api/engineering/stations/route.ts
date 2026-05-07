import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// POST: Save cross-section station data (bulk upsert)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { alignment_id, stations } = body as {
      alignment_id: string
      stations: {
        chainage: number
        ground_level: number
      }[]
    }

    if (!alignment_id || !stations || !Array.isArray(stations)) {
      return NextResponse.json({ error: 'Missing required fields: alignment_id, stations' }, { status: 400 })
    }

    const client = await db.getClient()

    try {
      await client.query('BEGIN')

      const insertedRows = []
      for (const station of stations) {
        const { rows } = await client.query(
          `INSERT INTO alignment_stations (alignment_id, chainage, ground_level)
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/engineering/stations] Error:', message)
    return NextResponse.json({ error: 'Failed to save stations' }, { status: 500 })
  }
}

// GET: Retrieve stations for an alignment
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const alignmentId = searchParams.get('alignment_id')

    if (!alignmentId) {
      return NextResponse.json({ error: 'Missing alignment_id query parameter' }, { status: 400 })
    }

    const { rows } = await db.query(
      'SELECT * FROM alignment_stations WHERE alignment_id = $1 ORDER BY chainage ASC',
      [alignmentId]
    )

    return NextResponse.json({ data: rows })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/engineering/stations] Error:', message)
    return NextResponse.json({ error: 'Failed to fetch stations' }, { status: 500 })
  }
}
