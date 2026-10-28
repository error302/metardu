import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface DiscussionThread {
  id: string
  title: string
  content: string
  authorName: string
  authorRole: 'LICENSED_SURVEYOR' | 'MISK_MEMBER' | 'GRADUATE_SURVEYOR' | 'STUDENT'
  authorCounty: string
  category: 'ARDHISASA' | 'BOUNDARY_DISPUTE' | 'GNSS_HARDWARE' | 'STATUTORY_FEES' | 'FIELD_TECHNIQUES'
  tags: string[]
  upvotes: number
  repliesCount: number
  hasAcceptedAnswer: boolean
  createdAt: string
  updatedAt: string
}

// Community is retired by the professional survey blueprint (0.3/24).
// Stored records are preserved; no sample activity or memory-only save is issued.
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    error: 'This Community area is retired. The marketplace lists surveying instruments.',
    code: 'COMMUNITY_DISCUSSIONS_RETIRED',
    instrumentMarketplace: '/marketplace',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } })
}

export const POST = GET
