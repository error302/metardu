/**
 * Offline set-out shots (blueprint §18.1 offline packages, §4.3 field work).
 *
 * Recording a stake is not optional work — a surveyor stakes every pile on a
 * building site whether or not there is signal. Previously a shot went straight
 * to `/api/project/[id]/setout`, so one bar of coverage lost the record.
 *
 * This queue writes the shot to the device first (IndexedDB) and only then
 * attempts delivery. A shot that cannot reach the server stays queued with its
 * judgement and its design reference intact, so it can be re-sent later without
 * the surveyor re-reading the instrument — and so nothing is silently lost.
 */

const SHOT_STORE = 'setout_shots'
const PLAN_STORE = 'setout_project_plans'
const DB_NAME = 'METARDUFieldBook'
const DB_VERSION = 3

/** Add the project-plan store without replacing or rewriting queued field shots. */
export function ensureSetoutPlanStore(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(PLAN_STORE)) {
    db.createObjectStore(PLAN_STORE, { keyPath: 'projectId' })
  }
}

export interface FieldSetoutDefinition {
  id: string
  name: string
  structure_type: string
  crs: string | null
  tolerance_profile_id?: string | null
  metadata: Record<string, unknown> | null
}

export interface FieldSetoutPoint {
  label: string
  easting: number
  northing: number
  design_rl: number | null
  point_type: string
  revision: number
  metadata: Record<string, unknown> | null
}

export interface FieldSetoutRegisterEntry {
  definition_id: string
  label: string
  result: string
  horizontal_error: number | null
  vertical_error: number | null
  reported_accuracy_m: number | null
  staked_at: string
}

export interface CachedSetoutDefinitionList {
  definitions: FieldSetoutDefinition[]
  register: FieldSetoutRegisterEntry[]
  cachedAt: string
}

export interface CachedSetoutDefinitionPlan {
  points: FieldSetoutPoint[]
  register: FieldSetoutRegisterEntry[]
  cachedAt: string
}

export interface CachedSetoutProjectPlan {
  schemaVersion: 1
  projectId: string
  definitionList: CachedSetoutDefinitionList | null
  definitionPlans: Record<string, CachedSetoutDefinitionPlan>
}

export interface QueuedSetoutShot {
  id: string
  projectId: string
  definitionId: string
  label: string
  observedEasting: number
  observedNorthing: number
  observedRL: number | null
  accuracyM: number | null
  /** The judgement shown in the field, kept so the record is self-describing. */
  result: 'PASS' | 'WARN' | 'FAIL' | 'INFO'
  /** Design the shot was taken against, so it can be replayed exactly. */
  designEasting: number
  designNorthing: number
  designRL: number | null
  /** Optional for legacy offline records created before revision guarding. */
  designRevision?: number
  /** CRS displayed by the selected field job when the shot was captured. */
  capturedCrs?: string
  capturedAt: string
  synced: boolean
  syncStatus?: 'queued' | 'rejected' | 'synced'
  syncError?: string | null
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction
      if (!transaction) {
        reject(new Error('Set-out field-book upgrade transaction is unavailable'))
        return
      }
      const store = db.objectStoreNames.contains(SHOT_STORE)
        ? transaction.objectStore(SHOT_STORE)
        : db.createObjectStore(SHOT_STORE, { keyPath: 'id' });
      if (store && !store.indexNames.contains('by-project-status')) {
        store.createIndex('by-project-status', ['projectId', 'syncStatus']);
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const shot = cursor.value as QueuedSetoutShot;
          const syncStatus = shot.synced
            ? 'synced'
            : shot.syncStatus === 'rejected'
              ? 'rejected'
              : 'queued';
          cursor.update({ ...shot, syncStatus });
          cursor.continue();
        };
      }
      ensureSetoutPlanStore(db)
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close()
        return
      }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true
      reject(new Error('Close another METARDU field-book tab to update offline set-out storage'))
    }
  });
}

function emptyProjectPlan(projectId: string): CachedSetoutProjectPlan {
  return { schemaVersion: 1, projectId, definitionList: null, definitionPlans: {} }
}

function writeProjectPlan(
  projectId: string,
  update: (current: CachedSetoutProjectPlan) => CachedSetoutProjectPlan
): Promise<void> {
  return openDb().then((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PLAN_STORE, 'readwrite')
    const store = tx.objectStore(PLAN_STORE)
    const request = store.get(projectId)
    request.onsuccess = () => {
      const cached = request.result as CachedSetoutProjectPlan | undefined
      store.put(update(cached?.schemaVersion === 1 && cached.projectId === projectId
        ? cached
        : emptyProjectPlan(projectId)))
    }
    request.onerror = () => tx.abort()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? request.error)
    tx.onabort = () => reject(tx.error ?? request.error ?? new Error('Could not update the offline set-out plan'))
  }))
}

export async function cacheSetoutDefinitionList(
  projectId: string,
  definitions: FieldSetoutDefinition[],
  register: FieldSetoutRegisterEntry[],
  cachedAt = new Date().toISOString()
): Promise<void> {
  await writeProjectPlan(projectId, (current) => ({
    ...current,
    definitionList: { definitions, register, cachedAt },
  }))
}

export async function cacheSetoutDefinitionPlan(
  projectId: string,
  definitionId: string,
  points: FieldSetoutPoint[],
  register: FieldSetoutRegisterEntry[],
  cachedAt = new Date().toISOString()
): Promise<void> {
  await writeProjectPlan(projectId, (current) => ({
    ...current,
    definitionPlans: {
      ...current.definitionPlans,
      [definitionId]: { points, register, cachedAt },
    },
  }))
}

export async function getCachedSetoutProjectPlan(
  projectId: string
): Promise<CachedSetoutProjectPlan | null> {
  if (!isBrowser()) return null
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(PLAN_STORE, 'readonly').objectStore(PLAN_STORE).get(projectId)
    request.onsuccess = () => {
      const cached = request.result as CachedSetoutProjectPlan | undefined
      resolve(cached?.schemaVersion === 1 && cached.projectId === projectId ? cached : null)
    }
    request.onerror = () => reject(request.error)
  })
}

function isBrowser(): boolean {
  return typeof indexedDB !== 'undefined';
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `shot_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveShotLocally(shot: Omit<QueuedSetoutShot, 'id' | 'capturedAt' | 'synced'>): Promise<QueuedSetoutShot> {
  if (!isBrowser()) throw new Error('Shot queue is only available in the browser');
  const record: QueuedSetoutShot = {
    ...shot,
    id: newId(),
    capturedAt: new Date().toISOString(),
    synced: false,
    syncStatus: 'queued',
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SHOT_STORE, 'readwrite');
    tx.objectStore(SHOT_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return record;
}

/** List unsynced shots; project lookups use the IndexedDB compound index. */
export async function listQueuedShots(projectId?: string): Promise<QueuedSetoutShot[]> {
  if (!isBrowser()) return [];
  const db = await openDb();
  const store = db.transaction(SHOT_STORE, 'readonly').objectStore(SHOT_STORE);
  if (projectId) {
    const index = store.index('by-project-status');
    const read = (status: 'queued' | 'rejected') => new Promise<QueuedSetoutShot[]>((resolve, reject) => {
      const request = index.getAll([projectId, status]);
      request.onsuccess = () => resolve((request.result as QueuedSetoutShot[]) ?? []);
      request.onerror = () => reject(request.error);
    });
    const [queued, rejected] = await Promise.all([read('queued'), read('rejected')]);
    return [...queued, ...rejected];
  }
  const all = await new Promise<QueuedSetoutShot[]>((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as QueuedSetoutShot[]) ?? []);
    request.onerror = () => reject(request.error);
  });
  return all.filter((shot) => !shot.synced);
}

/**
 * Deliver a shot to the server and mark the device copy synced on success.
 * Returns the server response when delivered, or `delivered: false` with the
 * reason when the shot has to wait for signal.
 */
export interface ShotDeliveryResult {
  delivered: boolean;
  reason?: string;
  result?: unknown;
  retryable?: boolean;
}

export function buildSetoutObservationPayload(shot: QueuedSetoutShot) {
  return {
    action: 'record_observation' as const,
    clientShotId: shot.id,
    definitionId: shot.definitionId,
    label: shot.label,
    observedEasting: shot.observedEasting,
    observedNorthing: shot.observedNorthing,
    observedRL: shot.observedRL,
    accuracyM: shot.accuracyM,
    designEasting: shot.designEasting,
    designNorthing: shot.designNorthing,
    designRL: shot.designRL,
    designRevision: shot.designRevision,
    capturedAt: shot.capturedAt,
    capturedCrs: shot.capturedCrs,
    notes: `Field shot captured ${shot.capturedAt} (${shot.result})`,
  };
}

export async function deliverShot(
  shot: QueuedSetoutShot
): Promise<ShotDeliveryResult> {
  let res: Response;
  try {
    res = await fetch(`/api/project/${shot.projectId}/setout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSetoutObservationPayload(shot)),
    });
  } catch (error) {
    await markShot(shot.id, {
      synced: false,
      syncStatus: 'queued',
      syncError: error instanceof Error ? error.message : 'offline',
    }).catch(() => {});
    return { delivered: false, retryable: true, reason: 'No connection — the shot is stored on this device' };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const rejected = [400, 404, 409, 422].includes(res.status);
    await markShot(shot.id, {
      synced: false,
      syncStatus: rejected ? 'rejected' : 'queued',
      syncError: body.error ?? `HTTP ${res.status}`,
    }).catch(() => {});
    // Design conflicts and invalid/unknown targets require review. Auth and
    // server failures remain retryable after the user restores the session.
    if (rejected) {
      return { delivered: false, retryable: false, reason: body.error ?? `Rejected (${res.status}) — needs review` };
    }
    return { delivered: false, retryable: true, reason: body.error ?? `Server unavailable (${res.status})` };
  }

  const json = (await res.json().catch(() => ({}))) as { data?: unknown };
  try {
    await markShot(shot.id, { synced: true, syncStatus: 'synced', syncError: null });
  } catch {
    // The server acknowledged this shot but the local sync marker could not be
    // updated. Keep it queued and replay the same idempotency key next time.
    return {
      delivered: false,
      retryable: true,
      reason: 'Server accepted the shot, but this device could not update its sync marker; it will safely reconcile on retry.',
    };
  }
  return { delivered: true, result: json.data };
}

/** Flush every unsynced shot for a project (called when the app regains signal). */
export async function flushQueuedShots(
  projectId: string
): Promise<{ delivered: number; queued: number }> {
  const pending = (await listQueuedShots(projectId)).filter((s) => !s.synced && s.syncStatus !== 'rejected');
  let delivered = 0;
  let queued = 0;
  for (const shot of pending) {
    const result = await deliverShot(shot);
    if (result.delivered) delivered += 1;
    else queued += 1;
  }
  return { delivered, queued };
}

/** Shots still waiting for signal, for an honest "not yet synced" indicator. */
export async function pendingShotCount(projectId?: string): Promise<number> {
  const shots = await listQueuedShots(projectId);
  return shots.length;
}

/** Permanently rejected shots remain local and require review before a new capture. */
export async function rejectedShotCount(projectId?: string): Promise<number> {
  const shots = await listQueuedShots(projectId);
  return shots.filter((s) => !s.synced && s.syncStatus === 'rejected').length;
}

async function markShot(
  id: string,
  patch: Partial<QueuedSetoutShot>
): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const existing = await new Promise<QueuedSetoutShot | undefined>((resolve, reject) => {
    const request = db.transaction(SHOT_STORE, 'readonly').objectStore(SHOT_STORE).get(id);
    request.onsuccess = () => resolve(request.result as QueuedSetoutShot | undefined);
    request.onerror = () => reject(request.error);
  });
  if (!existing) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SHOT_STORE, 'readwrite');
    tx.objectStore(SHOT_STORE).put({ ...existing, ...patch });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
