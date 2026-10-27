import { z } from 'zod'
import { bookRevisionSchema, canonicalDeliveryJson, fieldbookEditablePayload, fieldbookSaveReceiptSchema, fieldbookSaveRequestSchema, fieldbookSnapshotSchema,
  type FieldbookSaveRequest, type FieldbookSaveResult, type FieldbookSnapshot, type Json } from './delivery'

export class BookDeliveryError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string, readonly retryAfter?: string | null) { super(message); this.name = 'BookDeliveryError' }
}
export class BookDeliveryDeferredError extends BookDeliveryError {
  constructor(readonly scope: 'request' | 'actor', readonly nextAttemptAt: number, blocked: boolean) {
    super(blocked ? 'This retained delivery needs explicit review and retry in recovery. The device snapshot was kept.'
      : `Delivery is paused. Retry after ${new Date(nextAttemptAt).toLocaleString()}. The exact device request was kept.`, undefined, 'FIELDBOOK_DELIVERY_DEFERRED')
  }
}
const resultSchema = z.object({ receipt: fieldbookSaveReceiptSchema, book: fieldbookSnapshotSchema,
  currentRevision: bookRevisionSchema, replayed: z.boolean() }).strict()
const invalid = () => new BookDeliveryError('The server did not acknowledge this exact book request. Keep the device copy and retry the retained request.')
/** Hash every protocol field; unlike raw-observation hashes, no keys are excluded. */
export async function bookDeliveryHash(value: Json): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalDeliveryJson(value)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
/** Validation must finish before any local operation can be acknowledged. */
export async function acknowledgeBookDelivery(actor: string, value: FieldbookSaveRequest, response: unknown): Promise<FieldbookSaveResult> {
  z.string().guid().parse(actor)
  const input = JSON.parse(JSON.stringify(fieldbookSaveRequestSchema.parse(value))) as FieldbookSaveRequest
  const parsed = resultSchema.safeParse(response)
  if (!parsed.success) throw invalid()
  const result = JSON.parse(JSON.stringify(parsed.data)) as z.infer<typeof resultSchema>, { receipt, book } = result
  const intendedHash = await bookDeliveryHash(fieldbookEditablePayload(actor, input))
  const actualHash = await bookDeliveryHash({ id: book.id, user_id: book.user_id, project_id: book.project_id, name: book.name, type: book.type, data: book.data })
  if (receipt.actorId !== actor || receipt.requestId !== input.requestId || receipt.projectId !== input.projectId || receipt.bookId !== input.bookId
    || receipt.inputHash !== await bookDeliveryHash(input) || receipt.payloadHash !== intendedHash || actualHash !== intendedHash
    || receipt.baseRevision !== input.baseRevision || receipt.savedRevision !== book.revision
    || BigInt(book.revision) <= BigInt(input.baseRevision ?? '0') || BigInt(result.currentRevision) < BigInt(book.revision)
    || !result.replayed && result.currentRevision !== book.revision) throw invalid()
  return result
}
async function requestApi(actor: string, path: string, body?: FieldbookSaveRequest): Promise<unknown> {
  z.string().guid().parse(actor)
  let response: Response
  try {
    response = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: {
      'X-Metardu-Expected-User': actor, ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) })
  } catch { throw new BookDeliveryError('The delivery response could not be confirmed. Keep the device copy and retry the same retained request.') }
  const value: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const problem = value && typeof value === 'object' && 'error' in value ? value.error : null
    const message = typeof problem === 'string' ? problem : problem && typeof problem === 'object' && 'message' in problem ? String(problem.message) : 'Book delivery was refused. Your device copy is retained.'
    const code = value && typeof value === 'object' && 'code' in value && typeof value.code === 'string' ? value.code : undefined
    throw new BookDeliveryError(message, response.status, code, response.headers.get('Retry-After'))
  }
  return value
}
export async function deliverBookRequest(actor: string, value: FieldbookSaveRequest): Promise<FieldbookSaveResult> {
  // Snapshot synchronously, before fetch or hashing yields to an editor change.
  const request = JSON.parse(JSON.stringify(fieldbookSaveRequestSchema.parse(value))) as FieldbookSaveRequest
  return acknowledgeBookDelivery(actor, request, await requestApi(actor, '/api/fieldbook/delivery', request))
}
export async function readReviewedBook(actor: string, project: string, id: string): Promise<FieldbookSnapshot> {
  z.string().guid().parse(project); z.string().guid().parse(id)
  const result = z.object({ book: fieldbookSnapshotSchema }).strict().parse(await requestApi(actor,
    `/api/fieldbook/delivery?projectId=${encodeURIComponent(project)}&bookId=${encodeURIComponent(id)}`)).book
  if (result.user_id !== actor || result.project_id !== project || result.id !== id) throw invalid()
  return result
}
