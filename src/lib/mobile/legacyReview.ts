import type { SyncQueueItem, FieldObservation } from './offlineStorage'
import { acknowledgeFieldObservation, observationDeliveryHash } from '@/lib/field/observationReceipt'
import { mobileObservationCapture } from './observationCapture'

export const LEGACY_REVIEW_VERSION = 'unknown-author-v1' as const
export interface LegacyRecoveryReview {
  version: typeof LEGACY_REVIEW_VERSION
  actorId: string
  projectId: string
  sourceHash: string
  reviewedAt: string
  capturedBy: null
}

export function legacyPayload(item: SyncQueueItem): Record<string, unknown> | null {
  if (!item.data || typeof item.data !== 'object' || Array.isArray(item.data)) return null
  return item.data as Record<string, unknown>
}

/** A known capture/queue owner is never replaced by a recovery reviewer. */
export function isUnattributedItem(item: SyncQueueItem, projectId: string): boolean {
  const data = legacyPayload(item)
  return !!data && data.projectId === projectId && data.ownerId == null && item.ownerId == null
}

export function isLegacyReviewQueuedFor(item: SyncQueueItem, actorId: string): boolean {
  const review = item.recoveryReview
  return !!review && item.type === 'field_observation' && ['create', 'update'].includes(item.action)
    && review.version === LEGACY_REVIEW_VERSION && review.actorId === actorId && review.capturedBy === null
    && /^[a-f0-9]{64}$/.test(review.sourceHash) && Number.isFinite(Date.parse(review.reviewedAt))
    && isUnattributedItem(item, review.projectId)
}

export function canReviewLegacyItem(item: SyncQueueItem, projectId: string): boolean {
  const data = legacyPayload(item)
  return isUnattributedItem(item, projectId) && item.type === 'field_observation' && ['create', 'update'].includes(item.action)
    && !!data && data.ownerId === undefined && typeof data.id === 'string' && data.id === item.recordId
    && typeof data.pointName === 'string' && data.pointName.trim().length > 0 && typeof data.timestamp === 'number'
    && Number.isFinite(new Date(data.timestamp).getTime())
}

export async function legacySourceHash(item: SyncQueueItem): Promise<string> {
  const data = legacyPayload(item)
  if (!data) throw new Error('This device record has no readable source payload.')
  return observationDeliveryHash(item.type === 'field_observation' && typeof data.timestamp === 'number' && Number.isFinite(new Date(data.timestamp).getTime())
    ? mobileObservationCapture(data as unknown as FieldObservation & { id: string; timestamp: number })
    : data)
}

/** The reviewer may reopen a delivered legacy source; its author stays unknown. */
export async function isMobileRecordVisibleTo(row: FieldObservation, actorId: string): Promise<boolean> {
  if (row.ownerId != null) return row.ownerId === actorId
  const review = row.deliveryReceipt?.legacyRecoveryReview
  if (!review || review.reviewedBy !== actorId || typeof row.id !== 'string' || typeof row.timestamp !== 'number') return false
  try {
    const hash = await observationDeliveryHash(mobileObservationCapture(row as FieldObservation & { id: string; timestamp: number }))
    const receipt = acknowledgeFieldObservation(row.deliveryReceipt, row.id, hash)
    return receipt.legacyRecoveryReview?.sourceHash === hash
  } catch { return false }
}
