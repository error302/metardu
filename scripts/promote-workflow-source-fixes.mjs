// One app-only promotion from the verified 7e733 production baseline.
// No migrations, provisioner, supporting-service restarts, or MCP enablement.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { collectFileMigrations, computeDrift, RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'

const root = 'test-results/workflow-source-release'
const baseline = 'sha256:7e73394d95c306d1c454a8735b0cf9eb1e7795ca2859126132ff4aaa3bba142e'
const names = ['metardu-app', 'metardu-postgres', 'metardu-redis', 'metardu-worker', 'metardu-collaboration', 'metardu-ntrip', 'metardu-backup']
const override = '.cache/release-verify/workflow-source-promotion.override.yml'
const rollbackOverride = '.cache/release-verify/workflow-source-rollback.override.yml'
const result = { status: 'preparing', scope: 'Verified source fixes; existing app only; zero migrations; customer MCP disabled', phases: [] }
const save = () => writeFileSync(`${root}/promotion.json`, JSON.stringify(result, null, 2) + '\n')
const phase = name => { result.phases.push({ name, passed: true }); save(); console.log(`PASS ${name}`) }
function docker(args, input, timeout = 30000) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 10 * 1024 * 1024 })
  if (r.error || r.status !== 0) throw new Error(`Docker ${args[0]} failed; sensitive diagnostics suppressed`)
  return r.stdout.trim()
}
const environment = c => Object.fromEntries(c.Config.Env.map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)] }))
const mounts = c => c.Mounts.map(m => ({ type: m.Type, name: m.Name ?? null, source: m.Source, destination: m.Destination, rw: m.RW })).sort((a, b) => a.destination.localeCompare(b.destination))
const snapshot = c => ({ name: c.Name.slice(1), id: c.Id, image: c.Image, startedAt: c.State.StartedAt, mounts: mounts(c) })
function sourceHash() {
  const hash = createHash('sha256')
  function walk(dir) { for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const path = join(dir, entry.name); if (entry.isDirectory()) walk(path); else if (entry.isFile() && !/\.(test|spec)\./.test(entry.name)) { hash.update(path.replaceAll('\\', '/')); hash.update(readFileSync(path)) } } }
  walk('src')
  for (const file of ['package.json', 'package-lock.json', 'Dockerfile', 'docker-entrypoint.sh', 'next.config.js']) { hash.update(file); hash.update(readFileSync(file)) }
  for (const file of ['scripts/prepare-standalone.mjs','public/metardu-icon.png','public/fonts/JetBrainsMono-Regular.ttf','public/fonts/JetBrainsMono-coverage.json','public/fonts/JetBrainsMono-OFL.txt']) { hash.update(file); hash.update(readFileSync(file)) }
  return hash.digest('hex')
}
let client, changed = false
try {
  const candidate = JSON.parse(readFileSync(`${root}/candidate-build.json`, 'utf8'))
  const checks = JSON.parse(readFileSync(`${root}/source-checks.json`, 'utf8'))
  assert.equal(candidate.status, 'built')
  assert.equal(candidate.sourceSha256, sourceHash())
  assert.equal(checks.sourceSha256, candidate.sourceSha256)
  assert.equal(checks.passed, true)
  assert.equal(checks.artifactAssociation.sourceSha256,candidate.sourceSha256)
  const proofFiles=['test-results/drainage-pdf-source-http/result.json','test-results/drainage-pdf-source-http/native-pdf-inspection.json','test-results/drainage-pdf-source-http/synthetic-drainage-cut-sheet.pdf','test-results/drainage-native-pdf/generation.json','test-results/drainage-native-pdf/native-pdf-inspection.json','test-results/drainage-native-pdf/synthetic-drainage-deliverable.pdf','test-results/setting-out-pagination/inspection.json','test-results/setting-out-pagination/synthetic-setting-out-sheet.pdf','test-results/contour-source-browser/native-verification.json','test-results/contour-source-browser/contours.dxf','test-results/contour-source-browser/contours.csv','test-results/contour-source-browser/contours.svg','test-results/contour-source-browser/contour-plan-a3.pdf']
  assert.deepEqual(Object.keys(checks.artifactAssociation.files).sort(),proofFiles.sort())
  for (const [file,digest] of Object.entries(checks.artifactAssociation.files)) {
    assert.ok(file.startsWith('test-results/'))
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),digest,`Verification artifact changed: ${file}`)
  }
  const drainage=JSON.parse(readFileSync('test-results/drainage-pdf-source-http/result.json','utf8'))
  assert.equal(drainage.passed,true); assert.equal(drainage.expectedChecks,28); assert.equal(drainage.checks.length,28); assert.equal(drainage.nativePdfVerified,true)
  assert.ok(drainage.checks.every(check=>check.passed===true)); assert.equal(drainage.base,'http://127.0.0.1:3021'); assert.equal(drainage.database,'metardu_runtime_verify'); assert.equal(drainage.productionMutated,false); assert.equal(drainage.physicalInstrumentTested,false)
  assert.equal(drainage.projectId,checks.fixtures.drainageProjectId); assert.equal(drainage.definitionId,checks.fixtures.drainageDefinitionId)
  const settingOut=JSON.parse(readFileSync('test-results/setting-out-pagination/inspection.json','utf8'))
  assert.equal(settingOut.all50PointsExactlyOnce,true); assert.equal(settingOut.textWithinMargins,true); assert.equal(settingOut.pages,3); assert.equal(settingOut.a4Portrait,true); assert.equal(settingOut.repeatedHeadersAndPageNumbers,true); assert.equal(settingOut.sourceOnly,true)
  const contours=JSON.parse(readFileSync('test-results/contour-source-browser/native-verification.json','utf8'))
  assert.equal(contours.dxfNormalParserErrors,0); assert.equal(contours.dxfAuditRepairs,0); assert.equal(contours.independentPlaneEquality,true); assert.equal(contours.pdfTextWithinPage,true); assert.equal(contours.polylines,14); assert.equal(contours.csvVertices,55); assert.equal(contours.browserDownloads,4); assert.equal(contours.svgPolylines,14); assert.equal(contours.metreUnits,true); assert.equal(contours.a3LandscapePdf,true); assert.equal(contours.svgXmlValid,true); assert.equal(contours.indexLineweightsPreserved,true); assert.equal(contours.sourceBrowserOrigin,'http://127.0.0.1:3021'); assert.equal(contours.productionProof,false); assert.equal(contours.fieldInstrumentProof,false)
  for(const [file,digest] of Object.entries(contours.files))assert.equal(createHash('sha256').update(readFileSync(`test-results/contour-source-browser/${file}`)).digest('hex'),digest)
  for(const directory of ['drainage-pdf-source-http','drainage-native-pdf']) {
    const pdf=JSON.parse(readFileSync(`test-results/${directory}/native-pdf-inspection.json`,'utf8'))
    for(const key of ['originalCoordinatesAndOffsetsPreserved','capturedReferencePreserved','draftAndLegendOnEveryPage','pageNumbersComplete','textInsideMargins','activeContentAbsent','a4Landscape'])assert.equal(pdf[key],true)
    assert.equal(pdf.pages,directory==='drainage-native-pdf'?15:2); assert.equal(pdf.productionProof,false); assert.equal(pdf.fieldInstrumentProof,false)
    if(directory==='drainage-native-pdf')assert.equal(pdf.longNoteDistinctiveWordsPreserved,true)
    if(directory==='drainage-pdf-source-http') { assert.equal(pdf.fixtureProjectId,drainage.projectId); assert.equal(pdf.fixtureDefinitionId,drainage.definitionId) }
  }
  const generation=JSON.parse(readFileSync('test-results/drainage-native-pdf/generation.json','utf8'))
  assert.equal(generation.observations,25); assert.equal(generation.pages,15)
  for(const key of ['nativeVectorPdf','missingHeightFixture','missingControlFixture','failedShotFixture','longNoteFixture','legacyFixture','oversizedReportRejected','unsupportedCharactersRejectedWithoutLoss','fontCoverageHashVerified'])assert.equal(generation[key],true)
  assert.equal(checks.applicationTypes,true); assert.equal(checks.testTypes,true); assert.equal(checks.scopedLint,true); assert.equal(checks.unitTests.total,64); assert.equal(checks.unitTests.suites,7)
  const tests=JSON.parse(readFileSync('test-results/workflow-focused-tests.json','utf8'))
  assert.equal(tests.success,true); assert.equal(tests.numTotalTests,64); assert.equal(tests.numPassedTests,64); assert.equal(tests.numPassedTestSuites,7); assert.equal(tests.numFailedTests,0)
  assert.equal(createHash('sha256').update(readFileSync('test-results/workflow-focused-tests.json')).digest('hex'),checks.unitTests.resultSha256)
  const suitePaths=['src/lib/engineering/__tests__/projectDrainageEngine.test.ts','src/lib/reports/__tests__/projectSetoutHtml.test.ts','tests/project-setout-capture.test.ts','tests/project-setout-integrity.test.ts','tests/project-setout-export.test.ts','src/app/tools/contour-generator/__tests__/helpers.test.ts','src/app/tools/contour-generator/__tests__/generators.test.ts']
  assert.equal(tests.testResults.length,suitePaths.length)
  for(const path of suitePaths)assert.equal(tests.testResults.filter(test=>test.name.replaceAll('\\','/').endsWith('/'+path)&&test.status==='passed').length,1)
  for(const [kind,file] of Object.entries({typecheck:'.cache/release-verify/workflow-typecheck.log',lint:'.cache/release-verify/workflow-eslint.log'}))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),checks.commandLogHashes[kind])
  assert.ok(Object.values(checks.observedExitCodes).every(code=>code===0))
  const before = JSON.parse(docker(['inspect', ...names]))
  const old = before.find(c => c.Name === '/metardu-app'), oldEnv = environment(old)
  assert.equal(old.Image, baseline)
  assert.equal(old.State.Health.Status, 'healthy')
  assert.equal(oldEnv.METARDU_MCP_ENABLED, 'false')
  assert.notEqual(candidate.imageId, baseline)
  assert.equal(docker(['image', 'inspect', 'metardu-metardu-app:rollback-current', '--format', '{{.Id}}']), baseline)
  assert.equal(docker(['image', 'inspect', candidate.imageTag, '--format', '{{.Id}}']), candidate.imageId)
  const config = JSON.parse(docker(['compose', '-f', 'docker-compose.yml', 'config', '--format', 'json']))
  const next = config.services['metardu-app'].environment
  for (const [key, value] of Object.entries(next)) if (key !== 'METARDU_BUILD_SHA') assert.equal(String(value ?? ''), String(oldEnv[key] ?? ''), `Runtime setting changed: ${key}`)
  assert.equal(String(next.METARDU_MCP_ENABLED), 'false')
  const poolConfig = { host: '127.0.0.1', port: 5432, user: oldEnv.DB_USER, password: oldEnv.DB_PASSWORD, database: oldEnv.DB_NAME, connectionTimeoutMillis: 10000 }
  client = new pg.Client(poolConfig)
  await client.connect()
  const ledger = (await client.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows
  assert.equal(ledger.length, 109)
  assert.ok(computeDrift(collectFileMigrations(), ledger).ok)
  assert.equal(runtimeDatabaseRoleFailure((await client.query(RUNTIME_ROLE_QUERY)).rows[0]), null)
  await client.query('SELECT horizontal_crs,vertical_datum,fix_quality,accuracy_source,observation_source FROM survey_observations WHERE false')
  await client.query('SELECT metadata,revision FROM setout_points WHERE false')
  await client.end(); client = null
  const jobs = JSON.parse(docker(['exec', '-i', 'metardu-postgres', 'sh', '-c', 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], `BEGIN READ ONLY; SELECT jsonb_build_object('background',(SELECT count(*) FROM background_jobs WHERE status='running'),'render',(SELECT count(*) FROM render_jobs WHERE status='running'),'drone',(SELECT count(*) FROM drone_processing_tasks WHERE status IN ('uploading','running','importing'))); ROLLBACK;`))
  assert.ok(Object.values(jobs).every(count => count === 0))
  result.before = before.map(snapshot); result.candidate = candidate; result.activeJobs = jobs; result.schemaEntries = 109
  const release = `working-tree-${candidate.sourceSha256.slice(0, 16)}`
  writeFileSync(override, `services:\n  metardu-app:\n    image: metardu-metardu-app:candidate\n    environment:\n      METARDU_BUILD_SHA: ${release}\n`)
  writeFileSync(rollbackOverride, `services:\n  metardu-app:\n    image: metardu-metardu-app:rollback-current\n    environment:\n      METARDU_BUILD_SHA: ${oldEnv.METARDU_BUILD_SHA}\n`)
  phase('source proof, candidate, current rollback, configuration, 109 hashes, restricted role and required columns reviewed')
  result.recoveryReview = { priorActualRestore: 'docs/RECOVERY_AND_MIGRATION_REVIEW_2026-10-10.md', noSchemaChange: true, latestArchiveWillBeChecked: true, latestArchiveRestoreNotClaimed: true }
  if (!process.argv.includes('--execute')) { result.status = 'prepared'; save(); console.log('Prepared only; --execute is required.'); process.exit(0) }
  const logs = spawnSync('docker', ['logs', '--timestamps', 'metardu-app'], { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 10 * 1024 * 1024 })
  assert.equal(logs.status, 0)
  docker(['exec', '-i', 'metardu-backup', 'bash', '-c', 'set -o noclobber; umask 077; cat > /backups/app_before_workflow_source_20261011.log'], logs.stdout + logs.stderr)
  changed = true
  docker(['stop', '--timeout', '20', 'metardu-app'], undefined, 40000)
  const backup = docker(['exec', '-e', 'BACKUP_RETENTION=36500', 'metardu-backup', '/app/scripts/backup.sh'], undefined, 60000)
  assert.ok(backup.includes('Backup integrity verified.') && backup.includes('Backup complete.'))
  result.checkpoint = { database: backup.match(/Database backup: (\/backups\/db_[0-9_]+\.sql\.gz)/)?.[1], uploads: backup.match(/Uploads backup: (\/backups\/uploads_[0-9_]+\.tar\.gz)/)?.[1], originalArchivesPreserved: true, separatelyRestored: false }
  assert.ok(result.checkpoint.database && result.checkpoint.uploads)
  phase('private logs and fresh archive/header checkpoint retained; only app stopped')
  docker(['compose', '-f', 'docker-compose.yml', '-f', override, 'up', '-d', '--no-deps', '--no-build', '--force-recreate', '--wait', '--wait-timeout', '120', 'metardu-app'], undefined, 150000)
  const after = JSON.parse(docker(['inspect', ...names])), app = after.find(c => c.Name === '/metardu-app')
  assert.equal(app.Image, candidate.imageId); assert.equal(app.State.Health.Status, 'healthy')
  assert.equal(environment(app).METARDU_MCP_ENABLED, 'false')
  for (const previous of before) { const current = after.find(c => c.Name === previous.Name); assert.deepEqual(mounts(current), mounts(previous)); if (previous.Name !== '/metardu-app') { assert.equal(current.Id, previous.Id); assert.equal(current.Image, previous.Image); assert.equal(current.State.StartedAt, previous.State.StartedAt) } }
  client = new pg.Client(poolConfig); await client.connect()
  assert.deepEqual((await client.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows, ledger)
  assert.equal(runtimeDatabaseRoleFailure((await client.query(RUNTIME_ROLE_QUERY)).rows[0]), null)
  await client.end(); client = null
  const health = await fetch('http://localhost:3000/api/public/health', { signal: AbortSignal.timeout(15000) }), body = await health.json()
  assert.equal(health.status, 200); assert.equal(body.status, 'healthy'); assert.equal(body.releaseId, release); assert.equal(health.headers.get('X-METARDU-Release'), release)
  docker(['image', 'tag', app.Image, 'metardu-metardu-app:latest'])
  result.after = after.map(snapshot); result.applicationAfter = snapshot(app); result.health = { status: body.status, releaseId: body.releaseId }; result.customerMcpEnabled = false
  result.status = 'promoted'; changed = false
  phase('current app healthy with exact release identity; schema, mounts, supporting services and customer connector gate preserved')
} catch (error) {
  result.failure = { name: error.name, message: error instanceof assert.AssertionError ? 'Promotion assertion failed; inspect the recorded phase' : error.message }
  result.status = changed ? 'promotion-failed' : 'blocked-before-mutation'
  if (changed) {
    try {
      const current = JSON.parse(docker(['inspect', 'metardu-app']))[0]
      if (current.Image === baseline && current.State.Running === true && current.State.Health?.Status === 'healthy') result.status = 'baseline-retained'
      else {
        docker(['compose', '-f', 'docker-compose.yml', '-f', rollbackOverride, 'up', '-d', '--no-deps', '--no-build', '--force-recreate', '--wait', '--wait-timeout', '120', 'metardu-app'], undefined, 150000)
        result.status = 'rolled-back'; result.rollbackImage = baseline
      }
    } catch { result.status = 'maintenance-failure' }
  }
  console.error(result.failure.message); process.exitCode = 1
} finally { try { await client?.end() } catch {} save() }
