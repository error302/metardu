import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { getOpenPeerReviews, submitPeerReview } from '@/lib/community'
import { awardCPDPoints } from '@/lib/cpd'

export const GET = apiHandler({ auth: false }, async () => {
  const reviews = await getOpenPeerReviews()
  return NextResponse.json({ reviews })
})

export const POST = apiHandler({ auth: true }, async (req, ctx) => {
  const { requestId, verdict, comments } = ctx.body as {
    requestId?: string
    verdict?: string
    comments?: { section: string; severity: string; comment: string; regulationCite?: string }[]
  }

  if (!requestId || !verdict) {
    return NextResponse.json({ error: 'requestId and verdict are required' }, { status: 400 })
  }

  await submitPeerReview(requestId, ctx.userId, verdict, comments ?? [])

  const cpdActivity = verdict === 'APPROVED' ? 'PEER_REVIEW_COMPLETED' : 'PEER_REVIEW_RECEIVED'
  const points = verdict === 'APPROVED' ? 2 : 1
  await awardCPDPoints(ctx.userId, cpdActivity, `Peer review ${verdict.toLowerCase()}`, requestId, points)

  return NextResponse.json({ success: true })
})
