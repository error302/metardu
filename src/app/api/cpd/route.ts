export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { getUserCPDForYear, getTotalCPDForYear, generateCPDCertificate, verifyCPDCertificate } from '@/lib/cpd'

export const GET = apiHandler({ auth: false, rateLimit: { max: 20, windowMs: 60000 } }, async (request, ctx) => {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear()
  const action = searchParams.get('action')
  const code = searchParams.get('code')

  if (action === 'verify' && code) {
    const cert = await verifyCPDCertificate(code)
    if (!cert) return NextResponse.json({ error: 'Certificate not found' }, { status: 404 })
    return NextResponse.json({ certificate: cert })
  }

  if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

  const [records, total] = await Promise.all([
    getUserCPDForYear(userId, year),
    getTotalCPDForYear(userId, year),
  ])

  return NextResponse.json({ records, total, year })
})

export const POST = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (req, ctx) => {
  const { year, surveyorName, iskNumber } = ctx.body as { year?: number; surveyorName?: string; iskNumber?: string }

  if (!year) return NextResponse.json({ error: 'year is required' }, { status: 400 })

  const certificate = await generateCPDCertificate(
    ctx.userId,
    year,
    surveyorName ?? 'Unknown',
    iskNumber ?? 'N/A'
  )

  return NextResponse.json({ certificate })
})
