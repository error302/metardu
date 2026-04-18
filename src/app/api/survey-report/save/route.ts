import { NextResponse } from 'next/server'
import { createClient } from '@/lib/api-client/client'
import { createSurveyReport, saveSurveyReport } from '@/lib/api-client/surveyReports'
import type { SurveyReportInput, SectionContent } from '@/types/surveyReport'

export async function POST(request: Request) {
  try {
    const dbClient = createClient()
    const { data: { session } } = await dbClient.auth.getSession()
    const user = session?.user ?? null
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      reportId, 
      projectId, 
      input, 
      sections, 
      completeness 
    } = body as {
      reportId?: string
      projectId: string
      input: Partial<SurveyReportInput>
      sections: SectionContent[]
      completeness: number
    }

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
    }

    if (!sections || !Array.isArray(sections)) {
      return NextResponse.json({ error: 'Sections required' }, { status: 400 })
    }

    if (reportId) {
      await saveSurveyReport(reportId, input, sections, completeness)
      return NextResponse.json({ id: reportId, saved: true })
    } else {
      const id = await createSurveyReport(input, sections, completeness, projectId)
      return NextResponse.json({ id, created: true })
    }
  } catch (error) {
    console.error('Survey report save error:', error)
    return NextResponse.json(
      { error: 'Failed to save survey report' },
      { status: 500 }
    )
  }
}
