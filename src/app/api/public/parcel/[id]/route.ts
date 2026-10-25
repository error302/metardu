import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { readPublicParcelShare } from '@/lib/scheme/parcelSharing'
import { parcelShareKey } from '@/lib/scheme/parcelShareContract'
import {
  rateLimit,
  getOperationRateLimitIdentifier,
} from '@/lib/security/rateLimit'
export const dynamic = 'force-dynamic'
const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
}
const unavailable = () =>
  NextResponse.json(
    {
      error:
        'This shared draft is unavailable. Ask the surveyor for a current link.',
    },
    { status: 404, headers },
  )
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
    request.headers.get('authorization') ?? '',
  )
  // Project IDs, cookies and query-string keys never authorize disclosure.
  if (
    !z.string().uuid().safeParse(id).success ||
    new URL(request.url).search.length ||
    !auth ||
    !parcelShareKey.safeParse(auth[1]).success
  )
    return unavailable()
  try {
    const quota = await rateLimit(
      getOperationRateLimitIdentifier(request, { id }),
      30,
      60000,
    )
    if (!quota.allowed)
      return NextResponse.json(
        { error: 'Too many requests. Try again shortly.' },
        { status: 429, headers: { ...headers, 'Retry-After': '60' } },
      )
    const data = await readPublicParcelShare(id.toLowerCase(), auth[1])
    return data ? NextResponse.json({ data }, { headers }) : unavailable()
  } catch {
    // No provider, SQL, token, coordinate or private project details in errors.
    return NextResponse.json(
      { error: 'Shared drafts are temporarily unavailable. Try again later.' },
      { status: 503, headers },
    )
  }
}
