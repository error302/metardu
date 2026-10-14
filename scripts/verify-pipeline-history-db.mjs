// Source-only PostgreSQL contract proof. All DDL and synthetic rows roll back.
// Never loads deployment .env or DATABASE_URL and never starts any service.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
const config = rehearsalDatabaseConfig()
assert.equal(config.database, 'metardu_runtime_verify', 'Use the existing marked synthetic database.')
const client = new pg.Client({ connectionString: config.adminUrl, connectionTimeoutMillis: 5000 })
await client.connect()
let transaction = false
try {
  assert.equal((await client.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker, 'METARDU synthetic beacon verification only 2026-10-08')
  assert.equal((await client.query("SELECT to_regclass('public.pipeline_asbuilt_batches') AS existing")).rows[0].existing, null, 'Do not overwrite an existing history table.')
  const role = (await client.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=$1', [config.runtimeRole])).rows[0]
  assert.ok(role && !role.rolsuper && !role.rolbypassrls)
  const sql = await readFile('src/lib/db/migrations/108_pipeline_asbuilt_history.sql', 'utf8')
  await client.query('BEGIN'); transaction = true
  await client.query(sql.split(/^-- DOWN:/m)[0])
  const owner = randomUUID(), other = randomUUID(), project = randomUUID(), delivery = randomUUID()
  for (const actor of [owner, other]) await client.query("INSERT INTO users(id,email,password_hash,full_name) VALUES($1,$2,'synthetic-unusable-hash','SYNTHETIC pipeline SQL verification')", [actor, `pipeline-${actor}@example.invalid`])
  await client.query("INSERT INTO projects(id,user_id,name,survey_type) VALUES($1,$2,'SYNTHETIC pipeline storage contract','engineering')", [project, owner])
  // Minimal storage-shape fixture; arithmetic is checked separately by engine tests.
  const capture = { schemaVersion: 1, scope: 'numerical_profile_only', rawCsv: 'point_id,chainage_m,invert_rl_m\nSYN-P1,0,10', metadata: {}, criterion: null, result: { points: [{ id: 'SYN-P1' }], algorithmVersion: '2.0.0' } }
  const append = () => client.query(`INSERT INTO pipeline_asbuilt_batches(project_id,actor_id,client_batch_id,input_hash,capture,project_name) VALUES($1,$2,$3,$4,$5,'SYNTHETIC') RETURNING id`, [project, owner, delivery, 'a'.repeat(64), JSON.stringify(capture)])
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON pipeline_asbuilt_batches TO "${config.runtimeRole}"`)
  await client.query(`SET LOCAL ROLE "${config.runtimeRole}"`)
  const identity = actor => client.query("SELECT set_config('request.user_id',$1,true), set_config('app.current_user_id',$1,true)", [actor])
  const rejected = async (run, expected) => {
    await client.query('SAVEPOINT rejected_write')
    try { await run(); assert.fail('Expected the database to reject this write.') }
    catch (error) { assert.equal(error.code, expected) }
    finally { await client.query('ROLLBACK TO SAVEPOINT rejected_write'); await client.query('RELEASE SAVEPOINT rejected_write') }
  }
  await identity(owner)
  const id = (await append()).rows[0].id
  assert.equal((await client.query('SELECT capture FROM pipeline_asbuilt_batches WHERE id=$1', [id])).rows[0].capture.rawCsv, capture.rawCsv)
  await rejected(append, '23505')
  assert.equal((await client.query('UPDATE pipeline_asbuilt_batches SET project_name=$1 WHERE id=$2', ['changed', id])).rowCount, 0)
  assert.equal((await client.query('DELETE FROM pipeline_asbuilt_batches WHERE id=$1', [id])).rowCount, 0)
  await identity(other)
  assert.equal((await client.query('SELECT id FROM pipeline_asbuilt_batches WHERE id=$1', [id])).rowCount, 0)
  await rejected(append, '42501')
  await identity(owner)
  await rejected(() => client.query("INSERT INTO pipeline_asbuilt_batches(project_id,actor_id,client_batch_id,input_hash,capture,project_name) VALUES($1,$2,$3,$4,'{}','SYNTHETIC')", [project, owner, randomUUID(), 'a'.repeat(64)]), '23514')
  await client.query('RESET ROLE')
  await rejected(() => client.query('UPDATE pipeline_asbuilt_batches SET project_name=$1 WHERE id=$2', ['changed', id]), '55000')
  await rejected(() => client.query('DELETE FROM pipeline_asbuilt_batches WHERE id=$1', [id]), '55000')
  await rejected(() => client.query('DELETE FROM projects WHERE id=$1', [project]), '23503')
  await client.query('ROLLBACK'); transaction = false
  assert.equal((await client.query("SELECT to_regclass('public.pipeline_asbuilt_batches') AS existing")).rows[0].existing, null)
  console.log(JSON.stringify({ syntheticOnly: true, migrationUpPassed: true, ownerReadAppend: true, otherOwnerBlocked: true, duplicateBlocked: true, runtimeMutationBlocked: true, administrativeMutationBlocked: true, malformedCaptureBlocked: true, projectDeletionBlocked: true, rolledBack: true }))
} finally { if (transaction) await client.query('ROLLBACK'); await client.end() }
