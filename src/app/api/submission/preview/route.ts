export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireProjectOwnership } from '@/lib/auth/ownership'
import { db } from '@/lib/db'
import { fetchSurveyorProfile } from '@/lib/survey/fetchSurveyorProfile'
import { computeDeedPlanGeometry } from '@/lib/generators/deedPlanGeometry'

interface SubmissionProjectMetadata {
  survey_type: string | null
  lr_number: string | null
  plot_parcel_number: string | null
  county: string | null
  registration_district: string | null
  locality: string | null
  // Older project metadata may include these legacy optional fields.
  division?: string | null
  district?: string | null
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error
  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json({error:'projectId required'},{status:400})
  const ownership = await requireProjectOwnership(projectId, session?.user?.id)
  if (!ownership.ok) return ownership.error ?? NextResponse.json({error:'Forbidden'},{status:403})
  try {
    const {rows} = await db.query<SubmissionProjectMetadata>('SELECT * FROM projects WHERE id=$1',[projectId])
    const project=rows[0]
    if (!project) return NextResponse.json({error:'Project not found'},{status:404})
    const [surveyor,geometry]=await Promise.all([fetchSurveyorProfile(projectId),computeDeedPlanGeometry(projectId)])
    const perimeterM=geometry.stations.reduce((sum,point,index)=>{
      const next=geometry.stations[(index+1)%geometry.stations.length]
      return sum+Math.hypot(next.easting-point.easting,next.northing-point.northing)
    },0)
    // A read-only preview must not allocate a statutory submission sequence.
    return NextResponse.json({
      submissionRef:'DRAFT - NOT SUBMITTED',projectId,revision:0,
      surveyor:{fullName:surveyor.surveyorName,registrationNumber:surveyor.licenseNumber,
        iskNumber:surveyor.iskNumber,firmName:surveyor.firmName,verifiedIsk:false,isKMemberActive:false},
      subtype:project.survey_type,
      parcel:{lrNumber:project.lr_number || '',parcelNumber:project.plot_parcel_number || '',
        county:project.county || '',division:project.division || '',
        district:project.registration_district || project.district || '',locality:project.locality || '',
        areaM2:geometry.areaM2,perimeterM},
      traverse:{points:geometry.stations.map(point=>({pointName:point.station,easting:point.easting,
        northing:point.northing,adjustedEasting:point.easting,adjustedNorthing:point.northing})),
        angularMisclosure:null,linearMisclosure:Number.isFinite(geometry.misclosureMm)?geometry.misclosureMm/1000:null,
        precisionRatio:geometry.precisionRatio,coordinateSource:geometry.coordinateSource,
        areaM2:geometry.areaM2,perimeterM},
      supportingDocs:[],generatedAt:new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Preview unavailable'},{status:422})
  }
}
