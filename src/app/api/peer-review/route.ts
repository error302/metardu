import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/session'
import { getOpenPeerReviews, submitPeerReview } from '@/lib/community'
import { awardCPDPoints } from '@/lib/cpd'

export async function GET() {
  try {
    const reviews = await getOpenPeerReviews()
    return NextResponse.json({ reviews })
  } catch (error) {
    console.error('Peer review GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as {
      requestId?: string
      verdict?: string
      comments?: { section: string; severity: string; comment: string; regulationCite?: string }[]
    }
    const { requestId, verdict, comments } = body

    if (!requestId || !verdict) {
      return NextResponse.json({ error: 'requestId and verdict are required' }, { status: 400 })
    }

    await submitPeerReview(requestId, user.id, verdict, comments ?? [])

    const cpdActivity = verdict === 'APPROVED' ? 'PEER_REVIEW_COMPLETED' : 'PEER_REVIEW_RECEIVED'
    const points = verdict === 'APPROVED' ? 2 : 1
    await awardCPDPoints(user.id, cpdActivity, `Peer review ${verdict.toLowerCase()}`, requestId, points)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Peer review POST error:', error)
    return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 })
  }
}
