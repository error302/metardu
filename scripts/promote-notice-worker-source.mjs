// One app-only promotion from the verified 0e488 production baseline.
// No migrations, provisioner, supporting-service restarts, or MCP enablement.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { collectFileMigrations, computeDrift, RUNTIME_ROLE_QUERY, runtimeDatabaseRoleFailure } from './verify-migrations.mjs'

const root = 'test-results/notice-worker-release'
const baseline = 'sha256:0e488fe044a9892a4a10ef802d05387a8f1ae58adfc46d2f28278c031a44f080'
const names = ['metardu-app', 'metardu-postgres', 'metardu-redis', 'metardu-worker', 'metardu-collaboration', 'metardu-ntrip', 'metardu-backup']
const override = '.cache/release-verify/notice-worker-promotion.override.yml'
const rollbackOverride = '.cache/release-verify/notice-worker-rollback.override.yml'
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
  const proofFiles=['test-results/notice-worker-source-tests.json','test-results/notice-worker-lint.json','.cache/release-verify/notice-worker-typecheck.log','test-results/tin-mobile-source-browser/worker.json','test-results/tin-mobile-source-browser/worker.jpg','test-results/tin-mobile-source-browser/login-mobile.json','test-results/tin-mobile-source-browser/login-mobile.jpg','test-results/tin-mobile-source-browser/map-mobile.json','test-results/tin-mobile-source-browser/map-mobile.jpg','test-results/chatgpt-notice-source/http.json','test-results/chatgpt-notice-source/browser.json','test-results/chatgpt-notice-source/notice.jpg','scripts/publish-chatgpt-notice.mjs']
  assert.deepEqual(Object.keys(checks.artifactAssociation.files).sort(),proofFiles.sort())
  const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex')
  for(const [file,sha] of Object.entries(checks.artifactAssociation.files))assert.equal(digest(file),sha,'Verification artifact changed: '+file)
  const suitePaths=['src/lib/chatgpt/notice.test.ts','src/lib/chatgpt/config.test.ts','src/lib/chatgpt/oauth.test.ts','tests/chatgpt/config.test.ts','src/lib/chatgpt/server.test.ts','tests/chatgpt/connection-page.test.tsx','tests/map-north-readiness.test.tsx','src/lib/workers/__tests__/tinWorkerExecution.test.ts','src/lib/workers/__tests__/tinWorkerClient.test.ts','src/app/tools/contour-generator/__tests__/helpers.test.ts','src/app/tools/contour-generator/__tests__/generators.test.ts']
  assert.deepEqual([...checks.suitePaths].sort(),suitePaths.sort())
  assert.deepEqual(Object.keys(checks.testSourceHashes).sort(),[...suitePaths,'jest.config.js','tsconfig.tests.json','tests/fixtures/chatgptNotice.ts','tests/__mocks__/tinWorkerFactory.ts'].sort())
  for(const [file,sha] of Object.entries(checks.testSourceHashes))assert.equal(digest(file),sha,'Test source changed: '+file)
  const tests=JSON.parse(readFileSync('test-results/notice-worker-source-tests.json','utf8'))
  assert.equal(tests.success,true);assert.equal(tests.numTotalTests,87);assert.equal(tests.numPassedTests,87);assert.equal(tests.numPassedTestSuites,11);assert.equal(tests.numFailedTests,0);assert.equal(tests.testResults.length,11)
  for(const path of suitePaths)assert.equal(tests.testResults.filter(test=>test.name.replaceAll('\\','/').endsWith('/'+path)&&test.status==='passed').length,1)
  assert.equal(checks.applicationTypes,true);assert.equal(checks.testTypes,true);assert.equal(checks.scopedLint,true);assert.deepEqual(checks.observedExitCodes,{unitTests:0,typecheck:0,scopedLint:0})
  const lint=JSON.parse(readFileSync('test-results/notice-worker-lint.json','utf8'));assert.equal(lint.length,28);assert.ok(lint.every(file=>file.errorCount===0&&file.warningCount===0&&file.fatalErrorCount===0))
  const types=readFileSync('.cache/release-verify/notice-worker-typecheck.log','utf8');assert.ok(types.includes('typecheck:app')&&types.includes('typecheck:tests'));assert.ok(!/error TS\d+/.test(types))
  const worker=JSON.parse(readFileSync('test-results/tin-mobile-source-browser/worker.json','utf8'));assert.equal(worker.origin,'http://127.0.0.1:3021/tools/contour-generator');assert.equal(worker.workerText,'Calculated in the background worker.');assert.ok(/Contour Lines\s+14/.test(worker.text)&&/TIN Triangles\s+8/.test(worker.text));assert.ok(!worker.logs.some(log=>/TIN worker crashed|TIN worker timed out/.test(log.message)))
  const login=JSON.parse(readFileSync('test-results/tin-mobile-source-browser/login-mobile.json','utf8'));assert.equal(login.width,390);assert.equal(login.scrollWidth,390);assert.equal(login.forgot[0].height,44);assert.equal(login.remember[0].height,44)
  const map=JSON.parse(readFileSync('test-results/tin-mobile-source-browser/map-mobile.json','utf8'));assert.equal(map.viewport.width,390);assert.equal(map.scrollWidth,map.width);assert.equal(map.tools.length,6);assert.ok(map.tools.every(tool=>tool.height>=44&&tool.width>=44));assert.equal(map.tools.filter(tool=>tool.label==='True North').length,1);assert.equal(map.offline[0].height,44);assert.equal(map.offline[0].width,44);assert.ok(map.offline[0].bounds.bottom<map.map.bottom)
  const notice=JSON.parse(readFileSync('test-results/chatgpt-notice-source/http.json','utf8'));assert.equal(notice.base,'http://127.0.0.1:3021');assert.equal(notice.notice.state,'unpublished');assert.equal(notice.notice.eligible,false);assert.equal(notice.notice.linkingConfigured,false);assert.equal(notice.notice.publishedAt,null);assert.equal(notice.notice.eligibleAt,null);assert.equal(notice.notice.contentSha256,checks.noticeContentSha256);assert.equal(notice.homeBannerVisible,true);assert.equal(notice.mcpStatus,503);assert.equal(notice.productionMutated,false);assert.equal(notice.externalMessagesSent,0)
  const content=JSON.parse(readFileSync('src/lib/chatgpt/noticeContent.json','utf8'));assert.equal(checks.noticeVersion,content.version);assert.equal(checks.noticeContentSha256,createHash('sha256').update(content.version+'\n'+content.title+'\n'+content.paragraphs.join('\n\n')).digest('hex'))
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
  docker(['exec', '-i', 'metardu-backup', 'bash', '-c', 'set -o noclobber; umask 077; cat > /backups/app_before_notice_worker_20261011.log'], logs.stdout + logs.stderr)
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
