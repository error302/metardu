/**
 * Offline Storage Service for Mobile Field Data Collection
 * Uses IndexedDB for persistent storage with sync capability
 */

const DB_NAME = 'MetarduFieldDB'
const DB_VERSION = 1
export const SYNC_RECOVERY_LEASE_MS = 15 * 60 * 1000

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

  private requireDb(): IDBDatabase {
    if (!this.db) throw new Error('OfflineStorage not initialized - call init() first')
    return this.db
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
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

  async update<T>(storeName: string, id: string, data: Partial<T>): Promise<void> {
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

        const updated = { ...existing, ...data }
        const putRequest = store.put(updated)

        putRequest.onsuccess = () => resolve()
        putRequest.onerror = () => reject(putRequest.error)
      }

      request.onerror = () => reject(request.error)
    })
  }

  async delete(storeName: string, id: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.requireDb().transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
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
      id: photo.id || this.generateId(),
      observationClientId: photo.observationClientId ?? id,
      timestamp: photo.timestamp ?? now,
      synced: false,
    }))

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
        action: 'create', data: record, timestamp: now, status: 'pending', retryCount: 0,
      } satisfies SyncQueueItem)

      for (const photo of photoRecords) {
        photoStore.add(photo)
        queueStore.add({
          id: this.generateId(), type: 'photo', recordId: photo.id,
          action: 'create', data: photo, timestamp: now, status: 'pending', retryCount: 0,
        } satisfies SyncQueueItem)
      }

      transaction.oncomplete = () => resolve(id)
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the field observation and photos.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Field observation save was cancelled.'))
    })
  }

  async getFieldObservations(projectId: string): Promise<FieldObservation[]> {
    return this.getAll(STORES.FIELD_OBSERVATIONS, 'project_id', projectId)
  }

  async getProjectPhotos(projectId: string): Promise<PhotoData[]> {
    return this.getAll(STORES.PHOTOS, 'project_id', projectId)
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
          action: 'create', data: photo, timestamp: now, status: 'pending', retryCount: 0,
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

  async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    return this.getAll(STORES.SYNC_QUEUE, 'status', 'pending')
  }

  /** Requeue items whose previous sync process ended without completing. */
  async recoverStaleSyncItems(now = Date.now(), leaseMs = SYNC_RECOVERY_LEASE_MS): Promise<number> {
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
        if (isSyncQueueItemRecoveryExpired(item, now, leaseMs)) {
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

  async updateSyncStatus(id: string, status: SyncStatus, error?: string, retryCount?: number): Promise<void> {
    await this.update(STORES.SYNC_QUEUE, id, {
      status,
      error,
      lastAttempt: Date.now(),
      ...(retryCount === undefined ? {} : { retryCount }),
    })
  }

  async retryFailedSyncItems(): Promise<void> {
    const failed = await this.getAll<SyncQueueItem>(STORES.SYNC_QUEUE, 'status', 'failed')
    await Promise.all(failed.filter(item => item.id).map(item => this.update(STORES.SYNC_QUEUE, item.id!, {
      status: 'pending',
      retryCount: 0,
      error: undefined,
    })))
  }

  async removeFromSyncQueue(id: string): Promise<void> {
    await this.delete(STORES.SYNC_QUEUE, id)
  }

  // Storage stats
  async getStorageStats(): Promise<StorageStats> {
    const observations = await this.getAll(STORES.FIELD_OBSERVATIONS)
    const photos = await this.getAll(STORES.PHOTOS)
    const queue = await this.getAll(STORES.SYNC_QUEUE)

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
  projectId: string
  pointName: string
  pointId?: string
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
  observationSource?: 'gnss_receiver' | 'browser_geolocation' | 'total_station'
  timestamp?: number
  synced?: boolean
}

export interface PhotoData {
  id?: string
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
  type: 'field_observation' | 'photo' | 'survey_point'
  recordId: string
  action: 'create' | 'update' | 'delete'
  data: unknown
  timestamp?: number
  status?: SyncStatus
  retryCount?: number
  error?: string
  lastAttempt?: number
}

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

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
