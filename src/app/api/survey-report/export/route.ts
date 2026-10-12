export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import type { SectionContent, SurveyReportInput } from '@/types/surveyReport'
import { generatePdf } from '@/lib/pdf/generatePdf'
import { generateDocx } from '@/lib/docx/generateDocx'

interface SavedReportRow {
  input_data?: Partial<SurveyReportInput> & { projectName?: string }
  sections?: SectionContent[] | null
  report_number: string | null
  report_title: string | null
  revision: string | null
  status: string | null
}

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { reportId, format } = ctx.body as { reportId?: string; format?: 'pdf' | 'docx' }

  if (!reportId) {
    return NextResponse.json({ error: 'Report ID required' }, { status: 400 })
  }

  if (!format || !['pdf', 'docx'].includes(format)) {
    return NextResponse.json({ error: 'Format must be pdf or docx' }, { status: 400 })
  }

  const { rows } = await db.query<SavedReportRow>(
    `SELECT sr.* FROM survey_reports sr
     JOIN projects p ON p.id = sr.project_id
     WHERE sr.id = $1 AND p.user_id = $2 LIMIT 1`,
    [reportId, ctx.userId]
  )
  const row = rows[0]

  if (!row) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  if (!Array.isArray(row.sections) || row.sections.length === 0) {
    return NextResponse.json({ error: 'Save report sections before exporting this report.' }, { status: 422 })
  }
  const report = {
    ...row.input_data,
    sections: row.sections,
    reportNumber: row.report_number || undefined,
    reportTitle: row.report_title || undefined,
    revision: row.revision,
    status: row.status,
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
      clientName: report.clientName,
      projectName: report.projectName,
      projectLocation: report.projectLocation,
      areaHectares: report.areaHectares,
      useTemplate: false,
    })

    return new NextResponse(Buffer.from(docxBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${report.reportNumber?.replace(/[^a-z0-9]/gi, '_') || 'report'}.docx"`,
      }
    })
  }

  return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
})
