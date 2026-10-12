import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { chatgptConfig, normalizeScopes, validateAuthorization } from './config'

export const hashCredential = (value: string) => createHash('sha256').update(value).digest('hex')
export const pkceChallenge = (value: string) => createHash('sha256').update(value).digest('base64url')
const secret = () => randomBytes(32).toString('base64url')

export async function authorizeChatGPT(userId: string, params: URLSearchParams) {
  const config = validateAuthorization(params)
  const clientId = params.get('client_id')
  const redirectUri = params.get('redirect_uri')
  const requestedScope = params.get('scope')
  const challenge = params.get('code_challenge')
  if (!clientId || !redirectUri || !requestedScope || !challenge) {
    throw new Error('Invalid OAuth authorization request')
  }
  const scope = normalizeScopes(requestedScope).join(' ')
  const code = secret()
  await db.transaction(async client => {
    const registered = await client.query<{ redirect_uris: string[] }>(
      'SELECT redirect_uris FROM chatgpt_clients WHERE client_id_hash=$1 AND revoked_at IS NULL AND expires_at>NOW() FOR SHARE',
      [hashCredential(clientId)],
    )
    if (!registered.rows[0]?.redirect_uris.includes(redirectUri)) throw new Error('OAuth client is not registered for this callback')
    const account = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE id=$1 FOR SHARE', [userId],
    )
    if (!account.rows[0]) throw new Error('Account unavailable')
    // Read suspension after acquiring the account lock. A separate statement
    // gets a fresh snapshot if that lock waited for a concurrent suspension.
    const state = await client.query<{ is_suspended: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM surveyor_profiles WHERE user_id=$1 AND is_suspended) AS is_suspended', [userId],
    )
    if (state.rows[0]?.is_suspended !== false) throw new Error('Account unavailable')
    const grant = await client.query<{ id: string }>(
      'INSERT INTO chatgpt_grants (user_id, client_id, scope, resource) VALUES ($1,$2,$3,$4) RETURNING id',
      [userId, hashCredential(clientId), scope, config.resource],
    )
    await client.query(`INSERT INTO chatgpt_credentials (token_hash, grant_id, kind, redirect_uri, code_challenge, expires_at)
      VALUES ($1,$2,'code',$3,$4,NOW() + INTERVAL '5 minutes')`,
    [hashCredential(code), grant.rows[0].id, redirectUri, challenge])
  })
  const target = new URL(redirectUri)
  target.searchParams.set('code', code)
  const state = params.get('state')
  if (!state) throw new Error('Invalid OAuth state')
  target.searchParams.set('state', state)
  target.searchParams.set('iss', config.origin)
  return target.toString()
}

export async function exchangeToken(params: URLSearchParams) {
  const config = chatgptConfig()
  const clientId = params.get('client_id') ?? ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(clientId) || params.get('resource') !== config.resource || params.has('client_secret')) throw new Error('invalid_grant')
  let requestedScope: string | null = null
  if (params.has('scope')) {
    const scope = params.get('scope')
    if (!scope) throw new Error('invalid_scope')
    try { requestedScope = normalizeScopes(scope).join(' ') }
    catch { throw new Error('invalid_scope') }
  }
  const refresh = params.get('grant_type') === 'refresh_token'
  if (!refresh && params.get('grant_type') !== 'authorization_code') throw new Error('unsupported_grant_type')
  const credential = params.get(refresh ? 'refresh_token' : 'code')
  if (!credential || !/^[A-Za-z0-9_-]{43}$/.test(credential)) throw new Error('invalid_grant')
  const verifier = params.get('code_verifier') ?? ''
  if (!refresh && !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new Error('invalid_grant')
  const access = secret(), nextRefresh = secret()
  const acceptedScope = await db.transaction(async client => {
    // Lock the grant, not just one token: rotation and revocation serialize together.
    const result = await client.query<{ id: string; scope: string; consumed_at: Date | null; redirect_uri: string; code_challenge: string }>(
      `SELECT g.id, g.scope, c.consumed_at, c.redirect_uri, c.code_challenge
       FROM chatgpt_credentials c JOIN chatgpt_grants g ON g.id=c.grant_id
       JOIN chatgpt_clients registered ON registered.client_id_hash=g.client_id
       JOIN users u ON u.id=g.user_id
       WHERE c.token_hash=$1 AND c.kind=$2 AND c.expires_at>NOW()
         AND g.client_id=$3 AND registered.revoked_at IS NULL AND registered.expires_at>NOW()
         AND g.resource=$4 AND g.revoked_at IS NULL AND g.expires_at>NOW()
         AND NOT EXISTS (SELECT 1 FROM surveyor_profiles sp WHERE sp.user_id=u.id AND sp.is_suspended)
       FOR UPDATE OF g, c`, [hashCredential(credential), refresh ? 'refresh' : 'code', hashCredential(clientId), config.resource])
    const row = result.rows[0]
    if (!row) return null
    if (row.consumed_at) {
      await client.query('UPDATE chatgpt_grants SET revoked_at=NOW() WHERE id=$1', [row.id])
      return null
    }
    if (requestedScope && requestedScope !== row.scope) return null
    if (!refresh && (params.get('redirect_uri') !== row.redirect_uri || pkceChallenge(verifier) !== row.code_challenge)) return null
    await client.query('UPDATE chatgpt_credentials SET consumed_at=NOW() WHERE token_hash=$1', [hashCredential(credential)])
    await client.query(`INSERT INTO chatgpt_credentials (token_hash, grant_id, kind, expires_at)
      VALUES ($1,$3,'access',NOW() + INTERVAL '1 hour'), ($2,$3,'refresh',NOW() + INTERVAL '30 days')`,
    [hashCredential(access), hashCredential(nextRefresh), row.id])
    return row.scope
  })
  if (!acceptedScope) throw new Error('invalid_grant')
  return { access_token: access, token_type: 'Bearer', expires_in: 3600, refresh_token: nextRefresh, scope: acceptedScope }
}

export interface McpAuthorizationContext {
  userId: string
  scopes: string[]
}

export async function authenticateMcp(request: Request): Promise<McpAuthorizationContext | null> {
  const config = chatgptConfig()
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('authorization') ?? '')
  if (!match) return null
  const result = await db.query<{ user_id: string; scope: string }>(`SELECT g.user_id, g.scope FROM chatgpt_credentials c
    JOIN chatgpt_grants g ON g.id=c.grant_id JOIN users u ON u.id=g.user_id
    JOIN chatgpt_clients registered ON registered.client_id_hash=g.client_id
    WHERE c.token_hash=$1 AND c.kind='access' AND c.consumed_at IS NULL AND c.expires_at>NOW()
      AND registered.revoked_at IS NULL AND registered.expires_at>NOW()
      AND NOT EXISTS (SELECT 1 FROM surveyor_profiles sp WHERE sp.user_id=u.id AND sp.is_suspended)
      AND g.revoked_at IS NULL AND g.expires_at>NOW() AND g.resource=$2`,
  [hashCredential(match[1]), config.resource])
  const row = result.rows[0]
  if (!row) return null
  try {
    return { userId: row.user_id, scopes: normalizeScopes(row.scope) }
  } catch {
    return null
  }
}
