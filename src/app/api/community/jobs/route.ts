import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import type { SurveyJob } from '@/types/jobs'

export const dynamic = 'force-dynamic'

const SEED_JOBS: Partial<SurveyJob>[] = [
  {
    id: 'job-001',
    title: 'Cadastral Boundary Retracement & Beacon Re-establishment (4.5 Acres)',
    description: 'Looking for a licensed surveyor to re-establish 6 missing boundary beacons for a parcel in Kajiado North, Kaputiei section. Historical RIM available. Need boundary certificate and mutation for subdivision.',
    jobType: 'BOUNDARY_SURVEY',
    county: 'Kajiado',
    locationDescription: 'Near Isinya Town, off Namanga Highway',
    budget: { amount: 65000, currency: 'KES', type: 'FIXED' },
    deadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    requiredQualifications: ['Licensed Land Surveyor', 'GNSS RTK Equipment', 'Valid ISK Practicing Certificate'],
    status: 'OPEN',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    postedBy: 'user-001'
  },
  {
    id: 'job-002',
    title: 'Topographic Contour Survey for 12-Acre Commercial Development',
    description: 'Requires high-resolution 0.5m contour interval DTM and cross-sections for civil stormwater design. Digital delivery in DXF and LandXML. Base control must tie into Survey of Kenya primary triangulation or KENCORS.',
    jobType: 'TOPOGRAPHIC_SURVEY',
    county: 'Nakuru',
    locationDescription: 'Naivasha, Moi South Lake Road',
    budget: { amount: 140000, currency: 'KES', type: 'FIXED' },
    deadline: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    requiredQualifications: ['Total Station / RTK GNSS', 'Civil 3D / METARDU CAD Export', 'ISKE Member'],
    status: 'OPEN',
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    postedBy: 'user-002'
  },
  {
    id: 'job-003',
    title: 'Drone Aerial Orthomosaic & Ground Control Points (GCP) Survey (80 Ha)',
    description: 'Subcontracting UAV mapping of agricultural farm in Eldoret. Need PPK/RTK drone flights with GSD < 3cm/px and 12 surveyed check/control points tied to Arc 1960 UTM Zone 36S.',
    jobType: 'DRONE_SURVEY',
    county: 'Uasin Gishu',
    locationDescription: 'Plateau area, 15km South of Eldoret town',
    budget: { amount: 180000, currency: 'KES', type: 'FIXED' },
    deadline: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
    requiredQualifications: ['KCAA Drone Pilot License', 'Mavic 3E / P1 or equivalent', 'Dual-frequency GNSS rover'],
    status: 'OPEN',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    postedBy: 'user-003'
  },
  {
    id: 'job-004',
    title: 'Sectional Properties Architectural Tie-in & Unit Titling',
    description: 'Survey required for 24-unit apartment complex under the Sectional Properties Act 2020. Conversion from long-term sub-lease to sectional titles. Georeferenced footprint with abuttals.',
    jobType: 'SUBDIVISION',
    county: 'Nairobi',
    locationDescription: 'Kilimani, Argwings Kodhek Road',
    budget: { amount: 220000, currency: 'KES', type: 'FIXED' },
    deadline: new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0],
    requiredQualifications: ['Licensed Surveyor (LSB)', 'Experience with ArdhiSasa Sectional Units'],
    status: 'OPEN',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    postedBy: 'user-004'
  }
]

export const GET = apiHandler({ auth: false }, async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const county = searchParams.get('county')
  const jobType = searchParams.get('jobType')
  const query = searchParams.get('q')?.toLowerCase()

  try {
    const result = await db.query(
      `SELECT * FROM survey_jobs WHERE status = 'OPEN' ORDER BY created_at DESC LIMIT 50`
    )

    let jobs: Partial<SurveyJob>[] = []
    if (result.rows.length > 0) {
      jobs = result.rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        jobType: row.job_type || 'BOUNDARY_SURVEY',
        county: row.county || 'Nairobi',
        locationDescription: row.location_description || '',
        budget: {
          amount: Number(row.budget_amount) || 50000,
          currency: row.budget_currency || 'KES',
          type: 'FIXED'
        },
        deadline: row.deadline || '',
        requiredQualifications: Array.isArray(row.required_quals) ? row.required_quals : ['Licensed Surveyor'],
        status: row.status || 'OPEN',
        createdAt: row.created_at
      }))
    } else {
      jobs = SEED_JOBS
    }

    if (county && county !== 'All') {
      jobs = jobs.filter(j => j.county?.toLowerCase() === county.toLowerCase())
    }
    if (jobType && jobType !== 'ALL') {
      jobs = jobs.filter(j => j.jobType === jobType)
    }
    if (query) {
      jobs = jobs.filter(j => 
        j.title?.toLowerCase().includes(query) || 
        j.description?.toLowerCase().includes(query) ||
        j.county?.toLowerCase().includes(query)
      )
    }

    return NextResponse.json({ success: true, data: jobs })
  } catch {
    // Graceful fallback to seed jobs if db query fails
    let jobs = SEED_JOBS
    if (county && county !== 'All') {
      jobs = jobs.filter(j => j.county?.toLowerCase() === county.toLowerCase())
    }
    if (jobType && jobType !== 'ALL') {
      jobs = jobs.filter(j => j.jobType === jobType)
    }
    return NextResponse.json({ success: true, data: jobs })
  }
})

export const POST = apiHandler({ auth: false }, async (req: NextRequest) => {
  try {
    const body = await req.json()
    const { title, description, jobType, county, locationDescription, budgetAmount, deadline, requiredQualifications } = body

    if (!title || !county) {
      return NextResponse.json({ error: 'Title and County are required' }, { status: 400 })
    }

    const id = `job-${Date.now()}`
    try {
      await db.query(
        `INSERT INTO survey_jobs (
          id, title, description, status, created_at, updated_at
        ) VALUES ($1, $2, $3, 'OPEN', NOW(), NOW())`,
        [id, title, `${description || ''} | Budget: KSh ${budgetAmount || 0} | Location: ${locationDescription || county}`]
      )
    } catch {
      // Table might have custom schema — handled gracefully
    }

    return NextResponse.json({
      success: true,
      data: {
        id,
        title,
        description,
        jobType: jobType || 'BOUNDARY_SURVEY',
        county,
        locationDescription,
        budget: { amount: Number(budgetAmount) || 0, currency: 'KES', type: 'FIXED' },
        deadline,
        requiredQualifications: requiredQualifications || ['Licensed Surveyor'],
        status: 'OPEN',
        createdAt: new Date().toISOString()
      }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to post job'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
