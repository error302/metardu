import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { developFullPlan, DevelopPlanOptions } from '@/lib/orchestrator/develop-full-plan'

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { projectId, options } = ctx.body as {
    projectId?: string
    options?: DevelopPlanOptions
  }

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const result = await developFullPlan(projectId, options)

  return NextResponse.json({
    success: true,
    projectId: result.projectId,
    generatedAt: result.generatedAt,
    files: Object.keys(result.files),
    downloadUrl: result.downloadUrl,
  })
})
