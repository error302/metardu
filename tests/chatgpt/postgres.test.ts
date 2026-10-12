/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { Pool } from 'pg'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { db } from '@/lib/db'
import { authorizeChatGPT, exchangeToken, authenticateMcp, pkceChallenge, hashCredential } from '@/lib/chatgpt/oauth'
import { createProjectServer } from '@/lib/chatgpt/server'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }))
const integration = process.env.CHATGPT_TEST_POSTGRES === '1' ? describe : describe.skip
const EXPECTED_LEGACY_CRS = 'EPSG:21037'
integration('isolated local PostgreSQL account-linking workflow', () => {
  const schema = `chatgpt_test_${randomUUID().replaceAll('-', '')}`
  const owner = randomUUID(), other = randomUUID(), project = randomUUID(), foreign = randomUUID(), legacy = randomUUID()
  const verifier = 'v'.repeat(64)
  const clientId = randomBytes(32).toString('base64url')
  let pool: Pool
  let admin: Pool
  const config = { METARDU_MCP_ENABLED: 'true', METARDU_MCP_ORIGIN: 'https://metardu.example' }
  const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect'
  const params = () => new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'projects:read', resource: config.METARDU_MCP_ORIGIN, code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256', state: 'test-state' })
  const redeem = (code: string) => new URLSearchParams({ ...Object.fromEntries(params()), code, code_verifier: verifier, grant_type: 'authorization_code' })
  const bearer = (token: string) => new Request('https://metardu.example/api/mcp', { headers: { Authorization: `Bearer ${token}` } })
  async function link() {
    const destination = new URL(await authorizeChatGPT(owner, params()))
    expect(destination.searchParams.get('state')).toBe('test-state')
    const code = destination.searchParams.get('code')
    if (!code) throw new Error('Expected an authorization code')
    return { code, tokens: await exchangeToken(redeem(code)) }
  }
  beforeAll(async () => {
    installChatGPTNoticeFixture()
    Object.assign(process.env, config)
    // Reuse the native ESM guard through a subprocess; never read .env or
    // infer a production database from DATABASE_URL/DB_* settings.
    const connection = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
      "import {rehearsalDatabaseConfig} from './scripts/rehearsal-database.mjs';process.stdout.write(JSON.stringify({connectionString:rehearsalDatabaseConfig().adminUrl}))"],
      { cwd: process.cwd(), encoding: 'utf8' })) as { connectionString: string }
    admin = new Pool({ ...connection, connectionTimeoutMillis: 5000 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({ ...connection, options: `-c search_path=${schema},public`, connectionTimeoutMillis: 5000 })
    // All fixture tables and the new migration live in this randomly named schema.
    await pool.query(`CREATE TABLE users (id uuid PRIMARY KEY); CREATE TABLE projects (id uuid PRIMARY KEY, user_id uuid, name text, survey_type text, location text, datum text, utm_zone integer, hemisphere text);`)
    await pool.query('CREATE TABLE surveyor_profiles(user_id uuid PRIMARY KEY, is_suspended boolean NOT NULL DEFAULT false)')
    await pool.query(readFileSync('src/lib/db/migrations/065_project_reference_systems.sql', 'utf8'))
    await pool.query(readFileSync('src/lib/db/migrations/077_chatgpt_oauth.sql', 'utf8'))
    const scopeMigration = readFileSync('src/lib/db/migrations/079_chatgpt_survey_tools_scopes.sql', 'utf8').split(/^\s*--\s*DOWN\b/im, 1)[0]
    await pool.query(scopeMigration)
    await pool.query('INSERT INTO chatgpt_clients (client_id_hash,client_name,redirect_uris) VALUES ($1,$2,$3::jsonb)', [hashCredential(clientId), 'ChatGPT integration test', JSON.stringify([redirectUri])])
    await pool.query('INSERT INTO users VALUES ($1),($2)', [owner, other])
    await pool.query(`INSERT INTO projects (id,user_id,name,survey_type,location,datum,utm_zone,hemisphere) VALUES
      ($1,$2,'Owned survey','cadastral','Test site','Arc 1960',37,'S'),
      ($3,$4,'Other account survey','cadastral','Private','Arc 1960',37,'S'),
      ($5,NULL,'Ownerless survey','cadastral','Legacy',NULL,NULL,NULL)`, [project, owner, foreign, other, legacy])
    jest.mocked(db.query).mockImplementation((sql, values) => pool.query(sql, values))
    jest.mocked(db.transaction).mockImplementation(async fn => {
      const client = await pool.connect()
      try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result }
      catch (error) { await client.query('ROLLBACK'); throw error }
      finally { client.release() }
    })
  })
  afterAll(async () => {
    if (pool) await pool.end()
    if (admin) {
      // Only the schema generated in this test is eligible for cleanup.
      if (/^chatgpt_test_[a-f0-9]{32}$/.test(schema)) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })
  test('links, verifies bearer access, and persists hashes only', async () => {
    const { code, tokens } = await link()
    expect(await authenticateMcp(bearer(tokens.access_token))).toEqual({ userId: owner, scopes: ['projects:read'] })
    const rows = (await pool.query<{ token_hash: string }>('SELECT token_hash FROM chatgpt_credentials')).rows
    expect(rows.some(row => row.token_hash === hashCredential(code))).toBe(true)
    expect(JSON.stringify(rows)).not.toContain(tokens.access_token)
    expect(await authenticateMcp(bearer('x'.repeat(43)))).toBeNull()
  })
  test('wrong PKCE or resource does not redeem the code', async () => {
    const code = new URL(await authorizeChatGPT(owner, params())).searchParams.get('code')
    if (!code) throw new Error('Expected an authorization code')
    const bad = redeem(code); bad.set('code_verifier', 'z'.repeat(64))
    await expect(exchangeToken(bad)).rejects.toThrow('invalid_grant')
    bad.set('code_verifier', verifier); bad.set('resource', 'https://other.example')
    await expect(exchangeToken(bad)).rejects.toThrow('invalid_grant')
    expect((await exchangeToken(redeem(code))).access_token).toBeTruthy()
  })
  test('code replay revokes the grant', async () => {
    const { code, tokens } = await link()
    await expect(exchangeToken(redeem(code))).rejects.toThrow('invalid_grant')
    expect(await authenticateMcp(bearer(tokens.access_token))).toBeNull()
  })
  test('rotates refresh tokens and rejects replay', async () => {
    const { tokens } = await link()
    const refresh = new URLSearchParams({ client_id: clientId, resource: config.METARDU_MCP_ORIGIN, grant_type: 'refresh_token', refresh_token: tokens.refresh_token })
    const next = await exchangeToken(refresh)
    expect(next.refresh_token).not.toBe(tokens.refresh_token)
    expect(await authenticateMcp(bearer(next.access_token))).toEqual({ userId: owner, scopes: ['projects:read'] })
    await expect(exchangeToken(refresh)).rejects.toThrow('invalid_grant')
    expect(await authenticateMcp(bearer(next.access_token))).toBeNull()
  })
  test('expiry and user revocation stop access', async () => {
    const { tokens } = await link()
    await pool.query('UPDATE chatgpt_credentials SET expires_at=NOW()-INTERVAL \'1 minute\' WHERE token_hash=$1', [hashCredential(tokens.access_token)])
    expect(await authenticateMcp(bearer(tokens.access_token))).toBeNull()
    const second = await link()
    await pool.query('UPDATE chatgpt_grants SET revoked_at=NOW() WHERE id=(SELECT grant_id FROM chatgpt_credentials WHERE token_hash=$1)', [hashCredential(second.tokens.access_token)])
    expect(await authenticateMcp(bearer(second.tokens.access_token))).toBeNull()
  })
  test('MCP client sees only owned projects, preserves CRS provenance, and rejects identity injection', async () => {
    const server = createProjectServer({ userId: owner, scopes: ['projects:read'] }, config.METARDU_MCP_ORIGIN)
    const client = new Client({ name: 'metardu-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    try {
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
        'list_projects', 'get_project', 'list_project_observations', 'compute_closed_traverse',
        'compute_stakeout', 'compute_level_book', 'create_report_draft',
      ])
      const denied = await client.callTool({ name: 'list_project_observations', arguments: { project_id: project } })
      expect(denied.isError).toBe(true)
      expect(denied._meta?.['mcp/www_authenticate']).toEqual(expect.arrayContaining([expect.stringContaining('survey-data:read')]))
      const result = await client.callTool({ name: 'list_projects', arguments: {} })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toMatchObject({ projects: [{ id: project, reference_system: { source: 'legacy', code: EXPECTED_LEGACY_CRS } }] })
      expect((result.structuredContent as { projects: unknown[] }).projects).toHaveLength(1)
      for (const id of [foreign, legacy, randomUUID()]) expect((await client.callTool({ name: 'get_project', arguments: { project_id: id } })).isError).toBe(true)
      expect((await client.callTool({ name: 'list_projects', arguments: { user_id: other } })).isError).toBe(true)
      expect((await client.callTool({ name: 'list_projects', arguments: { limit: 1000 } })).isError).toBe(true)
      await pool.query('UPDATE projects SET datum=NULL WHERE id=$1', [project])
      expect((await client.callTool({ name: 'get_project', arguments: { project_id: project } })).structuredContent).toMatchObject({ project: { reference_system: { source: 'missing', code: null } } })
    } finally { await client.close(); await server.close() }
  })
})
import { installChatGPTNoticeFixture } from '../fixtures/chatgptNotice'
