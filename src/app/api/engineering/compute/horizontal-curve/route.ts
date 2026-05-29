import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { computeHorizontalCurve } from '@/lib/engine/engineering'

export const POST = apiHandler({ auth: true }, async (req, ctx) => {
  const { radius, delta, piChainage } = ctx.body as {
    radius: number
    delta: number
    piChainage: number
  }

  if (radius === undefined || delta === undefined || piChainage === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const result = computeHorizontalCurve(radius, delta, piChainage)

  return NextResponse.json(result)
})
