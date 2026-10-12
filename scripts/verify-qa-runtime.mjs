#!/usr/bin/env node
// Actual QA routes/handler/provenance writer and restricted PostgreSQL; synthetic sessions only.
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
Object.assign(process.env, { DATABASE_URL: rehearsal.runtimeUrl, AUTH_SECRET: 'synthetic-qa-session-only-secret', NODE_ENV: 'test', DB_POOL_MAX: '2' })
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
const { setAuthenticatedDatabaseContext } = require('../src/lib/auth/requestContext.ts')
const { POST, GET } = require('../src/app/api/project/[id]/qa/route.ts')
const { recordQaRun } = require('../src/lib/provenance/computationAndQa.ts')
const { NextRequest } = require('next/server')
const admin = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const ids = { owner: randomUUID(), other: randomUUID(), project: randomUUID() }
const checks = [], session = id => id ? { user: { id, email: `qa-${id}@example.invalid`, name: 'Synthetic QA operator', role: 'user' } } : null
const check = (name, passed) => { checks.push({ name, passed: Boolean(passed) }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); assert.ok(passed, name) }
async function inRequest(userId, work) {
  const resource = new AsyncResource('METARDU_SYNTHETIC_QA_REQUEST')
  try { return await resource.runInAsyncScope(() => sessions.run(session(userId), work)) }
  finally { resource.emitDestroy() }
}
async function invoke(userId, method, body, query = '') {
  return inRequest(userId, async () => {
    const request = new NextRequest(`http://localhost/api/project/${ids.project}/qa${query}`, {
      method, headers: { 'Content-Type': 'application/json', 'x-real-ip': '192.0.2.212' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    })
    const response = await (method === 'POST' ? POST : GET)(request, { params: Promise.resolve({ id: ids.project }) })
    return { response, value: await response.json() }
  })
}
const measured = { checkType: 'synthetic.absolute_closure', result: 'PASS', measuredValue: 0.01, thresholdValue: 0.02, unit: 'm', details: { rule: 'Absolute closure <= 0.02 m', comparison: 'lte' } }
let fixturesVerified = false
await admin.connect()
try {
  check('QA uses a non-owner, non-superuser runtime database role', runtimeDatabaseRoleFailure((await getPool().query(RUNTIME_ROLE_QUERY)).rows[0]) === null)
  await admin.query(`INSERT INTO public.users(id,email,password_hash,full_name) VALUES ($1,$2,'synthetic-no-login','Synthetic QA owner'),($3,$4,'synthetic-no-login','Synthetic QA other')`, [ids.owner, session(ids.owner).user.email, ids.other, session(ids.other).user.email])
  await admin.query("INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false),($2,'surveyor',false)", [ids.owner, ids.other])
  fixturesVerified = true
  await admin.query("INSERT INTO public.projects(id,user_id,name) VALUES($1,$2,'SYNTHETIC QA verification - not survey evidence')", [ids.project, ids.owner])
  check('unauthenticated QA recording is rejected', (await invoke(null, 'POST', {})).response.status === 401)
  const saved = await invoke(ids.owner, 'POST', { inputSnapshot: JSON.stringify({ measuredClosure: 0.01, rawShots: ['SYN-A', 'SYN-B'] }), results: [measured, { checkType: 'synthetic.uninspected_document', result: 'INFO', message: 'Document not inspected' }] })
  check('actual handler saves consumed JSON body with both results', saved.response.status === 201 && saved.value.data.pass === 1 && saved.value.data.certified === false)
  const runId = saved.value.data.runId
  const persisted = (await admin.query('SELECT * FROM qa_runs WHERE id=$1', [runId])).rows[0]
  const results = (await admin.query('SELECT * FROM qa_results WHERE qa_run_id=$1', [runId])).rows
  check('client-reported checks do not inherit an unused default profile', persisted.tolerance_profile_id === null && persisted.tolerance_profile_version === null && persisted.trigger === 'manual')
  check('full snapshot, measured quantity, threshold and rule survive PostgreSQL', results.length === 2 && results.some(row => row.details.inputSnapshot?.rawShots?.[0] === 'SYN-A' && row.details.evidenceSource === 'client_reported' && Number(row.measured_value) === 0.01 && Number(row.threshold_value) === 0.02 && row.unit === 'm' && row.details.comparison === 'lte'))
  const loaded = await invoke(ids.owner, 'GET', undefined, '?limit=1.7')
  check('private QA reload includes input revision and numerical evidence', loaded.response.status === 200 && loaded.response.headers.get('cache-control') === 'private, no-store' && loaded.value.data.runs[0].data_revision === persisted.data_revision && loaded.value.data.runs[0].results.length === 2)
  check('a second account cannot read or write the owner QA ledger', [403,404].includes((await invoke(ids.other, 'GET')).response.status) && [403,404].includes((await invoke(ids.other, 'POST', { dataRevision: 'SYN-R1', results: [measured] })).response.status))
  const changed = await invoke(ids.owner, 'POST', { inputSnapshot: JSON.stringify({ measuredClosure: 0.011, rawShots: ['SYN-A', 'SYN-B'] }), results: [{ ...measured, measuredValue: 0.011 }] })
  check('changed measurements with the same verdict acquire a different full SHA256 revision', changed.response.status === 201 && changed.value.data.dataRevision !== persisted.data_revision && /^sha256:[A-Za-z0-9_-]{43}$/.test(changed.value.data.dataRevision))
  for (const [name, body] of [
    ['missing threshold', { dataRevision: 'SYN-R1', results: [{ ...measured, thresholdValue: null }] }],
    ['contradictory PASS', { dataRevision: 'SYN-R1', results: [{ ...measured, measuredValue: 0.03 }] }],
    ['forged automated trigger', { trigger: 'on_compute', dataRevision: 'SYN-R1', results: [measured] }],
  ]) check(`${name} is rejected without appending a run`, (await invoke(ids.owner, 'POST', body)).response.status === 400 && Number((await admin.query('SELECT count(*) FROM qa_runs WHERE project_id=$1', [ids.project])).rows[0].count) === 2)
  let rejected = false
  await inRequest(ids.owner, async () => {
    setAuthenticatedDatabaseContext(ids.owner)
    try { await recordQaRun({ projectId: ids.project, userId: ids.owner, requireOwner: true, toleranceProfile: null, dataRevision: 'SYN-INJECTED-DB-FAILURE', evidence: false, results: [measured, { ...measured, checkType: 'x'.repeat(81) }] }) }
    catch (error) { rejected = error.code === '22001' }
  })
  check('second-result database failure rolls back run and first result together', rejected && Number((await admin.query('SELECT count(*) FROM qa_runs WHERE project_id=$1', [ids.project])).rows[0].count) === 2 && Number((await admin.query('SELECT count(*) FROM qa_results qr JOIN qa_runs q ON q.id=qr.qa_run_id WHERE q.project_id=$1', [ids.project])).rows[0].count) === 3)
  check('original QA input revision remains unchanged after new runs', (await admin.query('SELECT data_revision FROM qa_runs WHERE id=$1', [runId])).rows[0].data_revision === persisted.data_revision)
} finally {
  await mkdir('test-results/runtime-database', { recursive: true })
  await writeFile('test-results/runtime-database/qa-runtime.json', JSON.stringify({ synthetic: true, providerSessionMocked: true, database: rehearsal.database, runtimeRole: rehearsal.runtimeRole, passed: checks.length === 13 && checks.every(item => item.passed), checks }, null, 2) + '\n')
  await getPool().end()
  if (fixturesVerified) await admin.query('UPDATE public.surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])', [[ids.owner, ids.other]])
  await admin.end()
}
