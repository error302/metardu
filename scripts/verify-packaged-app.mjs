#!/usr/bin/env node
// Real HTTP credentials/session requests against the separate loopback preview.
// Only synthetic fixtures in the allowlisted disposable database are used.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { jsPDF } from 'jspdf'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'

const rehearsal = rehearsalDatabaseConfig()
const base = 'http://127.0.0.1:3002'
const admin = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const ids = { owner: randomUUID(), other: randomUUID(), firmAdmin: randomUUID(), platformAdmin: randomUUID(), project: randomUUID(), firmProject: randomUUID(), organization: randomUUID(), point: randomUUID(), firmPoint: randomUUID() }
const password = `synthetic-${randomUUID()}`
const ownerEmail = `preview-owner-${ids.owner}@example.invalid`
const otherEmail = `preview-other-${ids.other}@example.invalid`
const firmAdminEmail = `preview-firm-admin-${ids.firmAdmin}@example.invalid`
const platformAdminEmail = `preview-platform-admin-${ids.platformAdmin}@example.invalid`
const results = []
const auditFailureFixture = `synthetic_suspend_audit_${ids.other.replaceAll('-', '')}`
const check = (name, passed) => { results.push({ name, passed }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`) }

function sessionClient() {
  const cookies = new Map()
  return async (pathname, init = {}) => {
    const response = await fetch(base + pathname, {
      ...init, redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { ...init.headers, ...(cookies.size ? { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') } : {}) },
    })
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0]
      const split = pair.indexOf('=')
      cookies.set(pair.slice(0, split), pair.slice(split + 1))
    }
    return response
  }
}

async function login(email) {
  const request = sessionClient()
  const csrf = await (await request('/api/auth/csrf')).json()
  const response = await request('/api/auth/callback/credentials', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: base + '/dashboard', json: 'true' }),
  })
  const session = await (await request('/api/auth/session')).json()
  return { request, status: response.status, session }
}

await admin.connect()
try {
  const hash = await bcrypt.hash(password, 10)
  await admin.query('BEGIN')
  await admin.query(`INSERT INTO public.users(id, email, password_hash, full_name, role, email_verified)
    VALUES ($1, $2, $3, 'Synthetic Preview Owner', 'user', TRUE),
           ($4, $5, $3, 'Synthetic Preview Other', 'user', TRUE)`,
    [ids.owner, ownerEmail, hash, ids.other, otherEmail])
  await admin.query(`INSERT INTO public.surveyor_profiles(user_id, role, is_suspended) VALUES ($1, 'surveyor', FALSE), ($2, 'surveyor', FALSE)`,
    [ids.owner, ids.other])
  await admin.query(`INSERT INTO public.users(id,email,password_hash,full_name,role,email_verified)
    VALUES ($1,$2,$3,'Synthetic Firm Administrator','org_admin',TRUE)`, [ids.firmAdmin, firmAdminEmail, hash])
  await admin.query(`INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES ($1,'surveyor',FALSE)`, [ids.firmAdmin])
  await admin.query(`INSERT INTO public.users(id,email,password_hash,full_name,role,email_verified)
    VALUES ($1,$2,$3,'Synthetic Platform Administrator','admin',TRUE)`, [ids.platformAdmin, platformAdminEmail, hash])
  await admin.query(`INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES ($1,'admin',FALSE)`, [ids.platformAdmin])
  await admin.query(`INSERT INTO public.organizations(id, name, slug, owner_id, plan, max_seats, is_active)
    VALUES ($1, 'Synthetic Preview Firm', $2, $3, 'team', 3, TRUE)`, [ids.organization, `preview-${ids.organization}`, ids.other])
  await admin.query(`INSERT INTO public.organization_members(organization_id, user_id, role, invited_by, accepted_at, is_active)
    VALUES ($1, $2, 'org_admin', $2, NOW(), TRUE), ($1, $3, 'surveyor', $2, NOW(), TRUE)`,
    [ids.organization, ids.other, ids.owner])
  await admin.query(`INSERT INTO public.organization_members(organization_id,user_id,role,invited_by,accepted_at,is_active)
    VALUES ($1,$2,'org_admin',$3,NOW(),TRUE)`, [ids.organization, ids.firmAdmin, ids.other])
  await admin.query(`INSERT INTO public.projects(id, name, user_id, organization_id)
    VALUES ($1, 'Synthetic Preview Private Project', $2, NULL),
           ($3, 'Synthetic Preview Firm Project', $2, $4)`, [ids.project, ids.owner, ids.firmProject, ids.organization])
  await admin.query(`SELECT set_config('request.user_id', $1, TRUE)`, [ids.owner])
  await admin.query(`INSERT INTO public.survey_points(id, project_id, point_name, easting, northing)
    VALUES ($1, $2, 'SYNTHETIC-PREVIEW-PRIVATE', 500000, 9800000),
           ($3, $4, 'SYNTHETIC-PREVIEW-FIRM', 500001, 9800001)`, [ids.point, ids.project, ids.firmPoint, ids.firmProject])
  await admin.query('COMMIT')

  const anonymous = sessionClient()
  check('healthy packaged app', (await anonymous('/api/public/health')).status === 200)
  check('anonymous private projects denied', (await anonymous('/api/projects')).status === 401)
  const owner = await login(ownerEmail)
  const other = await login(otherEmail)
  check('real owner credentials login', owner.status === 200 && owner.session?.user?.id === ids.owner)
  check('real second-user credentials login', other.status === 200 && other.session?.user?.id === ids.other)
  assert.equal(owner.session?.user?.id, ids.owner, 'credentials login must work before private workflow checks')
  assert.equal(other.session?.user?.id, ids.other)

  const ownProjects = await (await owner.request('/api/projects')).json()
  check('owner can discover private project', ownProjects.data?.some(project => project.id === ids.project))
  const otherProjects = await (await other.request('/api/projects')).json()
  check('another account cannot discover the private project', !otherProjects.data?.some(project => project.id === ids.project))
  const ownAuditResponse = await owner.request(`/api/fieldbook/audit?project_id=${ids.project}`)
  const ownAudit = await ownAuditResponse.json()
  check('private audit visible with no-store response', ownAudit.events?.some(event => event.row_id === ids.point)
    && ownAuditResponse.headers.get('cache-control')?.includes('no-store'))
  const otherAudit = await (await other.request(`/api/fieldbook/audit?project_id=${ids.project}`)).json()
  check('private audit hidden from another account', otherAudit.events?.length === 0)
  const document = new jsPDF()
  document.text('SYNTHETIC METARDU PARSER CHECK', 15, 20)
  document.text('RL 100.0054 m - synthetic input only', 15, 30)
  const form = new FormData()
  form.set('file', new File([document.output('arraybuffer')], 'synthetic-parser-check.pdf', { type: 'application/pdf' }))
  const parsedResponse = await owner.request('/api/parsers/upload', { method: 'POST', body: form })
  const parsed = await parsedResponse.json()
  check('packaged PDF text import', parsedResponse.status === 200 && parsed.success === true
    && parsed.extractedTextPreview?.includes('SYNTHETIC METARDU PARSER CHECK'))
  if (parsed.success !== true) console.log(JSON.stringify({ parserStatus: parsedResponse.status, errors: parsed.errors }))
  const firmAudit = await (await owner.request(`/api/fieldbook/audit?project_id=${ids.firmProject}`)).json()
  check('active firm member can read firm audit', firmAudit.events?.some(event => event.row_id === ids.firmPoint))

  await admin.query('UPDATE public.users SET session_version = session_version + 1 WHERE id = $1', [ids.owner])
  check('revoked session loses private API access', (await owner.request('/api/projects')).status === 401)
  check('unrelated session remains authenticated', (await other.request('/api/projects')).status === 200)
  const firmAdmin = await login(firmAdminEmail)
  assert.equal(firmAdmin.session?.user?.id, ids.firmAdmin)
  assert.equal(firmAdmin.session?.user?.role, 'org_admin')
  const suspension = await firmAdmin.request(`/api/admin/users/${ids.owner}/suspend`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Synthetic scope-denial check' }),
  })
  const suspensionDenial = await suspension.json()
  check('firm administrator cannot globally suspend another account', suspension.status === 403
    && suspensionDenial.error === 'Insufficient permissions' && suspensionDenial.code === 'FORBIDDEN'
    && (await admin.query('SELECT is_suspended FROM public.surveyor_profiles WHERE user_id=$1', [ids.owner])).rows[0].is_suspended === false
    && (await admin.query('SELECT session_version FROM public.users WHERE id=$1', [ids.owner])).rows[0].session_version === '2')
  await admin.query('UPDATE public.surveyor_profiles SET is_suspended=true WHERE user_id=$1', [ids.owner])
  const restoration = await firmAdmin.request(`/api/admin/users/${ids.owner}/suspend`, { method: 'DELETE' })
  const restorationDenial = await restoration.json()
  check('firm administrator cannot globally restore another account', restoration.status === 403
    && restorationDenial.error === 'Insufficient permissions' && restorationDenial.code === 'FORBIDDEN'
    && (await admin.query('SELECT is_suspended FROM public.surveyor_profiles WHERE user_id=$1', [ids.owner])).rows[0].is_suspended === true)
  if (suspensionDenial.error !== 'Insufficient permissions' || restorationDenial.error !== 'Insufficient permissions') {
    console.log(JSON.stringify({ suspensionDenial, restorationDenial }))
  }
  const platformAdmin = await login(platformAdminEmail)
  assert.equal(platformAdmin.session?.user?.id, ids.platformAdmin)
  assert.equal(platformAdmin.session?.user?.role, 'admin')
  const authorizedSuspension = await platformAdmin.request(`/api/admin/users/${ids.other}/suspend`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Synthetic authorized suspension' }),
  })
  const authorizedSuspensionBody = await authorizedSuspension.json()
  check('platform administrator can suspend an account', authorizedSuspension.status === 200 && authorizedSuspensionBody.success === true)
  if (authorizedSuspension.status !== 200) console.log(JSON.stringify({ authorizedSuspensionBody }))
  check('admin suspension revokes the existing website session', (await other.request('/api/projects')).status === 401)
  check('authorized suspension records its real actor in the audit', (await admin.query(
    "SELECT 1 FROM public.audit_logs WHERE user_id=$1 AND record_id=$2 AND action='user.suspend'", [ids.platformAdmin, ids.other])).rowCount === 1)
  const authorizedRestoration = await platformAdmin.request(`/api/admin/users/${ids.other}/suspend`, { method: 'DELETE' })
  const authorizedRestorationBody = await authorizedRestoration.json()
  check('platform administrator can restore an account', authorizedRestoration.status === 200 && authorizedRestorationBody.success === true)
  if (authorizedRestoration.status !== 200) console.log(JSON.stringify({ authorizedRestorationBody }))
  check('restored account must sign in again', (await other.request('/api/projects')).status === 401)
  const restoredOther = await login(otherEmail)
  check('restored account can complete a new sign-in', restoredOther.session?.user?.id === ids.other)
  const restoredVersion = (await admin.query('SELECT session_version FROM public.users WHERE id=$1', [ids.other])).rows[0].session_version
  await admin.query(`CREATE FUNCTION public.${auditFailureFixture}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.record_id::text='${ids.other}' AND NEW.action='user.suspend' THEN
        RAISE EXCEPTION 'Synthetic audit rollback check' USING ERRCODE='42501';
      END IF;
      RETURN NEW;
    END $$`)
  await admin.query(`CREATE TRIGGER ${auditFailureFixture} BEFORE INSERT ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.${auditFailureFixture}()`)
  const rejectedSuspension = await platformAdmin.request(`/api/admin/users/${ids.other}/suspend`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Synthetic audit-failure rollback' }),
  })
  const rejectedBody = await rejectedSuspension.json()
  const rollbackEvidence = {
    status: rejectedSuspension.status, code: rejectedBody.code,
    suspended: (await admin.query('SELECT is_suspended FROM public.surveyor_profiles WHERE user_id=$1', [ids.other])).rows[0].is_suspended,
    versionPreserved: (await admin.query('SELECT session_version FROM public.users WHERE id=$1', [ids.other])).rows[0].session_version === restoredVersion,
    sessionStatus: (await restoredOther.request('/api/projects')).status,
  }
  check('audit failure rolls back suspension and session revocation', rollbackEvidence.status === 403
    && rollbackEvidence.code === 'PERMISSION_DENIED' && rollbackEvidence.suspended === false
    && rollbackEvidence.versionPreserved && rollbackEvidence.sessionStatus === 200)
  if (rollbackEvidence.status !== 403 || rollbackEvidence.suspended || !rollbackEvidence.versionPreserved || rollbackEvidence.sessionStatus !== 200) {
    console.log(JSON.stringify({ syntheticAuditRollback: rollbackEvidence }))
  }
  await admin.query(`DROP TRIGGER ${auditFailureFixture} ON public.audit_logs`)
  await admin.query(`DROP FUNCTION public.${auditFailureFixture}()`)
  await admin.query('UPDATE public.surveyor_profiles SET is_suspended = TRUE WHERE user_id = $1', [ids.other])
  check('suspended account loses its existing private API session', (await restoredOther.request('/api/projects')).status === 401)
  const suspended = await login(otherEmail)
  check('suspended account cannot sign in', !suspended.session?.user?.id)

  await mkdir('test-results/runtime-database', { recursive: true })
  await writeFile('test-results/runtime-database/packaged-app.json', JSON.stringify({ synthetic: true, base, passed: results.every(result => result.passed), checks: results }, null, 2) + '\n')
  assert.ok(results.every(result => result.passed), 'packaged HTTP checks include a failure; see packaged-app.json')
} finally {
  await admin.query('ROLLBACK')
  await admin.query(`DROP TRIGGER IF EXISTS ${auditFailureFixture} ON public.audit_logs`)
  await admin.query(`DROP FUNCTION IF EXISTS public.${auditFailureFixture}()`)
  await admin.query('DELETE FROM public.users WHERE id = ANY($1::uuid[])', [[ids.owner, ids.other, ids.firmAdmin, ids.platformAdmin]])
  await admin.end()
}
