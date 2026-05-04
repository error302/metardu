import { NextResponse } from 'next/server'
import { createClient } from '@/lib/api-client/client'
import { generateAllSections } from '@/lib/compute/surveyReportSections'
import { computeReportCompleteness } from '@/lib/compute/reportCompleteness'
import { riseAndFall } from '@/lib/engine/leveling'
import { buildSubmissionNumber, normaliseRegistrationNo, validateSubmissionNumber } from '@/lib/submission/format'
import type { SurveyReportInput, SectionContent, ControlPoint, LevellingRun } from '@/types/surveyReport'

export async function POST(request: Request) {
  try {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/lib/auth')
    const db = (await import('@/lib/db')).default
    
    const session = await getServerSession(authOptions)
    const user = session?.user as any | null
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, input } = body as { projectId: string; input: Partial<SurveyReportInput> }

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
    }

    const { rows: projectRows } = await db.query(
      'SELECT * FROM projects WHERE id = $1 LIMIT 1',
      [projectId]
    )

    if (projectRows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    const project = projectRows[0]

    const { rows: points } = await db.query(
      'SELECT * FROM survey_points WHERE project_id = $1 AND is_control = true',
      [projectId]
    )

    const controlPoints: ControlPoint[] = (points || []).map((p: any) => ({
      id: p.name || p.id,
      order: (p.control_order as 'PRIMARY' | 'SECONDARY' | 'TERTIARY') || 'TERTIARY',
      easting: p.easting,
      northing: p.northing,
      elevation: p.elevation || 0,
      source: (p.source as 'GNSS' | 'TOTAL_STATION' | 'EXISTING') || 'GNSS',
      description: p.description || '',
      markType: p.mark_type || 'Concrete Beacon'
    }))

    const benchmarks = controlPoints.filter((cp: any) => 
      cp.markType.toLowerCase().includes('bm') || 
      cp.markType.toLowerCase().includes('benchmark')
    )

    let levellingRuns: LevellingRun[] = []
    try {
      const { rows: levelingRunsData } = await db.query(
        'SELECT * FROM leveling_runs WHERE project_id = $1',
        [projectId]
      )

      levellingRuns = (levelingRunsData || []).map((run: any) => ({
        runId: run.run_id || run.id,
        fromBM: run.from_bm || 'BM1',
        toBM: run.to_bm || 'BM2',
        distance: run.distance || 0,
        misclosure: run.misclosure || 0,
        allowable: run.allowable || 10,
        passes: run.passes ?? true
      }))
    } catch {
      // Ignore missing table error
    }

    let traversePrecision: number | undefined
    try {
      const { rows: traverseData } = await db.query(
        'SELECT precision_ratio FROM traverse_results WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
        [projectId]
      )
      
      if (traverseData.length > 0 && traverseData[0].precision_ratio) {
        traversePrecision = traverseData[0].precision_ratio
      }
    } catch {
      // No traverse data yet
    }

    const registrationNo = normaliseRegistrationNo(
      input.surveyorRegistrationNumber || project.surveyor_registration_number || ''
    )
    const fallbackSubmissionNo = registrationNo
      ? buildSubmissionNumber({ registrationNo, year: new Date().getFullYear(), sequence: 1, revision: 0 })
      : ''

    const defaultInput: SurveyReportInput = {
      projectId,
      reportTitle: input.reportTitle || `${project.name} — Survey Report`,
      reportNumber: input.reportNumber || `SR-${Date.now().toString(36).toUpperCase()}`,
      revisionNumber: input.revisionNumber || 'Rev 0',
      clientName: input.clientName || project.client_name || '',
      clientAddress: input.clientAddress || project.client_address || '',
      firmName: input.firmName || '',
      firmAddress: input.firmAddress || '',
      firmIskNumber: input.firmIskNumber || '',
      surveyorName: input.surveyorName || project.surveyor_name || '',
      surveyorRegistrationNumber: registrationNo,
      surveyorIskNumber: input.surveyorIskNumber || '',
      reportDate: input.reportDate || new Date().toISOString().split('T')[0],
      submissionNumber: validateSubmissionNumber(input.submissionNumber)
        ? input.submissionNumber
        : (project.submission_number || fallbackSubmissionNo),
      projectLocation: input.projectLocation || project.location || '',
      county: input.county || '',
      projectPurpose: input.projectPurpose || '',
      siteDescription: input.siteDescription || '',
      surveyPeriodStart: input.surveyPeriodStart || project.start_date || '',
      surveyPeriodEnd: input.surveyPeriodEnd || project.end_date || '',
      scopeItems: input.scopeItems || [],
      equipment: input.equipment || [],
      personnel: input.personnel || [],
      datum: input.datum || 'ARC1960',
      projection: input.projection || `UTM Zone ${project.utm_zone || 37}${project.hemisphere || 'S'}`,
      controlPoints: input.controlPoints || controlPoints,
      surveyMethod: input.surveyMethod || 'GNSS_RTK',
      instrumentUsed: input.instrumentUsed || '',
      traverseAccuracy: input.traverseAccuracy || (traversePrecision ? `1:${Math.round(traversePrecision).toLocaleString()}` : undefined),
      levellingMisclosure: input.levellingMisclosure || (levellingRuns.length > 0 ? `${levellingRuns[0].misclosure.toFixed(3)} mm` : undefined),
      levellingRuns: input.levellingRuns || levellingRuns,
      conclusions: input.conclusions || [],
      recommendations: input.recommendations || []
    }

    const sections = generateAllSections(
      defaultInput,
      controlPoints,
      benchmarks,
      levellingRuns,
      traversePrecision
    )

    const completeness = computeReportCompleteness(defaultInput, sections)

    return NextResponse.json({
      sections,
      completeness,
      input: defaultInput
    })
  } catch (error) {
    console.error('Survey report generate error:', error)
    return NextResponse.json(
      { error: 'Failed to generate survey report' },
      { status: 500 }
    )
  }
}
