import { NextResponse } from 'next/server'
import { developFullPlan, DevelopPlanOptions } from '@/lib/orchestrator/develop-full-plan'
import { getAuthUser } from '@/lib/auth/session'

export async function POST(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, options } = body as {
      projectId: string
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
  } catch (error) {
    console.error('Plan generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Plan generation failed' },
      { status: 500 }
    )
  }
}
