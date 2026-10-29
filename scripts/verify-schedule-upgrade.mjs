// Native migration admission only. Never connects to production, copies customer
// data, edits migration SQL, starts services, or authorizes a release by itself.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { migrationChecksums, computeDrift } from './verify-migrations.mjs'
import { SCHEDULE_UPGRADE_VERSION } from './schedule-upgrade-contract.mjs'
import {runScheduleRuntimeChecks} from './check-schedule-runtime.mjs'
import {readScheduleSchemaContract,assertScheduleSchemaContract} from './schedule-schema-contract.mjs'
import { snapshotExistingRows } from './release-row-snapshot.mjs'

const pendingVersions = [SCHEDULE_UPGRADE_VERSION]
const database = 'metardu_schedule_upgrade_verify'
const fixtureName = 'metardu-schema-rehearsal-20261008'
const fixtureId = 'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0'
const bootstrapUrl = 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify'
const bootstrapMarker = 'METARDU synthetic beacon verification only 2026-10-08'
const hash = value => createHash('sha256').update(value).digest('hex')

export function scheduleUpgradeTarget(value) {
  const url = new URL(value)
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol))
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.port, '55433')
  assert.equal(url.pathname, '/metardu_runtime_verify')
  assert.equal(url.search, '')
  assert.equal(url.hash, '')
  url.pathname = '/' + database
  return url.toString()
}

export function scheduleUpgradeRegistry(files) {
  assert.equal(files.length, 129, 'Review a changed source registry before rehearsing.')
  assert.equal(new Set(files.map(file => file.version)).size, files.length)
  const pending = files.filter(file => Number(file.version.split('_')[0]) > 123)
  assert.deepEqual(pending.map(file => file.version), pendingVersions)
  const baseline = files.filter(file => !pending.includes(file))
  assert.equal(baseline.length, 128)
  assert.ok(baseline.every(file => /^\d{3}_[a-z0-9_]+$/.test(file.version) && Number(file.version.split('_')[0]) <= 123))
  return { baseline, pending }
}

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024, ...options })
  assert.equal(result.status, 0, `${binary} ${args[0]} failed; credential-bearing output suppressed.`)
  return result.stdout
}

async function main() {
  const revision = process.argv[2]
  assert.equal(process.argv.length, 3, 'Supply one full pinned source commit.')
  assert.match(revision ?? '', /^[a-f0-9]{40}$/)
  const { default: pg } = await import('pg')
  const root = process.cwd()
  const git = args => command('git', ['-c', 'core.fsmonitor=false', ...args])
  assert.equal(git(['rev-parse', 'HEAD']).trim(), revision)
  assert.equal(git(['diff', '--name-only', revision, '--', 'src/lib/db/migrations', 'scripts/migrate-unified.mjs', 'scripts/verify-migrations.mjs', 'scripts/provision-runtime-db-role.mjs', 'scripts/check-schedule-runtime.mjs', 'src/lib/schedule', 'src/lib/notifications']).trim(), '', 'The migration implementation must match the pinned commit.')
  const inspected = JSON.parse(command('docker', ['inspect', fixtureName]))[0]
  assert.equal(inspected.Id, fixtureId)
  assert.equal(inspected.Config.Labels['metardu.purpose'], 'schema-rehearsal')
  assert.equal(inspected.State.Running, true)
  assert.deepEqual(inspected.NetworkSettings.Ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '55433' }])
  const files = git(['ls-tree', '-r', '--name-only', revision, 'src/lib/db/migrations']).trim().split('\n').filter(file => file.endsWith('.sql')).sort().map(path => {
    const content = git(['show', `${revision}:${path}`])
    return { path, content, version: path.split('/').at(-1).slice(0, -4), ...migrationChecksums(Buffer.from(content)) }
  })
  const { baseline, pending } = scheduleUpgradeRegistry(files)
  const namespace = join(root, '.cache', 'schedule-upgrade', revision)
  mkdirSync(namespace, { recursive: true })
  const directory = join(namespace, 'attempt-' + randomUUID())
  const reportPath = join(directory, 'verification.json')
  assert.equal(existsSync(directory), false, 'Never overwrite an attempted rehearsal.')
  mkdirSync(directory)
  const marker = `METARDU disposable schedule upgrade ${randomUUID()}`
  const runtimeRole = 'schedule_upgrade_' + randomBytes(6).toString('hex')
  const runtimePassword = randomBytes(24).toString('hex')
  const report = { revision, verifierSha256: hash(readFileSync(process.argv[1])), verifierContractSha256: hash(readFileSync(join(root, 'scripts/schedule-upgrade-contract.mjs'))), preservationHelperSha256: hash(readFileSync(join(root, 'scripts/release-row-snapshot.mjs'))), startedAt: new Date().toISOString(), status: 'checking', sourceBaseline: 128, targetLedgerCount: 129, pending: pending.map(file => file.version), sourceRegistry: files.map(({ version, checksum }) => ({ version, checksum })), customerDataCopied: false, productionMutated: false, newContainer: false, syntheticDatabase: database, syntheticRuntimeRole: runtimeRole, checks: [], variants: [], cleanup: {} }
  const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  const check = name => { report.checks.push({ name, passed: true }); save(); console.log('PASS ' + name) }
  const stage = (name, selected) => {
    const source = join(directory, name)
    for (const file of selected) {
      const destination = join(source, file.path)
      mkdirSync(resolve(destination, '..'), { recursive: true })
      writeFileSync(destination, file.content, { flag: 'wx' })
    }
    mkdirSync(join(source, 'scripts'), { recursive: true })
    for (const script of ['migrate-unified.mjs', 'verify-migrations.mjs', 'provision-runtime-db-role.mjs']) writeFileSync(join(source, 'scripts', script), git(['show', `${revision}:scripts/${script}`]), { flag: 'wx' })
    return source
  }
  const stages = { baseline: stage('baseline', baseline), full: stage('full', files) }
  const cleanEnv = { ...process.env }
  for (const filename of readdirSync(root).filter(name => /^\.env(?:\.|$)/.test(name))) for (const line of readFileSync(join(root, filename), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    if (match) cleanEnv[match[1]] = ''
  }
  const bootstrap = new URL(bootstrapUrl)
  const targetUrl = scheduleUpgradeTarget(bootstrapUrl)
  const env = { ...cleanEnv, DATABASE_URL: '', MIGRATIONS_DIR: '', MIGRATION_DB_HOST: '127.0.0.1', MIGRATION_DB_PORT: '55433', MIGRATION_DB_NAME: database, MIGRATION_DB_USER: bootstrap.username, MIGRATION_DB_PASSWORD: bootstrap.password, APP_DB_HOST: '127.0.0.1', APP_DB_PORT: '55433', APP_DB_NAME: database, APP_DB_USER: runtimeRole, APP_DB_PASSWORD: runtimePassword, NODE_ENV: 'production' }
  const provision = (stageName, name, failure) => {
    const source = stages[stageName]
    const result = spawnSync(process.execPath, [join(source, 'scripts/provision-runtime-db-role.mjs')], { cwd: source, env, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024 })
    writeFileSync(join(directory, name + '.log'), (result.stdout ?? '') + (result.stderr ?? ''), { flag: 'wx' })
    assert.equal(result.error, undefined, 'Provisioner execution failed; inspect private log.')
    if (failure) {
      assert.notEqual(result.status, 0, 'Unsafe legacy data must stop the upgrade.')
      assert.match(result.stdout + result.stderr, failure)
    } else assert.equal(result.status, 0, `Normal ${name} failed; inspect the private log.`)
  }
  const admin = new pg.Client({ connectionString: bootstrapUrl, connectionTimeoutMillis: 5000 })
  let target, runtime, created = false, roleOwned = false
  await admin.connect()
  save()
  const databaseMarker = async () => (await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1", [database])).rows[0]?.marker
  const dropOwnedDatabase = async () => {
    assert.equal(await databaseMarker(), marker)
    await admin.query(`DROP DATABASE ${database}`)
    created = false
  }
  try {
    assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker, bootstrapMarker)
    assert.equal((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [runtimeRole])).rowCount, 0)
    for (const variant of ['canonical','existing_schedule_table']) {
      assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount,0,'Never replace an existing database')
      await admin.query('CREATE DATABASE '+database+' TEMPLATE template0');created=true
      await admin.query("COMMENT ON DATABASE "+database+" IS '"+marker+"'")
      target=new pg.Client({connectionString:targetUrl,connectionTimeoutMillis:5000});await target.connect()
      roleOwned=true;provision('baseline',variant+'-baseline')
      const ledger=async()=>(await target.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows
      const before=await ledger();assert.equal(before.length,128);assert.ok(computeDrift(baseline,before).ok)
      const owner=randomUUID(),project=randomUUID(),book=randomUUID()
      await target.query("INSERT INTO users(id,email,password_hash,full_name)VALUES($1,$2,'unusable-synthetic','SYNTHETIC schedule upgrade')",[owner,owner+'@example.invalid'])
      await target.query("INSERT INTO projects(id,user_id,name,survey_type)VALUES($1,$2,'SYNTHETIC retained café 零','topo')",[project,owner])
      await target.query("INSERT INTO fieldbooks(id,project_id,user_id,name,data,created_at)VALUES($1,$2,$3,'SYNTHETIC original','{\"zero\":0,\"unknown\":null}','2020-01-02T03:04:05Z')",[book,project,owner])
      if(variant==='existing_schedule_table'){
        await target.query('CREATE TABLE public.job_schedule (sentinel TEXT)')
        await target.query("INSERT INTO public.job_schedule VALUES('SYNTHETIC existing schema must survive')")
      }
      const original=await snapshotExistingRows(target)
      provision('full',variant+'-forward',variant==='existing_schedule_table'?/job_schedule.*already exists|already exists.*job_schedule/s:undefined)
      const after=await ledger()
      assert.deepEqual(after.filter(row=>before.some(old=>old.version===row.version)),before)
      assert.deepEqual((await snapshotExistingRows(target,original.catalog)).rows,original.rows)
      check(variant+': all 128 historical hashes and original rows including NULL, zero, Unicode and timestamps are unchanged')
      if(variant==='existing_schedule_table'){
        assert.deepEqual(after,before)
        assert.equal((await target.query("SELECT to_regclass('public.survey_reminder_outbox') value")).rows[0].value,null)
        check('existing_schedule_table: incompatible prior table stops normal migration atomically without overwriting retained data')
      }else{
        assert.equal(after.length,129);assert.ok(computeDrift(files,after).ok)
        provision('full',variant+'-idempotent');assert.deepEqual(await ledger(),after)
        check('canonical: normal 128-to-129 provisioner and idempotent rerun pass')
        const tables=['job_schedule','survey_push_subscriptions','survey_reminder_outbox','survey_push_deliveries']
        assert.equal((await target.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1) AND c.relrowsecurity",[tables])).rows[0].n,4)
        check('canonical: all four new tables enforce row-level security')
        assertScheduleSchemaContract(await readScheduleSchemaContract(target,runtimeRole))
        check('canonical: runtime table privileges, project binding and RLS contract are verified before application admission')
        const runtimeUrl=new URL(targetUrl);runtimeUrl.username=runtimeRole;runtimeUrl.password=runtimePassword
        await runScheduleRuntimeChecks({runtimeUrl:runtimeUrl.href,admin:target,check})
        Object.assign(report,{restrictedRoleVerified:true,scheduleLifecycleVerified:true,reminderDeliveryVerified:true})
      }
      report.variants.push(variant);save();await target.end();target=null;await dropOwnedDatabase()
    }
    Object.assign(report,{status:'passed',originalValuesPreserved:true,historicalHashesPreserved:true,normalRuntimeProvisioning:true,incompatibleDataRejected:true})
  } catch (error) {
    report.status = 'failed'
    // Native errors contain only synthetic fixture values. Credentials and
    // subprocess output remain private and are never copied into this receipt.
    report.failure = { name: error.name, code: error.code, message: error.message }
    throw error
  } finally {
    if (runtime) await runtime.end()
    if (target) await target.end()
    if (created) await dropOwnedDatabase()
    report.cleanup.syntheticDatabaseRemoved = (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount === 0
    if (roleOwned) await admin.query(`DROP ROLE "${runtimeRole}"`)
    report.cleanup.syntheticRoleRemoved = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [runtimeRole])).rowCount === 0
    report.finishedAt = new Date().toISOString()
    await admin.end()
    save()
  }
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, variants: report.variants, cleanup: report.cleanup, reportPath }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
