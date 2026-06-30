export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { z } from 'zod'
import db from '@/lib/db'

const cleanedDatasetSchema = z.object({
  project_id: z.string().min(1),
  raw_data: z.any().optional(),
  cleaned_data: z.any().optional(),
  anomalies: z.any().optional(),
  confidence_scores: z.any().optional(),
  data_type: z.string().optional(),
})

export const POST = apiHandler(
  { auth: true, schema: cleanedDatasetSchema, audit: 'cleaned_dataset_saved' , rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const data = ctx.body as z.infer<typeof cleanedDatasetSchema>
    const userId = ctx.userId

    const { rows } = await db.query(
      `INSERT INTO cleaned_datasets (
        project_id, user_id, raw_data, cleaned_data, anomalies, confidence_scores, data_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        data.project_id,
        userId,  // Always use authenticated user's ID
        data.raw_data ? JSON.stringify(data.raw_data) : null,
        data.cleaned_data ? JSON.stringify(data.cleaned_data) : null,
        data.anomalies ? JSON.stringify(data.anomalies) : null,
        data.confidence_scores ? JSON.stringify(data.confidence_scores) : null,
        data.data_type
      ]
    )

    return NextResponse.json(rows[0])
  }
)
