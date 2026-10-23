// Actual source handlers and PostgreSQL; authentication is a bounded test adapter.
// Writes are confined to one uniquely marked schema in the owned rehearsal DB.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const phase = process.argv[2]
assert.ok(['red', 'green'].includes(phase) && process.argv.length === 3, 'Use red or green with the fixed synthetic service.')
const service = JSON.parse(execFileSync('docker', ['inspect', '--format', '{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}', 'metardu-schema-rehearsal-20261008'], { encoding: 'utf8', windowsHide: true, timeout: 30000 }))
assert.equal(service.Id, 'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0')
assert.equal(service.Labels['metardu.purpose'], 'schema-rehearsal'); assert.equal(service.Running, true)
assert.deepEqual(service.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55433' }])
const token = randomUUID(), schema = `metardu_setout_generation_${token.replaceAll('-', '')}`
assert.match(schema, /^metardu_setout_generation_[a-f0-9]{32}$/)
const marker = `METARDU owned set-out generation fixture ${token}`
const options = { connectionString: 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify', connectionTimeoutMillis: 5000, statement_timeout: 8000, application_name: `metardu-setout-generation-${token}` }
const admin = new pg.Client(options)
const pool = new pg.Pool({ ...options, max: 2, options: `-c search_path=${schema},public` })
const leased = new Set()
let beforeClient = null, afterProjectLock = null, insertMode = 'normal'
const database = {
  query: (sql, values) => pool.query(sql, values),
  getClient: async () => {
    if (beforeClient) { const hook = beforeClient; beforeClient = null; await hook() }
    const client = await pool.connect(); leased.add(client)
    return {
      query: async (sql, values) => {
        const result = await client.query(sql, values)
        if (sql === 'BEGIN') await client.query("SELECT set_config('metardu_fixture.point_insert_mode',$1,true)", [insertMode])
        if (afterProjectLock && /FROM projects.*FOR SHARE/s.test(sql)) { const hook = afterProjectLock; afterProjectLock = null; await hook() }
        return result
      },
      release: error => { assert.ok(leased.delete(client), 'Fixture client released exactly once'); client.release(error) },
    }
  },
}
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript'), originalLoad = Module._load
Module._load = function (request, parent, ...rest) {
  if (request === '@/lib/db') return { db: database, setRlsContext: async () => {} }
  if (request === '@/lib/apiHandler') return { apiHandler: (_options, handler) => async (req, userId, projectId) => {
    if (!userId) return Response.json({ error: 'Unauthenticated fixture caller' }, { status: 401 })
    return handler(req, { userId, params: { id: projectId }, body: await req.json() })
  } }
  const resolved = request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request
  return originalLoad.call(this, resolved, parent, ...rest)
}
Module._extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
}
const { POST } = require('../src/app/api/project/[id]/setout/route.ts')
const { NextRequest } = require('next/server')
const owner = randomUUID(), other = randomUUID(), projectId = randomUUID()
const drainage = { action: 'save_drainage_definition' }
const grid = { action: 'save_definition', name: 'SYNTHETIC grid', originEasting: 500000, originNorthing: 9800000, originRL: 0, rows: 2, columns: 2, rowSpacing: 5, columnSpacing: 6, startLabel: 'A1', labelRowsAs: 'alpha', labelColumnsAs: 'numeric' }
const design = { projectCrs: 'EPSG:32737', minimumCoverM: 1.2, setoutIntervalM: 50, manholes: [
  { id: 'A', name: 'MH-A', chainage: 100, easting: 500000, northing: 9800000, coverLevel: 102, invertLevelOut: 100, pipeOutsideDiameterOut: 315 },
  { id: 'B', name: 'MH-B', chainage: 200, easting: 500100, northing: 9800000, coverLevel: 101, invertLevelIn: 99 },
] }
const invoke = (body, user = owner) => POST(new NextRequest(`http://127.0.0.1:3021/api/project/${projectId}/setout`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), user, projectId)
const root = '.cache/setout-generation'
mkdirSync(root, { recursive: true })
const files = ['scripts/verify-setout-generation.mjs', 'src/app/api/project/[id]/setout/route.ts', 'src/lib/db.ts', 'src/lib/auth/ownership.ts', 'src/lib/workspaces/stageReference.ts', 'src/lib/engineering/projectDrainageEngine.ts', 'src/lib/engineering/pileGrid.ts']
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]))
const report = { checkedAt: new Date().toISOString(), phase, source: hashes(), fixtureSchema: schema, authentication: 'bounded adapter, not ordinary-account HTTP', rls: 'isolated fixture tables, not an RLS acceptance test', checks: [] }
const save = () => writeFileSync(`${root}/${phase}.json`, JSON.stringify(report, null, 2) + '\n')
const state = async () => ({ definitions: (await pool.query('SELECT * FROM setout_definitions ORDER BY id')).rows, points: (await pool.query('SELECT * FROM setout_points ORDER BY definition_id,revision,label')).rows })
async function reset() {
  beforeClient = null; afterProjectLock = null; insertMode = 'normal'
  await pool.query('TRUNCATE setout_points, setout_definitions, project_reference_systems, projects')
  await pool.query('INSERT INTO projects(id,user_id,utm_zone,hemisphere,datum,engineering_data) VALUES($1,$2,37,\'S\',\'WGS84\',$3::jsonb)', [projectId, owner, JSON.stringify({ drainage: design })])
  await pool.query(`INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,distance_mode,coordinate_precision)
    VALUES($1,'EPSG:32737','WGS84 UTM 37S','WGS84','metres',37,'S','SYNTHETIC BM','grid',3)`, [projectId])
}
async function check(name, run) {
  await reset()
  try { await run(); report.checks.push({ name, passed: true }); console.log(`PASS ${name}`) }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`) }
  finally {
    // Destroy only this verifier's leaked fixture clients so a red run can
    // finish and remove its exact schema; never touch another process's pool.
    for (const client of leased) client.release(true)
    leased.clear()
  }
  save()
}
let created = false, original, ledger
const fingerprint = async () => {
  const result = {}
  for (const table of ['projects', 'project_reference_systems', 'setout_definitions', 'setout_points', 'setout_observations', 'tolerance_profiles']) {
    result[table] = (await admin.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(record)::text,E'\n' ORDER BY row_to_json(record)::text),'')) hash FROM public.${table} record`)).rows[0]
  }
  return result
}
await admin.connect()
try {
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker, 'METARDU synthetic beacon verification only 2026-10-08')
  original = await fingerprint(); ledger = (await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  report.originalRecordsBefore = original; report.originalMigrationCount = ledger.length
  await admin.query(`CREATE SCHEMA ${schema}`); created = true
  await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`)
  assert.equal((await pool.query('SELECT current_schema() name')).rows[0].name, schema)
  await pool.query(`CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid,utm_zone int,hemisphere text,datum text,engineering_data jsonb);
    CREATE TABLE project_reference_systems(LIKE public.project_reference_systems INCLUDING ALL);
    CREATE TABLE setout_definitions(LIKE public.setout_definitions INCLUDING ALL);
    CREATE TABLE setout_points(LIKE public.setout_points INCLUDING ALL);
    CREATE TABLE tolerance_profiles(LIKE public.tolerance_profiles INCLUDING ALL);
    CREATE FUNCTION owned_insert_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('metardu_fixture.point_insert_mode',true)='suppress' THEN RETURN NULL; END IF;
      IF current_setting('metardu_fixture.point_insert_mode',true)='suppress_later'
        AND ((NEW.point_type='drainage_station' AND NEW.column_index>=250)
          OR (NEW.point_type<>'drainage_station' AND NEW.column_index>=500)) THEN RETURN NULL; END IF;
      IF current_setting('metardu_fixture.point_insert_mode',true)='raise' THEN RAISE EXCEPTION 'Synthetic point insertion failure'; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER owned_point_fault BEFORE INSERT ON setout_points FOR EACH ROW EXECUTE FUNCTION owned_insert_fault();`)
  await pool.query(`CREATE FUNCTION owned_definition_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF current_setting('metardu_fixture.point_insert_mode',true)='suppress_definition_update' THEN RETURN NULL; END IF;
    RETURN NEW; END $$;
    CREATE TRIGGER owned_definition_fault BEFORE UPDATE ON setout_definitions FOR EACH ROW EXECUTE FUNCTION owned_definition_fault();`)
  for (const [name, body, count] of [['drainage', drainage, 3], ['grid', grid, 4]]) {
    await check(`${name}: complete schedule commits and returns its pool client`, async () => {
      const response = await invoke(body); assert.equal(response.status, 201, JSON.stringify(await response.clone().json()))
      assert.equal((await state()).points.length, count); assert.equal(leased.size, 0, 'Pool connection leaked after commit')
    })
    await check(`${name}: actual suppressed inserts roll back the definition and all targets`, async () => {
      insertMode = 'suppress'; const response = await invoke(body); assert.equal(response.status, 500)
      assert.deepEqual(await state(), { definitions: [], points: [] }); assert.equal(leased.size, 0)
    })
    await check(`${name}: actual PostgreSQL exception rolls back and returns its client`, async () => {
      insertMode = 'raise'; assert.equal((await invoke(body)).status, 500)
      assert.deepEqual(await state(), { definitions: [], points: [] }); assert.equal(leased.size, 0)
    })
    await check(`${name}: failed regeneration preserves the existing definition and historical targets`, async () => {
      const first = await invoke(body); assert.equal(first.status, 201)
      const definitionId = (await first.json()).data.definitionId
      const previous = await state(); insertMode = 'suppress'
      assert.equal((await invoke({ ...body, ...(name === 'grid' ? { definitionId } : {}) })).status, 500)
      assert.deepEqual(await state(), previous); assert.equal(leased.size, 0)
    })
    await check(`${name}: later batch suppression rolls back earlier completed batches`, async () => {
      insertMode = 'suppress_later'
      if (name === 'drainage') await pool.query("UPDATE projects SET engineering_data=jsonb_set(engineering_data,'{drainage,setoutIntervalM}','0.2') WHERE id=$1", [projectId])
      const bodyWithBatches = name === 'grid' ? { ...body, rows: 1, columns: 501 } : body
      assert.equal((await invoke(bodyWithBatches)).status, 500)
      assert.deepEqual(await state(), { definitions: [], points: [] }); assert.equal(leased.size, 0)
    })
    for (const newOwner of [other, null]) await check(`${name}: committed owner change to ${newOwner ? 'another owner' : 'unassigned'} before write is refused`, async () => {
      beforeClient = () => admin.query(`UPDATE ${schema}.projects SET user_id=$1 WHERE id=$2`, [newOwner, projectId])
      assert.equal((await invoke(body)).status, 403); assert.deepEqual(await state(), { definitions: [], points: [] }); assert.equal(leased.size, 0)
    })
    await check(`${name}: changed height reference cannot label an old preparation`, async () => {
      beforeClient = () => admin.query(`UPDATE ${schema}.project_reference_systems SET vertical_datum='CHANGED SYNTHETIC BM' WHERE project_id=$1`, [projectId])
      assert.equal((await invoke(body)).status, 409); assert.deepEqual(await state(), { definitions: [], points: [] }); assert.equal(leased.size, 0)
    })
  }
  await check('drainage: changed design is refused and its early return releases the client', async () => {
    beforeClient = () => admin.query(`UPDATE ${schema}.projects SET engineering_data=jsonb_set(engineering_data,'{drainage,minimumCoverM}','1.5') WHERE id=$1`, [projectId])
    const response = await invoke(drainage); assert.equal(response.status, 409); assert.equal((await response.json()).code, 'DRAINAGE_SOURCE_CHANGED')
    assert.deepEqual(await state(), { definitions: [], points: [] }); assert.equal(leased.size, 0)
  })
  await check('grid: missing definition leaves existing data intact and returns the client', async () => {
    assert.equal((await invoke({ ...grid, definitionId: randomUUID() })).status, 404)
    assert.deepEqual(await state(), { definitions: [], points: [] }); assert.equal(leased.size, 0)
  })
  await check('grid: suppressed metadata update cannot create targets under an unconfirmed definition', async () => {
    insertMode = 'suppress_definition_update'
    assert.equal((await invoke(grid)).status, 500)
    assert.deepEqual(await state(), { definitions: [], points: [] }); assert.equal(leased.size, 0)
  })
  await check('grid: suppressed geometry update preserves the original definition and historical targets', async () => {
    const first = await invoke(grid); assert.equal(first.status, 201)
    const definitionId = (await first.json()).data.definitionId, previous = await state()
    insertMode = 'suppress_definition_update'
    assert.equal((await invoke({ ...grid, definitionId, originEasting: 500200 })).status, 500)
    assert.deepEqual(await state(), previous); assert.equal(leased.size, 0)
  })
  await check('repeated field preparation remains within a two-connection pool', async () => {
    for (let i = 0; i < 25; i++) { assert.equal((await invoke(drainage)).status, 201); assert.equal(leased.size, 0, `Leaked at save ${i + 1}`) }
    const current = await state(); assert.equal(current.definitions.length, 1); assert.equal(current.points.length, 75)
    assert.deepEqual([...new Set(current.points.map(point => point.revision))].sort((a,b) => a-b), Array.from({ length: 25 }, (_,i) => i+1))
  })
  await check('locked project ownership blocks a concurrent transfer until targets commit', async () => {
    const editor = new pg.Client(options); await editor.connect()
    let transfer
    try {
      const pid = (await editor.query('SELECT pg_backend_pid() pid')).rows[0].pid
      afterProjectLock = async () => {
        transfer = editor.query(`UPDATE ${schema}.projects SET user_id=$1 WHERE id=$2`, [other, projectId])
        transfer.catch(() => {})
        let waiting = false
        for (let attempt = 0; attempt < 20; attempt++) {
          const row = (await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0]
          if (row?.wait_event_type === 'Lock') { waiting = true; break }
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        assert.ok(waiting, 'Concurrent owner transfer did not wait on the held project row')
      }
      assert.equal((await invoke(drainage)).status, 201); assert.ok(transfer, 'Source handler never locked project ownership')
      await transfer; assert.equal((await state()).points.length, 3); assert.equal(leased.size, 0)
    } finally { await transfer?.catch(() => {}); await editor.end() }
  })
  assert.deepEqual(await fingerprint(), original); report.originalRecordsPreserved = true
  assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows, ledger); report.migrationLedgerPreserved = true
} finally {
  for (const client of leased) client.release(true)
  leased.clear(); await pool.end()
  try {
    if (created) {
      assert.equal((await admin.query("SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1", [schema])).rows[0].marker, marker)
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      assert.equal((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])).rowCount, 0); report.ownedFixtureRemoved = true
    }
    if (original) { assert.deepEqual(await fingerprint(), original); report.originalRecordsPreserved = true }
    if (ledger) { assert.deepEqual((await admin.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows, ledger); report.migrationLedgerPreserved = true }
    assert.deepEqual(hashes(), report.source); report.sourcePreserved = true
    report.status = report.checks.length === 22 && report.checks.every(item => item.passed) && report.ownedFixtureRemoved && report.originalRecordsPreserved && report.migrationLedgerPreserved ? 'passed' : 'failed'
    save()
  } catch (error) {
    report.status = 'failed'; report.finalizationError = error.message; save(); throw error
  } finally { await admin.end() }
}
process.exitCode = report.status === 'passed' ? 0 : 1
