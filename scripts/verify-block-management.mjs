// Actual source handlers with PostgreSQL in a uniquely owned rehearsal schema.
// Authentication is a bounded adapter; no public table fallback is allowed.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
const phase = process.argv[2]
assert.ok(['red', 'green'].includes(phase) && process.argv.length === 3)
const service = JSON.parse(
  execFileSync(
    'docker',
    [
      'inspect',
      '--format',
      '{"Id":{{json .Id}},"Labels":{{json .Config.Labels}},"Running":{{json .State.Running}},"Ports":{{json .NetworkSettings.Ports}}}',
      'metardu-schema-rehearsal-20261008',
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 },
  ),
)
assert.equal(
  service.Id,
  'ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0',
)
assert.equal(service.Labels['metardu.purpose'], 'schema-rehearsal')
assert.equal(service.Running, true)
assert.deepEqual(service.Ports['5432/tcp'], [
  { HostIp: '127.0.0.1', HostPort: '55433' },
])
const token = randomUUID(),
  schema = `metardu_blocks_${token.replaceAll('-', '')}`
assert.match(schema, /^metardu_blocks_[a-f0-9]{32}$/)
const marker = `METARDU owned block management fixture ${token}`
const options = {
  connectionString:
    'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify',
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
  application_name: `metardu-blocks-${token}`,
}
const admin = new pg.Client(options),
  pool = new pg.Pool({
    ...options,
    max: 4,
    options: `-c search_path=${schema}`,
  })
let fault = '',
  beforeAdmission = null
async function execute(client, sql, values) {
  const result = await client.query(sql, values)
  if (
    beforeAdmission &&
    /^\s*SELECT/.test(sql) &&
    /FROM blocks/i.test(sql) &&
    !/FOR UPDATE/.test(sql)
  ) {
    const hook = beforeAdmission
    beforeAdmission = null
    await hook()
  }
  return result
}
const database = {
  query: async (sql, values) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        "SELECT set_config('metardu_fixture.block_fault',$1,true)",
        [fault],
      )
      const result = await execute(client, sql, values)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },
  transaction: async (work) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        "SELECT set_config('metardu_fixture.block_fault',$1,true)",
        [fault],
      )
      const result = await work({
        query: (sql, values) => execute(client, sql, values),
      })
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  },
}
const require = createRequire(import.meta.url),
  Module = require('node:module'),
  ts = require('typescript'),
  originalLoad = Module._load
Module._load = function (request, parent, ...rest) {
  if (request === '@/lib/db') return { db: database }
  if (request === '@/lib/apiHandler')
    return {
      apiHandler: (options, handler) => async (req, actor, id) => {
        if (!actor)
          return Response.json(
            { error: 'Unauthenticated fixture caller' },
            { status: 401 },
          )
        try {
          let body = ['POST', 'PATCH'].includes(req.method)
            ? await req.json()
            : undefined
          if (options.schema) {
            const parsed = options.schema.safeParse(body)
            if (!parsed.success)
              return Response.json(
                { error: 'Fixture input validation failed' },
                { status: 400 },
              )
            body = parsed.data
          }
          if (options.optimisticLock && !body?.updated_at)
            return Response.json({ error: 'Version required' }, { status: 400 })
          return await handler(req, { userId: actor, params: { id }, body })
        } catch (error) {
          return Response.json(
            { error: error.message },
            { status: error.statusCode ?? 500 },
          )
        }
      },
    }
  return originalLoad.call(
    this,
    request.startsWith('@/')
      ? path.join(process.cwd(), 'src', request.slice(2))
      : request,
    parent,
    ...rest,
  )
}
Module._extensions['.ts'] = function (module, filename) {
  module._compile(
    ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  )
}
const { GET, POST } = require('../src/app/api/scheme/blocks/route.ts'),
  { PATCH, DELETE } = require('../src/app/api/scheme/blocks/[id]/route.ts'),
  { NextRequest } = require('next/server')
const actor = randomUUID(),
  other = randomUUID(),
  project = randomUUID(),
  otherProject = randomUUID(),
  block = randomUUID()
const version = '2026-10-25T00:00:00.123456Z'
const tokens = async () => {
  const row = (
    await pool.query(
      `SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') updated_at,xmin::text row_version FROM blocks WHERE id=$1`,
      [block],
    )
  ).rows[0]
  return row
}
const create = (body = {}, user = actor) =>
  POST(
    new NextRequest('http://127.0.0.1:3021/api/scheme/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: project,
        block_number: 'SYN-NEW',
        ...body,
      }),
    }),
    user,
  )
const update = async (body = {}, user = actor) =>
  PATCH(
    new NextRequest(`http://127.0.0.1:3021/api/scheme/blocks/${block}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: project,
        ...(await tokens()),
        block_name: 'SYNTHETIC changed',
        ...body,
      }),
    }),
    user,
    block,
  )
const remove = async (query = {}, user = actor) =>
  DELETE(
    new NextRequest(
      `http://127.0.0.1:3021/api/scheme/blocks/${block}?${new URLSearchParams({ project_id: project, ...(await tokens()), ...query })}`,
      { method: 'DELETE' },
    ),
    user,
    block,
  )
const read = (query = '', user = actor, id = project) =>
  GET(
    new NextRequest(
      `http://127.0.0.1:3021/api/scheme/blocks?project_id=${id}${query ? '&' + query : ''}`,
    ),
    user,
  )
const root = '.cache/block-management'
mkdirSync(root, { recursive: true })
const files = [
  'scripts/verify-block-management.mjs',
  'src/app/api/scheme/blocks/route.ts',
  'src/app/api/scheme/blocks/[id]/route.ts',
  'src/lib/validation/apiSchemas.ts',
  'src/lib/validation/blockInputs.ts',
  'src/lib/scheme/blockDirectory.ts',
  'src/lib/scheme/readBlockDirectory.ts',
  'src/lib/scheme/blockMetadataCommands.ts',
  'src/lib/db/migrations/118_block_identity_retention.sql',
  'src/components/scheme/BlockManagement.tsx',
  'src/app/project/[id]/scheme/blocks/page.tsx',
].filter(existsSync)
const hashes = () =>
  Object.fromEntries(
    files.map((file) => [
      file,
      createHash('sha256').update(readFileSync(file)).digest('hex'),
    ]),
  )
const report = {
  checkedAt: new Date().toISOString(),
  phase,
  source: hashes(),
  fixtureSchema: schema,
  authentication:
    'bounded adapter with actual input schemas, not ordinary-account HTTP or production RLS',
  ddl:
    phase === 'red'
      ? 'baseline cascade FKs'
      : 'pending 118 redirected into owned fixture',
  checks: [],
}
const save = () =>
  writeFileSync(`${root}/${phase}.json`, JSON.stringify(report, null, 2) + '\n')
const state = async () => ({
  blocks: (
    await pool.query(
      'SELECT *,updated_at::text exact_timestamp,xmin::text row_version FROM blocks ORDER BY id',
    )
  ).rows,
  parcels: (await pool.query('SELECT * FROM parcels ORDER BY id')).rows,
  assignments: (await pool.query('SELECT * FROM block_assignments ORDER BY id'))
    .rows,
  receipts: (
    await pool.query('SELECT * FROM scheme_import_receipts ORDER BY id')
  ).rows,
  audit: (await pool.query('SELECT * FROM fixture_block_audit ORDER BY id'))
    .rows,
})
const fingerprint = async () => {
  const result = {}
  for (const table of [
    'projects',
    'blocks',
    'parcels',
    'block_assignments',
    'users',
  ])
    result[table] = (
      await admin.query(
        `SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(record)::text,E'\n' ORDER BY row_to_json(record)::text),'')) hash FROM public.${table} record`,
      )
    ).rows[0]
  return result
}
async function reset() {
  fault = ''
  beforeAdmission = null
  await pool.query(
    'TRUNCATE fixture_block_audit,scheme_import_receipts,block_assignments,parcels,blocks,projects,users CASCADE',
  )
  await pool.query('INSERT INTO users VALUES($1),($2)', [actor, other])
  await pool.query(
    "INSERT INTO projects VALUES($1,$2,'scheme','SYNTHETIC campaign'),($3,$2,'scheme','SYNTHETIC other project')",
    [project, actor, otherProject],
  )
  await pool.query(
    "INSERT INTO blocks(id,project_id,block_number,block_name,updated_at) VALUES($1,$2,'SYN-A','SYNTHETIC block',$3)",
    [block, project, version],
  )
}
async function check(name, work) {
  await reset()
  try {
    await work()
    report.checks.push({ name, passed: true })
    console.log(`PASS ${name}`)
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message })
    console.log(`FAIL ${name}: ${error.message}`)
  }
  save()
}
let created = false,
  original,
  ledger
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
  original = await fingerprint()
  ledger = (
    await admin.query(
      'SELECT version,checksum FROM public.schema_migrations ORDER BY version',
    )
  ).rows
  await admin.query(`CREATE SCHEMA ${schema}`)
  created = true
  await admin.query(`COMMENT ON SCHEMA ${schema} IS '${marker}'`)
  assert.equal(
    (await pool.query('SELECT current_schema() name')).rows[0].name,
    schema,
  )
  await pool.query(`CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid REFERENCES users(id),project_type text,name text);
 CREATE TABLE blocks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES projects(id) ON DELETE CASCADE,block_number varchar(20),block_name varchar(100),description text,geom text,created_at timestamptz DEFAULT NOW(),updated_at timestamptz DEFAULT NOW());
 CREATE TABLE parcels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES projects(id) ON DELETE CASCADE,block_id uuid REFERENCES blocks(id) ON DELETE CASCADE,status text DEFAULT 'pending');
 CREATE TABLE block_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES projects(id) ON DELETE CASCADE,block_id uuid REFERENCES blocks(id) ON DELETE CASCADE);
 CREATE TABLE scheme_import_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES projects(id) ON DELETE CASCADE,block_id uuid REFERENCES blocks(id) ON DELETE CASCADE);
 CREATE TABLE fixture_block_audit(id bigserial PRIMARY KEY,operation text,snapshot jsonb);
 CREATE FUNCTION fixture_touch_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END;$$;
 CREATE TRIGGER set_updated_at_blocks BEFORE UPDATE ON blocks FOR EACH ROW EXECUTE FUNCTION fixture_touch_timestamp();
 CREATE FUNCTION fixture_block_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO fixture_block_audit(operation,snapshot) VALUES(TG_OP,CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END);RETURN NULL;END;$$;
 CREATE TRIGGER fixture_block_audit AFTER INSERT OR UPDATE OR DELETE ON blocks FOR EACH ROW EXECUTE FUNCTION fixture_block_audit();
 CREATE FUNCTION fixture_block_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF current_setting('metardu_fixture.block_fault',true)='suppress' THEN RETURN NULL;END IF;
  IF TG_OP<>'DELETE' THEN
   IF current_setting('metardu_fixture.block_fault',true)='changed_name' THEN NEW.block_name:='SYNTHETIC unexpected trigger change';END IF;
   IF TG_OP='UPDATE' AND current_setting('metardu_fixture.block_fault',true)='retained_timestamp' THEN NEW.updated_at:=OLD.updated_at;END IF;
   RETURN NEW;END IF;RETURN OLD;END;$$;
 CREATE TRIGGER zz_fixture_block_fault BEFORE INSERT OR UPDATE OR DELETE ON blocks FOR EACH ROW EXECUTE FUNCTION fixture_block_fault();`)
  const migration = readFileSync(
    'src/lib/db/migrations/118_block_identity_retention.sql',
    'utf8',
  )
    .split('-- DOWN:')[0]
    .replaceAll('public.', `${schema}.`)
  if (phase === 'green') await pool.query(migration)
  await check('authentication required', async () =>
    assert.equal((await create({}, null)).status, 401),
  )
  await check('create preserves UUID and exact version tokens', async () => {
    const response = await create()
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.data.project_id, project)
    assert.match(body.data.row_version, /^\d+$/)
    assert.match(body.data.updated_at, /\.\d{6}Z$/)
  })
  await check('create requires an actual scheme project', async () => {
    await pool.query("UPDATE projects SET project_type='small' WHERE id=$1", [
      project,
    ])
    assert.equal((await create()).status, 400)
  })
  await check('foreign owner cannot create blocks', async () =>
    assert.equal((await create({}, other)).status, 404),
  )
  await check('concurrent duplicate creation commits one block', async () => {
    const responses = await Promise.all([create(), create()])
    assert.deepEqual(responses.map((value) => value.status).sort(), [201, 409])
    assert.equal((await state()).blocks.length, 2)
  })
  for (const mode of ['changed_name', 'suppress'])
    await check(`create ${mode} acknowledgement rolls back`, async () => {
      const before = await state()
      fault = mode
      assert.equal((await create()).status, 500)
      assert.deepEqual(await state(), before)
    })
  await check('owner transfer before admission refuses update', async () => {
    beforeAdmission = () =>
      admin.query(`UPDATE ${schema}.projects SET user_id=$1 WHERE id=$2`, [
        other,
        project,
      ])
    const before = await state()
    assert.equal((await update()).status, 404)
    assert.deepEqual(await state(), before)
  })
  await check('update enforces supplied project scope', async () => {
    const before = await state()
    assert.equal((await update({ project_id: otherProject })).status, 404)
    assert.deepEqual(await state(), before)
  })
  await check(
    'update clears nullable fields and advances version',
    async () => {
      const before = await tokens()
      const response = await update({ block_name: null, description: null })
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.data.block_name, null)
      assert.notEqual(body.data.row_version, before.row_version)
      assert.match(body.data.updated_at, /\.\d{6}Z$/)
    },
  )
  await check('stale timestamp refuses update', async () =>
    assert.equal(
      (await update({ updated_at: '2026-10-25T00:00:00.123Z' })).status,
      409,
    ),
  )
  await check('stale row version refuses update', async () => {
    const before = await state()
    assert.equal((await update({ row_version: '0' })).status, 409)
    assert.deepEqual(await state(), before)
  })
  for (const mode of ['retained_timestamp', 'changed_name', 'suppress'])
    await check(`update ${mode} acknowledgement rolls back`, async () => {
      const before = await state()
      fault = mode
      assert.equal((await update()).status, 500)
      assert.deepEqual(await state(), before)
    })
  await check('delete requires a loaded version', async () => {
    const before = await state()
    assert.equal((await remove({ updated_at: '' })).status, 400)
    assert.deepEqual(await state(), before)
  })
  await check('stale row version refuses deletion', async () => {
    const before = await state()
    assert.equal((await remove({ row_version: '0' })).status, 409)
    assert.deepEqual(await state(), before)
  })
  for (const table of [
    'parcels',
    'block_assignments',
    'scheme_import_receipts',
  ])
    await check(`delete protects ${table}`, async () => {
      await pool.query(
        `INSERT INTO ${table}(project_id,block_id) VALUES($1,$2)`,
        [project, block],
      )
      const before = await state()
      assert.equal((await remove()).status, 409)
      assert.deepEqual(await state(), before)
    })
  await check('delete protects retained block geometry', async () => {
    await pool.query(
      "UPDATE blocks SET geom='SYNTHETIC geometry' WHERE id=$1",
      [block],
    )
    const before = await state()
    assert.equal((await remove()).status, 409)
    assert.deepEqual(await state(), before)
  })
  await check(
    'empty block deletion is acknowledged by identity and version',
    async () => {
      const token = await tokens()
      const response = await remove()
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.data.deletedId, block)
      assert.equal(body.data.projectId, project)
      assert.equal(body.data.rowVersion, token.row_version)
      assert.equal((await state()).blocks.length, 0)
    },
  )
  await check('suppressed deletion cannot report success', async () => {
    const before = await state()
    fault = 'suppress'
    assert.equal((await remove()).status, 500)
    assert.deepEqual(await state(), before)
  })
  await check(
    'database constraints retain children even through another writer',
    async () => {
      await pool.query(
        'INSERT INTO scheme_import_receipts(project_id,block_id) VALUES($1,$2)',
        [project, block],
      )
      const before = await state(),
        client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('DELETE FROM blocks WHERE id=$1', [block])
        await assert.rejects(
          client.query('COMMIT'),
          (error) => error.code === '23503',
        )
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
      assert.deepEqual(await state(), before)
    },
  )
  await check(
    'whole-project lifecycle still deletes its own dependent records',
    async () => {
      for (const table of [
        'parcels',
        'block_assignments',
        'scheme_import_receipts',
      ])
        await pool.query(
          `INSERT INTO ${table}(project_id,block_id) VALUES($1,$2)`,
          [project, block],
        )
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('DELETE FROM projects WHERE id=$1', [project])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
      const after = await state()
      assert.equal(
        after.blocks.length +
          after.parcels.length +
          after.assignments.length +
          after.receipts.length,
        0,
      )
      assert.equal(
        (
          await pool.query('SELECT id FROM projects WHERE id=$1', [
            otherProject,
          ])
        ).rows.length,
        1,
      )
    },
  )
  await check(
    'cross-project inconsistent children block parent deletion rather than disappear',
    async () => {
      await pool.query(
        'INSERT INTO parcels(project_id,block_id) VALUES($1,$2)',
        [otherProject, block],
      )
      const before = await state(),
        client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('DELETE FROM projects WHERE id=$1', [project])
        await assert.rejects(
          client.query('COMMIT'),
          (error) => error.code === '23503',
        )
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
      assert.deepEqual(await state(), before)
    },
  )
  await check(
    '250 blocks and 10000 parcels use bounded stable pages and numeric totals',
    async () => {
      await pool.query(
        "INSERT INTO blocks(project_id,block_number) SELECT $1,'SYN-'||lpad(i::text,4,'0') FROM generate_series(1,249) i",
        [project],
      )
      await pool.query(
        "INSERT INTO parcels(project_id,block_id,status) SELECT $1,$2,CASE WHEN i%2=0 THEN 'approved' ELSE 'pending' END FROM generate_series(1,10000) i",
        [project, block],
      )
      const a = await read(),
        b = await read('page=2')
      assert.equal(a.status, 200)
      assert.equal(b.status, 200)
      const first = await a.json(),
        second = await b.json()
      assert.equal(first.summary.blocks, 250)
      assert.equal(first.summary.parcels, 10000)
      assert.equal(first.summary.submittedOrApproved, 5000)
      assert.equal(first.data.length, 24)
      assert.equal(second.data.length, 24)
      assert.equal(
        first.data.some((row) =>
          second.data.some((next) => next.id === row.id),
        ),
        false,
      )
      report.profile = {
        synthetic: true,
        blocks: 250,
        parcels: 10000,
        pageRows: 24,
        responseBytes: Buffer.byteLength(JSON.stringify(first)),
      }
    },
  )
  await check('empty directory has authoritative zero counts', async () => {
    await pool.query('DELETE FROM blocks WHERE id=$1', [block])
    const response = await read()
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.summary.blocks, 0)
    assert.equal(body.data.length, 0)
  })
  await check(
    'literal search does not expand percent/underscore wildcards',
    async () => {
      await pool.query(
        "INSERT INTO blocks(project_id,block_number) VALUES($1,'SYN%_MATCH'),($1,'SYNXXMATCH')",
        [project],
      )
      const response = await read('q=%25_')
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.meta.total, 1)
      assert.equal(body.data[0].block_number, 'SYN%_MATCH')
      assert.equal(body.summary.blocks, 3)
    },
  )
  await check(
    'unavailable receipt storage preserves reads but disables deletion',
    async () => {
      await pool.query(
        'ALTER TABLE scheme_import_receipts RENAME TO fixture_unavailable_receipts',
      )
      try {
        const response = await read()
        assert.equal(response.status, 200)
        const body = await response.json()
        assert.equal(body.summary.receiptRetention, 'unavailable')
        assert.equal(body.data[0].has_import_receipts, null)
        assert.equal(body.data[0].can_delete, false)
        assert.equal((await remove()).status, 503)
      } finally {
        await pool.query(
          'ALTER TABLE fixture_unavailable_receipts RENAME TO scheme_import_receipts',
        )
      }
    },
  )
  await check('invalid pagination is refused', async () =>
    assert.equal((await read('page=0')).status, 400),
  )
  if (phase === 'green') {
    await check(
      'migration refuses legacy duplicate identities without cleaning them',
      async () => {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query(
            `DROP INDEX ${schema}.scheme_block_number_per_project`,
          )
          await client.query(
            "INSERT INTO blocks(project_id,block_number) VALUES($1,'SYN-A')",
            [project],
          )
          await assert.rejects(
            client.query(migration),
            /could not create unique index/i,
          )
        } finally {
          await client.query('ROLLBACK')
          client.release()
        }
      },
    )
    await check(
      'migration refuses unexpected FK shapes on each retained child table',
      async () => {
        for (const unexpected of [
          'parcels',
          'block_assignments',
          'scheme_import_receipts',
        ]) {
          const client = await pool.connect()
          try {
            await client.query('BEGIN')
            await client.query(
              `DROP INDEX ${schema}.scheme_block_number_per_project`,
            )
            for (const table of [
              'parcels',
              'block_assignments',
              'scheme_import_receipts',
            ]) {
              const constraints = (
                await client.query(
                  "SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND confrelid=$2::regclass AND contype='f'",
                  [`${schema}.${table}`, `${schema}.blocks`],
                )
              ).rows
              assert.equal(constraints.length, 1)
              const constraint =
                '"' + constraints[0].conname.replaceAll('"', '""') + '"'
              await client.query(
                `ALTER TABLE ${schema}.${table} DROP CONSTRAINT ${constraint}`,
              )
              await client.query(
                `ALTER TABLE ${schema}.${table} ADD CONSTRAINT ${constraint} FOREIGN KEY(block_id) REFERENCES ${schema}.blocks(id) ON DELETE ${table === unexpected ? 'RESTRICT' : 'CASCADE'}`,
              )
            }
            await assert.rejects(
              client.query(migration),
              /Unexpected block FK shape/,
            )
          } finally {
            await client.query('ROLLBACK')
            client.release()
          }
        }
      },
    )
  }
} finally {
  await pool.end()
  try {
    if (created) {
      assert.equal(
        (
          await admin.query(
            "SELECT obj_description(oid,'pg_namespace') marker FROM pg_namespace WHERE nspname=$1",
            [schema],
          )
        ).rows[0].marker,
        marker,
      )
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      assert.equal(
        (
          await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [
            schema,
          ])
        ).rowCount,
        0,
      )
      report.ownedFixtureRemoved = true
    }
    if (original) {
      assert.deepEqual(await fingerprint(), original)
      report.originalRecordsPreserved = true
    }
    if (ledger) {
      assert.deepEqual(
        (
          await admin.query(
            'SELECT version,checksum FROM public.schema_migrations ORDER BY version',
          )
        ).rows,
        ledger,
      )
      report.migrationLedgerPreserved = true
    }
    assert.deepEqual(hashes(), report.source)
    report.sourcePreserved = true
    report.status =
      report.checks.length === (phase === 'green' ? 33 : 31) &&
      report.checks.every((row) => row.passed) &&
      report.ownedFixtureRemoved &&
      report.originalRecordsPreserved &&
      report.migrationLedgerPreserved
        ? 'passed'
        : 'failed'
    save()
  } finally {
    await admin.end()
  }
}
process.exitCode = report.status === 'passed' ? 0 : 1
