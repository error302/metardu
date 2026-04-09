import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateFormNo4DXF } from '@/lib/submission/generators/formNo4'
import { generateFormNo4PDF } from '@/lib/submission/generators/formNo4PDF'
import type { SubmissionPackage } from '@/lib/submission/types'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { submissionId, format } = body

    if (!submissionId) {
      return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 })
    }

    const { data: submission, error: fetchError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('user_id', session.user.id)
      .single()

    if (fetchError || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

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