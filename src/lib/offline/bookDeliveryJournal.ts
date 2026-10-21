import { openDB, type DBSchema } from 'idb'
import { z } from 'zod'
import { bookRevisionSchema, canonicalDeliveryJson, fieldbookSaveRequestSchema, type FieldbookSaveRequest, type FieldbookSaveResult, type Json } from '@/lib/fieldbook/delivery'
import { acknowledgeBookDelivery, bookDeliveryHash, deliverBookRequest } from '@/lib/fieldbook/deliveryClient'

const envelopeSchema = z.object({ version: z.literal(1), key: z.string(), actorId: z.string().uuid(),
  request: fieldbookSaveRequestSchema, requestHash: z.string().regex(/^[a-f0-9]{64}$/), result: z.unknown() }).strict()
export interface RetainedBookRequest { request: FieldbookSaveRequest; result: FieldbookSaveResult | null }
interface Envelope extends RetainedBookRequest { version: 1; key: string; actorId: string; requestHash: string }
interface JournalDB extends DBSchema { requests: { key: string; value: Envelope } }
// A new journal does not migrate, coalesce or erase unknown legacy device work.
const openJournal = () => openDB<JournalDB>('metardu-book-delivery-journal', 1, {
  upgrade(database) { database.createObjectStore('requests', { keyPath: 'key' }) },
})
const keyFor = (actor: string, requestId: string) => `${z.string().uuid().parse(actor)}:${z.string().uuid().parse(requestId)}`
const invalid = () => new Error('The retained book request could not be verified. It was kept for inspection; no acknowledgement was attached.')
function envelope(value: unknown, actor: string, project: string, requestId?: string) {
  const parsed = envelopeSchema.safeParse(value)
  if (!parsed.success || parsed.data.actorId !== actor || parsed.data.request.projectId !== project
    || parsed.data.key !== keyFor(actor, parsed.data.request.requestId) || requestId && parsed.data.request.requestId !== requestId) throw invalid()
  return parsed.data
}
async function checked(value: unknown, actor: string, project: string, requestId?: string): Promise<Envelope> {
  const parsed = envelope(value, actor, project, requestId)
  if (await bookDeliveryHash(parsed.request) !== parsed.requestHash) throw invalid()
  const result = parsed.result === null ? null : await acknowledgeBookDelivery(actor, parsed.request, parsed.result)
  return { ...parsed, result }
}
async function read(actor: string, project: string, requestId: string): Promise<Envelope> {
  const key = keyFor(actor, requestId); z.string().uuid().parse(project)
  const database = await openJournal()
  try { return await checked(await database.get('requests', key), actor, project, requestId) }
  finally { database.close() }
}
/** A fixed request is durable before dispatch. No clock-based coalescing or baseline adoption. */
export async function retainBookRequest(actor: string, value: FieldbookSaveRequest): Promise<RetainedBookRequest> {
  const request = JSON.parse(JSON.stringify(fieldbookSaveRequestSchema.parse(value))) as FieldbookSaveRequest, key = keyFor(actor, request.requestId)
  if (new TextEncoder().encode(JSON.stringify(request)).length > 10 * 1024 * 1024) throw new Error('This book exceeds the 10 MB delivery limit. Export its JSON before continuing.')
  const candidate: Envelope = { version: 1, key, actorId: actor, request, requestHash: await bookDeliveryHash(request), result: null }
  const database = await openJournal(), tx = database.transaction('requests', 'readwrite', { durability: 'strict' })
  let retained: unknown
  try {
    const previous = await tx.store.get(key)
    if (previous !== undefined) {
      const parsed = envelope(previous, actor, request.projectId, request.requestId)
      if (parsed.requestHash !== candidate.requestHash || canonicalDeliveryJson(parsed.request) !== canonicalDeliveryJson(request)) throw invalid()
      retained = previous
    } else { await tx.store.add(candidate); retained = candidate }
    await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* Transaction may already be closed. */ }
    await tx.done.catch(() => {})
    throw error
  } finally { database.close() }
  return checked(retained, actor, request.projectId, request.requestId)
}
export async function listBookRequests(actor: string, project: string): Promise<RetainedBookRequest[]> {
  z.string().uuid().parse(actor); z.string().uuid().parse(project)
  const database = await openJournal()
  try {
    const all = await database.getAll('requests')
    return await Promise.all(all.filter(item => item?.actorId === actor && item.request?.projectId === project).map(item => checked(item, actor, project)))
  } finally { database.close() }
}
/** Record only this immutable operation's result; other requests are never cleared or replaced. */
export async function sendRetainedBookRequest(actor: string, project: string, requestId: string): Promise<FieldbookSaveResult> {
  const retained = await read(actor, project, requestId)
  const result = await deliverBookRequest(actor, retained.request)
  // Complete hashing/network work before the IDB acknowledgement transaction.
  const original = canonicalDeliveryJson(retained.request)
  const database = await openJournal(), tx = database.transaction('requests', 'readwrite', { durability: 'strict' })
  try {
    const current = envelope(await tx.store.get(retained.key), actor, project, requestId)
    if (current.requestHash !== retained.requestHash || canonicalDeliveryJson(current.request) !== original) throw invalid()
    // Concurrent retries can return different currentRevision metadata, but
    // must acknowledge the same immutable receipt and original saved snapshot.
    let storedResult = result
    if (current.result !== null) {
      const existing = current.result as FieldbookSaveResult
      if (canonicalDeliveryJson(existing.receipt) !== canonicalDeliveryJson(result.receipt)
        || canonicalDeliveryJson(existing.book) !== canonicalDeliveryJson(result.book)) throw invalid()
      const existingRevision = bookRevisionSchema.safeParse(existing.currentRevision)
      if (!existingRevision.success || typeof result.currentRevision !== 'string') throw invalid()
      if (BigInt(existingRevision.data) > BigInt(result.currentRevision)) storedResult = existing
    }
    await tx.store.put({ ...retained, result: JSON.parse(canonicalDeliveryJson(storedResult as unknown as Json)) as FieldbookSaveResult })
    await tx.done
    return storedResult
  } catch (error) {
    try { tx.abort() } catch { /* Keep a closed transaction unchanged. */ }
    await tx.done.catch(() => {})
    throw error
  } finally { database.close() }
}
