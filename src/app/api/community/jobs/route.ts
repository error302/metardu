import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Community's job board has no current UI and is outside the instrument
 * marketplace defined by the professional survey blueprint (sections 0.3/24).
 * Preserve stored records; never advertise samples or acknowledge unsaved jobs.
 */
function retiredBoard() {
  return NextResponse.json({
    error: 'The survey job board is no longer available. The marketplace lists surveying instruments.',
    code: 'COMMUNITY_JOBS_RETIRED',
    instrumentMarketplace: '/marketplace',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(_request: NextRequest) {
  return retiredBoard()
}

export async function POST(_request: NextRequest) {
  return retiredBoard()
}
