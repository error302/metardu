#!/usr/bin/env node
// Packaged token/MCP routes against disposable synthetic records only.
// Authorization codes are seeded fixtures; this does not prove browser consent.
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const base = 'http://127.0.0.1:3002'
const origin = 'https://metardu.example'
const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect'
const admin = new pg.Client({ connectionString: rehearsalDatabaseConfig().adminUrl, connectionTimeoutMillis: 5000 })
const ids = { owner: randomUUID(), other: randomUUID(), project: randomUUID(), foreign: randomUUID(), grant: randomUUID(), computeGrant: randomUUID() }
const clientId = randomBytes(32).toString('base64url')
const code = randomBytes(32).toString('base64url')
const verifier = randomBytes(48).toString('base64url')
const computeAccess = randomBytes(32).toString('base64url')
const hash = value => createHash('sha256').update(value).digest('hex')
const checks = []
let requestId = 0
function check(name, passed) {
  checks.push({ name, passed: Boolean(passed) })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
}
async function token(params) {
  const response = await fetch(`${base}/api/chatgpt/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params, signal: AbortSignal.timeout(20000),
  })
  return { response, body: await response.json() }
}
async function rpc(access, method, params) {
  const response = await fetch(`${base}/api/mcp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${access}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }), signal: AbortSignal.timeout(20000),
  })
  return { response, body: await response.json() }
}
const redeem = value => new URLSearchParams({ client_id: clientId, resource: origin, redirect_uri: redirect,
  grant_type: 'authorization_code', code, code_verifier: value })
await admin.connect()
try {
  await admin.query('BEGIN')
  await admin.query(`INSERT INTO public.users(id,email,password_hash,full_name) VALUES
    ($1,$2,'synthetic-no-password-login','Synthetic MCP Owner'),($3,$4,'synthetic-no-password-login','Synthetic MCP Other')`,
  [ids.owner, `mcp-${ids.owner}@example.invalid`, ids.other, `mcp-${ids.other}@example.invalid`])
  await admin.query("INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES ($1,'surveyor',false),($2,'surveyor',false)", [ids.owner, ids.other])
  await admin.query(`INSERT INTO public.projects(id,user_id,name) VALUES
    ($1,$2,'Synthetic MCP Owned Project'),($3,$4,'Synthetic MCP Private Other Project')`, [ids.project, ids.owner, ids.foreign, ids.other])
  await admin.query('INSERT INTO public.chatgpt_clients(client_id_hash,client_name,redirect_uris) VALUES ($1,$2,$3::jsonb)',
    [hash(clientId), 'Synthetic packaged MCP verification', JSON.stringify([redirect])])
  await admin.query("INSERT INTO public.chatgpt_grants(id,user_id,client_id,scope,resource) VALUES ($1,$2,$3,'projects:read',$4)",
    [ids.grant, ids.owner, hash(clientId), origin])
  await admin.query(`INSERT INTO public.chatgpt_credentials(token_hash,grant_id,kind,redirect_uri,code_challenge,expires_at)
    VALUES ($1,$2,'code',$3,$4,NOW()+INTERVAL '5 minutes')`,
  [hash(code), ids.grant, redirect, createHash('sha256').update(verifier).digest('base64url')])
  await admin.query("INSERT INTO public.chatgpt_grants(id,user_id,client_id,scope,resource) VALUES ($1,$2,$3,'survey:compute',$4)",
    [ids.computeGrant, ids.owner, hash(clientId), origin])
  await admin.query("INSERT INTO public.chatgpt_credentials(token_hash,grant_id,kind,expires_at) VALUES ($1,$2,'access',NOW()+INTERVAL '1 hour')",
    [hash(computeAccess), ids.computeGrant])
  await admin.query('COMMIT')

  const bad = await token(redeem('x'.repeat(64)))
  check('packaged token route rejects wrong PKCE without consuming the code', bad.response.status === 400
    && bad.body.error === 'invalid_grant'
    && (await admin.query('SELECT consumed_at FROM public.chatgpt_credentials WHERE token_hash=$1', [hash(code)])).rows[0].consumed_at === null)
  const linked = await token(redeem(verifier))
  check('packaged token route accepts a valid fixture code with no-store response', linked.response.status === 200
    && typeof linked.body.access_token === 'string' && linked.body.scope === 'projects:read'
    && linked.response.headers.get('cache-control')?.includes('no-store'))
  assert.equal(linked.response.status, 200, 'token exchange must work before MCP checks')
  const tools = await rpc(linked.body.access_token, 'tools/list', {})
  check('packaged MCP publishes all seven survey tools', tools.response.status === 200
    && tools.body.result?.tools?.map(tool => tool.name).join(',') === 'list_projects,get_project,list_project_observations,compute_closed_traverse,compute_stakeout,compute_level_book,create_report_draft')
  const own = await rpc(linked.body.access_token, 'tools/call', { name: 'list_projects', arguments: {} })
  check('packaged MCP reads only the connected account project with no-store response', own.response.status === 200
    && own.body.result?.isError !== true && own.body.result?.structuredContent?.projects?.length === 1
    && own.body.result.structuredContent.projects[0].id === ids.project
    && own.response.headers.get('cache-control')?.includes('no-store'))
  const foreign = await rpc(linked.body.access_token, 'tools/call', { name: 'get_project', arguments: { project_id: ids.foreign } })
  check('packaged MCP cannot read another account project', foreign.body.result?.isError === true)
  const observations = await rpc(linked.body.access_token, 'tools/call', { name: 'list_project_observations', arguments: { project_id: ids.project } })
  check('project-only token receives an observation scope challenge', observations.body.result?.isError === true
    && observations.body.result?._meta?.['mcp/www_authenticate']?.some(value => value.includes('survey-data:read')))
  const injected = await rpc(linked.body.access_token, 'tools/call', { name: 'list_projects', arguments: { user_id: ids.other } })
  check('packaged MCP rejects caller-supplied account identity', injected.body.result?.isError === true || Boolean(injected.body.error))
  const stakeout = await rpc(computeAccess, 'tools/call', { name: 'compute_stakeout', arguments: {
    coordinate_reference: 'Synthetic local metre grid', setup_station: 'S1', setup_easting_m: 500000, setup_northing_m: 9800000,
    backsight_station: 'BS1', backsight_easting_m: 500000, backsight_northing_m: 9800100,
    targets: [{ point_id: 'PIPE-01', easting_m: 500100, northing_m: 9800000 }],
  } })
  const stakeoutData = stakeout.body.result?.structuredContent
  check('packaged stakeout computes the known east target without claiming CRS verification', stakeout.body.result?.isError !== true
    && stakeoutData?.computation === 'grid_stakeout' && stakeoutData.coordinate_reference_verified === false
    && Math.abs(stakeoutData.targets?.[0]?.horizontal_distance_m - 100) < 1e-9
    && Math.abs(stakeoutData.targets?.[0]?.grid_bearing_deg - 90) < 1e-9
    && Math.abs(stakeoutData.targets?.[0]?.clockwise_turn_from_backsight_deg - 90) < 1e-9)
  const levels = await rpc(computeAccess, 'tools/call', { name: 'compute_level_book', arguments: {
    opening_rl_m: 100, closing_rl_m: 101, distance_km: 0.1, method: 'height_of_collimation',
    rows: [{ station: 'BM1', bs_m: 1.5 }, { station: 'BM2', fs_m: 0.5 }],
  } })
  const levelData = levels.body.result?.structuredContent
  check('packaged level book closes a known run and leaves unspecified acceptance unknown', levels.body.result?.isError !== true
    && levelData?.computation === 'level_book' && levelData.checks?.arithmetic_consistent === true
    && levelData.checks.computed_closing_rl_m === 101 && levelData.checks.closing_misclosure_m === 0
    && levelData.checks.within_specified_allowable_misclosure === null)
  const computePrivate = await rpc(computeAccess, 'tools/call', { name: 'list_projects', arguments: {} })
  check('calculation-only scope cannot discover private projects', computePrivate.body.result?.isError === true
    && computePrivate.body.result?._meta?.['mcp/www_authenticate']?.some(value => value.includes('projects:read')))
  const refreshed = await token(new URLSearchParams({ client_id: clientId, resource: origin,
    grant_type: 'refresh_token', refresh_token: linked.body.refresh_token }))
  check('packaged refresh rotates credentials', refreshed.response.status === 200
    && typeof refreshed.body.access_token === 'string' && refreshed.body.refresh_token !== linked.body.refresh_token)
  assert.equal(refreshed.response.status, 200)
  await admin.query('UPDATE public.surveyor_profiles SET is_suspended=true WHERE user_id=$1', [ids.owner])
  const suspended = await rpc(refreshed.body.access_token, 'tools/call', { name: 'list_projects', arguments: {} })
  check('suspension blocks an existing packaged MCP bearer', suspended.body.result?.isError === true
    && Boolean(suspended.body.result?._meta?.['mcp/www_authenticate']))
  const suspendedRefresh = await token(new URLSearchParams({ client_id: clientId, resource: origin,
    grant_type: 'refresh_token', refresh_token: refreshed.body.refresh_token }))
  check('suspension blocks packaged refresh', suspendedRefresh.response.status === 400 && suspendedRefresh.body.error === 'invalid_grant')
  await admin.query('UPDATE public.surveyor_profiles SET is_suspended=false WHERE user_id=$1', [ids.owner])
  const restored = await rpc(refreshed.body.access_token, 'tools/call', { name: 'list_projects', arguments: {} })
  check('restoration does not revive the packaged MCP bearer', restored.body.result?.isError === true)
  assert.ok(checks.every(item => item.passed), 'packaged MCP checks include a failure')
} finally {
  await mkdir('test-results/runtime-database', { recursive: true })
  await writeFile('test-results/runtime-database/packaged-mcp.json', JSON.stringify({ synthetic: true,
    base, origin, authorizationCodeSource: 'seeded synthetic fixture; browser consent not assessed',
    passed: checks.length === 14 && checks.every(item => item.passed), checks }, null, 2) + '\n')
  await admin.query('ROLLBACK')
  await admin.query('DELETE FROM public.users WHERE id=ANY($1::uuid[])', [[ids.owner, ids.other]])
  await admin.query('DELETE FROM public.chatgpt_clients WHERE client_id_hash=$1', [hash(clientId)])
  await admin.end()
}
