import { getOfflineDB, getUnsyncedObservations, markObservationSynced, type OfflineObservation } from './storage';

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

export interface SyncProgress {
  total: number;
  current: number;
  status: 'idle' | 'syncing' | 'complete' | 'error';
  message: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export async function syncProject(
  projectId: string,
  onProgress?: SyncProgressCallback
): Promise<SyncResult> {
  const db = await getOfflineDB();
  const unsynced = await getUnsyncedObservations(projectId);
  
  if (unsynced.length === 0) {
    return { success: true, synced: 0, failed: 0, errors: [] };
  }

  onProgress?.({
    total: unsynced.length,
    current: 0,
    status: 'syncing',
    message: 'Starting sync...',
  });

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < unsynced.length; i++) {
    const obs = unsynced[i];
    
    onProgress?.({
      total: unsynced.length,
      current: i + 1,
      status: 'syncing',
      message: `Syncing observation ${i + 1} of ${unsynced.length}...`,
    });

    try {
      const response = await fetch('/api/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(obs),
      });

      if (response.ok) {
        await markObservationSynced(obs.id);
        synced++;
      } else {
        const error = await response.text();
        errors.push(`Observation ${obs.station_from}-${obs.station_to}: ${error}`);
        failed++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Observation ${obs.station_from}-${obs.station_to}: ${message}`);
      failed++;
    }
  }

  if (failed === 0) {
    const project = await db.get('projects', projectId);
    if (project) {
      project.dirty = false;
      project.last_sync = new Date().toISOString();
      await db.put('projects', project);
    }
  }

  onProgress?.({
    total: unsynced.length,
    current: unsynced.length,
    status: failed === 0 ? 'complete' : 'error',
    message: failed === 0 
      ? `Synced ${synced} observations` 
      : `Synced ${synced}, failed ${failed}`,
  });

  return {
    success: failed === 0,
    synced,
    failed,
    errors,
  };
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function registerNetworkListeners(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

export function enableAutoSync(projectId: string): () => void {
  let syncing = false;

  const handleOnline = async () => {
    if (syncing) return;
    
    const unsynced = await getUnsyncedObservations(projectId);
    if (unsynced.length > 0) {
      syncing = true;
      try {
        await syncProject(projectId);
      } finally {
        syncing = false;
      }
    }
  };

  return registerNetworkListeners(handleOnline, () => {});
}