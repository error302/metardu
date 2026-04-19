import { NextResponse } from 'next/server'
import { getSurveyReportById } from '@/lib/api-client/surveyReports'
import { generatePdf } from '@/lib/pdf/generatePdf'
import { generateDocx } from '@/lib/docx/generateDocx'

export async function POST(request: Request) {
  try {
    const { createClient } = await import('@/lib/api-client/client')
    const dbClient = createClient()
    const { data: { session } } = await dbClient.auth.getSession()
    const user = session?.user ?? null

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { reportId, format } = body as { reportId: string; format: 'pdf' | 'docx' }

    if (!reportId) {
      return NextResponse.json({ error: 'Report ID required' }, { status: 400 })
    }

    if (!format || !['pdf', 'docx'].includes(format)) {
      return NextResponse.json({ error: 'Format must be pdf or docx' }, { status: 400 })
    }

    const report = await getSurveyReportById(reportId)

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (format === 'pdf') {
      const pdfBuffer = await generatePdf({
        title: report.reportTitle || 'Survey Report',
        sections: report.sections,
        paperSize: 'A4',
        orientation: 'portrait',
      })

      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${report.reportNumber?.replace(/[^a-z0-9]/gi, '_') || 'survey_report'}.pdf"`,
        }
      })
    } else if (format === 'docx') {
      const docxBuffer = await generateDocx({
        title: report.reportTitle || 'Survey Report',
        reportNumber: report.reportNumber,
        sections: report.sections,
        clientName: (report as any).clientName,
        projectName: (report as any).projectLocation,
      })

      return new NextResponse(Buffer.from(docxBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${report.reportNumber?.replace(/[^a-z0-9]/gi, '_') || 'report'}.docx"`,
        }
      })
    }

    return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
  } catch (error) {
    console.error('Survey report export error:', error)
    return NextResponse.json(
      { error: 'Failed to export survey report' },
      { status: 500 }
    )
  }
}
