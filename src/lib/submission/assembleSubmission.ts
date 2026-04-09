import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/server'
import { getActiveSurveyorProfile } from './surveyorProfile'
import { generateSubmissionRef } from './revisionNumber'
import { validateSubmission } from './validateSubmission'
import { generateFormNo4DXF } from './generators/formNo4'
import { generateComputationWorkbook } from './generators/computationWorkbook'
import { generateWorkingDiagramDXF } from './generators/workingDiagram'
import { coordinateArea } from '@/lib/engine/area'
import type { SubmissionPackage, QAGateResult, SurveySubtype } from './types'

interface ProjectData {
  id: string
  lr_number: string
  parcel_number: string
  division: string
  county: string
  district: string
  locality: string
  area_m2: number
  perimeter_m: number
  subtype: SurveySubtype
  survey_points: any[]
  supporting_documents: any[]
  angular_misclosure: number
  linear_misclosure: number
  precision_ratio: string
  closing_error_e: number
  closing_error_n: number
}

export async function assembleSubmissionPackage(
  projectId: string
): Promise<{ zipBuffer: Buffer; ref: string; qa: QAGateResult }> {
  const supabase = await createClient()
  const surveyor = await getActiveSurveyorProfile()
  const asNum = (value: unknown, fallback = 0): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  // QueryBuilder does not support Supabase-style nested relation selects,
  // so fetch project, points, and docs in separate queries.
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (projectError || !project) throw new Error('Project not found')

  const { data: surveyPoints, error: pointsError } = await supabase
    .from('survey_points')
    .select('*')
    .eq('project_id', projectId)

  if (pointsError) {
    throw new Error(`Failed to load survey points: ${pointsError.message}`)
  }

  const { data: supportingDocuments, error: docsError } = await supabase
    .from('supporting_documents')
    .select('*')
    .eq('project_id', projectId)

  if (docsError) {
    throw new Error(`Failed to load supporting documents: ${docsError.message}`)
  }

  const proj = {
    ...(project as Record<string, unknown>),
    survey_points: Array.isArray(surveyPoints) ? surveyPoints : [],
    supporting_documents: Array.isArray(supportingDocuments) ? supportingDocuments : []
  } as unknown as ProjectData

  const adjustedCoordinates = (proj.survey_points || [])
    .filter((pt: any) => pt.adjusted_easting != null && pt.adjusted_northing != null)
    .map((pt: any) => ({
      easting: asNum(pt.adjusted_easting),
      northing: asNum(pt.adjusted_northing)
    }));

  let computedAreaM2 = 0;
  if (adjustedCoordinates.length >= 3) {
    const areaResult = coordinateArea(adjustedCoordinates);
    computedAreaM2 = areaResult.areaSqm;
  } else if (proj.survey_points && proj.survey_points.length >= 3) {
    const rawCoordinates = (proj.survey_points || []).map((pt: any) => ({
      easting: asNum(pt.easting),
      northing: asNum(pt.northing)
    }));
    const areaResult = coordinateArea(rawCoordinates);
    computedAreaM2 = areaResult.areaSqm;
  }

  if (adjustedCoordinates.length < 3 && proj.survey_points && proj.survey_points.length >= 3) {
    console.warn('No adjusted coordinates found - using raw coordinates for area computation');
  }

  if (adjustedCoordinates.length < 3 && (!proj.survey_points || proj.survey_points.length < 3)) {
    throw new Error(
      'Cannot assemble submission: traverse must have at least 3 points to compute area. ' +
      'Complete traverse computation before submitting.'
    );
  }

  const { ref, revision } = await generateSubmissionRef(
    projectId,
    surveyor.registrationNumber
  )

  const supportingDocs = (proj.supporting_documents ?? []).map((doc: any) => ({
    type: doc.type,
    label: doc.label,
    required: doc.required,
    fileUrl: doc.file_url ?? null,
    uploadedAt: doc.uploaded_at ?? null
  }))

  const pkg: SubmissionPackage = {
    submissionRef: ref,
    projectId,
    surveyor,
    subtype: proj.subtype || 'cadastral_subdivision',
    parcel: {
      lrNumber: proj.lr_number || '',
      parcelNumber: proj.parcel_number || proj.lr_number || '',
      county: proj.county || '',
      division: proj.division || '',
      district: proj.district || '',
      locality: proj.locality || '',
      areaM2: computedAreaM2,
      perimeterM: asNum(proj.perimeter_m)
    },
    traverse: {
      points: (proj.survey_points || []).map((pt: any) => ({
        pointName: pt.name || pt.point_name || `P${pt.id}`,
        easting: asNum(pt.easting),
        northing: asNum(pt.northing),
        adjustedEasting: asNum(pt.adjusted_easting, asNum(pt.easting)),
        adjustedNorthing: asNum(pt.adjusted_northing, asNum(pt.northing)),
        observedBearing: asNum(pt.observed_bearing),
        observedDistance: asNum(pt.observed_distance, asNum(pt.distance))
      })),
      angularMisclosure: asNum(proj.angular_misclosure),
      linearMisclosure: asNum(proj.linear_misclosure),
      precisionRatio: proj.precision_ratio || '1:1',
      closingErrorE: asNum(proj.closing_error_e),
      closingErrorN: asNum(proj.closing_error_n),
      adjustmentMethod: 'bowditch',
      areaM2: computedAreaM2,
      perimeterM: asNum(proj.perimeter_m)
    },
    supportingDocs,
    generatedAt: new Date().toISOString(),
    revision
  }

  const qa = validateSubmission(pkg)
  if (!qa.passed) {
    return { zipBuffer: Buffer.alloc(0), ref, qa }
  }

  const formNo4Dxf = generateFormNo4DXF(pkg)
  const workbook = generateComputationWorkbook(pkg)
  const workingDiagram = generateWorkingDiagramDXF(pkg)

  const zip = new JSZip()
  zip.file('form_no_4.dxf', formNo4Dxf)
  zip.file('computation_workbook.xlsx', workbook)
  zip.file('working_diagram.dxf', workingDiagram)

  const manifest = {
    submissionRef: ref,
    generatedAt: pkg.generatedAt,
    surveyor: pkg.surveyor.registrationNumber,
    lrNumber: pkg.parcel.lrNumber,
    files: ['form_no_4.dxf', 'computation_workbook.xlsx', 'working_diagram.dxf'],
    qaResult: qa
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const supportingFolder = zip.folder('supporting_docs')

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  const { data: authSession } = await supabase.auth.getSession()
  const userId = authSession.session?.user?.id ?? ''
  
  const { data: profile } = await supabase
    .from('surveyor_profiles')
    .select('id, user_id, isk_number, verified_isk')
    .eq('user_id', userId)
    .single()

  if (!profile) {
    throw new Error('Surveyor profile not found')
  }

  const currentYear = new Date().getFullYear()
  const { data: existingSubmissions } = await supabase
    .from('project_submissions')
    .select('revision_number')
    .eq('project_id', projectId)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const revisionNumber = (existingSubmissions?.revision_number ?? -1) + 1

  const sequenceNumber = await supabase.rpc('increment_submission_sequence', {
    p_surveyor_profile_id: profile.id,
    p_year: currentYear
  })

  const sequence = sequenceNumber.data ?? 1
  const submissionNumber = `${profile.isk_number}_${currentYear}_${String(sequence).padStart(3, '0')}_R${String(revisionNumber).padStart(2, '0')}`

  await supabase.from('project_submissions').insert({
    project_id: projectId,
    surveyor_profile_id: profile.id,
    submission_number: submissionNumber,
    revision_code: `R${String(revisionNumber).padStart(2, '0')}`,
    submission_year: currentYear,
    package_status: 'ready',
    generated_artifacts: {
      form_no_4: 'form_no_4.dxf',
      computation_workbook: 'computation_workbook.xlsx',
      working_diagram: 'working_diagram.dxf'
    },
    validation_results: qa
  })

  return { zipBuffer, ref, qa }
}
