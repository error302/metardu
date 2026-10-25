// Actual route/command/PostGIS checks in an exactly marked synthetic schema.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
const shareMode = process.argv[2] === 'share'
const exportMode = process.argv[2] === 'export' || shareMode
const viewMode = process.argv[2] === 'view' || exportMode
assert.ok(
  process.argv.length === (viewMode ? 3 : 2),
  'Use no argument, view, export or share verification mode.',
)
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
  schema = `metardu_boundary_${token.replaceAll('-', '')}`,
  marker = `METARDU owned reviewed boundary fixture ${token}`
assert.match(schema, /^metardu_boundary_[a-f0-9]{32}$/)
const options = {
  connectionString:
    'postgresql://release_verify:local_release_verify_only@127.0.0.1:55433/metardu_runtime_verify',
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
  application_name: `metardu-boundary-${token}`,
}
const admin = new pg.Client(options),
  pool = new pg.Pool({
    ...options,
    max: 4,
    options: `-c search_path=${schema}`,
  })
let fault = ''
let schemeExportAllowed = true
const database = {
  query: (sql, values) => pool.query(shareMode ? sql.replaceAll('public.read_parcel_draft_share(', `${schema}.read_parcel_draft_share(`) : sql, values),
  transaction: async (work) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        "SELECT set_config('metardu_fixture.boundary_fault',$1,true)",
        [fault],
      )
      const result = await work(client)
      await client.query('COMMIT')
      if (exportMode && fault === 'lost_commit_ack') {
        fault = ''
        throw new Error('Synthetic lost COMMIT acknowledgement')
      }
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
  if (exportMode && request === '@/lib/subscription/subscriptionEngine')
    return {
      checkFeatureAccess: async (_actor, feature) => {
        assert.equal(feature, 'dxf_export')
        return { allowed: schemeExportAllowed }
      },
    }
  if (request === '@/lib/apiHandler')
    return {
      apiHandler: (_options, handler) => async (req, actor, id) => {
        if (!actor)
          return Response.json(
            { error: 'Unauthenticated fixture caller' },
            { status: 401 },
          )
        try {
          return await handler(req, { userId: actor, params: { id } })
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
const {
    GET,
    POST,
  } = require('../src/app/api/project/[id]/scheme/parcel-boundary/route.ts'),
  { NextRequest } = require('next/server')
const actor = randomUUID(),
  other = randomUUID(),
  project = randomUUID(),
  secondProject = randomUUID(),
  parcel = randomUUID(),
  traverse = randomUUID(),
  points = Array.from({ length: 4 }, () => randomUUID())
const version = '2026-10-25T00:00:00.123456Z'
const base = `http://127.0.0.1:3021/api/project/${project}/scheme/parcel-boundary`
const get = (query, user = actor, id = project) =>
  GET(
    new NextRequest(
      `${base}?${new URLSearchParams({ parcel_id: parcel, ...query })}`,
    ),
    user,
    id,
  )
const read = async () => {
  const result = await get({ traverse_id: traverse })
  assert.equal(result.status, 200, await result.clone().text())
  return (await result.json()).data
}
const command = async () => ({
  parcel_id: parcel,
  traverse_id: traverse,
  request_id: randomUUID(),
  evidence_hash: (await read()).evidenceHash,
  source_crs: 'EPSG:32737',
  ordered_coordinate_ids: [...points],
  reviewed: true,
  note: 'SYNTHETIC explicitly reviewed boundary order',
})
const save = (body, user = actor, id = project) =>
  POST(
    new NextRequest(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    user,
    id,
  )
const files = [
  ...(shareMode ? [
    'scripts/verify-parcel-sharing-cases.mjs',
    'src/lib/db/migrations/121_parcel_draft_sharing.sql',
    'src/lib/scheme/parcelShareContract.ts',
    'src/lib/scheme/parcelShareSnapshot.ts',
    'src/lib/scheme/parcelSharing.ts',
    'src/app/api/public/parcel/[id]/route.ts',
    'src/app/api/project/[id]/scheme/shares/route.ts',
    'tests/parcel-share-snapshot.test.ts',
    'tests/public-parcel-privacy.test.ts',
    'src/lib/scheme/parcelShareDevice.ts',
    'src/components/scheme/ParcelDraftSharing.tsx',
    'src/components/scheme/ParcelDraftView.tsx',
    'src/components/scheme/PublicParcelDraft.tsx',
    'src/app/project/[id]/scheme/shares/page.tsx',
    'src/app/p/[id]/page.tsx',
    'src/app/project/[id]/submission/SubmissionClient.tsx',
    'src/components/layout/AppShell.tsx',
    'src/components/shared/SkipToContent.tsx',
    'src/lib/monitoring/privateShareTelemetry.ts',
    'src/lib/monitoring/sentry.ts',
    'src/lib/monitoring/webVitals.ts',
    'instrumentation-client.ts',
    'next.config.js',
    'tests/parcel-draft-sharing-ui.test.tsx',
    'tests/parcel-share-device.test.ts',
    'tests/public-parcel-portal.test.tsx',
    'tests/private-share-telemetry.test.ts',
    'tests/private-share-skip-link.test.tsx',
  ] : []),
  'scripts/verify-reviewed-boundary.mjs',
  'src/lib/scheme/boundaryReview.ts',
  'src/lib/scheme/reviewedBoundaryCommands.ts',
  'src/lib/map/traverseToParcel.ts',
  'src/lib/db/migrations/119_reviewed_parcel_boundary_drafts.sql',
  'src/app/api/project/[id]/scheme/parcel-boundary/route.ts',
  'src/components/scheme/BoundaryReview.tsx',
  'src/app/project/[id]/scheme/boundary-review/page.tsx',
  'src/app/map/hooks/useTraverseParcelPreview.ts',
  'src/app/map/components/MapToolDock.tsx',
  'src/app/map/components/SchemeLayerPanel.tsx',
  'src/components/scheme/BlockParcelRegister.tsx',
  'src/lib/spatial/projectCrs.ts',
  'src/lib/spatial/simplePolygon.ts',
  'src/lib/map/projectionConstants.ts',
  'src/lib/engine/area.ts',
  'src/lib/audit/auditHash.ts',
  'tests/boundary-review.test.ts',
  'tests/boundary-review-ui.test.tsx',
  ...(viewMode
    ? [
        'scripts/verify-scheme-view-cases.mjs',
        'src/lib/scheme/readSchemeView.ts',
        'src/lib/scheme/schemeView.ts',
        'src/lib/map/schemeLayer.ts',
        'src/app/api/scheme/map/route.ts',
        'src/app/map/hooks/useSchemeLayers.ts',
        'src/app/map/MapReactContext.tsx',
        'src/app/map/MapClient.tsx',
        'src/app/project/[id]/scheme/map/page.tsx',
        'src/app/project/[id]/scheme/map/SchemeMapCanvas.tsx',
        'tests/scheme-view-contract.test.ts',
        'tests/scheme-layer-lifecycle.test.ts',
        'tests/scheme-hook-lifecycle.test.tsx',
        'tests/scheme-map-page.test.tsx',
        'tests/fixtures/schemeView.ts',
      ]
    : []),
  ...(exportMode
    ? [
        'scripts/verify-scheme-export-cases.mjs',
        'src/lib/scheme/exportContract.ts',
        'src/lib/scheme/exportArtifact.ts',
        'src/lib/scheme/exportCommands.ts',
        'src/lib/scheme/exportJournal.ts',
        'src/lib/scheme/exportRoute.ts',
        'src/lib/scheme/exportPending.ts',
        'src/lib/scheme/exportClient.ts',
        'src/lib/scheme/exportHistory.ts',
        'src/components/scheme/SchemeExportHistory.tsx',
        'src/app/api/storage/route.ts',
        'src/lib/apiHandler.ts',
        'scripts/verify-scheme-export-artifacts.py',
        'src/lib/db/migrations/120_scheme_export_requests.sql',
        'src/lib/deliverables/deliverableRegister.ts',
        'src/lib/observations/observationBatches.ts',
        'src/lib/storage.ts',
        'src/app/api/scheme/export/dxf/route.ts',
        'src/app/api/scheme/export/geojson/route.ts',
        'src/app/api/project/[id]/scheme/exports/route.ts',
        'src/app/project/[id]/scheme/exports/page.tsx',
        'src/components/scheme/SchemeExportReview.tsx',
        'src/app/project/[id]/StagePage.tsx',
        'tests/scheme-export-route.test.ts',
        'tests/scheme-export-artifact.test.ts',
        'tests/scheme-export-pending.test.ts',
        'tests/scheme-export-client.test.ts',
        'tests/scheme-export-ui.test.tsx',
        'tests/scheme-export-history.test.tsx',
        'tests/scheme-deliver-routing.test.tsx',
        'tests/scheme-stream-middleware.test.ts',
        'tests/storage-ownership-regression.test.ts',
        'tests/block-parcel-register.test.tsx',
        'src/lib/surveyMapEngine/__tests__/revisionsOfflineContracts.test.ts',
      ]
    : []),
]
const hashes = () =>
  Object.fromEntries(
    files.map((file) => [
      file,
      createHash('sha256').update(readFileSync(file)).digest('hex'),
    ]),
  )
const report = {
  checkedAt: new Date().toISOString(),
  authentication:
    'bounded adapter; actual handlers, SQL, PostGIS and fixture RLS are distinct from ordinary-account HTTP and production',
  source: hashes(),
  fixtureSchema: schema,
  checks: [],
}
const reportRoot = shareMode ? '.cache/parcel-draft-sharing' : exportMode
  ? '.cache/scheme-boundary-export'
  : viewMode
    ? '.cache/scheme-geometry-view'
    : '.cache/reviewed-boundary'
mkdirSync(reportRoot, { recursive: true })
const record = () =>
  writeFileSync(
    `${reportRoot}/native.json`,
    JSON.stringify(report, null, 2) + '\n',
  )
const fingerprint = async () => {
  const output = {}
  for (const table of [
    'projects',
    'parcels',
    'parcel_traverses',
    'traverse_coordinates',
    'traverse_observations',
    'users',
    'blocks',
    ...(shareMode ? ['surveyor_profiles'] : []),
    ...(exportMode
      ? [
          'deliverables',
          'deliverable_revisions',
          'evidence_events',
          'file_uploads',
        ]
      : []),
  ])
    output[table] = (
      await admin.query(
        `SELECT count(*)::int count,md5(COALESCE(string_agg(row_to_json(r)::text,E'\n' ORDER BY row_to_json(r)::text),'')) hash FROM public.${table} r`,
      )
    ).rows[0]
  return output
}
const state = async () => {
  const output = {}
  for (const table of ['parcels', 'parcel_boundary_drafts', 'fixture_audit'])
    output[table] = (
      await pool.query(`SELECT row_to_json(r) data FROM ${table} r ORDER BY id`)
    ).rows.map((row) => row.data)
  return output
}
async function reset() {
  fault = ''
  await pool.query(
    'TRUNCATE fixture_audit,parcel_boundary_drafts,traverse_coordinates,traverse_observations,parcel_traverses,parcels,blocks,project_reference_systems,projects,users CASCADE',
  )
  await pool.query('INSERT INTO users VALUES($1),($2)', [actor, other])
  await pool.query('INSERT INTO projects(id,user_id) VALUES($1,$2),($3,$2)', [
    project,
    actor,
    secondProject,
  ])
  await pool.query(
    "INSERT INTO project_reference_systems(id,project_id,horizontal_crs,notes) VALUES(gen_random_uuid(),$1,'EPSG:32737','SYNTHETIC reference declaration')",
    [project],
  )
  await pool.query(
    "INSERT INTO parcels(id,project_id,parcel_number,status,updated_at) VALUES($1,$2,'SYN-A','pending',$3)",
    [parcel, project, version],
  )
  await pool.query(
    "INSERT INTO parcel_traverses(id,project_id,parcel_id,traverse_name,status,updated_at) VALUES($1,$2,$3,'SYNTHETIC traverse','computed',$4)",
    [traverse, project, parcel, version],
  )
  for (let i = 0; i < 4; i++) {
    const [e, n] = [
      [500000, 9500000],
      [500010, 9500000],
      [500010, 9500020],
      [500000, 9500020],
    ][i]
    await pool.query(
      'INSERT INTO traverse_coordinates(id,traverse_id,station_name,easting,northing,elevation) VALUES($1,$2,$3,$4,$5,$6)',
      [
        points[i],
        traverse,
        ['T10', 'T2', 'T1', 'T3'][i],
        e,
        n,
        i === 0 ? 0 : null,
      ],
    )
  }
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
  record()
}
let original,
  ledger,
  created = false
let expectedViewCases = 0
let expectedExportCases = 0
let expectedShareCases = 0
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
  assert.ok(
    (
      await admin.query(
        "SELECT to_regprocedure('public.st_geomfromgeojson(text)') postgis,to_regprocedure('public.digest(bytea,text)') digest",
      )
    ).rows[0].postgis,
    'Existing fixture database needs PostGIS; no extension is installed by this verifier',
  )
  original = await fingerprint()
  ledger = (
    await admin.query(
      'SELECT version,checksum FROM public.schema_migrations ORDER BY version',
    )
  ).rows
  await admin.query(
    `CREATE SCHEMA ${schema};COMMENT ON SCHEMA ${schema} IS '${marker}'`,
  )
  created = true
  await pool.query(`CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,name text NOT NULL DEFAULT 'SYNTHETIC geometry project');
 CREATE TABLE blocks(id uuid PRIMARY KEY,project_id uuid REFERENCES projects(id) ON DELETE CASCADE,block_number text);
 CREATE TABLE project_reference_systems(id uuid PRIMARY KEY,project_id uuid UNIQUE REFERENCES projects(id) ON DELETE CASCADE,horizontal_crs text,notes text);
 CREATE TABLE parcels(id uuid PRIMARY KEY,project_id uuid REFERENCES projects(id) ON DELETE CASCADE,block_id uuid,parcel_number text,status text,revision_number integer DEFAULT 0,lr_number_confirmed text,area_ha numeric(12,6),geom public.geometry(Polygon),boundary_geojson jsonb,updated_at timestamptz);
 CREATE TABLE parcel_traverses(id uuid PRIMARY KEY,project_id uuid REFERENCES projects(id) ON DELETE CASCADE,parcel_id uuid REFERENCES parcels(id) ON DELETE CASCADE,traverse_name text,status text,version integer DEFAULT 1,updated_at timestamptz);
 CREATE TABLE traverse_coordinates(id uuid PRIMARY KEY,traverse_id uuid REFERENCES parcel_traverses(id) ON DELETE CASCADE,station_name text,station text,easting numeric,northing numeric,elevation numeric,rl numeric);
 CREATE TABLE traverse_observations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),traverse_id uuid REFERENCES parcel_traverses(id) ON DELETE CASCADE,station_from text,station_to text,distance numeric,bearing numeric,remarks text);
 CREATE TABLE fixture_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),parcel_id uuid,snapshot jsonb);
 CREATE FUNCTION fixture_audit_and_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('metardu_fixture.boundary_fault',true)='suppress' THEN RETURN NULL;END IF;
 IF current_setting('metardu_fixture.boundary_fault',true)='changed_geom' THEN NEW.geom=public.ST_Translate(NEW.geom,1,0);END IF;
 IF current_setting('metardu_fixture.boundary_fault',true)='retained_timestamp' THEN NEW.updated_at=OLD.updated_at;END IF;
 INSERT INTO fixture_audit(parcel_id,snapshot) VALUES(OLD.id,to_jsonb(OLD));RETURN NEW;END $$;
 CREATE TRIGGER fixture_parcel_write BEFORE UPDATE ON parcels FOR EACH ROW EXECUTE FUNCTION fixture_audit_and_fault();`)
  const migration = readFileSync(
    'src/lib/db/migrations/119_reviewed_parcel_boundary_drafts.sql',
    'utf8',
  )
    .split('-- DOWN:')[0]
    .replaceAll(
      'public.parcel_boundary_drafts',
      `${schema}.parcel_boundary_drafts`,
    )
    .replaceAll(
      'public.reject_parcel_boundary_draft_update',
      `${schema}.reject_parcel_boundary_draft_update`,
    )
    .replaceAll('public.users', `${schema}.users`)
    .replaceAll('public.projects', `${schema}.projects`)
    .replaceAll('public.parcels', `${schema}.parcels`)
    .replaceAll('public.parcel_traverses', `${schema}.parcel_traverses`)
  await pool.query(migration)
  await pool.query(`CREATE FUNCTION fixture_receipt_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('metardu_fixture.boundary_fault',true)='receipt_suppress' THEN RETURN NULL;END IF;
 IF current_setting('metardu_fixture.boundary_fault',true)='receipt_change' THEN NEW.receipt=jsonb_set(NEW.receipt,'{areaHa}','999'::jsonb);END IF;RETURN NEW;END $$;
 CREATE TRIGGER fixture_receipt_fault BEFORE INSERT ON parcel_boundary_drafts FOR EACH ROW EXECUTE FUNCTION fixture_receipt_fault();`)
  await check('ordinary unauthenticated calls are refused', async () =>
    assert.equal((await get({}, null)).status, 401),
  )
  await check(
    'parcel source directory is owner-bound and explicitly selected',
    async () => {
      const response = await get({})
      assert.equal(response.status, 200)
      const body = (await response.json()).data
      assert.equal(body.total, 1)
      assert.equal(body.traverses[0].id, traverse)
      assert.equal(body.parcelId, parcel)
      assert.equal((await get({}, other)).status, 404)
    },
  )
  await check(
    'canonical station names and zero/unknown elevations are retained',
    async () => {
      const data = await read()
      assert.equal(
        data.points.find((point) => point.id === points[0]).elevation,
        0,
      )
      assert.equal(
        data.points.find((point) => point.id === points[1]).elevation,
        null,
      )
      assert.equal(
        data.points.find((point) => point.id === points[0]).station,
        'T10',
      )
    },
  )
  await check(
    'explicit vertex IDs create the analytical rectangle in real PostGIS',
    async () => {
      const response = await save(await command())
      assert.equal(response.status, 200, await response.clone().text())
      const receipt = (await response.json()).data
      assert.equal(receipt.gridAreaSqM, 200)
      assert.equal(receipt.gridPerimeterM, 60)
      assert.equal(receipt.status, 'draft_unverified')
      const row = (
        await pool.query(
          'SELECT public.ST_Area(geom) area,public.ST_SRID(geom) srid,status,revision_number FROM parcels WHERE id=$1',
          [parcel],
        )
      ).rows[0]
      assert.equal(row.area, 200)
      assert.equal(row.srid, 32737)
      assert.equal(row.status, 'pending')
      assert.equal(row.revision_number, 1)
      assert.equal((await state()).parcel_boundary_drafts.length, 1)
    },
  )
  for (const crs of ['EPSG:21036', 'EPSG:32632'])
    await check(
      `explicit project CRS ${crs} is stored without a Kenyan default`,
      async () => {
        await pool.query(
          'UPDATE project_reference_systems SET horizontal_crs=$1 WHERE project_id=$2',
          [crs, project],
        )
        const body = await command()
        body.source_crs = crs
        const response = await save(body)
        assert.equal(response.status, 200, await response.clone().text())
        assert.equal(
          (
            await pool.query(
              'SELECT public.ST_SRID(geom) srid FROM parcels WHERE id=$1',
              [parcel],
            )
          ).rows[0].srid,
          Number(crs.slice(5)),
        )
      },
    )
  await check(
    'the exact prior geometry and supplied area survive replacement in the snapshot',
    async () => {
      await pool.query(
        "UPDATE parcels SET geom=public.ST_GeomFromText('POLYGON((1 1,4 1,4 5,1 5,1 1))',21037),area_ha=0.123456 WHERE id=$1",
        [parcel],
      )
      const original = (
        await pool.query(
          "SELECT encode(public.ST_AsEWKB(geom),'hex') ewkb FROM parcels WHERE id=$1",
          [parcel],
        )
      ).rows[0].ewkb
      assert.equal((await save(await command())).status, 200)
      const retained = (
        await pool.query('SELECT snapshot FROM parcel_boundary_drafts')
      ).rows[0].snapshot
      assert.equal(retained.previousGeometry.ewkb, original)
      assert.equal(retained.previousGeometry.previous_area_ha, '0.123456')
      assert.equal(
        retained.source.rawPoints.find((point) => point.id === points[0])
          .easting,
        '500000',
      )
    },
  )
  await check(
    'original observation bytes are retained and changed observations invalidate review',
    async () => {
      await pool.query(
        "INSERT INTO traverse_observations(traverse_id,station_from,station_to,distance,bearing) VALUES($1,'T10','T2',10,0.123456789012345678901234)",
        [traverse],
      )
      const stale = await command()
      await pool.query(
        'UPDATE traverse_observations SET distance=11 WHERE traverse_id=$1',
        [traverse],
      )
      assert.equal((await save(stale)).status, 409)
      assert.equal((await save(await command())).status, 200)
      const original = (
        await pool.query('SELECT snapshot FROM parcel_boundary_drafts')
      ).rows[0].snapshot.source.originalObservations
      assert.equal(original.length, 1)
      assert.ok(original[0].includes('0.123456789012345678901234'))
      assert.ok(original[0].includes('"distance": 11'))
    },
  )
  await check(
    '500-coordinate source remains bounded and preserves all retained IDs',
    async () => {
      await pool.query(
        'INSERT INTO traverse_coordinates(id,traverse_id,station_name,easting,northing) SELECT gen_random_uuid(),$1,i::text,i,i FROM generate_series(1,496) i',
        [traverse],
      )
      const response = await get({ traverse_id: traverse })
      assert.equal(response.status, 200)
      const text = await response.text(),
        data = JSON.parse(text).data
      assert.equal(data.points.length, 500)
      assert.equal(new Set(data.points.map((point) => point.id)).size, 500)
      report.profile = {
        synthetic: true,
        sourceCoordinates: 500,
        responseBytes: Buffer.byteLength(text),
        candidatePageSize: 24,
      }
    },
  )
  await check(
    'oversized original observation payload is refused without clipping its contents',
    async () => {
      await pool.query(
        "INSERT INTO traverse_observations(traverse_id,remarks) VALUES($1,repeat('x',4194305))",
        [traverse],
      )
      assert.equal((await get({ traverse_id: traverse })).status, 413)
      assert.equal(
        (
          await pool.query(
            'SELECT length(remarks) length FROM traverse_observations',
          )
        ).rows[0].length,
        4194305,
      )
    },
  )
  await check(
    'oversized prior boundary is retained and cannot be overwritten through the draft window',
    async () => {
      await pool.query(
        "UPDATE parcels SET boundary_geojson=jsonb_build_object('padding',repeat('x',16777217)) WHERE id=$1",
        [parcel],
      )
      const original = (
        await pool.query(
          'SELECT md5(boundary_geojson::text) hash,revision_number,xmin::text version FROM parcels WHERE id=$1',
          [parcel],
        )
      ).rows[0]
      const body = await command()
      assert.equal((await save(body)).status, 413)
      assert.deepEqual(
        (
          await pool.query(
            'SELECT md5(boundary_geojson::text) hash,revision_number,xmin::text version FROM parcels WHERE id=$1',
            [parcel],
          )
        ).rows[0],
        original,
      )
      assert.equal(
        (await pool.query('SELECT id FROM parcel_boundary_drafts')).rows.length,
        0,
      )
    },
  )
  await check(
    'lost acknowledgement replays the exact retained receipt without another revision',
    async () => {
      const body = await command(),
        first = await save(body)
      assert.equal(first.status, 200)
      const expected = await first.json(),
        before = await state(),
        second = await save(body)
      assert.equal(second.status, 200)
      assert.deepEqual(await second.json(), expected)
      assert.deepEqual(await state(), before)
    },
  )
  await check(
    'same command from concurrent clients commits exactly one revision',
    async () => {
      const body = await command(),
        responses = await Promise.all([save(body), save(body)])
      assert.deepEqual(
        responses.map((response) => response.status),
        [200, 200],
      )
      assert.deepEqual(await responses[0].json(), await responses[1].json())
      assert.equal((await state()).parcel_boundary_drafts.length, 1)
      assert.equal((await state()).parcels[0].revision_number, 1)
    },
  )
  await check(
    'competing reviewed commands refuse the stale second change',
    async () => {
      const first = await command(),
        second = {
          ...first,
          request_id: randomUUID(),
          note: 'SYNTHETIC competing intent',
        }
      const responses = await Promise.all([save(first), save(second)])
      assert.deepEqual(
        responses.map((response) => response.status).sort(),
        [200, 409],
      )
      assert.equal((await state()).parcel_boundary_drafts.length, 1)
    },
  )
  await check(
    'receipt lookup recovers the saved request with owner and scope checks',
    async () => {
      const body = await command()
      assert.equal((await save(body)).status, 200)
      const result = await get({ request_id: body.request_id })
      assert.equal(result.status, 200)
      assert.equal((await result.json()).data.requestId, body.request_id)
      assert.equal(
        (await get({ request_id: body.request_id }, other)).status,
        404,
      )
      assert.equal(
        (await get({ request_id: body.request_id }, actor, secondProject))
          .status,
        404,
      )
    },
  )
  await check(
    'a retained request cannot be replayed through a different project scope',
    async () => {
      const body = await command()
      assert.equal((await save(body)).status, 200)
      const before = await state()
      assert.equal((await save(body, actor, secondProject)).status, 409)
      assert.deepEqual(await state(), before)
    },
  )
  await check(
    'reuse of a request ID for changed intent is refused',
    async () => {
      const body = await command()
      assert.equal((await save(body)).status, 200)
      const before = await state()
      assert.equal((await save({ ...body, note: 'changed' })).status, 409)
      assert.deepEqual(await state(), before)
    },
  )
  for (const mode of [
    'suppress',
    'changed_geom',
    'retained_timestamp',
    'receipt_suppress',
    'receipt_change',
  ])
    await check(
      `${mode} acknowledgement fault rolls back geometry and trigger history`,
      async () => {
        const body = await command(),
          before = await state()
        fault = mode
        assert.equal((await save(body)).status, 500)
        assert.deepEqual(await state(), before)
      },
    )
  for (const change of ['coordinate', 'reference', 'parcel', 'traverse'])
    await check(
      `changed ${change} evidence refuses the reviewed draft`,
      async () => {
        const body = await command()
        if (change === 'coordinate')
          await pool.query(
            'UPDATE traverse_coordinates SET easting=easting+1 WHERE id=$1',
            [points[0]],
          )
        if (change === 'reference')
          await pool.query(
            "UPDATE project_reference_systems SET notes='SYNTHETIC changed' WHERE project_id=$1",
            [project],
          )
        if (change === 'parcel')
          await pool.query(
            "UPDATE parcels SET parcel_number='SYN-CHANGED' WHERE id=$1",
            [parcel],
          )
        if (change === 'traverse')
          await pool.query(
            'UPDATE parcel_traverses SET version=version+1 WHERE id=$1',
            [traverse],
          )
        const before = await state()
        assert.equal((await save(body)).status, 409)
        assert.deepEqual(await state(), before)
      },
    )
  await check('owner transfer after review refuses writes', async () => {
    const body = await command()
    await pool.query('UPDATE projects SET user_id=$1 WHERE id=$2', [
      other,
      project,
    ])
    const before = await state()
    assert.equal((await save(body)).status, 404)
    assert.deepEqual(await state(), before)
  })
  await check(
    'foreign project/parcel/traverse scope cannot write',
    async () => {
      const body = await command(),
        before = await state()
      assert.equal((await save(body, actor, secondProject)).status, 404)
      assert.equal(
        (await save({ ...body, traverse_id: randomUUID() })).status,
        404,
      )
      assert.deepEqual(await state(), before)
    },
  )
  await check('crossed and foreign vertex orders cannot write', async () => {
    const body = await command(),
      before = await state()
    assert.equal(
      (
        await save({
          ...body,
          ordered_coordinate_ids: [points[0], points[2], points[1], points[3]],
        })
      ).status,
      400,
    )
    assert.equal(
      (
        await save({
          ...body,
          ordered_coordinate_ids: [points[0], points[1], randomUUID()],
        })
      ).status,
      400,
    )
    assert.deepEqual(await state(), before)
  })
  for (const crs of ['EPSG:3857', 'EPSG:4326', ''])
    await check(
      `source read refuses invalid project reference ${crs || 'missing'}`,
      async () => {
        await pool.query(
          'UPDATE project_reference_systems SET horizontal_crs=$1 WHERE project_id=$2',
          [crs, project],
        )
        assert.equal((await get({ traverse_id: traverse })).status, 409)
      },
    )
  await check('command cannot substitute another grid', async () => {
    const body = await command(),
      before = await state()
    assert.equal(
      (await save({ ...body, source_crs: 'EPSG:21037' })).status,
      400,
    )
    assert.deepEqual(await state(), before)
  })
  await check(
    'unknown or nonfinite coordinates refuse source review',
    async () => {
      await pool.query(
        'UPDATE traverse_coordinates SET northing=NULL WHERE id=$1',
        [points[0]],
      )
      assert.equal((await get({ traverse_id: traverse })).status, 409)
      await pool.query(
        "UPDATE traverse_coordinates SET northing='NaN' WHERE id=$1",
        [points[0]],
      )
      assert.equal((await get({ traverse_id: traverse })).status, 409)
    },
  )
  await check(
    'ambiguous historical coordinate aliases refuse source review',
    async () => {
      await pool.query(
        "UPDATE traverse_coordinates SET station='CONFLICT' WHERE id=$1",
        [points[0]],
      )
      assert.equal((await get({ traverse_id: traverse })).status, 409)
    },
  )
  await check(
    'oversized source is refused rather than truncated into a boundary',
    async () => {
      await pool.query(
        'INSERT INTO traverse_coordinates(id,traverse_id,station_name,easting,northing) SELECT gen_random_uuid(),$1,i::text,i,i FROM generate_series(1,497) i',
        [traverse],
      )
      assert.equal((await get({ traverse_id: traverse })).status, 413)
    },
  )
  for (const status of [
    'plan_generated',
    'submitted',
    'approved',
    'UNRECOGNIZED',
  ])
    await check(
      `retained ${status} parcel state prevents replacement`,
      async () => {
        await pool.query('UPDATE parcels SET status=$1 WHERE id=$2', [
          status,
          parcel,
        ])
        const body = await command(),
          before = await state()
        assert.equal((await save(body)).status, 409)
        assert.deepEqual(await state(), before)
      },
    )
  await check('confirmed LR evidence prevents replacement', async () => {
    await pool.query(
      "UPDATE parcels SET lr_number_confirmed='SYNTHETIC confirmed' WHERE id=$1",
      [parcel],
    )
    const body = await command(),
      before = await state()
    assert.equal((await save(body)).status, 409)
    assert.deepEqual(await state(), before)
  })
  await check(
    'retained receipt forbids direct source deletion at commit',
    async () => {
      assert.equal((await save(await command())).status, 200)
      const before = await state(),
        client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('DELETE FROM parcel_traverses WHERE id=$1', [
          traverse,
        ])
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
    'whole-project graph lifecycle preserves unrelated project',
    async () => {
      assert.equal((await save(await command())).status, 200)
      await pool.query('DELETE FROM projects WHERE id=$1', [project])
      assert.equal((await state()).parcel_boundary_drafts.length, 0)
      assert.equal(
        (
          await pool.query('SELECT id FROM projects WHERE id=$1', [
            secondProject,
          ])
        ).rows.length,
        1,
      )
    },
  )
  await check(
    'whole-account lifecycle removes its own graph without touching unrelated ownership',
    async () => {
      assert.equal((await save(await command())).status, 200)
      await pool.query('UPDATE projects SET user_id=$1 WHERE id=$2', [
        other,
        secondProject,
      ])
      await pool.query('DELETE FROM users WHERE id=$1', [actor])
      assert.equal((await state()).parcel_boundary_drafts.length, 0)
      assert.equal(
        (
          await pool.query('SELECT id FROM projects WHERE id=$1', [
            secondProject,
          ])
        ).rows.length,
        1,
      )
    },
  )
  await check(
    'deleting a former actor cannot erase transferred project history',
    async () => {
      assert.equal((await save(await command())).status, 200)
      await pool.query('UPDATE projects SET user_id=$1 WHERE id=$2', [
        other,
        project,
      ])
      const before = await state()
      await assert.rejects(
        pool.query('DELETE FROM users WHERE id=$1', [actor]),
        (error) => error.code === '23503',
      )
      assert.deepEqual(await state(), before)
      assert.equal(
        (await pool.query('SELECT id FROM users WHERE id=$1', [actor])).rows
          .length,
        1,
      )
    },
  )
  await check('stored boundary draft cannot be updated', async () => {
    assert.equal((await save(await command())).status, 200)
    await assert.rejects(
      pool.query("UPDATE parcel_boundary_drafts SET input_hash=repeat('a',64)"),
      (error) => error.code === '42501',
    )
  })
  await check(
    'fixture authenticated role can read only its retained receipts and cannot mutate history',
    async () => {
      assert.equal((await save(await command())).status, 200)
      await pool.query(
        `GRANT USAGE ON SCHEMA ${schema} TO authenticated;GRANT SELECT ON projects,parcels,parcel_traverses TO authenticated`,
      )
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SET LOCAL ROLE authenticated')
        await client.query("SELECT set_config('request.user_id',$1,true)", [
          actor,
        ])
        assert.equal(
          (await client.query('SELECT id FROM parcel_boundary_drafts')).rows
            .length,
          1,
        )
        await client.query("SELECT set_config('request.user_id',$1,true)", [
          other,
        ])
        assert.equal(
          (await client.query('SELECT id FROM parcel_boundary_drafts')).rows
            .length,
          0,
        )
        await client.query('SAVEPOINT denied')
        await assert.rejects(
          client.query('DELETE FROM parcel_boundary_drafts'),
          (error) => error.code === '42501',
        )
        await client.query('ROLLBACK TO SAVEPOINT denied')
        await assert.rejects(
          client.query(
            "UPDATE parcel_boundary_drafts SET input_hash=repeat('a',64)",
          ),
          (error) => error.code === '42501',
        )
        await client.query('ROLLBACK TO SAVEPOINT denied')
        await assert.rejects(
          client.query(
            "INSERT INTO parcel_boundary_drafts(id,actor_id,request_id,project_id,parcel_id,traverse_id,input_hash,evidence_hash,snapshot,receipt) VALUES($1,$2,$3,$4,$5,$6,repeat('a',64),repeat('b',64),'{}','{}')",
            [randomUUID(), other, randomUUID(), project, parcel, traverse],
          ),
          (error) => error.code === '42501',
        )
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    },
  )
  await check('missing receipt storage fails before any write', async () => {
    const body = await command(),
      before = await state()
    await pool.query(
      'ALTER TABLE parcel_boundary_drafts RENAME TO fixture_unavailable_drafts',
    )
    try {
      const readable = await get({ traverse_id: traverse })
      assert.equal(readable.status, 200)
      assert.equal((await readable.json()).data.storageReady, false)
      assert.equal((await save(body)).status, 503)
    } finally {
      await pool.query(
        'ALTER TABLE fixture_unavailable_drafts RENAME TO parcel_boundary_drafts',
      )
    }
    assert.deepEqual(await state(), before)
  })
  await check(
    'bounded candidate pagination does not download coordinate payloads',
    async () => {
      await pool.query(
        "INSERT INTO parcel_traverses(id,project_id,parcel_id,traverse_name,status) SELECT gen_random_uuid(),$1,$2,'SYNTHETIC '||i,'computed' FROM generate_series(1,25) i",
        [project, parcel],
      )
      const first = (await (await get({})).json()).data,
        second = (await (await get({ page: '2' })).json()).data
      assert.equal(first.total, 26)
      assert.equal(first.traverses.length, 24)
      assert.equal(second.traverses.length, 2)
      assert.equal(
        first.traverses.some((a) =>
          second.traverses.some((b) => a.id === b.id),
        ),
        false,
      )
      assert.equal(JSON.stringify(first).includes('easting'), false)
    },
  )
  await check('stream body limit refuses oversized commands', async () => {
    const before = await state()
    assert.equal((await save({ padding: 'x'.repeat(66000) })).status, 413)
    assert.deepEqual(await state(), before)
  })
  if (viewMode) {
    const cases = await import('./verify-scheme-view-cases.mjs')
    expectedViewCases = cases.EXPECTED_CASES
    await cases.verifySchemeViews({
      check,
      pool,
      actor,
      other,
      project,
      secondProject,
      parcel,
      traverse,
      points,
      command,
      save,
      report,
      require,
      randomUUID,
    })
  }
  if (exportMode) {
    const cases = await import('./verify-scheme-export-cases.mjs')
    if (shareMode) expectedShareCases = (await import('./verify-parcel-sharing-cases.mjs')).EXPECTED_CASES
    expectedExportCases = cases.EXPECTED_CASES
    await cases.verifySchemeExports({
      check,
      pool,
      actor,
      other,
      project,
      secondProject,
      parcel,
      traverse,
      points,
      command,
      save,
      report,
      require,
      randomUUID,
      reset,
      schema,
      token,
      reportRoot,
      shareMode,
      setFault: (value) => {
        fault = value
      },
      setFeatureAllowed: (value) => {
        schemeExportAllowed = value
      },
    })
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
      report.checks.length === 50 + expectedViewCases + expectedExportCases + expectedShareCases &&
      report.checks.every((row) => row.passed) &&
      report.ownedFixtureRemoved &&
      (!exportMode || report.ownedExportFilesRemoved === true) &&
      report.originalRecordsPreserved &&
      report.migrationLedgerPreserved
        ? 'passed'
        : 'failed'
    record()
  } finally {
    await admin.end()
  }
}
process.exitCode = report.status === 'passed' ? 0 : 1
