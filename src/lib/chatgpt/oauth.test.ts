import { db } from '@/lib/db'
import { authenticateMcp, authorizeChatGPT, exchangeToken, hashCredential, pkceChallenge } from './oauth'
import { installChatGPTNoticeFixture } from '../../../tests/fixtures/chatgptNotice'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }))

const CLIENT_ID = 'C'.repeat(43)
const USER_ID = '11111111-1111-4111-8111-111111111111'
const GRANT_ID = '22222222-2222-4222-8222-222222222222'
const ORIGIN = 'https://metardu.space'
const REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect'
const VERIFIER = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'
const CHALLENGE = pkceChallenge(VERIFIER)
const client = { query: jest.fn() }
const mockedDb = db as unknown as { query: jest.Mock; transaction: jest.Mock }

function queryCall(mock: jest.Mock, index: number): [unknown, unknown[]] {
  const call = mock.mock.calls[index] as [unknown, unknown[]] | undefined
  if (!call) throw new Error(`Expected database call ${index + 1}`)
  return call
}

function params(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'projects:read',
    resource: ORIGIN,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    state: 'chatgpt-state-123',
    ...overrides,
  })
}

beforeEach(() => {
  installChatGPTNoticeFixture()
  client.query.mockReset()
  mockedDb.query.mockReset()
  mockedDb.transaction.mockReset()
  process.env.METARDU_MCP_ENABLED = 'true'
  process.env.METARDU_MCP_ORIGIN = ORIGIN
  mockedDb.transaction.mockImplementation((work: (connection: typeof client) => unknown) => work(client))
})

afterAll(() => {
  delete process.env.METARDU_MCP_ENABLED
  delete process.env.METARDU_MCP_ORIGIN
})

describe('ChatGPT OAuth lifecycle', () => {
  it('does not create a connection for a suspended account', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ redirect_uris: [REDIRECT] }] })
      .mockResolvedValueOnce({ rows: [{ id: USER_ID }] })
      .mockResolvedValueOnce({ rows: [{ is_suspended: true }] })
    await expect(authorizeChatGPT(USER_ID, params())).rejects.toThrow('Account unavailable')
    expect(client.query).toHaveBeenCalledTimes(3)
    expect(client.query.mock.calls.some((call: unknown[]) => String(call[0]).includes('INSERT INTO chatgpt_grants'))).toBe(false)
  })
  it('issues a short-lived code only for the registered ChatGPT callback and stores only hashes', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ redirect_uris: [REDIRECT] }] })
      .mockResolvedValueOnce({ rows: [{ id: USER_ID }] })
      .mockResolvedValueOnce({ rows: [{ is_suspended: false }] })
      .mockResolvedValueOnce({ rows: [{ id: GRANT_ID }] })
      .mockResolvedValueOnce({ rows: [] })

    const destination = new URL(await authorizeChatGPT(USER_ID, params()))
    const code = destination.searchParams.get('code')
    if (!code) throw new Error('Authorization code was not returned')
    expect(destination.origin + destination.pathname).toBe(REDIRECT)
    expect(destination.searchParams.get('state')).toBe('chatgpt-state-123')
    expect(destination.searchParams.get('iss')).toBe(ORIGIN)
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(queryCall(client.query, 4)[1]).toEqual([hashCredential(code), GRANT_ID, REDIRECT, CHALLENGE])
    expect(JSON.stringify(client.query.mock.calls)).not.toContain(CLIENT_ID)
    expect(JSON.stringify(client.query.mock.calls)).not.toContain(code)
  })

  it('rejects a non-registered callback before creating a grant', async () => {
    const unregisteredCallback = 'https://chatgpt.com/connector/oauth/not-this-client'
    client.query.mockResolvedValueOnce({ rows: [{ redirect_uris: [REDIRECT] }] })
    await expect(authorizeChatGPT(USER_ID, params({ redirect_uri: unregisteredCallback }))).rejects.toThrow()
    expect(client.query).toHaveBeenCalledTimes(1)
  })

  it('stores the exact, canonically ordered permission set a user approved', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ redirect_uris: [REDIRECT] }] })
      .mockResolvedValueOnce({ rows: [{ id: USER_ID }] })
      .mockResolvedValueOnce({ rows: [{ is_suspended: false }] })
      .mockResolvedValueOnce({ rows: [{ id: GRANT_ID }] })
      .mockResolvedValueOnce({ rows: [] })
    await authorizeChatGPT(USER_ID, params({ scope: 'survey:compute projects:read survey-data:read' }))
    expect(queryCall(client.query, 3)[1]).toEqual([USER_ID, hashCredential(CLIENT_ID), 'projects:read survey-data:read survey:compute', ORIGIN])
  })

  it('requires the matching PKCE verifier and rotates the authorization code to access and refresh tokens', async () => {
    const code = 'A'.repeat(43)
    client.query
      .mockResolvedValueOnce({ rows: [{ id: GRANT_ID, scope: 'projects:read', consumed_at: null, redirect_uri: REDIRECT, code_challenge: CHALLENGE }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const token = await exchangeToken(new URLSearchParams({
      grant_type: 'authorization_code', client_id: CLIENT_ID, resource: ORIGIN,
      redirect_uri: REDIRECT, code, code_verifier: VERIFIER,
    }))

    expect(token).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'projects:read' })
    expect(token.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(token.refresh_token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(queryCall(client.query, 1)[1]).toEqual([hashCredential(code)])
    expect(queryCall(client.query, 2)[1]).toEqual([hashCredential(token.access_token), hashCredential(token.refresh_token), GRANT_ID])
  })

  it('rejects refresh-token replay and revokes its grant', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: GRANT_ID, scope: 'projects:read', consumed_at: new Date(), redirect_uri: REDIRECT, code_challenge: CHALLENGE }] })
      .mockResolvedValueOnce({ rows: [] })
    await expect(exchangeToken(new URLSearchParams({
      grant_type: 'refresh_token', client_id: CLIENT_ID, resource: ORIGIN, refresh_token: 'R'.repeat(43),
    }))).rejects.toThrow('invalid_grant')
    expect(queryCall(client.query, 1)[0]).toContain('UPDATE chatgpt_grants SET revoked_at=NOW()')
    expect(queryCall(client.query, 1)[1]).toEqual([GRANT_ID])
  })

  it('resolves the METARDU user from a valid bearer token', async () => {
    mockedDb.query.mockResolvedValueOnce({ rows: [{ user_id: USER_ID, scope: 'projects:read survey:compute' }] })
    const token = 'T'.repeat(43)
    const userId = await authenticateMcp(new Request(`${ORIGIN}/api/mcp`, { headers: { authorization: `Bearer ${token}` } }))
    expect(userId).toEqual({ userId: USER_ID, scopes: ['projects:read', 'survey:compute'] })
    expect(queryCall(mockedDb.query, 0)[1]).toEqual([hashCredential(token), ORIGIN])
  })
})
