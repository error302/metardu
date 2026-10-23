import { openDB, DBSchema, IDBPDatabase } from 'idb'

const DB_NAME = 'metardu-offline'
const DB_VERSION = 3

export interface SyncOperation {
  id?: number
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT'
  table: string
  data: Record<string, unknown>
  timestamp: string
  projectId: string
  retries: number
  priority: 'high' | 'normal' | 'low'
  /** Reviewed delivery link only; the original queued source remains intact. */
  fieldbookRecovery?: unknown
}

export interface ConflictRecord {
  id?: number
  localOp: SyncOperation
  remoteData: Record<string, unknown> | null
  /** Common-ancestor snapshot (the state of the row when the local edit began). */
  baseData?: Record<string, unknown> | null
  resolved: boolean
  resolution?: 'local' | 'remote' | 'merged' | 'manual'
  /** After three-way merge, which fields need manual resolution (both sides changed them). */
  conflictingFields?: string[]
  /** After three-way merge, the proposed merged data (auto-resolvable fields only). */
  mergedData?: Record<string, unknown> | null
  createdAt: string
}

export interface METARDUDB extends DBSchema {
  sync_queue: {
    key: number
    value: SyncOperation
    indexes: { 'by-project': string; 'by-timestamp': string }
  }
  projects: {
    key: string
    value: Record<string, unknown>
  }
  survey_points: {
    key: string
    value: Record<string, unknown>
    indexes: { 'by-project': string }
  }
  traverse_obs: {
    key: string
    value: Record<string, unknown>
    indexes: { 'by-project': string }
  }
  leveling_obs: {
    key: string
    value: Record<string, unknown>
    indexes: { 'by-project': string }
  }
  fieldbooks: {
    key: string
    value: Record<string, unknown>
  }
  conflicts: {
    key: number
    value: ConflictRecord
  }
}

let dbPromise: Promise<IDBPDatabase<METARDUDB>> | null = null

export async function getDB(): Promise<IDBPDatabase<METARDUDB>> {
  if (!dbPromise) {
    dbPromise = openDB<METARDUDB>(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion) {
        // Sync queue with indexes
        if (!db.objectStoreNames.contains('sync_queue')) {
          const store = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true })
          store.createIndex('by-project', 'projectId')
          store.createIndex('by-timestamp', 'timestamp')
        }
        // Projects store
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' })
        }
        // Survey points with project index
        if (!db.objectStoreNames.contains('survey_points')) {
          const store = db.createObjectStore('survey_points', { keyPath: 'id' })
          store.createIndex('by-project', 'project_id')
        }
        // Traverse observations
        if (!db.objectStoreNames.contains('traverse_obs')) {
          const store = db.createObjectStore('traverse_obs', { keyPath: 'id' })
          store.createIndex('by-project', 'project_id')
        }
        // Leveling observations
        if (!db.objectStoreNames.contains('leveling_obs')) {
          const store = db.createObjectStore('leveling_obs', { keyPath: 'id' })
          store.createIndex('by-project', 'project_id')
        }
        // Field books
        if (!db.objectStoreNames.contains('fieldbooks')) {
          db.createObjectStore('fieldbooks', { keyPath: 'id' })
        }
        // Conflict resolution store
        if (!db.objectStoreNames.contains('conflicts')) {
          db.createObjectStore('conflicts', { keyPath: 'id', autoIncrement: true })
        }
      }
    })
  }
  return dbPromise
}
