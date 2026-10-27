import { z } from 'zod'
import { getDB, type SyncOperation } from './offlineDatabase'
import { readBookEdit } from './bookEdits'
import { findBookRequest } from './bookDeliveryJournal'
import { bookDeliveryHash } from '@/lib/fieldbook/deliveryClient'
import { bookRevisionSchema, canonicalDeliveryJson, fieldbookSaveRequestSchema } from '@/lib/fieldbook/delivery'
const linkSchema = z.object({ version: z.literal('legacy-book-delivery-v1'), queueId: z.number().int().positive(), projectId: z.string().guid(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.string().guid(), savedBookId: z.string().guid(), savedRevision: bookRevisionSchema,
  reviewedBy: z.string().guid(), reviewedAt: z.string().datetime({ offset: true }), inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/), fieldVerified: z.literal(false) }).strict()
export type LegacyBookDelivery = z.infer<typeof linkSchema>
function source(operation: SyncOperation) {
  const { fieldbookRecovery: _link, ...raw } = operation
  return fieldbookSaveRequestSchema.shape.data.parse(raw)
}
export async function legacyBookSourceHash(operation: SyncOperation): Promise<string> { return bookDeliveryHash(source(operation)) }
function owned(operation: SyncOperation, actor: string, project: string) {
  z.string().guid().parse(actor); z.string().guid().parse(project)
  if (operation.table !== 'fieldbooks' || !['UPSERT', 'INSERT', 'UPDATE'].includes(operation.type) || operation.projectId !== project
    || operation.data.user_id !== actor || operation.data.project_id !== project || !operation.id) throw new Error('This retained source cannot be reconciled under this account and project.')
  z.string().guid().parse(operation.data.id)
}
/** Only the exact legacy editable payload may be linked, including raw precision. */
export function legacyBookContent(operation: SyncOperation): string {
  return canonicalDeliveryJson(fieldbookSaveRequestSchema.shape.data.parse({ type: operation.data.type, name: operation.data.name, data: operation.data.data }))
}
async function acknowledged(actor: string, project: string, operation: SyncOperation, requestId: string) {
  owned(operation, actor, project)
  const edit = await readBookEdit(actor, project, requestId), retained = await findBookRequest(actor, project, requestId)
  if (!retained?.result || legacyBookContent(operation) !== canonicalDeliveryJson({ type: edit.type, name: edit.name, data: edit.data })
    || retained.request.bookId !== edit.bookId || retained.request.type !== edit.type || retained.request.name !== edit.name
    || canonicalDeliveryJson(retained.request.data) !== canonicalDeliveryJson(edit.data)) {
    throw new Error('An exact acknowledged delivery is required for this legacy snapshot. Both copies remain retained.')
  }
  return retained.result.receipt
}
export async function confirmLegacyBookDelivery(actor: string, project: string, id: number, requestId: string, reviewedSourceHash: string): Promise<void> {
  const database = await getDB(), operation = await database.get('sync_queue', id)
  if (!operation) throw new Error('The legacy source is no longer present. No confirmation was attached.')
  z.string().regex(/^[a-f0-9]{64}$/).parse(reviewedSourceHash)
  if (await legacyBookSourceHash(operation) !== reviewedSourceHash) throw new Error('The legacy source differs from the snapshot reviewed. Refresh recovery and inspect the retained copy again.')
  const receipt = await acknowledged(actor, project, operation, requestId)
  const original = canonicalDeliveryJson(source(operation))
  const link = linkSchema.parse({ version: 'legacy-book-delivery-v1', queueId: id, projectId: project, sourceHash: reviewedSourceHash,
    reviewedBy: actor, reviewedAt: new Date().toISOString(), requestId, savedBookId: receipt.bookId, savedRevision: receipt.savedRevision,
    inputHash: receipt.inputHash, payloadHash: receipt.payloadHash, fieldVerified: false })
  const tx = database.transaction('sync_queue', 'readwrite', { durability: 'strict' })
  try {
    const current = await tx.store.get(id)
    if (!current || canonicalDeliveryJson(source(current)) !== original) throw new Error('The retained source changed during review. No acknowledgement was attached.')
    if (current.fieldbookRecovery !== undefined) {
      const previous = linkSchema.parse(current.fieldbookRecovery)
      if (previous.sourceHash !== link.sourceHash || previous.requestId !== link.requestId || previous.inputHash !== link.inputHash || previous.payloadHash !== link.payloadHash) {
        throw new Error('This source already has a different recovery link. Keep both records for inspection.')
      }
    } else await tx.store.put({ ...current, fieldbookRecovery: link })
    await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* Preserve an already closed transaction. */ }
    await tx.done.catch(() => {}); throw error
  }
}
export async function verifiedLegacyBookDelivery(actor: string, project: string, operation: SyncOperation): Promise<LegacyBookDelivery | null> {
  try {
    owned(operation, actor, project)
    const link = linkSchema.parse(operation.fieldbookRecovery)
    if (link.queueId !== operation.id || link.projectId !== project || link.reviewedBy !== actor || link.sourceHash !== await bookDeliveryHash(source(operation))) return null
    const receipt = await acknowledged(actor, project, operation, link.requestId)
    return link.inputHash === receipt.inputHash && link.payloadHash === receipt.payloadHash && link.savedBookId === receipt.bookId && link.savedRevision === receipt.savedRevision ? link : null
  } catch { return null }
}
