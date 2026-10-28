#!/usr/bin/env node
const declaredFixtureCrs21037 = 'EPSG:21037'
// Actual surface routes/handler/engines and restricted PostgreSQL; synthetic sessions only.
import assert from 'node:assert/strict'
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'

const rehearsal = rehearsalDatabaseConfig()
Object.assign(process.env, { DATABASE_URL: rehearsal.runtimeUrl, AUTH_SECRET: 'synthetic-surface-session-only-secret', NODE_ENV: 'test', DB_POOL_MAX: '2' })
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript')
const sessions = new AsyncLocalStorage(), originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request === 'next-auth') return { getServerSession: async () => sessions.getStore() ?? null }
  return originalLoad.call(this, request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request, parent, ...args)
}
Module._extensions['.ts'] = function (module, file) {
  module._compile(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file)
}
const { getPool } = require('../src/lib/db.ts')
const { POST, GET } = require('../src/app/api/project/[id]/surfaces/route.ts')
const { POST: contourPOST } = require('../src/app/api/topo/generate-contours/route.ts')
const { buildTopoEntities, entitiesToDxfString } = require('../src/lib/drawing/topoEntities.ts')
const { parseDxfGeometry } = require('../src/lib/importers/dxfGeometry.ts')
const { NextRequest } = require('next/server')
const { pointImportReferenceHash } = require('../src/lib/import/pointImportServer.ts')
const { surfaceReviewValue } = require('../src/lib/topo/surfaceRequest.ts')
const { hashSurfaceValue } = require('../src/lib/topo/surfaceRevision.ts')
const admin = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const ids = { owner: randomUUID(), other: randomUUID(), project: randomUUID(), second: randomUUID(), undeclared: randomUUID() }
const checks = []
const check = (name, passed) => { checks.push({ name, passed: Boolean(passed) }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); assert.ok(passed, name) }
let requestNumber = 0
const session = id => id ? { user: { id, email: `surface-${id}@example.invalid`, name: 'Synthetic surface operator', role: 'user' } } : null
async function invoke(userId, method, projectId, body, search = '') {
  const resource = new AsyncResource('METARDU_SYNTHETIC_SURFACE_REQUEST')
  try {
    return await resource.runInAsyncScope(() => sessions.run(session(userId), async () => {
      const request = new NextRequest(`http://localhost/api/project/${projectId}/surfaces${search}`, {
        method, headers: { 'Content-Type': 'application/json', 'x-real-ip': `192.0.2.${++requestNumber}` }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      })
      const response = await (method === 'POST' ? POST : GET)(request, { params: Promise.resolve({ id: projectId }) })
      return { response, value: await response.json() }
    }))
  } finally { resource.emitDestroy() }
}
const corners = [{ x: 500000, y: 9800000, z: 0 }, { x: 500010, y: 9800000, z: 0 }, { x: 500010, y: 9800010, z: 0 }, { x: 500000, y: 9800010, z: 0 }]
const ridge = { type: 'ridge', name: 'Synthetic measured ridge', points: [{ x: 500005, y: 9800000, z: 2 }, { x: 500005, y: 9800010, z: 2 }] }
async function reviewedBody(projectId, extra = {}) {
  const reference = (await admin.query('SELECT * FROM public.project_reference_systems WHERE project_id=$1', [projectId])).rows[0]
  const referenceHash = reference ? pointImportReferenceHash(reference) : '0'.repeat(64)
  const points = (await admin.query(`SELECT id, point_name AS "pointName", easting::double precision AS x,
    northing::double precision AS y, elevation::double precision AS z, code,
    horizontal_crs AS "horizontalCrs", vertical_datum AS "verticalDatum"
    FROM public.survey_points WHERE project_id=$1 AND deleted_at IS NULL ORDER BY id`, [projectId])).rows
  return { requestId: randomUUID(), expectedUserId: ids.owner, pointIds: points.map(point => point.id),
    expectedReferenceHash: referenceHash, expectedSourceHash: hashSurfaceValue(surfaceReviewValue(referenceHash, points)),
    breaklineReference: { horizontalCrs: 'EPSG:21037', verticalDatum: 'Synthetic BM only', units: 'metres' },
    useStoredBreaklines: false, breaklines: [ridge], interval: 1, resolution: 3, ...extra }
}
let fixturesVerified = false
await admin.connect()
try {
  check('surface engine is tested under a non-owner, non-superuser database login', runtimeDatabaseRoleFailure((await getPool().query(RUNTIME_ROLE_QUERY)).rows[0]) === null)
  await admin.query(`INSERT INTO public.users(id,email,password_hash,full_name) VALUES ($1,$2,'synthetic-no-login','Synthetic surface owner'),($3,$4,'synthetic-no-login','Synthetic surface other')`, [ids.owner, session(ids.owner).user.email, ids.other, session(ids.other).user.email])
  await admin.query("INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false),($2,'surveyor',false)", [ids.owner, ids.other])
  fixturesVerified = true
  for (const projectId of [ids.project, ids.second, ids.undeclared]) {
    await admin.query("INSERT INTO public.projects(id,user_id,name,datum,utm_zone,hemisphere) VALUES($1,$2,'SYNTHETIC surface verification only','ARC1960',37,'S')", [projectId, ids.owner])
    for (let i = 0; i < corners.length; i++) await admin.query(`INSERT INTO public.survey_points(project_id,point_name,easting,northing,elevation,horizontal_crs,vertical_datum)
      VALUES($1,$2,$3,$4,$5,'EPSG:21037','Synthetic BM only')`, [projectId, `SYN-${i}`, corners[i].x, corners[i].y, corners[i].z])
    if (projectId !== ids.undeclared) await admin.query(`INSERT INTO public.project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by)
      VALUES($1,'EPSG:21037','Arc 1960 / UTM zone 37S','ARC1960','metres',37,'S','Synthetic BM only','local','grid',3,$2)`, [projectId, ids.owner])
  }
  const noSession = await invoke(null, 'POST', ids.project, {})
  check('saved surfaces require an authenticated session', noSession.response.status === 401)
  const unreviewed = await invoke(ids.owner, 'POST', ids.project, {})
  check('a request without explicit reviewed source evidence cannot create a surface', unreviewed.response.status === 400
    && (await admin.query('SELECT count(*)::int AS n FROM public.surfaces WHERE project_id=$1', [ids.project])).rows[0].n === 0)
  const undeclared = await invoke(ids.owner, 'POST', ids.undeclared, await reviewedBody(ids.undeclared))
  check('legacy defaults cannot replace an explicit project reference', undeclared.response.status === 400 && undeclared.value.code === 'CRS_UNDECLARED')
  const firstRequest = await reviewedBody(ids.project)
  const saved = await invoke(ids.owner, 'POST', ids.project, firstRequest)
  if (saved.response.status !== 201) console.log(JSON.stringify(saved.value))
  check('actual consumed JSON reaches the saved-surface route and returns the declared EPSG', saved.response.status === 201 && saved.value.data.crs === declaredFixtureCrs21037 && saved.value.data.revision === 1)
  const data = saved.value.data
  const replay = await invoke(ids.owner, 'POST', ids.project, firstRequest)
  check('retrying the same reviewed request returns its original committed revision', replay.response.status === 200
    && replay.value.data.replayed === true && replay.value.data.revisionId === data.revisionId
    && (await admin.query('SELECT count(*)::int AS n FROM public.surface_revisions WHERE surface_id=$1', [data.surfaceId])).rows[0].n === 1)
  const one = data.contours.find(c => c.elevation === 1)
  check('saved contour geometry includes both sides of the measured ridge', one.coordinates.length === 2 && one.coordinates.flat().some(([x]) => x === 500002.5) && one.coordinates.flat().some(([x]) => x === 500007.5))
  const stored = (await admin.query('SELECT result,input_hash FROM public.surface_revisions WHERE id=$1', [data.revisionId])).rows[0]
  check('immutable revision preserves full observation, breakline, reference and mesh evidence', stored.result.snapshot.observations.length === 4 && stored.result.snapshot.breaklines[0].points[0].z === 2 && stored.result.snapshot.reference.horizontal_crs === declaredFixtureCrs21037 && stored.result.mesh.points.length === 6 && stored.input_hash.length === 64)
  const reload = await invoke(ids.owner, 'GET', ids.project, undefined, `?contourRevision=${data.revisionId}`)
  check('reload returns the original privately cached contour revision', reload.response.status === 200 && reload.response.headers.get('cache-control') === 'private, no-store' && isDeepStrictEqual(reload.value.data.contours, data.contours))
  const wrongProject = await invoke(ids.owner, 'GET', ids.second, undefined, `?contourRevision=${data.revisionId}`)
  check('revision retrieval is bound to its project even for the same owner', wrongProject.response.status === 404)
  const other = await invoke(ids.other, 'POST', ids.project, await reviewedBody(ids.project))
  check('another surveyor cannot recompute the project surface', [403, 404].includes(other.response.status))
  const before = (await admin.query('SELECT count(*)::int AS n FROM public.surface_revisions WHERE surface_id=$1', [data.surfaceId])).rows[0].n
  const changedReference = await invoke(ids.owner, 'POST', ids.project, await reviewedBody(ids.project, { surfaceId: data.surfaceId, expectedReferenceHash: '0'.repeat(64) }))
  check('a stale reviewed reference cannot add a revision', changedReference.response.status === 409 && changedReference.value.code === 'SURFACE_REFERENCE_CHANGED'
    && (await admin.query('SELECT count(*)::int AS n FROM public.surface_revisions WHERE surface_id=$1', [data.surfaceId])).rows[0].n === before)
  const invalid = await invoke(ids.owner, 'POST', ids.project, await reviewedBody(ids.project, { breaklines: [{ ...ridge, points: ridge.points.map(({ z: _z, ...xy }) => xy) }] }))
  check('missing breakline height is rejected without adding a revision', invalid.response.status === 400 && (await admin.query('SELECT count(*)::int AS n FROM public.surface_revisions WHERE surface_id=$1', [data.surfaceId])).rows[0].n === before)
  const staleSourceRequest = await reviewedBody(ids.project, { surfaceId: data.surfaceId })
  await admin.query('UPDATE public.survey_points SET elevation=0.125 WHERE project_id=$1 AND point_name=$2', [ids.project, 'SYN-0'])
  const changedSource = await invoke(ids.owner, 'POST', ids.project, staleSourceRequest)
  check('changed measurements reject a previously reviewed source without adding a revision', changedSource.response.status === 409 && changedSource.value.code === 'SURFACE_SOURCE_CHANGED'
    && (await admin.query('SELECT count(*)::int AS n FROM public.surface_revisions WHERE surface_id=$1', [data.surfaceId])).rows[0].n === before)
  const regenerated = await invoke(ids.owner, 'POST', ids.project, await reviewedBody(ids.project, { surfaceId: data.surfaceId }))
  check('equal observation counts with changed measured height produce a new input hash and revision', regenerated.response.status === 201 && regenerated.value.data.revision === 2 && regenerated.value.data.inputHash !== data.inputHash)
  const concurrent = await Promise.all([0, 1].map(async () => invoke(ids.owner, 'POST', ids.project, await reviewedBody(ids.project, { surfaceId: data.surfaceId }))))
  check('concurrent recomputes serialize into distinct successive immutable revisions', concurrent.every(item => item.response.status === 201) && concurrent.map(item => item.value.data.revision).sort().join(',') === '3,4')
  const tooDense = await invoke(ids.owner, 'POST', ids.project, await reviewedBody(ids.project, { surfaceId: data.surfaceId, resolution: 1e-10 }))
  check('excessive contour density fails without persisting partial geometry', tooDense.response.status === 400 && tooDense.value.code === 'SURFACE_INPUT_INVALID' && (await admin.query('SELECT count(*)::int AS n FROM public.surface_revisions WHERE surface_id=$1', [data.surfaceId])).rows[0].n === 4)
  const stillOriginal = (await admin.query('SELECT result FROM public.surface_revisions WHERE id=$1', [data.revisionId])).rows[0].result
  check('regeneration leaves the original observation and mesh snapshot unchanged', JSON.stringify(stillOriginal) === JSON.stringify(stored.result))
  const publicContour = await sessions.run(session(ids.owner), () => contourPOST(new NextRequest('http://localhost/api/topo/generate-contours', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': '192.0.2.250' }, body: JSON.stringify({ points: corners, breaklines: [ridge], interval: 1, gridResolution: 3 }) })))
  const contourValue = await publicContour.json()
  const adhocRidge = contourValue.data?.contours?.find(c => c.elevation === 1)
  // Point order can change the mesh diagonal and intermediate collinear
  // vertices. Compare the physical isolines, not an incidental path ordering.
  check('ad-hoc contour route also honors the same breakline surface', publicContour.status === 200 && contourValue.data.algorithm === 'constrained-tin-isolines'
    && adhocRidge?.coordinates.length === 2 && adhocRidge.coordinates.every(line => {
      const x = line[0][0]
      return [500002.5, 500007.5].includes(x) && line.every(p => Math.abs(p[0] - x) < 1e-8)
        && Math.min(...line.map(p => p[1])) === 9800000 && Math.max(...line.map(p => p[1])) === 9800010
    }) && new Set(adhocRidge.coordinates.map(line => line[0][0])).size === 2)
  const drawing = buildTopoEntities(corners.map((p, i) => ({ easting: p.x, northing: p.y, elevation: p.z, code: 'SH', pointNumber: `SYN-${i}` })), {
    scale: 500, includeSpotHeights: true, includeTitleBlock: true, gridTickInterval: 10, includeLabels: true, includeLegend: true,
  }, { projectName: 'SYNTHETIC TERRAIN VERIFICATION - NOT FIELD EVIDENCE', contours: data.contours })
  const dxf = entitiesToDxfString(drawing.entities, drawing.layers), parsedDxf = parseDxfGeometry(dxf)
  const expectedPolylines = data.contours.flatMap(contour => contour.coordinates.map(line => JSON.stringify([
    contour.isIndex ? 'CONTOUR_I' : 'CONTOURS', line.length > 2 && isDeepStrictEqual(line[0], line[line.length - 1]),
    line.map(([x, y]) => [x, y, contour.elevation]),
  ]))).sort()
  const importedPolylines = parsedDxf.entities.filter(entity => entity.kind === 'polyline' && ['CONTOURS', 'CONTOUR_I'].includes(entity.layer))
    .map(entity => JSON.stringify([entity.layer, entity.closed, entity.coordinates])).sort()
  check('saved terrain contours survive actual drawing DXF export and re-import with exact XY, RL, layers and closure', parsedDxf.units.metresPerUnit === 1 && isDeepStrictEqual(importedPolylines, expectedPolylines))
  await mkdir('test-results/terrain-source', { recursive: true })
  await writeFile('test-results/terrain-source/synthetic-contours.dxf', dxf)
} finally {
  await mkdir('test-results/runtime-database', { recursive: true })
  await writeFile('test-results/runtime-database/surface-runtime.json', JSON.stringify({ synthetic: true, providerSessionMocked: true, database: rehearsal.database, runtimeRole: rehearsal.runtimeRole, passed: checks.length === 20 && checks.every(item => item.passed), checks }, null, 2) + '\n')
  await getPool().end()
  // Immutable synthetic history remains visible as evidence; suspend only our new accounts.
  if (fixturesVerified) await admin.query('UPDATE public.surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])', [[ids.owner, ids.other]])
  await admin.end()
}
