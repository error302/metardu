import { NextRequest, NextResponse } from 'next/server'
import { assembleSubmissionPackage } from '@/lib/submission/assembleSubmission'

export async function POST(req: NextRequest) {
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
    console.error('Submission assembly error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
