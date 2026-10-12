import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { chatgptConfig } from '@/lib/chatgpt/config'
import { authenticateMcp } from '@/lib/chatgpt/oauth'
import { createProjectServer } from '@/lib/chatgpt/server'
import { setCurrentUserId } from '@/lib/db'
import { rateLimit, getClientIdentifier } from '@/lib/security/rateLimit'
import { mcpCorsHeaders } from '@/lib/cors'
import { readTextBounded } from '@/lib/security/requestBody'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  let config: ReturnType<typeof chatgptConfig>
  try { config = chatgptConfig() } catch { return Response.json({ error: 'Integration unavailable' }, { status: 503 }) }
  const noCache = { 'Cache-Control': 'no-store' }
  // Server-to-server calls omit Origin. Browser requests must be same-origin.
  if (request.headers.has('origin') && request.headers.get('origin') !== config.origin && !Object.keys(mcpCorsHeaders(request.headers.get('origin'))).length) return Response.json({ error: 'Origin not allowed' }, { status: 403, headers: noCache })
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({ error: 'Expected application/json' }, { status: 415, headers: noCache })
  const accept = request.headers.get('accept') ?? ''
  if (!accept.includes('application/json') && !accept.includes('*/*')) return Response.json({ error: 'Expected application/json response' }, { status: 406, headers: noCache })
  try {
    if (!(await rateLimit(`mcp-ip:${getClientIdentifier(request)}`, 120)).allowed) return Response.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { ...noCache, 'Retry-After': '60' } })
    const auth = await authenticateMcp(request)
    if (auth && !(await rateLimit(`mcp-user:${auth.userId}`, 60)).allowed) return Response.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { ...noCache, 'Retry-After': '60' } })
    // This route bypasses apiHandler, so install the authenticated user in the
    // database RLS context before project, observation, or report queries run.
    if (auth) setCurrentUserId(auth.userId)
    // Traverse payloads with up to 100 field legs and level books with up to
    // 500 readings must fit while the transport still has a strict upper cap.
    const body = await readTextBounded(request.body, 256 * 1024)
    if (body === null) return Response.json({ error: 'Request too large or invalid UTF-8' }, { status: 413, headers: noCache })
    let parsedBody: unknown
    try { parsedBody = JSON.parse(body) } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: noCache }) }
    const server = createProjectServer(auth, config.origin)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    try {
      await server.connect(transport)
      const response = await transport.handleRequest(request, { parsedBody })
      response.headers.set('Cache-Control', 'no-store')
      return response
    } finally { await server.close() }
  } catch { return Response.json({ error: 'Integration temporarily unavailable' }, { status: 503, headers: noCache }) }
}
export function GET() { return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } }) }
export const DELETE = GET
