#!/usr/bin/env node
// Rehearse legacy audit upgrades only in the fixed disposable local database.
// All fixture DDL/data are transactional and rolled back; no production env read.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import pg from 'pg'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const rehearsal = rehearsalDatabaseConfig()
const client = new pg.Client({
  connectionString: rehearsal.adminUrl,
  connectionTimeoutMillis: 5000, statement_timeout: 15000,
})
const oldMigration = readFileSync('src/lib/db/migrations/015_fieldbook_soft_delete_audit.sql', 'utf8')
const oldFunction = oldMigration.match(/CREATE OR REPLACE FUNCTION fieldbook_signed_audit_func\(\) RETURNS TRIGGER AS \$\$[\s\S]*?\$\$ LANGUAGE plpgsql;/)?.[0]
assert.ok(oldFunction, 'the original deployed trigger must be available for the fixture')
const migration = readFileSync('src/lib/db/migrations/097_fieldbook_runtime_audit.sql', 'utf8').split('-- DOWN:')[0]
const ids = { user: randomUUID(), project: randomUUID(), point: randomUUID(), entry: randomUUID(), unscoped: randomUUID() }
await client.connect()
try {
  await client.query('BEGIN')
  await client.query('DROP TRIGGER IF EXISTS protect_fieldbook_audit_events ON public.fieldbook_audit_events')
  await client.query(oldFunction)
  await client.query(`SELECT set_config('request.user_id', $1, TRUE), set_config('app.current_user_id', $1, TRUE)`, [ids.user])
  await client.query(`INSERT INTO public.users(id, email, password_hash) VALUES ($1, $2, 'synthetic-rehearsal-only')`,
    [ids.user, `audit-${ids.user}@example.invalid`])
  await client.query(`INSERT INTO public.projects(id, name, user_id) VALUES ($1, 'Synthetic legacy audit rehearsal', $2)`,
    [ids.project, ids.user])
  await client.query(`INSERT INTO public.survey_points(id, project_id, point_name, easting, northing)
    VALUES ($1, $2, 'LEGACY-POINT', 500000, 9800000)`, [ids.point, ids.project])
  await client.query(`INSERT INTO public.project_fieldbook_entries(id, project_id, row_index, station)
    VALUES ($1, $2, 1, 'LEGACY-ENTRY')`, [ids.entry, ids.project])
  await client.query(`INSERT INTO public.fieldbook_audit_events(id, table_name, row_id, action, hash, payload)
    VALUES ($1, 'survey_points', $2, 'INSERT', 'legacy-unscoped', NULL)`, [ids.unscoped, randomUUID()])
  const legacy = (await client.query('SELECT * FROM public.fieldbook_audit_events WHERE row_id = ANY($1::text[])',
    [[ids.point, ids.entry]])).rows
  assert.equal(legacy.length, 2)
  assert.ok(legacy.every(event => event.project_id === null))

  await client.query(migration)
  const upgraded = (await client.query('SELECT * FROM public.fieldbook_audit_events WHERE row_id = ANY($1::text[])',
    [[ids.point, ids.entry]])).rows
  for (const event of upgraded) {
    const before = legacy.find(original => original.id === event.id)
    assert.equal(event.project_id, ids.project)
    assert.deepEqual({ ...event, project_id: null }, before, 'only project scope may be derived from the existing payload')
  }
  assert.equal((await client.query('SELECT project_id FROM public.fieldbook_audit_events WHERE id = $1', [ids.unscoped])).rows[0].project_id, null)

  await client.query(`SET LOCAL ROLE "${rehearsal.runtimeRole}"`)
  assert.equal(runtimeDatabaseRoleFailure((await client.query(RUNTIME_ROLE_QUERY)).rows[0]), null)
  assert.equal((await client.query('SELECT id FROM public.fieldbook_audit_events WHERE id = $1', [ids.unscoped])).rowCount, 0)
  await client.query(`UPDATE public.survey_points SET elevation = 100.0054 WHERE id = $1`, [ids.point])
  await client.query(`UPDATE public.project_fieldbook_entries SET distance = 20.125 WHERE id = $1`, [ids.entry])
  for (const rowId of [ids.point, ids.entry]) {
    const events = (await client.query('SELECT * FROM public.fieldbook_audit_events WHERE row_id = $1', [rowId])).rows
    assert.equal(events.length, 2)
    assert.equal(events.find(event => event.action === 'UPDATE').prev_hash,
      events.find(event => event.action === 'INSERT').hash)
  }
  await client.query('DELETE FROM public.project_fieldbook_entries WHERE id = $1', [ids.entry])
  assert.equal((await client.query('SELECT id FROM public.fieldbook_audit_events WHERE row_id = $1', [ids.entry])).rowCount, 3)
  await client.query('RESET ROLE')
  await client.query('SAVEPOINT immutable_audit')
  await assert.rejects(client.query('UPDATE public.fieldbook_audit_events SET summary = $1 WHERE id = $2',
    ['tampered', legacy[0].id]), error => error.code === '42501' && /append-only/.test(error.message))
  await client.query('ROLLBACK TO SAVEPOINT immutable_audit')

  await client.query('SAVEPOINT unsafe_runtime_ledger_grant')
  await client.query('GRANT INSERT ON public.schema_migrations TO authenticated')
  await client.query(`SET LOCAL ROLE "${rehearsal.runtimeRole}"`)
  const ledgerIdentity = (await client.query(RUNTIME_ROLE_QUERY)).rows[0]
  assert.equal(ledgerIdentity.can_mutate_migration_ledger, true)
  assert.match(runtimeDatabaseRoleFailure(ledgerIdentity), /migration ledger write access/)
  await client.query('RESET ROLE')
  await client.query('ROLLBACK TO SAVEPOINT unsafe_runtime_ledger_grant')
  await client.query('SAVEPOINT unsafe_inherited_ownership')
  await client.query('ALTER TABLE public.fieldbook_audit_events OWNER TO authenticated')
  await client.query(`SET LOCAL ROLE "${rehearsal.runtimeRole}"`)
  const ownerIdentity = (await client.query(RUNTIME_ROLE_QUERY)).rows[0]
  assert.equal(ownerIdentity.owns_public_objects, true)
  assert.match(runtimeDatabaseRoleFailure(ownerIdentity), /non-owner/)
  await client.query('RESET ROLE')
  await client.query('ROLLBACK TO SAVEPOINT unsafe_inherited_ownership')

  const result = {
    synthetic: true, database: rehearsal.database, migration: '097_fieldbook_runtime_audit',
    legacy_payloads_and_hashes_preserved: true, unscoped_history_not_invented: true,
    restricted_point_and_fieldbook_edits: true, predecessor_links_preserved: true,
    deleted_entry_history_retained: true, privileged_audit_mutation_denied: true,
    inherited_ledger_write_and_ownership_rejected: true,
  }
  await mkdir('test-results/runtime-database', { recursive: true })
  await writeFile('test-results/runtime-database/audit-upgrade.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
} finally {
  await client.query('ROLLBACK')
  await client.end()
}
