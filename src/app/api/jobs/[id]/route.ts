import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'
import { getJobById, applyToJob, awardJob, completeJob } from '@/lib/community'
import { awardCPDPoints } from '@/lib/cpd'

export const GET = apiHandler({ auth: false, rateLimit: { max: 20, windowMs: 60000 } }, async (request, ctx) => {
  const { id } = ctx.params
  const job = await getJobById(id)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const applicationsResult = await db.query(
    'SELECT * FROM job_applications WHERE job_id = $1',
    [id]
  )

  return NextResponse.json({ job, applications: applicationsResult.rows })
})

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (request, ctx) => {
  const jobId = ctx.params.id
  const body = ctx.body as { action?: string; application?: unknown; surveyorId?: string }

  if (body.action === 'apply') {
    await applyToJob(jobId, body.application as any, ctx.userId)
    return NextResponse.json({ success: true })
  }

  if (body.action === 'award') {
    await awardJob(jobId, body.surveyorId ?? '')
    return NextResponse.json({ success: true })
  }

  if (body.action === 'complete') {
    await completeJob(jobId)

    const jobResult = await db.query(
      'SELECT awarded_to FROM survey_jobs WHERE id = $1',
      [jobId]
    )

    if (jobResult.rows.length > 0 && jobResult.rows[0].awarded_to) {
      await awardCPDPoints(jobResult.rows[0].awarded_to, 'JOB_COMPLETED', `Completed job ${jobId}`, jobId)
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
})
