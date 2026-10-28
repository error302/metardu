#!/usr/bin/env node
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
const rehearsal = rehearsalDatabaseConfig()
assert.equal(rehearsal.database, 'metardu_runtime_verify', 'Packaged control tests require the marked synthetic database.')
const flags = process.argv.slice(2)
assert.ok(flags.every(flag => ['--keep-browser-fixture', '--points'].includes(flag)))
const keepBrowser = flags.includes('--keep-browser-fixture'), pointsMode = flags.includes('--points')
const base = pointsMode ? 'http://localhost:3008' : 'http://127.0.0.1:3007'
const admin = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const ownerId = randomUUID(), reviewerId = randomUUID(), otherId = randomUUID(), password = `synthetic-${randomUUID()}`
const email = id => `control-http-${id}@example.invalid`
const checks = [], check = (name, passed) => { checks.push({ name, passed: Boolean(passed) }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); assert.ok(passed, name) }
function sessionClient() {
  const cookies = new Map()
  return async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { ...options.headers, ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } : {}) } })
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';', 1)[0], split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1)) }
    return response
  }
}
async function login(id) {
  const request = sessionClient(), csrf = await (await request('/api/auth/csrf')).json()
  await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: email(id), password, callbackUrl: `${base}/beacons`, json: 'true' }) })
  assert.equal((await (await request('/api/auth/session')).json()).user?.id, id)
  return request
}
async function json(request, path, body, method = 'POST') {
  const response = await request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { response, value: await response.json() }
}
let _seeded = false, markerVerified = false, passwordSessionsVerified = false, projectId, browserSourceId, passed = false
const source = { name: `SYN-HTTP-CATALOG-${ownerId}`, beaconType: 'gnss', easting: 500000.01234, northing: 9800000.05678, elevation: 0, horizontalCrs: 'EPSG:21037', verticalDatum: 'Synthetic BM', sourceReference: 'Synthetic source document HTTP-ONLY; not official survey evidence', authority: 'Synthetic publisher', country: 'Kenya' }
await admin.connect()
try {
  const marker = (await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()" )).rows[0]?.marker
  assert.equal(marker, 'METARDU synthetic beacon verification only 2026-10-08')
  markerVerified = true
  for (const id of [ownerId, reviewerId, otherId]) {
    await admin.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,$3,'Synthetic control HTTP verification')", [id, email(id), await bcrypt.hash(password, 10)])
    await admin.query('INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,$2,false)', [id, id === reviewerId ? 'admin' : 'surveyor'])
  }
  _seeded = true
  const owner = await login(ownerId), reviewer = await login(reviewerId), other = await login(otherId)
  passwordSessionsVerified = true
  check('owner, independent reviewer and other real password sessions work', true)
  const project = await json(owner, '/api/projects', { name: 'SYNTHETIC control HTTP project', survey_type: 'engineering' })
  projectId = project.value.data?.id
  check('real project creation succeeds', project.response.status === 201 && typeof projectId === 'string')
  const reference = await json(owner, `/api/project/${projectId}/reference-system`, { horizontalCrs: source.horizontalCrs, datum: 'ARC1960', units: 'metres', utmZone: 37, hemisphere: 'S', verticalDatum: source.verticalDatum, verticalReference: 'local', distanceMode: 'grid', coordinatePrecision: 3 }, 'PUT')
  check('real project reference declaration persists', reference.response.status === 200)
  const pending = await json(owner, '/api/public-beacons', source), sourceId = pending.value.data?.beacon.id
  check('packaged source submission stores pending explicit reference and zero', pending.response.status === 201 && pending.value.data.beacon.status === 'pending' && pending.value.data.beacon.elevation === 0)
  check('pending source is absent from reviewed results', (await (await owner(`/api/public-beacons?q=${source.name}`)).json()).data.beacons.length === 0)
  check('an ordinary session cannot approve its own source', (await json(owner, `/api/public-beacons/${sourceId}/review`, { decision: 'verified', reason: 'Synthetic review only' })).response.status === 403)
  const queue = await reviewer('/api/public-beacons/review-queue'), queuePayload = await queue.json()
  check('real reviewer sees the pending source queue', queue.status === 200 && queuePayload.data.beacons.some(row => row.id === sourceId))
  const reviewed = await json(reviewer, `/api/public-beacons/${sourceId}/review`, { decision: 'verified', reason: 'Synthetic independent source checks; not on-site verification' })
  check('real independent review commits without field verification claims', reviewed.response.status === 201 && reviewed.value.data.fieldVerified === false)
  const near = await owner(`/api/public-beacons?q=${source.name}&easting=${source.easting - 1}&northing=${source.northing}&crs=EPSG:21037&radius=2&limit=1`), nearby = await near.json()
  check('packaged nearby source has real one-metre distance and east bearing', near.status === 200 && nearby.data.beacons.length === 1 && nearby.data.beacons[0].distance_m === 1 && nearby.data.beacons[0].bearing_deg === 90 && near.headers.get('cache-control') === 'private, no-store')
  const body = { projectId, requestId: randomUUID(), pointName: `SYN-HTTP-CTRL-${ownerId}` }
  check('another real account cannot import into the owned project', (await json(other, `/api/public-beacons/${sourceId}/import`, body)).response.status === 403)
  const imported = await json(owner, `/api/public-beacons/${sourceId}/import`, body), captureId = imported.value.data?.captureId
  check('packaged import creates a retained source control coordinate', imported.response.status === 201 && typeof captureId === 'string' && imported.value.data.fieldVerified === false)
  const point = (await admin.query('SELECT easting,northing,elevation,horizontal_crs FROM survey_points WHERE id=$1', [imported.value.data.pointId])).rows[0]
  check('actual database retains five-decimal XY and zero height', Number(point.easting) === source.easting && Number(point.northing) === source.northing && Number(point.elevation) === 0 && point.horizontal_crs === source.horizontalCrs)
  const pointResponse = await owner(`/api/project/${projectId}/points`), pointsPayload = await pointResponse.json()
  const displayedPoint = pointsPayload.data?.find(row => row.id === imported.value.data.pointId)
  check('packaged point reader sends numeric coordinates and height to the control panel', pointResponse.status === 200 && pointResponse.headers.get('cache-control') === 'private, no-store' && typeof displayedPoint?.easting === 'number' && displayedPoint.easting === source.easting && displayedPoint.elevation === 0)
  const manualBody = { pointName: `SYN-MANUAL-HTTP-${ownerId}`, easting: 500002.01234, northing: 9800002.05678, elevation: 0, isControl: true }
  const manual = await json(owner, `/api/project/${projectId}/points`, manualBody)
  check('packaged manual registration records numeric coordinates, zero and declared grid', manual.response.status === 201 && manual.value.data.elevation === 0 && manual.value.data.easting === manualBody.easting && manual.value.data.horizontal_crs === source.horizontalCrs && manual.value.fieldVerified === false)
  check('packaged manual registration rejects duplicate current point names', (await json(owner, `/api/project/${projectId}/points`, manualBody)).response.status === 409)
  check('packaged manual registration rejects malformed coordinate strings', (await json(owner, `/api/project/${projectId}/points`, { ...manualBody, easting: '500000garbage' })).response.status === 400)
  const replay = await json(owner, `/api/public-beacons/${sourceId}/import`, body)
  check('identical packaged retry returns the same import capture', replay.response.status === 200 && replay.value.data.replayed && replay.value.data.captureId === captureId)
  check('changed packaged retry conflicts', (await json(owner, `/api/public-beacons/${sourceId}/import`, { ...body, pointName: 'Changed synthetic name' })).response.status === 409)
  const history = await owner(`/api/project/${projectId}/control-imports`), historical = await history.json()
  check('real owner reloads full private reference evidence', history.status === 200 && history.headers.get('cache-control') === 'private, no-store' && historical.data.captures[0].source_snapshot.elevation === 0)
  check('another session cannot read import captures', (await other(`/api/project/${projectId}/control-imports`)).status === 404)
  check('packaged catalogue page renders the new workflow', (await (await owner('/beacons')).text()).includes('Reference control catalogue'))
  const browserSource = await json(owner, '/api/public-beacons', { ...source, name: `SYN-BROWSER-CATALOG-${ownerId}`, beaconType: 'control', easting: 500000.03456, northing: 9800000.07891 })
  browserSourceId = browserSource.value.data?.beacon.id
  check('separate synthetic pending source is ready for the browser workflow', browserSource.response.status === 201 && typeof browserSourceId === 'string')
  passed = checks.length === 22 && checks.every(item => item.passed)
} finally {
  const output = pointsMode ? 'test-results/public-control-points-http' : 'test-results/public-control-http'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/result.json`, JSON.stringify({ synthetic: true, base, database: rehearsal.database, passed, passwordSessionsVerified, oauthVerified: false, projectId, checks }, null, 2) + '\n')
  if (keepBrowser && passed) await writeFile(pointsMode ? '.cache/release-verify/public-control-points-browser-fixture.json' : '.cache/release-verify/public-control-browser-fixture.json', JSON.stringify({ synthetic: true, base, database: rehearsal.database, ownerId, reviewerId, ownerEmail: email(ownerId), reviewerEmail: email(reviewerId), password, projectId, sourceId: browserSourceId, sourceName: `SYN-BROWSER-CATALOG-${ownerId}` }, null, 2) + '\n')
  if (markerVerified) await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])', [keepBrowser && passed ? [otherId] : [ownerId, reviewerId, otherId]])
  await admin.end()
}
