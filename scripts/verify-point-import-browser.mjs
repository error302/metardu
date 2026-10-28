const declaredFixtureCrs32737 = 'EPSG:32737'
// Verify and optionally remove only the exact retained synthetic browser fixture.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const fixture = JSON.parse(readFileSync('.cache/point-import/browser-fixture.json', 'utf8'))
assert.equal(fixture.synthetic, true)
assert.equal(fixture.base, 'http://127.0.0.1:3021')
for (const value of [fixture.project, fixture.owner, fixture.other]) assert.match(value || '', /^[a-f0-9-]{36}$/)
const config = rehearsalDatabaseConfig()
assert.equal(config.database, 'metardu_runtime_verify')
const client = new pg.Client({ connectionString: config.adminUrl, connectionTimeoutMillis: 5000 })
const report = { synthetic: true, productionChanged: false, checks: [], cleanup: false }
const check = (name, passed) => { assert.ok(passed, name); report.checks.push({ name, passed: true }) }
await client.connect()
try {
  assert.equal((await client.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker, 'METARDU synthetic beacon verification only 2026-10-08')
  const label = 'SYNTHETIC coordinate import acceptance'
  const job = (await client.query('SELECT user_id,name,boundary_data FROM projects WHERE id=$1', [fixture.project])).rows[0]
  assert.equal(job?.user_id, fixture.owner); assert.equal(job?.name, label)
  const users = (await client.query('SELECT id,email,full_name FROM users WHERE id=ANY($1::uuid[])', [[fixture.owner, fixture.other]])).rows
  assert.equal(users.length, 2)
  for (const user of users) { assert.equal(user.full_name, label); assert.equal(user.email, `point-import-${user.id}@example.invalid`) }
  const points = (await client.query('SELECT point_name,easting,northing,elevation FROM survey_points WHERE project_id=$1', [fixture.project])).rows
  check('browser import and fresh-request retry leave exactly 505 points', points.length === 505)
  const unknown = points.find(point => point.point_name === 'UI-UNKNOWN'), zero = points.find(point => point.point_name === 'UI-ZERO')
  check('browser capture retains NULL and zero height and excludes incomplete coordinates', unknown?.elevation === null && Number(zero?.elevation) === 0 && !points.some(point => point.point_name === 'UI-INCOMPLETE'))
  const batches = (await client.query("SELECT id,point_count FROM observation_batches WHERE project_id=$1 AND source_file_name='browser-points.csv'", [fixture.project])).rows
  check('repeated UI submission retains one original two-point capture', batches.length === 1 && batches[0].point_count === 2)
  const drawing = job.boundary_data?.cadDocument
  check('normal CAD save persists all 505 points in the declared CRS', drawing?.beacons.length === 505 && drawing.coordinateReferenceSystem === declaredFixtureCrs32737 && drawing.boundaries.length === 0)
  check('CAD save does not manufacture adjusted survey stations', !Object.hasOwn(job.boundary_data, 'adjustedStations'))
  const drawn = drawing.beacons.find(point => point.label === 'UI-UNKNOWN')
  check('CAD preserves imported grid coordinates without camera mutation', drawn?.easting === Number(unknown.easting) && drawn.northing === Number(unknown.northing))
  if (process.argv.includes('--cleanup')) {
    await client.query('BEGIN')
    assert.equal((await client.query('DELETE FROM projects WHERE id=$1 AND user_id=$2 AND name=$3 RETURNING id', [fixture.project, fixture.owner, label])).rowCount, 1)
    assert.equal((await client.query('DELETE FROM users WHERE id=ANY($1::uuid[]) AND full_name=$2 RETURNING id', [[fixture.owner, fixture.other], label])).rowCount, 2)
    const remaining = (await client.query(`SELECT
      (SELECT count(*)::int FROM projects WHERE id=$1) projects,
      (SELECT count(*)::int FROM survey_points WHERE project_id=$1) points,
      (SELECT count(*)::int FROM observation_batches WHERE project_id=$1) captures,
      (SELECT count(*)::int FROM import_sessions WHERE project_id=$1) sessions,
      (SELECT count(*)::int FROM users WHERE id=ANY($2::uuid[])) users`, [fixture.project, [fixture.owner, fixture.other]])).rows[0]
    assert.ok(Object.values(remaining).every(value => value === 0))
    await client.query('COMMIT')
    report.cleanup = true
    report.remaining = remaining
    // Retain fixture identity for the receipt while invalidating the QA password.
    delete fixture.password
    fixture.active = false
    writeFileSync('.cache/point-import/browser-fixture.json', JSON.stringify(fixture, null, 2) + '\n')
  }
  writeFileSync('.cache/point-import/browser-database.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally { await client.query('ROLLBACK').catch(() => {}); await client.end() }
