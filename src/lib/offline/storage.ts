import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'metardu-offline';
const DB_VERSION = 1;

export interface OfflineProject {
  id: string;
  name: string;
  survey_type: string;
  created_at: string;
  last_sync: string | null;
  dirty: boolean;
}

export interface OfflineObservation {
  id: string;
  project_id: string;
  station_from: string;
  station_to: string;
  horizontal_angle: number;
  vertical_angle: number;
  slope_distance: number;
  target_height: number;
  instrument_height: number;
  remarks: string;
  photo_url?: string;
  timestamp: string;
  synced: boolean;
}

export interface SyncQueueItem {
  id: string;
  type: 'observation' | 'project';
  action: 'create' | 'update' | 'delete';
  data: OfflineObservation | OfflineProject;
  attempts: number;
  last_attempt: string | null;
  error?: string;
}

let dbInstance: IDBPDatabase | null = null;

export async function getOfflineDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('projects')) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
        projectStore.createIndex('dirty', 'dirty');
        projectStore.createIndex('last_sync', 'last_sync');
      }

      if (!db.objectStoreNames.contains('observations')) {
        const obsStore = db.createObjectStore('observations', { keyPath: 'id' });
        obsStore.createIndex('project_id', 'project_id');
        obsStore.createIndex('synced', 'synced');
        obsStore.createIndex('timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains('sync_queue')) {
        const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        syncStore.createIndex('type', 'type');
        syncStore.createIndex('attempts', 'attempts');
      }
    },
  });

  return dbInstance;
}

export async function saveProjectOffline(project: OfflineProject): Promise<void> {
  const db = await getOfflineDB();
  project.dirty = true;
  await db.put('projects', project);
}

export async function getProjectOffline(projectId: string): Promise<OfflineProject | undefined> {
  const db = await getOfflineDB();
  return db.get('projects', projectId);
}

export async function getAllProjectsOffline(): Promise<OfflineProject[]> {
  const db = await getOfflineDB();
  return db.getAll('projects');
}

export async function saveObservationOffline(observation: OfflineObservation): Promise<void> {
  const db = await getOfflineDB();
  observation.synced = false;
  observation.timestamp = new Date().toISOString();
  await db.put('observations', observation);

  const project = await db.get('projects', observation.project_id);
  if (project) {
    project.dirty = true;
    await db.put('projects', project);
  }
}

export async function getObservationsOffline(projectId: string): Promise<OfflineObservation[]> {
  const db = await getOfflineDB();
  const all = await db.getAllFromIndex('observations', 'project_id', projectId);
  return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function getUnsyncedObservations(projectId: string): Promise<OfflineObservation[]> {
  const db = await getOfflineDB();
  const all = await db.getAllFromIndex('observations', 'project_id', projectId);
  return all.filter(o => !o.synced);
}

export async function markObservationSynced(observationId: string): Promise<void> {
  const db = await getOfflineDB();
  const obs = await db.get('observations', observationId);
  if (obs) {
    obs.synced = true;
    await db.put('observations', obs);
  }
}

export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  const db = await getOfflineDB();
  item.attempts = 0;
  item.last_attempt = null;
  await db.put('sync_queue', item);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getOfflineDB();
  return db.getAll('sync_queue');
}

export async function updateSyncQueueItem(item: SyncQueueItem): Promise<void> {
  const db = await getOfflineDB();
  await db.put('sync_queue', item);
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await getOfflineDB();
  await db.delete('sync_queue', id);
}

export async function clearOfflineData(): Promise<void> {
  const db = await getOfflineDB();
  await db.clear('projects');
  await db.clear('observations');
  await db.clear('sync_queue');
}

export async function getOfflineStats(projectId?: string): Promise<{
  totalProjects: number;
  totalObservations: number;
  unsyncedObservations: number;
  dirtyProjects: number;
}> {
  const db = await getOfflineDB();
  
  const projects = await db.getAll('projects');
  const observations = projectId 
    ? await db.getAllFromIndex('observations', 'project_id', projectId)
    : await db.getAll('observations');
  
  return {
    totalProjects: projects.length,
    totalObservations: observations.length,
    unsyncedObservations: observations.filter(o => !o.synced).length,
    dirtyProjects: projects.filter(p => p.dirty).length,
  };
}