import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

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

// Community is retired by the professional survey blueprint (0.3/24).
// Stored records are preserved; no sample activity or memory-only save is issued.
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    error: 'This Community area is retired. The marketplace lists surveying instruments.',
    code: 'COMMUNITY_PEER_REVIEWS_RETIRED',
    instrumentMarketplace: '/marketplace',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } })
}

export const POST = GET
