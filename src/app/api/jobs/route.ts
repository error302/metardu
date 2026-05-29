import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'

export const GET = apiHandler({ auth: false }, async (request, ctx) => {
  const { searchParams } = new URL(request.url)
  const jobType = searchParams.get('jobType') ?? undefined
  const county = searchParams.get('county') ?? undefined
  const minBudget = searchParams.get('minBudget') ? parseFloat(searchParams.get('minBudget')!) : undefined
  const maxBudget = searchParams.get('maxBudget') ? parseFloat(searchParams.get('maxBudget')!) : undefined

  let query = 'SELECT * FROM marketplace_jobs WHERE status = $1'
  const params: unknown[] = ['OPEN']

  if (jobType) { query += ` AND job_type = $${params.length + 1}`; params.push(jobType) }
  if (county) { query += ` AND county = $${params.length + 1}`; params.push(county) }
  if (minBudget !== undefined) { query += ` AND budget_amount >= $${params.length + 1}`; params.push(minBudget) }
  if (maxBudget !== undefined) { query += ` AND budget_amount <= $${params.length + 1}`; params.push(maxBudget) }

  query += ' ORDER BY created_at DESC LIMIT 50'

  const result = await db.query(query, params)

  const jobs = result.rows.map((row: Record<string, unknown>) => ({
    id: row.id,
    postedBy: row.posted_by,
    title: row.title,
    description: row.description,
    jobType: row.job_type,
    county: row.county,
    locationDescription: row.location_description,
    parcelNumber: row.parcel_number,
    estimatedArea: row.estimated_area,
    budget: {
      amount: row.budget_amount,
      currency: row.budget_currency ?? 'KES',
      type: row.budget_type ?? 'FIXED',
    },
    deadline: row.deadline,
    requiredQualifications: row.required_qualifications,
    status: row.status,
    createdAt: row.created_at,
  }))

  return NextResponse.json({ jobs })
})

export const POST = apiHandler({ auth: true }, async (req, ctx) => {
  const body = ctx.body as Record<string, unknown>
  const id = crypto.randomUUID()
  const budget = body.budget as { amount?: number; type?: string } | undefined

  await db.query(
    `INSERT INTO marketplace_jobs
     (id, posted_by, title, description, job_type, county, location_description,
      parcel_number, estimated_area, budget_amount, budget_type, deadline,
      required_qualifications, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())`,
    [
      id, ctx.userId,
      body.title ?? '',
      body.description ?? '',
      body.jobType ?? 'OTHER',
      body.county ?? '',
      body.locationDescription ?? '',
      body.parcelNumber ?? null,
      body.estimatedArea ?? null,
      budget?.amount ?? null,
      budget?.type ?? 'FIXED',
      body.deadline ?? null,
      body.requiredQualifications ?? [],
      'OPEN',
    ]
  )

  return NextResponse.json({ jobId: id })
})
