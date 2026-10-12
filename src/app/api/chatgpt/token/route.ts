import { exchangeToken } from '@/lib/chatgpt/oauth'
import { chatgptConfig } from '@/lib/chatgpt/config'
import { rateLimit, getClientIdentifier } from '@/lib/security/rateLimit'
import { readTextBounded } from '@/lib/security/requestBody'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }
export async function POST(request: Request) {
  try { chatgptConfig() } catch { return Response.json({ error: 'temporarily_unavailable' }, { status: 503, headers }) }
  try {
    if (!(await rateLimit(`chatgpt-token:${getClientIdentifier(request)}`, 30)).allowed) return Response.json({ error: 'temporarily_unavailable' }, { status: 429, headers })
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return Response.json({ error: 'invalid_request' }, { status: 400, headers })
    const body = await readTextBounded(request.body, 8192)
    if (body === null) return Response.json({ error: 'invalid_request' }, { status: 413, headers })
    const params = new URLSearchParams(body)
    if (Array.from(params.keys()).some(key => params.getAll(key).length !== 1)) return Response.json({ error: 'invalid_request' }, { status: 400, headers })
    return Response.json(await exchangeToken(params), { headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const known = ['invalid_grant', 'invalid_scope', 'unsupported_grant_type'].includes(message)
    return Response.json({ error: known ? message : 'temporarily_unavailable' }, { status: known ? 400 : 503, headers })
  }
}
