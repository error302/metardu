import { createHash } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { logAuditEvent } from '@/lib/enterprise/auditTrail'
import { canonicalDeliveryJson, fieldbookEditablePayload, fieldbookSaveReceiptSchema, fieldbookSaveRequestSchema, fieldbookSnapshotSchema,
  type FieldbookSaveResult, type FieldbookSnapshot, type Json } from './delivery'

type Connection = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Row = Record<string, unknown>
const columns = 'id,project_id,user_id,type,name,data,status,created_at,updated_at,revision::text AS revision'
const conflict = (message: string) => new AppError(message, 409, 'FIELDBOOK_REVISION_CONFLICT')
const invalidReceipt = () => new AppError('The exact book and delivery receipt were not acknowledged. The save was rolled back.', 500, 'FIELDBOOK_DELIVERY_ACK')
function hash(value: Json) { return createHash('sha256').update(canonicalDeliveryJson(value)).digest('hex') }
function snapshot(row: Row) {
  const parsed = fieldbookSnapshotSchema.safeParse(JSON.parse(JSON.stringify(row)))
  if (!parsed.success) throw invalidReceipt()
  return parsed.data
}
function payloadHash(book: FieldbookSnapshot) {
  return hash({ id: book.id, user_id: book.user_id, project_id: book.project_id, type: book.type, name: book.name, data: book.data })
}
function receiptFromRow(row: Row) {
  const parsed = fieldbookSaveReceiptSchema.safeParse({ protocol: row.protocol, fieldVerified: row.field_verified, actorId: row.actor_id, requestId: row.request_id, projectId: row.project_id, bookId: row.book_id,
    inputHash: row.input_hash, payloadHash: row.payload_hash, baseRevision: row.base_revision, savedRevision: row.saved_revision })
  if (!parsed.success) throw invalidReceipt()
  return parsed.data
}
async function requireProject(client: Connection, projectId: string, write: boolean) {
  if (!(await client.query('SELECT user_id FROM public.lock_project_for_read($1)', [projectId])).rows.length) throw new AppError('Project not found.', 404, 'FIELDBOOK_PROJECT')
  const access = await client.query<{ allowed: boolean }>('SELECT public.field_observation_project_access($1,$2) AS allowed', [projectId, write])
  if (access.rows[0]?.allowed !== true) throw new AppError('Current project access is required for this book operation.', 403, 'FIELDBOOK_ACCESS')
}
async function ready<T>(work: () => Promise<T>): Promise<T> {
  try { return await work() }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && ['42703', '42P01', '42883'].includes(String(error.code))) {
      throw new AppError('Fieldbook revision delivery is not ready on this server. Keep the device copy and retry after the release is verified.', 503, 'FIELDBOOK_DELIVERY_SCHEMA')
    }
    throw error
  }
}
function owned(book: FieldbookSnapshot, actor: string, project: string) {
  if (book.user_id !== actor || book.project_id !== project) throw new AppError('This book belongs to a different author or project. Retain the original and review a separate draft.', 403, 'FIELDBOOK_OWNER')
}

export async function saveFieldbookRevision(actor: string, value: unknown): Promise<FieldbookSaveResult> {
  z.string().guid().parse(actor)
  const input = fieldbookSaveRequestSchema.parse(value)
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 10 * 1024 * 1024) throw new AppError('This book exceeds the 10 MB delivery limit. Keep its JSON backup.', 413, 'FIELDBOOK_DELIVERY_SIZE')
  const inputHash = hash(input), intendedHash = hash(fieldbookEditablePayload(actor, input))
  return ready(() => db.transaction(async client => {
    await requireProject(client, input.projectId, true)
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`fieldbook-request:${actor}:${input.requestId}`])
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`fieldbook-write:${input.bookId}`])
    const row = (await client.query<Row>(`SELECT ${columns} FROM public.fieldbooks WHERE id=$1 FOR UPDATE`, [input.bookId])).rows[0]
    const current = row ? snapshot(row) : null
    if (current) owned(current, actor, input.projectId)
    const previous = (await client.query<Row>('SELECT * FROM public.fieldbook_save_receipts WHERE actor_id=$1 AND request_id=$2', [actor, input.requestId])).rows[0]
    if (previous) {
      if (previous.input_hash !== inputHash || previous.project_id !== input.projectId || previous.book_id !== input.bookId) throw conflict('This request ID already identifies different saved work. No book was overwritten.')
      if (!current) throw conflict('The originally saved book is no longer available. Retain this device copy for review.')
      const book = snapshot(previous.book_snapshot as Row)
      const receipt = receiptFromRow(previous)
      if (receipt.actorId !== actor || receipt.requestId !== input.requestId || receipt.protocol !== input.protocol
        || receipt.payloadHash !== intendedHash || payloadHash(book) !== intendedHash || receipt.savedRevision !== book.revision
        || receipt.baseRevision !== input.baseRevision) throw invalidReceipt()
      return { receipt, book, currentRevision: current.revision, replayed: true }
    }
    if (current && current.status !== 'active') throw conflict('This book is archived, deleted or has an unknown status. It was not replaced.')
    if (current && (input.baseRevision === null || current.revision !== input.baseRevision || current.type !== input.type)) throw conflict('The server book changed or this device has no reviewed baseline. Keep both versions; refresh and review before saving.')
    if (current && Object.prototype.hasOwnProperty.call(current.data, 'sourceImport')
      && (!Object.prototype.hasOwnProperty.call(input.data, 'sourceImport') || hash(current.data.sourceImport) !== hash(input.data.sourceImport))) {
      throw conflict('Retained source snapshots cannot be dropped or replaced by a working-book edit. Keep the original context and review a separate draft for new sources.')
    }
    if (!current && input.baseRevision !== null) throw conflict('The reviewed server book is unavailable. It was not silently recreated.')
    const result = current
      ? await client.query<Row>(`UPDATE public.fieldbooks SET name=$4,type=$5,data=$6 WHERE id=$1 AND project_id=$2 AND user_id=$3 AND revision=$7 RETURNING ${columns}`,
        [input.bookId, input.projectId, actor, input.name, input.type, JSON.stringify(input.data), input.baseRevision])
      : await client.query<Row>(`INSERT INTO public.fieldbooks (id,project_id,user_id,type,name,data) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING ${columns}`,
        [input.bookId, input.projectId, actor, input.type, input.name, JSON.stringify(input.data)])
    if (result.rows.length !== 1) throw invalidReceipt()
    const book = snapshot(result.rows[0])
    if (book.id !== input.bookId || book.user_id !== actor || book.project_id !== input.projectId || payloadHash(book) !== intendedHash
      || BigInt(book.revision) <= BigInt(0) || current && BigInt(book.revision) <= BigInt(current.revision)) throw invalidReceipt()
    const stored = await client.query<Row>('INSERT INTO public.fieldbook_save_receipts (actor_id,request_id,project_id,book_id,input_hash,base_revision,saved_revision,payload_hash,book_snapshot,base_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [actor, input.requestId, input.projectId, input.bookId, inputHash, input.baseRevision, book.revision, intendedHash, JSON.stringify(book), current ? JSON.stringify(current) : null])
    const receipt = fieldbookSaveReceiptSchema.parse({ protocol: input.protocol, fieldVerified: false, actorId: actor, requestId: input.requestId, projectId: input.projectId, bookId: input.bookId,
      inputHash, payloadHash: intendedHash, baseRevision: input.baseRevision, savedRevision: book.revision })
    if (stored.rows.length !== 1 || hash(receiptFromRow(stored.rows[0])) !== hash(receipt)
      || hash(stored.rows[0].book_snapshot as Json) !== hash(book) || hash(stored.rows[0].base_snapshot as Json) !== hash(current)) throw invalidReceipt()
    await logAuditEvent({ userId: actor, action: current ? 'update' : 'create', resourceType: 'fieldbooks', resourceId: input.bookId, timestamp: new Date(),
      details: { projectId: input.projectId, requestId: input.requestId, inputHash, baseRevision: input.baseRevision, savedRevision: book.revision, payloadHash: intendedHash, fieldVerified: false } }, client)
    return { receipt, book, currentRevision: book.revision, replayed: false }
  }))
}
export async function readFieldbookRevision(actor: string, project: string, bookId: string): Promise<FieldbookSnapshot> {
  z.string().guid().parse(actor); z.string().guid().parse(project); z.string().guid().parse(bookId)
  return ready(() => db.transaction(async client => {
    await requireProject(client, project, false)
    const row = (await client.query<Row>(`SELECT ${columns} FROM public.fieldbooks WHERE id=$1 FOR SHARE`, [bookId])).rows[0]
    if (!row) throw new AppError('Book not found.', 404, 'FIELDBOOK_NOT_FOUND')
    const book = snapshot(row); owned(book, actor, project); return book
  }))
}
