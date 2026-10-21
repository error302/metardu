import { openDB, type DBSchema } from 'idb'
import { z } from 'zod'
import { bookRevisionSchema, canonicalDeliveryJson, fieldbookSaveRequestSchema, type FieldbookSaveResult } from '@/lib/fieldbook/delivery'
import { bookDeliveryHash } from '@/lib/fieldbook/deliveryClient'
import { findBookRequest, retainBookRequest, sendRetainedBookRequest } from './bookDeliveryJournal'
export const bookSaveOriginSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('new') }).strict(), z.object({ kind: z.literal('unknown') }).strict(),
  z.object({ kind: z.literal('revision'), revision: bookRevisionSchema }).strict(), z.object({ kind: z.literal('operation'), requestId: z.string().uuid() }).strict()])
export type BookSaveOrigin = z.infer<typeof bookSaveOriginSchema>
const editSchema = fieldbookSaveRequestSchema.omit({ protocol: true, baseRevision: true }).extend({ basis: bookSaveOriginSchema }).strict()
export type BookEdit = z.infer<typeof editSchema>
const envelopeSchema = z.object({ version: z.literal(1), key: z.string(), actorId: z.string().uuid(), projectId: z.string().uuid(), edit: editSchema, hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
type Envelope = z.infer<typeof envelopeSchema>
interface EditDB extends DBSchema { edits: { key: string; value: Envelope } }
const openEdits = () => openDB<EditDB>('metardu-book-edits', 1, { upgrade(database) { database.createObjectStore('edits', { keyPath: 'key' }) } })
const keyFor = (actor: string, id: string) => `${z.string().uuid().parse(actor)}:${z.string().uuid().parse(id)}`
async function checked(value: unknown, actor: string, project: string): Promise<Envelope> {
  const parsed = envelopeSchema.safeParse(value)
  if (!parsed.success || parsed.data.actorId !== actor || parsed.data.projectId !== project || parsed.data.edit.projectId !== project
    || parsed.data.key !== keyFor(actor, parsed.data.edit.requestId) || await bookDeliveryHash(parsed.data.edit) !== parsed.data.hash) {
    throw new Error('A retained book edit could not be verified. Keep its device record for recovery; it was not sent.')
  }
  return parsed.data
}
export async function retainBookEdit(actor: string, value: BookEdit): Promise<void> {
  const edit = JSON.parse(JSON.stringify(editSchema.parse(value))) as BookEdit, key = keyFor(actor, edit.requestId)
  if (new TextEncoder().encode(JSON.stringify(edit)).length > 10 * 1024 * 1024) throw new Error('This edit exceeds 10 MB. Export JSON to keep a copy.')
  const candidate: Envelope = { version: 1, key, actorId: actor, projectId: edit.projectId, edit, hash: await bookDeliveryHash(edit) }
  const database = await openEdits(), tx = database.transaction('edits', 'readwrite', { durability: 'strict' })
  try {
    const previous = await tx.store.get(key)
    if (previous !== undefined) {
      if (canonicalDeliveryJson(previous) !== canonicalDeliveryJson(candidate)) throw new Error('This edit key already identifies different work. Both the open edit and retained work were preserved.')
    } else await tx.store.add(candidate)
    await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* Keep a closed transaction intact. */ }
    await tx.done.catch(() => {}); throw error
  } finally { database.close() }
}
export async function readBookEdit(actor: string, project: string, id: string): Promise<BookEdit> {
  const key = keyFor(actor, id), database = await openEdits()
  try { return (await checked(await database.get('edits', key), actor, project)).edit }
  finally { database.close() }
}
export async function listBookEdits(actor: string, project: string): Promise<{ edit: BookEdit; result: FieldbookSaveResult | null }[]> {
  z.string().uuid().parse(actor); z.string().uuid().parse(project)
  const database = await openEdits()
  try {
    const values = (await database.getAll('edits')).filter(value => value?.actorId === actor && value.projectId === project)
    return await Promise.all(values.map(async value => {
      const { edit } = await checked(value, actor, project)
      const request = await findBookRequest(actor, project, edit.requestId)
      return { edit, result: request?.result ?? null }
    }))
  } finally { database.close() }
}
export async function exportBookEditRecords(actor: string, project: string): Promise<unknown[]> {
  z.string().uuid().parse(actor); z.string().uuid().parse(project)
  const database = await openEdits()
  try { return (await database.getAll('edits')).filter(value => value?.actorId === actor && value.projectId === project) }
  finally { database.close() }
}
/** Dispatch ancestors first. A parent's receipt supplies only its own saved revision. */
export async function sendBookEdit(actor: string, project: string, id: string): Promise<FieldbookSaveResult> {
  const seen = new Set<string>(); let remaining = 20
  async function send(editId: string, child?: BookEdit): Promise<FieldbookSaveResult> {
    if (seen.has(editId) || seen.size >= 1000) throw new Error('This edit ancestry needs inspection. All retained snapshots were kept.')
    seen.add(editId)
    const edit = await readBookEdit(actor, project, editId)
    if (child && (edit.bookId !== child.bookId || edit.type !== child.type)) throw new Error('The parent edit belongs to a different book. No revision was adopted.')
    const previous = await findBookRequest(actor, project, editId)
    if (previous?.result) return previous.result
    if (edit.basis.kind === 'unknown') throw new Error('This older book has no reviewed server revision. Review both copies in recovery before delivering a new edit.')
    const baseRevision = edit.basis.kind === 'new' ? null : edit.basis.kind === 'revision' ? edit.basis.revision
      : (await send(edit.basis.requestId, edit)).receipt.savedRevision
    const { basis: _basis, ...raw } = edit
    await retainBookRequest(actor, { ...raw, protocol: 'fieldbook-save-v1', baseRevision })
    if (remaining-- <= 0) throw new Error('Twenty deliveries were attempted. Remaining edits are retained; use Retry to continue.')
    return sendRetainedBookRequest(actor, project, editId)
  }
  return send(id)
}
