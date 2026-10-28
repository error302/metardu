const declaredFixtureCrs32636 = 'EPSG:32636'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const rehearsal = rehearsalDatabaseConfig(), base = 'http://localhost:3011'
assert.equal(rehearsal.database, 'metardu_runtime_verify')
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript'), originalLoad = Module._load
Module._load = function(request, parent, ...args) { return originalLoad.call(this, request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request, parent, ...args) }
Module._extensions['.ts'] = function(module, file) { module._compile(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file) }
const { loadProjectMapData } = require('../src/lib/workspaces/projectMapData.ts')
const ownerId = randomUUID(), otherId = randomUUID(), password = `synthetic-${randomUUID()}`
const email = id => `project-map-http-${id}@example.invalid`
const admin = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const checks = [], projects = {}, keep = process.argv.includes('--keep-browser-fixture')
const check = (name, value) => { checks.push({ name, passed: Boolean(value) }); console.log(`${value ? 'PASS' : 'FAIL'} ${name}`); assert.ok(value, name) }
function client() {
  const cookies = new Map()
  return async (url, options = {}) => {
    const response = await fetch(url.startsWith('/') ? base + url : url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { ...options.headers, ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } : {}) } })
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';', 1)[0], split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1)) }
    return response
  }
}
async function login(id) {
  const request = client(), csrf = await (await request('/api/auth/csrf')).json()
  await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: email(id), password, callbackUrl: base + '/dashboard', json: 'true' }) })
  assert.equal((await (await request('/api/auth/session')).json()).user?.id, id)
  return request
}
async function project(kind, boundary, declared = true) {
  const id = randomUUID()
  await admin.query("INSERT INTO projects(id,user_id,name,survey_type,boundary_data) VALUES($1,$2,$3,'engineering',$4)", [id, ownerId, `SYNTHETIC project map ${kind}`, JSON.stringify({ synthetic: true, certified: false, ...(boundary ? { adjustedStations: boundary } : {}) })])
  if (declared) await admin.query("INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by) VALUES($1,'EPSG:32636','Synthetic WGS84 UTM 36N','WGS84','metres',36,'N','Synthetic BM','local','grid',3,$2)", [id, ownerId])
  projects[kind] = id
  return id
}
let seeded = false, passed = false
await admin.connect()
try {
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0]?.marker, 'METARDU synthetic beacon verification only 2026-10-08')
  for (const id of [ownerId, otherId]) {
    await admin.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,$3,'Synthetic project map HTTP verification')", [id, email(id), await bcrypt.hash(password, 10)])
    await admin.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)", [id])
  }
  seeded = true
  const owner = await login(ownerId), other = await login(otherId)
  check('real owner and unrelated password sessions authenticate', true)
  const stations = [[500000,0],[500050,0],[500050,50],[500000,50]].map(([e,n],i) => ({ pointName: `SYN-MAP-${i+1}`, originalEasting: e, originalNorthing: n, adjustedEasting: e, adjustedNorthing: n }))
  await project('boundary', stations)
  await project('points')
  await project('unknownGrid')
  await project('invalidBoundary', [{ ...stations[0], adjustedNorthing: null }, ...stations.slice(1)])
  await project('missingReference', stations, false)
  const boundary = await loadProjectMapData(projects.boundary, undefined, owner)
  check('dedicated APIs load the declared grid and exact saved boundary with zero northing', boundary.epsg === declaredFixtureCrs32636 && boundary.geometryKind === 'ordered_boundary' && boundary.stations[0].adjustedNorthing === 0 && boundary.stations.length === 4)
  for (const suffix of ['', '/reference-system', '/points']) {
    const response = await owner(`/api/project/${projects.boundary}${suffix}`)
    check(`private map response ${suffix || '/project'} cannot enter shared cache`, response.status === 200 && response.headers.get('cache-control') === 'private, no-store')
    check(`another user's project map response ${suffix || '/project'} is denied`, [403,404].includes((await other(`/api/project/${projects.boundary}${suffix}`)).status))
  }
  const pointBody = { pointName: 'SYN-SINGLE-ZERO', easting: 500000, northing: 0, elevation: null }
  const created = await owner(`/api/project/${projects.points}/points`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pointBody) })
  const point = (await created.json()).data
  check('real point registration saves its declared grid and zero coordinate', created.status === 201 && point.horizontal_crs === declaredFixtureCrs32636 && point.northing === 0)
  const points = await loadProjectMapData(projects.points, undefined, owner)
  check('a single raw point is displayable without a fake parcel or invented originals', points.geometryKind === 'points' && points.stations.length === 1 && points.stations[0].pointName === 'SYN-SINGLE-ZERO' && !('originalEasting' in points.stations[0]))
  // Only synthetic IDs created above are changed. Preserve the tombstone for proof.
  const deleted = await admin.query("INSERT INTO survey_points(project_id,point_name,easting,northing,horizontal_crs,source,deleted_at,deleted_by) VALUES($1,'SYN-DELETED',500001,1,'EPSG:32636','manual',now(),$2) RETURNING id", [projects.points,ownerId])
  check('soft-deleted synthetic points are excluded from the real reader', !(await (await owner(`/api/project/${projects.points}/points`)).json()).data.some(row => row.id === deleted.rows[0].id))
  await admin.query("INSERT INTO survey_points(project_id,point_name,easting,northing,source) VALUES($1,'SYN-UNDECLARED-GRID',500000,0,'manual')", [projects.unknownGrid])
  for (const [kind,pattern] of [['unknownGrid',/source grid/i],['invalidBoundary',/coordinate/i],['missingReference',/Declare/i]]) {
    await assert.rejects(loadProjectMapData(projects[kind], undefined, owner), pattern)
    check(`real data loader rejects ${kind} instead of substituting survey truth`, true)
  }
  passed = true
  if (keep) {
    await mkdir('.cache/release-verify', { recursive: true })
    await writeFile('.cache/release-verify/project-map-browser-fixture.json', JSON.stringify({ synthetic: true, database: rehearsal.database, base, ownerId, ownerEmail: email(ownerId), password, projects, browserFixtureActive: true }, null, 2) + '\n')
  }
} finally {
  await mkdir('test-results/project-map-http', { recursive: true })
  await writeFile('test-results/project-map-http/result.json', JSON.stringify({ synthetic: true, base, database: rehearsal.database, passed, providerOAuthVerified: false, projects, checks }, null, 2) + '\n')
  if (seeded) await admin.query('UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])', [passed && keep ? [otherId] : [ownerId,otherId]])
  await admin.end()
}
