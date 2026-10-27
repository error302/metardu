import { z } from 'zod'
import { captureBookRequestSchema, sourceImportSchema, type BookCaptureSource, type CaptureBookRequest } from './captureDraft'
import { fieldbookTransferSchema } from './transfer'
import { observationDeliveryHash } from '@/lib/field/observationReceipt'
export interface CaptureInventoryItem { batchId: string; clientId: string; station: string | null; mode: string | null; capturedBy: string | null; recordedAt: string | null }
export interface CapturedBook { id: string; user_id: string; project_id: string; name: string; type: 'leveling' | 'traverse' | 'control'; data: Record<string, unknown> }
export class CaptureRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = 'CaptureRequestError' }
}
const inventory = z.object({ items: z.array(z.object({ batchId: z.string().guid(), clientId: z.string(), station: z.string().nullable(), mode: z.string().nullable(),
  capturedBy: z.string().guid().nullable(), recordedAt: z.string().datetime({ offset: true }).nullable() })).max(50), next: z.string().nullable() })
const sourceSchema = sourceImportSchema.shape.sources.element.omit({ rowId: true, initialRow: true })
async function requestCaptureApi(actor: string, path: string, body?: CaptureBookRequest): Promise<unknown> {
  let response: Response
  try { response = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: {
    'X-Metardu-Expected-User': actor, ...(body ? { 'Content-Type': 'application/json' } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) }) }
  catch { throw new Error('The capture request could not be confirmed. Check your connection and account, then retry. Your current book and original sources were retained.') }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const problem = data && typeof data === 'object' && 'error' in data ? data.error : null
    const message = typeof problem === 'string' ? problem : problem && typeof problem === 'object' && 'message' in problem ? String(problem.message) : 'The source request was refused. Retained sources and your current book were preserved.'
    const code = data && typeof data === 'object' && 'code' in data && typeof data.code === 'string' ? data.code : undefined
    throw new CaptureRequestError(message, response.status, code)
  }
  return data
}
export async function listCaptureSources(actor: string, project: string, cursor?: string): Promise<{items:CaptureInventoryItem[];next:string|null}> {
  return inventory.parse(await requestCaptureApi(actor, `/api/fieldbook/captures?projectId=${encodeURIComponent(project)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`))
}
export async function inspectCaptureSource(actor: string, project: string, batch: string): Promise<BookCaptureSource> {
  const result = z.object({ source: sourceSchema }).parse(await requestCaptureApi(actor, `/api/fieldbook/captures?projectId=${encodeURIComponent(project)}&batchId=${encodeURIComponent(batch)}`)).source
  if (result.projectId !== project || result.batchId !== batch || result.raw.projectId !== project || result.raw.id !== result.clientId
    || await observationDeliveryHash(result.raw) !== result.inputHash) throw new Error('The returned source does not match this project and capture. No book was changed.')
  return result
}
export async function createCaptureBook(actor: string, value: CaptureBookRequest): Promise<CapturedBook> {
  const input = captureBookRequestSchema.parse(value)
  const requestHash = await observationDeliveryHash(input)
  const data = z.object({ book: z.object({ id: z.string().guid(), user_id: z.string().guid(), project_id: z.string().guid(), type: z.enum(['leveling', 'traverse', 'control']), name: z.string(), data: z.record(z.string(), z.unknown()) }), replayed: z.boolean() }).parse(await requestCaptureApi(actor, '/api/fieldbook/captures', input))
  const book = data.book, proof = sourceImportSchema.parse(book.data.sourceImport)
  if (book.id !== input.bookId || book.user_id !== actor || book.project_id !== input.projectId || book.type !== input.type || proof.reviewedBy !== actor || proof.requestHash !== requestHash
    || JSON.stringify(proof.sources.map(source => ({ batchId: source.batchId, inputHash: source.inputHash }))) !== JSON.stringify(input.sources)) {
    throw new Error('The server did not acknowledge this exact source-linked draft. Retry the same creation request; your current book was retained.')
  }
  const transfer = fieldbookTransferSchema.parse({ name: book.name, type: book.type, projectId: book.project_id, data: book.data })
  return { ...book, data: transfer.data }
}
