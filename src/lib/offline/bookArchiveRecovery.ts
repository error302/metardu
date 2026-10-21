import { openDB, type DBSchema } from 'idb'
import { z } from 'zod'
import { canonicalDeliveryJson, fieldbookSaveRequestSchema, type FieldbookSaveRequest } from '@/lib/fieldbook/delivery'
import { bookDeliveryHash } from '@/lib/fieldbook/deliveryClient'
import { bookEditEnvelopeSchema, bookEditRequestMatches, findBookEdit, retainBookEdit, type BookEdit } from './bookEdits'
import { bookRequestEnvelopeSchema, findBookRequest, retainBookRequest } from './bookDeliveryJournal'

export const BOOK_ARCHIVE_MAX_BYTES = 50 * 1024 * 1024
export interface ArchivePreview { hash: string; edits: number; requests: number; legacy: number; unreadable: number }
export interface ArchiveSummary extends ArchivePreview { complete: boolean; inspectionOnly?: true }
const uuid = z.string().uuid(), hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const sourceSchema = z.object({ version: z.literal(1), actorId: uuid, projectId: uuid,
  edits: z.array(z.unknown()).max(10000), requests: z.array(z.unknown()).max(10000), legacy: z.array(z.unknown()).max(10000) }).strict()
const recordSchema = z.object({ version: z.literal(1), key: z.string(), actorId: uuid, projectId: uuid, hash: hashSchema,
  bytes: z.instanceof(Uint8Array), bindings: z.array(uuid).max(10000), bindingsHash: hashSchema, complete: z.boolean() }).strict()
// Export authority depends on the original bytes and scope, not mutable restore metadata.
const sourceRecordSchema = recordSchema.pick({ version: true, key: true, actorId: true, projectId: true, hash: true, bytes: true }).strip()
type ArchiveRecord = z.infer<typeof recordSchema>
interface ArchiveDB extends DBSchema { archives: { key: string; value: ArchiveRecord } }
const openArchives = () => openDB<ArchiveDB>('metardu-book-recovery-archives', 1, { upgrade(db) { db.createObjectStore('archives', { keyPath: 'key' }) } })
const keyFor = (actor: string, project: string, hash: string) => `${uuid.parse(actor)}:${uuid.parse(project)}:${hashSchema.parse(hash)}`
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const same = (left: BookEdit | FieldbookSaveRequest, right: BookEdit | FieldbookSaveRequest) => canonicalDeliveryJson(left) === canonicalDeliveryJson(right)
const conflict = () => new Error('An archive identity identifies different retained work. The original source and existing records were kept; resolve the conflict before resuming.')
async function bytesHash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
function copySource(bytes: Uint8Array) {
  if (bytes.byteLength > BOOK_ARCHIVE_MAX_BYTES) throw new Error('Device archives must be at most 50 MiB. Keep the original file for inspection.')
  return new Uint8Array(bytes)
}
function requireScope(value: unknown, actor: string, project: string) {
  const row = object(value)
  for (const field of ['actorId', 'user_id']) if (row[field] !== undefined && row[field] !== actor) throw new Error('The archive contains a record from another account.')
  for (const field of ['projectId', 'project_id']) if (row[field] !== undefined && row[field] !== project) throw new Error('The archive contains a record from another project.')
}
async function parseSource(actor: string, project: string, bytes: Uint8Array) {
  uuid.parse(actor); uuid.parse(project)
  const source = sourceSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  if (source.actorId !== actor || source.projectId !== project) throw new Error('This archive belongs to another account or project. Open its original account and project to recover it.')
  const edits = new Map<string, BookEdit>(), requests = new Map<string, FieldbookSaveRequest>(), legacy: Omit<BookEdit, 'requestId'>[] = []
  let unreadable = 0
  for (const raw of source.edits) {
    requireScope(raw, actor, project); requireScope(object(raw).edit, actor, project)
    const parsed = bookEditEnvelopeSchema.safeParse(raw)
    if (!parsed.success || parsed.data.key !== `${actor}:${parsed.data.edit.requestId}` || await bookDeliveryHash(parsed.data.edit) !== parsed.data.hash) { unreadable++; continue }
    const value = parsed.data.edit, previous = edits.get(value.requestId)
    if (previous && !same(previous, value)) throw conflict()
    edits.set(value.requestId, value)
  }
  for (const raw of source.requests) {
    requireScope(raw, actor, project); requireScope(object(raw).request, actor, project)
    const parsed = bookRequestEnvelopeSchema.safeParse(raw)
    if (!parsed.success || parsed.data.key !== `${actor}:${parsed.data.request.requestId}` || await bookDeliveryHash(parsed.data.request) !== parsed.data.requestHash) { unreadable++; continue }
    const value = parsed.data.request, previous = requests.get(value.requestId)
    if (previous && !same(previous, value)) throw conflict()
    const edit = edits.get(value.requestId)
    if (edit && !bookEditRequestMatches(edit, value)) throw conflict()
    requests.set(value.requestId, value)
  }
  for (const raw of source.legacy) {
    requireScope(raw, actor, project)
    const row = object(raw), data = object(row.data)
    requireScope(data, actor, project)
    const parsed = fieldbookSaveRequestSchema.safeParse({ protocol: 'fieldbook-save-v1', requestId: actor, projectId: data.project_id,
      bookId: data.id, type: data.type, name: data.name, data: data.data, baseRevision: null })
    if (row.table !== 'fieldbooks' || !['INSERT', 'UPDATE', 'UPSERT'].includes(String(row.type)) || row.projectId !== project || data.user_id !== actor || !parsed.success) { unreadable++; continue }
    const { protocol: _protocol, baseRevision: _base, requestId: _id, ...editable } = parsed.data
    legacy.push({ ...editable, basis: { kind: 'unknown' } })
  }
  return { edits, requests, legacy, preview: { hash: await bytesHash(bytes), edits: edits.size, requests: requests.size, legacy: legacy.length, unreadable } }
}
type Parsed = Awaited<ReturnType<typeof parseSource>>
async function checkedSource(value: unknown, actor: string, project: string, hash?: string) {
  const record = sourceRecordSchema.parse(value)
  if (record.actorId !== actor || record.projectId !== project || hash && record.hash !== hash || record.key !== keyFor(actor, project, record.hash)
    || record.bytes.byteLength > BOOK_ARCHIVE_MAX_BYTES || await bytesHash(record.bytes) !== record.hash) throw new Error('The retained source archive could not be verified. Keep device storage intact for inspection.')
  const parsed = await parseSource(actor, project, record.bytes)
  return { record, parsed }
}
async function checkedMetadata(value: unknown, parsed: Parsed) {
  const record = recordSchema.parse(value)
  if (await bookDeliveryHash(record.bindings) !== record.bindingsHash || record.bindings.length !== parsed.legacy.length
    || new Set(record.bindings).size !== record.bindings.length) throw new Error('The retained archive identities could not be verified. Download its original bytes for inspection.')
  return record
}
async function checked(value: unknown, actor: string, project: string, hash?: string) {
  const { parsed } = await checkedSource(value, actor, project, hash)
  return { record: await checkedMetadata(value, parsed), parsed }
}
async function stage(actor: string, project: string, bytes: Uint8Array, parsed: Parsed) {
  const bindings = parsed.legacy.map(() => crypto.randomUUID())
  const candidate: ArchiveRecord = { version: 1, key: keyFor(actor, project, parsed.preview.hash), actorId: actor, projectId: project,
    hash: parsed.preview.hash, bytes: new Uint8Array(bytes), bindings, bindingsHash: await bookDeliveryHash(bindings), complete: false }
  const db = await openArchives(), tx = db.transaction('archives', 'readwrite', { durability: 'strict' })
  let retained: unknown
  try {
    const previous = await tx.store.get(candidate.key)
    if (previous === undefined) { await tx.store.add(candidate); retained = candidate }
    else retained = previous
    await tx.done
  } catch (error) { try { tx.abort() } catch { /* Preserve a closed transaction. */ } await tx.done.catch(() => {}); throw error }
  finally { db.close() }
  return checked(retained, actor, project, parsed.preview.hash)
}
async function mark(record: ArchiveRecord, complete: boolean) {
  const db = await openArchives(), tx = db.transaction('archives', 'readwrite', { durability: 'strict' })
  try {
    const current = recordSchema.parse(await tx.store.get(record.key))
    // Immutable source identity was verified before entering this transaction.
    if (current.hash !== record.hash || current.bindingsHash !== record.bindingsHash || current.actorId !== record.actorId || current.projectId !== record.projectId
      || current.bytes.length !== record.bytes.length || !current.bytes.every((byte, index) => byte === record.bytes[index])
      || current.bindings.some((id, index) => id !== record.bindings[index]) || current.bindings.length !== record.bindings.length) throw conflict()
    await tx.store.put({ ...current, complete }); await tx.done
  } catch (error) { try { tx.abort() } catch { /* Preserve a closed transaction. */ } await tx.done.catch(() => {}); throw error }
  finally { db.close() }
}
export async function previewBookArchive(actor: string, project: string, input: Uint8Array): Promise<ArchivePreview> {
  const bytes = copySource(input)
  return (await parseSource(actor, project, bytes)).preview
}
export async function restoreBookArchive(actor: string, project: string, input: Uint8Array, reviewedHash: string): Promise<ArchiveSummary> {
  const bytes = copySource(input), parsed = await parseSource(actor, project, bytes)
  if (parsed.preview.hash !== reviewedHash) throw new Error('The file changed after review. Review the exact archive again before restoring.')
  const staged = await stage(actor, project, bytes, parsed), { record } = staged
  await mark(record, false)
  const edits = new Map(parsed.edits)
  for (const request of parsed.requests.values()) if (!edits.has(request.requestId)) {
    const { protocol: _protocol, baseRevision: _base, ...raw } = request
    const local = await findBookEdit(actor, project, request.requestId)
    if (local && !bookEditRequestMatches(local, request)) throw conflict()
    edits.set(request.requestId, local ?? { ...raw, basis: { kind: 'retained_request' } })
  }
  parsed.legacy.forEach((edit, index) => {
    const requestId = record.bindings[index]
    if (edits.has(requestId) || parsed.requests.has(requestId)) throw conflict()
    edits.set(requestId, { ...edit, requestId })
  })
  // Preflight every known collision; each journal also checks its own transaction.
  for (const edit of edits.values()) {
    const local = await findBookEdit(actor, project, edit.requestId), delivered = await findBookRequest(actor, project, edit.requestId)
    if (local && !same(local, edit) || delivered && !bookEditRequestMatches(edit, delivered.request)) throw conflict()
  }
  for (const request of parsed.requests.values()) {
    const local = await findBookRequest(actor, project, request.requestId)
    if (local && !same(local.request, request)) throw conflict()
  }
  for (const request of parsed.requests.values()) await retainBookRequest(actor, request)
  for (const edit of edits.values()) await retainBookEdit(actor, edit)
  await mark(record, true)
  return { ...parsed.preview, complete: true }
}
export async function listBookArchives(actor: string, project: string): Promise<ArchiveSummary[]> {
  uuid.parse(actor); uuid.parse(project)
  const db = await openArchives()
  try {
    const values = (await db.getAll('archives')).filter(value => value?.actorId === actor && value.projectId === project)
    return await Promise.all(values.map(async value => {
      const { parsed } = await checkedSource(value, actor, project)
      try { return { ...parsed.preview, complete: (await checkedMetadata(value, parsed)).complete } }
      catch { return { ...parsed.preview, complete: false, inspectionOnly: true as const } }
    }))
  } finally { db.close() }
}
export async function readBookArchive(actor: string, project: string, hash: string): Promise<Uint8Array> {
  const key = keyFor(actor, project, hash), db = await openArchives()
  try { return (await checkedSource(await db.get('archives', key), actor, project, hash)).record.bytes.slice() }
  finally { db.close() }
}
