/**
 * Sync Service for Mobile Field Data
 * Handles upload when connectivity returns
 */

import { offlineStorage, isSyncItemOwnedBy, MOBILE_SYNC_BATCH_SIZE, SyncQueueItem, type FieldObservation, type PhotoData } from './offlineStorage'
import type { BrowserClient,QueryResult } from '@/lib/api-client/client'
import { createClient } from '@/lib/api-client/client'
import { uploadFieldPhoto } from './photoUpload'
import { acknowledgeFieldObservation,observationDeliveryHash,hasStoredFieldAcknowledgement } from '@/lib/field/observationReceipt'
import { fieldDeliveryFailure } from '@/lib/field/deliveryRetry'
import { SyncDeliveryError, syncDeliveryError } from './syncDeliveryError'
import { isLegacyReviewQueuedFor, legacySourceHash, type LegacyRecoveryReview } from './legacyReview'
import { mobileObservationCapture } from './observationCapture'

// The sync queue stores the same records offlineStorage persists, with the
// generated id and a server-side timestamp guaranteed by addToSyncQueue.
type ObservationPayload = FieldObservation & { id: string; timestamp: number }
type PhotoPayload = PhotoData & { id: string; timestamp: number }

interface SurveyPointPayload {
  id: string
  ownerId: string
  projectId: string
  name: string
  easting: number
  northing: number
  elevation?: number
  isControl?: boolean
  description?: string
  timestamp: number
}

class SyncService {
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  private syncInterval: NodeJS.Timeout | null = null
  private isSyncing = false
  private lastMessage: string | null = null
  private retryAt: number | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline())
      window.addEventListener('offline', () => this.handleOffline())
    }
  }

  startAutoSync(intervalMs = 30000) {
    if (this.syncInterval) return

    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        void this.syncPending().catch(() => { this.lastMessage = 'Could not read the device queue. Your saved records were retained.' })
      }
    }, intervalMs)
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }

  private handleOnline() {
    this.isOnline = true
    void this.syncPending().catch(() => { this.lastMessage = 'Could not read the device queue. Your saved records were retained.' })
  }

  private handleOffline() {
    this.isOnline = false
  }

  async syncPending(options: { retryFailed?: boolean } = {}): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) return { synced: 0, failed: 0 }
    if (!this.isOnline) return { synced: 0, failed: 0 }

    this.isSyncing = true
    let synced = 0
    let failed = 0
    try {
      this.lastMessage = null
      this.retryAt = null
      const session = await createClient().auth.getSession()
      const ownerId = session.data.session?.user?.id
      if (session.error || !ownerId) {
        this.lastMessage = 'Sign in as the capture owner before delivering device readings. Unattributed records remain on this device for review.'
        return { synced, failed }
      }
      const pauseUntil = await offlineStorage.getSyncPauseUntil()
      if (pauseUntil > Date.now()) {
        this.retryAt = pauseUntil
        this.lastMessage = 'Delivery is paused until the retry time. Your device records are retained.'
        return { synced, failed }
      }
      if (options.retryFailed) await offlineStorage.retryFailedSyncItems(ownerId)
      // A browser/tab may have closed after claiming an item. Requeue only
      // claims older than the recovery lease so active slow uploads are not
      // stolen by another sync pass.
      await offlineStorage.recoverStaleSyncItems(ownerId)
      const items = await offlineStorage.getPendingSyncItems(ownerId)

      for (const item of items.slice(0, MOBILE_SYNC_BATCH_SIZE)) {
        if (!isSyncItemOwnedBy(item, ownerId) && !isLegacyReviewQueuedFor(item, ownerId)) continue
        const id = item.id
        if (!id) { failed++; continue }
        // The durable claim also observes a pause written by another tab.
        if (!await offlineStorage.claimSyncItem(id, ownerId)) continue
        try {
          await this.syncItem(item, ownerId)
          synced++
        } catch (error) {
          failed++
          const deliveryError = syncDeliveryError(error)
          const retry = fieldDeliveryFailure(item.deliveryRetry, deliveryError.status, deliveryError.retryAfter)
          await offlineStorage.updateSyncStatus(id, retry.blocked ? 'failed' : 'pending', deliveryError.message, retry.attempts, retry)
          this.lastMessage = retry.blocked
            ? 'A record needs review before retrying. Its original device copy is retained.'
            : 'Delivery was interrupted. Your records are retained and will retry after a delay.'
          if (!retry.blocked || deliveryError.status === 401) {
            await offlineStorage.pauseSyncUntil(retry.nextAttemptAt)
            this.retryAt = retry.nextAttemptAt
            break
          }
        }
      }

      return { synced, failed }
    } finally {
      this.isSyncing = false
    }
  }

  private async syncItem(item: SyncQueueItem, actorId: string): Promise<void> {
    if (!item.id) throw new Error('Sync item missing id')
    if(!['create','update'].includes(item.action))throw new SyncDeliveryError('This queued action needs a reviewed removal/recovery workflow. The device record was retained.', 422)
    if (item.recoveryReview && await legacySourceHash(item) !== item.recoveryReview.sourceHash) throw new SyncDeliveryError('This source changed after review. Retain and review it again before delivery.', 409)
    const dbClient = createClient({ expectedUserId: actorId })

    switch (item.type) {
      case 'field_observation':
        await this.syncObservation(item.data as ObservationPayload, item.recoveryReview, actorId)
        break
      case 'photo':
        await this.syncPhoto(dbClient, item.data as PhotoPayload)
        break
      case 'survey_point':
        await this.syncSurveyPoint(dbClient, item.data as SurveyPointPayload)
        break
      default:
        throw new SyncDeliveryError('Unsupported queued field record. The device copy was retained for recovery.', 422)
    }

    try {
      await offlineStorage.removeFromSyncQueue(item.id, item)
    } catch {
      throw new SyncDeliveryError('Delivery was acknowledged, but the pending queue source changed or its removal could not be committed. Retained records need review.', 409)
    }
  }

  private async syncObservation(payload: ObservationPayload, review?: LegacyRecoveryReview, actorId?: string): Promise<void> {
    const capture = mobileObservationCapture(payload)
    const inputHash=await observationDeliveryHash(capture)
    const body = review ? { capture, acknowledgement: review.version, sourceHash: review.sourceHash } : capture
    const response=await fetch(review?'/api/fieldbook/recovery':'/api/fieldbook/sync',{method:'POST',headers:{'Content-Type':'application/json',...(review&&actorId?{'X-Metardu-Expected-User':actorId}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)})
    const data:unknown=await response.json().catch(() => null)
    if(!response.ok)throw new SyncDeliveryError(data&&typeof data==='object'&&'error'in data?String(data.error):'Raw observation delivery failed. The device copy was retained.', response.status, response.headers?.get('Retry-After'))
    let receipt: ReturnType<typeof acknowledgeFieldObservation>
    try { receipt = acknowledgeFieldObservation(data,payload.id,inputHash) }
    catch { throw new SyncDeliveryError('The server receipt does not match this observation. Review is required; the device copy was retained.', 422) }
    if (review && (receipt.legacyRecoveryReview?.reviewedBy !== actorId || receipt.legacyRecoveryReview?.sourceHash !== inputHash)) {
      throw new SyncDeliveryError('The server did not confirm this legacy recovery review. The device source was retained.', 422)
    }

    // A different tab can edit/remove the local source while HTTP is pending.
    // Only the exact retained source may receive this acknowledgement.
    try {
      await offlineStorage.update('field_observations', payload.id, { synced: true, deliveryReceipt: receipt }, payload)
    } catch {
      throw new SyncDeliveryError('The server acknowledged delivery, but its receipt could not be committed to the exact device source. The pending queue was retained for review.', 409)
    }
  }

  private async syncPhoto(dbClient: BrowserClient, payload: PhotoPayload): Promise<void> {
    // The client ID gives storage a stable, owner-scoped path, so retrying an
    // interrupted sync replaces the same upload instead of creating orphans.
    const storagePath = await uploadFieldPhoto(
      payload.id,
      payload.data,
      payload.projectId,
      payload.contentType,
      payload.fileName,
      fetch,
      payload.ownerId,
    )

    // The project/client unique key makes a retry safe after any interrupted
    // response. Keep the original local image until both writes succeed.
    const { data,error } = await dbClient.from('field_photos').upsert({
      client_id: payload.id,
      project_id: payload.projectId,
      observation_client_id: payload.observationClientId,
      point_id: payload.pointId,
      point_name: payload.pointName,
      storage_path: storagePath,
      filename: payload.fileName,
      mime_type: payload.contentType,
      caption: payload.caption,
      orientation: payload.orientation,
      captured_at: payload.capturedAt ?? null,
      metadata: payload.metadata ?? {},
      synced_at: new Date().toISOString(),
    }, { onConflict: 'project_id,client_id' }).select('id,client_id,project_id,storage_path').single() as QueryResult<unknown>

    if (error) {
      // Leave the stable uploaded path intact: a later retry will upsert its
      // metadata. Deleting here could destroy a previous successful upload.
      throw error
    }
    if(!hasStoredFieldAcknowledgement(data,{client_id:payload.id,project_id:payload.projectId,storage_path:storagePath}))throw new SyncDeliveryError('Photo metadata acknowledgement is missing or does not match. The original device photo was retained.', 422)

    await offlineStorage.update('photos', payload.id, { synced: true, storagePath })
  }

  private async syncSurveyPoint(dbClient: BrowserClient, payload: SurveyPointPayload): Promise<void> {
    const { data,error } = await dbClient.from('survey_points').upsert({
      id: payload.id,
      project_id: payload.projectId,
      point_name: payload.name,
      easting: payload.easting,
      northing: payload.northing,
      elevation: payload.elevation,
      is_control: payload.isControl,
      description: payload.description,
      observation_date: new Date(payload.timestamp).toISOString().slice(0, 10),
    }).select('id,project_id').single() as QueryResult<unknown>

    if (error) throw error
    if(!hasStoredFieldAcknowledgement(data,{id:payload.id,project_id:payload.projectId}))throw new SyncDeliveryError('The server did not acknowledge this exact survey point. The device copy was retained.', 422)
  }

  async forceSync(): Promise<{ synced: number; failed: number }> {
    return this.syncPending({ retryFailed: true })
  }

  getSyncStatus(): { isOnline: boolean; isSyncing: boolean; message: string | null; retryAt: number | null } {
    return { isOnline: this.isOnline, isSyncing: this.isSyncing, message: this.lastMessage, retryAt: this.retryAt }
  }
}

export const syncService = new SyncService()
export default syncService
