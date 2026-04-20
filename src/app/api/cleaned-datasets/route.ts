import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const { rows } = await db.query(
      `INSERT INTO cleaned_datasets (
        project_id, user_id, raw_data, cleaned_data, anomalies, confidence_scores, data_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        body.project_id,
        body.user_id,
        body.raw_data ? JSON.stringify(body.raw_data) : null,
        body.cleaned_data ? JSON.stringify(body.cleaned_data) : null,
        body.anomalies ? JSON.stringify(body.anomalies) : null,
        body.confidence_scores ? JSON.stringify(body.confidence_scores) : null,
        body.data_type
      ]
    )

    return NextResponse.json(rows[0])
  } catch (error: any) {
    console.error('Cleaned dataset insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}