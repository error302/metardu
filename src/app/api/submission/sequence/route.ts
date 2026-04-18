/**
 * POST /api/submission/sequence
 * Atomically increments the submission sequence number for a surveyor/year pair.
 * Uses direct PostgreSQL with advisory lock instead of DbClient RPC.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import db from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let surveyorProfileId: string
  let year: number

  try {
    const body = await req.json()
    surveyorProfileId = body.surveyorProfileId
    year = Number(body.year)
    if (!surveyorProfileId || !year) throw new Error('Missing params')
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    // Atomic upsert — INSERT with ON CONFLICT to atomically increment
    const { rows } = await db.query(
      `INSERT INTO submission_sequences (surveyor_profile_id, year, current_sequence)
       VALUES ($1, $2, 1)
       ON CONFLICT (surveyor_profile_id, year)
       DO UPDATE SET current_sequence = submission_sequences.current_sequence + 1
       RETURNING current_sequence`,
      [surveyorProfileId, year]
    )

    const sequence = rows[0]?.current_sequence ?? 1
    const referenceNumber = `ISK_${year}_${String(sequence).padStart(3, '0')}_R00`

    return NextResponse.json({ 
      sequence,
      reference_number: referenceNumber,
      revision: 0,
      year
    })
  } catch (err: any) {
    console.error('[/api/submission/sequence] Error:', err)
    return NextResponse.json(
      { error: 'Failed to generate sequence number' },
      { status: 500 }
    )
  }
}