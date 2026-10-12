#!/usr/bin/env node
// Packaged HTTP surface workflow on the allowlisted synthetic rehearsal database.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const rehearsal = rehearsalDatabaseConfig()
assert.equal(rehearsal.database, 'metardu_release_rehearsal', 'Use only the local synthetic release rehearsal database.')
const base = 'http://127.0.0.1:3004', admin = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const ownerId = randomUUID(), otherId = randomUUID(), password = `synthetic-${randomUUID()}`
const ownerEmail = `surface-http-${ownerId}@example.invalid`, otherEmail = `surface-http-${otherId}@example.invalid`
const checks = []
const check = (name, passed) => { checks.push({ name, passed: Boolean(passed) }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); assert.ok(passed, name) }
function sessionClient() {
  const cookies = new Map()
  return async (pathname, options = {}) => {
    const response = await fetch(base + pathname, { ...options, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { ...options.headers, ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } : {}) } })
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';', 1)[0], split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1)) }
    return response
  }
}
async function login(email, id) {
  const request = sessionClient(), csrf = await (await request('/api/auth/csrf')).json()
  await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: `${base}/dashboard`, json: 'true' }) })
  assert.equal((await (await request('/api/auth/session')).json()).user?.id, id)
  return request
}
async function json(request, pathname, body, method = 'POST') {
  const response = await request(pathname, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const value = await response.json()
  if (!response.ok) console.log(JSON.stringify({ syntheticRequest: pathname, status: response.status, code: value.code, error: value.error }))
  return { response, value }
}
let projectId, surfaceId, fixturesVerified = false
await admin.connect()
try {
  const hash = await bcrypt.hash(password, 10)
  await admin.query(`INSERT INTO public.users(id,email,password_hash,full_name,role,email_verified) VALUES($1,$2,$3,'Synthetic HTTP surface owner','user',true),($4,$5,$3,'Synthetic HTTP surface other','user',true)`, [ownerId, ownerEmail, hash, otherId, otherEmail])
  await admin.query("INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false),($2,'surveyor',false)", [ownerId, otherId])
  fixturesVerified = true
  const owner = await login(ownerEmail, ownerId), other = await login(otherEmail, otherId)
  check('synthetic surveyors sign in through real packaged password sessions', true)
  const fonts = JSON.parse(await readFile('public/fonts/manifest.json', 'utf8'))
  const fetchedFonts = await Promise.all(fonts.map(async font => {
    const response = await fetch(`${base}/fonts/${font.filename}`, { signal: AbortSignal.timeout(15000) })
    return response.ok && response.headers.get('cache-control') === 'public, max-age=31536000, immutable'
      && createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex') === font.sha256
  }))
  check('all 18 local brand fonts are served unchanged with immutable public caching', fetchedFonts.length === 18 && fetchedFonts.every(Boolean))
  const landing = await fetch(base, { signal: AbortSignal.timeout(30000) }), landingHtml = await landing.text()
  check('packaged landing page has a local body-font preload and no Google Fonts dependency', landing.ok && landingHtml.includes('/fonts/19f9c92546aa300c.woff2') && !/fonts\.(googleapis|gstatic)\.com/.test(landingHtml))
  const created = await json(owner, '/api/projects', { name: 'SYNTHETIC terrain HTTP verification — not field evidence', survey_type: 'engineering', location: 'Synthetic exercise', datum: '', utm_zone: 37, hemisphere: 'S' })
  projectId = created.value.data?.id ?? created.value.project?.id
  check('project creation works through packaged HTTP', created.response.ok && typeof projectId === 'string')
  const endpoint = `/api/project/${projectId}/surfaces`
  const undeclared = await json(owner, endpoint, {})
  check('an undeclared reference blocks surface computation', undeclared.response.status === 400 && undeclared.value.code === 'CRS_UNDECLARED')
  const declared = await json(owner, `/api/project/${projectId}/reference-system`, { datum: 'ARC1960', utmZone: 37, hemisphere: 'S', distanceMode: 'grid', coordinatePrecision: 3, verticalDatum: 'Synthetic BM only', verticalReference: 'local', benchmarkBasis: 'Synthetic benchmark — not field control', notes: 'SYNTHETIC TERRAIN HTTP VERIFICATION' }, 'PUT')
  check('the reference system is explicitly saved through HTTP', declared.response.ok)
  const corners = [[500000, 9800000], [500010, 9800000], [500010, 9800010], [500000, 9800010]]
  const imported = []
  for (let i = 0; i < corners.length; i++) imported.push(await json(owner, `/api/project/${projectId}/points`, { pointName: `SYN-${i}`, easting: corners[i][0], northing: corners[i][1], elevation: 0, code: 'GROUND', description: 'SYNTHETIC TERRAIN HTTP VERIFICATION' }))
  check('four complete ground observations are saved through the project API', imported.every(item => item.response.status === 201))
  const ridge = { type: 'ridge', name: 'Synthetic ridge', points: [{ x: 500005, y: 9800000, z: 2 }, { x: 500005, y: 9800010, z: 2 }] }
  const saved = await json(owner, endpoint, { interval: 1, resolution: 3, breaklines: [ridge] })
  surfaceId = saved.value.data?.surfaceId
  check('packaged computation creates revision 1 in the actual declared CRS', saved.response.status === 201 && saved.value.data.crs === 'EPSG:21037' && saved.value.data.revision === 1)
  const one = saved.value.data.contours.find(c => c.elevation === 1)
  check('actual contours follow both sides of the ridge', one?.coordinates.length === 2 && one.coordinates.flat().every(p => p[0] === 500002.5 || p[0] === 500007.5))
  const stored = (await admin.query('SELECT result FROM public.surface_revisions WHERE id=$1', [saved.value.data.revisionId])).rows[0].result
  check('packaged revision records complete measured inputs and constrained mesh', stored.snapshot.observations.length === 4 && stored.snapshot.breaklines[0].points[0].z === 2 && stored.mesh.points.length === 6 && stored.mesh.constraintEdges.length > 0)
  const reloadResponse = await owner(`${endpoint}?contourRevision=${saved.value.data.revisionId}`), reload = await reloadResponse.json()
  check('reload returns the same contour geometry with private no-store caching', reloadResponse.status === 200 && reloadResponse.headers.get('cache-control') === 'private, no-store' && isDeepStrictEqual(reload.data.contours, saved.value.data.contours))
  const unauthorized = await json(other, endpoint, {})
  check('another real session cannot recompute the surface', [403, 404].includes(unauthorized.response.status))
  const invalid = await json(owner, endpoint, { breaklines: [{ type: 'hard', points: [{ x: 500005, y: 9800000 }, { x: 500005, y: 9800010 }] }] })
  check('missing height is rejected through actual HTTP without a partial revision', invalid.response.status === 400 && (await admin.query('SELECT count(*)::int AS n FROM public.surface_revisions WHERE surface_id=$1', [surfaceId])).rows[0].n === 1)
  const revisionTwo = await json(owner, endpoint, { surfaceId, resolution: 3 })
  check('recomputation reuses stored breaklines and appends revision 2', revisionTwo.response.status === 201 && revisionTwo.value.data.revision === 2 && isDeepStrictEqual(revisionTwo.value.data.contours, saved.value.data.contours))
  const page = await owner(`/project/${projectId}/topo`), html = await page.text()
  check('authenticated topo page is available and labels the new spacing control', page.status === 200 && html.includes('Maximum contour vertex spacing'))
} finally {
  await mkdir('test-results/terrain-http', { recursive: true })
  await writeFile('test-results/terrain-http/result.json', JSON.stringify({ synthetic: true, base, database: rehearsal.database, passwordSessionsVerified: checks[0]?.passed === true, oauthVerified: false, projectId, surfaceId, passed: checks.length === 15 && checks.every(item => item.passed), checks }, null, 2) + '\n')
  if (fixturesVerified) await admin.query('UPDATE public.surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])', [[ownerId, otherId]])
  await admin.end()
}
