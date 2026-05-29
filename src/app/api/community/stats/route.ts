import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { getCommunityStats, getOpenPeerReviews, getSurveyors } from '@/lib/api-client/community'

export const dynamic = 'force-dynamic'

export const GET = apiHandler({ auth: false, rateLimit: { max: 30, windowMs: 60000 } }, async () => {
  const [stats, peerReviews, surveyors] = await Promise.all([
    getCommunityStats().catch(() => ({ totalSurveyors: 0, totalJobsPosted: 0, totalReviewsCompleted: 0, totalCPDPointsAwarded: 0 })),
    getOpenPeerReviews().catch(() => []),
    getSurveyors().catch(() => [])
  ])

  return NextResponse.json({
    stats,
    openPeerReviews: peerReviews.length,
    surveyorsCount: surveyors.length
  })
})
