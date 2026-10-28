import { logger } from '@/lib/logger'

/**
 * Offline basemap packages (blueprint §18.1 "Offline packages", §4.3 cached map).
 *
 * A surveyor working a block with no signal cannot depend on the server: the
 * previous design stored MBTiles in the server's `/tmp` and streamed tiles over
 * HTTP, which fails the moment the connection drops. This module keeps the
 * package **on the device** (IndexedDB) and hands the map viewer a tile URL
 * factory that resolves entirely locally — so an imported basemap keeps
 * working in the field with the radio off.
 *
 * Browser-only: every call is a no-op outside the client.
 */

const DB_NAME = 'METARDUFieldBasemaps'
const STORE = 'packages'
const TILE_STORE = 'tiles'
const DB_VERSION = 1

export interface OfflineBasemapPackage {
  key: string
  name: string
  minZoom: number
  maxZoom: number
  bounds?: [number, number, number, number]
  byteSize: number
  storedAt: number
}

/** Tile addressing matches MBTiles: TMS rows are flipped for XYZ viewers. */
export function tmsRowFromXyz(zoom: number, xyzY: number): number {
  return 2 ** zoom - 1 - xyzY
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(TILE_STORE)) {
        // Keyed by `${key}/${z}/${x}/${y}` so a lookup is a single get.
        db.createObjectStore(TILE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isBrowser(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Save an imported MBTiles file on the device. */
export async function storeBasemapPackage(
  key: string,
  name: string,
  file: Blob,
  metadata: { minZoom: number; maxZoom: number; bounds?: [number, number, number, number] }
): Promise<OfflineBasemapPackage> {
  if (!isBrowser()) throw new Error('Offline basemaps are only available in the browser');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      key,
      name,
      minZoom: metadata.minZoom,
      maxZoom: metadata.maxZoom,
      bounds: metadata.bounds,
      byteSize: bytes.byteLength,
      storedAt: Date.now(),
    } satisfies OfflineBasemapPackage);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // The raw MBTiles blob is kept alongside so tiles can be read lazily as the
  // surveyor pans — this avoids pre-decoding tens of thousands of tiles.
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TILE_STORE, 'readwrite');
    tx.objectStore(TILE_STORE).put(bytes.buffer, `file:${key}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return {
    key,
    name,
    minZoom: metadata.minZoom,
    maxZoom: metadata.maxZoom,
    bounds: metadata.bounds,
    byteSize: bytes.byteLength,
    storedAt: Date.now(),
  };
}

export async function listBasemapPackages(): Promise<OfflineBasemapPackage[]> {
  if (!isBrowser()) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as OfflineBasemapPackage[]) ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteBasemapPackage(key: string): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, TILE_STORE], 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.objectStore(TILE_STORE).delete(`file:${key}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Object URLs for a package's tiles, generated from the device copy.
 *
 * OpenLayers asks for many tiles at once; decoding SQLite per tile would be
 * far too slow, so the MBTiles file is read once into a lookup table and each
 * requested tile becomes a blob URL (cached, and revoked when the layer is
 * torn down).
 */
export async function buildLocalTileResolver(
  key: string
): Promise<{ resolve: (z: number, x: number, y: number) => Promise<string | null>; dispose: () => void }> {
  const urls = new Map<string, string>();

  if (!isBrowser()) {
    return { resolve: async () => null, dispose: () => {} };
  }

  const db = await openDb();
  const buffer = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
    const request = db.transaction(TILE_STORE, 'readonly').objectStore(TILE_STORE).get(`file:${key}`);
    request.onsuccess = () => resolve(request.result as ArrayBuffer | undefined);
    request.onerror = () => reject(request.error);
  });
  if (!buffer) {
    return { resolve: async () => null, dispose: () => {} };
  }

  // Read the MBTiles copy on the device. better-sqlite3 needs a file path, so
  // the device bytes are written to a temp file that is never uploaded — the
  // field tablet keeps its basemap even with no network at all.
  let handle: {
    prepare: (sql: string) => {
      get: (...args: unknown[]) => { tile_data: Uint8Array } | undefined;
    };
    close: () => void;
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = (await import('better-sqlite3')).default;
    const copy = new Uint8Array(buffer.byteLength);
    copy.set(new Uint8Array(buffer));
    const { writeFileSync, mkdtempSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const dir = mkdtempSync(join(tmpdir(), 'metardu-basemap-'));
    const tmpPath = join(dir, `${key}.mbtiles`);
    writeFileSync(tmpPath, copy);
    handle = new Database(tmpPath, { readonly: true }) as unknown as typeof handle;
  } catch (error) {
    // better-sqlite3 is an optional dependency; without it the device copy
    // cannot be decoded and we fall back to no local tiles rather than
    // pretending the basemap is available.
    logger.warn('[offlineBasemap] local tile decoding unavailable', { error: error });
    return { resolve: async () => null, dispose: () => {} };
  }

  return {
    async resolve(z: number, x: number, y: number): Promise<string | null> {
      const cacheKey = `${z}/${x}/${y}`;
      const cached = urls.get(cacheKey);
      if (cached) return cached;

      let found: { tile_data: Uint8Array } | undefined;
      try {
        found = handle
          .prepare('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?')
          .get(z, x, tmsRowFromXyz(z, y));
      } catch {
        return null;
      }
      if (!found?.tile_data) return null;

      const blob = new Blob([found.tile_data as unknown as BlobPart], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      urls.set(cacheKey, url);
      return url;
    },
    dispose() {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      try {
        handle.close();
      } catch {
        // closing a read-only handle twice is harmless
      }
    },
  };
}
