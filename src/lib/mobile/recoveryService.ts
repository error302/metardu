import { offlineStorage, type LegacyQueueSummary, type SyncQueueItem, type FieldObservation } from './offlineStorage'
import { canReviewLegacyItem, isMobileRecordVisibleTo, isUnattributedItem, legacySourceHash } from './legacyReview'
import { syncService } from './syncService'
export interface LegacySelection { item: SyncQueueItem; sourceHash: string }

async function authorize(actorId: string, projectId: string): Promise<void> {
  const response = await fetch(`/api/fieldbook/recovery?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store',
    headers: { 'X-Metardu-Expected-User': actorId }, signal: AbortSignal.timeout(15_000) })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !body || typeof body !== 'object' || !('actorId' in body) || body.actorId !== actorId
    || !('projectId' in body) || body.projectId !== projectId || !('canReview' in body) || body.canReview !== true) {
    throw new Error('Connect and sign in with current field-recording access to this project before reviewing older device work.')
  }
}
export async function listLegacyWork(actor: string, project: string, after?: string): Promise<{items:LegacyQueueSummary[];next:string|null}> {
  await authorize(actor, project)
  return offlineStorage.getLegacyQueuePage(project, actor, after)
}
export async function selectLegacyWork(actor: string, project: string, id: string): Promise<LegacySelection> {
  await authorize(actor, project)
  const item = await offlineStorage.get<SyncQueueItem>('sync_queue', id)
  if (!item || item.id !== id || !isUnattributedItem(item, project)) throw new Error('This retained source changed, is attributed or belongs to another project.')
  return { item, sourceHash: await legacySourceHash(item) }
}
export async function reviewLegacyWork(actor: string, project: string, selection: LegacySelection): Promise<{message:string}> {
  const current = await selectLegacyWork(actor, project, selection.item.id ?? '')
  if (!canReviewLegacyItem(current.item, project) || current.sourceHash !== selection.sourceHash) throw new Error('The selected source changed or requires manual review. No delivery review was queued.')
  await offlineStorage.queueLegacyReview(current.item.id ?? '', actor, project, current.sourceHash)
  await syncService.syncPending()
  const source = await offlineStorage.get<FieldObservation>('field_observations', current.item.recordId)
  if (source && await isMobileRecordVisibleTo(source, actor) && source.deliveryReceipt?.legacyRecoveryReview?.sourceHash === current.sourceHash) {
    return { message: 'Raw delivery confirmed. Capture author remains unknown; the original device record was retained.' }
  }
  return { message: syncService.getSyncStatus().message ?? 'Review queued. The device source is retained; raw delivery is still pending.' }
}

export async function exportLegacySnapshot(actor: string, project: string, selection: LegacySelection, originalPhoto = false): Promise<{ blob: Blob; name: string }> {
  await authorize(actor, project)
  if (!isUnattributedItem(selection.item, project) || await legacySourceHash(selection.item) !== selection.sourceHash) throw new Error('The selected source snapshot no longer matches its review hash.')
  const safeId = selection.item.recordId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100)
  const data = selection.item.data as Record<string, unknown>
  if (originalPhoto) {
    if (selection.item.type !== 'photo' || typeof data.data !== 'string') throw new Error('This source has no original photo bytes.')
    const comma = data.data.indexOf(',')
    const encoded = comma >= 0 ? data.data.slice(comma + 1) : data.data
    const binary = atob(encoded)
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const declaredType = comma >= 0 ? /^data:([^;]+);base64,/i.exec(data.data)?.[1]?.toLowerCase() : data.contentType
    const extension: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif' }
    const type = typeof declaredType === 'string' && extension[declaredType] ? declaredType : 'application/octet-stream'
    return { blob: new Blob([bytes], { type }), name: `metardu-legacy-${safeId}.${extension[type] ?? 'bin'}` }
  }
  return { blob: new Blob([JSON.stringify({ schemaVersion: 1, kind: 'legacy-device-source-backup',
    capturedBy: null, fieldVerified: false, deliverySourceHash: selection.sourceHash,
    queue: { id: selection.item.id, recordId: selection.item.recordId, type: selection.item.type, action: selection.item.action },
    original: selection.item.data,
  }, null, 2)], { type: 'application/json' }), name: `metardu-legacy-${safeId}.json` }
}
