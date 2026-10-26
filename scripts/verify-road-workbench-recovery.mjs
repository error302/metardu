// Owned synthetic HTTP/native proof only. Never reads deployment DATABASE_URL or applies migrations.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { rehearsalDatabaseConfig } from './rehearsal-database.mjs'
import { collectFileMigrations, computeDrift } from './verify-migrations.mjs'
process.env.TEST_ADMIN_DATABASE_URL ??=
  'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify'
process.env.TEST_RUNTIME_DATABASE_URL ??=
  'postgresql://release_app:local_release_runtime_only@127.0.0.1:55433/metardu_runtime_verify'
assert.ok(
  process.argv.slice(2).length <= 1 &&
    process.argv
      .slice(2)
      .every((v) => ['--close-fixture', '--browser-check'].includes(v)),
  'Use only the exact owned fixture verification modes.',
)
const config = rehearsalDatabaseConfig(),
  base = 'http://127.0.0.1:3021',
  directory = '.cache/road-recovery'
assert.equal(config.database, 'metardu_runtime_verify')
assert.equal(new URL(config.adminUrl).hostname, '127.0.0.1')
assert.equal(new URL(config.adminUrl).port, '55433')
const verificationSources = [
  'scripts/verify-road-workbench-recovery.mjs',
  'src/app/api/engineering/road-workbench/route.ts',
  'src/lib/engineering/roadWorkbenchRecoveryServer.ts',
  'src/lib/engineering/roadWorkbenchRecoveryContract.ts',
  'src/lib/engineering/roadDesignSchema.ts',
  'src/lib/engineering/roadWorkbenchDraft.ts',
  'src/lib/engineering/roadWorkbench.ts',
  'src/lib/engineering/roadGroundAssociation.ts',
  'src/lib/engineering/designRevisions.ts',
  'src/lib/db.ts',
  'src/lib/workspaces/stageReference.ts',
  'src/lib/engineering/roadWorkbenchRecoveryDevice.ts',
  'src/components/engineering/RecoverableRoadWorkbench.tsx',
  'src/components/engineering/RoadWorkbenchEditor.tsx',
]
async function captureSources() {
  return Object.fromEntries(
    await Promise.all(
      verificationSources.map(async (p) => [
        p,
        createHash('sha256')
          .update(await readFile(p))
          .digest('hex'),
      ]),
    ),
  )
}
const admin = new pg.Client({
  connectionString: config.adminUrl,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
})
const canonical = (value) =>
  JSON.stringify(
    (function sort(v) {
      return Array.isArray(v)
        ? v.map(sort)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, sort(v[k])]),
            )
          : v
    })(value),
  )
const digest = (value) =>
  createHash('sha256').update(canonical(value)).digest('hex')
const fixturePath = `${directory}/native-private.json`,
  checks = []
const check = (name, ok) => {
  assert.ok(ok, name)
  checks.push(name)
  console.log('PASS ' + name)
}
const road = {
  roadName: 'SYNTHETIC road recovery - NOT FIELD EVIDENCE',
  startChainage: 0,
  datum: 'WGS84',
  coordinateSystem: 'EPSG:32737',
  designSpeed: 40,
  roadClass: 'C',
  ips: [
    {
      id: 'start',
      name: 'Start',
      easting: 500000,
      northing: 9500000,
      radius: 0,
    },
    { id: 'end', name: 'End', easting: 500000, northing: 9500020, radius: 0 },
  ],
  vips: [
    { id: 'v-start', chainage: 0, reducedLevel: -1 },
    { id: 'v-end', chainage: 20, reducedLevel: -1 },
  ],
  crossSectionTemplate: {
    carriagewayWidth: 6,
    shoulderWidth: 0,
    camber: 0,
    subgradeDepth: 0,
    cutSlope: '1:1',
    fillSlope: '1:1',
  },
  stations: [0, 20].map((chainage) => ({
    chainage,
    groundLevel: 0,
    designLevelSource: 'vertical-alignment',
    groundProfile: [-10, 0, 10].map((offset) => ({ offset, level: 0 })),
  })),
}
const engineering = {
  mode: 'road',
  standard: 'KRDM2017',
  road,
  pipeNetwork: { fixture: 'preserve this unrelated design' },
}
async function insertProject(owner, id) {
  await admin.query(
    "INSERT INTO projects(id,user_id,name,survey_type,engineering_data) VALUES($1,$2,'SYNTHETIC road recovery - NOT FIELD EVIDENCE','engineering',$3::jsonb)",
    [id, owner, JSON.stringify(engineering)],
  )
  await admin.query(
    "INSERT INTO project_reference_systems(project_id,horizontal_crs,horizontal_name,datum_name,units,zone,hemisphere,vertical_datum,vertical_reference,distance_mode,coordinate_precision,declared_by) VALUES($1,'EPSG:32737','Synthetic WGS84 UTM 37S','WGS84','metres',37,'S','Synthetic BM','local','grid',3,$2)",
    [id, owner],
  )
}
async function login(f) {
  const cookies = new Map()
  const call = async (path, options = {}) => {
    const response = await fetch(base + path, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(120000),
      headers: {
        Origin: base,
        ...options.headers,
        ...(cookies.size
          ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
          : {}),
      },
    })
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0],
        i = pair.indexOf('=')
      cookies.set(pair.slice(0, i), pair.slice(i + 1))
    }
    return response
  }
  const csrf = await (await call('/api/auth/csrf')).json()
  await call('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email: f.email,
      password: f.password,
      callbackUrl: base + '/dashboard',
      json: 'true',
    }),
  })
  assert.equal(
    (await (await call('/api/auth/session')).json()).user?.id,
    f.actorId,
    'The source preview must authenticate this exact isolated fixture.',
  )
  return async (path, body) => {
    const response = await call(
      path,
      body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {},
    )
    return { status: response.status, value: await response.json() }
  }
}
function edited(source, first = -2) {
  const r = structuredClone(source.road)
  r.groundSectionAlignmentKey ??= canonical({
    version: 1,
    coordinateSystem: r.coordinateSystem,
    startChainage: r.startChainage,
    ips: r.ips.map((p) => ({
      easting: p.easting,
      northing: p.northing,
      radius: p.radius,
      transitionLengthIn: p.transitionLengthIn ?? 0,
      transitionLengthOut: p.transitionLengthOut ?? 0,
    })),
  })
  r.ips = r.ips.map((p) => ({
    id: p.id,
    name: p.name,
    easting: p.easting,
    northing: p.northing,
    radius: p.radius,
    hasTransition: p.hasTransition ?? false,
    ...(p.transitionLengthIn == null
      ? {}
      : { transitionLengthIn: p.transitionLengthIn }),
    ...(p.transitionLengthOut == null
      ? {}
      : { transitionLengthOut: p.transitionLengthOut }),
  }))
  r.vips[0].reducedLevel = first
  return {
    version: 1,
    actorId: source.actorId,
    projectId: source.projectId,
    requestId: randomUUID(),
    expectedEngineeringHash: source.engineeringHash,
    expectedReferenceHash: source.referenceHash,
    road: r,
  }
}
await mkdir(directory, { recursive: true })
await admin.connect()
try {
  assert.equal(
    (
      await admin.query(
        "SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()",
      )
    ).rows[0].marker,
    'METARDU synthetic beacon verification only 2026-10-08',
  )
  const role = (
    await admin.query(
      'SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',
      [config.runtimeRole],
    )
  ).rows[0]
  assert.ok(role && !role.rolsuper && !role.rolbypassrls)
  const migrations = (
      await admin.query(
        'SELECT version,checksum FROM schema_migrations ORDER BY version',
      )
    ).rows,
    drift = computeDrift(collectFileMigrations(), migrations)
  assert.equal(drift.mutated.length, 0)
  assert.equal(drift.ghost.length, 0)
  assert.ok(
    migrations.some((m) => m.version === '095_design_revision_lifecycle'),
  )
  check(
    'exact marked loopback database, unprivileged runtime role and applied migration hashes verified',
    true,
  )
  let f
  try {
    f = JSON.parse(await readFile(fixturePath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (!f) {
    assert.equal(
      process.argv.length,
      2,
      'The exact fixture must already exist for inspection or closure.',
    )
    f = {
      actorId: randomUUID(),
      projectId: randomUUID(),
      password: `synthetic-${randomUUID()}`,
      createdAt: new Date().toISOString(),
    }
    f.email = `road-recovery-${f.actorId}@example.invalid`
    await admin.query('BEGIN')
    try {
      await admin.query(
        "INSERT INTO users(id,email,password_hash,full_name,role,email_verified) VALUES($1,$2,$3,'SYNTHETIC road recovery operator','user',true)",
        [f.actorId, f.email, await bcrypt.hash(f.password, 10)],
      )
      await admin.query(
        "INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)",
        [f.actorId],
      )
      await insertProject(f.actorId, f.projectId)
      await admin.query('COMMIT')
    } catch (error) {
      await admin.query('ROLLBACK')
      throw error
    }
    await writeFile(fixturePath, JSON.stringify(f, null, 2))
  }
  const scope = (
    await admin.query(
      'SELECT p.id,p.user_id,u.email,u.role,sp.is_suspended FROM projects p JOIN users u ON u.id=p.user_id JOIN surveyor_profiles sp ON sp.user_id=u.id WHERE p.id=$1 AND p.user_id=$2 AND p.name=$3',
      [f.projectId, f.actorId, 'SYNTHETIC road recovery - NOT FIELD EVIDENCE'],
    )
  ).rows[0]
  assert.ok(scope && scope.email === f.email && scope.role === 'user')
  if (process.argv.includes('--close-fixture')) {
    await admin.query(
      'UPDATE surveyor_profiles SET is_suspended=true WHERE user_id=$1',
      [f.actorId],
    )
    const closed = (
      await admin.query(
        'SELECT is_suspended,role FROM surveyor_profiles WHERE user_id=$1',
        [f.actorId],
      )
    ).rows[0]
    check(
      'only the exact synthetic operator profile was suspended',
      closed.is_suspended === true && closed.role === 'surveyor',
    )
    await writeFile(
      `${directory}/fixture-closed.json`,
      JSON.stringify(
        {
          closedAt: new Date().toISOString(),
          actorId: f.actorId,
          projectId: f.projectId,
          isSuspended: closed.is_suspended,
          ordinaryProfileRole: closed.role,
          productionMutated: false,
        },
        null,
        2,
      ) + '\n',
    )
    process.exitCode = 0
  } else if (process.argv.includes('--browser-check')) {
    assert.equal(scope.is_suspended, false)
    const current = (
      await admin.query(
        'SELECT engineering_data FROM projects WHERE id=$1 AND user_id=$2',
        [f.projectId, f.actorId],
      )
    ).rows[0].engineering_data
    const observed = JSON.parse(
      await readFile(`${directory}/browser-saved.json`, 'utf8'),
    )
    check(
      'native project matches the observed confirmed browser inputs',
      observed.recoveryStatus.startsWith('Road save confirmed.') &&
        observed.pointName === current.road.ips[0].name &&
        Number(observed.target) === current.road.vips[0].reducedLevel,
    )
    const rows = (
      await admin.query(
        "SELECT * FROM design_revisions WHERE project_id=$1 AND discipline='road' AND entity_type='road-workbench-request' ORDER BY created_at DESC,id DESC LIMIT 1",
        [f.projectId],
      )
    ).rows
    assert.equal(rows.length, 1)
    const row = rows[0]
    check(
      'browser save matches actual project JSON and its exact retained command',
      row.created_by === f.actorId &&
        row.payload.outcome.state === 'committed' &&
        canonical(row.payload.request.road) === canonical(current.road),
    )
    check(
      'browser save retains original engineering and reference evidence',
      digest({ engineering: row.payload.sourceEvidence.engineering }) ===
        row.payload.request.expectedEngineeringHash &&
        digest({ reference: row.payload.sourceEvidence.referenceRecord }) ===
          row.payload.request.expectedReferenceHash &&
        row.content_hash === digest(row.payload),
    )
    const call = await login(f),
      result = await call('/api/engineering/road-workbench', {
        operation: 'status',
        command: row.payload.request,
      })
    check(
      'current route recovers the exact browser save from native history',
      result.status === 200 &&
        canonical(result.value.outcome) === canonical(row.payload.outcome),
    )
    const subscriptions = (
      await admin.query(
        'SELECT COUNT(*)::integer n FROM user_subscriptions WHERE user_id=$1',
        [f.actorId],
      )
    ).rows[0].n
    check(
      'synthetic browser operator remains an ordinary free account',
      subscriptions === 0 && scope.role === 'user',
    )
    const after = (
      await admin.query(
        'SELECT version,checksum FROM schema_migrations ORDER BY version',
      )
    ).rows
    check(
      'native applied migration hashes remain unchanged',
      canonical(after) === canonical(migrations),
    )
    await writeFile(
      `${directory}/browser-native.json`,
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          database: config.database,
          actorId: f.actorId,
          projectId: f.projectId,
          requestId: row.entity_id,
          revisionId: row.id,
          requestHash: row.payload.outcome.requestHash,
          checks,
          sourceHashes: await captureSources(),
          productionMutated: false,
          fieldEvidence: false,
        },
        null,
        2,
      ) + '\n',
    )
  } else {
    assert.equal(
      scope.is_suspended,
      false,
      'The exact fixture is closed; do not reopen its access automatically.',
    )
    const call = await login(f),
      url = `/api/engineering/road-workbench?project_id=${f.projectId}&expected_user_id=${f.actorId}`
    check(
      'ordinary synthetic surveyor authenticated on the existing source preview',
      true,
    )
    const get = async () => {
      const r = await call(url)
      assert.equal(r.status, 200)
      return r.value.source
    }
    check(
      'anonymous recovery requests do not expose project data',
      (await fetch(base + url, { signal: AbortSignal.timeout(120000) }))
        .status === 401,
    )
    const source = await get(),
      command = edited(source)
    const [saved, concurrent] = await Promise.all([
      call('/api/engineering/road-workbench', { operation: 'commit', command }),
      call('/api/engineering/road-workbench', { operation: 'commit', command }),
    ])
    assert.equal(saved.status, 200)
    assert.equal(saved.value.outcome.state, 'committed')
    check(
      'concurrent duplicate saves return one final native outcome',
      concurrent.status === 200 &&
        canonical(concurrent.value) === canonical(saved.value),
    )
    const actual = (
      await admin.query('SELECT engineering_data FROM projects WHERE id=$1', [
        f.projectId,
      ])
    ).rows[0].engineering_data
    check(
      'actual project road and unrelated engineering data acknowledged together',
      canonical(actual.road) === canonical(command.road) &&
        canonical(actual.pipeNetwork) === canonical(engineering.pipeNetwork),
    )
    const replay = await call('/api/engineering/road-workbench', {
      operation: 'commit',
      command,
    })
    check(
      'discarded receipt recovers the original final outcome without another write',
      replay.status === 200 &&
        canonical(replay.value.outcome) === canonical(saved.value.outcome),
    )
    const rows = (
      await admin.query(
        "SELECT payload,content_hash FROM design_revisions WHERE project_id=$1 AND entity_type='road-workbench-request' AND entity_id=$2",
        [f.projectId, command.requestId],
      )
    ).rows
    check(
      'one immutable request outcome retains the exact original command',
      rows.length === 1 &&
        canonical(rows[0].payload.request) === canonical(command),
    )
    check(
      'native archive retains independently hashable original engineering/reference evidence',
      rows[0].content_hash === digest(rows[0].payload) &&
        digest({ engineering: rows[0].payload.sourceEvidence.engineering }) ===
          command.expectedEngineeringHash &&
        digest({
          reference: rows[0].payload.sourceEvidence.referenceRecord,
        }) === command.expectedReferenceHash,
    )
    const current = await get(),
      cancelCommand = edited(current, -3)
    const cancelled = await call('/api/engineering/road-workbench', {
        operation: 'cancel',
        command: cancelCommand,
      }),
      late = await call('/api/engineering/road-workbench', {
        operation: 'commit',
        command: cancelCommand,
      })
    check(
      'confirmed native cancellation prevents a late save from applying',
      cancelled.status === 200 &&
        cancelled.value.outcome.state === 'cancelled' &&
        canonical(late.value) === canonical(cancelled.value),
    )
    const stale = edited(await get(), -4)
    await admin.query(
      "UPDATE projects SET engineering_data=jsonb_set(engineering_data,'{pipeNetwork,changed}', 'true'::jsonb) WHERE id=$1 AND user_id=$2",
      [f.projectId, f.actorId],
    )
    check(
      'actual stale project snapshot is refused before a new archive',
      (
        await call('/api/engineering/road-workbench', {
          operation: 'commit',
          command: stale,
        })
      ).status === 409,
    )
    check(
      'stale source refusal retained the newer unrelated project change',
      (
        await admin.query('SELECT engineering_data FROM projects WHERE id=$1', [
          f.projectId,
        ])
      ).rows[0].engineering_data.pipeNetwork.changed === true,
    )
    const refCommand = edited(await get(), -5)
    await admin.query(
      "UPDATE project_reference_systems SET vertical_datum='Changed synthetic benchmark' WHERE project_id=$1",
      [f.projectId],
    )
    check(
      'actual changed reference snapshot is refused',
      (
        await call('/api/engineering/road-workbench', {
          operation: 'commit',
          command: refCommand,
        })
      ).status === 409,
    )
    check(
      'a different expected account cannot read the source',
      (await call(url.replace(f.actorId, randomUUID()))).status === 403,
    )
    await admin.query(
      'UPDATE projects SET engineering_data=$3::jsonb WHERE id=$1 AND user_id=$2',
      [f.projectId, f.actorId, JSON.stringify(engineering)],
    )
    await admin.query(
      "UPDATE project_reference_systems SET vertical_datum='Synthetic BM' WHERE project_id=$1",
      [f.projectId],
    )
    await writeFile(
      `${directory}/native.json`,
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          base,
          database: config.database,
          actorId: f.actorId,
          projectId: f.projectId,
          checks,
          migrationHashesUnchanged: true,
          sourceHashes: await captureSources(),
          productionMutated: false,
          customerClone: false,
          fieldEvidence: false,
        },
        null,
        2,
      ) + '\n',
    )
  }
} finally {
  await admin.end()
}
