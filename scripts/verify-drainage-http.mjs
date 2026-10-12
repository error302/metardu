#!/usr/bin/env node
// Real packaged drainage workflow. Fresh marked database and synthetic evidence only.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
import { printDrainageCutSheet } from './verify-drainage-print.mjs'
import { PDFDocument } from 'pdf-lib'

const rehearsal = rehearsalDatabaseConfig()
const sourcePreview = process.argv.includes('--existing-source-preview')
const nativePdf = process.argv.includes('--native-pdf')
if (nativePdf) assert.ok(sourcePreview, 'Native PDF source verification requires the existing source preview.')
const expectedChecks = nativePdf ? 28 : sourcePreview ? 24 : 26
assert.equal(rehearsal.database, 'metardu_runtime_verify', 'Use the marked synthetic verification database, never a deployment database.')
if (sourcePreview) assert.equal(new URL(rehearsal.adminUrl).port, '55433', 'The existing source preview uses only the owned rehearsal PostgreSQL port.')
const base = sourcePreview ? 'http://127.0.0.1:3021' : 'http://127.0.0.1:3003'
const marker = sourcePreview ? 'METARDU synthetic beacon verification only 2026-10-08' : 'METARDU synthetic drainage HTTP verification only 2026-10-08'
const admin = new pg.Client({ connectionString: rehearsal.adminUrl, connectionTimeoutMillis: 5000 })
const ownerId = randomUUID(), otherId = randomUUID()
const password = `synthetic-${randomUUID()}`
const ownerEmail = `drainage-${ownerId}@example.invalid`, otherEmail = `drainage-${otherId}@example.invalid`
const directory = nativePdf ? 'test-results/drainage-pdf-source-http' : sourcePreview ? 'test-results/drainage-source-http' : 'test-results/drainage-http'
const checks = []
const check = (name, passed) => {
  checks.push({ name, passed: Boolean(passed) })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
  assert.ok(passed, name)
}
function sessionClient() {
  const cookies = new Map()
  return async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, redirect: 'manual', signal: AbortSignal.timeout(sourcePreview ? 50000 : 20000),
      headers: { ...options.headers, ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } : {}) } })
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0], split = pair.indexOf('=')
      cookies.set(pair.slice(0, split), pair.slice(split + 1))
    }
    return response
  }
}
async function login(email, id) {
  const request = sessionClient()
  const csrf = await (await request('/api/auth/csrf')).json()
  await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: `${base}/dashboard`, json: 'true' }) })
  assert.equal((await (await request('/api/auth/session')).json()).user?.id, id)
  return request
}
async function json(request, path, body, method = 'POST') {
  const response = await request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const value = await response.json()
  if (!response.ok) console.log(JSON.stringify({ syntheticRequest: path.split('?')[0], status: response.status, code: value.code, error: value.error }))
  return { response, value }
}
let projectId, definitionId, fixtureDatabaseVerified = false, pdfPrintVerified = false
await admin.connect()
try {
  const purpose = (await admin.query("SELECT shobj_description(oid,'pg_database') AS purpose FROM pg_database WHERE datname=current_database()")).rows[0]?.purpose
  assert.equal(purpose, marker, 'The database must be marked as fresh synthetic-only drainage verification.')
  fixtureDatabaseVerified = true
  const hash = await bcrypt.hash(password, 10)
  await admin.query(`INSERT INTO public.users(id,email,password_hash,full_name,role,email_verified) VALUES
    ($1,$2,$3,'Synthetic Drainage Operator','user',true),($4,$5,$3,'Synthetic Other Operator','user',true)`, [ownerId, ownerEmail, hash, otherId, otherEmail])
  await admin.query("INSERT INTO public.surveyor_profiles(user_id,role,is_suspended) VALUES ($1,'surveyor',false),($2,'surveyor',false)", [ownerId, otherId])
  const owner = await login(ownerEmail, ownerId), other = await login(otherEmail, otherId)
  check('synthetic surveyors can sign in with real password sessions', true)
  const created = await json(owner, '/api/projects', { name: 'SYNTHETIC drainage HTTP verification — not field evidence', survey_type: 'engineering',
    location: 'Synthetic local exercise', datum: '', utm_zone: 37, hemisphere: 'S' })
  projectId = created.value.data?.id ?? created.value.project?.id
  check('surveyor can create the engineering project through HTTP', created.response.ok && typeof projectId === 'string')
  const endpoint = `/api/project/${projectId}/setout`
  const undeclared = await json(owner, endpoint, { action: 'save_drainage_definition' })
  check('undeclared project reference blocks field targets', undeclared.response.status === 400 && undeclared.value.code === 'CRS_UNDECLARED')
  const declared = await json(owner, `/api/project/${projectId}/reference-system`, { datum: 'ARC1960', utmZone: 37, hemisphere: 'S',
    distanceMode: 'grid', coordinatePrecision: 3, verticalDatum: 'Synthetic benchmark BM-01', verticalReference: 'local',
    benchmarkBasis: 'Synthetic level datum, not field control', notes: 'SYNTHETIC HTTP VERIFICATION' }, 'PUT')
  check('surveyor can save an explicit horizontal and vertical reference', declared.response.ok
    && (await admin.query('SELECT horizontal_crs,vertical_datum FROM public.project_reference_systems WHERE project_id=$1', [projectId])).rows[0]?.horizontal_crs === 'EPSG:21037')
  const drainage = { projectCrs: 'EPSG:21037', minimumCoverM: 1.2, setoutIntervalM: 50,
    setoutToleranceProfile: { name: 'Synthetic drainage criteria', jurisdiction: 'Synthetic project only', version: 'SYN-R1', horizontalMm: '10', verticalMm: '10',
      effectiveDate: '2026-10-08', source: 'SYNTHETIC TEST REQUIREMENT — not a construction specification', approvedBy: 'Synthetic test approver', acknowledged: true },
    manholes: [{ id: 'MH-A', name: 'MH-A', chainage: 100, easting: 500000, northing: 9800000, coverLevel: 102, invertLevelOut: 100, pipeOutsideDiameterOut: 315 },
      { id: 'MH-B', name: 'MH-B', chainage: 200, easting: 500100, northing: 9800000, coverLevel: 101, invertLevelIn: 99 }] }
  const update = value => ({ table: 'projects', operation: 'update', columns: '*', filters: [{ column: 'id', op: 'eq', value: projectId }], payload: { engineering_data: { mode: 'drainage', drainage: value } } })
  const saved = await json(owner, '/api/db', update(drainage))
  check('saved engineering inputs return the actual owned project row', saved.response.ok && saved.value.data?.length === 1 && saved.value.data[0].id === projectId)
  const foreignSave = await json(other, '/api/db', update({ ...drainage, minimumCoverM: 999 }))
  check('another surveyor cannot overwrite the project drainage design', (!foreignSave.response.ok || foreignSave.value.data?.length === 0)
    && (await admin.query("SELECT engineering_data->'drainage'->>'minimumCoverM' AS cover FROM public.projects WHERE id=$1", [projectId])).rows[0].cover === '1.2')
  const generated = await json(owner, endpoint, { action: 'save_drainage_definition' })
  definitionId = generated.value.data?.definitionId
  check('saved drainage creates three revisioned invert targets', generated.response.status === 201 && generated.value.data?.pointCount === 3
    && generated.value.data.revision === 1 && generated.value.data.crs === 'EPSG:21037' && typeof definitionId === 'string')
  const targetsResponse = await owner(`${endpoint}?definitionId=${definitionId}`)
  const targets = (await targetsResponse.json()).data?.points
  check('field target coordinates and levels match the known pipe run', targetsResponse.ok && targets?.length === 3
    && targets.every((point, index) => point.easting === 500000 + index * 50 && point.northing === 9800000 && point.design_rl === 100 - index * 0.5))
  check('intermediate pipe cover remains unassessed without ground observations', targets[1].metadata?.coverAboveCrownM === null
    && targets[1].metadata.coverAssessment === 'Not assessed between surveyed manholes')
  const forbiddenTargets = await other(`${endpoint}?definitionId=${definitionId}`)
  check('another surveyor cannot read the private field targets', [403, 404].includes(forbiddenTargets.status))
  const makeShot = (point, extra = {}) => ({ action: 'record_observation', definitionId, label: point.label, designRevision: point.revision,
    designEasting: point.easting, designNorthing: point.northing, designRL: point.design_rl,
    observedEasting: point.easting + 0.00321, observedNorthing: point.northing + 0.00432, observedRL: point.design_rl + 0.0054,
    accuracyM: 0.001, capturedCrs: 'EPSG:21037', capturedAt: new Date().toISOString(), clientShotId: randomUUID(),
    instrument: 'Synthetic test instrument', operatorName: 'Synthetic operator', notes: 'SYNTHETIC HTTP VERIFICATION — NOT FIELD EVIDENCE', ...extra })
  const acceptedShot = makeShot(targets[0])
  const accepted = await json(owner, endpoint, acceptedShot)
  check('project-issued criteria assess and save a complete precise shot', accepted.response.status === 201
    && accepted.value.data?.result === 'PASS' && accepted.value.data.toleranceVersion === 'SYN-R1')
  const snapshot = (await admin.query('SELECT capture_snapshot FROM public.setout_observations WHERE id=$1', [accepted.value.data.id])).rows[0].capture_snapshot
  check('stored capture preserves original precision, time, reference and revision', snapshot.observed.rl === 100.0054
    && snapshot.observed.easting === 500000.00321 && snapshot.capturedAt === acceptedShot.capturedAt
    && snapshot.horizontalCrs === 'EPSG:21037' && snapshot.verticalDatum === 'Synthetic benchmark BM-01' && snapshot.designRevision === 1)
  const replay = await json(owner, endpoint, acceptedShot)
  check('retrying the same offline shot does not duplicate the saved observation', replay.response.status === 200 && replay.value.replayed === true
    && replay.value.data.id === accepted.value.data.id
    && (await admin.query('SELECT 1 FROM public.setout_observations WHERE project_id=$1 AND client_shot_id=$2', [projectId, acceptedShot.clientShotId])).rowCount === 1)
  const alteredReplay = await json(owner, endpoint, { ...acceptedShot, observedRL: acceptedShot.observedRL + 0.00001 })
  check('reused shot identity cannot change a sub-millimetre observation', alteredReplay.response.status === 409 && alteredReplay.value.code === 'IDEMPOTENCY_KEY_REUSED')
  const rejected = await json(owner, endpoint, makeShot(targets[0], { observedEasting: targets[0].easting + 0.1, observedRL: targets[0].design_rl + 0.02 }))
  check('failed construction comparison is saved as evidence', rejected.response.status === 201 && rejected.value.data?.result === 'FAIL')
  const unknown = await json(owner, endpoint, makeShot(targets[1], { observedRL: null }))
  check('missing observed invert cannot earn acceptance', unknown.response.status === 201 && unknown.value.data?.result !== 'PASS')
  const crossCrs = await json(owner, endpoint, makeShot(targets[2], { capturedCrs: 'EPSG:21036' }))
  check('mismatched capture CRS is rejected without a new record', crossCrs.response.status === 409 && crossCrs.value.code === 'SETOUT_CRS_CHANGED'
    && (await admin.query('SELECT 1 FROM public.setout_observations WHERE project_id=$1', [projectId])).rowCount === 3)
  const exportPath = `${endpoint}/export?definitionId=${definitionId}&revision=1`
  const csvResponse = await owner(`${exportPath}&format=csv`), csv = await csvResponse.text()
  check('private CSV includes precise captures and failed shots', csvResponse.ok && csvResponse.headers.get('cache-control')?.includes('no-store')
    && csv.includes('100.0054') && csv.includes('FAIL') && csv.includes('SYN-R1') && csv.includes('Synthetic benchmark BM-01'))
  const htmlResponse = await owner(`${exportPath}&format=html`), html = await htmlResponse.text()
  check('private cut sheet preserves unknown acceptance and draft provenance', htmlResponse.ok && htmlResponse.headers.get('cache-control')?.includes('no-store')
    && html.includes('100.0054') && html.includes('NOT ASSESSED') && html.includes('DRAFT') && html.includes('SYNTHETIC HTTP VERIFICATION'))
  await mkdir(directory, { recursive: true })
  await writeFile(`${directory}/synthetic-drainage-cut-sheet.html`, html)
  await writeFile(`${directory}/synthetic-drainage-observations.csv`, csv)
  if (nativePdf) {
    check('drainage HTML includes revisioned chainage and design grade', html.includes('Chainage: 150 m')
      && html.includes('Fall: 1 m; gradient: 1%') && html.includes('Not assessed between surveyed manholes'))
    const response = await owner(`${exportPath}&format=pdf`)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(response.status, 200, 'Native PDF export must succeed')
    const pdf = await PDFDocument.load(bytes)
    check('native PDF is private, complete and A4 landscape', response.headers.get('content-type') === 'application/pdf'
      && response.headers.get('cache-control')?.includes('no-store') && bytes.subarray(0, 5).toString() === '%PDF-'
      && pdf.getPageCount() >= 1 && pdf.getPages().every(page => Math.abs(page.getWidth() - 841.89) < 2 && Math.abs(page.getHeight() - 595.28) < 2))
    await writeFile(`${directory}/synthetic-drainage-cut-sheet.pdf`, bytes)
    check('another surveyor cannot download the private PDF', [403, 404].includes((await other(`${exportPath}&format=pdf`)).status))
  }
  // The source run verifies HTTP/CSV/HTML. Browser print and PDF round-trip
  // remain the separately recorded packaged-runtime proof, not this source run.
  if (!sourcePreview) {
  const printed = await printDrainageCutSheet(directory)
  check('actual exported cut sheet prints to a valid A4 landscape PDF with the company logo', printed.result.a4Landscape
    && printed.result.embeddedCanonicalLogoLoaded && printed.result.renderedFailedAndUnassessedShots)
  const importForm = new FormData()
  importForm.set('file', new File([printed.bytes], 'synthetic-drainage-cut-sheet.pdf', { type: 'application/pdf' }))
  const importedResponse = await owner('/api/parsers/upload', { method: 'POST', body: importForm })
  const imported = await importedResponse.json()
  await writeFile(`${directory}/pdf-parser-result.json`, JSON.stringify({ synthetic: true, status: importedResponse.status, ...imported }, null, 2) + '\n')
  if (!importedResponse.ok || imported.success !== true || !imported.extractedTextPreview?.includes('100.0054')
    || !/SYNTHETIC\s+HTTP\s+VERIFICATION/.test(imported.extractedTextPreview ?? '')) {
    console.log(JSON.stringify({ syntheticPdfImport: { status: importedResponse.status, success: imported.success, errors: imported.errors,
      hasOriginalRl: imported.extractedTextPreview?.includes('100.0054'), hasSyntheticMarker: /SYNTHETIC\s+HTTP\s+VERIFICATION/.test(imported.extractedTextPreview ?? '') } }))
  }
  check('printed PDF preserves readable coordinates and unsplit numeric offsets', importedResponse.ok && imported.success === true
    && imported.extractedTextPreview?.includes('100.0054') && /SYNTHETIC\s+HTTP\s+VERIFICATION/.test(imported.extractedTextPreview ?? '')
    && imported.extractedTextPreview?.includes('+0.0032') && imported.extractedTextPreview?.includes('+0.0054')
    && imported.hasBuilding === false && imported.hasCad === false)
  pdfPrintVerified = true
  }
  check('another surveyor cannot export the private cut sheet', [403, 404].includes((await other(`${exportPath}&format=html`)).status))
  drainage.manholes[1].invertLevelIn = 98.5
  assert.ok((await json(owner, '/api/db', update(drainage))).response.ok)
  const regenerated = await json(owner, endpoint, { action: 'save_drainage_definition' })
  check('design changes append a new target revision without deleting capture history', regenerated.response.status === 201
    && regenerated.value.data?.definitionId === definitionId && regenerated.value.data.revision === 2
    && (await admin.query('SELECT 1 FROM public.setout_points WHERE definition_id=$1', [definitionId])).rowCount === 6
    && (await admin.query('SELECT 1 FROM public.setout_observations WHERE project_id=$1', [projectId])).rowCount === 3)
  const stale = await json(owner, endpoint, { ...acceptedShot, clientShotId: randomUUID() })
  check('a newly delivered stale-design shot requires review', stale.response.status === 409 && stale.value.code === 'SETOUT_REVISION_CHANGED')
  const oldReplay = await json(owner, endpoint, acceptedShot)
  check('an already accepted old-revision delivery remains idempotently retrievable', oldReplay.response.status === 200 && oldReplay.value.replayed === true)
  const oldHistory = await owner(`${exportPath}&format=csv`)
  check('old revision remains exportable after design regeneration', oldHistory.ok && (await oldHistory.text()).includes('100.0054'))
  if (nativePdf) {
    const latest = await owner(`${endpoint}?definitionId=${definitionId}`)
    const currentTargets = (await latest.json()).data?.points
    const unicodeShot = await json(owner, endpoint, makeShot(currentTargets[0], { notes: 'SYNTHETIC unsupported text: \u0645\u062d\u0645\u062f' }))
    assert.equal(unicodeShot.response.status, 201)
    const unsupportedPdf = await owner(`${endpoint}/export?definitionId=${definitionId}&revision=2&format=pdf`)
    const reason = await unsupportedPdf.json()
    check('unsupported PDF text is refused with a lossless HTML or CSV fallback', unsupportedPdf.status === 422
      && reason.code === 'PDF_TEXT_UNSUPPORTED' && reason.error.includes('HTML or CSV'))
  }
} finally {
  await mkdir(directory, { recursive: true })
  await writeFile(`${directory}/result.json`, JSON.stringify({ synthetic: true, base, database: rehearsal.database,
    projectId, definitionId, sourcePreview, nativePdfVerified: nativePdf && checks.every(check => check.passed), pdfPrintVerifiedInThisRun: pdfPrintVerified,
    passed: checks.length === expectedChecks && checks.every(item => item.passed), expectedChecks, checks,
    physicalInstrumentTested: false, productionMutated: false }, null, 2) + '\n')
  // Keep append-only evidence intact; the orchestrator drops this marked disposable
  // database after stopping its isolated preview. No evidence trigger is disabled.
  if (fixtureDatabaseVerified) await admin.query('UPDATE public.surveyor_profiles SET is_suspended=true WHERE user_id=ANY($1::uuid[])', [[ownerId, otherId]])
  await admin.end()
}
