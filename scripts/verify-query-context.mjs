#!/usr/bin/env node
// Actual proxy, server-client and query-builder modules on restricted PostgreSQL.
// Only the provider-session lookup is substituted with isolated synthetic sessions.
import assert from 'node:assert/strict'
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'

const rehearsal = rehearsalDatabaseConfig()
Object.assign(process.env, { DATABASE_URL: rehearsal.runtimeUrl, AUTH_SECRET: 'synthetic-query-context-only-secret', NODE_ENV: 'test', DB_POOL_MAX: '1' })
const require = createRequire(import.meta.url), Module = require('node:module'), ts = require('typescript')
const sessions = new AsyncLocalStorage()
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request === 'next-auth') return { getServerSession: async () => sessions.getStore() ?? null }
  return originalLoad.call(this, request.startsWith('@/') ? path.join(process.cwd(), 'src', request.slice(2)) : request, parent, ...args)
}
Module._extensions['.ts'] = function (module, file) {
  module._compile(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText, file)
}
const { db, getPool, setCurrentUserId, setCurrentOrgId, setCurrentRlsServiceRole, setCurrentTillClaimCode } = require('../src/lib/db.ts')
const { QueryBuilder } = require('../src/lib/db/queryBuilder.ts')
const { createClient } = require('../src/lib/api-client/server.ts')
const { POST: proxy } = require('../src/app/api/db/route.ts')
const { NextRequest } = require('next/server')
const admin = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const ids = { owner: randomUUID(), other: randomUUID(), project: randomUUID(), foreign: randomUUID() }
const checks = []
const check = (name, passed) => { checks.push({ name, passed: Boolean(passed) }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); assert.ok(passed, name) }
const session = id => ({ user: { id, email: `query-${id}@example.invalid`, name: 'Synthetic query operator', role: 'user' } })
async function scope(id, work, privileged = false) {
  const resource = new AsyncResource('METARDU_SYNTHETIC_QUERY_CALLER')
  try {
    return await resource.runInAsyncScope(async () => {
      setCurrentUserId(id); setCurrentOrgId(null)
      setCurrentRlsServiceRole(privileged ? 'platform_admin' : null); setCurrentTillClaimCode(privileged ? 'ABCD1234' : null)
      // QueryBuilder is a thenable; assimilate it inside this request scope.
      return await work()
    })
  } finally { resource.emitDestroy() }
}
const selected = client => client.from('projects').select('id').in('id', [ids.project, ids.foreign])
async function invokeProxy(userId, body) {
  return sessions.run(userId ? session(userId) : null, () => proxy(new NextRequest('http://localhost/api/db', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })))
}
await admin.connect()
try {
  check('actual query-context pool uses a restricted role', runtimeDatabaseRoleFailure((await getPool().query(RUNTIME_ROLE_QUERY)).rows[0]) === null)
  await admin.query(`INSERT INTO public.users(id,email,password_hash,full_name) VALUES
    ($1,$2,'synthetic-no-login','Synthetic query owner'),($3,$4,'synthetic-no-login','Synthetic query other')`,
  [ids.owner, session(ids.owner).user.email, ids.other, session(ids.other).user.email])
  await admin.query(`INSERT INTO public.projects(id,user_id,name) VALUES ($1,$2,'Synthetic query owner project'),($3,$4,'Synthetic query other project')`,
    [ids.project, ids.owner, ids.foreign, ids.other])
  const ownBuilder = await scope(ids.owner, () => new QueryBuilder(db, 'projects').update({ name: 'Synthetic builder save' }).eq('id', ids.project))
  check('context-aware query builder returns its own updated row', ownBuilder.error === null && ownBuilder.data?.[0]?.id === ids.project)
  const badBuilder = await scope(ids.other, () => new QueryBuilder(db, 'projects').update({ name: 'Synthetic forbidden save' }).eq('id', ids.project))
  check('query-builder mutation cannot overwrite another account project', badBuilder.error === null && badBuilder.data?.length === 0)
  const clients = await Promise.all([ids.owner, ids.other].map(id => sessions.run(session(id), () => createClient())))
  const concurrent = await Promise.all(Array.from({ length: 20 }, (_, index) => scope(index % 2 ? ids.owner : ids.other,
    async () => ({ expected: index % 2 ? ids.foreign : ids.project, result: await selected(clients[index % 2]) }), true)))
  check('twenty server-client requests use their captured sessions instead of privileged caller identity',
    concurrent.every(({ expected, result }) => result.error === null && result.data?.length === 1 && result.data[0].id === expected))
  await scope(ids.other, async () => {
    await selected(clients[0])
    const context = (await db.query("SELECT current_setting('request.user_id',true) AS user_id, current_setting('request.access_role',true) AS access_role")).rows[0]
    check('server-client query does not overwrite its caller context', context.user_id === ids.other && context.access_role === 'platform_admin')
  }, true)
  const anonymous = await sessions.run(null, () => createClient())
  check('anonymous server client cannot inherit privileged project access', (await scope(ids.owner, () => selected(anonymous), true)).data?.length === 0)
  const ownedUpdate = { table: 'projects', operation: 'update', filters: [{ column: 'id', op: 'eq', value: ids.project }], payload: { name: 'Synthetic proxy save' } }
  const ownProxy = await scope(ids.other, () => invokeProxy(ids.owner, ownedUpdate), true), ownResponse = await ownProxy.json()
  check('actual database proxy updates the signed-in account row under RLS', ownProxy.status === 200 && ownResponse.error === null
    && ownResponse.data?.[0]?.id === ids.project && ownResponse.data[0].name === 'Synthetic proxy save')
  const foreignProxy = await scope(ids.owner, () => invokeProxy(ids.other, { ...ownedUpdate, payload: { name: 'Synthetic forbidden proxy save' } }), true)
  const foreignResponse = await foreignProxy.json()
  check('actual proxy strips inherited admin context and refuses a foreign mutation', foreignProxy.status === 200 && foreignResponse.error === null
    && foreignResponse.data?.length === 0 && (await admin.query('SELECT name FROM public.projects WHERE id=$1', [ids.project])).rows[0].name === 'Synthetic proxy save')
  const noSession = await scope(ids.owner, () => invokeProxy(null, ownedUpdate), true)
  check('private proxy requires a provider session even with ambient privileged context', noSession.status === 401)
  const idle = (await getPool().query(`SELECT current_setting('request.user_id',true) AS user_id,
    current_setting('request.access_role',true) AS access_role, current_setting('request.organization_id',true) AS organization_id`)).rows[0]
  check('query-builder and server-client leases leave no session context behind', idle.user_id === '' && idle.access_role === '' && idle.organization_id === '')
} finally {
  await mkdir('test-results/runtime-database', { recursive: true })
  await writeFile('test-results/runtime-database/query-context.json', JSON.stringify({ synthetic: true, providerSessionMocked: true,
    database: rehearsal.database, runtimeRole: rehearsal.runtimeRole, concurrentRequests: 20,
    passed: checks.length === 10 && checks.every(item => item.passed), checks }, null, 2) + '\n')
  await getPool().end()
  await admin.query('DELETE FROM public.users WHERE id=ANY($1::uuid[])', [[ids.owner, ids.other]])
  await admin.end()
}
