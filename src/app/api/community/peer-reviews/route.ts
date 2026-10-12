import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'

export const dynamic = 'force-dynamic'

export interface PeerReviewItem {
  id: string
  title: string
  documentType: 'FORM_NO_4' | 'FORM_C22' | 'MUTATION_PLAN' | 'TRAVERSE_COMPUTATION' | 'BEACON_CERTIFICATE'
  requesterName: string
  requesterRole: string
  county: string
  parcelReference: string
  status: 'OPEN' | 'IN_REVIEW' | 'VERIFIED'
  cpdPointsAwarded: number
  urgency: 'HIGH' | 'NORMAL'
  description: string
  createdAt: string
}

let SEED_REVIEWS: PeerReviewItem[] = [
  {
    id: 'pr-201',
    title: 'Pre-Submission Audit: Form No. 4 Deed Plan for 10-Parcel Nyeri Subdivision',
    documentType: 'FORM_NO_4',
    requesterName: 'Sammy Kiprono (Associate ISK)',
    requesterRole: 'Graduate Surveyor',
    county: 'Nyeri',
    parcelReference: 'NYERI/MWEIGA/BLOCK 2/PLOT 105',
    status: 'OPEN',
    cpdPointsAwarded: 2,
    urgency: 'HIGH',
    description: 'Looking for a senior Licensed Land Surveyor to inspect beacon closure, bearing schedule formatting, and abuttals before statutory submission to Survey of Kenya.',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'pr-202',
    title: 'Form C22 Geodetic Computation & Cassini-to-UTM Transformation Review',
    documentType: 'FORM_C22',
    requesterName: 'Mercy Akinyi',
    requesterRole: 'Survey Intern',
    county: 'Kisumu',
    parcelReference: 'KISUMU/KANYAKWAR/342',
    status: 'OPEN',
    cpdPointsAwarded: 2,
    urgency: 'NORMAL',
    description: 'Old title coordinates are in Cassini-Soldner Belt 102/4. Need verification of conversion parameters to Arc 1960 UTM Zone 36S and area shoelace check.',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: 'pr-203',
    title: 'Statutory Mutation Plan for Agricultural Land Subdivision (25 Ha)',
    documentType: 'MUTATION_PLAN',
    requesterName: 'Brian Chege, MISK',
    requesterRole: 'Associate Member',
    county: 'Nakuru',
    parcelReference: 'NAKURU/LANET/419',
    status: 'IN_REVIEW',
    cpdPointsAwarded: 3,
    urgency: 'NORMAL',
    description: 'Subdivision into 5 equal 5-hectare parcels. Review requested for access road reserve alignment (12m width) and connection to public highway.',
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString()
  }
]

export const GET = apiHandler({ auth: false }, async () => {
  return NextResponse.json({ success: true, data: SEED_REVIEWS })
})

export const POST = apiHandler({ auth: false }, async (req: NextRequest) => {
  try {
    const body = await req.json()
    const { title, documentType, county, parcelReference, description, requesterName, urgency } = body

    if (!title || !documentType) {
      return NextResponse.json({ error: 'Title and document type are required' }, { status: 400 })
    }

    const newReview: PeerReviewItem = {
      id: `pr-${Date.now()}`,
      title,
      documentType,
      requesterName: requesterName || 'Surveyor',
      requesterRole: 'Surveyor',
      county: county || 'Nairobi',
      parcelReference: parcelReference || 'Pending L.R.',
      status: 'OPEN',
      cpdPointsAwarded: 2,
      urgency: urgency || 'NORMAL',
      description: description || '',
      createdAt: new Date().toISOString()
    }

    SEED_REVIEWS.unshift(newReview)
    return NextResponse.json({ success: true, data: newReview })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit review request'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
