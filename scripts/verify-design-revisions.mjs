import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import pg from 'pg'

// Fixed, disposable verification database. Never read production credentials.
const schema = `revision_verify_${Date.now()}`
const pool = new pg.Pool({
  host: '127.0.0.1', port: 55432, database: 'metardu_revision_verify',
  user: 'revision_verify', password: 'local_revision_verify_only',
  connectionTimeoutMillis: 5000, statement_timeout: 15000,
  options: `-c search_path=${schema},public`,
})
const evidence = []
const database = {
  query: (sql, args) => pool.query(sql, args),
  getPool: () => pool,
  transaction: async (work) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  },
}
const require = createRequire(import.meta.url)
const Module = require('node:module')
const ts = require('typescript')
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request === '@/lib/db') return { db: database }
  if (request === '@/lib/observations/observationBatches') {
    return { recordEvidenceEvent: async (event) => { evidence.push(event) } }
  }
  const resolved = request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request
  return originalLoad.call(this, resolved, parent, ...args)
}
Module._extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename)
}
const { recordDesignRevision, currentDesignRevision, listDesignRevisions } = require('../src/lib/engineering/designRevisions.ts')
const { recordComputationRun, recordQaRun } = require('../src/lib/provenance/computationAndQa.ts')
const { exportProjectSetoutCsv } = require('../src/lib/reports/projectSetoutCsv.ts')
const { loadProjectSetoutShots } = require('../src/lib/reports/projectSetoutCsv.ts')
const { createSetoutCaptureSnapshot } = require('../src/lib/field/setoutCapture.ts')
const { generateProjectSetoutHtml } = require('../src/lib/reports/projectSetoutHtml.ts')
const Papa = require('papaparse')
const projectId = 'a0000000-0000-4000-8000-000000000001'
const userId = '20000000-0000-4000-8000-000000000001'
const input = { projectId, userId, discipline: 'road', entityType: 'alignment', entityId: 'road-1', crs: 'EPSG:21037' }

async function verifyLegacyMigration(oldMigration, forwardMigration, duplicates) {
  const client = await pool.connect()
  const fixtureSchema = `${schema}_${duplicates ? 'duplicate' : 'legacy'}`
  try {
    await client.query('BEGIN')
    await client.query(`CREATE SCHEMA ${fixtureSchema}`)
    await client.query(`SET LOCAL search_path = ${fixtureSchema}, ${schema}, public`)
    await client.query(oldMigration)
    const { rows: [first] } = await client.query(
      `INSERT INTO design_revisions (project_id, entity_type, revision, revision_number, payload)
       VALUES ($1, 'alignment', 'R01', 1, '{"original":true}') RETURNING id`, [projectId])
    // Exact partial-write shape left when the old writer's retirement failed.
    await client.query(
      `INSERT INTO design_revisions (project_id, entity_type, revision, revision_number, supersedes_id)
       VALUES ($1, 'alignment', 'R02', 2, $2)`, [projectId, first.id])
    if (duplicates) {
      await client.query(
        `INSERT INTO design_revisions (project_id, entity_type, revision, revision_number, supersedes_id)
         VALUES ($1, 'alignment', 'R02', 2, $2)`, [projectId, first.id])
      await assert.rejects(client.query(forwardMigration), /duplicate or invalid revision numbers/i)
      await client.query('ROLLBACK')
    } else {
      await client.query(forwardMigration)
      const { rows: [current] } = await client.query('SELECT revision FROM current_design_revisions')
      assert.equal(current.revision, 'R02')
      const { rows: [old] } = await client.query('SELECT status, payload, supersedes_id FROM design_revisions WHERE id = $1', [first.id])
      assert.equal(old.status, 'SUPERSEDED')
      assert.deepEqual(old.payload, { original: true })
      assert.equal(old.supersedes_id, null)
      await client.query('COMMIT')
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

try {
  const { rows: [identity] } = await pool.query('SELECT current_database() AS name')
  assert.equal(identity.name, 'metardu_revision_verify')
  await pool.query(`CREATE SCHEMA ${schema}`)
  await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public')
  await pool.query('CREATE TABLE projects (id uuid PRIMARY KEY); CREATE TABLE users (id uuid PRIMARY KEY)')
  await pool.query('INSERT INTO projects VALUES ($1)', [projectId])
  await pool.query('INSERT INTO users VALUES ($1)', [userId])
  const oldMigration = readFileSync('src/lib/db/migrations/076_design_revisions_and_offline_basemaps.sql', 'utf8')
  // Later portions of 076 concern unrelated road and deliverable tables.
  await pool.query(oldMigration.slice(0, oldMigration.indexOf('-- Offline field packages:')))
  const forwardPath = 'src/lib/db/migrations/095_design_revision_lifecycle.sql'
  const forwardMigration = existsSync(forwardPath) ? readFileSync(forwardPath, 'utf8').split(/-- DOWN\b/)[0] : null
  if (forwardMigration) await pool.query(forwardMigration)

  const first = await recordDesignRevision({ ...input, payload: { easting: 500000, northing: 9860000 } })
  const second = await recordDesignRevision({ ...input, sourceRevision: first.revision.revision, payload: { easting: 500001, northing: 9860000 } })
  const third = await recordDesignRevision({ ...input, sourceRevision: second.revision.revision, payload: { easting: 500002, northing: 9860000 } })
  assert.equal(second.revision.revision, 'R02')
  assert.equal(third.revision.revision, 'R03')
  assert.equal(second.revision.supersedes_id, first.revision.id)
  assert.equal(third.revision.supersedes_id, second.revision.id)
  assert.equal((await currentDesignRevision(projectId, 'alignment', 'road-1', 'road')).id, third.revision.id)
  const history = await listDesignRevisions(projectId, 'alignment', 'road')
  assert.equal(history.length, 3)
  assert.equal(history.find((row) => row.id === first.revision.id).status, 'SUPERSEDED')
  const { rows: [original] } = await pool.query('SELECT payload, content_hash, supersedes_id FROM design_revisions WHERE id = $1', [first.revision.id])
  assert.deepEqual(original.payload, { easting: 500000, northing: 9860000 })
  assert.equal(original.content_hash, first.revision.content_hash)
  assert.equal(original.supersedes_id, null)

  const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) => recordDesignRevision({ ...input, projectId: index % 2 ? projectId.toUpperCase() : projectId, payload: { edit: index } })))
  assert.deepEqual(concurrent.map((result) => result.revision.revision_number).sort((a, b) => a - b), Array.from({ length: 12 }, (_, index) => index + 4))
  const latest = await currentDesignRevision(projectId, 'alignment', 'road-1', 'road')
  assert.equal(latest.revision, 'R15')
  await assert.rejects(recordDesignRevision({ ...input, crs: 'invalid'.repeat(10), payload: {} }))
  assert.equal((await currentDesignRevision(projectId, 'alignment', 'road-1', 'road')).id, latest.id, 'failed append rolls back supersession')
  await assert.rejects(pool.query('UPDATE design_revisions SET payload = $1 WHERE id = $2', [{ altered: true }, latest.id]), /immutable|append-only/i)
  await assert.rejects(pool.query('UPDATE design_revisions SET supersedes_id = NULL WHERE id = $1', [latest.id]), /immutable|append-only/i)
  await assert.rejects(pool.query('DELETE FROM design_revisions WHERE id = $1', [latest.id]), /immutable|append-only/i)
  await assert.rejects(recordDesignRevision({ ...input, supersedeCurrent: false }), /current|supersed/i)
  await pool.query("UPDATE design_revisions SET status = 'VOID' WHERE id = $1", [latest.id])
  const afterVoid = await recordDesignRevision({ ...input, payload: { resumed: true } })
  assert.equal(afterVoid.revision.revision, 'R16', 'voided history must not reset the revision sequence')

  await recordDesignRevision({ ...input, discipline: 'construction', payload: { separate: true } })
  await assert.rejects(currentDesignRevision(projectId, 'alignment', 'road-1'), /discipline|ambiguous/i)
  assert.equal((await currentDesignRevision(projectId, 'alignment', 'road-1', 'construction')).revision, 'R01')
  const { rows: [count] } = await pool.query("SELECT COUNT(*)::int AS count FROM current_design_revisions WHERE project_id = $1", [projectId])
  assert.equal(count.count, 2)
  assert.equal(evidence.length, 17)
  await assert.rejects(pool.query("UPDATE design_revisions SET status = 'DRAFT' WHERE id = $1", [first.revision.id]), /immutable|append-only/i)
  await pool.query('ALTER TABLE projects ADD COLUMN saved_value integer NOT NULL DEFAULT 0; CREATE TABLE tolerance_profiles (id uuid PRIMARY KEY); CREATE TABLE observation_batches (id uuid PRIMARY KEY)')
  const provenanceMigration = readFileSync('src/lib/db/migrations/072_deliverables_computations_qa.sql', 'utf8')
  await pool.query(provenanceMigration.slice(provenanceMigration.indexOf('CREATE TABLE IF NOT EXISTS computation_runs'), provenanceMigration.indexOf('-- ─── project_tolerance_profiles')))
  const atomicInput = { ...input, entityType: 'atomic-pipeline', entityId: null }
  async function atomicSave(failure) {
    return database.transaction(async (client) => {
      await client.query('UPDATE projects SET saved_value = saved_value + 1 WHERE id = $1', [projectId])
      const revision = await recordDesignRevision({ ...atomicInput, crs: failure === 'revision' ? 'invalid'.repeat(10) : input.crs, payload: { saved: true } }, client)
      const computation = await recordComputationRun({ projectId, userId, algorithmId: failure === 'computation' ? null : 'verify.atomic', algorithmVersion: '1', inputVersion: 'source-1', result: { design_revision: revision.revision.revision } }, client)
      const qa = await recordQaRun({ projectId, userId, dataRevision: 'source-1', designRevision: revision.revision.revision, toleranceProfile: null,
        results: [{ checkType: 'first', result: 'PASS' }, { checkType: 'second', result: failure === 'QA' ? 'INVALID' : 'INFO' }] }, client)
      return { revision, computation, qa }
    })
  }
  const committed = await atomicSave()
  for (const failure of ['revision', 'computation', 'QA']) {
    await assert.rejects(atomicSave(failure))
    assert.equal((await currentDesignRevision(projectId, atomicInput.entityType, null, 'road')).id, committed.revision.revision.id)
    const { rows: [counts] } = await pool.query(`SELECT saved_value,
      (SELECT COUNT(*)::int FROM computation_runs) AS computations,
      (SELECT COUNT(*)::int FROM qa_runs) AS qa,
      (SELECT COUNT(*)::int FROM qa_results) AS checks FROM projects WHERE id = $1`, [projectId])
    assert.deepEqual(counts, { saved_value: 1, computations: 1, qa: 1, checks: 2 })
  }
  assert.equal(evidence.length, 17, 'caller-owned transactions must not emit pre-commit evidence events')
  const setoutSchema = readFileSync('src/lib/db/migrations/075_setout_and_verticality.sql', 'utf8')
  await pool.query(setoutSchema.slice(setoutSchema.indexOf('CREATE TABLE IF NOT EXISTS setout_definitions'), setoutSchema.indexOf('-- Column plumb check:')))
  for (const migration of ['085_setout_source_metadata.sql', '087_reported_setout_accuracy.sql', '088_setout_shot_idempotency.sql']) {
    await pool.query(readFileSync(path.join('src/lib/db/migrations', migration), 'utf8').split(/-- DOWN\b/)[0])
  }
  const { rows: [definition] } = await pool.query(`INSERT INTO setout_definitions
    (project_id, name, origin_easting, origin_northing, row_spacing, column_spacing, crs)
    VALUES ($1, 'Synthetic drain line', 500000, 9860000, 1, 1, 'EPSG:21037') RETURNING id`, [projectId])
  for (const [revision, status] of [[1, 'FAIL'], [2, 'INFO'], [2, 'PASS']]) {
    const { rows: [point] } = await pool.query(`INSERT INTO setout_points
      (definition_id, revision, label, easting, northing, design_rl)
      VALUES ($1, $2, $3, 500000, 9860000, 100) RETURNING id`, [definition.id, revision, status])
    await pool.query(`INSERT INTO setout_observations
      (project_id, definition_id, setout_point_id, label, design_easting, design_northing, design_rl,
       observed_easting, observed_northing, observed_rl, d_e, d_n, horizontal_error,
       threshold_h, threshold_v, result, reported_accuracy_m, notes)
      VALUES ($1, $2, $3, $4, 500000, 9860000, 100, 499999.997, 9860000.004, NULL,
        -0.003, 0.004, 0.005, 0.01, 0.005, $4, 0, '=1+1, note')`, [projectId, definition.id, point.id, status])
  }
  await pool.query(readFileSync('src/lib/db/migrations/096_setout_capture_snapshots.sql', 'utf8').split(/-- DOWN\b/)[0])
  await pool.query(setoutSchema.slice(setoutSchema.indexOf('CREATE OR REPLACE FUNCTION reject_setout_observation_update()'), setoutSchema.indexOf('CREATE OR REPLACE FUNCTION reject_verticality_update()')))
  const selectedExport = await exportProjectSetoutCsv(projectId, definition.id, 2)
  const parsed = Papa.parse(selectedExport.csv, { header: true })
  assert.equal(selectedExport.count, 2)
  assert.deepEqual(parsed.data.map((row) => row.Recorded_Status), ['INFO', 'PASS'])
  assert.equal(parsed.data[0].Observed_RL_m, '')
  assert.equal(parsed.data[0].Delta_E_m, '-0.003')
  assert.equal(parsed.data[0].Notes, "'=1+1, note")
  assert.equal((await exportProjectSetoutCsv(projectId, definition.id, null)).count, 3)
  assert.equal((await exportProjectSetoutCsv(userId, definition.id, null)).count, 0, 'foreign project scope cannot return definition shots')
  const { rows: [capturePoint] } = await pool.query(`INSERT INTO setout_points
    (definition_id, revision, label, easting, northing, design_rl)
    VALUES ($1, 3, 'MH-EXACT', 500000, 9860000, 100) RETURNING id`, [definition.id])
  let firstCaptureId
  for (let index = 0; index < 100; index++) {
    const capture = createSetoutCaptureSnapshot({
      projectId, definitionId: definition.id, pointId: capturePoint.id, pointLabel: 'MH-EXACT', designRevision: 3,
      horizontalCrs: 'EPSG:21037', definitionCrs: 'EPSG:21037', deviceCrs: 'EPSG:21037', verticalDatum: 'Synthetic BM-01',
      capturedAt: new Date(Date.UTC(2026, 9, 8, 6, 30, index)).toISOString(),
      design: { easting: 500000, northing: 9860000, rl: 100 }, capturedDesign: { easting: 500000, northing: 9860000, rl: 100 },
      observed: { easting: 500000.00321, northing: 9860000.00432, rl: index === 0 ? 100.0054 : 100.00321 },
      reportedAccuracyM: 0.0012345, profile: null,
    })
    const { rows: [inserted] } = await pool.query(`INSERT INTO setout_observations
      (project_id, definition_id, setout_point_id, label, design_easting, design_northing, design_rl,
       observed_easting, observed_northing, observed_rl, d_e, d_n, d_z, horizontal_error, vertical_error,
       threshold_h, threshold_v, result, reported_accuracy_m, tolerance_version, capture_snapshot)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb) RETURNING id`,
      [projectId, definition.id, capturePoint.id, capture.pointLabel, capture.design.easting, capture.design.northing, capture.design.rl,
        capture.observed.easting, capture.observed.northing, capture.observed.rl, capture.assessment.dE, capture.assessment.dN,
        capture.assessment.dZ, capture.assessment.horizontalErrorM, capture.assessment.verticalErrorM,
        capture.tolerance.horizontalM, capture.tolerance.verticalM, capture.assessment.result, capture.reportedAccuracyM,
        capture.tolerance.version, JSON.stringify(capture)])
    if (index === 0) firstCaptureId = inserted.id
  }
  const { rows: [precision] } = await pool.query(`SELECT observed_rl, capture_snapshot->'observed'->>'rl' AS original_rl, result FROM setout_observations WHERE id = $1`, [firstCaptureId])
  assert.equal(precision.observed_rl, '100.005')
  assert.equal(precision.original_rl, '100.0054')
  assert.equal(precision.result, 'WARN')
  await assert.rejects(pool.query(`INSERT INTO setout_observations
    (project_id, definition_id, label, design_easting, design_northing, observed_easting, observed_northing)
    VALUES ($1,$2,'NO-SNAPSHOT',500000,9860000,500000,9860000)`, [projectId, definition.id]), /require an immutable capture snapshot/)
  await assert.rejects(pool.query("UPDATE setout_observations SET capture_snapshot = '{}' WHERE id = $1", [firstCaptureId]), /append-only/)
  await pool.query("UPDATE setout_definitions SET crs = 'EPSG:21036' WHERE id = $1", [definition.id])
  const exactExport = Papa.parse((await exportProjectSetoutCsv(projectId, definition.id, 3)).csv, { header: true })
  assert.equal(exactExport.data[0].Observed_RL_m, '100.0054')
  assert.equal(exactExport.data[0].Capture_CRS, 'EPSG:21037')
  assert.equal(exactExport.data[0].Current_Definition_CRS, 'EPSG:21036')
  const savedShots = await loadProjectSetoutShots(projectId, definition.id, null)
  assert.equal(savedShots.length, 103)
  const html = generateProjectSetoutHtml(savedShots, { revision: null, synthetic: true,
    logoDataUrl: 'data:image/png;base64,' + readFileSync('public/metardu-icon.png').toString('base64') })
  assert.ok(html.includes('+0.0054'))
  assert.ok(html.includes('Legacy observations — NOT ASSESSED'))
  assert.ok(html.includes('MH-EXACT (shot 103)'))
  assert.ok(forwardMigration, 'A forward migration is required for deployment')
  const designSchema = oldMigration.slice(0, oldMigration.indexOf('-- Offline field packages:'))
  await verifyLegacyMigration(designSchema, forwardMigration, false)
  await verifyLegacyMigration(designSchema, forwardMigration, true)
  const result = { database: identity.name, schema, sequentialRevisions: 3, concurrentAppends: 12, resumedRevision: 'R16', independentDisciplines: 2, immutablePayload: true, rollbackPreservedCurrent: true, legacyPartialAppendPreserved: true, duplicateHistoryFailsClosed: true, atomicProjectRevisionComputationQaRollback: true, noPreCommitTimelineEvents: true, savedSetoutCsvRevisionAndProjectScope: true, fullPrecisionCaptureSnapshots: true, captureRecords: 100, legacyRecords: 3, snapshotRequiredAndImmutable: true }
  await mkdir('test-results/design-revisions', { recursive: true })
  await writeFile('test-results/design-revisions/synthetic-setout-history.csv', (await exportProjectSetoutCsv(projectId, definition.id, null)).csv)
  await writeFile('test-results/design-revisions/synthetic-project-cut-sheet.html', html)
  await writeFile('test-results/design-revisions/result.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally { await pool.end() }
