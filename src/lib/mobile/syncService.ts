/**
 * Sync Service for Mobile Field Data
 * Handles upload when connectivity returns
 */

import { offlineStorage, SyncQueueItem, SyncStatus } from './offlineStorage'
import { createClient } from '@/lib/api-client/client'

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
    console.log('[Sync] Connection restored, starting sync...')
    this.syncPending()
  }

  private handleOffline() {
    this.isOnline = false
    console.log('[Sync] Connection lost, pausing sync...')
  }

  async syncPending(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) return { synced: 0, failed: 0 }
    if (!this.isOnline) return { synced: 0, failed: 0 }

    this.isSyncing = true
    const items = await offlineStorage.getPendingSyncItems()

    let synced = 0
    let failed = 0

    for (const item of items) {
      try {
        await this.syncItem(item)
        synced++
      } catch (error) {
        failed++
        console.error('[Sync] Failed to sync item:', item.id, error)

        // Mark as failed after 3 retries
        if ((item.retryCount || 0) >= 3) {
          await offlineStorage.updateSyncStatus(
            item.id!,
            'failed',
            error instanceof Error ? error.message : 'Unknown error'
          )
        } else {
          await offlineStorage.updateSyncStatus(item.id!, 'pending')
        }
      }
    }

    this.isSyncing = false
    return { synced, failed }
  }

  private async syncItem(item: SyncQueueItem): Promise<void> {
    const dbClient = createClient()

    await offlineStorage.updateSyncStatus(item.id!, 'syncing')

    switch (item.type) {
      case 'field_observation':
        await this.syncObservation(dbClient, item)
        break
      case 'photo':
        await this.syncPhoto(dbClient, item)
        break
      case 'survey_point':
        await this.syncSurveyPoint(dbClient, item)
        break
    }

    await offlineStorage.updateSyncStatus(item.id!, 'synced')
    await offlineStorage.removeFromSyncQueue(item.id!)
  }

  private async syncObservation(dbClient: any, item: SyncQueueItem): Promise<void> {
    const { data, error } = await dbClient.from('survey_observations').insert({
      project_id: item.data.projectId,
      point_name: item.data.pointName,
      point_id: item.data.pointId,
      observation_type: item.data.observationType,
      northing: item.data.northing,
      easting: item.data.easting,
      elevation: item.data.elevation,
      latitude: item.data.latitude,
      longitude: item.data.longitude,
      accuracy: item.data.accuracy,
      satellites: item.data.satellites,
      solution_type: item.data.solutionType,
      hdop: item.data.hdop,
      vdop: item.data.vdop,
      pdop: item.data.pdop,
      instrument_height: item.data.instrumentHeight,
      rod_height: item.data.rodHeight,
      backsight: item.data.backsight,
      foresight: item.data.foresight,
      horizontal_angle: item.data.horizontalAngle,
      vertical_angle: item.data.verticalAngle,
      slope_distance: item.data.slopeDistance,
      temperature: item.data.temperature,
      pressure: item.data.pressure,
      humidity: item.data.humidity,
      weather: item.data.weather,
      notes: item.data.notes,
      observed_at: new Date(item.data.timestamp).toISOString(),
    })

    if (error) throw error

    // Mark observation as synced
    await offlineStorage.update('field_observations', item.data.id, { synced: true })
  }

  private async syncPhoto(dbClient: any, item: SyncQueueItem): Promise<void> {
    // First upload the image to storage
    const fileName = `field_photos/${item.data.projectId}/${item.data.id}.jpg`
    const base64Data = item.data.data.split(',')[1]
    const blob = Buffer.from(base64Data, 'base64')

    const { error: uploadError } = await dbClient.storage.from('survey-photos').upload(fileName, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    })

    if (uploadError) throw uploadError

    // Then create the database record
    const { data: photoData, error } = await dbClient.from('field_photos').insert({
      project_id: item.data.projectId,
      point_id: item.data.pointId,
      point_name: item.data.pointName,
      storage_path: fileName,
      thumbnail: item.data.thumbnail,
      caption: item.data.caption,
      orientation: item.data.orientation,
      captured_at: new Date(item.data.timestamp).toISOString(),
    }).select().single()

    if (error) throw error

    await offlineStorage.update('photos', item.data.id, { synced: true, storagePath: fileName })
  }

  private async syncSurveyPoint(dbClient: any, item: SyncQueueItem): Promise<void> {
    const { error } = await dbClient.from('survey_points').upsert({
      id: item.data.id,
      project_id: item.data.projectId,
      name: item.data.name,
      easting: item.data.easting,
      northing: item.data.northing,
      elevation: item.data.elevation,
      is_control: item.data.isControl,
      description: item.data.description,
      observed_at: new Date(item.data.timestamp).toISOString(),
    })

    if (error) throw error
  }

  async forceSync(): Promise<{ synced: number; failed: number }> {
    return this.syncPending()
  }

  getSyncStatus(): { isOnline: boolean; isSyncing: boolean } {
    return { isOnline: this.isOnline, isSyncing: this.isSyncing }
  }
}

export const syncService = new SyncService()
export default syncService
