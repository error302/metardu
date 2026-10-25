import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import { readSchemeOverview } from '@/lib/scheme/readOverview'

export const dynamic = 'force-dynamic'
export const GET = apiHandler({ auth: true, rateLimit: { max: 60, windowMs: 60000 } }, async (request, ctx) => {
  const params = new URL(request.url).searchParams
  if (['block_page','traverse_page'].some(key => params.getAll(key).length > 1)) throw new AppError('Choose one page number for each register.', 400, 'SCHEME_OVERVIEW_INPUT')
  const data = await readSchemeOverview(ctx.params?.id ?? '', ctx.userId, {
    block_page: params.get('block_page') ?? undefined,
    traverse_page: params.get('traverse_page') ?? undefined,
  })
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
})
