import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setCurrentUserId } from '@/lib/db'
import { assembleSubmissionPackage } from '@/lib/submission/assembleSubmission'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const userId = (session.user as any).id
  if (userId) setCurrentUserId(String(userId))

  try {
    const { projectId } = await req.json()

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      )
    }

    const { zipBuffer, ref, qa } = await assembleSubmissionPackage(projectId)

    if (!qa.passed) {
      return NextResponse.json(
        {
          error: 'QA gate failed',
          blockers: qa.blockers.map(b => b.message),
          warnings: qa.warnings.map(w => w.message)
        },
        { status: 422 }
      )
    }

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${ref}.zip"`,
        'X-Submission-Ref': ref
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Submission assembly error:', message)

    if (
      message.includes('profile not found') ||
      message.includes('Project not found') ||
      message.includes('Not authenticated')
    ) {
      return NextResponse.json(
        { error: message },
        { status: 422 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
