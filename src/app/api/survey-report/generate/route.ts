export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { describeCrs } from '@/lib/spatial/projectCrs'
import { generateAllSections } from '@/lib/compute/surveyReportSections'
import { computeReportCompleteness } from '@/lib/compute/reportCompleteness'
import { buildSubmissionNumber, normaliseRegistrationNo, validateSubmissionNumber } from '@/lib/submission/format'
import type { SurveyReportInput, ControlPoint, LevellingRun } from '@/types/surveyReport'

interface ProjectRow {
  name: string | null
  client_name: string | null
  client_address: string | null
  surveyor_name: string | null
  surveyor_registration_number: string | null
  submission_number: string | null
  location: string | null
  start_date: string | null
  end_date: string | null
  utm_zone: number | null
  hemisphere: string | null
}

interface SurveyPointRow {
  id: string
  point_name: string | null
  control_order: string | null
  easting: string | number
  northing: string | number
  elevation: string | number | null
  source: string | null
  description: string | null
  mark_type: string | null
}

interface LevellingRunRow {
  run_id: string | null
  id: string
  from_bm: string | null
  to_bm: string | null
  distance: string | number | null
  misclosure: string | number | null
  allowable: string | number | null
  passes: boolean | null
}

interface TraverseRow {
  precision_ratio: string | number | null
}

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { projectId, input } = ctx.body as { projectId?: string; input?: Partial<SurveyReportInput> }

  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
  }

  const access = await requireProjectOwnership(projectId, ctx.userId)
  if (!access.ok) return access.error ?? NextResponse.json({ error: 'Project unavailable.' }, { status: 404 })

  const { rows: projectRows } = await db.query<ProjectRow>(
    'SELECT * FROM projects WHERE id = $1 LIMIT 1',
    [projectId]
  )

  if (projectRows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const project = projectRows[0]

  const { rows: points } = await db.query<SurveyPointRow>(
    'SELECT * FROM survey_points WHERE project_id = $1 AND is_control = true AND deleted_at IS NULL AND easting IS NOT NULL AND northing IS NOT NULL',
    [projectId]
  )

  const controlPoints: ControlPoint[] = (points || []).map((p) => ({
    id: p.point_name || p.id,
    order: (p.control_order as 'PRIMARY' | 'SECONDARY' | 'TERTIARY') || 'TERTIARY',
    easting: Number(p.easting),
    northing: Number(p.northing),
    elevation: p.elevation == null ? null : Number(p.elevation),
    source: (p.source as 'GNSS' | 'TOTAL_STATION' | 'EXISTING') || 'UNRECORDED',
    description: p.description || '',
    markType: p.mark_type || 'Unrecorded'
  }))

  const benchmarks = controlPoints.filter((cp) =>
    cp.markType.toLowerCase().includes('bm') ||
    cp.markType.toLowerCase().includes('benchmark')
  )

  let levellingRuns: LevellingRun[] = []
  try {
    const { rows: levelingRunsData } = await db.query<LevellingRunRow>(
      'SELECT * FROM leveling_runs WHERE project_id = $1',
      [projectId]
    )

    levellingRuns = (levelingRunsData || []).filter(run => run.from_bm && run.to_bm && run.distance != null && run.misclosure != null && run.allowable != null && run.passes != null).map((run) => ({
      runId: run.run_id || run.id,
      fromBM: run.from_bm || 'BM1',
      toBM: run.to_bm || 'BM2',
      distance: Number(run.distance),
      misclosure: Number(run.misclosure),
      allowable: Number(run.allowable),
      passes: run.passes === true
    }))
  } catch {
    // Ignore missing table error
  }

  let traversePrecision: number | undefined
  try {
    const { rows: traverseData } = await db.query<TraverseRow>(
      'SELECT precision_ratio FROM traverse_results WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
      [projectId]
    )

    if (traverseData.length > 0 && traverseData[0].precision_ratio) {
      traversePrecision = Number(traverseData[0].precision_ratio)
    }
  } catch {
    // No traverse data yet
  }

  const { rows: reference } = await db.query<{ horizontal_crs: string }>(
    'SELECT horizontal_crs FROM project_reference_systems WHERE project_id=$1', [projectId])
  const grid = reference[0] && describeCrs(reference[0].horizontal_crs)
  const registrationNo = normaliseRegistrationNo(
    input?.surveyorRegistrationNumber || project.surveyor_registration_number || ''
  )
  const fallbackSubmissionNo = registrationNo
    ? buildSubmissionNumber({ registrationNo, year: new Date().getFullYear(), sequence: 1, revision: 0 })
    : ''
  const inputSubmissionNumber = input?.submissionNumber || ''
  const submissionNumber = validateSubmissionNumber(inputSubmissionNumber)
    ? inputSubmissionNumber
    : (project.submission_number || fallbackSubmissionNo)

  const defaultInput: SurveyReportInput = {
    projectId,
    reportTitle: input?.reportTitle || `${project.name} — Survey Report`,
    reportNumber: input?.reportNumber || `SR-${Date.now().toString(36).toUpperCase()}`,
    revisionNumber: input?.revisionNumber || 'Rev 0',
    clientName: input?.clientName || project.client_name || '',
    clientAddress: input?.clientAddress || project.client_address || '',
    firmName: input?.firmName || '',
    firmAddress: input?.firmAddress || '',
    firmIskNumber: input?.firmIskNumber || '',
    surveyorName: input?.surveyorName || project.surveyor_name || '',
    surveyorRegistrationNumber: registrationNo,
    surveyorIskNumber: input?.surveyorIskNumber || '',
    reportDate: input?.reportDate || new Date().toISOString().split('T')[0],
    submissionNumber,
    projectLocation: input?.projectLocation || project.location || '',
    county: input?.county || '',
    projectPurpose: input?.projectPurpose || '',
    siteDescription: input?.siteDescription || '',
    surveyPeriodStart: input?.surveyPeriodStart || project.start_date || '',
    surveyPeriodEnd: input?.surveyPeriodEnd || project.end_date || '',
    scopeItems: input?.scopeItems || [],
    equipment: input?.equipment || [],
    personnel: input?.personnel || [],
    datum: input?.datum || (grid?.datum === 'WGS 84' ? 'WGS84' : grid?.datum === 'Arc 1960' ? 'ARC1960' : undefined),
    projection: input?.projection || grid?.name || '',
    controlPoints: input?.controlPoints || controlPoints,
    surveyMethod: input?.surveyMethod || 'UNRECORDED',
    instrumentUsed: input?.instrumentUsed || '',
    traverseAccuracy: input?.traverseAccuracy || (traversePrecision ? `1:${Math.round(traversePrecision).toLocaleString()}` : undefined),
    levellingMisclosure: input?.levellingMisclosure || (levellingRuns.length > 0 ? `${levellingRuns[0].misclosure.toFixed(3)} mm` : undefined),
    levellingRuns: input?.levellingRuns || levellingRuns,
    conclusions: input?.conclusions || [],
    recommendations: input?.recommendations || [],
    contractNumber: input?.contractNumber,
    revisionDate: input?.revisionDate,
    constituency: input?.constituency,
    gnssMethod: input?.gnssMethod,
    baseStationName: input?.baseStationName,
    baseStationCoords: input?.baseStationCoords,
    pointDensity: input?.pointDensity,
    areaHectares: input?.areaHectares,
    gnssBaselineRMS: input?.gnssBaselineRMS,
    declarationStatement: input?.declarationStatement
  }

  const sections = generateAllSections(
    defaultInput,
    defaultInput.controlPoints,
    defaultInput.controlPoints === controlPoints ? benchmarks : defaultInput.controlPoints.filter(point => /benchmark|bm/i.test(point.markType)),
    defaultInput.levellingRuns || [],
    traversePrecision
  )

  const completeness = computeReportCompleteness(defaultInput, sections)

  return NextResponse.json({
    sections,
    completeness,
    input: defaultInput
  })
})
