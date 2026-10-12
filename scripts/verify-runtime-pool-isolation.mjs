#!/usr/bin/env node
// Execute the actual db.ts module against the fixed disposable full-schema
// database. One pooled connection forces reuse between concurrent identities.
import assert from 'node:assert/strict'
import { AsyncResource } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const rehearsal = rehearsalDatabaseConfig()
process.env.DATABASE_URL = rehearsal.runtimeUrl
process.env.AUTH_SECRET = 'synthetic-pool-rehearsal-only-secret'
process.env.NODE_ENV = 'test'
process.env.DB_POOL_MAX = '1'
process.env.DB_POOL_CONNECT_TIMEOUT_MS = '10000'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const ts = require('typescript')
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  return originalLoad.call(this, request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request, parent, ...args)
}
Module._extensions['.ts'] = function (module, filename) {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename)
}
const { db, getPool, setCurrentUserId, setCurrentOrgId, setCurrentRlsServiceRole, setCurrentTillClaimCode } = require('../src/lib/db.ts')
const { setAuthenticatedDatabaseContext, resolveAuthenticatedOrganization } = require('../src/lib/auth/requestContext.ts')
const admin = new pg.Client({
  connectionString: rehearsal.adminUrl,
  connectionTimeoutMillis: 5000,
})
const ids = {
  owner: randomUUID(), other: randomUUID(), project: randomUUID(), otherProject: randomUUID(),
  point: randomUUID(), rolledBackPoint: randomUUID(), unknownOrganization: randomUUID(),
  organization: randomUUID(), firmProject: randomUUID(),
}
const backendIds = new Set()

async function requestScope(userId, work, serviceRole = null) {
  const resource = new AsyncResource('METARDU_SYNTHETIC_REQUEST')
  try {
    return await resource.runInAsyncScope(async () => {
      setCurrentUserId(userId)
      setCurrentOrgId(ids.unknownOrganization)
      setCurrentRlsServiceRole(serviceRole)
      setCurrentTillClaimCode(serviceRole ? 'ABCD1234' : null)
      return work()
    })
  } finally { resource.emitDestroy() }
}

async function assertIdleContext() {
  const result = await getPool().query(`SELECT pg_backend_pid() AS pid,
    current_setting('request.user_id', true) AS user_id,
    current_setting('request.organization_id', true) AS organization_id,
    current_setting('app.current_user_id', true) AS compatibility_user,
    current_setting('request.access_role', true) AS access_role,
    current_setting('request.till_claim_code', true) AS till_claim_code`)
  const row = result.rows[0]
  backendIds.add(row.pid)
  assert.deepEqual({ ...row, pid: undefined }, {
    pid: undefined, user_id: '', organization_id: '', compatibility_user: '00000000-0000-0000-0000-000000000000',
    access_role: '', till_claim_code: '',
  }, 'identity and privileged request context must not survive release')
  assert.equal((await getPool().query('SELECT id FROM public.projects WHERE id = ANY($1::uuid[])',
    [[ids.project, ids.otherProject]])).rowCount, 0, 'an idle lease must expose no private fixture project')
}

await admin.connect()
try {
  await admin.query('BEGIN')
  await admin.query(`INSERT INTO public.users(id, email, password_hash, full_name)
    VALUES ($1, $2, 'synthetic-no-password-login', 'Pool Rehearsal Owner'),
           ($3, $4, 'synthetic-no-password-login', 'Pool Rehearsal Other')`,
    [ids.owner, `pool-owner-${ids.owner}@example.invalid`, ids.other, `pool-other-${ids.other}@example.invalid`])
  await admin.query(`INSERT INTO public.projects(id, name, user_id)
    VALUES ($1, 'Synthetic Pool Owner Project', $2), ($3, 'Synthetic Pool Other Project', $4)`,
    [ids.project, ids.owner, ids.otherProject, ids.other])
  await admin.query(`INSERT INTO public.organizations(id, name, slug, owner_id, plan, max_seats, is_active)
    VALUES ($1, 'Synthetic Pool Firm', $2, $3, 'team', 3, TRUE)`, [ids.organization, `pool-${ids.organization}`, ids.other])
  await admin.query(`INSERT INTO public.organization_members(organization_id, user_id, role, invited_by, accepted_at, is_active)
    VALUES ($1, $2, 'org_admin', $2, NOW(), TRUE), ($1, $3, 'surveyor', $2, NOW(), TRUE)`,
    [ids.organization, ids.other, ids.owner])
  await admin.query(`INSERT INTO public.projects(id, name, user_id, organization_id)
    VALUES ($1, 'Synthetic Pool Firm Project', $2, $3)`, [ids.firmProject, ids.owner, ids.organization])
  await admin.query('COMMIT')

  assert.equal(runtimeDatabaseRoleFailure((await getPool().query(RUNTIME_ROLE_QUERY)).rows[0]), null)
  await Promise.all(Array.from({ length: 20 }, (_, index) => {
    const actor = index % 2 ? ids.owner : ids.other
    const ownProject = actor === ids.owner ? ids.project : ids.otherProject
    return requestScope(actor, async () => {
      const result = await db.query(`SELECT id, pg_backend_pid() AS pid FROM public.projects WHERE id = ANY($1::uuid[])`,
        [[ids.project, ids.otherProject]])
      assert.deepEqual(result.rows.map(row => row.id), [ownProject], 'concurrent actors must see only their own project')
      backendIds.add(result.rows[0].pid)
    })
  }))
  await assertIdleContext()

  await requestScope(ids.owner, async () => {
    setAuthenticatedDatabaseContext(ids.owner)
    const organizationId = await resolveAuthenticatedOrganization(ids.owner)
    assert.equal(organizationId, ids.organization,
      'the real request helper must resolve an active firm through runtime RLS')
    setAuthenticatedDatabaseContext(ids.owner, organizationId)
    assert.equal((await db.query('SELECT id FROM public.projects WHERE id = $1', [ids.firmProject])).rowCount, 1)
  })
  await admin.query('UPDATE public.organization_members SET is_active = FALSE WHERE organization_id = $1 AND user_id = $2',
    [ids.organization, ids.owner])
  await requestScope(ids.owner, async () => {
    setAuthenticatedDatabaseContext(ids.owner)
    const organizationId = await resolveAuthenticatedOrganization(ids.owner)
    assert.equal(organizationId, null)
    setAuthenticatedDatabaseContext(ids.owner, organizationId)
    assert.equal((await db.query('SELECT id FROM public.projects WHERE id = $1', [ids.firmProject])).rowCount, 0,
      'removed firm membership must not preserve creator access')
  })
  await admin.query('UPDATE public.organizations SET is_active = FALSE WHERE id = $1', [ids.organization])
  await requestScope(ids.other, async () => {
    setAuthenticatedDatabaseContext(ids.other)
    const organizationId = await resolveAuthenticatedOrganization(ids.other)
    assert.equal(organizationId, null, 'an inactive firm must not become the default context')
    setAuthenticatedDatabaseContext(ids.other, organizationId)
  })
  await assertIdleContext()

  await requestScope(ids.owner, async () => {
    await assert.rejects(db.query('SELECT nonexistent_rehearsal_column FROM public.projects'), error => error.code === '42703')
  })
  await assertIdleContext()
  await requestScope(ids.owner, async () => {
    await db.transaction(async client => {
      const rows = (await client.query('SELECT id FROM public.projects WHERE id = ANY($1::uuid[])',
        [[ids.project, ids.otherProject]])).rows
      assert.deepEqual(rows.map(row => row.id), [ids.project], 'transactions must preserve request identity')
      await client.query(`INSERT INTO public.survey_points(id, project_id, point_name, easting, northing)
        VALUES ($1, $2, 'SYNTHETIC-POOL-POINT', 500000, 9800000)`, [ids.point, ids.project])
    })
  })
  await assertIdleContext()
  await requestScope(ids.owner, async () => {
    await assert.rejects(db.transaction(async client => {
      await client.query(`INSERT INTO public.survey_points(id, project_id, point_name, easting, northing)
        VALUES ($1, $2, 'SYNTHETIC-MUST-ROLL-BACK', 500001, 9800001)`, [ids.rolledBackPoint, ids.project])
      throw new Error('synthetic transaction failure')
    }), /synthetic transaction failure/)
  })
  await assertIdleContext()
  assert.equal((await admin.query('SELECT id FROM public.survey_points WHERE id = $1', [ids.rolledBackPoint])).rowCount, 0)
  assert.equal((await admin.query('SELECT id FROM public.fieldbook_audit_events WHERE row_id = $1', [ids.rolledBackPoint])).rowCount, 0,
    'transaction rollback must remove the audit event together with its source row')
  await requestScope(ids.owner, async () => {
    assert.equal((await db.query('SELECT id FROM public.projects WHERE id = ANY($1::uuid[])',
      [[ids.project, ids.otherProject]])).rowCount, 2)
  }, 'platform_admin')
  await assertIdleContext()
  await requestScope(ids.other, async () => {
    assert.deepEqual((await db.query('SELECT id FROM public.projects WHERE id = ANY($1::uuid[])',
      [[ids.project, ids.otherProject]])).rows.map(row => row.id), [ids.otherProject],
    'a subsequent normal request must not inherit platform-admin access')
  })
  await assertIdleContext()
  assert.equal(backendIds.size, 1, 'the test must really reuse the same PostgreSQL connection')

  const result = {
    synthetic: true, source_module: 'src/lib/db.ts', runtime_role: rehearsal.runtimeRole,
    concurrent_identity_requests: 20, physical_connections_used: backendIds.size,
    autocommit_isolation: true, successful_transaction_isolation: true,
    query_failure_cleanup: true, rollback_source_and_audit_atomicity: true,
    privileged_context_cleanup: true, idle_connection_private_rows: 0,
    real_request_membership_resolution_and_revocation: true,
  }
  await mkdir('test-results/runtime-database', { recursive: true })
  await writeFile('test-results/runtime-database/pool-isolation.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
} finally {
  await getPool().end()
  // Only these synthetic identities are removed; append-only audit history
  // remains in the disposable database until that database is discarded.
  await admin.query('DELETE FROM public.users WHERE id = ANY($1::uuid[])', [[ids.owner, ids.other]])
  await admin.end()
}
