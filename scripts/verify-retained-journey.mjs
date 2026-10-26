// One continuous synthetic job through the actual route/SQL/storage chain.
// Invoked last in the existing owned-schema share verifier; no customer DDL.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'

export async function verifyRetainedJourney(c) {
  const {
    pool,
    actor,
    other,
    project,
    parcel,
    schema,
    require,
    randomUUID,
    setFault,
    setFeatureAllowed,
    report,
    reportRoot,
    post: exportPost,
    full,
    readShare,
    writeShare,
    publicRead,
  } = c
  assert.match(schema, /^metardu_boundary_[a-f0-9]{32}$/)
  assert.equal(reportRoot, '.cache/parcel-draft-sharing')
  assert.equal(
    (
      await pool.query(
        "SELECT to_regclass('parcel_traverse_revisions') present",
      )
    ).rows[0].present,
    null,
  )
  await pool.query(
    'ALTER TABLE parcel_traverses ADD COLUMN traverse_type text; ALTER TABLE traverse_observations ADD COLUMN face varchar(10); ALTER TABLE project_reference_systems ADD COLUMN units text,ADD COLUMN distance_mode text,ADD COLUMN combined_scale_factor double precision,ADD COLUMN csf_provenance text,ADD COLUMN vertical_datum text,ADD COLUMN vertical_reference text',
  )
  const ddl = readFileSync(
    'src/lib/db/migrations/122_retained_parcel_traverses.sql',
    'utf8',
  )
    .split('-- DOWN:')[0]
    .replaceAll('public.', schema + '.')
    .replaceAll(
      'search_path=pg_catalog,public',
      `search_path=pg_catalog,${schema}`,
    )
  await pool.query(ddl)
  await pool.query(
    "UPDATE project_reference_systems SET units='metres',distance_mode='grid',combined_scale_factor=0.9996,csf_provenance='surveyor' WHERE project_id=$1",
    [project],
  )
  setFeatureAllowed(true)
  const { NextRequest } = require('next/server'),
    traverse = require('../src/app/api/scheme/traverse/route.ts'),
    boundary = require('../src/app/api/project/[id]/scheme/parcel-boundary/route.ts'),
    preview = require('../src/app/api/project/[id]/scheme/exports/route.ts')
  const {
    GET: recoverDxf,
  } = require('../src/app/api/scheme/export/dxf/route.ts')
  const {
    GET: recoverGeo,
  } = require('../src/app/api/scheme/export/geojson/route.ts')
  const { canonicalJSON } = require('../src/lib/audit/auditHash.ts')
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
  const data = async (response) => {
    assert.equal(response.status, 200, await response.clone().text())
    return (await response.json()).data
  }
  const url = 'http://127.0.0.1:3021'
  const readTraverse = (q = {}, user = actor) =>
    traverse.GET(
      new NextRequest(
        url +
          '/api/scheme/traverse?' +
          new URLSearchParams({ project_id: project, parcel_id: parcel, ...q }),
      ),
      user,
      project,
    )
  const saveTraverse = (wire) =>
    traverse.POST(
      new NextRequest(url + '/api/scheme/traverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: wire,
      }),
      actor,
      project,
    )
  const readBoundary = (id, coordinatePage) =>
    boundary.GET(
      new NextRequest(
        url +
          '/api/project/' +
          project +
          '/scheme/parcel-boundary?' +
          new URLSearchParams({
            parcel_id: parcel,
            traverse_id: id,
            ...(coordinatePage
              ? { coordinate_page: String(coordinatePage) }
              : {}),
          }),
      ),
      actor,
      project,
    )
  const saveBoundary = (body) =>
    boundary.POST(
      new NextRequest(
        url + '/api/project/' + project + '/scheme/parcel-boundary',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
      actor,
      project,
    )
  const selected = () =>
    preview.GET(
      new NextRequest(
        url + '/api/project/' + project + '/scheme/exports?parcel_id=' + parcel,
      ),
      actor,
      project,
    )
  const recover = (body, format, user = actor) =>
    (format === 'dxf' ? recoverDxf : recoverGeo)(
      new NextRequest(
        url +
          '/api/scheme/export/' +
          format +
          '?' +
          new URLSearchParams({
            project_id: project,
            request_id: body.requestId,
          }),
      ),
      user,
      project,
    )
  const counts = async () => {
    const result = {}
    for (const t of [
      'parcel_traverse_revisions',
      'parcel_traverse_requests',
      'parcel_boundary_drafts',
      'scheme_export_requests',
      'deliverable_revisions',
      'file_uploads',
      'parcel_draft_shares',
    ])
      result[t] = Number(
        (await pool.query('SELECT COUNT(*) n FROM ' + t)).rows[0].n,
      )
    return result
  }
  const proof = {
    status: 'running',
    synthetic: true,
    authentication: 'bounded adapter; ordinary-account HTTP not verified',
    paidAccess:
      'synthetic feature-admission adapter; no account or billing changes',
    stages: [],
    files: {},
  }
  const stage = (name, evidence = {}) =>
    proof.stages.push({ name, ...evidence })
  const copy = (name, bytes) => {
    const file = path.join(reportRoot, name)
    writeFileSync(file, bytes)
    proof.files[name] = { sha256: hash(bytes), bytes: Buffer.byteLength(bytes) }
    return file
  }
  const original = Buffer.from(
    'target,face_left_deg,face_right_deg,slope_m,zenith_deg,ih_m,th_m\r\nQA_B,90,270,080.123456789,90,,\r\nQA_C,270,90,050.987654321,90,,\r\nQA_D,270,90,080.123456789,90,,\r\n',
    'utf8',
  )
  const shot = (station, fl, fr, sd) => ({
    station,
    bs: '',
    fs: '',
    hclDeg: String(fl),
    hclMin: '0',
    hclSec: '0',
    hcrDeg: String(fr),
    hcrMin: '0',
    hcrSec: '0',
    slopeDist: sd,
    vaDeg: '90',
    vaMin: '0',
    vaSec: '0',
    ih: '',
    th: '',
    remarks: 'SYNTHETIC paired-angle transcription; no physical device',
  })
  const frame = (await data(await readTraverse())).context
  assert.deepEqual(frame.prerequisites, [])
  const input = {
    protocol: 'metardu-parcel-traverse-v1',
    requestId: randomUUID(),
    expectedUserId: actor,
    projectId: project,
    parcelId: parcel,
    evidenceHash: frame.evidenceHash,
    sourceCrs: frame.sourceCrs,
    baseRevisionId: frame.latestRevisionId,
    derivedFromRevisionId: null,
    name: 'SYNTHETIC continuous field-to-finish job',
    convention: 'clockwise_bs_to_fs_face_pair_zenith_metres',
    control: {
      openingStation: 'QA_A',
      openingEasting: '0250000.123456789',
      openingNorthing: '9800000.987654321',
      openingRL: '',
      closing: null,
      backsightDegrees: '0',
      backsightMinutes: '0',
      backsightSeconds: '0',
    },
    reduction: {
      combinedScaleFactor: '0.9996',
      reference:
        'Explicit SYNTHETIC adopted grid factor; no field calibration claim',
    },
    criterion: null,
    observations: [
      shot('QA_B', 90, 270, '080.123456789'),
      shot('QA_C', 270, 90, '050.987654321'),
      shot('QA_D', 270, 90, '080.123456789'),
    ],
    source: {
      kind: 'attachment',
      filename: 'SYNTHETIC-original.csv',
      bytesBase64: original.toString('base64'),
      mappingReviewed: true,
    },
    provenance: { observer: null, instrument: null, observedAt: null },
    reviewed: true,
  }
  const initialParcel = (
    await pool.query('SELECT to_jsonb(p) value FROM parcels p WHERE id=$1', [
      parcel,
    ])
  ).rows[0].value
  const wire = '  ' + JSON.stringify(input, null, 2) + '\r\n'
  setFault('lost_commit_ack')
  assert.equal((await saveTraverse(wire)).status, 500)
  setFault('')
  const recovered = (
    await data(await readTraverse({ request_id: input.requestId }))
  ).outcome
  const retained = await data(await saveTraverse(wire))
  assert.deepEqual(retained.receipt, recovered)
  assert.equal((await counts()).parcel_traverse_revisions, 1)
  assert.equal((await counts()).parcel_traverse_requests, 1)
  assert.equal(retained.receipt.sourceHash, hash(original))
  assert.equal(retained.receipt.requestHash, hash(wire))
  assert.equal(retained.receipt.inputHash, hash(canonicalJSON(input)))
  assert.equal(
    retained.receipt.resultHash,
    hash(canonicalJSON(retained.result)),
  )
  assert.deepEqual(retained.input, input)
  assert.equal(retained.result.isClosed, false)
  assert.equal(retained.result.linearError, null)
  assert.equal(retained.result.precisionRatio, null)
  assert.ok(retained.result.coordinates.every((p) => !('rl' in p)))
  assert.deepEqual(
    (
      await pool.query('SELECT to_jsonb(p) value FROM parcels p WHERE id=$1', [
        parcel,
      ])
    ).rows[0].value,
    initialParcel,
  )
  const stored = (
    await pool.query(
      'SELECT request_text,input_snapshot,result_snapshot FROM parcel_traverse_revisions WHERE id=$1',
      [recovered.revisionId],
    )
  ).rows[0]
  assert.equal(stored.request_text, wire)
  assert.deepEqual(stored.input_snapshot, input)
  assert.deepEqual(stored.result_snapshot, retained.result)
  stage(
    'original input committed once and recovered after lost acknowledgement',
    {
      revisionId: recovered.revisionId,
      inputHash: recovered.inputHash,
      sourceHash: recovered.sourceHash,
      resultHash: recovered.resultHash,
    },
  )

  const boundarySource = await data(await readBoundary(recovered.traverseId))
  const boundaryCommand = {
    request_id: randomUUID(),
    parcel_id: parcel,
    traverse_id: recovered.traverseId,
    evidence_hash: boundarySource.evidenceHash,
    source_crs: frame.sourceCrs,
    ordered_coordinate_ids: recovered.coordinateIds,
    reviewed: true,
    note: 'SYNTHETIC explicitly selected boundary; not legal or field acceptance',
  }
  setFault('lost_commit_ack')
  assert.equal((await saveBoundary(boundaryCommand)).status, 500)
  setFault('')
  const reviewed = await data(await saveBoundary(boundaryCommand))
  assert.equal((await counts()).parcel_boundary_drafts, 1)
  assert.equal(reviewed.parcelRevision, initialParcel.revision_number + 1)
  const selection = await data(await selected())
  assert.equal(
    selection.source.features[0].properties.evidenceState,
    'reviewed_draft',
  )
  assert.deepEqual(selection.source.features[0].geometry, reviewed.polygon)
  const expectedWidth = 80.123456789 * 0.9996,
    expectedHeight = 50.987654321 * 0.9996
  assert.ok(
    Math.abs(reviewed.gridAreaSqM - expectedWidth * expectedHeight) < 0.000001,
  )
  const boundarySnapshot = (
    await pool.query(
      'SELECT snapshot FROM parcel_boundary_drafts WHERE id=$1',
      [reviewed.receiptId],
    )
  ).rows[0].snapshot
  assert.equal(
    boundarySnapshot.source.retainedEvidence.revisionId,
    recovered.revisionId,
  )
  assert.equal(
    boundarySnapshot.source.retainedEvidence.inputHash,
    recovered.inputHash,
  )
  stage(
    'explicit boundary order links the retained revision and recovers one parcel write',
    {
      receiptId: reviewed.receiptId,
      gridAreaSqM: reviewed.gridAreaSqM,
      sourceHash: selection.sourceHash,
    },
  )

  const exportBody = () => ({
    projectId: project,
    expectedUserId: actor,
    requestId: randomUUID(),
    parcelIds: [parcel],
    sourceHash: selection.sourceHash,
    reviewed: true,
  })
  const dxfBody = exportBody(),
    geoBody = exportBody()
  setFault('lost_commit_ack')
  assert.equal((await exportPost(dxfBody, 'dxf')).status, 500)
  setFault('')
  const dxf = await full(await recover(dxfBody, 'dxf'))
  assert.deepEqual(await full(await exportPost(dxfBody, 'dxf')), dxf)
  const geo = await full(await exportPost(geoBody, 'geojson'))
  assert.deepEqual(await full(await recover(geoBody, 'geojson')), geo)
  assert.equal((await counts()).scheme_export_requests, 2)
  assert.equal((await counts()).deliverable_revisions, 2)
  assert.equal((await counts()).file_uploads, 2)
  const artifacts = {}
  for (const [format, body, bytes] of [
    ['dxf', dxfBody, dxf],
    ['geojson', geoBody, geo],
  ]) {
    const row = (
      await pool.query(
        "SELECT id,content_hash,manifest,storage_path FROM deliverable_revisions WHERE manifest#>>'{request,id}'=$1",
        [body.requestId],
      )
    ).rows[0]
    assert.equal(row.content_hash, hash(bytes))
    assert.deepEqual(row.manifest.source, selection.source)
    assert.equal(row.manifest.sourceHash, selection.sourceHash)
    assert.deepEqual(
      readFileSync(path.join(process.env.STORAGE_ROOT, row.storage_path)),
      bytes,
    )
    artifacts[format] = {
      requestId: body.requestId,
      revisionId: row.id,
      sha256: hash(bytes),
    }
    copy(
      'journey-' + format + '-source.json',
      JSON.stringify(row.manifest, null, 2) + '\n',
    )
    copy('journey.' + (format === 'dxf' ? 'dxf' : 'geojson'), bytes)
  }
  stage('actual DXF and geographic files recover exact registered bytes', {
    artifacts,
  })

  const sharePreview = await data(
    await readShare('?mode=preview&export_request_id=' + geoBody.requestId),
  )
  const grant = {
    projectId: project,
    expectedUserId: actor,
    requestId: randomUUID(),
    exportRequestId: geoBody.requestId,
    snapshotHash: sharePreview.snapshotHash,
    durationDays: 1,
    authorityToShare: true,
    key: randomBytes(32).toString('base64url'),
  }
  setFault('lost_commit_ack')
  assert.equal((await writeShare(grant)).status, 500)
  setFault('')
  const shareReceipt = await data(await writeShare(grant)),
    publicPacket = await data(await publicRead(grant))
  assert.equal((await counts()).parcel_draft_shares, 1)
  assert.deepEqual(publicPacket.snapshot, sharePreview.snapshot)
  assert.deepEqual(
    publicPacket.snapshot.parcels[0].coordinates,
    JSON.parse(geo.toString('utf8')).features[0].geometry.coordinates,
  )
  assert.equal((await publicRead(grant, { omit: true })).status, 404)
  assert.equal(
    (await publicRead(grant, { key: randomBytes(32).toString('base64url') }))
      .status,
    404,
  )
  assert.equal(
    (
      await readShare(
        '?mode=preview&export_request_id=' + geoBody.requestId,
        other,
      )
    ).status,
    404,
  )
  assert.equal(publicPacket.snapshot.fieldVerified, false)
  assert.equal(publicPacket.snapshot.professionalApproval, false)
  assert.doesNotMatch(
    JSON.stringify(publicPacket),
    /QA_A|QA_B|observer|bytesBase64|openingEasting/,
  )
  stage(
    'one explicit expiring grant recovers without renewal and exposes only its allowlist',
    {
      id: shareReceipt.id,
      snapshotHash: shareReceipt.snapshotHash,
      createdAt: shareReceipt.createdAt,
      expiresAt: shareReceipt.expiresAt,
    },
  )

  const nextFrame = (await data(await readTraverse())).context
  const denseObservations = Array.from({ length: 2000 }, (_, i) =>
    shot(
      'DENSE_' + i,
      i === 0 ? 90 : i % 500 === 0 ? 270 : 180,
      i === 0 ? 270 : i % 500 === 0 ? 90 : 0,
      (
        Number(
          input.observations[i < 500 || (i >= 1000 && i < 1500) ? 0 : 1]
            .slopeDist,
        ) / 500
      ).toPrecision(17),
    ),
  )
  const denseOriginal = Buffer.from(
    'target,face_left_deg,face_right_deg,slope_m,zenith_deg,ih_m,th_m\r\n' +
      denseObservations
        .map((o) =>
          [
            o.station,
            o.hclDeg,
            o.hcrDeg,
            o.slopeDist,
            o.vaDeg,
            o.ih,
            o.th,
          ].join(','),
        )
        .join('\r\n') +
      '\r\n',
    'utf8',
  )
  const nextInput = {
    ...input,
    requestId: randomUUID(),
    evidenceHash: nextFrame.evidenceHash,
    baseRevisionId: nextFrame.latestRevisionId,
    derivedFromRevisionId: recovered.revisionId,
    control: { ...input.control, openingEasting: '0250010.123456789' },
    observations: denseObservations,
    source: {
      kind: 'attachment',
      filename: 'SYNTHETIC-dense-original.csv',
      bytesBase64: denseOriginal.toString('base64'),
      mappingReviewed: true,
    },
  }
  const next = await data(await saveTraverse(JSON.stringify(nextInput)))
  assert.equal(next.receipt.ordinal, 2)
  assert.equal((await counts()).parcel_traverse_revisions, 2)
  assert.equal(next.receipt.coordinateIds.length, 2001)
  assert.equal(next.receipt.sourceHash, hash(denseOriginal))
  const nextSource = await data(await readBoundary(next.receipt.traverseId, 1))
  assert.equal(nextSource.points.length, 50)
  assert.equal(nextSource.pointWindow.total, 2001)
  const nextBoundary = await data(
    await saveBoundary({
      ...boundaryCommand,
      request_id: randomUUID(),
      traverse_id: next.receipt.traverseId,
      evidence_hash: nextSource.evidenceHash,
      ordered_coordinate_ids: [0, 500, 1000, 1500].map(
        (i) => next.receipt.coordinateIds[i],
      ),
    }),
  )
  assert.equal(nextBoundary.parcelRevision, reviewed.parcelRevision + 1)
  assert.notEqual(
    (await data(await selected())).sourceHash,
    selection.sourceHash,
  )
  assert.equal((await exportPost(exportBody(), 'geojson')).status, 409)
  const denseSelection = await data(await selected()),
    denseArtifacts = {}
  for (const format of ['dxf', 'geojson']) {
    const request = { ...exportBody(), sourceHash: denseSelection.sourceHash }
    const bytes = await full(await exportPost(request, format))
    assert.deepEqual(await full(await recover(request, format)), bytes)
    const row = (
      await pool.query(
        "SELECT content_hash,manifest FROM deliverable_revisions WHERE manifest#>>'{request,id}'=$1",
        [request.requestId],
      )
    ).rows[0]
    assert.equal(row.content_hash, hash(bytes))
    assert.deepEqual(row.manifest.source, denseSelection.source)
    copy('journey-dense.' + (format === 'dxf' ? 'dxf' : 'geojson'), bytes)
    copy(
      'journey-dense-' + format + '-source.json',
      JSON.stringify(row.manifest, null, 2) + '\n',
    )
    denseArtifacts[format] = {
      requestId: request.requestId,
      sha256: hash(bytes),
    }
  }
  assert.equal((await counts()).scheme_export_requests, 4)
  assert.equal((await counts()).deliverable_revisions, 4)
  assert.equal((await counts()).file_uploads, 4)
  const denseSnapshot = (
    await pool.query(
      'SELECT snapshot FROM parcel_boundary_drafts WHERE id=$1',
      [nextBoundary.receiptId],
    )
  ).rows[0].snapshot
  assert.equal(denseSnapshot.source.rawPoints.length, 2001)
  assert.equal(denseSnapshot.source.originalObservations.length, 2000)
  copy('journey-dense-original.csv', denseOriginal)
  copy('journey-dense-command.canonical.json', canonicalJSON(nextInput))
  copy('journey-dense-result.canonical.json', canonicalJSON(next.result))
  copy(
    'journey-dense-receipt.json',
    JSON.stringify(next.receipt, null, 2) + '\n',
  )
  copy(
    'journey-dense-boundary.json',
    JSON.stringify(nextBoundary, null, 2) + '\n',
  )
  proof.largeSource = {
    observations: 2000,
    sourceCoordinates: 2001,
    chosenVertices: 4,
    sourceSnapshotBytes: Buffer.byteLength(JSON.stringify(denseSnapshot)),
    artifacts: denseArtifacts,
  }
  assert.deepEqual(await full(await recover(dxfBody, 'dxf')), dxf)
  assert.deepEqual(await full(await recover(geoBody, 'geojson')), geo)
  assert.deepEqual(await data(await publicRead(grant)), publicPacket)
  assert.deepEqual(
    (await data(await readTraverse({ revision_id: recovered.revisionId })))
      .selected.input,
    input,
  )
  await assert.rejects(
    pool.query(
      'UPDATE traverse_coordinates SET easting=easting+1 WHERE id=$1',
      [recovered.coordinateIds[0]],
    ),
    (e) => e.code === '42501',
  )
  stage(
    'a later reviewed geometry refuses stale new exports while old artifacts and grant remain exact',
    {
      newRevisionId: next.receipt.revisionId,
      newBoundaryReceiptId: nextBoundary.receiptId,
    },
  )

  await pool.query(
    "UPDATE project_reference_systems SET notes='Changed SYNTHETIC reference after issue' WHERE project_id=$1",
    [project],
  )
  assert.equal((await selected()).status, 409)
  assert.deepEqual(await full(await recover(dxfBody, 'dxf')), dxf)
  assert.deepEqual(await data(await publicRead(grant)), publicPacket)
  const revoked = await data(
    await writeShare(
      { shareId: grant.requestId },
      actor,
      project,
      '?action=revoke',
    ),
  )
  assert.ok(revoked.revokedAt)
  assert.equal((await publicRead(grant)).status, 404)
  assert.deepEqual(await data(await writeShare(grant)), revoked)
  assert.equal((await counts()).parcel_draft_shares, 1)
  stage(
    'reference changes never relabel retained delivery and revocation closes recipient reads',
  )
  await pool.query('UPDATE projects SET user_id=$2 WHERE id=$1', [
    project,
    other,
  ])
  assert.equal((await recover(geoBody, 'geojson')).status, 404)
  assert.equal((await readTraverse()).status, 404)
  const transferred = (
    await data(await readTraverse({ revision_id: recovered.revisionId }, other))
  ).selected
  assert.equal(transferred.receipt.actorId, actor)
  assert.deepEqual(transferred.input, input)
  stage(
    'ownership transfer closes the former actor while preserving current-owner source history',
  )

  copy('journey-original.csv', original)
  copy('journey-request.json', wire)
  copy('journey-command.canonical.json', canonicalJSON(input))
  copy('journey-result.canonical.json', canonicalJSON(retained.result))
  copy(
    'journey-traverse-receipt.json',
    JSON.stringify(recovered, null, 2) + '\n',
  )
  copy('journey-boundary.json', JSON.stringify(reviewed, null, 2) + '\n')
  copy(
    'journey-public-snapshot.json',
    JSON.stringify(publicPacket.snapshot, null, 2) + '\n',
  )
  proof.status = 'passed'
  proof.counts = await counts()
  proof.expected = { width: expectedWidth, height: expectedHeight }
  proof.receivingCadApplicationVerified = false
  proof.fieldVerified = false
  writeFileSync(
    path.join(reportRoot, 'journey-proof.json'),
    JSON.stringify(proof, null, 2) + '\n',
  )
  report.retainedJourney = {
    proofSha256: hash(
      readFileSync(path.join(reportRoot, 'journey-proof.json')),
    ),
    stages: proof.stages.length,
    artifacts,
    sourceRevisionId: recovered.revisionId,
    boundaryReceiptId: reviewed.receiptId,
  }
}
