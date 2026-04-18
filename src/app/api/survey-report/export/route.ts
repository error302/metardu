import { NextResponse } from 'next/server'
import { getSurveyReportById } from '@/lib/api-client/surveyReports'
import type { SectionContent } from '@/types/surveyReport'
import { generatePdf } from '@/lib/pdf/generatePdf'

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

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${report.reportNumber?.replace(/[^a-z0-9]/gi, '_') || 'survey_report'}.pdf"`,
        }
      })
    } else if (format === 'docx') {
      const docxBuffer = generateDocxFromSections(report.sections, report.reportTitle, report.reportNumber || '')

      return new NextResponse(docxBuffer as unknown as BodyInit, {
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

function generateDocxFromSections(sections: SectionContent[], title: string, reportNumber: string): Buffer {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!-- DOCX generation requires docx npm package for full implementation -->
<document>
  <title>${escapeXml(title)}</title>
  <reportNumber>${escapeXml(reportNumber)}</reportNumber>
  <sections>${sections.length}</sections>
</document>`
  return Buffer.from(content, 'utf-8')
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
