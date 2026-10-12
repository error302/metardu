/**
 * Sync Service for Mobile Field Data
 * Handles upload when connectivity returns
 */

import { offlineStorage, SyncQueueItem, type FieldObservation, type PhotoData } from './offlineStorage'
import type { BrowserClient } from '@/lib/api-client/client'
import { createClient } from '@/lib/api-client/client'
import { uploadFieldPhoto } from './photoUpload'

// The sync queue stores the same records offlineStorage persists, with the
// generated id and a server-side timestamp guaranteed by addToSyncQueue.
type ObservationPayload = FieldObservation & { id: string; timestamp: number }
type PhotoPayload = PhotoData & { id: string; timestamp: number }

interface SurveyPointPayload {
  id: string
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
        this.syncPending()
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
    this.syncPending()
  }

  private handleOffline() {
    this.isOnline = false
  }

  async syncPending(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) return { synced: 0, failed: 0 }
    if (!this.isOnline) return { synced: 0, failed: 0 }

    this.isSyncing = true
    let synced = 0
    let failed = 0
    try {
      // A browser/tab may have closed after claiming an item. Requeue only
      // claims older than the recovery lease so active slow uploads are not
      // stolen by another sync pass.
      await offlineStorage.recoverStaleSyncItems()
      const items = await offlineStorage.getPendingSyncItems()

      for (const item of items) {
        const id = item.id
        if (!id) { failed++; continue }
        try {
          await this.syncItem(item)
          synced++
        } catch (error) {
          failed++
          // eslint-disable-next-line no-console -- background sync loop operational log, not user-facing UI
          console.error('[Sync] Failed to sync item:', item.id, error)

          // Keep a bounded retry count and make permanently failed items
          // explicitly retryable from the field UI.
          const retryCount = (item.retryCount || 0) + 1
          if (retryCount >= 3) {
            await offlineStorage.updateSyncStatus(
              id,
              'failed',
              error instanceof Error ? error.message : 'Unknown error',
              retryCount,
            )
          } else {
            await offlineStorage.updateSyncStatus(
              id,
              'pending',
              error instanceof Error ? error.message : 'Unknown error',
              retryCount,
            )
          }
        }
      }

      return { synced, failed }
    } finally {
      this.isSyncing = false
    }
  }

  private async syncItem(item: SyncQueueItem): Promise<void> {
    if (!item.id) throw new Error('Sync item missing id')
    const dbClient = createClient()

    await offlineStorage.updateSyncStatus(item.id, 'syncing')

    switch (item.type) {
      case 'field_observation':
        await this.syncObservation(dbClient, item.data as ObservationPayload)
        break
      case 'photo':
        await this.syncPhoto(dbClient, item.data as PhotoPayload)
        break
      case 'survey_point':
        await this.syncSurveyPoint(dbClient, item.data as SurveyPointPayload)
        break
    }

    await offlineStorage.updateSyncStatus(item.id, 'synced')
    await offlineStorage.removeFromSyncQueue(item.id)
  }

  private async syncObservation(dbClient: BrowserClient, payload: ObservationPayload): Promise<void> {
    const { error } = await dbClient.from('survey_observations').upsert({
      client_id: payload.id,
      project_id: payload.projectId,
      point_name: payload.pointName,
      point_id: payload.pointId,
      observation_type: payload.observationType,
      northing: payload.northing,
      easting: payload.easting,
      elevation: payload.elevation,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy,
      accuracy_source: payload.accuracySource,
      satellites: payload.satellites,
      solution_type: payload.solutionType,
      fix_quality: payload.fixQuality,
      hdop: payload.hdop,
      vdop: payload.vdop,
      pdop: payload.pdop,
      instrument_height: payload.instrumentHeight,
      rod_height: payload.rodHeight,
      backsight: payload.backsight,
      foresight: payload.foresight,
      horizontal_angle: payload.horizontalAngle,
      vertical_angle: payload.verticalAngle,
      slope_distance: payload.slopeDistance,
      temperature: payload.temperature,
      pressure: payload.pressure,
      humidity: payload.humidity,
      weather: payload.weather,
      notes: payload.notes,
      horizontal_crs: payload.horizontalCrs,
      vertical_datum: payload.verticalDatum,
      instrument_name: payload.instrumentName,
      observation_source: payload.observationSource,
      observed_at: new Date(payload.timestamp).toISOString(),
      synced_at: new Date().toISOString(),
    }, { onConflict: 'project_id,client_id' })

    if (error) throw error

    // Mark observation as synced
    await offlineStorage.update('field_observations', payload.id, { synced: true })
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
    )

    // The project/client unique key makes a retry safe after any interrupted
    // response. Keep the original local image until both writes succeed.
    const { error } = await dbClient.from('field_photos').upsert({
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
    }, { onConflict: 'project_id,client_id' })

    if (error) {
      // Leave the stable uploaded path intact: a later retry will upsert its
      // metadata. Deleting here could destroy a previous successful upload.
      throw error
    }

    await offlineStorage.update('photos', payload.id, { synced: true, storagePath })
  }

  private async syncSurveyPoint(dbClient: BrowserClient, payload: SurveyPointPayload): Promise<void> {
    const { error } = await dbClient.from('survey_points').upsert({
      id: payload.id,
      project_id: payload.projectId,
      point_name: payload.name,
      easting: payload.easting,
      northing: payload.northing,
      elevation: payload.elevation,
      is_control: payload.isControl,
      description: payload.description,
      observation_date: new Date(payload.timestamp).toISOString().slice(0, 10),
    })

    if (error) throw error
  }

  async forceSync(): Promise<{ synced: number; failed: number }> {
    await offlineStorage.retryFailedSyncItems()
    return this.syncPending()
  }

  getSyncStatus(): { isOnline: boolean; isSyncing: boolean } {
    return { isOnline: this.isOnline, isSyncing: this.isSyncing }
  }
}

export const syncService = new SyncService()
export default syncService
