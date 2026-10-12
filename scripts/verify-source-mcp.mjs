// Loopback source protocol proof against existing, marked synthetic data only.
// Seeded authorization codes do not establish human consent or ChatGPT delivery.
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const rehearsal = rehearsalDatabaseConfig()
assert.equal(rehearsal.database, 'metardu_runtime_verify')
const base = 'http://127.0.0.1:3021', origin = 'https://metardu.example'
const callback = 'https://chatgpt.com/connector_platform_oauth_redirect'
const expectedPurpose = 'METARDU synthetic beacon verification only 2026-10-08'
const database = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const ids = { owner: randomUUID(), other: randomUUID(), project: randomUUID(), foreign: randomUUID(), grant: randomUUID() }
const secret = () => randomBytes(32).toString('base64url')
const hash = value => createHash('sha256').update(value).digest('hex')
const code = secret(), verifier = secret(), checks = []
let clientId, access, refresh, verified = false, fixtures = false, serial = 0
const check = (name, value) => { checks.push({ name, passed: Boolean(value) }); console.log(`${value ? 'PASS' : 'FAIL'} ${name}`); assert.ok(value, name) }
async function http(path, options = {}) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(50000) })
  const body = await response.json()
  return { response, body }
}
const token = values => http('/api/chatgpt/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values) })
const redeem = v => ({ grant_type: 'authorization_code', client_id: clientId, resource: origin, redirect_uri: callback, code, code_verifier: v })
const rpc = (bearer, method, params = {}) => http('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++serial, method, params }) })
const call = (name, args, bearer = access) => rpc(bearer, 'tools/call', { name, arguments: args })
await database.connect()
try {
  const purpose = (await database.query("SELECT shobj_description(oid,'pg_database') AS purpose FROM pg_database WHERE datname=current_database()")).rows[0]?.purpose
  assert.equal(purpose, expectedPurpose, 'Never alter a database without its existing synthetic ownership marker.')
  verified = true
  const metadata = await http('/.well-known/oauth-authorization-server')
  check('loopback preview advertises the expected synthetic OAuth issuer and S256', metadata.response.ok && metadata.body.issuer === origin && metadata.body.code_challenge_methods_supported.includes('S256'))
  const resource = await http('/.well-known/oauth-protected-resource')
  check('protected resource discovery agrees with the synthetic issuer', resource.response.ok && resource.body.resource === origin && resource.body.authorization_servers.includes(origin))
  const registered = await http('/api/chatgpt/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'SYNTHETIC source protocol verification', redirect_uris: [callback], token_endpoint_auth_method: 'none' }) })
  clientId = registered.body.client_id
  check('actual registration creates an opaque public client without a client secret', registered.response.status === 201 && /^[A-Za-z0-9_-]{43}$/.test(clientId) && !registered.body.client_secret && registered.response.headers.get('cache-control')?.includes('no-store'))
  await database.query('BEGIN')
  await database.query(`INSERT INTO public.users(id,email,password_hash,full_name) VALUES ($1,$2,'synthetic-no-password-login','SYNTHETIC MCP Operator'),($3,$4,'synthetic-no-password-login','SYNTHETIC Other Operator')`, [ids.owner, `source-mcp-${ids.owner}@example.invalid`, ids.other, `source-mcp-${ids.other}@example.invalid`])
  await database.query("INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES ($1,'surveyor',false),($2,'surveyor',false)", [ids.owner, ids.other])
  await database.query(`INSERT INTO public.projects(id,user_id,name,datum,utm_zone,hemisphere) VALUES ($1,$2,'SYNTHETIC MCP source proof — not field evidence','Arc 1960',37,'S'),($3,$4,'SYNTHETIC private other project','Arc 1960',37,'S')`, [ids.project, ids.owner, ids.foreign, ids.other])
  await database.query(`INSERT INTO public.survey_observations(project_id,client_id,point_name,observation_type,latitude,longitude,elevation,accuracy,horizontal_crs,vertical_datum,fix_quality,accuracy_source,observation_source,notes) VALUES ($1,'private-fixture-device','SYNTHETIC receiver point','gnss',0,36,100.0054,0.001,'EPSG:4326','Synthetic ellipsoidal height',4,'receiver','gnss_receiver','private fixture note'),($1,'private-legacy-device','SYNTHETIC legacy point','gnss',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'private fixture note')`, [ids.project])
  await database.query("INSERT INTO public.chatgpt_grants(id,user_id,client_id,scope,resource) VALUES ($1,$2,$3,'projects:read survey-data:read survey:compute survey-documents:write',$4)", [ids.grant, ids.owner, hash(clientId), origin])
  await database.query("INSERT INTO public.chatgpt_credentials(token_hash,grant_id,kind,redirect_uri,code_challenge,expires_at) VALUES ($1,$2,'code',$3,$4,NOW()+INTERVAL '5 minutes')", [hash(code), ids.grant, callback, createHash('sha256').update(verifier).digest('base64url')])
  await database.query('COMMIT')
  fixtures = true
  const bad = await token(redeem('x'.repeat(43)))
  check('wrong PKCE is denied without consuming the fixture code', bad.response.status === 400 && bad.body.error === 'invalid_grant' && (await database.query('SELECT consumed_at FROM chatgpt_credentials WHERE token_hash=$1', [hash(code)])).rows[0].consumed_at === null)
  const linked = await token(redeem(verifier))
  access = linked.body.access_token; refresh = linked.body.refresh_token
  check('actual token route exchanges the fixture code with a private response', linked.response.ok && /^[A-Za-z0-9_-]{43}$/.test(access) && linked.response.headers.get('cache-control')?.includes('no-store'))
  const tools = await rpc(access, 'tools/list')
  check('HTTP MCP advertises seven scoped tools and output schemas', tools.response.ok && tools.body.result?.tools?.length === 7 && tools.body.result.tools.every(t => t.outputSchema && t.securitySchemes?.[0]?.type === 'oauth2'))
  const anonymous = await call('list_projects', {}, null)
  check('anonymous tools return the OAuth challenge without private data', anonymous.body.result?.isError === true && anonymous.body.result?._meta?.['mcp/www_authenticate']?.length > 0 && !anonymous.body.result?.structuredContent)
  const own = await call('list_projects', {})
  check('project listing contains only this account project and no-store', own.response.ok && own.body.result?.structuredContent?.projects?.length === 1 && own.body.result.structuredContent.projects[0].id === ids.project && own.response.headers.get('cache-control')?.includes('no-store'))
  const detail = await call('get_project', { project_id: ids.project })
  check('owned project detail preserves its recorded legacy reference', detail.body.result?.structuredContent?.project?.id === ids.project && detail.body.result.structuredContent.project.reference_system?.source === 'legacy')
  const foreign = await call('get_project', { project_id: ids.foreign })
  check('another account project is denied', foreign.body.result?.isError === true)
  const observed = await call('list_project_observations', { project_id: ids.project })
  const rows = observed.body.result?.structuredContent?.observations
  const receiver = rows?.find(row => row.point_name === 'SYNTHETIC receiver point'), legacy = rows?.find(row => row.point_name === 'SYNTHETIC legacy point')
  check('actual SQL and HTTP preserve precise receiver coordinates and height', observed.response.ok && rows?.length === 2 && receiver?.latitude === 0 && receiver?.longitude === 36 && receiver?.elevation === 100.0054)
  check('observation provenance remains distinct from the project grid', receiver?.horizontal_crs === 'EPSG:4326' && receiver?.vertical_datum === 'Synthetic ellipsoidal height' && receiver?.fix_quality === 4 && receiver?.accuracy_source === 'receiver' && receiver?.observation_source === 'gnss_receiver')
  check('legacy observation provenance remains explicitly null', legacy?.horizontal_crs === null && legacy?.vertical_datum === null && legacy?.fix_quality === null && legacy?.accuracy_source === null && legacy?.observation_source === null)
  check('private notes and device identifiers are excluded from the wire', !JSON.stringify(rows).includes('private-fixture') && !JSON.stringify(rows).includes('private-legacy') && !JSON.stringify(rows).includes('private fixture note') && rows.every(row => !('id' in row) && !('client_id' in row) && !('notes' in row)))
  const stakeout = await call('compute_stakeout', { coordinate_reference: 'Synthetic metre grid', setup_station: 'S1', setup_easting_m: 500000, setup_northing_m: 9800000, backsight_station: 'BS1', backsight_easting_m: 500000, backsight_northing_m: 9800100, targets: [{ point_id: 'PIPE-01', easting_m: 500100, northing_m: 9800000 }] })
  const target = stakeout.body.result?.structuredContent?.targets?.[0]
  check('stakeout calculates the independent 100 metre east target', target?.horizontal_distance_m === 100 && target?.clockwise_turn_from_backsight_deg === 90 && stakeout.body.result.structuredContent.coordinate_reference_verified === false)
  const level = await call('compute_level_book', { opening_rl_m: 100, closing_rl_m: 101, distance_km: 0.2, method: 'rise_and_fall', rows: [{ station: 'BM-01', bs_m: 1.5 }, { station: 'BM-02', fs_m: 0.5 }] })
  check('level book returns the known closing level without an invented tolerance', level.body.result?.structuredContent?.checks?.computed_closing_rl_m === 101 && level.body.result.structuredContent.checks.closing_misclosure_m === 0 && level.body.result.structuredContent.checks.within_specified_allowable_misclosure === null)
  const observation = (station, backsight, foresight, left, right) => ({ station, backsight, foresight, horizontal_circle_left: { degrees: left, minutes: 0, seconds: 0 }, horizontal_circle_right: { degrees: right, minutes: 0, seconds: 0 }, slope_distance_m: 100, zenith_angle: { degrees: 90, minutes: 0, seconds: 0 }, instrument_height_m: 1.5, target_height_m: 1.5 })
  const traverse = await call('compute_closed_traverse', { coordinate_reference: 'Synthetic metre grid', opening_easting: 1000, opening_northing: 2000, opening_station: 'A', closing_easting: 1000, closing_northing: 2000, closing_station: 'A', backsight_bearing: { degrees: 0, minutes: 0, seconds: 0 }, observations: [observation('B', 'BS', 'C', 90, 270), observation('C', 'A', 'D', 270, 90), observation('D', 'B', 'A', 270, 90), observation('A', 'C', 'X', 270, 90)] })
  const traverseData = traverse.body.result?.structuredContent
  check('closed traverse returns the known square coordinates without asserting CRS verification', traverseData?.legs?.length === 4 && traverseData?.coordinates?.[1]?.easting === 1100 && traverseData.coordinates[1].northing === 2000 && traverseData.coordinate_reference_verified === false)
  const draft = await call('create_report_draft', { project_id: ids.project, title: 'Synthetic receiver review', content: 'SYNTHETIC ONLY. Height 100.0054. Unknown legacy reference. <script>synthetic</script>' })
  const reportId = draft.body.result?.structuredContent?.report_id
  const saved = reportId ? (await database.query('SELECT status,sections FROM survey_reports WHERE id=$1 AND user_id=$2', [reportId, ids.owner])).rows[0] : null
  check('requested report text is stored only as an escaped unreviewed draft', draft.body.result?.structuredContent?.status === 'draft' && saved?.status === 'draft' && JSON.stringify(saved.sections).includes('&lt;script&gt;') && !JSON.stringify(saved.sections).includes('<script>'))
  const forbiddenDraft = await call('create_report_draft', { project_id: ids.foreign, title: 'Synthetic denied draft', content: 'Synthetic text.' })
  check('report creation cannot write into another account project', forbiddenDraft.body.result?.isError === true && (await database.query('SELECT 1 FROM survey_reports WHERE project_id=$1', [ids.foreign])).rowCount === 0)
  const rotated = await token({ grant_type: 'refresh_token', client_id: clientId, resource: origin, refresh_token: refresh })
  check('refresh rotates the credential and retains exactly the grant scope', rotated.response.ok && rotated.body.refresh_token !== refresh && rotated.body.scope === linked.body.scope)
  const replay = await token({ grant_type: 'refresh_token', client_id: clientId, resource: origin, refresh_token: refresh })
  check('refresh replay is denied', replay.response.status === 400 && replay.body.error === 'invalid_grant')
  const revoked = await call('list_projects', {}, rotated.body.access_token)
  check('replay revocation immediately blocks the newer access token', revoked.body.result?.isError === true && revoked.body.result?._meta?.['mcp/www_authenticate']?.length > 0)
} finally {
  await database.query('ROLLBACK')
  if (verified && fixtures) await database.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])', [[ids.owner, ids.other]])
  if (verified && clientId) await database.query('UPDATE chatgpt_clients SET revoked_at=NOW() WHERE client_id_hash=$1', [hash(clientId)])
  await mkdir('test-results/chatgpt-source-http', { recursive: true })
  await writeFile('test-results/chatgpt-source-http/result.json', JSON.stringify({ checkedAt: new Date().toISOString(), synthetic: true, base, origin, database: rehearsal.database, passed: checks.length === 22 && checks.every(x => x.passed), authorizationCodeSource: 'seeded synthetic fixture; human consent not tested', customerMcpEnabled: false, productionMutated: false, externalOpenAiRequest: false, fixtureAccountsDisabled: verified && fixtures, checks }, null, 2) + '\n')
  await database.end()
}
