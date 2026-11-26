// Mutating rehearsal scripts accept only explicit loopback test databases.
// Never fall back to DATABASE_URL, DB_*, .env, or deployment credentials.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

export const RECOVERY_REPORT_SCOPE='Actual named backup recovery and upgrade; customer production data and uploads are read-only; temporary recovery state is confined to the isolated rehearsal/backup service'
export const RECOVERY_PYTHON_ENV='METARDU_RECOVERY_PYTHON'

function defaultPythonProbe(command) {
  const result=spawnSync(command,['-c','import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)'],{
    encoding:'utf8',
    windowsHide:true,
    timeout:10_000,
    stdio:'ignore',
  })
  return !result.error&&result.status===0
}

export function resolveRecoveryPython({env=process.env,platform=process.platform,probe=defaultPythonProbe}={}) {
  assert.ok(env&&typeof env==='object'&&!Array.isArray(env),'Recovery Python environment must be an object.')
  assert.equal(typeof probe,'function','Recovery Python availability probe must be a function.')
  const override=String(env[RECOVERY_PYTHON_ENV]??'').trim()
  const candidates=override
    ? [override]
    : platform==='win32' ? ['python','python3'] : ['python3','python']
  for(const candidate of candidates)if(probe(candidate))return candidate
  throw new Error(`Recovery Python interpreter is unavailable. Set ${RECOVERY_PYTHON_ENV} to a working Python 3 interpreter.`)
}

// This is the reviewed executable closure for the fresh-recovery proof. Keep
// it explicit: migrations are covered separately by the exact source registry.
export const RECOVERY_PROOF_SOURCE_FILES=Object.freeze([
  'scripts/verify-fresh-recovery.mjs',
  'scripts/rehearsal-database.mjs',
  'scripts/verify-migrations.mjs',
  'scripts/provision-runtime-db-role.mjs',
  'scripts/migrate-unified.mjs',
  'scripts/verify-organization-project-rls.mjs',
  'scripts/recovery-archive-manifest.py',
])

export function recoveryMigrationsDirectory(root=process.cwd()) {
  return resolve(root,'src','lib','db','migrations')
}

export function recoveryChildEnvironment(overrides={},base=process.env) {
  assert.ok(overrides&&typeof overrides==='object'&&!Array.isArray(overrides),'Recovery child environment overrides must be an object.')
  assert.ok(base&&typeof base==='object'&&!Array.isArray(base),'Recovery child environment base must be an object.')
  return {...base,...overrides,MIGRATIONS_DIR:''}
}

export function recoveryStatusAfterCleanup(status,cleanup) {
  assert.ok(typeof status==='string'&&status.length>0,'Recovery status is required.')
  assert.ok(cleanup&&typeof cleanup==='object'&&!Array.isArray(cleanup),'Recovery cleanup evidence is required.')
  return Object.values(cleanup).some(value=>value!==true)?'cleanup-failed':status
}

export function pinnedRehearsalIdentity(revision) {
  if(!/^[a-f0-9]{40}$/.test(revision))throw new Error('A full source revision is required for isolated rehearsal.')
  return {database:`metardu_release_${revision}`,runtimeRole:`metardu_release_app_${revision}`,
    marker:`METARDU synthetic pinned release only ${revision}`}
}

export function createRecoveryRoleOwnership(runId) {
  assert.match(runId,/^[a-f0-9]{32}$/,'Recovery role ownership requires a run-scoped 32-hex identifier.')
  const runtimeRole=`metardu_recovery_app_${runId}`
  assert.ok(runtimeRole.length<=63,'Recovery runtime role exceeds the PostgreSQL identifier limit.')
  return {runtimeRole,ownedRoles:new Set()}
}

export function ownRecoveryRole(ownership,role) {
  assert.ok(ownership&&ownership.ownedRoles instanceof Set,'Recovery role ownership is required.')
  assert.match(role,/^[a-z_][a-z0-9_]{0,62}$/i,'Recovery roles must be simple PostgreSQL identifiers.')
  ownership.ownedRoles.add(role)
  return ownership
}

export function recoveryRolesForCleanup(ownership,{databaseCreated=false,databaseRemoved=false}={}) {
  assert.ok(ownership&&ownership.ownedRoles instanceof Set,'Recovery role ownership is required.')
  const owned=[...ownership.ownedRoles]
  const runtime=ownership.runtimeRole
  const compatibility=owned.filter(role=>role!==runtime).reverse()
  const mayDropCompatibility=!databaseCreated||databaseRemoved
  return [...(owned.includes(runtime)?[runtime]:[]),...(mayDropCompatibility?compatibility:[])]
}

export function isolatedRehearsalCompatibilityRoleDefinitions() {
  return [
    {name:'authenticated',login:false,superuser:false,bypassRls:false},
    {name:'anon',login:false,superuser:false,bypassRls:false},
    {name:'service_role',login:false,superuser:false,bypassRls:false},
  ]
}

export function createIsolatedRehearsalRoleOwnership(runtimeRole) {
  assert.match(runtimeRole??'',/^[a-z_][a-z0-9_]{0,62}$/i,'The isolated rehearsal requires a simple runtime role name.')
  return {runtimeRole,ownedRoles:new Set()}
}

function assertCompatibilityRoleAttributes(definition,row) {
  assert.ok(row&&typeof row==='object','Compatibility role evidence must be an object.')
  assert.equal(row.rolname,definition.name,`Compatibility role ${definition.name} has an unexpected identity.`)
  assert.equal(row.rolcanlogin,definition.login,`Compatibility role ${definition.name} must not be a login.`)
  assert.equal(row.rolsuper,definition.superuser,`Compatibility role ${definition.name} must not be a superuser.`)
  assert.equal(row.rolbypassrls,definition.bypassRls,`Compatibility role ${definition.name} must not bypass RLS.`)
  return row
}

export function recordIsolatedRehearsalCompatibilityRoles(rows) {
  assert.ok(Array.isArray(rows),'Compatibility role rows must be an array.')
  const definitions=isolatedRehearsalCompatibilityRoleDefinitions()
  const byName=new Map(rows.map(row=>[row?.rolname,row]))
  const existing=[]
  for(const definition of definitions) {
    const row=byName.get(definition.name)
    if(row) {
      assertCompatibilityRoleAttributes(definition,row)
      existing.push(definition.name)
    }
  }
  return {
    existing,
    missing:definitions.filter(definition=>!existing.includes(definition.name)).map(definition=>definition.name),
  }
}

export function ownIsolatedRehearsalCompatibilityRoles(ownership,{before,after}={}) {
  assert.ok(ownership&&typeof ownership==='object'&&ownership.ownedRoles instanceof Set,'Isolated rehearsal role ownership is required.')
  assert.ok(before&&typeof before==='object'&&Array.isArray(before.existing)&&Array.isArray(before.missing),'Pre-migration compatibility role evidence is required.')
  assert.ok(Array.isArray(after),'Post-migration compatibility role rows are required.')
  const definitions=isolatedRehearsalCompatibilityRoleDefinitions()
  const afterByName=new Map(after.map(row=>[row?.rolname,row]))
  for(const definition of definitions) {
    if(!before.missing.includes(definition.name))continue
    const row=afterByName.get(definition.name)
    if(!row)continue
    assertCompatibilityRoleAttributes(definition,row)
    ownRecoveryRole(ownership,definition.name)
  }
  return ownership
}

export async function cleanupIsolatedRehearsalRoles({
  ownership,
  before,
  databaseCreated,
  databaseRemoved,
  runtimeRoleAbsentBefore,
  listRoles,
  dropRole,
}={}) {
  assert.ok(ownership&&typeof ownership==='object'&&ownership.ownedRoles instanceof Set,'Isolated rehearsal role ownership is required.')
  assert.ok(before&&typeof before==='object'&&Array.isArray(before.existing)&&Array.isArray(before.missing),'Pre-migration compatibility role evidence is required.')
  assert.equal(typeof runtimeRoleAbsentBefore,'boolean','The pre-migration runtime-role absence must be recorded.')
  assert.equal(typeof listRoles,'function','A role listing function is required.')
  assert.equal(typeof dropRole,'function','A role cleanup function is required.')

  const currentRows=await listRoles()
  assert.ok(Array.isArray(currentRows),'Current isolated rehearsal role rows must be an array.')
  ownIsolatedRehearsalCompatibilityRoles(ownership,{before,after:currentRows})
  if(runtimeRoleAbsentBefore&&currentRows.some(row=>row?.rolname===ownership.runtimeRole)) {
    ownRecoveryRole(ownership,ownership.runtimeRole)
  }

  const removed=recoveryRolesForCleanup(ownership,{databaseCreated,databaseRemoved})
  for(const role of removed)await dropRole(role)

  const remainingRows=await listRoles()
  assert.ok(Array.isArray(remainingRows),'Remaining isolated rehearsal role rows must be an array.')
  const remainingByName=new Map(remainingRows.map(row=>[row?.rolname,row]))
  for(const role of removed) {
    assert.equal(remainingByName.has(role),false,`Run-owned isolated rehearsal role ${role} was not removed.`)
  }
  const retained=[]
  for(const name of before.existing) {
    const row=remainingByName.get(name)
    assert.ok(row,`Pre-existing isolated rehearsal role ${name} must be retained.`)
    const definition=isolatedRehearsalCompatibilityRoleDefinitions().find(value=>value.name===name)
    assertCompatibilityRoleAttributes(definition,row)
    retained.push(name)
  }
  return {
    removed:[...removed],
    retained,
    owned:[...ownership.ownedRoles],
  }
}

// Git stores these reviewed text sources as LF blobs. A Windows checkout may
// materialize the Python helper as CRLF, so compare canonical LF text bytes.
export function recoveryProofSourceHashes(contentsByPath) {
  assert.ok(contentsByPath&&typeof contentsByPath==='object'&&!Array.isArray(contentsByPath),'Recovery proof source contents are required.')
  const files=[...RECOVERY_PROOF_SOURCE_FILES]
  assert.deepEqual(Object.keys(contentsByPath).sort(),files.sort(),'Recovery proof source contents must cover exactly the reviewed closure.')
  const hashes={}
  for(const file of files) {
    const content=contentsByPath[file]
    assert.ok(typeof content==='string'||Buffer.isBuffer(content)||content instanceof Uint8Array,`Recovery proof source ${file} must be text bytes.`)
    const canonical=Buffer.from(content).toString('utf8').replace(/\r\n/g,'\n')
    hashes[file]=createHash('sha256').update(canonical,'utf8').digest('hex')
  }
  return hashes
}

export function assertRecoveryProofSourceHashes(actual,expected) {
  assert.ok(actual&&typeof actual==='object'&&!Array.isArray(actual),'Recovery evidence proof-source hashes are required.')
  assert.ok(expected&&typeof expected==='object'&&!Array.isArray(expected),'Candidate proof-source hashes are required.')
  const files=[...RECOVERY_PROOF_SOURCE_FILES]
  assert.deepEqual(Object.keys(actual).sort(),files.sort(),'Recovery evidence must bind exactly the reviewed proof-source closure.')
  for(const file of files)assert.match(actual[file]??'',/^[a-f0-9]{64}$/,`Recovery evidence proof-source hash for ${file} is invalid.`)
  assert.deepEqual(actual,expected,'Recovery evidence proof-source hashes must match the pinned candidate revision.')
  return actual
}
const REHEARSAL_DATABASES = new Set(['metardu_release_rehearsal', 'metardu_e2e', 'metardu_runtime_verify'])
const PRODUCTION_CONTAINERS = new Set([
  'metardu-app', 'metardu-postgres', 'metardu-redis', 'metardu-worker',
  'metardu-collaboration', 'metardu-ntrip', 'metardu-backup', 'metardu-db-migrate',
])

export function parseRehearsalServiceIdentity(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Rehearsal service identity must be an object.')
  const identity = {
    container: value.container,
    containerId: value.containerId,
    purpose: value.purpose,
    network: value.network,
    hostIp: value.hostIp,
    hostPort: value.hostPort,
    database: value.database,
    marker: value.marker,
    volume: value.volume,
  }
  assert.match(identity.container, /^[a-z0-9][a-z0-9_.-]{0,127}$/)
  assert.ok(!PRODUCTION_CONTAINERS.has(identity.container), 'A production container cannot be used as a rehearsal service.')
  assert.match(identity.containerId, /^[a-f0-9]{64}$/)
  assert.equal(identity.purpose, 'schema-rehearsal')
  assert.match(identity.network, /^[a-z0-9][a-z0-9_.-]{0,127}$/)
  assert.notEqual(identity.network, 'metardu_default', 'The rehearsal service must use an isolated network.')
  assert.equal(identity.hostIp, '127.0.0.1')
  assert.equal(identity.hostPort, 55433)
  assert.ok(REHEARSAL_DATABASES.has(identity.database), 'The rehearsal control database is not allowlisted.')
  assert.match(identity.marker, /^METARDU synthetic [a-z0-9][a-z0-9 -]{0,120}$/)
  assert.match(identity.volume, /^[a-z0-9][a-z0-9_.-]{0,127}$/)
  return identity
}

export function assertRehearsalServiceIdentity(identityValue, container) {
  const identity = parseRehearsalServiceIdentity(identityValue)
  assert.ok(container && typeof container === 'object', 'The inspected rehearsal container is required.')
  assert.equal(container.Id, identity.containerId, 'The rehearsal container identity changed.')
  assert.equal(container.Name, '/' + identity.container)
  assert.equal(container.State?.Running, true, 'The rehearsal container must be running.')
  assert.equal(container.Config?.Labels?.['metardu.purpose'], identity.purpose)
  assert.ok(!container.Config?.Labels?.['com.docker.compose.service'], 'The rehearsal service cannot be a Compose application service.')
  assert.deepEqual(container.NetworkSettings?.Ports?.['5432/tcp'], [{ HostIp: identity.hostIp, HostPort: String(identity.hostPort) }])
  const networks = Object.keys(container.NetworkSettings?.Networks ?? {}).sort()
  assert.deepEqual(networks, [identity.network], 'The rehearsal service must remain isolated on its configured network.')
  assert.equal(container.Mounts?.length, 1, 'The rehearsal service must have one owned data mount.')
  assert.equal(container.Mounts[0].Type, 'volume')
  assert.equal(container.Mounts[0].Name, identity.volume)
  assert.equal(container.Mounts[0].Destination, '/var/lib/postgresql/data')
  return identity
}

export function recoveryArchiveRoleDefinitions() {
  return [
    { name: 'metardu', login: false, superuser: true, bypassRls: false },
    { name: 'metardu_app', login: false, superuser: false, bypassRls: false },
    { name: 'authenticated', login: false, superuser: false, bypassRls: false },
    { name: 'anon', login: false, superuser: false, bypassRls: false },
    { name: 'service_role', login: false, superuser: false, bypassRls: false },
  ]
}

export function expectedToleranceProfileAdditions(sourceVersions, appliedVersions) {
  assert.ok(Array.isArray(sourceVersions) && Array.isArray(appliedVersions), 'Migration versions must be arrays.')
  const referenceProfileMigration = '068_background_jobs_and_observation_batches'
  return new Set(sourceVersions).has(referenceProfileMigration) && !new Set(appliedVersions).has(referenceProfileMigration) ? 1 : 0
}

export function parseRecoveryArchivePair(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Recovery archive selection must be an object.')
  const databaseArchive = value.databaseArchive
  const uploadsArchive = value.uploadsArchive
  assert.match(databaseArchive, /^\/backups\/db_([0-9]{8}_[0-9]{6})\.sql\.gz$/)
  assert.match(uploadsArchive, /^\/backups\/uploads_([0-9]{8}_[0-9]{6})\.tar\.gz$/)
  assert.equal(databaseArchive.match(/db_([0-9]{8}_[0-9]{6})/)[1], uploadsArchive.match(/uploads_([0-9]{8}_[0-9]{6})/)[1],
    'Recovery database and uploads archives must be one matching pair.')
  return { databaseArchive, uploadsArchive }
}

export function rehearsalDatabaseConfig() {
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL
    || 'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_release_rehearsal'
  const runtimeUrl = process.env.TEST_RUNTIME_DATABASE_URL
    || 'postgresql://release_app:local_release_runtime_only@127.0.0.1:55433/metardu_release_rehearsal'
  const parse = value => {
    let url
    try { url = new URL(value) } catch { throw new Error('Rehearsal database URL is invalid.') }
    const database = decodeURIComponent(url.pathname.slice(1))
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || !['metardu_release_rehearsal', 'metardu_e2e', 'metardu_runtime_verify'].includes(database)
      || url.search || url.hash) {
      throw new Error('Rehearsals require a loopback connection to an allowlisted disposable test database.')
    }
    return { url, database, role: decodeURIComponent(url.username) }
  }
  const admin = parse(adminUrl)
  const runtime = parse(runtimeUrl)
  if (admin.url.hostname !== runtime.url.hostname
    || (admin.url.port || '5432') !== (runtime.url.port || '5432')
    || admin.database !== runtime.database || admin.role === runtime.role
    || !/^[a-z_][a-z0-9_]{0,62}$/i.test(runtime.role)) {
    throw new Error('Rehearsals require separate admin/runtime roles on the same test database.')
  }
  return { adminUrl, runtimeUrl, database: runtime.database, runtimeRole: runtime.role }
}
