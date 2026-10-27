import { openDB, type DBSchema } from 'idb'
import { z } from 'zod'
import { bookRevisionSchema, canonicalDeliveryJson, fieldbookSaveRequestSchema, type FieldbookSaveRequest, type FieldbookSaveResult, type Json } from '@/lib/fieldbook/delivery'
import { acknowledgeBookDelivery, BookDeliveryDeferredError, BookDeliveryError, bookDeliveryHash, deliverBookRequest } from '@/lib/fieldbook/deliveryClient'
import { fieldDeliveryFailure, mayRetryFieldDelivery } from '@/lib/field/deliveryRetry'

const envelopeSchema = z.object({ version: z.literal(1), key: z.string(), actorId: z.string().guid(),
  request: fieldbookSaveRequestSchema, requestHash: z.string().regex(/^[a-f0-9]{64}$/), result: z.unknown().optional() }).strict()
export { envelopeSchema as bookRequestEnvelopeSchema }
export interface RetainedBookRequest { request: FieldbookSaveRequest; result: FieldbookSaveResult | null }
interface Envelope extends RetainedBookRequest { version: 1; key: string; actorId: string; requestHash: string }
const retrySchema = z.object({ key: z.string(), actorId: z.string().guid(), projectId: z.string().guid().nullable(), requestId: z.string().guid().nullable(),
  stamp: z.string().guid(), hardUntil: z.number().finite().nonnegative(),
  policy: z.object({ attempts: z.number().int().min(1).max(10), nextAttemptAt: z.number().finite().nonnegative(), blocked: z.boolean(), httpStatus: z.number().int().min(100).max(599).optional() }).strict(),
}).strict()
type RetryRecord = z.infer<typeof retrySchema>
interface JournalDB extends DBSchema { requests: { key: string; value: Envelope }; retries: { key: string; value: RetryRecord } }
// A new journal does not migrate, coalesce or erase unknown legacy device work.
const openJournal = () => openDB<JournalDB>('metardu-book-delivery-journal', 2, {
  upgrade(database, previous) {
    if (previous < 1) database.createObjectStore('requests', { keyPath: 'key' })
    if (previous < 2) database.createObjectStore('retries', { keyPath: 'key' })
  },
})
const keyFor = (actor: string, requestId: string) => `${z.string().guid().parse(actor)}:${z.string().guid().parse(requestId)}`
const invalid = () => new Error('The retained book request could not be verified. It was kept for inspection; no acknowledgement was attached.')
const retryKeys = (actor: string, requestId: string) => ({ request: `request:${keyFor(actor, requestId)}`, actor: `actor:${actor}` })
function checkedRetry(value: unknown, actor: string, project: string | null, requestId: string | null): RetryRecord | null {
  if (value === undefined) return null
  const parsed = retrySchema.safeParse(value), key = requestId ? retryKeys(actor, requestId).request : `actor:${actor}`
  if (!parsed.success || parsed.data.key !== key || parsed.data.actorId !== actor || parsed.data.projectId !== project || parsed.data.requestId !== requestId) {
    throw new Error('The delivery retry state could not be verified. Retained requests were kept and were not sent.')
  }
  return parsed.data
}
async function retryState(actor: string, project: string, requestId: string) {
  const keys = retryKeys(actor, requestId), database = await openJournal()
  try {
    const tx = database.transaction('retries', 'readonly')
    const [request, global] = await Promise.all([tx.store.get(keys.request), tx.store.get(keys.actor)])
    await tx.done
    return { request: checkedRetry(request, actor, project, requestId), actor: checkedRetry(global, actor, null, null) }
  } finally { database.close() }
}
function enforceRetry(state: RetryRecord | null, explicit: boolean, scope: 'request' | 'actor') {
  if (state && (state.hardUntil > Date.now() || !mayRetryFieldDelivery(state.policy, explicit))) {
    throw new BookDeliveryDeferredError(scope, Math.max(state.hardUntil, state.policy.nextAttemptAt), state.policy.blocked)
  }
}
function serverRetryDeadline(value: string | null | undefined): number {
  if (!value?.trim()) return 0
  const text = value.trim(), now = Date.now()
  const deadline = /^\d+(?:\.\d+)?$/.test(text) ? now + Number(text) * 1000 : Date.parse(text)
  return Number.isFinite(deadline) && deadline > now && deadline <= 8640000000000000 ? deadline : 0
}
async function rememberFailure(actor: string, project: string, requestId: string, cause: unknown) {
  const error = cause instanceof BookDeliveryError ? cause : undefined
  const keys = retryKeys(actor, requestId), database = await openJournal(), tx = database.transaction('retries', 'readwrite', { durability: 'strict' })
  try {
    const save = async (key: string, projectId: string | null, id: string | null) => {
      const previous = checkedRetry(await tx.store.get(key), actor, projectId, id)
      const policy = fieldDeliveryFailure(previous?.policy, error?.status)
      const hardUntil = Math.max(previous?.hardUntil ?? 0, serverRetryDeadline(error?.retryAfter), error?.status === 429 ? policy.nextAttemptAt : 0)
      await tx.store.put({ key, actorId: actor, projectId, requestId: id, stamp: crypto.randomUUID(), hardUntil,
        policy: { ...policy, nextAttemptAt: Math.max(policy.nextAttemptAt, hardUntil, previous?.policy.nextAttemptAt ?? 0) } })
    }
    await save(keys.request, project, requestId)
    if (error?.status === undefined || error.status === 401 || error.status === 408 || error.status === 429 || error.status >= 500) await save(keys.actor, null, null)
    await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* Preserve a closed transaction. */ }
    await tx.done.catch(() => {}); throw error
  } finally { database.close() }
}
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
  const key = keyFor(actor, requestId); z.string().guid().parse(project)
  const database = await openJournal()
  try { return await checked(await database.get('requests', key), actor, project, requestId) }
  finally { database.close() }
}
export async function findBookRequest(actor: string, project: string, requestId: string): Promise<RetainedBookRequest | null> {
  const key = keyFor(actor, requestId); z.string().guid().parse(project)
  const database = await openJournal()
  try {
    const value = await database.get('requests', key)
    return value === undefined ? null : await checked(value, actor, project, requestId)
  } finally { database.close() }
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
  z.string().guid().parse(actor); z.string().guid().parse(project)
  const database = await openJournal()
  try {
    const all = await database.getAll('requests')
    return await Promise.all(all.filter(item => item?.actorId === actor && item.request?.projectId === project).map(item => checked(item, actor, project)))
  } finally { database.close() }
}
export async function exportBookRequestRecords(actor: string, project: string): Promise<unknown[]> {
  z.string().guid().parse(actor); z.string().guid().parse(project)
  const database = await openJournal()
  try { return (await database.getAll('requests')).filter(value => value?.actorId === actor && value.request?.projectId === project) }
  finally { database.close() }
}
/** Record only this immutable operation's result; other requests are never cleared or replaced. */
export async function sendRetainedBookRequest(actor: string, project: string, requestId: string, explicitRetry = true, beforeDispatch?: () => void): Promise<FieldbookSaveResult> {
  const retained = await read(actor, project, requestId)
  const retry = await retryState(actor, project, requestId)
  enforceRetry(retry.actor, explicitRetry, 'actor'); enforceRetry(retry.request, explicitRetry, 'request')
  beforeDispatch?.()
  let result: FieldbookSaveResult
  try { result = await deliverBookRequest(actor, retained.request) }
  catch (error) { await rememberFailure(actor, project, requestId, error); throw error }
  // Complete hashing/network work before the IDB acknowledgement transaction.
  const original = canonicalDeliveryJson(retained.request)
  const database = await openJournal(), tx = database.transaction(['requests', 'retries'], 'readwrite', { durability: 'strict' })
  try {
    const requests = tx.objectStore('requests'), retries = tx.objectStore('retries'), keys = retryKeys(actor, requestId)
    const current = envelope(await requests.get(retained.key), actor, project, requestId)
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
    await requests.put({ ...retained, result: JSON.parse(canonicalDeliveryJson(storedResult as unknown as Json)) as FieldbookSaveResult })
    await retries.delete(keys.request)
    const latest = checkedRetry(await retries.get(keys.actor), actor, null, null)
    // An older success must not clear a throttle recorded after it was dispatched.
    if (retry.actor && latest?.stamp === retry.actor.stamp) await retries.delete(keys.actor)
    await tx.done
    return storedResult
  } catch (error) {
    try { tx.abort() } catch { /* Keep a closed transaction unchanged. */ }
    await tx.done.catch(() => {})
    throw error
  } finally { database.close() }
}
