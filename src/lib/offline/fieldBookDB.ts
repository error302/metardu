/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * METARDU Offline Field Book — IndexedDB-backed field data collection
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Works offline in rural Kenya (no 4G). Observations are stored in IndexedDB
 * and synced to PostgreSQL when connectivity returns.
 *
 * The surveyor's workflow becomes:
 *   1. Open field book on phone/tablet in the field (offline)
 *   2. Record observations (traverse stations, levels, topo points)
 *   3. Return to office → data auto-syncs to METARDU server
 *   4. Compute → Review → Submit
 *
 * No instrument software needed. No pen-and-paper. No Excel.
 */

import { logger } from '@/lib/logger'
import { openDB, type IDBPDatabase } from 'idb'
import type { RoadFieldPlan } from '@/types/engineering'
import { acknowledgeFieldObservation,observationDeliveryHash,hasAcknowledgedFieldObservation,type FieldObservationDeliveryReceipt } from '@/lib/field/observationReceipt'

const DB_NAME = 'metardu-fieldbook'
const DB_VERSION = 2

// ─── Types ─────────────────────────────────────────────────────────────────

export type ObservationType = 'traverse' | 'leveling' | 'topo' | 'gnss' | 'hydro' | 'mining'

export interface OfflineObservation {
  id: string                  // UUID generated client-side
  projectId: string
  /** Recorded account when known. Legacy captures remain unattributed. */
  ownerId?: string
  surveyType: ObservationType
  station: string             // Station name/number
  backsight?: string          // BS station
  foresight?: string          // FS station
  // Traverse fields
  bearingDeg?: number
  bearingMin?: number
  bearingSec?: number
  slopeDistance?: number
  horizontalDistance?: number
  verticalAngle?: number
  // Leveling fields
  backsightReading?: number   // BS staff reading
  foresightReading?: number   // FS staff reading
  // Topo fields
  easting?: number
  northing?: number
  elevation?: number
  // GNSS fields
  latitude?: number
  longitude?: number
  pointId?: string
  horizontalCrs?: string
  geographicCrs?: string
  verticalDatum?: string
  instrumentType?: 'total_station' | 'gnss_rover' | 'gnss_static' | 'level'
  instrumentName?: string
  observationSource?: 'gnss_receiver' | 'total_station' | 'manual'
  instrumentHeight?: number
  targetHeight?: number
  fixQuality?: number
  satellites?: number
  hdop?: number
  // Metadata
  notes?: string
  photoUrl?: string           // local blob URL (stored separately in IndexedDB)
  createdAt: string           // ISO timestamp
  syncedAt: string | null     // null = not yet synced
  deliveryReceipt?:FieldObservationDeliveryReceipt
  syncError?: string          // last sync error message
}

export interface OfflineProject {
  id: string
  name: string
  surveyType: ObservationType
  createdAt: string
  lastModifiedAt: string
}

export interface OfflineRoadFieldPlan {
  projectId: string
  projectName?: string
  plan: RoadFieldPlan
  /** Project CRS confirmed against the server reference record when this copy was cached. */
  projectCrsCode?: string
  cachedAt: string
}

// ─── Database Schema ───────────────────────────────────────────────────────

interface FieldBookDB {
  observations: OfflineObservation[]
  projects: OfflineProject[]
  photos: { id: string; blob: Blob }
  roadFieldPlans: OfflineRoadFieldPlan[]
}

let dbPromise: Promise<IDBPDatabase<FieldBookDB>> | null = null

function getDB(): Promise<IDBPDatabase<FieldBookDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FieldBookDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        upgradeFieldBookStores(db)
      },
    })
  }
  return dbPromise
}

/** Add missing stores only, so upgrading a version 1 field book preserves its records. */
export function upgradeFieldBookStores(db: IDBPDatabase<FieldBookDB>): void {
  if (!db.objectStoreNames.contains('observations')) {
    const obsStore = db.createObjectStore('observations', { keyPath: 'id' })
    obsStore.createIndex('byProject', 'projectId')
    obsStore.createIndex('bySync', 'syncedAt')
    obsStore.createIndex('byProjectType', ['projectId', 'surveyType'])
  }

  if (!db.objectStoreNames.contains('projects')) {
    const projStore = db.createObjectStore('projects', { keyPath: 'id' })
    projStore.createIndex('byModified', 'lastModifiedAt')
  }

  if (!db.objectStoreNames.contains('photos')) {
    db.createObjectStore('photos', { keyPath: 'id' })
  }

  if (!db.objectStoreNames.contains('roadFieldPlans')) {
    db.createObjectStore('roadFieldPlans', { keyPath: 'projectId' })
  }
}

// ─── Observation CRUD ──────────────────────────────────────────────────────

export async function saveObservation(obs: OfflineObservation): Promise<void> {
  const db = await getDB()
  await db.put('observations', obs)
}

export async function getObservations(projectId: string, surveyType?: ObservationType): Promise<OfflineObservation[]> {
  const db = await getDB()
  if (surveyType) {
    return (await db.getAllFromIndex('observations', 'byProjectType', [projectId, surveyType])) as OfflineObservation[]
  }
  return (await db.getAllFromIndex('observations', 'byProject', projectId)) as OfflineObservation[]
}

export async function deleteObservation(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('observations', id)
}

export async function cacheRoadFieldPlan(projectId: string, plan: RoadFieldPlan, projectCrsCode: string, projectName?: string): Promise<OfflineRoadFieldPlan> {
  const db = await getDB()
  const safeProjectName = typeof projectName === 'string' ? projectName.trim().slice(0, 120) : ''
  const cached: OfflineRoadFieldPlan = {
    projectId,
    ...(safeProjectName ? { projectName: safeProjectName } : {}),
    plan,
    projectCrsCode,
    cachedAt: new Date().toISOString(),
  }
  await db.put('roadFieldPlans', cached)
  return cached
}

export async function getCachedRoadFieldPlan(projectId: string): Promise<OfflineRoadFieldPlan | null> {
  const db = await getDB()
  const cached = (await db.get('roadFieldPlans', projectId)) as OfflineRoadFieldPlan | undefined
  return cached ?? null
}

/** List device-cached road plans so a crew can reopen a prepared project offline. */
export async function listCachedRoadFieldPlans(): Promise<OfflineRoadFieldPlan[]> {
  const db = await getDB()
  const entries = (await db.getAll('roadFieldPlans')) as unknown[]
  return entries.filter((entry): entry is OfflineRoadFieldPlan => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false
    const cached = entry as Partial<OfflineRoadFieldPlan>
    return typeof cached.projectId === 'string'
      && typeof cached.cachedAt === 'string'
      && Number.isFinite(Date.parse(cached.cachedAt))
  }).sort((left, right) => Date.parse(right.cachedAt) - Date.parse(left.cachedAt))
}

export async function deleteCachedRoadFieldPlan(projectId: string): Promise<void> {
  const db = await getDB()
  await db.delete('roadFieldPlans', projectId)
}

export async function getUnsyncedObservations(): Promise<OfflineObservation[]> {
  const db = await getDB()
  // ponytail: getAllFromIndex with null — IndexedDB doesn't support querying
  // for null values directly. Get all and filter. For a few hundred observations
  // this is fine; for thousands, add a separate 'unsynced' store.
  const all = (await db.getAll('observations')) as OfflineObservation[]
  const acknowledged=await Promise.all(all.map(hasAcknowledgedFieldObservation))
  return all.filter((_,index)=>!acknowledged[index])
}

// ─── Photo Storage ─────────────────────────────────────────────────────────

export async function savePhoto(id: string, blob: Blob): Promise<void> {
  const db = await getDB()
  await db.put('photos', { id, blob })
}

export async function getPhoto(id: string): Promise<Blob | null> {
  const db = await getDB()
  const result = (await db.get('photos', id)) as { id: string; blob: Blob } | undefined
  return result?.blob ?? null
}

// ─── Sync ──────────────────────────────────────────────────────────────────

export interface FieldObservationSyncResult {synced:number;failed:number;errors:string[];acknowledgedIds:string[]}
let syncTail:Promise<unknown>=Promise.resolve()
export function syncObservations(projectId?:string):Promise<FieldObservationSyncResult>{
  // Read a fresh queue after the preceding run. Timer, hook and manual sync
  // cannot race and restore an older pending copy over an acknowledged record.
  const work=syncTail.catch(()=>undefined).then(()=>syncPendingObservations(projectId))
  syncTail=work
  return work
}
async function syncPendingObservations(projectId?:string):Promise<FieldObservationSyncResult>{
  const unsynced = (await getUnsyncedObservations()).filter(obs=>!projectId||obs.projectId===projectId)
  if (unsynced.length === 0) return { synced: 0, failed: 0, errors: [],acknowledgedIds:[] }

  let synced = 0
  let failed = 0
  const errors: string[] = []
  const acknowledgedIds:string[]=[]

  for (const obs of unsynced) {
    try {
      const inputHash=await observationDeliveryHash(obs as unknown as Record<string,unknown>)
      const res = await fetch('/api/fieldbook/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obs),
        signal:AbortSignal.timeout(15000),
      })

      if (res.ok) {
        const receipt=acknowledgeFieldObservation(await res.json(),obs.id,inputHash)
        obs.syncedAt = new Date().toISOString()
        obs.deliveryReceipt=receipt
        obs.syncError = undefined
        await saveObservation(obs)
        synced++
        acknowledgedIds.push(receipt.id)
      } else {
        const err = (await res.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string }
        obs.syncError = err.error || `HTTP ${res.status}`
        await saveObservation(obs)
        failed++
        errors.push(`${obs.station}: ${obs.syncError}`)
      }
    } catch (err) {
      // Network error — will retry on next sync cycle
      obs.syncError = err instanceof Error ? err.message : 'Network error'
      await saveObservation(obs)
      failed++
      errors.push(`${obs.station}: ${obs.syncError}`)
    }
  }

  return { synced, failed, errors,acknowledgedIds }
}

// ─── Connectivity ──────────────────────────────────────────────────────────

export function isOnline(): boolean {
  return navigator.onLine
}

export function onConnectivityChange(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true)
  const handleOffline = () => callback(false)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}

// ─── Auto-sync ─────────────────────────────────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null

export function startAutoSync(intervalMs = 30000): void {
  if (syncInterval) return

  // Sync immediately on start
  syncObservations().catch((err) => logger.error('[fieldBookDB] Auto-sync failed:', { error: err }))

  // Sync on connectivity restore
  const unsubscribe = onConnectivityChange((online) => {
    if (online) syncObservations().catch((err) => logger.error('[fieldBookDB] Online sync failed:', { error: err }))
  })

  // Sync periodically
  syncInterval = setInterval(() => {
    if (isOnline()) {
      syncObservations().catch((err) => logger.error('[fieldBookDB] Periodic sync failed:', { error: err }))
    }
  }, intervalMs)

  // Store unsubscribe for cleanup
  ;(startAutoSync as unknown as { _unsubscribe?: () => void })._unsubscribe = unsubscribe
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  const unsub = (startAutoSync as unknown as { _unsubscribe?: () => void })._unsubscribe
  if (unsub) {
    unsub()
    ;(startAutoSync as unknown as { _unsubscribe?: () => void })._unsubscribe = undefined
  }
}

// ─── Utility ───────────────────────────────────────────────────────────────

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function getSyncStatus(projectId?:string): Promise<{ total: number; unsynced: number; synced: number }> {
  const db = await getDB()
  const all = ((await db.getAll('observations')) as OfflineObservation[]).filter(obs=>!projectId||obs.projectId===projectId)
  const acknowledged=await Promise.all(all.map(hasAcknowledgedFieldObservation))
  const unsynced = all.filter((_,index)=>!acknowledged[index])
  return {
    total: all.length,
    unsynced: unsynced.length,
    synced: all.length - unsynced.length,
  }
}
