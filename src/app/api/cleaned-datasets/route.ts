import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import db from '@/lib/db'

const cleanedDatasetSchema = z.object({
  project_id: z.string().min(1),
  raw_data: z.any().optional(),
  cleaned_data: z.any().optional(),
  anomalies: z.any().optional(),
  confidence_scores: z.any().optional(),
  data_type: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const body = await request.json().catch(() => ({}))
    const parsed = cleanedDatasetSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
    }

    const { rows } = await db.query(
      `INSERT INTO cleaned_datasets (
        project_id, user_id, raw_data, cleaned_data, anomalies, confidence_scores, data_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        parsed.data.project_id,
        userId,  // Always use authenticated user's ID
        parsed.data.raw_data ? JSON.stringify(parsed.data.raw_data) : null,
        parsed.data.cleaned_data ? JSON.stringify(parsed.data.cleaned_data) : null,
        parsed.data.anomalies ? JSON.stringify(parsed.data.anomalies) : null,
        parsed.data.confidence_scores ? JSON.stringify(parsed.data.confidence_scores) : null,
        parsed.data.data_type
      ]
    )

    return NextResponse.json(rows[0])
  } catch (error: any) {
    console.error('Cleaned dataset insert error:', error)
    return NextResponse.json({ error: 'Failed to save cleaned dataset' }, { status: 500 })
  }
}
