import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { authorizeChatGPT } from '@/lib/chatgpt/oauth'
import { validateAuthorization } from '@/lib/chatgpt/config'
import { rateLimit } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

export const POST = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60_000 } },
  async (_request, ctx) => {
    const body = ctx.body as { serializedRequest?: unknown; decision?: unknown } | null
    if (
      !body || typeof body.serializedRequest !== 'string' || body.serializedRequest.length > 8192 ||
      (body.decision !== 'allow' && body.decision !== 'deny')
    ) {
      return NextResponse.json({ error: 'Invalid consent decision' }, { status: 400, headers: noStore })
    }

    const params = new URLSearchParams(body.serializedRequest)
    let authorization: ReturnType<typeof validateAuthorization>
    try {
      authorization = validateAuthorization(params)
    } catch {
      return NextResponse.json({ error: 'This connection request is invalid or expired' }, { status: 400, headers: noStore })
    }

    if (body.decision === 'deny') {
      const redirectUri = params.get('redirect_uri')
      const state = params.get('state')
      if (!redirectUri || !state) {
        return NextResponse.json({ error: 'This connection request is invalid or expired' }, { status: 400, headers: noStore })
      }
      const denied = new URL(redirectUri)
      denied.searchParams.set('error', 'access_denied')
      denied.searchParams.set('state', state)
      denied.searchParams.set('iss', authorization.origin)
      return NextResponse.json({ redirectUrl: denied.toString() }, { headers: noStore })
    }

    if (!(await rateLimit(`chatgpt-consent:${ctx.userId}`, 10)).allowed) {
      return NextResponse.json({ error: 'Too many connection attempts. Try again later.' }, { status: 429, headers: noStore })
    }

    const redirectUrl = await authorizeChatGPT(ctx.userId, params)
    return NextResponse.json({ redirectUrl }, { headers: noStore })
  },
)
