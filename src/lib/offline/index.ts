/**
 * METARDU Offline Module — Public API
 *
 * syncQueue.ts is the canonical (v2) implementation with:
 * - DB_VERSION = 3
 * - Priority-based sync queue
 * - Conflict resolution
 * - Multiple data stores (projects, survey_points, traverse_obs, leveling_obs, fieldbooks, conflicts)
 *
 * storage.ts and sync.ts are deprecated v1 compatibility layers.
 */

// ─── Primary exports (v2 canonical) ───
export {
  getDB,
  queueOperation,
  getPendingOperations,
  removeSyncedOperation,
  syncPendingOperations,
  startBackgroundSync,
  stopBackgroundSync,
  saveProjectOffline,
  getOfflineProjects,
  savePointsOffline,
  getOfflinePoints,
  saveTraverseOffline,
  getOfflineTraverses,
  saveLevelingOffline,
  getOfflineLevelings,
  clearOfflineData,
  isOnline,
  setupOnlineListener,
  type SyncOperation,
  type ConflictRecord,
} from './syncQueue'

// ─── v1 compatibility exports (for FieldBookMobile and other consumers) ───
export {
  syncProject,
  registerNetworkListeners,
  enableAutoSync,
  type SyncResult,
  type SyncProgress,
} from './sync'

// ─── v1 storage compatibility exports ───
// These functions bridge v1 consumers to the v2 data model.
// The v1 "observations" store no longer exists in DB_VERSION=3;
// observations are stored in survey_points/traverse_obs/leveling_obs.
export {
  saveObservationOffline,
  getObservationsOffline,
  getUnsyncedObservations,
  markObservationSynced,
  addToSyncQueue,
  getSyncQueue,
  updateSyncQueueItem,
  removeSyncQueueItem,
  getOfflineStats,
  getOfflineDB,
  getProjectOffline,
  type OfflineProject,
  type OfflineObservation,
  type SyncQueueItem,
} from './storage'
