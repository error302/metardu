/**
 * POST /api/submission/sequence
 * Atomically increments the submission sequence number for a surveyor/year pair
 * using the canonical submission_sequence table.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  
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
    const result = await supabase.rpc('increment_submission_sequence', {
      p_surveyor_profile_id: surveyorProfileId,
      p_year: year
    })

    if (result.error) {
      throw result.error
    }

    const sequence = result.data
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