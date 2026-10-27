import type { PoolClient } from 'pg'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { checkFeatureAccess } from '@/lib/subscription/subscriptionEngine'
import {
  registerDeliverable,
  hashDeliverableContent,
  type DeliverableRevision,
} from '@/lib/deliverables/deliverableRegister'
import { uploadFile, downloadFileBounded, deleteFile } from '@/lib/storage'
import { logger } from '@/lib/logger'
import { hashEvidenceEvent } from '@/lib/observations/observationBatches'
import { WGS84_CRS } from '@/lib/spatial/projectCrs'
import { readSchemeSelection } from './readSchemeView'
import { schemeViewportSchema } from './schemeView'
import {
  admittedSchemeSource,
  buildSchemeArtifact,
  hashSchemeValue,
  schemeSourceRevision,
} from './exportArtifact'
import {
  SCHEME_EXPORT_BYTES,
  schemeExportIds,
  schemeExportRequestSchema,
  schemeExportIntent,
  schemeExportCancellationSchema,
  type SchemeExportFormat,
  type SchemeExportRequest,
  type SchemeExportCancellation,
} from './exportContract'
import {
  ensureSchemeExportStorage,
  readSchemeExportJournal,
  appendSchemeExportJournal,
} from './exportJournal'
const fail = (message: string, status = 409) =>
  new AppError(message, status, 'SCHEME_EXPORT')
const id = z.string().guid()
const mime = (format: SchemeExportFormat) =>
  format === 'dxf' ? 'application/dxf' : 'application/geo+json'
const generator = (format: SchemeExportFormat) => `scheme-boundary-${format}`
export interface SchemeExportPacket {
  bytes: Buffer
  filename: string
  storagePath: string
  contentHash: string
  deliverableId: string
  revision: number
  revisionId: string
  requestId: string
  requestHash: string
  sourceHash: string
  sourceRevision: string
  sourceCrs: string
  outputCrs: string
  replayed: boolean
}
function identity(actor: string, project: string, request?: string) {
  if (
    ![actor, project, ...(request ? [request] : [])].every(
      (value) => id.safeParse(value).success,
    )
  )
    throw fail('Valid account, project and request UUIDs are required.', 400)
}
export async function schemeExportAccess(actor: string, project: string) {
  identity(actor, project)
  const result = await db.query<{ id: string; ready: boolean }>(
    "SELECT id,to_regclass('scheme_export_requests') IS NOT NULL ready FROM projects WHERE id=$1 AND user_id=$2",
    [project, actor],
  )
  if (result.rows.length !== 1)
    throw fail('Project not found for this account.', 404)
  return {
    viewerId: actor,
    projectId: project,
    storageReady: result.rows[0].ready,
    selectionLimit: 50 as const,
  }
}
export async function previewSchemeExport(
  actor: string,
  project: string,
  ids: unknown,
) {
  identity(actor, project)
  await ensureSchemeExportStorage()
  const parsed = schemeExportIds.safeParse(ids)
  if (!parsed.success)
    throw fail('Choose 1–50 distinct parcel UUIDs for export review.', 400)
  const parcelIds = parsed.data,
    source = admittedSchemeSource(
      await readSchemeSelection(actor, project, parcelIds),
    ),
    sourceHash = hashSchemeValue(source)
  return {
    viewerId: actor,
    sourceHash,
    sourceRevision: schemeSourceRevision(sourceHash),
    source,
  }
}
async function lockSource(
  actor: string,
  project: string,
  parcelIds: string[],
  client: PoolClient,
) {
  const parcels = await client.query<{ id: string }>(
    'SELECT id FROM parcels WHERE project_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',
    [project, parcelIds],
  )
  if (parcels.rows.length !== parcelIds.length)
    throw fail('The exact selected parcels are no longer available.')
  await client.query(
    'SELECT id FROM project_reference_systems WHERE project_id=$1 FOR SHARE',
    [project],
  )
  const before = admittedSchemeSource(
    await readSchemeSelection(actor, project, parcelIds, client),
  )
  const receipts = before.features.map((feature) =>
    feature.properties.kind === 'parcel' ? feature.properties.receiptId : null,
  )
  const traverses = await client.query<{ id: string }>(
    `SELECT t.id FROM parcel_traverses t WHERE t.project_id=$1 AND t.id IN(SELECT d.traverse_id FROM parcel_boundary_drafts d WHERE d.project_id=$1 AND d.id=ANY($2::uuid[])) ORDER BY t.id FOR UPDATE`,
    [project, receipts],
  )
  if (!traverses.rows.length || traverses.rows.length > parcelIds.length)
    throw fail('The retained boundary source is no longer available.')
  const ids = traverses.rows.map((row) => row.id)
  // Parent FOR UPDATE blocks new child FK admissions; lock existing source
  // rows separately. Unrelated projects and whole tables are never locked.
  const coordinates = await client.query(
    'SELECT id FROM traverse_coordinates WHERE traverse_id=ANY($1::uuid[]) ORDER BY id LIMIT 25001 FOR SHARE',
    [ids],
  )
  const observations = await client.query(
    'SELECT id FROM traverse_observations WHERE traverse_id=ANY($1::uuid[]) ORDER BY id LIMIT 100001 FOR SHARE',
    [ids],
  )
  if (coordinates.rows.length > 25000 || observations.rows.length > 100000)
    throw fail(
      'The retained observation set exceeds this selected export window.',
    )
  const source = admittedSchemeSource(
    await readSchemeSelection(actor, project, parcelIds, client),
  )
  if (hashSchemeValue(source) !== hashSchemeValue(before))
    throw fail(
      'Boundary evidence changed while the export was being prepared. Review the selection again.',
    )
  return source
}
export async function readRetainedSchemeExport(
  actor: string,
  project: string,
  requestId: string,
  format: SchemeExportFormat,
  client: PoolClient,
  intent?: string,
): Promise<SchemeExportPacket | null> {
  const result = await client.query<DeliverableRevision>(
    `SELECT r.* FROM deliverable_revisions r JOIN deliverables d ON d.id=r.deliverable_id WHERE d.project_id=$1 AND r.generator IN('scheme-boundary-dxf','scheme-boundary-geojson') AND r.manifest#>>'{request,userId}'=$2 AND r.manifest#>>'{request,id}'=$3 LIMIT 2`,
    [project, actor, requestId],
  )
  if (!result.rows.length) return null
  if (result.rows.length !== 1)
    throw fail('This retained request has inconsistent registration history.')
  const row = result.rows[0],
    request = z
      .object({
        id: id,
        userId: id,
        projectId: id,
        payloadHash: z.string(),
        format: z.enum(['dxf', 'geojson']),
        body: schemeExportRequestSchema,
      })
      .strict()
      .safeParse(row.manifest.request),
    source = schemeViewportSchema.safeParse(row.manifest.source)
  if (!request.success || !source.success)
    throw fail(
      'The retained export manifest is inconsistent; no replacement was generated.',
    )
  const command = request.data.body,
    payloadHash = hashSchemeValue(schemeExportIntent(command, format)),
    sourceRevision = schemeSourceRevision(command.sourceHash),
    outputCrs = format === 'dxf' ? source.data.crs : WGS84_CRS
  if (
    request.data.id !== requestId ||
    command.requestId !== requestId ||
    request.data.userId !== actor ||
    command.expectedUserId !== actor ||
    request.data.projectId !== project ||
    command.projectId !== project ||
    request.data.format !== format ||
    request.data.payloadHash !== payloadHash ||
    (intent && intent !== payloadHash) ||
    row.generator !== generator(format) ||
    row.generator_version !== '1.0' ||
    row.manifest.protocol !== 'scheme-boundary-export-v1' ||
    source.data.projectId !== project ||
    hashSchemeValue(source.data) !== command.sourceHash ||
    row.manifest.sourceHash !== command.sourceHash ||
    row.source_revision !== schemeSourceRevision(command.sourceHash) ||
    row.manifest.sourceRevision !== row.source_revision ||
    row.project_crs !== outputCrs ||
    row.manifest.outputCrs !== outputCrs ||
    JSON.stringify(source.data.selection) !== JSON.stringify(command.parcelIds)
  )
    throw fail(
      'The request identity or selected source differs from the retained export. Recover the original request.',
    )
  const filename = `boundary-drafts-${requestId}.${format}`,
    folder = `scheme-exports/${actor}/${project}/${requestId}/`
  if (
    !row.storage_path?.startsWith(folder) ||
    !new RegExp(`^[a-f0-9]{16}-${filename.replaceAll('.', '\\.')}$`).test(
      row.storage_path.slice(folder.length),
    )
  )
    throw fail('The retained artifact location is inconsistent.')
  const files = await client.query<{
    user_id: string
    project_id: string
    filename: string
    mime_type: string
    size_bytes: string | number
    sha256: string
    upload_purpose: string
  }>(
    'SELECT user_id,project_id,filename,mime_type,size_bytes,sha256,upload_purpose FROM file_uploads WHERE storage_path=$1',
    [row.storage_path],
  )
  const file = files.rows[0]
  if (
    files.rows.length !== 1 ||
    file.user_id !== actor ||
    file.project_id !== project ||
    file.filename !== filename ||
    file.mime_type !== mime(format) ||
    file.upload_purpose !== 'scheme-boundary-export' ||
    file.sha256 !== row.content_hash ||
    Number(file.size_bytes) !== Number(row.bytes) ||
    Number(row.bytes) > SCHEME_EXPORT_BYTES ||
    Number(row.bytes) < 1
  )
    throw fail('The retained artifact registration is inconsistent.')
  let bytes: Buffer
  try {
    bytes = await downloadFileBounded(row.storage_path, SCHEME_EXPORT_BYTES)
  } catch {
    throw fail(
      'The retained artifact is unavailable. Its register was preserved; no replacement was generated.',
    )
  }
  if (
    bytes.length !== Number(row.bytes) ||
    hashDeliverableContent(bytes) !== row.content_hash
  )
    throw fail(
      'The retained artifact failed its byte/hash check. Its register was preserved.',
    )
  return {
    bytes,
    filename,
    storagePath: row.storage_path,
    contentHash: row.content_hash,
    deliverableId: row.deliverable_id,
    revision: row.revision,
    revisionId: row.id,
    requestId,
    requestHash: payloadHash,
    sourceHash: command.sourceHash,
    sourceRevision,
    sourceCrs: source.data.crs,
    outputCrs,
    replayed: true,
  }
}
export async function executeSchemeExport(
  actor: string,
  project: string,
  requestId: string,
  format: SchemeExportFormat,
  input?: unknown,
  cancel = false,
): Promise<SchemeExportPacket | SchemeExportCancellation> {
  identity(actor, project, requestId)
  const parsed =
    input === undefined ? null : schemeExportRequestSchema.safeParse(input)
  if (parsed && !parsed.success)
    throw fail('A valid reviewed export command is required.', 400)
  const body = parsed?.success ? parsed.data : undefined
  if (cancel && !body)
    throw fail(
      'An exact retained command is required to cancel this request.',
      400,
    )
  if (
    body &&
    (body.expectedUserId !== actor ||
      body.projectId !== project ||
      body.requestId !== requestId)
  )
    throw fail('Sign in as the account that reviewed this project export.', 403)
  let newPath: string | null = null
  try {
    return await db.transaction(async (client) => {
      const owner = await client.query<{ user_id: string }>(
        'SELECT user_id FROM projects WHERE id=$1 FOR UPDATE',
        [project],
      )
      if (owner.rows[0]?.user_id !== actor)
        throw fail('Project not found for this account.', 404)
      await ensureSchemeExportStorage(client)
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`scheme-export:${project}:${actor}:${requestId}`],
      )
      const payloadHash = body
        ? hashSchemeValue(schemeExportIntent(body, format))
        : undefined
      const journal = await readSchemeExportJournal(
        actor,
        project,
        requestId,
        format,
        client,
        payloadHash,
      )
      if (journal?.outcome === 'cancelled') {
        const expected = cancellation(
            journal.body,
            format,
            journal.request_hash,
          ),
          parsed = schemeExportCancellationSchema.safeParse(journal.receipt)
        if (
          !parsed.success ||
          hashSchemeValue(parsed.data) !== hashSchemeValue(expected)
        )
          throw fail('The retained cancellation receipt is inconsistent.')
        return parsed.data
      }
      const recovered = await readRetainedSchemeExport(
        actor,
        project,
        requestId,
        format,
        client,
        payloadHash,
      )
      if (recovered) {
        if (
          !journal ||
          journal.deliverable_revision_id !== recovered.revisionId ||
          hashSchemeValue(journal.receipt) !==
            hashSchemeValue(packetReceipt(recovered))
        )
          throw fail(
            'The retained artifact and request journal disagree. No replacement was generated.',
          )
        return recovered
      }
      if (journal)
        throw fail(
          'The committed request has no accessible matching artifact registration. No replacement was generated.',
        )
      if (!body)
        throw fail('No committed export was found for this request.', 404)
      if (cancel) {
        const receipt = cancellation(
          body,
          format,
          hashSchemeValue(schemeExportIntent(body, format)),
        )
        await appendSchemeExportJournal(
          body,
          format,
          'cancelled',
          receipt,
          null,
          client,
        )
        return receipt
      }
      if (
        format === 'dxf' &&
        !(await checkFeatureAccess(actor, 'dxf_export')).allowed
      )
        throw fail(
          'Generating a new DXF requires an active Pro plan or higher.',
          403,
        )
      const source = await lockSource(actor, project, body.parcelIds, client)
      if (hashSchemeValue(source) !== body.sourceHash)
        throw fail(
          'The selected geometry, reference or evidence changed. Review the selection again.',
        )
      const artifact = buildSchemeArtifact(source, format),
        filename = `boundary-drafts-${requestId}.${format}`,
        contentHash = hashDeliverableContent(artifact.bytes)
      const folder = `scheme-exports/${actor}/${project}/${requestId}`,
        storagePath = await uploadFile(
          artifact.bytes,
          filename,
          mime(format),
          folder,
        )
      if (
        !storagePath.startsWith(`${folder}/`) ||
        !new RegExp(`^[a-f0-9]{16}-${filename.replaceAll('.', '\\.')}$`).test(
          storagePath.slice(folder.length + 1),
        )
      )
        throw fail('The artifact was not saved in its owned request folder.')
      newPath = storagePath
      const stored = await downloadFileBounded(storagePath, SCHEME_EXPORT_BYTES)
      if (
        stored.length !== artifact.bytes.length ||
        hashDeliverableContent(stored) !== contentHash
      )
        throw fail('Stored artifact bytes do not match the generated output.')
      const file = await client.query<{
        id: string
        user_id: string
        project_id: string
        storage_path: string
        filename: string
        mime_type: string
        size_bytes: string | number
        sha256: string
        upload_purpose: string
      }>(
        `INSERT INTO file_uploads(user_id,project_id,storage_path,filename,mime_type,size_bytes,upload_purpose,sha256) VALUES($1,$2,$3,$4,$5,$6,'scheme-boundary-export',$7) RETURNING *`,
        [
          actor,
          project,
          storagePath,
          filename,
          mime(format),
          stored.length,
          contentHash,
        ],
      )
      const saved = file.rows[0]
      if (
        file.rowCount !== 1 ||
        file.rows.length !== 1 ||
        !id.safeParse(saved?.id).success ||
        saved.user_id !== actor ||
        saved.project_id !== project ||
        saved.storage_path !== storagePath ||
        saved.filename !== filename ||
        saved.mime_type !== mime(format) ||
        Number(saved.size_bytes) !== stored.length ||
        saved.sha256 !== contentHash ||
        saved.upload_purpose !== 'scheme-boundary-export'
      )
        throw fail('The artifact registration was not acknowledged exactly.')
      const manifest = {
        ...artifact.manifest,
        request: {
          id: requestId,
          userId: actor,
          projectId: project,
          payloadHash,
          format,
          body,
        },
      }
      const registered = await registerDeliverable(
        {
          projectId: project,
          documentType: format,
          content: stored,
          storagePath,
          sourceRevision: artifact.sourceRevision,
          projectCrs: artifact.outputCrs,
          title: 'Selected parcel boundaries — unverified draft',
          generator: generator(format),
          generatorVersion: '1.0',
          manifest,
          userId: actor,
        },
        client,
      )
      const d = registered.deliverable,
        r = registered.revision
      if (
        !id.safeParse(d.id).success ||
        !id.safeParse(r.id).success ||
        d.project_id !== project ||
        d.document_type !== format ||
        d.status !== 'IN_REVIEW' ||
        d.generated_by !== actor ||
        d.source_revision !== artifact.sourceRevision ||
        r.deliverable_id !== d.id ||
        r.revision !== d.current_revision ||
        !Number.isSafeInteger(r.revision) ||
        r.revision < 1 ||
        r.storage_path !== storagePath ||
        r.content_hash !== contentHash ||
        Number(r.bytes) !== stored.length ||
        r.source_revision !== artifact.sourceRevision ||
        r.project_crs !== artifact.outputCrs ||
        r.generator !== generator(format) ||
        r.generator_version !== '1.0' ||
        r.generated_by !== actor ||
        hashSchemeValue(r.manifest) !== hashSchemeValue(manifest)
      )
        throw fail(
          'The deliverable register did not acknowledge the exact artifact and source.',
        )
      const evidence = await client.query<{
        details: unknown
        event_hash: string
        previous_hash: string
      }>(
        `SELECT details,event_hash,previous_hash FROM evidence_events WHERE project_id=$1 AND entity_type='deliverable' AND entity_id=$2 AND event_type='EXPORTED' AND user_id=$3 AND details->>'revision'=$4 ORDER BY created_at DESC,id DESC LIMIT 2`,
        [project, d.id, actor, String(r.revision)],
      )
      const details = {
        document_type: format,
        revision: r.revision,
        content_hash: contentHash,
        source_revision: artifact.sourceRevision,
        project_crs: artifact.outputCrs,
        generator: generator(format),
        bytes: stored.length,
      }
      if (
        evidence.rows.length !== 1 ||
        hashSchemeValue(evidence.rows[0].details) !==
          hashSchemeValue(details) ||
        !/^(GENESIS|[a-f0-9]{64})$/.test(evidence.rows[0].previous_hash) ||
        evidence.rows[0].event_hash !==
          hashEvidenceEvent(
            {
              projectId: project,
              entityType: 'deliverable',
              entityId: d.id,
              eventType: 'EXPORTED',
              details,
              userId: actor,
            },
            evidence.rows[0].previous_hash,
          )
      )
        throw fail('Export evidence was not recorded exactly.')
      if (!payloadHash) throw fail('Export intent was not retained.')
      const packet: SchemeExportPacket = {
        bytes: stored,
        filename,
        storagePath,
        contentHash,
        deliverableId: d.id,
        revision: r.revision,
        revisionId: r.id,
        requestId,
        requestHash: payloadHash,
        sourceHash: artifact.sourceHash,
        sourceRevision: artifact.sourceRevision,
        sourceCrs: source.crs,
        outputCrs: artifact.outputCrs,
        replayed: false,
      }
      await appendSchemeExportJournal(
        body,
        format,
        'committed',
        packetReceipt(packet),
        r.id,
        client,
      )
      return packet
    })
  } catch (error) {
    if (newPath)
      try {
        const found = await db.query(
          'SELECT id FROM file_uploads WHERE storage_path=$1 UNION ALL SELECT id FROM deliverable_revisions WHERE storage_path=$1 LIMIT 1',
          [newPath],
        )
        if (!found.rows.length) await deleteFile(newPath)
      } catch (cleanupError) {
        logger.error(
          '[scheme-export] unconfirmed artifact retained for recovery',
          { storagePath: newPath, error: cleanupError },
        )
      }
    throw error
  }
}
function cancellation(
  body: SchemeExportRequest,
  format: SchemeExportFormat,
  requestHash: string,
): SchemeExportCancellation {
  return {
    outcome: 'cancelled',
    projectId: body.projectId,
    actorId: body.expectedUserId,
    requestId: body.requestId,
    requestHash,
    sourceHash: body.sourceHash,
    format,
  }
}
function packetReceipt(packet: SchemeExportPacket): Record<string, unknown> {
  const { bytes: _bytes, replayed: _replayed, ...metadata } = packet
  return { outcome: 'committed', ...metadata }
}
