import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateFormNo4DXF } from '@/lib/submission/generators/formNo4'
import { generateFormNo4PDF } from '@/lib/submission/generators/formNo4PDF'
import type { SubmissionPackage } from '@/lib/submission/types'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { submissionId, format } = body

    if (!submissionId) {
      return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 })
    }

    const { rows } = await db.query(
      'SELECT package_data FROM submissions WHERE id = $1 AND user_id = $2 LIMIT 1',
      [submissionId, (session.user as any).id]
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    const submission = rows[0]
    const pkg = submission.package_data as SubmissionPackage

    if (format === 'pdf') {
      const pdfBuffer = generateFormNo4PDF(pkg)
      return new NextResponse(pdfBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="form-no-4-${submissionId}.pdf"`
        }
      })
    }

    const dxfString = generateFormNo4DXF(pkg)
    return new NextResponse(dxfString, {
      headers: {
        'Content-Type': 'application/dxf',
        'Content-Disposition': `attachment; filename="form-no-4-${submissionId}.dxf"`
      }
    })
  } catch (error) {
    console.error('Form No. 4 generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate Form No. 4' },
      { status: 500 }
    )
  }
}