#!/usr/bin/env node
/**
 * Exercises organization project and child-row RLS using the same
 * non-owner `authenticated` role granted to the application login.
 * All fixture data is written inside one transaction and rolled back.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for organization RLS verification.')

const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 })
const client = await pool.connect()
const runtimeRole = process.env.RUNTIME_DB_ROLE || 'authenticated'
if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(runtimeRole)) {
  client.release()
  await pool.end()
  throw new Error('RUNTIME_DB_ROLE must be a simple PostgreSQL role identifier.')
}
const ids = {
  owner: randomUUID(),
  creator: randomUUID(),
  organization: randomUUID(),
  project: randomUUID(),
  point: randomUUID(),
  privateProject: randomUUID(),
  privatePoint: randomUUID(),
  protectedPoint: randomUUID(),
  protectedSource: randomUUID(),
}
const emailSuffix = randomUUID()

async function setRequestContext(userId) {
  await client.query(
    `SELECT set_config('request.user_id', $1, TRUE),
            set_config('app.current_user_id', $1, TRUE),
            set_config('request.organization_id', $2, TRUE)`,
    [userId, ids.organization],
  )
}

async function setRuntimeRole() {
  await client.query(`SET LOCAL ROLE "${runtimeRole}"`)
  if (process.env.RUNTIME_DB_ROLE) {
    const identity = (await client.query(RUNTIME_ROLE_QUERY)).rows[0]
    assert.equal(runtimeDatabaseRoleFailure(identity), null, 'the supplied runtime role must be restricted')
  }
}

async function expectDeniedByScopeTrigger() {
  await client.query('SAVEPOINT organization_scope_change')
  let caught
  try {
    await client.query('UPDATE public.projects SET organization_id = NULL WHERE id = $1', [ids.project])
  } catch (error) {
    caught = error
  }
  assert.equal(caught?.code, '42501', 'scope change must fail with insufficient_privilege')
  assert.match(caught?.message ?? '', /audited transfer workflow/i, 'scope trigger should explain the denied transfer')
  await client.query('ROLLBACK TO SAVEPOINT organization_scope_change')
}

async function expectNoWrite(sql, params, message) {
  await client.query('SAVEPOINT denied_write')
  try {
    const result = await client.query(sql, params)
    assert.equal(result.rowCount, 0, message)
  } catch (error) {
    assert.equal(error.code, '42501', message)
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT denied_write')
  }
}

async function auditEvents(pointId) {
  return (await client.query('SELECT * FROM public.fieldbook_audit_events WHERE row_id = $1', [pointId])).rows
}

try {
  await client.query('BEGIN')
  await client.query(
    `INSERT INTO public.users (id, email, password_hash, full_name)
     VALUES ($1, $2, 'integration-only', 'RLS Test Owner'),
            ($3, $4, 'integration-only', 'RLS Test Project Creator')`,
    [ids.owner, `rls-owner-${emailSuffix}@example.invalid`, ids.creator, `rls-creator-${emailSuffix}@example.invalid`],
  )
  await client.query(
    `INSERT INTO public.organizations (id, name, slug, owner_id, plan, max_seats, is_active)
     VALUES ($1, 'RLS Integration Firm', $2, $3, 'team', 10, TRUE)`,
    [ids.organization, `rls-integration-${emailSuffix}`, ids.owner],
  )
  await client.query(
    `INSERT INTO public.organization_members
       (organization_id, user_id, role, invited_by, accepted_at, is_active)
     VALUES ($1, $2, 'org_admin', $2, NOW(), TRUE),
            ($1, $3, 'project_manager', $2, NOW(), TRUE)`,
    [ids.organization, ids.owner, ids.creator],
  )
  await client.query(
    `INSERT INTO public.projects (id, name, user_id, organization_id)
     VALUES ($1, 'RLS Integration Project', $2, $3)`,
    [ids.project, ids.creator, ids.organization],
  )
  await client.query(
    `INSERT INTO public.survey_points (id, project_id, point_name, easting, northing, elevation)
     VALUES ($1, $2, 'RLS-POINT', 500000, 9800000, 100)`,
    [ids.point, ids.project],
  )
  await client.query(
    `INSERT INTO public.projects(id, name, user_id) VALUES ($1, 'Other private project', $2)`,
    [ids.privateProject, ids.owner],
  )
  await client.query(
    `INSERT INTO public.survey_points(id, project_id, point_name, easting, northing)
     VALUES ($1, $2, 'OTHER-PRIVATE-POINT', 500001, 9800001)`,
    [ids.privatePoint, ids.privateProject],
  )

  await setRuntimeRole()
  await setRequestContext(ids.creator)

  assert.equal((await client.query('SELECT id FROM public.projects WHERE id = $1', [ids.project])).rowCount, 1)
  assert.equal((await client.query('SELECT id FROM public.survey_points WHERE id = $1', [ids.point])).rowCount, 1)
  assert.equal(
    (await client.query("UPDATE public.projects SET name = 'Creator can manage while assigned' WHERE id = $1", [ids.project])).rowCount,
    1,
  )
  assert.equal(
    (await client.query("UPDATE public.survey_points SET description = 'creator write allowed' WHERE id = $1", [ids.point])).rowCount,
    1,
  )
  const createdAudit = await auditEvents(ids.point)
  assert.equal(createdAudit.length, 2, 'an authorized edit must append its audit event atomically')
  const insertEvent = createdAudit.find(event => event.action === 'INSERT')
  const updateEvent = createdAudit.find(event => event.action === 'UPDATE')
  assert.equal(updateEvent.prev_hash, insertEvent.hash, 'survey points must retain their own predecessor hash')
  assert.equal(updateEvent.user_id, ids.creator)
  assert.equal(updateEvent.project_id, ids.project)
  assert.equal((await auditEvents(ids.privatePoint)).length, 0, 'firm membership must not expose another private project audit')
  await expectNoWrite(
    `INSERT INTO public.fieldbook_audit_events(project_id, table_name, row_id, user_id, action, hash)
     VALUES ($1, 'survey_points', $2, $3, 'UPDATE', 'forged')`,
    [ids.project, ids.point, ids.creator], 'the runtime login cannot forge an audit event',
  )
  await expectNoWrite('UPDATE public.fieldbook_audit_events SET summary = $1 WHERE row_id = $2',
    ['forged', ids.point], 'audit events must not be editable')
  await expectNoWrite('DELETE FROM public.fieldbook_audit_events WHERE row_id = $1',
    [ids.point], 'audit events must not be deletable')

  await client.query('RESET ROLE')
  await client.query(
    `UPDATE public.organization_members SET role = 'viewer'
      WHERE organization_id = $1 AND user_id = $2`,
    [ids.organization, ids.creator],
  )
  await setRuntimeRole()
  await setRequestContext(ids.creator)

  assert.equal((await client.query('SELECT id FROM public.projects WHERE id = $1', [ids.project])).rowCount, 1,
    'a downgraded active member should retain read access')
  assert.equal((await client.query('SELECT id FROM public.survey_points WHERE id = $1', [ids.point])).rowCount, 1)
  assert.equal(
    (await client.query("UPDATE public.projects SET name = 'viewer must not update' WHERE id = $1", [ids.project])).rowCount,
    0,
    'project creator must not bypass the downgraded firm role',
  )
  await expectNoWrite("UPDATE public.survey_points SET description = 'viewer must not write' WHERE id = $1",
    [ids.point], 'project creator must not bypass the downgraded child-data role')
  assert.equal((await auditEvents(ids.point)).length, 2, 'a viewer can read audit history, with no event left by denied writes')

  await client.query('SAVEPOINT viewer_insert')
  let viewerInsertError
  try {
    await client.query(
      `INSERT INTO public.survey_points (project_id, point_name, easting, northing)
       VALUES ($1, 'VIEWER-MUST-BE-BLOCKED', 500001, 9800001)`,
      [ids.project],
    )
  } catch (error) {
    viewerInsertError = error
  }
  assert.equal(viewerInsertError?.code, '42501', 'viewer inserts must be rejected by child-row RLS')
  await client.query('ROLLBACK TO SAVEPOINT viewer_insert')
  assert.equal((await auditEvents(ids.point)).length, 2)

  await client.query('RESET ROLE')
  await client.query(
    `UPDATE public.organization_members SET is_active = FALSE
      WHERE organization_id = $1 AND user_id = $2`,
    [ids.organization, ids.creator],
  )
  await setRuntimeRole()
  await setRequestContext(ids.creator)
  assert.equal((await client.query('SELECT id FROM public.projects WHERE id = $1', [ids.project])).rowCount, 0,
    'a removed creator must lose firm project access')
  assert.equal((await client.query('SELECT id FROM public.survey_points WHERE id = $1', [ids.point])).rowCount, 0,
    'a removed creator must lose firm child-data access')
  assert.equal((await auditEvents(ids.point)).length, 0, 'a removed creator must also lose audit history')
  assert.equal(
    (await client.query("UPDATE public.survey_points SET description = 'removed user must not write' WHERE id = $1", [ids.point])).rowCount,
    0,
  )

  await client.query('RESET ROLE')
  await setRuntimeRole()
  await setRequestContext(ids.owner)
  assert.equal((await client.query('SELECT id FROM public.projects WHERE id = $1', [ids.project])).rowCount, 1,
    'the active firm administrator must retain project access')
  assert.equal(
    (await client.query("UPDATE public.projects SET name = 'Admin can manage' WHERE id = $1", [ids.project])).rowCount,
    1,
  )
  await expectDeniedByScopeTrigger()
  assert.equal((await auditEvents(ids.point)).length, 2, 'an active firm administrator can review the team audit')
  assert.equal((await client.query('DELETE FROM public.survey_points WHERE id = $1', [ids.point])).rowCount, 1)
  const deletedAudit = await auditEvents(ids.point)
  assert.equal(deletedAudit.length, 3, 'audit history survives source-row deletion')
  assert.equal(deletedAudit.find(event => event.action === 'DELETE').prev_hash, updateEvent.hash)

  // A bootstrap fixture isolates the imported-control trigger contract. This
  // does not represent a reviewed field source or test the import route itself.
  await client.query('RESET ROLE')
  await client.query(`INSERT INTO public.survey_points(id,project_id,point_name,easting,northing)
    VALUES($1,$2,'SYN-PROTECTED-GUARD',500002,9800002)`,[ids.protectedPoint,ids.project])
  await client.query(`INSERT INTO public.public_beacons(id,name,status,submitted_by)
    VALUES($1,'SYN-PROTECTED-GUARD-SOURCE','pending',$2)`,[ids.protectedSource,ids.creator])
  await client.query(`INSERT INTO public.control_import_captures(project_id,beacon_id,point_id,actor_id,request_id,input_hash,source_snapshot,project_reference_snapshot)
    VALUES($1,$2,$3,$4,$5,$6,'{}'::jsonb,'{}'::jsonb)`,
    [ids.project,ids.protectedSource,ids.protectedPoint,ids.creator,randomUUID(),'0'.repeat(64)])
  await setRuntimeRole()
  await setRequestContext(ids.owner)
  for (const sql of [
    'DELETE FROM public.survey_points WHERE id=$1',
    'UPDATE public.survey_points SET easting=easting+1 WHERE id=$1',
  ]) {
    await client.query('SAVEPOINT protected_control_guard')
    let rejected
    try { await client.query(sql,[ids.protectedPoint]) } catch(error) { rejected=error }
    assert.match(rejected?.message ?? '',/Imported control coordinates/i,'imported control evidence must remain protected')
    await client.query('ROLLBACK TO SAVEPOINT protected_control_guard')
  }
  assert.equal((await client.query('SELECT id FROM public.survey_points WHERE id=$1',[ids.protectedPoint])).rowCount,1)

  console.log('Organization project RLS verified: runtime role, downgrade/removal, child rows, audit isolation/integrity, ordinary deletion history, imported control protection, and immutable scope.')
} finally {
  try {
    await client.query('ROLLBACK')
  } finally {
    client.release()
    await pool.end()
  }
}
