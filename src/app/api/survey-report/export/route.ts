import { NextResponse } from 'next/server'
import { getSurveyReportById } from '@/lib/api-client/surveyReports'
import { generatePdf } from '@/lib/pdf/generatePdf'
import { generateDocx } from '@/lib/docx/generateDocx'
import { getTemplateSections } from '@/lib/docx/templates'

export async function POST(request: Request) {
  try {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const session = await getServerSession(authOptions)
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
      // Determine survey type and use template if available
      const surveyType = ((report as any).surveyType || 'cadastral') as any
      const templateSections = getTemplateSections(surveyType, {
        reportNumber: report.reportNumber,
        clientName: (report as any).clientName,
        projectName: (report as any).projectName,
        projectLocation: (report as any).projectLocation,
        areaHectares: (report as any).areaHectares,
        date: new Date().toLocaleDateString('en-GB'),
        precisionRatio: '5000',
        pointSpacing: '20m',
        contourInterval: '0.5m',
        horizontalAccuracy: '20mm',
        verticalAccuracy: '10mm',
        pointDensity: '1 per 400m²',
        contractNumber: (report as any).contractNumber,
        projectPurpose: (report as any).projectPurpose,
        structuralTolerance: '5mm',
        earthworksTolerance: '20mm',
        asBuiltTolerance: '10mm',
        mineralType: 'TBD',
        stockpileId: 'SP-001',
        stockpileVolume: 'TBD',
        materialType: 'Overburden',
        gridSpacing: '5m',
      })

      const docxBuffer = await generateDocx({
        title: report.reportTitle || 'Survey Report',
        reportNumber: report.reportNumber,
        sections: templateSections.length > 0 ? templateSections : report.sections,
        surveyType,
        clientName: (report as any).clientName,
        projectName: (report as any).projectName,
        projectLocation: (report as any).projectLocation,
        areaHectares: (report as any).areaHectares,
        useTemplate: true,
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
