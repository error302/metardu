import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveSurveyorProfile } from '@/lib/submission/surveyorProfile'
import { generateSubmissionRef } from '@/lib/submission/revisionNumber'

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const supabase = await createClient()
    const surveyor = await getActiveSurveyorProfile()

    const { data: project } = await supabase
      .from('projects')
      .select('*, survey_points(*), supporting_documents(*)')
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { ref, revision } = await generateSubmissionRef(
      projectId,
      surveyor.registrationNumber
    )

    const pkg = {
      submissionRef: ref,
      projectId,
      surveyor,
      subtype: project.survey_type || 'cadastral_subdivision',
      parcel: {
        lrNumber: project.lr_number || '',
        county: project.county || '',
        district: project.district || '',
        locality: project.locality || '',
        areaM2: project.area_m2 || 0,
        perimeterM: project.perimeter_m || 0
      },
      traverse: {
        points: (project.survey_points || []).map((pt: any) => ({
          pointName: pt.name || `P${pt.id}`,
          easting: pt.easting || 0,
          northing: pt.northing || 0,
          adjustedEasting: pt.adjusted_easting || pt.easting || 0,
          adjustedNorthing: pt.adjusted_northing || pt.northing || 0,
          observedBearing: pt.observed_bearing || 0,
          observedDistance: pt.observed_distance || 0
        })),
        angularMisclosure: project.angular_misclosure || 0,
        linearMisclosure: project.linear_misclosure || 0,
        precisionRatio: project.precision_ratio || '1:1',
        closingErrorE: project.closing_error_e || 0,
        closingErrorN: project.closing_error_n || 0,
        adjustmentMethod: 'bowditch',
        areaM2: project.area_m2 || 0,
        perimeterM: project.perimeter_m || 0
      },
      supportingDocs: project.supporting_documents || [],
      generatedAt: new Date().toISOString(),
      revision
    }

    return NextResponse.json(pkg)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
