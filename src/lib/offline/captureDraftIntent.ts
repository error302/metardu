import { openDB, type DBSchema } from 'idb'
import { z } from 'zod'
import { captureBookRequestSchema, type CaptureBookRequest } from '@/lib/fieldbook/captureDraft'
import { observationDeliveryHash } from '@/lib/field/observationReceipt'
import { canonicalJson } from '@/lib/provenance/canonicalJson'

const envelopeSchema = z.object({ version: z.literal(1), key: z.string(), actorId: z.string().guid(), projectId: z.string().guid(),
  request: captureBookRequestSchema, requestHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
type Envelope = z.infer<typeof envelopeSchema>
interface IntentDB extends DBSchema { requests: { key: string; value: Envelope } }
// Separate from raw observations and the general sync queue: this store must
// never dispatch a mutation automatically, or upgrade/overwrite existing stores.
const openIntents = () => openDB<IntentDB>('metardu-capture-book-intents', 1, {
  upgrade(database) { if (!database.objectStoreNames.contains('requests')) database.createObjectStore('requests', { keyPath: 'key' }) },
})
function scope(actor: string, project: string) {
  return `${z.string().guid().parse(actor)}:${z.string().guid().parse(project)}`
}
function retained(value: unknown, actor: string, project: string): Envelope | null {
  if (value === undefined) return null
  const parsed = envelopeSchema.safeParse(value)
  if (!parsed.success || parsed.data.key !== scope(actor, project) || parsed.data.actorId !== actor
    || parsed.data.projectId !== project || parsed.data.request.projectId !== project) {
    throw new Error('The retained draft creation request is unreadable. It was kept for recovery; no new request was sent.')
  }
  return parsed.data
}
async function checked(envelope: Envelope | null) {
  if (envelope && await observationDeliveryHash(envelope.request) !== envelope.requestHash) throw new Error('The retained creation request no longer matches its checksum. It was kept for recovery; no new request was sent.')
  return envelope?.request ?? null
}
export async function getPendingCaptureDraft(actor: string, project: string): Promise<CaptureBookRequest | null> {
  const key = scope(actor, project), database = await openIntents()
  try { return await checked(retained(await database.get('requests', key), actor, project)) }
  finally { database.close() }
}
/** A single read/write transaction chooses one key across concurrent tabs. */
export async function reserveCaptureDraft(actor: string, value: CaptureBookRequest): Promise<CaptureBookRequest> {
  const request = captureBookRequestSchema.parse(value), key = scope(actor, request.projectId)
  const candidate: Envelope = { version: 1, key, actorId: actor, projectId: request.projectId, request,
    requestHash: await observationDeliveryHash(request) }
  const database = await openIntents(), tx = database.transaction('requests', 'readwrite', { durability: 'strict' })
  let result: Envelope
  try {
    const previous = retained(await tx.store.get(key), actor, request.projectId)
    result = previous ?? candidate
    if (!previous) await tx.store.put(candidate)
    await tx.done
  } catch {
    try { tx.abort() } catch { /* An aborted transaction may already be closed. */ }
    await tx.done.catch(() => {})
    throw new Error('The draft creation key could not be retained safely. Check device storage and retry. Retained requests and original readings were kept; no new request was sent.')
  } finally { database.close() }
  const confirmed = await checked(result)
  if (!confirmed) throw new Error('The retained creation key could not be confirmed.')
  return confirmed
}
/** Compare the entire reviewed request before removing its recovery intent. */
export async function completeCaptureDraft(actor: string, value: CaptureBookRequest): Promise<boolean> {
  const request = captureBookRequestSchema.parse(value), key = scope(actor, request.projectId)
  const hash = await observationDeliveryHash(request), database = await openIntents()
  const tx = database.transaction('requests', 'readwrite', { durability: 'strict' })
  try {
    const current = retained(await tx.store.get(key), actor, request.projectId)
    const matches = !current || current.requestHash === hash && canonicalJson(current.request) === canonicalJson(request)
    if (current && matches) await tx.store.delete(key)
    await tx.done
    return matches
  } catch {
    try { tx.abort() } catch { /* Preserve an already closed transaction. */ }
    await tx.done.catch(() => {})
    throw new Error('The server result was received, but its recovery key could not be cleared. Retry the same request to recover its acknowledgement.')
  } finally { database.close() }
}
