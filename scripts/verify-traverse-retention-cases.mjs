import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
export const EXPECTED_CASES = 40
export async function verifyTraverseRetention(c) {
  const {
    check,
    pool,
    actor,
    other,
    project,
    parcel,
    require,
    randomUUID,
    schema,
    setFault,
  } = c
  assert.match(schema, /^metardu_boundary_[a-f0-9]{32}$/)
  const { NextRequest } = require('next/server')
  const { GET, POST } = require('../src/app/api/scheme/traverse/route.ts')
  const boundary = require('../src/app/api/project/[id]/scheme/parcel-boundary/route.ts')
  const commands = require('../src/lib/scheme/traverseCommands.ts')
  const { readSchemeSelection } = require('../src/lib/scheme/readSchemeView.ts')
  const { canonicalJSON } = require('../src/lib/audit/auditHash.ts')
  const digest = (value) => createHash('sha256').update(value).digest('hex')
  const url = 'http://127.0.0.1:3021/api/scheme/traverse'
  const read = (query = {}, user = actor) =>
    GET(
      new NextRequest(
        url +
          '?' +
          new URLSearchParams({
            project_id: project,
            parcel_id: parcel,
            ...query,
          }),
      ),
      user,
      project,
    )
  const post = (body, user = actor, action = '', text) =>
    POST(
      new NextRequest(url + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: text ?? JSON.stringify(body),
      }),
      user,
      project,
    )
  const data = async (response) => {
    assert.equal(response.status, 200, await response.clone().text())
    return (await response.json()).data
  }
  const context = async () => (await data(await read())).context
  const shot = (station, left, right) => ({
    station,
    bs: '',
    fs: '',
    hclDeg: String(left),
    hclMin: '00',
    hclSec: '0.000',
    hcrDeg: String(right),
    hcrMin: '00',
    hcrSec: '0.000',
    slopeDist: '0100.000000',
    vaDeg: '90',
    vaMin: '0',
    vaSec: '0',
    ih: '',
    th: '',
    remarks: 'SYNTHETIC original reading',
  })
  const build = async () => {
    const f = await context()
    return {
      protocol: 'metardu-parcel-traverse-v1',
      requestId: randomUUID(),
      expectedUserId: actor,
      projectId: project,
      parcelId: parcel,
      evidenceHash: f.evidenceHash,
      sourceCrs: f.sourceCrs,
      baseRevisionId: f.latestRevisionId,
      derivedFromRevisionId: null,
      name: 'SYNTHETIC retained square',
      convention: 'clockwise_bs_to_fs_face_pair_zenith_metres',
      control: {
        openingStation: 'QA_A',
        openingEasting: '0250000.000000',
        openingNorthing: '9800000',
        openingRL: '',
        closing: { station: 'QA_A', easting: '250000', northing: '9800000' },
        backsightDegrees: '0',
        backsightMinutes: '0',
        backsightSeconds: '0',
      },
      reduction: {
        combinedScaleFactor: '1.000000',
        reference: 'Explicit synthetic unity factor only',
      },
      criterion: {
        allowableMisclosureMm: '3.000',
        reference: 'SYNTHETIC job specification 4',
      },
      observations: [
        shot('QA_B', 90, 270),
        { ...shot('QA_C', 270, 90), slopeDist: '100.000123456789' },
        shot('QA_D', 270, 90),
        shot('QA_A', 270, 90),
      ],
      source: {
        kind: 'manual',
        note: 'SYNTHETIC field input; not real field observations',
      },
      provenance: { observer: null, instrument: null, observedAt: null },
      reviewed: true,
    }
  }
  const state = async () => {
    const counts = {}
    for (const table of [
      'parcel_traverses',
      'traverse_coordinates',
      'traverse_observations',
      'parcel_traverse_revisions',
      'parcel_traverse_requests',
    ])
      counts[table] = Number(
        (await pool.query('SELECT COUNT(*) n FROM ' + table)).rows[0].n,
      )
    return {
      counts,
      parcel: (
        await pool.query(
          'SELECT to_jsonb(p) record FROM parcels p WHERE id=$1',
          [parcel],
        )
      ).rows[0].record,
    }
  }
  const cases = []
  const test = (name, work) => cases.push([name, work])
  let firstBody, first, reviewedBoundary
  await pool.query(
    "UPDATE project_reference_systems SET units='metres',distance_mode='grid',combined_scale_factor=1,csf_provenance='surveyor',vertical_datum='SYNTHETIC local zero',vertical_reference='local' WHERE project_id=$1",
    [project],
  )
  await pool.query(
    "CREATE FUNCTION fixture_traverse_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('metardu_fixture.boundary_fault',true)=TG_ARGV[0]||'_suppress' THEN RETURN NULL;END IF; IF current_setting('metardu_fixture.boundary_fault',true)=TG_ARGV[0]||'_change' THEN IF TG_TABLE_NAME='parcel_traverse_revisions' THEN NEW.result_snapshot=jsonb_set(NEW.result_snapshot,'{totalPerimeter}','999');ELSE NEW.receipt=jsonb_set(NEW.receipt,'{resultHash}',to_jsonb(repeat('f',64)));END IF; END IF;RETURN NEW;END $$; CREATE TRIGGER fixture_traverse_parent BEFORE INSERT ON parcel_traverses FOR EACH ROW EXECUTE FUNCTION fixture_traverse_fault('traverse_parent'); CREATE TRIGGER fixture_traverse_coordinate BEFORE INSERT ON traverse_coordinates FOR EACH ROW EXECUTE FUNCTION fixture_traverse_fault('traverse_coordinate'); CREATE TRIGGER fixture_traverse_observation BEFORE INSERT ON traverse_observations FOR EACH ROW EXECUTE FUNCTION fixture_traverse_fault('traverse_observation'); CREATE TRIGGER fixture_traverse_revision BEFORE INSERT ON parcel_traverse_revisions FOR EACH ROW EXECUTE FUNCTION fixture_traverse_fault('traverse_revision'); CREATE TRIGGER fixture_traverse_journal BEFORE INSERT ON parcel_traverse_requests FOR EACH ROW EXECUTE FUNCTION fixture_traverse_fault('traverse_journal');",
  )
  test('traverse context reads canonical UUID records and adopted reference without legacy columns', async () => {
    const body = await data(await read())
    assert.equal(body.context.projectId, project)
    assert.equal(body.context.parcelId, parcel)
    assert.equal(body.context.actorId, actor)
    assert.deepEqual(body.context.prerequisites, [])
    assert.equal(body.context.adoptedFactor, '1')
  })
  test('one atomic revision retains original strings and exact request bytes without changing the parcel', async () => {
    const before = await state()
    firstBody = await build()
    const wire = '  ' + JSON.stringify(firstBody, null, 2) + '\r\n'
    first = await data(await post(firstBody, actor, '', wire))
    assert.deepEqual(first.input, firstBody)
    assert.equal(first.receipt.requestHash, digest(wire))
    assert.equal(first.result.rawObservations[0].slopeDist, '0100.000000')
    assert.equal(first.result.coordinates[0].rl, undefined)
    assert.equal(first.result.coordinates[1].rl, undefined)
    assert.equal(first.receipt.status, 'draft_unverified')
    assert.equal(first.receipt.coordinateIds.length, 5)
    assert.deepEqual((await state()).parcel, before.parcel)
    const rows = (
      await pool.query(
        'SELECT request_text FROM parcel_traverse_revisions WHERE id=$1',
        [first.receipt.revisionId],
      )
    ).rows
    assert.equal(rows[0].request_text, wire)
  })
  test('lost acknowledgement replays and recovers the exact receipt without another revision', async () => {
    const before = await state(),
      replayed = await data(await post(firstBody))
    assert.deepEqual(replayed, first)
    assert.deepEqual(
      (await data(await read({ request_id: firstBody.requestId }))).outcome,
      first.receipt,
    )
    assert.deepEqual(await state(), before)
  })
  test('a request ID cannot replace its original intent', async () => {
    const before = await state()
    assert.equal(
      (await post({ ...firstBody, name: 'Changed intent' })).status,
      409,
    )
    assert.deepEqual(await state(), before)
  })
  test('authentication, ownership, duplicate query keys and UUID checks refuse access', async () => {
    assert.equal((await read({}, null)).status, 401)
    assert.equal((await read({}, other)).status, 404)
    assert.equal((await read({ parcel_id: '1' })).status, 400)
    assert.equal(
      (
        await GET(
          new NextRequest(
            url +
              '?project_id=' +
              project +
              '&parcel_id=' +
              parcel +
              '&parcel_id=' +
              parcel,
          ),
          actor,
          project,
        )
      ).status,
      400,
    )
    assert.equal(
      (
        await post({
          ...firstBody,
          requestId: randomUUID(),
          expectedUserId: other,
        })
      ).status,
      403,
    )
  })
  test('invalid angle conventions, numbers, factor mismatches and closing labels cannot write', async () => {
    const body = await build(),
      before = await state()
    for (const changed of [
      { ...body, convention: 'unknown' },
      {
        ...body,
        observations: [{ ...body.observations[0], slopeDist: '100m' }],
      },
      {
        ...body,
        reduction: { ...body.reduction, combinedScaleFactor: '0.9996' },
      },
      {
        ...body,
        control: {
          ...body.control,
          closing: { station: 'wrong', easting: '0', northing: '0' },
        },
      },
    ])
      assert.ok([400, 409].includes((await post(changed)).status))
    assert.deepEqual(await state(), before)
  })
  test('zero levels and unknown later heights survive while full coordinate precision is retained', async () => {
    const body = await build()
    body.control = { ...body.control, openingRL: '0', closing: null }
    body.observations = [
      { ...shot('Precise', 0, 180), slopeDist: '1.1234567890123' },
    ]
    body.criterion = null
    const saved = await data(await post(body))
    assert.equal(saved.result.coordinates[0].rl, 0)
    assert.equal(saved.result.coordinates[1].rl, undefined)
    assert.equal(
      saved.result.coordinates[1].northing,
      9800000 + 1.1234567890123,
    )
    assert.equal(saved.result.linearError, null)
    assert.equal(saved.result.assessment.status, 'not_assessed')
    const row = (
      await pool.query(
        'SELECT northing::text FROM traverse_coordinates WHERE id=$1',
        [saved.receipt.coordinateIds[1]],
      )
    ).rows[0]
    assert.equal(Number(row.northing), 9800000 + 1.1234567890123)
  })
  test('new revisions append while old source rows and receipts remain byte-equivalent', async () => {
    const body = await build()
    body.derivedFromRevisionId = first.receipt.revisionId
    const saved = await data(await post(body))
    assert.ok(saved.receipt.ordinal > first.receipt.ordinal)
    assert.notEqual(saved.receipt.traverseId, first.receipt.traverseId)
    const old = (
      await data(await read({ revision_id: first.receipt.revisionId }))
    ).selected
    assert.deepEqual(old, first)
  })
  test('simultaneous retries of one request commit exactly one source revision', async () => {
    const body = await build(),
      before = await state()
    const both = await Promise.all([post(body), post(body)]),
      a = await data(both[0]),
      b = await data(both[1])
    assert.deepEqual(a, b)
    assert.equal(
      (await state()).counts.parcel_traverse_revisions,
      before.counts.parcel_traverse_revisions + 1,
    )
  })
  test('competing clients cannot silently save from the same stale retained head', async () => {
    const a = await build(),
      b = { ...a, requestId: randomUUID(), name: 'SYNTHETIC competing' }
    const before = await state(),
      responses = await Promise.all([post(a), post(b)])
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
    assert.equal(
      (await state()).counts.parcel_traverse_revisions,
      before.counts.parcel_traverse_revisions + 1,
    )
  })
  test('cancellation creates a durable tombstone that blocks a late computation', async () => {
    const body = await build(),
      before = await state(),
      inputHash = digest(canonicalJSON(body))
    const cancelled = await data(
      await post(
        {
          expectedUserId: actor,
          projectId: project,
          parcelId: parcel,
          requestId: body.requestId,
          inputHash,
        },
        actor,
        '?action=cancel',
      ),
    )
    assert.equal(cancelled.state, 'cancelled')
    assert.equal((await post(body)).status, 409)
    assert.equal(
      (await state()).counts.parcel_traverse_revisions,
      before.counts.parcel_traverse_revisions,
    )
    assert.deepEqual(
      (await data(await read({ request_id: body.requestId }))).outcome,
      cancelled,
    )
  })
  test('cancelling an already committed request returns its receipt and preserves its source', async () => {
    const receipt = await data(
      await post(
        {
          expectedUserId: actor,
          projectId: project,
          parcelId: parcel,
          requestId: firstBody.requestId,
          inputHash: first.receipt.inputHash,
        },
        actor,
        '?action=cancel',
      ),
    )
    assert.deepEqual(receipt, first.receipt)
  })
  test('a save/cancel race has one final outcome and cannot create duplicate evidence', async () => {
    const body = await build(),
      cancel = {
        expectedUserId: actor,
        projectId: project,
        parcelId: parcel,
        requestId: body.requestId,
        inputHash: digest(canonicalJSON(body)),
      }
    const responses = await Promise.all([
      post(body),
      post(cancel, actor, '?action=cancel'),
    ])
    assert.ok([200, 409].includes(responses[0].status))
    assert.equal(responses[1].status, 200)
    const outcome = (await data(await read({ request_id: body.requestId })))
      .outcome
    assert.equal(outcome.state, (await data(responses[1])).state)
    assert.equal(
      Number(
        (
          await pool.query(
            'SELECT count(*) n FROM parcel_traverse_requests WHERE actor_id=$1 AND request_id=$2',
            [actor, body.requestId],
          )
        ).rows[0].n,
      ),
      1,
    )
  })
  test('original attachment bytes and reviewed mapping are retained without re-encoding', async () => {
    const body = await build(),
      bytes = Buffer.from('SOURCE CSV\r\nQA_A,000.0000,0\r\n', 'utf8')
    body.source = {
      kind: 'attachment',
      filename: 'synthetic-observed.csv',
      bytesBase64: bytes.toString('base64'),
      mappingReviewed: true,
    }
    const saved = await data(await post(body))
    assert.equal(saved.receipt.sourceHash, digest(bytes))
    assert.equal(saved.input.source.bytesBase64, bytes.toString('base64'))
  })
  test('retained canonical parents, coordinates and observations cannot be replaced or extended', async () => {
    for (const sql of [
      [
        'UPDATE parcel_traverses SET traverse_name=$2 WHERE id=$1',
        [first.receipt.traverseId, 'changed'],
      ],
      [
        'UPDATE traverse_coordinates SET easting=easting+1 WHERE id=$1',
        [first.receipt.coordinateIds[0]],
      ],
      [
        'DELETE FROM traverse_observations WHERE id=$1',
        [first.receipt.observationIds[0]],
      ],
      [
        'INSERT INTO traverse_coordinates(id,traverse_id,station_name,easting,northing) VALUES($1,$2,$3,0,0)',
        [randomUUID(), first.receipt.traverseId, 'extra'],
      ],
    ])
      await assert.rejects(
        pool.query(sql[0], sql[1]),
        (e) => e.code === '42501',
      )
  })
  test('RLS preserves current-owner history while revoking the former owner after transfer', async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        'GRANT USAGE ON SCHEMA ' +
          schema +
          ' TO authenticated;GRANT SELECT ON projects,parcels,parcel_traverses TO authenticated',
      )
      await client.query('SET LOCAL ROLE authenticated')
      await client.query("SELECT set_config('request.user_id',$1,true)", [
        other,
      ])
      assert.equal(
        (
          await client.query(
            'SELECT id FROM parcel_traverse_revisions WHERE id=$1',
            [first.receipt.revisionId],
          )
        ).rows.length,
        0,
      )
      await client.query('ROLLBACK')
      await pool.query('UPDATE projects SET user_id=$2 WHERE id=$1', [
        project,
        other,
      ])
      assert.equal((await read()).status, 404)
      const transferred = await data(
        await read({ revision_id: first.receipt.revisionId }, other),
      )
      assert.equal(transferred.selected.receipt.actorId, actor)
    } finally {
      await client.query('ROLLBACK')
      client.release()
      await pool.query('UPDATE projects SET user_id=$2 WHERE id=$1', [
        project,
        actor,
      ])
    }
  })
  test('changed references leave old evidence readable but prevent boundary relabeling', async () => {
    const original = (
      await pool.query(
        'SELECT notes FROM project_reference_systems WHERE project_id=$1',
        [project],
      )
    ).rows[0].notes
    try {
      await pool.query(
        'UPDATE project_reference_systems SET notes=$2 WHERE project_id=$1',
        [project, 'Changed synthetic reference'],
      )
      const old = (
        await data(await read({ revision_id: first.receipt.revisionId }))
      ).selected
      assert.equal(old.currentReferenceMatches, false)
      const response = await boundary.GET(
        new NextRequest(
          'http://127.0.0.1:3021/api/project/' +
            project +
            '/scheme/parcel-boundary?parcel_id=' +
            parcel +
            '&traverse_id=' +
            first.receipt.traverseId,
        ),
        actor,
        project,
      )
      assert.equal(response.status, 409)
      const copied = await build()
      copied.derivedFromRevisionId = first.receipt.revisionId
      const before = await state()
      assert.equal((await post(copied)).status, 409)
      assert.deepEqual(await state(), before)
    } finally {
      await pool.query(
        'UPDATE project_reference_systems SET notes=$2 WHERE project_id=$1',
        [project, original],
      )
    }
  })
  test('explicit reviewed coordinate IDs connect the retained computation to the real boundary chain', async () => {
    const base =
      'http://127.0.0.1:3021/api/project/' + project + '/scheme/parcel-boundary'
    const source = await data(
      await boundary.GET(
        new NextRequest(
          base +
            '?parcel_id=' +
            parcel +
            '&traverse_id=' +
            first.receipt.traverseId,
        ),
        actor,
        project,
      ),
    )
    const saved = await data(
      await boundary.POST(
        new NextRequest(base, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            parcel_id: parcel,
            traverse_id: first.receipt.traverseId,
            request_id: randomUUID(),
            evidence_hash: source.evidenceHash,
            source_crs: source.sourceCrs,
            ordered_coordinate_ids: first.receipt.coordinateIds.slice(0, 4),
            reviewed: true,
            note: 'SYNTHETIC explicitly selected boundary order',
          }),
        }),
        actor,
        project,
      ),
    )
    reviewedBoundary = saved
    const points = first.result.coordinates.slice(0, 4),
      origin = points[0]
    const expected =
      Math.abs(
        points.reduce((sum, a, i) => {
          const b = points[(i + 1) % points.length]
          return (
            sum +
            (a.easting - origin.easting) * (b.northing - origin.northing) -
            (b.easting - origin.easting) * (a.northing - origin.northing)
          )
        }, 0),
      ) / 2
    assert.ok(Math.abs(saved.gridAreaSqM - expected) < 1e-7)
    assert.equal(saved.status, 'draft_unverified')
  })
  test('stored boundary selection preserves full coordinate precision and retained-source versions', async () => {
    const selected = await readSchemeSelection(actor, project, [parcel])
    assert.equal(selected.features.length, 1)
    assert.equal(
      selected.features[0].properties.evidenceState,
      'reviewed_draft',
    )
    assert.deepEqual(selected.features[0].geometry, reviewedBoundary.polygon)
  })
  const corruptions = [
    [
      'result_snapshot',
      "UPDATE parcel_traverse_revisions SET result_snapshot=jsonb_set(result_snapshot,'{totalPerimeter}','999') WHERE id=$1",
      'parcel_traverse_revisions',
      'retained_traverse_revision_immutable',
      (first) => first.receipt.revisionId,
    ],
    [
      'original_input',
      "UPDATE parcel_traverse_revisions SET input_snapshot=jsonb_set(input_snapshot,'{observations,0,slopeDist}','\"999\"'::jsonb) WHERE id=$1",
      'parcel_traverse_revisions',
      'retained_traverse_revision_immutable',
      (first) => first.receipt.revisionId,
    ],
    [
      'coordinate',
      'UPDATE traverse_coordinates SET easting=easting+1 WHERE id=$1',
      'traverse_coordinates',
      'retained_traverse_coordinates_immutable',
      (first) => first.receipt.coordinateIds[0],
    ],
    [
      'original_observation',
      "UPDATE traverse_observations SET retained_input=jsonb_set(retained_input,'{slopeDist}','\"999\"'::jsonb) WHERE id=$1",
      'traverse_observations',
      'retained_traverse_observations_immutable',
      (first) => first.receipt.observationIds[0],
    ],
  ]
  for (const [name, sql, table, trigger, id] of corruptions)
    test(
      'corrupt ' + name + ' cannot be read as checked retained evidence',
      async () => {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query(
            'ALTER TABLE ' +
              schema +
              '.' +
              table +
              ' DISABLE TRIGGER ' +
              trigger,
          )
          await client.query(sql, [id(first)])
          const ref = (
            await client.query(
              'SELECT reference_record FROM parcel_traverse_revisions WHERE id=$1',
              [first.receipt.revisionId],
            )
          ).rows[0].reference_record
          await assert.rejects(
            commands.assertRetainedTraverseSource(
              actor,
              project,
              parcel,
              first.receipt.revisionId,
              ref,
              client,
            ),
            (e) => e.statusCode === 500,
          )
          const changed = await readSchemeSelection(
            actor,
            project,
            [parcel],
            client,
          )
          assert.equal(
            changed.features[0].properties.evidenceState,
            'changed_since_review',
          )
        } finally {
          await client.query('ROLLBACK')
          client.release()
        }
      },
    )
  for (const fault of [
    'traverse_parent_suppress',
    'traverse_coordinate_suppress',
    'traverse_observation_suppress',
    'traverse_revision_change',
    'traverse_journal_suppress',
    'traverse_journal_change',
  ])
    test(fault + ' rolls back every newly written source row', async () => {
      const body = await build(),
        before = await state()
      try {
        setFault(fault)
        assert.ok((await post(body)).status >= 500)
      } finally {
        setFault('')
      }
      assert.deepEqual(await state(), before)
    })
  test('history uses bounded metadata and stable ordinal cursors without loading every source', async () => {
    for (let i = 0; i < 25; i++) {
      const body = await build()
      body.control.closing = null
      body.criterion = null
      body.observations = [shot('History_' + i, 0, 180)]
      body.name = 'SYNTHETIC history ' + i
      await data(await post(body))
    }
    const firstPage = await data(await read()),
      secondPage = await data(
        await read({ before_ordinal: String(firstPage.nextBeforeOrdinal) }),
      )
    assert.equal(firstPage.revisions.length, 24)
    assert.equal(firstPage.hasMore, true)
    assert.equal(secondPage.selected, null)
    assert.equal(
      firstPage.revisions.some((a) =>
        secondPage.revisions.some((b) => a.revisionId === b.revisionId),
      ),
      false,
    )
    assert.equal(
      JSON.stringify(firstPage.revisions).includes('observations'),
      false,
    )
  })
  test('a 2000-observation revision retains all 2001 ordered coordinates without rounding or truncation', async () => {
    const body = await build()
    body.control.closing = null
    body.criterion = null
    body.observations = Array.from({ length: 2000 }, (_, i) => ({
      ...shot('L' + i, i ? 180 : 0, i ? 0 : 180),
      slopeDist: '1.000000001',
    }))
    const saved = await data(await post(body))
    assert.equal(saved.result.rawObservations.length, 2000)
    assert.equal(saved.receipt.coordinateIds.length, 2001)
    assert.equal(saved.result.rawObservations[1999].slopeDist, '1.000000001')
    assert.equal(saved.result.linearError, null)
  })
  test('all 2001 source coordinates remain reviewable through bounded pages and an exact selected boundary', async () => {
    const body = await build()
    body.control.closing = null
    body.criterion = null
    body.observations = Array.from({ length: 2000 }, (_, i) => ({
      ...shot(
        'BoundaryStep_' + i,
        i === 0 ? 90 : i % 500 === 0 ? 270 : 180,
        i === 0 ? 270 : i % 500 === 0 ? 90 : 0,
      ),
      slopeDist: '0.2000000001',
    }))
    const saved = await data(await post(body)),
      base =
        'http://127.0.0.1:3021/api/project/' +
        project +
        '/scheme/parcel-boundary'
    const page = (query = {}, user = actor) =>
      boundary.GET(
        new NextRequest(
          base +
            '?' +
            new URLSearchParams({
              parcel_id: parcel,
              traverse_id: saved.receipt.traverseId,
              ...query,
            }),
        ),
        user,
        project,
      )
    assert.equal((await page()).status, 400)
    const first = await data(await page({ coordinate_page: '1' })),
      ids = [],
      bytes = [],
      started = performance.now()
    assert.equal(first.pointWindow.total, 2001)
    assert.equal(first.points.length, 50)
    for (let p = 1; p <= 41; p++) {
      const response = await page({ coordinate_page: String(p) })
      assert.equal(response.status, 200, await response.clone().text())
      const text = await response.text(),
        value = JSON.parse(text).data
      assert.equal(value.evidenceHash, first.evidenceHash)
      assert.equal(value.pointWindow.page, p)
      assert.equal(value.points.length, p === 41 ? 1 : 50)
      ids.push(...value.points.map((point) => point.id))
      bytes.push(Buffer.byteLength(text))
    }
    assert.equal(new Set(ids).size, 2001)
    assert.deepEqual([...ids].sort(), [...saved.receipt.coordinateIds].sort())
    assert.ok(Math.max(...bytes) < 20000)
    const found = await data(
      await page({ coordinate_page: '1', coordinate_q: 'BoundaryStep_1999' }),
    )
    assert.equal(found.pointWindow.matchingCount, 1)
    assert.equal(found.points[0].id, saved.receipt.coordinateIds[2000])
    assert.equal(found.evidenceHash, first.evidenceHash)
    const empty = await data(
      await page({ coordinate_page: '1', coordinate_q: 'Absent coordinate' }),
    )
    assert.equal(empty.points.length, 0)
    assert.equal(empty.pointWindow.total, 2001)
    assert.equal((await page({ coordinate_page: '42' })).status, 400)
    assert.equal((await page({ coordinate_page: '1' }, other)).status, 404)
    assert.equal((await page({ coordinate_page: '1', page: '1' })).status, 400)
    const command = {
      request_id: randomUUID(),
      parcel_id: parcel,
      traverse_id: saved.receipt.traverseId,
      evidence_hash: first.evidenceHash,
      source_crs: body.sourceCrs,
      ordered_coordinate_ids: [0, 500, 1000, 1500].map(
        (i) => saved.receipt.coordinateIds[i],
      ),
      reviewed: true,
      note: 'SYNTHETIC four vertices from the complete retained source',
    }
    const send = (b) =>
      boundary.POST(
        new NextRequest(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(b),
        }),
        actor,
        project,
      )
    const before = await state()
    assert.equal(
      (
        await send({
          ...command,
          ordered_coordinate_ids: [
            ...command.ordered_coordinate_ids.slice(0, 3),
            randomUUID(),
          ],
        })
      ).status,
      400,
    )
    assert.deepEqual(await state(), before)
    const receipt = await data(await send(command))
    const snapshot = (
      await pool.query(
        'SELECT snapshot FROM parcel_boundary_drafts WHERE id=$1',
        [receipt.receiptId],
      )
    ).rows[0].snapshot
    assert.equal(snapshot.source.rawPoints.length, 2001)
    assert.equal(snapshot.source.originalObservations.length, 2000)
    assert.equal(
      snapshot.source.retainedEvidence.revisionId,
      saved.receipt.revisionId,
    )
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 4194304)
    assert.equal(
      (await readSchemeSelection(actor, project, [parcel])).features[0]
        .properties.evidenceState,
      'reviewed_draft',
    )
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        'ALTER TABLE ' +
          schema +
          '.traverse_coordinates DISABLE TRIGGER retained_traverse_coordinates_immutable',
      )
      await client.query(
        'UPDATE traverse_coordinates SET easting=easting+0.1 WHERE id=$1',
        [saved.receipt.coordinateIds[1999]],
      )
      assert.equal(
        (await readSchemeSelection(actor, project, [parcel], client))
          .features[0].properties.evidenceState,
        'changed_since_review',
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
    c.report.boundarySourceProfile = {
      synthetic: true,
      sourceCoordinates: 2001,
      observations: 2000,
      chosenVertices: 4,
      pages: 41,
      pageSize: 50,
      maxResponseBytes: Math.max(...bytes),
      totalResponseBytes: bytes.reduce((a, b) => a + b, 0),
      snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)),
      elapsedMs: performance.now() - started,
      fieldVerified: false,
    }
  })
  test('streamed oversized input refuses before any source rows are written', async () => {
    const before = await state()
    assert.equal(
      (await post(null, actor, '', '{"padding":"' + 'x'.repeat(4194305) + '"}'))
        .status,
      413,
    )
    assert.deepEqual(await state(), before)
  })
  test('the history alias requires the same explicit scope and current owner', async () => {
    const history = require('../src/app/api/scheme/traverse/history/route.ts')
    assert.equal(
      (
        await history.GET(
          new NextRequest(url + '?parcel_id=' + parcel),
          actor,
          project,
        )
      ).status,
      400,
    )
    assert.equal(
      (
        await history.GET(
          new NextRequest(
            url + '?project_id=' + project + '&parcel_id=' + parcel,
          ),
          other,
          project,
        )
      ).status,
      404,
    )
    const result = await data(
      await history.GET(
        new NextRequest(
          url + '?project_id=' + project + '&parcel_id=' + parcel,
        ),
        actor,
        project,
      ),
    )
    assert.equal(result.revisions.length, 24)
  })
  test('a missing receipt identity cannot pass the database null check', async () => {
    await assert.rejects(
      pool.query(
        "INSERT INTO parcel_traverse_requests(actor_id,request_id,project_id,parcel_id,input_hash,state,receipt) VALUES($1,$2,$3,$4,$5,'cancelled','{}')",
        [actor, randomUUID(), project, parcel, 'a'.repeat(64)],
      ),
      (e) => e.code === '23514',
    )
  })
  test('an adopted non-unity grid factor scales horizontal distance but preserves measured height', async () => {
    try {
      await pool.query(
        'UPDATE project_reference_systems SET combined_scale_factor=0.9996 WHERE project_id=$1',
        [project],
      )
      const body = await build()
      body.reduction.combinedScaleFactor = '0.9996'
      body.control.closing = null
      body.criterion = null
      body.control.openingRL = '0'
      body.observations = [
        {
          ...shot('Scaled_B', 0, 180),
          slopeDist: '100',
          vaDeg: '60',
          ih: '1.5',
          th: '1.5',
        },
      ]
      const saved = await data(await post(body))
      assert.ok(
        Math.abs(saved.result.legs[0].hd - 50 * Math.sqrt(3) * 0.9996) < 1e-10,
      )
      assert.ok(Math.abs(saved.result.coordinates[1].rl - 50) < 1e-10)
      assert.equal(saved.result.coordinates[0].rl, 0)
    } finally {
      await pool.query(
        'UPDATE project_reference_systems SET combined_scale_factor=1 WHERE project_id=$1',
        [project],
      )
    }
  })
  test('absolute levels without a declared vertical datum cannot be retained', async () => {
    const before = await state()
    try {
      await pool.query(
        'UPDATE project_reference_systems SET vertical_datum=NULL WHERE project_id=$1',
        [project],
      )
      const body = await build()
      body.control.openingRL = '0'
      assert.equal((await post(body)).status, 409)
    } finally {
      await pool.query(
        "UPDATE project_reference_systems SET vertical_datum='SYNTHETIC local zero' WHERE project_id=$1",
        [project],
      )
    }
    assert.deepEqual(await state(), before)
  })
  test('RLS refuses a forged request issuer even for a currently owned parcel', async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        'GRANT USAGE ON SCHEMA ' +
          schema +
          ' TO authenticated;GRANT SELECT ON projects,parcels TO authenticated',
      )
      await client.query('SET LOCAL ROLE authenticated')
      await client.query("SELECT set_config('request.user_id',$1,true)", [
        actor,
      ])
      const requestId = randomUUID(),
        receipt = {
          state: 'cancelled',
          actorId: other,
          projectId: project,
          parcelId: parcel,
          requestId,
          inputHash: 'a'.repeat(64),
        }
      await assert.rejects(
        client.query(
          "INSERT INTO parcel_traverse_requests(actor_id,request_id,project_id,parcel_id,input_hash,state,receipt) VALUES($1,$2,$3,$4,$5,'cancelled',$6::jsonb)",
          [
            other,
            requestId,
            project,
            parcel,
            receipt.inputHash,
            JSON.stringify(receipt),
          ],
        ),
        (e) => e.code === '42501',
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
  })
  test('whole-project deletion permits its retained graph cascade and rolls back cleanly', async () => {
    const before = await state(),
      client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM projects WHERE id=$1', [project])
      await client.query('SET CONSTRAINTS ALL IMMEDIATE')
      assert.equal(
        Number(
          (
            await client.query(
              'SELECT COUNT(*) n FROM parcel_traverse_revisions WHERE project_id=$1',
              [project],
            )
          ).rows[0].n,
        ),
        0,
      )
      assert.equal(
        Number(
          (
            await client.query(
              'SELECT COUNT(*) n FROM parcel_traverse_requests WHERE project_id=$1',
              [project],
            )
          ).rows[0].n,
        ),
        0,
      )
    } finally {
      await client.query('ROLLBACK')
      client.release()
    }
    assert.deepEqual(await state(), before)
  })
  test('missing retained storage is an explicit unavailable response, never an empty successful register', async () => {
    try {
      await pool.query(
        'ALTER TABLE ' +
          schema +
          '.parcel_traverse_requests RENAME TO fixture_retained_request_hold',
      )
      assert.equal((await read()).status, 503)
    } finally {
      await pool.query(
        'ALTER TABLE ' +
          schema +
          '.fixture_retained_request_hold RENAME TO parcel_traverse_requests',
      )
    }
  })
  assert.equal(cases.length, EXPECTED_CASES)
  for (const [name, work] of cases) await check(name, work)
}
