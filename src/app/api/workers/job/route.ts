export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const body = ctx.body as {
    jobType: string
    projectId?: string
    payload?: Record<string, unknown>
    priority?: number
  }

  if (!body.jobType) {
    return NextResponse.json({ error: 'Missing jobType' }, { status: 400 })
  }

  const validTypes = [
    'pdf_generation',
    'dxf_generation',
    'shapefile_generation',
    'report_processing',
    'payment_verification',
    'email_notification',
  ]
  if (!validTypes.includes(body.jobType)) {
    return NextResponse.json({ error: 'Invalid jobType' }, { status: 400 })
  }

  // Build payload — merge projectId into payload if provided separately
  const payload = { ...(body.payload || {}) }
  if (body.projectId) {
    payload.project_id = body.projectId
  }

  const priority = typeof body.priority === 'number'
    ? Math.max(0, Math.min(10, body.priority))
    : 5

  const { rows } = await db.query(
    `INSERT INTO background_jobs (job_type, payload, priority)
     VALUES ($1, $2, $3)
     RETURNING id, job_type, status, priority, created_at`,
    [body.jobType, JSON.stringify(payload), priority]
  )

  return NextResponse.json({ success: true, job: rows[0] })
})

export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  let query = 'SELECT * FROM background_jobs WHERE 1=1'
  const params: unknown[] = []
  let paramIndex = 1

  if (status) {
    query += ` AND status = $${paramIndex++}`
    params.push(status)
  }

  query += ' ORDER BY priority DESC, created_at DESC LIMIT 50'

  const { rows } = await db.query(query, params)
  return NextResponse.json({ jobs: rows })
})
