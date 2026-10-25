import assert from 'node:assert/strict'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  realpathSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
export const EXPECTED_CASES = 48
export async function verifySchemeExports(c) {
  const {
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
    setFault,
    setFeatureAllowed,
  } = c
  const storageBase = path.resolve('.cache/scheme-export-native'),
    storageRoot = path.join(storageBase, token)
  assert.equal(path.dirname(storageRoot), storageBase)
  assert.match(token, /^[a-f0-9-]{36}$/)
  assert.ok(!existsSync(storageRoot))
  mkdirSync(storageRoot, { recursive: true })
  const marker = {
    schema,
    token,
    purpose: 'METARDU owned scheme export fixture',
  }
  writeFileSync(
    path.join(storageRoot, '.fixture-owner.json'),
    JSON.stringify(marker),
  )
  process.env.STORAGE_ROOT = storageRoot
  process.env.GCS_PROJECT_ID = ''
  process.env.GCS_BUCKET_NAME = ''
  const { NextRequest } = require('next/server'),
    {
      GET: preview,
    } = require('../src/app/api/project/[id]/scheme/exports/route.ts'),
    {
      GET: geoGet,
      POST: geoPost,
    } = require('../src/app/api/scheme/export/geojson/route.ts'),
    {
      GET: dxfGet,
      POST: dxfPost,
    } = require('../src/app/api/scheme/export/dxf/route.ts')
  const {
    GET: storageGet,
    POST: storagePost,
    DELETE: storageDelete,
  } = require('../src/app/api/storage/route.ts')
  const {
    readBoundarySource,
  } = require('../src/lib/scheme/reviewedBoundaryCommands.ts')
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
  const inventory = () => {
    const out = {}
    function walk(folder) {
      for (const name of readdirSync(folder)) {
        const file = path.join(folder, name),
          stat = lstatSync(file)
        assert.ok(!stat.isSymbolicLink())
        if (stat.isDirectory()) walk(file)
        else
          out[path.relative(storageRoot, file).replaceAll('\\', '/')] = digest(
            readFileSync(file),
          )
      }
    }
    walk(storageRoot)
    return out
  }
  const state = async () => {
    const output = { files: inventory() }
    for (const table of [
      'deliverables',
      'deliverable_revisions',
      'evidence_events',
      'file_uploads',
      'scheme_export_requests',
    ])
      output[table] = (
        await pool.query(
          `SELECT row_to_json(r) data FROM ${table} r ORDER BY id`,
        )
      ).rows.map((row) => row.data)
    return output
  }
  const post = (body, format = 'geojson', user = actor, cancel = false) =>
    (format === 'dxf' ? dxfPost : geoPost)(
      new NextRequest(
        `http://127.0.0.1:3021/api/scheme/export/${format}${cancel ? '?action=cancel' : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
      user,
      body.projectId,
    )
  const recover = (body, format = 'geojson', user = actor) =>
    (format === 'dxf' ? dxfGet : geoGet)(
      new NextRequest(
        `http://127.0.0.1:3021/api/scheme/export/${format}?${new URLSearchParams({ project_id: body.projectId, request_id: body.requestId })}`,
      ),
      user,
      body.projectId,
    )
  const selection = (ids = [parcel], user = actor, id = project) =>
    preview(
      new NextRequest(
        `http://127.0.0.1:3021/api/project/${id}/scheme/exports?${ids.map((value) => `parcel_id=${value}`).join('&')}`,
      ),
      user,
      id,
    )
  const full = async (response) => {
    assert.equal(response.status, 200, await response.clone().text())
    return Buffer.from(await response.arrayBuffer())
  }
  const fresh = async () => {
    await reset()
    setFeatureAllowed(true)
    const saved = await save(await command())
    assert.equal(saved.status, 200, await saved.clone().text())
    const response = await selection()
    assert.equal(response.status, 200, await response.clone().text())
    const data = (await response.json()).data
    return {
      projectId: project,
      expectedUserId: actor,
      requestId: randomUUID(),
      parcelIds: [parcel],
      sourceHash: data.sourceHash,
      reviewed: true,
    }
  }
  const registeredPath = async (requestId) =>
    (
      await pool.query(
        "SELECT r.storage_path FROM deliverable_revisions r WHERE r.manifest#>>'{request,id}'=$1",
        [requestId],
      )
    ).rows[0].storage_path
  try {
    const ddl = readFileSync(
      'src/lib/db/migrations/072_deliverables_computations_qa.sql',
      'utf8',
    )
      .split('-- ─── computation_runs')[0]
      .replaceAll('uuid_generate_v4()', 'public.uuid_generate_v4()')
    await pool.query(ddl)
    await pool.query(`CREATE TABLE evidence_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES projects(id) ON DELETE CASCADE,entity_type varchar(50),entity_id varchar(255),event_type varchar(50),details jsonb,user_id uuid REFERENCES users(id) ON DELETE SET NULL,event_hash varchar(64),previous_hash varchar(64),created_at timestamptz DEFAULT now());
   CREATE TABLE file_uploads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE SET NULL,project_id uuid REFERENCES projects(id) ON DELETE SET NULL,filename varchar(500),storage_path text,mime_type varchar(200),size_bytes bigint,sha256 varchar(64),upload_purpose varchar(100));`)
    let journal = readFileSync(
      'src/lib/db/migrations/120_scheme_export_requests.sql',
      'utf8',
    ).split('-- DOWN:')[0]
    for (const table of [
      'scheme_export_requests',
      'users',
      'projects',
      'deliverable_revisions',
      'deliverables',
    ])
      journal = journal.replaceAll(`public.${table}`, `${schema}.${table}`)
    journal = journal.replaceAll(
      'public.reject_scheme_export_request_update',
      `${schema}.reject_scheme_export_request_update`,
    )
    await pool.query(journal)
    await pool.query(`CREATE FUNCTION fixture_export_fault() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE f text:=current_setting('metardu_fixture.boundary_fault',true);BEGIN
   IF TG_TABLE_NAME='file_uploads' AND f='pause_file' THEN PERFORM pg_advisory_xact_lock(hashtextextended(current_schema()||':scheme-file-pause',0));END IF;
   IF (TG_TABLE_NAME='file_uploads' AND f='file_suppress') OR (TG_TABLE_NAME='deliverables' AND f='deliverable_suppress') OR (TG_TABLE_NAME='deliverable_revisions' AND f='revision_suppress') OR (TG_TABLE_NAME='evidence_events' AND f='evidence_suppress') OR (TG_TABLE_NAME='scheme_export_requests' AND f='journal_suppress') THEN RETURN NULL;END IF;
   IF TG_TABLE_NAME='file_uploads' AND f='file_change' THEN NEW.sha256=repeat('0',64);END IF;
   IF TG_TABLE_NAME='deliverables' AND f='deliverable_change' THEN NEW.status='APPROVED';END IF;
   IF TG_TABLE_NAME='deliverable_revisions' AND f='revision_change' THEN NEW.content_hash=repeat('0',64);END IF;
   IF TG_TABLE_NAME='evidence_events' AND f='evidence_change' THEN NEW.details=jsonb_set(NEW.details,'{content_hash}',to_jsonb(repeat('0',64)));END IF;
   IF TG_TABLE_NAME='evidence_events' AND f='evidence_hash_change' THEN NEW.event_hash=repeat('0',64);END IF;
   IF TG_TABLE_NAME='evidence_events' AND f='evidence_previous_change' THEN NEW.previous_hash=repeat('0',64);END IF;
   IF TG_TABLE_NAME='scheme_export_requests' AND f='journal_change' THEN NEW.receipt=jsonb_set(NEW.receipt,'{sourceHash}',to_jsonb(repeat('0',64)));END IF;
   RETURN NEW;END $$;
   CREATE TRIGGER file_fault BEFORE INSERT ON file_uploads FOR EACH ROW EXECUTE FUNCTION fixture_export_fault();
   CREATE TRIGGER deliverable_fault BEFORE INSERT OR UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION fixture_export_fault();
   CREATE TRIGGER revision_fault BEFORE INSERT ON deliverable_revisions FOR EACH ROW EXECUTE FUNCTION fixture_export_fault();
   CREATE TRIGGER event_fault BEFORE INSERT ON evidence_events FOR EACH ROW EXECUTE FUNCTION fixture_export_fault();
   CREATE TRIGGER export_request_fault BEFORE INSERT ON scheme_export_requests FOR EACH ROW EXECUTE FUNCTION fixture_export_fault();`)
    await check(
      'bare export GET cannot read or regenerate an entire project',
      async () => {
        await fresh()
        const before = await state()
        for (const handler of [geoGet, dxfGet])
          assert.equal(
            (
              await handler(
                new NextRequest(
                  `http://127.0.0.1:3021/api/scheme/export/geojson?project_id=${project}`,
                ),
                actor,
                project,
              )
            ).status,
            400,
          )
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'exact export preview is owner-bound and returns the selected saved source',
      async () => {
        const body = await fresh(),
          response = await selection()
        const data = (await response.json()).data
        assert.equal(data.viewerId, actor)
        assert.equal(data.sourceHash, body.sourceHash)
        assert.deepEqual(data.source.selection, [parcel])
        assert.equal((await selection([parcel], other)).status, 404)
        assert.equal((await selection([parcel], null)).status, 401)
      },
    )
    await check(
      'new DXF requires plan admission without altering any account',
      async () => {
        const body = await fresh(),
          before = await state()
        setFeatureAllowed(false)
        assert.equal((await post(body, 'dxf')).status, 403)
        assert.deepEqual(await state(), before)
      },
    )
    for (const format of ['dxf', 'geojson'])
      await check(
        `${format} stores the actual selected bytes, full grid source and atomic register`,
        async () => {
          const body = await fresh(),
            response = await post(body, format),
            bytes = await full(response),
            snapshot = await state()
          assert.equal(
            response.headers.get('X-Metardu-Content-SHA256'),
            digest(bytes),
          )
          assert.equal(snapshot.deliverables.length, 1)
          assert.equal(snapshot.deliverable_revisions.length, 1)
          assert.equal(snapshot.evidence_events.length, 1)
          assert.equal(snapshot.file_uploads.length, 1)
          assert.equal(snapshot.scheme_export_requests.length, 1)
          const revision = snapshot.deliverable_revisions[0]
          assert.equal(
            revision.project_crs,
            format === 'dxf' ? 'EPSG:32737' : 'EPSG:4326',
          )
          assert.equal(revision.manifest.sourceHash, body.sourceHash)
          assert.equal(revision.manifest.fieldVerified, false)
          assert.equal(snapshot.deliverables[0].status, 'IN_REVIEW')
          assert.equal(snapshot.scheme_export_requests[0].outcome, 'committed')
          assert.deepEqual(
            readFileSync(path.join(storageRoot, revision.storage_path)),
            bytes,
          )
          writeFileSync(`${reportRoot}/selected.${format}`, bytes)
          writeFileSync(
            `${reportRoot}/${format}-source.json`,
            JSON.stringify(revision.manifest, null, 2),
          )
          report[`${format}Artifact`] = {
            sha256: digest(bytes),
            bytes: bytes.length,
            sourceHash: body.sourceHash,
          }
          if (format === 'geojson') {
            const json = JSON.parse(bytes)
            assert.equal('crs' in json, false)
            assert.equal(json.features.length, 1)
            assert.equal(json.features[0].geometry.coordinates[0][0].length, 2)
          }
        },
      )
    await check(
      'paid artifact recovery does not generate or charge for a new DXF',
      async () => {
        const body = await fresh(),
          bytes = await full(await post(body, 'dxf'))
        setFeatureAllowed(false)
        const before = await state()
        assert.deepEqual(await full(await recover(body, 'dxf')), bytes)
        assert.deepEqual(await full(await post(body, 'dxf')), bytes)
        assert.equal(
          (await post({ ...body, requestId: randomUUID() }, 'dxf')).status,
          403,
        )
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'repeated POST and recovery reuse one revision and the exact retained file',
      async () => {
        const body = await fresh(),
          bytes = await full(await post(body)),
          before = await state()
        assert.deepEqual(await full(await post(body)), bytes)
        assert.deepEqual(await full(await recover(body)), bytes)
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'a lost COMMIT acknowledgement preserves the committed artifact for recovery',
      async () => {
        const body = await fresh()
        setFault('lost_commit_ack')
        assert.equal((await post(body)).status, 500)
        const before = await state()
        assert.equal(before.scheme_export_requests.length, 1)
        const response = await recover(body)
        await full(response)
        assert.equal(response.headers.get('X-Metardu-Replayed'), 'true')
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'concurrent duplicate requests register exactly one output',
      async () => {
        const body = await fresh(),
          responses = await Promise.all([post(body), post(body)])
        assert.deepEqual(await full(responses[0]), await full(responses[1]))
        assert.equal((await state()).deliverable_revisions.length, 1)
      },
    )
    await check(
      'a changed intent cannot reuse a committed request identity',
      async () => {
        const body = await fresh()
        await full(await post(body))
        const before = await state()
        assert.equal(
          (await post({ ...body, sourceHash: '0'.repeat(64) })).status,
          409,
        )
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'the same request cannot change its output format',
      async () => {
        const body = await fresh()
        await full(await post(body))
        const before = await state()
        assert.equal((await post(body, 'dxf')).status, 409)
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'changed coordinate, observation and reference evidence refuses new output',
      async () => {
        for (const sql of [
          'UPDATE traverse_coordinates SET easting=easting+1 WHERE id=$1',
          "UPDATE project_reference_systems SET notes='changed' WHERE project_id=$1",
          "UPDATE traverse_observations SET remarks='changed' WHERE traverse_id=$1",
        ]) {
          const body = await fresh()
          if (sql.includes('traverse_observations'))
            await pool.query(
              'INSERT INTO traverse_observations(traverse_id,remarks) VALUES($1,$2)',
              [traverse, 'new'],
            )
          else
            await pool.query(sql, [
              sql.includes('traverse_coordinates') ? points[0] : project,
            ])
          const before = await state()
          assert.equal((await post(body)).status, 409)
          assert.deepEqual(await state(), before)
        }
      },
    )
    await check(
      'station rows and unassessed geometry cannot produce reviewed exports',
      async () => {
        const body = await fresh()
        await pool.query('UPDATE parcels SET geom=NULL WHERE id=$1', [parcel])
        const before = await state()
        assert.equal((await selection()).status, 409)
        assert.equal((await post(body)).status, 409)
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'cancelling first durably prevents delayed generation and remains recoverable',
      async () => {
        const body = await fresh(),
          response = await post(body, 'geojson', actor, true)
        assert.equal(response.status, 200)
        assert.equal((await response.json()).data.outcome, 'cancelled')
        const before = await state()
        assert.equal(before.deliverable_revisions.length, 0)
        assert.equal(
          (await (await post(body)).json()).data.outcome,
          'cancelled',
        )
        assert.equal(
          (await (await recover(body)).json()).data.outcome,
          'cancelled',
        )
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'cancellation after commit returns the original file without another revision',
      async () => {
        const body = await fresh(),
          bytes = await full(await post(body)),
          before = await state()
        assert.deepEqual(
          await full(await post(body, 'geojson', actor, true)),
          bytes,
        )
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'concurrent cancellation and generation settle one immutable outcome',
      async () => {
        const body = await fresh(),
          responses = await Promise.all([
            post(body, 'geojson', actor, true),
            post(body),
          ])
        assert.ok(responses.every((value) => value.status === 200))
        const s = await state()
        assert.equal(s.scheme_export_requests.length, 1)
        const cancelled = s.scheme_export_requests[0].outcome === 'cancelled'
        assert.equal(s.deliverable_revisions.length, cancelled ? 0 : 1)
        if (cancelled)
          for (const response of responses)
            assert.equal((await response.json()).data.outcome, 'cancelled')
        else
          assert.deepEqual(await full(responses[0]), await full(responses[1]))
      },
    )
    await check(
      'historical recovery does not reproject or replace changed current work',
      async () => {
        const body = await fresh(),
          bytes = await full(await post(body))
        await pool.query(
          "UPDATE project_reference_systems SET horizontal_crs='EPSG:4326' WHERE project_id=$1",
          [project],
        )
        const before = await state()
        assert.deepEqual(await full(await recover(body)), bytes)
        assert.deepEqual(await full(await post(body)), bytes)
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'owner transfer prevents both former-owner and different-issuer recovery',
      async () => {
        const body = await fresh()
        await full(await post(body))
        await pool.query('UPDATE projects SET user_id=$1 WHERE id=$2', [
          other,
          project,
        ])
        const before = await state()
        assert.equal((await recover(body)).status, 404)
        assert.equal((await recover(body, 'geojson', other)).status, 404)
        assert.deepEqual(await state(), before)
      },
    )
    for (const mode of ['corrupt', 'missing', 'oversized'])
      await check(
        `${mode} retained bytes never cause replacement or a new revision`,
        async () => {
          const body = await fresh()
          await full(await post(body))
          const key = await registeredPath(body.requestId),
            file = path.join(storageRoot, key),
            original = readFileSync(file)
          if (mode === 'missing') rmSync(file)
          else
            writeFileSync(
              file,
              mode === 'corrupt' ? 'corrupt fixture' : Buffer.alloc(4194305),
            )
          const before = await state()
          assert.equal((await recover(body)).status, 409)
          assert.equal((await post(body)).status, 409)
          assert.deepEqual(await state(), before)
          writeFileSync(file, original)
        },
      )
    await check(
      'ambiguous file acknowledgements prevent recovery and preserve registration history',
      async () => {
        const body = await fresh()
        await full(await post(body))
        const key = await registeredPath(body.requestId)
        await pool.query(
          'INSERT INTO file_uploads(user_id,project_id,filename,storage_path,mime_type,size_bytes,sha256,upload_purpose) SELECT user_id,project_id,filename,storage_path,mime_type,size_bytes,sha256,upload_purpose FROM file_uploads WHERE storage_path=$1',
          [key],
        )
        const before = await state()
        assert.equal((await recover(body)).status, 409)
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'missing export-journal storage fails before any new file or ledger write',
      async () => {
        const body = await fresh()
        await pool.query(
          'ALTER TABLE scheme_export_requests RENAME TO fixture_unavailable_export_requests',
        )
        const before = inventory()
        try {
          assert.equal((await post(body)).status, 409)
          assert.deepEqual(inventory(), before)
          assert.equal(
            (await pool.query('SELECT count(*)::int n FROM deliverables'))
              .rows[0].n,
            0,
          )
        } finally {
          await pool.query(
            'ALTER TABLE fixture_unavailable_export_requests RENAME TO scheme_export_requests',
          )
        }
      },
    )
    await check(
      'journal policies isolate account reads and immutable outcomes',
      async () => {
        const body = await fresh()
        await post(body, 'geojson', actor, true)
        await pool.query(
          `GRANT SELECT ON deliverables,deliverable_revisions TO authenticated`,
        )
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query('SET LOCAL ROLE authenticated')
          await client.query("SELECT set_config('request.user_id',$1,true)", [
            other,
          ])
          assert.equal(
            (await client.query('SELECT * FROM scheme_export_requests')).rows
              .length,
            0,
          )
          await client.query("SELECT set_config('request.user_id',$1,true)", [
            actor,
          ])
          assert.equal(
            (await client.query('SELECT * FROM scheme_export_requests')).rows
              .length,
            1,
          )
          await assert.rejects(
            client.query(
              "UPDATE scheme_export_requests SET outcome='committed'",
            ),
          )
          await client.query('ROLLBACK')
        } finally {
          await client.query('ROLLBACK')
          client.release()
        }
        await assert.rejects(
          pool.query("UPDATE scheme_export_requests SET receipt='{}'::jsonb"),
        )
      },
    )
    await check(
      'authenticated journal append requires the exact owned registered revision',
      async () => {
        const body = await fresh()
        await full(await post(body))
        const row = (await pool.query('SELECT * FROM scheme_export_requests'))
            .rows[0],
          before = await state(),
          client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query('DELETE FROM scheme_export_requests WHERE id=$1', [
            row.id,
          ])
          await client.query('SET LOCAL ROLE authenticated')
          await client.query("SELECT set_config('request.user_id',$1,true)", [
            actor,
          ])
          const sql =
            'INSERT INTO scheme_export_requests(id,actor_id,project_id,request_id,format,request_hash,body,outcome,receipt,deliverable_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)'
          await client.query(sql, [
            row.id,
            actor,
            project,
            row.request_id,
            row.format,
            row.request_hash,
            JSON.stringify(row.body),
            row.outcome,
            JSON.stringify(row.receipt),
            row.deliverable_revision_id,
          ])
          await client.query('SAVEPOINT invalid_link')
          const request = randomUUID()
          await assert.rejects(
            client.query(sql, [
              randomUUID(),
              actor,
              project,
              request,
              row.format,
              row.request_hash,
              JSON.stringify({ ...row.body, requestId: request }),
              row.outcome,
              JSON.stringify({ ...row.receipt, requestId: request }),
              row.deliverable_revision_id,
            ]),
            (error) => error.code === '42501',
          )
          await client.query('ROLLBACK TO SAVEPOINT invalid_link')
          await client.query('ROLLBACK')
        } finally {
          await client.query('ROLLBACK')
          client.release()
        }
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'former actors cannot delete a transferred cancellation receipt',
      async () => {
        await reset()
        const body = {
          projectId: project,
          expectedUserId: actor,
          requestId: randomUUID(),
          parcelIds: [parcel],
          sourceHash: 'a'.repeat(64),
          reviewed: true,
        }
        assert.equal((await post(body, 'geojson', actor, true)).status, 200)
        await pool.query('UPDATE projects SET user_id=$1 WHERE id=$2', [
          other,
          project,
        ])
        const before = await state()
        await assert.rejects(
          pool.query('DELETE FROM users WHERE id=$1', [actor]),
        )
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'own cancellation project lifecycle preserves unrelated project ownership',
      async () => {
        const body = await fresh()
        await post(body, 'geojson', actor, true)
        await pool.query('DELETE FROM projects WHERE id=$1', [project])
        assert.equal(
          (
            await pool.query(
              'SELECT count(*)::int n FROM scheme_export_requests',
            )
          ).rows[0].n,
          0,
        )
        assert.equal(
          (
            await pool.query('SELECT user_id FROM projects WHERE id=$1', [
              secondProject,
            ])
          ).rows[0].user_id,
          actor,
        )
      },
    )
    await check(
      '50 reviewed parcels export together and a 51st ID is refused without truncation',
      async () => {
        await fresh()
        const ids = [parcel]
        for (let i = 1; i < 50; i++) {
          const p = randomUUID(),
            t = randomUUID(),
            ps = Array.from({ length: 4 }, () => randomUUID())
          ids.push(p)
          await pool.query(
            "INSERT INTO parcels(id,project_id,parcel_number,status,updated_at) VALUES($1,$2,$3,'pending',now());",
            [p, project, `SYN-${i}`],
          )
          await pool.query(
            "INSERT INTO parcel_traverses(id,project_id,parcel_id,status) VALUES($1,$2,$3,'computed')",
            [t, project, p],
          )
          for (let j = 0; j < 4; j++)
            await pool.query(
              'INSERT INTO traverse_coordinates(id,traverse_id,station_name,easting,northing,elevation) VALUES($1,$2,$3,$4,$5,NULL)',
              [
                ps[j],
                t,
                `P${j}`,
                500000 + i * 30 + (j === 1 || j === 2 ? 10 : 0),
                9500000 + (j >= 2 ? 20 : 0),
              ],
            )
          const source = await readBoundarySource(actor, project, p, t)
          const response = await save({
            parcel_id: p,
            traverse_id: t,
            request_id: randomUUID(),
            evidence_hash: source.evidenceHash,
            source_crs: 'EPSG:32737',
            ordered_coordinate_ids: ps,
            reviewed: true,
            note: 'SYNTHETIC selected export',
          })
          assert.equal(response.status, 200, await response.clone().text())
        }
        ids.sort()
        const response = await selection(ids)
        assert.equal(response.status, 200, await response.clone().text())
        const body = {
          projectId: project,
          expectedUserId: actor,
          requestId: randomUUID(),
          parcelIds: ids,
          sourceHash: (await response.json()).data.sourceHash,
          reviewed: true,
        }
        const bytes = await full(await post(body, 'dxf'))
        assert.equal(
          (bytes.toString().match(/\nLWPOLYLINE\n/g) || []).length,
          50,
        )
        const before = await state()
        assert.equal(
          (
            await post(
              {
                ...body,
                requestId: randomUUID(),
                parcelIds: [...ids, randomUUID()],
              },
              'dxf',
            )
          ).status,
          400,
        )
        assert.deepEqual(await state(), before)
        writeFileSync(path.join(reportRoot, 'selected50.dxf'), bytes)
        writeFileSync(
          path.join(reportRoot, 'dxf50-source.json'),
          JSON.stringify(
            (await state()).deliverable_revisions[0].manifest,
            null,
            2,
          ),
        )
        report.exportProfile = {
          synthetic: true,
          selectedParcels: 50,
          artifactBytes: bytes.length,
        }
      },
    )
    await check(
      'source row and FK-parent locks prevent edits during artifact publication',
      async () => {
        const body = await fresh(),
          blocker = await pool.connect()
        let running
        try {
          await blocker.query('BEGIN')
          await blocker.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
            [`${schema}:scheme-file-pause`],
          )
          setFault('pause_file')
          running = post(body)
          let waiting = false
          for (let i = 0; i < 100; i++) {
            const rows = await pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory' AND query LIKE 'INSERT INTO file_uploads%'",
              [`metardu-boundary-${token}`],
            )
            if (rows.rows.length) {
              waiting = true
              break
            }
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          assert.ok(
            waiting,
            'The actual export did not reach the owned publication pause.',
          )
          for (const [sql, values] of [
            [
              'UPDATE traverse_coordinates SET easting=easting+1 WHERE id=$1',
              [points[0]],
            ],
            [
              'INSERT INTO traverse_coordinates(id,traverse_id,station_name,easting,northing) VALUES($1,$2,$3,500000,9500000)',
              [randomUUID(), traverse, 'NEW'],
            ],
          ]) {
            const probe = await pool.connect()
            try {
              await probe.query('BEGIN')
              await probe.query("SET LOCAL lock_timeout='100ms'")
              await assert.rejects(
                probe.query(sql, values),
                (error) => error.code === '55P03',
              )
              await probe.query('ROLLBACK')
            } finally {
              await probe.query('ROLLBACK')
              probe.release()
            }
          }
        } finally {
          await blocker.query('ROLLBACK')
          blocker.release()
          if (running) await full(await running)
          setFault('')
        }
      },
    )
    for (const fault of [
      'file_suppress',
      'file_change',
      'deliverable_suppress',
      'deliverable_change',
      'revision_suppress',
      'revision_change',
      'evidence_suppress',
      'evidence_change',
      'evidence_hash_change',
      'evidence_previous_change',
      'journal_suppress',
      'journal_change',
    ])
      await check(
        `${fault} acknowledgement fault rolls back every ledger and uncommitted file`,
        async () => {
          const body = await fresh(),
            before = await state()
          setFault(fault)
          const response = await post(body)
          assert.ok(response.status >= 400, await response.clone().text())
          assert.deepEqual(await state(), before)
          setFault('')
        },
      )
    await check(
      'generic uploads cannot replace a retained scheme artifact',
      async () => {
        const body = await fresh(),
          bytes = await full(await post(body)),
          key = await registeredPath(body.requestId),
          form = new FormData()
        form.set('file', new Blob(['replacement']), 'replacement.txt')
        form.set('path', key)
        const before = await state()
        assert.equal(
          (
            await storagePost(
              new NextRequest('http://127.0.0.1:3021/api/storage', {
                method: 'POST',
                body: form,
              }),
              actor,
              project,
            )
          ).status,
          409,
        )
        assert.deepEqual(readFileSync(path.join(storageRoot, key)), bytes)
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'generic deletion cannot erase a retained scheme artifact',
      async () => {
        const body = await fresh()
        await full(await post(body))
        const key = await registeredPath(body.requestId),
          before = await state()
        assert.equal(
          (
            await storageDelete(
              new NextRequest(
                `http://127.0.0.1:3021/api/storage?path=${encodeURIComponent(key)}`,
              ),
              actor,
              project,
            )
          ).status,
          409,
        )
        assert.deepEqual(await state(), before)
      },
    )
    await check(
      'generic download validates scheme hashes and current project ownership',
      async () => {
        const body = await fresh(),
          bytes = await full(await post(body)),
          key = await registeredPath(body.requestId),
          url = `http://127.0.0.1:3021/api/storage?path=${encodeURIComponent(key)}`
        assert.deepEqual(
          await full(await storageGet(new NextRequest(url), actor, project)),
          bytes,
        )
        writeFileSync(path.join(storageRoot, key), 'corruption')
        assert.equal(
          (await storageGet(new NextRequest(url), actor, project)).status,
          409,
        )
        writeFileSync(path.join(storageRoot, key), bytes)
        await pool.query('UPDATE projects SET user_id=$1 WHERE id=$2', [
          other,
          project,
        ])
        assert.equal(
          (await storageGet(new NextRequest(url), actor, project)).status,
          409,
        )
      },
    )
    await check(
      'export history is paged and contains metadata rather than source geometry',
      async () => {
        const body = await fresh()
        await full(await post(body))
        for (let i = 0; i < 54; i++)
          assert.equal(
            (
              await post(
                { ...body, requestId: randomUUID() },
                'geojson',
                actor,
                true,
              )
            ).status,
            200,
          )
        const ids = new Set()
        for (let page = 1; page <= 3; page++) {
          const response = await preview(
            new NextRequest(
              `http://127.0.0.1:3021/api/project/${project}/scheme/exports?mode=history&page=${page}`,
            ),
            actor,
            project,
          )
          assert.equal(response.status, 200, await response.clone().text())
          const text = await response.text(),
            data = JSON.parse(text).data
          assert.equal(data.viewerId, actor)
          assert.equal(data.projectId, project)
          assert.equal(data.total, 55)
          assert.equal(data.rows.length, page < 3 ? 24 : 7)
          assert.ok(Buffer.byteLength(text) < 32768)
          for (const row of data.rows) {
            ids.add(row.requestId)
            assert.equal('source' in row, false)
            assert.equal('body' in row, false)
            assert.equal('features' in row, false)
          }
          if (page === 1)
            report.historyProfile = {
              synthetic: true,
              totalRequests: 55,
              pageSize: 24,
              responseBytes: Buffer.byteLength(text),
            }
        }
        assert.equal(ids.size, 55)
      },
    )
    await check(
      'history requires current ownership and refuses mixed or duplicate page scopes',
      async () => {
        await fresh()
        for (const query of [
          'mode=history&page=0',
          'mode=history&page=1&page=2',
          `mode=history&parcel_id=${parcel}`,
        ])
          assert.equal(
            (
              await preview(
                new NextRequest(
                  `http://127.0.0.1:3021/api/project/${project}/scheme/exports?${query}`,
                ),
                actor,
                project,
              )
            ).status,
            400,
          )
        assert.equal(
          (
            await preview(
              new NextRequest(
                `http://127.0.0.1:3021/api/project/${project}/scheme/exports?mode=history`,
              ),
              other,
              project,
            )
          ).status,
          404,
        )
      },
    )
    await check(
      'unavailable history storage remains an error rather than a successful empty page',
      async () => {
        await fresh()
        await pool.query(
          'ALTER TABLE scheme_export_requests RENAME TO fixture_unavailable_export_history',
        )
        try {
          const response = await preview(
            new NextRequest(
              `http://127.0.0.1:3021/api/project/${project}/scheme/exports?mode=history`,
            ),
            actor,
            project,
          )
          assert.equal(response.status, 409)
          assert.equal('data' in (await response.json()), false)
        } finally {
          await pool.query(
            'ALTER TABLE fixture_unavailable_export_history RENAME TO scheme_export_requests',
          )
        }
      },
    )
    await check(
      'oversized, malformed and unreviewed commands are refused before export writes',
      async () => {
        const body = await fresh(),
          before = await state()
        assert.equal(
          (
            await geoPost(
              new NextRequest(
                'http://127.0.0.1:3021/api/scheme/export/geojson',
                {
                  method: 'POST',
                  body: JSON.stringify({ padding: 'x'.repeat(9000) }),
                },
              ),
              actor,
              project,
            )
          ).status,
          413,
        )
        assert.equal(
          (
            await geoPost(
              new NextRequest(
                'http://127.0.0.1:3021/api/scheme/export/geojson',
                { method: 'POST', body: 'invalid JSON' },
              ),
              actor,
              project,
            )
          ).status,
          400,
        )
        assert.equal((await post({ ...body, reviewed: false })).status, 400)
        assert.deepEqual(await state(), before)
      },
    )
    if (c.shareMode) {
      const { verifyParcelSharing } = await import('./verify-parcel-sharing-cases.mjs')
      await verifyParcelSharing({ ...c, fresh, post, full })
    }
  } finally {
    assert.equal(path.dirname(storageRoot), storageBase)
    assert.equal(realpathSync(storageRoot), storageRoot)
    assert.ok(!lstatSync(storageRoot).isSymbolicLink())
    assert.deepEqual(
      JSON.parse(
        readFileSync(path.join(storageRoot, '.fixture-owner.json'), 'utf8'),
      ),
      marker,
    )
    rmSync(storageRoot, { recursive: true })
    report.ownedExportFilesRemoved = true
  }
}
