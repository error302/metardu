import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { chatgptConfig, isChatGPTRedirectUri, normalizeScopes, SUPPORTED_SCOPES } from '@/lib/chatgpt/config'
import { hashCredential } from '@/lib/chatgpt/oauth'
import { getClientIdentifier, rateLimit } from '@/lib/security/rateLimit'
import { readTextBounded } from '@/lib/security/requestBody'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

export async function POST(request: Request) {
  try { chatgptConfig() } catch { return Response.json({ error: 'temporarily_unavailable' }, { status: 503, headers }) }
  try {
    if (!(await rateLimit(`chatgpt-register:${getClientIdentifier(request)}`, 12, 60 * 60 * 1000)).allowed) return Response.json({ error: 'rate limit exceeded' }, { status: 429, headers })
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'unsupported content type' }, { status: 415, headers })
    const text = await readTextBounded(request.body, 8192)
    if (text === null) return Response.json({ error: 'request too large or invalid UTF-8' }, { status: 413, headers })
    let input: Record<string, unknown>
    try { input = JSON.parse(text) as Record<string, unknown> } catch { return Response.json({ error: 'invalid client metadata' }, { status: 400, headers }) }
    if (!input || Array.isArray(input) || typeof input !== 'object') return Response.json({ error: 'invalid client metadata' }, { status: 400, headers })
    const name = typeof input.client_name === 'string' && input.client_name.trim() ? input.client_name.trim().slice(0, 120) : 'ChatGPT'
    const redirects = input.redirect_uris
    const grants = input.grant_types
    const responses = input.response_types
    const auth = input.token_endpoint_auth_method
    if (!Array.isArray(redirects) || redirects.length < 1 || redirects.length > 5 || !redirects.every(uri => typeof uri === 'string' && uri.length <= 300 && isChatGPTRedirectUri(uri))
      || new Set(redirects).size !== redirects.length
      || (grants !== undefined && (!Array.isArray(grants) || grants.some(v => !['authorization_code', 'refresh_token'].includes(String(v))) || !grants.includes('authorization_code')))
      || (responses !== undefined && (!Array.isArray(responses) || responses.some(v => v !== 'code') || !responses.includes('code')))
      || (auth !== undefined && auth !== 'none')) {
      return Response.json({ error: 'client metadata is not supported' }, { status: 400, headers })
    }
    let registeredScopes = [...SUPPORTED_SCOPES]
    if (input.scope !== undefined) {
      if (typeof input.scope !== 'string') return Response.json({ error: 'client metadata is not supported' }, { status: 400, headers })
      try { registeredScopes = normalizeScopes(input.scope) }
      catch { return Response.json({ error: 'client metadata is not supported' }, { status: 400, headers }) }
    }
    const clientId = randomBytes(32).toString('base64url')
    const hash = hashCredential(clientId)
    await db.query('INSERT INTO chatgpt_clients (client_id_hash,client_name,redirect_uris) VALUES ($1,$2,$3::jsonb)', [hash, name, JSON.stringify(redirects)])
    return Response.json({ client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: redirects, grant_types: grants ?? ['authorization_code', 'refresh_token'], response_types: responses ?? ['code'], token_endpoint_auth_method: 'none', scope: registeredScopes.join(' ') }, { status: 201, headers })
  } catch { return Response.json({ error: 'temporarily_unavailable' }, { status: 503, headers }) }
}
