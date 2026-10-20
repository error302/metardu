/**
 * Offline Storage Service for Mobile Field Data Collection
 * Uses IndexedDB for persistent storage with sync capability
 */

import { mayRetryFieldDelivery, type FieldDeliveryRetry } from '@/lib/field/deliveryRetry'
import { canReviewLegacyItem, isLegacyReviewQueuedFor, isMobileRecordVisibleTo, isUnattributedItem, legacySourceHash, LEGACY_REVIEW_VERSION, type LegacyRecoveryReview } from './legacyReview'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
import { offlineObservationSource, type FieldObservationDeliveryReceipt } from '@/lib/field/observationReceipt'
import { mobileObservationCapture } from './observationCapture'

type ObservationSource = FieldObservation & { id: string; timestamp: number }
function observationSnapshot(source: ObservationSource): string {
  return canonicalJson(offlineObservationSource(mobileObservationCapture(source)))
}

const DB_NAME = 'MetarduFieldDB'
const DB_VERSION = 1
const SYNC_STATE_DB_NAME = 'MetarduFieldDeliveryState'
const SYNC_STATE_STORE = 'state'
export const SYNC_RECOVERY_LEASE_MS = 15 * 60 * 1000
export const MOBILE_SYNC_BATCH_SIZE = 20

// Store names
const STORES = {
  FIELD_OBSERVATIONS: 'field_observations',
  SURVEY_POINTS: 'survey_points',
  PHOTOS: 'photos',
  PROJECTS: 'projects_offline',
  SYNC_QUEUE: 'sync_queue',
} as const

interface DBConfig {
  name: string
  keyPath: string
  indexes?: { name: string; keyPath: string; unique?: boolean }[]
}

const STORE_CONFIGS: Record<string, DBConfig> = {
  [STORES.FIELD_OBSERVATIONS]: {
    name: STORES.FIELD_OBSERVATIONS,
    keyPath: 'id',
    indexes: [
      { name: 'project_id', keyPath: 'projectId' },
      { name: 'timestamp', keyPath: 'timestamp' },
      { name: 'synced', keyPath: 'synced' },
    ],
  },
  [STORES.SURVEY_POINTS]: {
    name: STORES.SURVEY_POINTS,
    keyPath: 'id',
    indexes: [
      { name: 'project_id', keyPath: 'projectId' },
      { name: 'point_name', keyPath: 'name' },
    ],
  },
  [STORES.PHOTOS]: {
    name: STORES.PHOTOS,
    keyPath: 'id',
    indexes: [
      { name: 'project_id', keyPath: 'projectId' },
      { name: 'point_id', keyPath: 'pointId' },
    ],
  },
  [STORES.PROJECTS]: {
    name: STORES.PROJECTS,
    keyPath: 'id',
  },
  [STORES.SYNC_QUEUE]: {
    name: STORES.SYNC_QUEUE,
    keyPath: 'id',
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp' },
      { name: 'status', keyPath: 'status' },
    ],
  },
}

class OfflineStorage {
  private db: IDBDatabase | null = null
  private syncStateDb: IDBDatabase | null = null

  private requireDb(): IDBDatabase {
    if (!this.db) throw new Error('OfflineStorage not initialized - call init() first')
    return this.db
  }

  /** Keep transport timing separate so older app images can still open the
   * unchanged version-1 field database after a production rollback. */
  private async getSyncStateDb(): Promise<IDBDatabase> {
    if (this.syncStateDb) return this.syncStateDb
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(SYNC_STATE_DB_NAME, 1)
      request.onupgradeneeded = () => { request.result.createObjectStore(SYNC_STATE_STORE, { keyPath: 'id' }) }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Close other METARDU field tabs, then retry delivery. Saved field records were retained.'))
      request.onsuccess = () => {
        this.syncStateDb = request.result
        request.result.onversionchange = () => {
          request.result.close()
          if (this.syncStateDb === request.result) this.syncStateDb = null
        }
        resolve(request.result)
      }
    })
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Close other METARDU field tabs, then retry. Their saved device records will be retained.'))
      request.onsuccess = () => {
        this.db = request.result
        this.db.onversionchange = () => {
          request.result.close()
          if (this.db === request.result) this.db = null
        }
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create stores
        Object.values(STORE_CONFIGS).forEach((config) => {
          if (!db.objectStoreNames.contains(config.name)) {
            const store = db.createObjectStore(config.name, { keyPath: config.keyPath })

            // Create indexes
            config.indexes?.forEach((index) => {
              store.createIndex(index.name, index.keyPath, { unique: index.unique })
            })
          }
        })
      }
    })
  }

  // Generic CRUD operations
  async add<T>(storeName: string, data: T): Promise<string> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)

      // Generate ID if not present
      const record = { ...(data as Record<string, unknown>), id: (data as { id?: string }).id || this.generateId() }

      const request = store.add(record)

      request.onsuccess = () => resolve(record.id)
      request.onerror = () => reject(request.error)
    })
  }

  async get<T>(storeName: string, id: string): Promise<T | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.get(id)

      request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  }

  async getAll<T>(storeName: string, indexName?: string, query?: IDBValidKey): Promise<T[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)

      let request: IDBRequest
      if (indexName && query !== undefined) {
        const index = store.index(indexName)
        request = index.getAll(query)
      } else {
        request = store.getAll()
      }

      request.onsuccess = () => resolve((request.result as T[] | undefined) ?? [])
      request.onerror = () => reject(request.error)
    })
  }

  async update<T>(storeName: string, id: string, data: Partial<T>, expectedSource?: ObservationSource): Promise<void> {
    const expectedSnapshot = expectedSource ? observationSnapshot(expectedSource) : undefined
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)

      const request = store.get(id)

      request.onsuccess = () => {
        const existing = (request.result as unknown) as Record<string, unknown>
        if (!existing) {
          reject(new Error('Record not found'))
          return
        }

        if (expectedSnapshot !== undefined) {
          try {
            if (storeName !== STORES.FIELD_OBSERVATIONS || id !== expectedSource?.id
              || observationSnapshot(existing as unknown as ObservationSource) !== expectedSnapshot) {
              throw new Error('The device observation changed during delivery. Its source and pending queue were retained for review.')
            }
          } catch (error) {
            reject(error)
            return
          }
        }

        const updated = { ...existing, ...data }
        const putRequest = store.put(updated)
        putRequest.onerror = () => reject(putRequest.error)
      }

      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not commit the device record.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving the device record was aborted.'))
    })
  }

  async delete(storeName: string, id: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.delete(id)

      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not commit the queue removal.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Removing the queued record was aborted.'))
    })
  }

  // Field observation specific methods
  async saveFieldObservation(observation: FieldObservation): Promise<string> {
    return this.saveFieldObservationWithPhotos(observation, [])
  }

  /** Persist one observation and its captured photos in one IndexedDB transaction. */
  async saveFieldObservationWithPhotos(observation: FieldObservation, photos: PhotoData[]): Promise<string> {
    if (!this.db) await this.init()

    const now = Date.now()
    const id = observation.id || this.generateId()
    const record: FieldObservation & { id: string; timestamp: number; synced: boolean } = {
      ...observation,
      id,
      timestamp: observation.timestamp ?? now,
      synced: false,
    }
    const photoRecords = photos.map(photo => ({
      ...photo,
      ownerId: observation.ownerId,
      id: photo.id || this.generateId(),
      observationClientId: photo.observationClientId ?? id,
      timestamp: photo.timestamp ?? now,
      synced: false,
    }))
    if (photos.some(photo => photo.projectId !== observation.projectId || (photo.ownerId && photo.ownerId !== observation.ownerId))) {
      throw new Error('The observation and attached photos must belong to the same project and capture account.')
    }

    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction(
        [STORES.FIELD_OBSERVATIONS, STORES.PHOTOS, STORES.SYNC_QUEUE],
        'readwrite'
      )
      const observationStore = transaction.objectStore(STORES.FIELD_OBSERVATIONS)
      const photoStore = transaction.objectStore(STORES.PHOTOS)
      const queueStore = transaction.objectStore(STORES.SYNC_QUEUE)

      observationStore.add(record)
      queueStore.add({
        id: this.generateId(), type: 'field_observation', recordId: id,
        action: 'create', data: record, ownerId: record.ownerId, timestamp: now, status: 'pending', retryCount: 0,
      } satisfies SyncQueueItem)

      for (const photo of photoRecords) {
        photoStore.add(photo)
        queueStore.add({
          id: this.generateId(), type: 'photo', recordId: photo.id,
          action: 'create', data: photo, ownerId: photo.ownerId, timestamp: now, status: 'pending', retryCount: 0,
        } satisfies SyncQueueItem)
      }

      transaction.oncomplete = () => resolve(id)
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the field observation and photos.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Field observation save was cancelled.'))
    })
  }

  async getFieldObservations(projectId: string, ownerId?: string): Promise<FieldObservation[]> {
    if (!ownerId) return []
    const rows = await this.getAll<FieldObservation>(STORES.FIELD_OBSERVATIONS, 'project_id', projectId)
    const visible = await Promise.all(rows.map(row => isMobileRecordVisibleTo(row, ownerId)))
    return rows.filter((_row, index) => visible[index])
  }

  async getProjectPhotos(projectId: string, ownerId?: string): Promise<PhotoData[]> {
    if (!ownerId) return []
    const rows = await this.getAll<PhotoData>(STORES.PHOTOS, 'project_id', projectId)
    return rows.filter(row => row.ownerId === ownerId)
  }

  async getUnsyncedObservations(): Promise<FieldObservation[]> {
    return this.getAll(STORES.FIELD_OBSERVATIONS, 'synced', 0 as unknown as IDBValidKey)
  }

  // Photo storage
  async savePhoto(photoData: PhotoData): Promise<string> {
    const [id] = await this.savePhotos([photoData])
    return id
  }

  /** Persist a photo batch and all sync queue entries atomically. */
  async savePhotos(photoData: PhotoData[]): Promise<string[]> {
    if (!this.db) await this.init()
    if (photoData.length === 0) return []

    const now = Date.now()
    const records = photoData.map(photo => ({
      ...photo,
      id: photo.id || this.generateId(),
      timestamp: photo.timestamp ?? now,
      synced: false,
    }))

    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([STORES.PHOTOS, STORES.SYNC_QUEUE], 'readwrite')
      const photoStore = transaction.objectStore(STORES.PHOTOS)
      const queueStore = transaction.objectStore(STORES.SYNC_QUEUE)

      for (const photo of records) {
        photoStore.add(photo)
        queueStore.add({
          id: this.generateId(), type: 'photo', recordId: photo.id,
          action: 'create', data: photo, ownerId: photo.ownerId, timestamp: now, status: 'pending', retryCount: 0,
        } satisfies SyncQueueItem)
      }

      transaction.oncomplete = () => resolve(records.map(photo => photo.id))
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save captured photos.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Photo save was cancelled.'))
    })
  }

  // Sync queue management
  async addToSyncQueue(item: SyncQueueItem): Promise<void> {
    await this.add(STORES.SYNC_QUEUE, {
      ...item,
      id: this.generateId(),
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
    })
  }

  async getPendingSyncItems(ownerId?: string): Promise<SyncQueueItem[]> {
    if (!ownerId) return []
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([STORES.SYNC_QUEUE], 'readonly')
      const request = transaction.objectStore(STORES.SYNC_QUEUE).index('status').openCursor('pending')
      const items: SyncQueueItem[] = []
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        const item = cursor.value as SyncQueueItem
        if ((isSyncItemOwnedBy(item, ownerId) || isLegacyReviewQueuedFor(item, ownerId)) && mayRetryFieldDelivery(item.deliveryRetry, false)) items.push(item)
        // Do not materialize a job's entire queue of base64 photos in memory.
        if (items.length < MOBILE_SYNC_BATCH_SIZE) cursor.continue()
      }
      transaction.oncomplete = () => resolve(items)
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not read queued field records.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Reading queued field records was cancelled.'))
    })
  }

  async getSyncPauseUntil(): Promise<number> {
    const db = await this.getSyncStateDb()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SYNC_STATE_STORE], 'readonly')
      const request = transaction.objectStore(SYNC_STATE_STORE).get('delivery-pause')
      let until = 0
      request.onsuccess = () => {
        const state = request.result as { until?: number } | undefined
        if (typeof state?.until === 'number' && Number.isFinite(state.until)) until = state.until
      }
      transaction.oncomplete = () => resolve(until)
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not read the sync retry time.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Reading the sync retry time was cancelled.'))
    })
  }

  /** A later tab/failure must never shorten a previously requested server delay. */
  async pauseSyncUntil(until: number): Promise<void> {
    if (!Number.isFinite(until)) throw new Error('Invalid sync retry time.')
    const db = await this.getSyncStateDb()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SYNC_STATE_STORE], 'readwrite')
      const store = transaction.objectStore(SYNC_STATE_STORE)
      const request = store.get('delivery-pause')
      request.onsuccess = () => {
        const previous = request.result as { until?: number } | undefined
        const previousUntil = previous?.until
        store.put({ id: 'delivery-pause', until: Math.max(until, typeof previousUntil === 'number' && Number.isFinite(previousUntil) ? previousUntil : 0) })
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not retain the sync retry time.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving the sync retry time was cancelled.'))
    })
  }

  /** Check the shared pause, then claim a pending, due record atomically. */
  async claimSyncItem(id: string, ownerId?: string): Promise<boolean> {
    if (!ownerId) return false
    if (await this.getSyncPauseUntil() > Date.now()) return false
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([STORES.SYNC_QUEUE], 'readwrite')
      const store = transaction.objectStore(STORES.SYNC_QUEUE)
      let claimed = false
      const request = store.get(id)
      request.onsuccess = () => {
        const item = request.result as SyncQueueItem | undefined
        if (item?.status !== 'pending' || !(isSyncItemOwnedBy(item, ownerId) || isLegacyReviewQueuedFor(item, ownerId)) || !mayRetryFieldDelivery(item.deliveryRetry, false)) return
        store.put({ ...item, status: 'syncing', lastAttempt: Date.now() })
        claimed = true
      }
      transaction.oncomplete = () => resolve(claimed)
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not claim the queued field record.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Claiming the queued field record was cancelled.'))
    })
  }

  /** Requeue items whose previous sync process ended without completing. */
  async recoverStaleSyncItems(ownerId?: string, now = Date.now(), leaseMs = SYNC_RECOVERY_LEASE_MS): Promise<number> {
    if (!ownerId) return 0
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([STORES.SYNC_QUEUE], 'readwrite')
      const statusIndex = transaction.objectStore(STORES.SYNC_QUEUE).index('status')
      const request = statusIndex.openCursor('syncing')
      let recovered = 0

      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return

        const item = cursor.value as SyncQueueItem
        if ((isSyncItemOwnedBy(item, ownerId) || isLegacyReviewQueuedFor(item, ownerId)) && isSyncQueueItemRecoveryExpired(item, now, leaseMs)) {
          cursor.update({ ...item, status: 'pending', lastAttempt: now, error: undefined })
          recovered += 1
        }
        cursor.continue()
      }

      request.onerror = () => reject(request.error ?? new Error('Could not inspect interrupted sync items.'))
      transaction.oncomplete = () => resolve(recovered)
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not recover interrupted sync items.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Sync recovery was cancelled.'))
    })
  }

  async updateSyncStatus(id: string, status: SyncStatus, error?: string, retryCount?: number, deliveryRetry?: FieldDeliveryRetry): Promise<void> {
    await this.update(STORES.SYNC_QUEUE, id, {
      status,
      error,
      lastAttempt: Date.now(),
      ...(retryCount === undefined ? {} : { retryCount }),
      ...(deliveryRetry === undefined ? {} : { deliveryRetry }),
    })
  }

  async retryFailedSyncItems(ownerId?: string): Promise<void> {
    if (!ownerId) return
    const failed = await this.getAll<SyncQueueItem>(STORES.SYNC_QUEUE, 'status', 'failed')
    for (const item of failed) {
      if (!item.id || !(isSyncItemOwnedBy(item, ownerId) || isLegacyReviewQueuedFor(item, ownerId))) continue
      await this.update(STORES.SYNC_QUEUE, item.id, {
      status: 'pending',
      retryCount: 0,
      error: undefined,
      // Explicit review may retry a blocked item, but cannot bypass its delay.
      deliveryRetry: item.deliveryRetry ? { ...item.deliveryRetry, blocked: false } : undefined,
      })
    }
  }

  async removeFromSyncQueue(id: string, delivered: SyncQueueItem): Promise<void> {
    const identity = (item: SyncQueueItem) => canonicalJson({ id: item.id, ownerId: item.ownerId,
      type: item.type, recordId: item.recordId, action: item.action, data: item.data, recoveryReview: item.recoveryReview })
    const snapshot = identity(delivered)
    if (delivered.id !== id) throw new Error('The delivered queue identity differs. No source was removed.')
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([STORES.SYNC_QUEUE], 'readwrite')
      const store = transaction.objectStore(STORES.SYNC_QUEUE)
      const request = store.get(id)
      request.onsuccess = () => {
        try {
          const current = request.result as SyncQueueItem | undefined
          if (!current || current.status !== 'syncing' || identity(current) !== snapshot) {
            throw new Error('The queue source or review changed during delivery. No source was removed.')
          }
          store.delete(id)
        } catch (error) { reject(error) }
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not commit delivery queue removal.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Delivery queue removal was aborted.'))
    })
  }

  async getLegacyQueuePage(projectId: string, actorId: string, after?: string): Promise<{ items: LegacyQueueSummary[]; next: string | null }> {
    if (!actorId || !projectId) return { items: [], next: null }
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([STORES.SYNC_QUEUE], 'readonly')
      const request = transaction.objectStore(STORES.SYNC_QUEUE).openCursor(after ? IDBKeyRange.lowerBound(after, true) : null)
      const items: LegacyQueueSummary[] = []
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor || items.length >= 11) return
        const item = cursor.value as SyncQueueItem
        if (item.id && isUnattributedItem(item, projectId)) {
          const data = item.data as Record<string, unknown>
          items.push({ id: item.id, recordId: item.recordId, type: item.type,
            name: String(data.pointName ?? data.name ?? item.recordId).slice(0, 100), status: item.status, error: item.error,
            canQueue: canReviewLegacyItem(item, projectId)
              && (!item.recoveryReview || item.recoveryReview.actorId === actorId)
              && (item.status !== 'syncing' || isSyncQueueItemRecoveryExpired(item)),
          })
        }
        if (items.length < 11) cursor.continue()
      }
      transaction.oncomplete = () => resolve({ items: items.slice(0, 10), next: items.length > 10 ? items[9].id : null })
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not inspect older device records.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Device recovery inspection was cancelled.'))
    })
  }

  async queueLegacyReview(queueId: string, actorId: string, projectId: string, sourceHash: string): Promise<void> {
    const item = await this.get<SyncQueueItem>(STORES.SYNC_QUEUE, queueId)
    if (!actorId || !item || !canReviewLegacyItem(item, projectId)) {
      throw new Error('This source is attributed, unsupported or belongs to another project. It was retained unchanged.')
    }
    if (await legacySourceHash(item) !== sourceHash) throw new Error('The source changed after selection. Review the retained source again.')
    const snapshot = canonicalJson(item.data)
    const sourceSnapshot = observationSnapshot(item.data as ObservationSource)
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([STORES.SYNC_QUEUE, STORES.FIELD_OBSERVATIONS], 'readwrite')
      const store = transaction.objectStore(STORES.SYNC_QUEUE)
      const sources = transaction.objectStore(STORES.FIELD_OBSERVATIONS)
      const fail = (error: unknown) => {
        reject(error)
        transaction.abort()
      }
      const request = store.get(queueId)
      request.onsuccess = () => {
        const current = request.result as SyncQueueItem | undefined
        if (!current || !isUnattributedItem(current, projectId) || canonicalJson(current.data) !== snapshot
          || current.type !== item.type || current.action !== item.action || current.recordId !== item.recordId
          || (current.recoveryReview && current.recoveryReview.actorId !== actorId)
          || (current.status === 'syncing' && !isSyncQueueItemRecoveryExpired(current))) {
          fail(new Error('The source, review or delivery state changed. No new review was queued.'))
          return
        }
        const sourceRequest = sources.get(current.recordId)
        sourceRequest.onsuccess = () => {
          try {
            const source = sourceRequest.result as ObservationSource | undefined
            if (source && (source.ownerId !== undefined || source.id !== current.recordId
              || observationSnapshot(source) !== sourceSnapshot)) {
              throw new Error('The queued and primary device sources conflict. Both were retained unchanged for manual reconciliation.')
            }
            // Recover only an absent copy, using the exact retained source.
            // A conflicting record is never overwritten or given a new owner.
            if (!source) sources.add(current.data)
            store.put({ ...current, status: 'pending', error: undefined,
              ...(current.deliveryRetry ? { deliveryRetry: { ...current.deliveryRetry, blocked: false } } : {}),
              recoveryReview: { version: LEGACY_REVIEW_VERSION, actorId, projectId, sourceHash,
                reviewedAt: new Date().toISOString(), capturedBy: null } satisfies LegacyRecoveryReview,
            })
          } catch (error) { fail(error) }
        }
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not retain the recovery review.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving the recovery review was cancelled.'))
    })
  }

  // Storage stats
  async getStorageStats(ownerId?: string): Promise<StorageStats> {
    if (!ownerId) return { observations: 0, photos: 0, pendingSync: 0, failedSync: 0, storageUsed: '0 B' }
    const allObservations = await this.getAll<FieldObservation>(STORES.FIELD_OBSERVATIONS)
    const visible = await Promise.all(allObservations.map(row => isMobileRecordVisibleTo(row, ownerId)))
    const observations = allObservations.filter((_row, index) => visible[index])
    const photos = (await this.getAll<PhotoData>(STORES.PHOTOS)).filter(row => row.ownerId === ownerId)
    const queue = (await this.getAll<SyncQueueItem>(STORES.SYNC_QUEUE)).filter(row => isSyncItemOwnedBy(row, ownerId) || isLegacyReviewQueuedFor(row, ownerId))

    return {
      observations: observations.length,
      photos: photos.length,
      pendingSync: (queue as SyncQueueItem[]).filter((i) => i.status === 'pending' || i.status === 'syncing').length,
      failedSync: (queue as SyncQueueItem[]).filter((i) => i.status === 'failed').length,
      storageUsed: this.estimateStorageSize(observations, photos as Array<{ data?: string }>),
    }
  }

  // Clear all data (use with caution)
  async clearAll(): Promise<void> {
    if (!this.db) await this.init()

    const storeNames = Object.values(STORES)

    for (const storeName of storeNames) {
      await new Promise<void>((resolve, reject) => {
        const transaction = this.requireDb().transaction([storeName], 'readwrite')
        const store = transaction.objectStore(storeName)
        const request = store.clear()

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private estimateStorageSize(observations: unknown[], photos: Array<{ data?: string }>): string {
    const obsSize = JSON.stringify(observations).length
    const photoSize = photos.reduce((sum, p) => sum + (p.data?.length || 0), 0)
    const totalBytes = obsSize + photoSize

    if (totalBytes < 1024) return `${totalBytes} B`
    if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)} KB`
    return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
  }
}

// Types
export interface FieldObservation {
  id?: string
  ownerId?: string
  projectId: string
  pointName: string
  pointId?: string
  surveyType?: 'traverse' | 'leveling' | 'gnss' | 'unspecified'
  surveyMode?: 'traverse' | 'leveling' | 'control'
  captureFormVersion?: number
  /** Exact operator-entered strings, retained independently of normalized fields. */
  rawForm?: Record<string, string>
  observationType: 'gps' | 'total_station' | 'level' | 'manual'
  northing?: number
  easting?: number
  elevation?: number
  latitude?: number
  longitude?: number
  accuracy?: number
  accuracySource?: 'receiver' | 'browser' | 'unknown'
  satellites?: number
  solutionType?: 'fixed' | 'float' | 'dgps' | 'single'
  fixQuality?: number
  hdop?: number
  vdop?: number
  pdop?: number
  instrumentHeight?: number
  rodHeight?: number
  backsight?: string
  foresight?: string
  horizontalAngle?: number
  backsightReading?: number
  intermediateReading?: number
  foresightReading?: number
  verticalAngle?: number
  slopeDistance?: number
  temperature?: number
  pressure?: number
  humidity?: number
  weather?: string
  notes?: string
  horizontalCrs?: string
  verticalDatum?: string
  instrumentName?: string
  observationSource?: 'gnss_receiver' | 'browser_geolocation' | 'total_station' | 'manual'
  timestamp?: number
  synced?: boolean
  deliveryReceipt?: FieldObservationDeliveryReceipt
}

export interface PhotoData {
  id?: string
  ownerId?: string
  projectId: string
  pointId?: string
  pointName?: string
  data: string // base64
  /** Original media type and name are retained so upload does not rewrite evidence. */
  contentType?: string
  fileName?: string
  thumbnail?: string // base64
  caption?: string
  orientation?: 'portrait' | 'landscape'
  /** Only populated when EXIF contains an explicit capture time. */
  capturedAt?: string
  /** Raw device metadata; never treated as survey control or transformed coordinates. */
  metadata?: Record<string, unknown>
  observationClientId?: string
  timestamp?: number
  synced?: boolean
}

export interface SyncQueueItem {
  id?: string
  ownerId?: string
  type: 'field_observation' | 'photo' | 'survey_point'
  recordId: string
  action: 'create' | 'update' | 'delete'
  data: unknown
  timestamp?: number
  status?: SyncStatus
  retryCount?: number
  error?: string
  lastAttempt?: number
  deliveryRetry?: FieldDeliveryRetry
  recoveryReview?: LegacyRecoveryReview
}

export interface LegacyQueueSummary {
  id: string
  recordId: string
  type: SyncQueueItem['type']
  name: string
  canQueue: boolean
  status: SyncStatus | undefined
  error?: string
}

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

/** Unknown historical attribution is retained, never assigned to a new login. */
export function isSyncItemOwnedBy(item: SyncQueueItem, ownerId?: string): boolean {
  if (!ownerId || !item.data || typeof item.data !== 'object' || Array.isArray(item.data)) return false
  const captureOwner = (item.data as { ownerId?: unknown }).ownerId
  return captureOwner === ownerId && (item.ownerId === undefined || item.ownerId === ownerId)
}

export function isSyncQueueItemRecoveryExpired(
  item: SyncQueueItem,
  now = Date.now(),
  leaseMs = SYNC_RECOVERY_LEASE_MS,
): boolean {
  if (item.status !== 'syncing') return false
  if (typeof item.lastAttempt !== 'number' || !Number.isFinite(item.lastAttempt)) return true
  return now - item.lastAttempt >= Math.max(0, leaseMs)
}

export interface StorageStats {
  observations: number
  photos: number
  pendingSync: number
  failedSync: number
  storageUsed: string
}

// Singleton instance
export const offlineStorage = new OfflineStorage()
export default offlineStorage
