#!/usr/bin/env node
// Actual authentication modules and the restricted pool, synthetic records only.
import assert from 'node:assert/strict'
import { AsyncResource } from 'node:async_hooks'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync, realpathSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
import { RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'

const rehearsal = rehearsalDatabaseConfig()
Object.assign(process.env, {
  DATABASE_URL: rehearsal.runtimeUrl, AUTH_SECRET: 'synthetic-account-suspension-only-secret',
  NODE_ENV: 'test', METARDU_MCP_ENABLED: 'true', METARDU_MCP_ORIGIN: 'https://metardu.example',
})
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
const { db, getPool, setCurrentUserId, setCurrentOrgId } = require('../src/lib/db.ts')
const { logAuditEvent } = require('../src/lib/enterprise/auditTrail.ts')
const { authOptions } = require('../src/lib/auth.ts')
const { authorizeChatGPT, exchangeToken, authenticateMcp, pkceChallenge, hashCredential } = require('../src/lib/chatgpt/oauth.ts')
const { chatgptConfig } = require('../src/lib/chatgpt/config.ts')
const { CHATGPT_NOTICE_CONTENT, CHATGPT_NOTICE_DIGEST, CHATGPT_NOTICE_PERIOD_MS, CHATGPT_NOTICE_RELATIVE_FILE } = require('../src/lib/chatgpt/notice.ts')
const admin = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const owner = randomUUID(), other = randomUUID()
const clientId = randomBytes(32).toString('base64url')
const verifier = randomBytes(48).toString('base64url')
const origin = process.env.METARDU_MCP_ORIGIN
const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect'
const checks = []
const previousStorageRoot = process.env.STORAGE_ROOT
const noticeParent = path.resolve('.cache/account-suspension-notice')
let noticeFixtureRoot
let noticeFile
const check = (name, condition) => { assert.ok(condition, name); checks.push({ name, passed: true }); console.log(`PASS ${name}`) }
const request = token => new Request(origin + '/api/mcp', { headers: { Authorization: `Bearer ${token}` } })
const freshSession = id => authOptions.callbacks.jwt({ token: {}, user: { id }, account: { provider: 'credentials' } })
const readSession = token => authOptions.callbacks.jwt({ token: { ...token } })
const params = () => new URLSearchParams({
  client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'projects:read', resource: origin,
  code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256', state: 'synthetic-suspension-check',
})
const redeem = code => new URLSearchParams({ client_id: clientId, redirect_uri: redirect, resource: origin,
  code, code_verifier: verifier, grant_type: 'authorization_code' })
const refresh = token => new URLSearchParams({ client_id: clientId, resource: origin, refresh_token: token, grant_type: 'refresh_token' })
async function link(userId) {
  const target = new URL(await authorizeChatGPT(userId, params()))
  assert.equal(target.searchParams.get('state'), 'synthetic-suspension-check')
  return exchangeToken(redeem(target.searchParams.get('code')))
}
async function actorScope(userId, work) {
  const resource = new AsyncResource('METARDU_SYNTHETIC_AUDIT_ACTOR')
  try {
    return await resource.runInAsyncScope(() => { setCurrentUserId(userId); setCurrentOrgId(null); return work() })
  } finally { resource.emitDestroy() }
}

await admin.connect()
try {
  check('real application pool is restricted', runtimeDatabaseRoleFailure((await getPool().query(RUNTIME_ROLE_QUERY)).rows[0]) === null)
  // Exercise the real notice reader against process-local synthetic storage.
  // Never read, publish, backdate or replace the deployment's notice record.
  mkdirSync(noticeParent, { recursive: true })
  noticeFixtureRoot = mkdtempSync(path.join(noticeParent, 'owned-'))
  writeFileSync(path.join(noticeFixtureRoot, 'owner.txt'), owner, { flag: 'wx' })
  process.env.STORAGE_ROOT = noticeFixtureRoot
  noticeFile = path.resolve(noticeFixtureRoot, CHATGPT_NOTICE_RELATIVE_FILE)
  assert.ok(noticeFile.startsWith(noticeFixtureRoot + path.sep))
  mkdirSync(path.dirname(noticeFile), { recursive: true })
  const notice = { version: CHATGPT_NOTICE_CONTENT.version, contentSha256: CHATGPT_NOTICE_DIGEST, publicationScope: 'in-platform' }
  assert.throws(() => chatgptConfig(), /notice period/)
  writeFileSync(noticeFile, JSON.stringify({ ...notice, publishedAt: new Date().toISOString() }), { flag: 'wx' })
  assert.throws(() => chatgptConfig(), /notice period/)
  check('missing and newly published notices still refuse linking', true)
  writeFileSync(noticeFile, JSON.stringify({ ...notice, publishedAt: new Date(Date.now() - CHATGPT_NOTICE_PERIOD_MS - 1000).toISOString() }))
  check('only the owned matured synthetic notice permits account-revocation testing', chatgptConfig().origin === 'https://metardu.example')
  assert.equal((await admin.query("SELECT 1 FROM pg_trigger WHERE tgname='revoke_suspended_account_access' AND NOT tgisinternal")).rowCount, 1,
    'Apply migration 098 to the disposable database before running this verifier')
  await admin.query(`INSERT INTO public.users(id,email,password_hash,full_name) VALUES
    ($1,$2,'synthetic-only-no-login','Synthetic Suspension Owner'), ($3,$4,'synthetic-only-no-login','Synthetic Other Account')`,
    [owner, `suspension-${owner}@example.invalid`, other, `suspension-${other}@example.invalid`])
  await admin.query('INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES ($1,\'surveyor\',false),($2,\'surveyor\',false)', [owner, other])
  await admin.query('INSERT INTO public.chatgpt_clients(client_id_hash,client_name,redirect_uris) VALUES ($1,$2,$3::jsonb)',
    [hashCredential(clientId), 'Synthetic suspension verification', JSON.stringify([redirect])])
  const ownerSession = await freshSession(owner), otherSession = await freshSession(other)
  const ownerTokens = await link(owner), otherTokens = await link(other)
  const pendingCode = new URL(await authorizeChatGPT(owner, params())).searchParams.get('code')
  const ownAuditId = await actorScope(owner, () => logAuditEvent({ userId: owner, action: 'synthetic.actor-check',
    resourceType: 'user', resourceId: owner, timestamp: new Date() }))
  check('restricted service can append its actual authenticated audit actor',
    (await admin.query('SELECT user_id FROM public.audit_logs WHERE id=$1', [ownAuditId])).rows[0].user_id === owner)
  await assert.rejects(actorScope(owner, () => logAuditEvent({ userId: other, action: 'synthetic.forgery-check',
    resourceType: 'user', resourceId: owner, timestamp: new Date() })), error => error.code === '42501')
  check('audit insertion cannot forge a different actor', true)
  check('ordinary service cannot rewrite its historical audit record', (await actorScope(owner, () =>
    db.query("UPDATE public.audit_logs SET action='synthetic.modified' WHERE id=$1", [ownAuditId]))).rowCount === 0)
  await assert.rejects(actorScope(owner, () => db.transaction(async connection => {
    await connection.query('UPDATE public.surveyor_profiles SET is_suspended=true WHERE user_id=$1', [owner])
    await logAuditEvent({ userId: other, action: 'synthetic.failed-suspension', resourceType: 'user', resourceId: owner,
      timestamp: new Date() }, connection)
  })), error => error.code === '42501')
  check('failed transactional audit rolls back profile and credential revocation',
    !(await readSession(ownerSession)).metarduSessionRevoked
    && (await authenticateMcp(request(ownerTokens.access_token)))?.userId === owner)
  check('active account has a website session and ChatGPT access', !ownerSession.metarduSessionRevoked
    && (await authenticateMcp(request(ownerTokens.access_token)))?.userId === owner)

  await admin.query('UPDATE public.surveyor_profiles SET is_suspended=true WHERE user_id=$1', [owner])
  check('suspension invalidates the existing website session', (await readSession(ownerSession)).metarduSessionRevoked === true)
  check('suspension blocks a racing fresh website sign-in', (await freshSession(owner)).metarduSessionRevoked === true)
  check('suspension invalidates ChatGPT bearer access', await authenticateMcp(request(ownerTokens.access_token)) === null)
  await assert.rejects(exchangeToken(refresh(ownerTokens.refresh_token)), /invalid_grant/)
  check('suspension invalidates ChatGPT refresh', true)
  await assert.rejects(exchangeToken(redeem(pendingCode)), /invalid_grant/)
  check('suspension invalidates outstanding authorization codes', true)
  await assert.rejects(authorizeChatGPT(owner, params()), /Account unavailable/)
  check('suspended account cannot approve a new grant', true)
  check('another account remains connected', !(await readSession(otherSession)).metarduSessionRevoked
    && (await authenticateMcp(request(otherTokens.access_token)))?.userId === other)

  // Emulate legacy grants that escaped the old suspension behavior. The
  // source guards must reject them even if their revocation marker is absent.
  await admin.query('UPDATE public.chatgpt_grants SET revoked_at=NULL WHERE user_id=$1', [owner])
  check('legacy unrevoked grant cannot bypass the suspension guard', await authenticateMcp(request(ownerTokens.access_token)) === null)
  await assert.rejects(exchangeToken(refresh(ownerTokens.refresh_token)), /invalid_grant/)
  check('legacy unrevoked refresh is refused without consuming it',
    (await admin.query('SELECT consumed_at FROM public.chatgpt_credentials WHERE token_hash=$1', [hashCredential(ownerTokens.refresh_token)])).rows[0].consumed_at === null)
  await admin.query('UPDATE public.chatgpt_grants SET revoked_at=NOW() WHERE user_id=$1', [owner])

  await admin.query('UPDATE public.surveyor_profiles SET is_suspended=false WHERE user_id=$1', [owner])
  check('unsuspension does not revive old website or ChatGPT credentials', (await readSession(ownerSession)).metarduSessionRevoked === true
    && await authenticateMcp(request(ownerTokens.access_token)) === null)
  const renewed = await link(owner)
  check('restored account can sign in and explicitly reconnect', !(await freshSession(owner)).metarduSessionRevoked
    && (await authenticateMcp(request(renewed.access_token)))?.userId === owner)

  await admin.query('BEGIN')
  await admin.query('UPDATE public.surveyor_profiles SET is_suspended=true WHERE user_id=$1', [other])
  check('profile, website version and grant revocation change in one transaction',
    (await admin.query('SELECT session_version FROM public.users WHERE id=$1', [other])).rows[0].session_version === '2'
    && (await admin.query('SELECT 1 FROM public.chatgpt_grants WHERE user_id=$1 AND revoked_at IS NULL', [other])).rowCount === 0)
  await admin.query('ROLLBACK')
  check('rolled-back suspension preserves the existing connections', !(await readSession(otherSession)).metarduSessionRevoked
    && (await authenticateMcp(request(otherTokens.access_token)))?.userId === other)

  // Hold the account lock, queue consent, suspend, then release. Consent's
  // second statement must see the committed state after waiting for the lock.
  await admin.query('BEGIN')
  await admin.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE', [other])
  const pending = authorizeChatGPT(other, params()).then(value => ({ value }), error => ({ error }))
  let blocked = false
  for (let attempt = 0; attempt < 30; attempt++) {
    await admin.query('SELECT pg_stat_clear_snapshot()')
    blocked = (await admin.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename=$1
      AND wait_event_type='Lock' AND query='SELECT id FROM users WHERE id=$1 FOR SHARE'`, [rehearsal.runtimeRole])).rowCount > 0
    if (blocked) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(blocked, 'the actual consent transaction must be waiting for the held account lock')
  await admin.query('UPDATE public.surveyor_profiles SET is_suspended=true WHERE user_id=$1', [other])
  await admin.query('COMMIT')
  const outcome = await pending
  check('consent waiting on concurrent suspension does not create a new grant', outcome.error?.message === 'Account unavailable'
    && (await admin.query('SELECT 1 FROM public.chatgpt_grants WHERE user_id=$1 AND revoked_at IS NULL', [other])).rowCount === 0)

  await mkdir('test-results/runtime-database', { recursive: true })
  await writeFile('test-results/runtime-database/account-suspension.json', JSON.stringify({ synthetic: true, sourceModules: true,
    actualRestrictedPool: true, processLocalSyntheticNoticeOnly: true, passed: true, checks }, null, 2) + '\n')
} finally {
  await admin.query('ROLLBACK')
  await admin.query('DELETE FROM public.users WHERE id=ANY($1::uuid[])', [[owner, other]])
  await admin.query('DELETE FROM public.chatgpt_clients WHERE client_id_hash=$1', [hashCredential(clientId)])
  await admin.end()
  await getPool().end()
  if (noticeFixtureRoot) {
    assert.equal(path.dirname(realpathSync(noticeFixtureRoot)), realpathSync(noticeParent))
    assert.equal(readFileSync(path.join(noticeFixtureRoot, 'owner.txt'), 'utf8'), owner)
    if (noticeFile) { unlinkSync(noticeFile); rmdirSync(path.dirname(noticeFile)); rmdirSync(path.dirname(path.dirname(noticeFile))) }
    unlinkSync(path.join(noticeFixtureRoot, 'owner.txt'))
    rmdirSync(noticeFixtureRoot)
  }
  if (previousStorageRoot === undefined) delete process.env.STORAGE_ROOT
  else process.env.STORAGE_ROOT = previousStorageRoot
}
