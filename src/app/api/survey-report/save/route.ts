import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { createSurveyReport, saveSurveyReport } from '@/lib/api-client/surveyReports'
import type { SurveyReportInput, SectionContent } from '@/types/surveyReport'

export const POST = apiHandler({ auth: true }, async (req, ctx) => {
  const {
    reportId,
    projectId,
    input,
    sections,
    completeness
  } = ctx.body as {
    reportId?: string
    projectId?: string
    input?: Partial<SurveyReportInput>
    sections?: SectionContent[]
    completeness?: number
  }

  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
  }

  if (!sections || !Array.isArray(sections)) {
    return NextResponse.json({ error: 'Sections required' }, { status: 400 })
  }

  const comp = completeness ?? 0

  if (reportId) {
    await saveSurveyReport(reportId, input!, sections, comp)
    return NextResponse.json({ id: reportId, saved: true })
  } else {
    const id = await createSurveyReport(input!, sections, comp, projectId)
    return NextResponse.json({ id, created: true })
  }
})
