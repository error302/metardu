import { useState, useEffect, useCallback } from 'react'
import type { MapExtent } from '@/app/map/MapReactContext'
import { logger } from '@/lib/logger'

interface TileCacheStats {
  cached: number
  total: number
  size: number
}

interface BoundingBox {
  north: number
  south: number
  east: number
  west: number
}

const DEFAULT_ZOOM_RANGE = [1, 18]
const MAX_OFFLINE_ZOOM = 20
const MAX_MERCATOR_LATITUDE = 85.0511287798066

export interface CachedTileSourceMetadata {
  sourceId: string
  label: string
  urlTemplate: string
  attribution: string
  minZoom: number
  maxZoom: number
  storedAt: number
}

/** Stable local identifier: separate providers that reuse the same label. */
export function getTileSourceId(urlTemplate: string): string {
  const identity = urlTemplate.trim()
  let hash = 2166136261
  for (let index = 0; index < identity.length; index++) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619)
  }
  return `custom-${(hash >>> 0).toString(36)}`
}

/** Expand the XYZ placeholders identically during download and map rendering. */
export function expandXyzTileUrl(urlTemplate: string, z: number, x: number, y: number): string {
  const subdomain = ['a', 'b', 'c'][Math.abs(x + y) % 3]
  return urlTemplate
    .replace(/\{z\}/gi, String(z))
    .replace(/\{x\}/gi, String(x))
    .replace(/\{y\}/gi, String(y))
    .replace(/\{s\}/gi, subdomain)
}

function validateGeographicBounds(bounds: BoundingBox | MapExtent): void {
  const { north, south, east, west } = 'north' in bounds
    ? bounds
    : { north: bounds.maxLat, south: bounds.minLat, east: bounds.maxLon, west: bounds.minLon }

  if (![north, south, east, west].every(Number.isFinite)) {
    throw new RangeError('Map bounds must contain finite latitude and longitude values.')
  }
  if (south < -90 || north > 90 || south >= north) {
    throw new RangeError('Latitude bounds must be ordered within -90° to 90°.')
  }
  if (west < -180 || east > 180 || west >= east) {
    throw new RangeError('Longitude bounds must be ordered within -180° to 180°. Split areas that cross the date line.')
  }
}

function validateZoomRange(minZoom: number, maxZoom: number): void {
  if (
    !Number.isInteger(minZoom) || !Number.isInteger(maxZoom) ||
    minZoom < 0 || maxZoom > MAX_OFFLINE_ZOOM || minZoom > maxZoom
  ) {
    throw new RangeError(`Zoom levels must be whole numbers from 0 to ${MAX_OFFLINE_ZOOM}, with minimum no greater than maximum.`)
  }
}

/**
 * Public tile hosts that METARDU must not bulk-download through its generic
 * XYZ offline packer. Ordinary interactive map viewing continues to request
 * provider tiles directly and honor their normal HTTP cache headers.
 */
export function getOfflineTileSourceRestriction(urlTemplate: string): string | null {
  const concreteUrl = urlTemplate
    .trim()
    .replace(/\{s\}/gi, 'a')
    .replace(/\{z\}/gi, '0')
    .replace(/\{x\}/gi, '0')
    .replace(/\{y\}/gi, '0')

  let parsedUrl: URL
  try {
    parsedUrl = new URL(concreteUrl)
  } catch {
    return 'Enter a valid XYZ tile URL before downloading tiles.'
  }

  const hostname = parsedUrl.hostname.toLowerCase()

  if (hostname === 'tile.openstreetmap.org' || hostname.endsWith('.tile.openstreetmap.org')) {
    return 'OpenStreetMap’s public tile service does not allow bulk or offline downloads. Choose a licensed provider or self-hosted tile source.'
  }

  if (hostname === 'arcgisonline.com' || hostname.endsWith('.arcgisonline.com')) {
    return 'METARDU blocks direct bulk downloads from Esri’s public tile hosts. Use a licensed XYZ source or a self-hosted tile service; this downloader does not import Esri offline packages.'
  }

  return null
}

export function useTileCache() {
  const [isOnline, setIsOnline] = useState(true)
  const [cacheStats, setCacheStats] = useState<TileCacheStats>({
    cached: 0,
    total: 0,
    size: 0
  })

  useEffect(() => {
    setIsOnline(navigator.onLine)
    
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const getTileIndexDB = useCallback(async () => {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('METARDUTileCache', 1)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('tiles')) {
          db.createObjectStore('tiles', { keyPath: 'url' })
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' })
        }
      }
    })
  }, [])

  const cacheTile = useCallback(async (url: string, blob: Blob) => {
    try {
      const db = await getTileIndexDB()
      const tx = db.transaction('tiles', 'readwrite')
      const store = tx.objectStore('tiles')
      
      await new Promise((resolve, reject) => {
        const request = store.put({ url, blob, timestamp: Date.now() })
        request.onsuccess = resolve
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      logger.error('Failed to cache tile:', { error: error })
    }
  }, [getTileIndexDB])

  const getCachedTile = useCallback(async (url: string): Promise<Blob | null> => {
    try {
      const db = await getTileIndexDB()
      const tx = db.transaction('tiles', 'readonly')
      const store = tx.objectStore('tiles')
      
      return new Promise((resolve) => {
        const request = store.get(url)
        request.onsuccess = () => {
          if (request.result) {
            resolve((request.result as { blob: Blob }).blob)
          } else {
            resolve(null)
          }
        }
        request.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  }, [getTileIndexDB])

  const getTileUrl = useCallback((server: string, z: number, x: number, y: number): string => {
    return server
      .replace('{z}', z.toString())
      .replace('{x}', x.toString())
      .replace('{y}', y.toString())
  }, [])

  const preCacheArea = useCallback(async (
    bounds: BoundingBox,
    zoomRange: number[] = DEFAULT_ZOOM_RANGE,
    tileServers: string[] = [],
  ) => {
    if (!isOnline) return

    const restriction = tileServers
      .map(getOfflineTileSourceRestriction)
      .find((message): message is string => message !== null)
    if (restriction) throw new Error(restriction)
    
    const cached: string[] = []

    validateGeographicBounds(bounds)
    validateZoomRange(zoomRange[0], zoomRange[zoomRange.length - 1])

    for (let z = zoomRange[0]; z <= zoomRange[1]; z++) {
      const { minX, maxX, minY, maxY } = calculateTileBounds(
        bounds.north,
        bounds.south,
        bounds.east,
        bounds.west,
        z,
      )

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          for (const server of tileServers) {
            const url = getTileUrl(server, z, x, y)
            
            const existing = await getCachedTile(url)
            if (!existing) {
              try {
                const response = await fetch(url, { mode: 'cors' })
                if (response.ok) {
                  const blob = await response.blob()
                  await cacheTile(url, blob)
                  cached.push(url)
                }
              } catch {
                // Skip failed tiles
              }
            }
          }
        }
      }
    }
    
    return cached.length
  }, [isOnline, getTileUrl, getCachedTile, cacheTile])

  const clearCache = useCallback(async () => {
    try {
      const db = await getTileIndexDB()
      const tx = db.transaction('tiles', 'readwrite')
      const store = tx.objectStore('tiles')
      
      await new Promise((resolve, reject) => {
        const request = store.clear()
        request.onsuccess = resolve
        request.onerror = () => reject(request.error)
      })
      
      setCacheStats({ cached: 0, total: 0, size: 0 })
    } catch (error) {
      logger.error('Failed to clear cache:', { error: error })
    }
  }, [getTileIndexDB])

  const getCacheSize = useCallback(async () => {
    try {
      const db = await getTileIndexDB()
      const tx = db.transaction('tiles', 'readonly')
      const store = tx.objectStore('tiles')
      
      return new Promise((resolve) => {
        const request = store.count()
        request.onsuccess = () => {
          setCacheStats(prev => ({ ...prev, cached: request.result }))
          resolve(request.result)
        }
        request.onerror = () => resolve(0)
      })
    } catch {
      return 0
    }
  }, [getTileIndexDB])

  useEffect(() => {
    getCacheSize()
  }, [getCacheSize])

  return {
    isOnline,
    cacheStats,
    preCacheArea,
    clearCache,
    getCacheSize,
    getCachedTile,
    cacheTile
  }
}

export function calculateTileBounds(
  north: number,
  south: number,
  east: number,
  west: number,
  zoom: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  validateGeographicBounds({ north, south, east, west })
  validateZoomRange(zoom, zoom)

  const tileCount = 2 ** zoom
  const toX = (longitude: number) => Math.min(
    tileCount - 1,
    Math.max(0, Math.floor((longitude + 180) / 360 * tileCount)),
  )
  const toY = (latitude: number) => {
    const clampedLatitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude))
    const latitudeRadians = clampedLatitude * Math.PI / 180
    const mercatorY = (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2
    return Math.min(tileCount - 1, Math.max(0, Math.floor(mercatorY * tileCount)))
  }

  const minX = toX(west)
  const maxX = toX(east)
  const minY = toY(north)
  const maxY = toY(south)

  return { minX, maxX, minY, maxY }
}

/** Count the total tiles for a bounding box across a zoom range.
 *  Accepts the shared MapExtent shape (minLat, maxLat, minLon, maxLon). */
export function calculateTileCount(
  bounds: MapExtent,
  minZoom: number,
  maxZoom: number
): { total: number } {
  validateGeographicBounds(bounds)
  validateZoomRange(minZoom, maxZoom)

  let total = 0
  for (let z = minZoom; z <= maxZoom; z++) {
    const tileBounds = calculateTileBounds(bounds.maxLat, bounds.minLat, bounds.maxLon, bounds.minLon, z)
    total += (tileBounds.maxX - tileBounds.minX + 1) * (tileBounds.maxY - tileBounds.minY + 1)
  }
  return { total }
}

/** Estimate storage in bytes for a given number of tiles.
 *  The second argument is the source type (string), used to vary average tile size. */
export function estimateStorageSize(tileCount: number, sourceType?: string): number {
  const avgTileBytes = sourceType === 'satellite' ? 40000 : 15000
  return tileCount * avgTileBytes
}

/** Download progress callback type — matches what the UI component expects */
export interface DownloadProgress {
  total: number
  downloaded: number
  skipped: number
  failed: number
  bytesDownloaded: number
  currentZoom: number
  percent: number
}

/** Download tiles for a bounding box range.
 *  Accepts the shared MapExtent shape (minLat, maxLat, minLon, maxLon).
 *  Returns a DownloadProgress-shaped result so callers can feed it directly to setState.
 *
 *  Real implementation: fetches tiles from the tile server, stores as blobs in IndexedDB.
 */
export async function downloadTilesForBounds(
  sourceId: string,
  url: string,
  bounds: MapExtent,
  minZoom: number,
  maxZoom: number,
  _type: string,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
  sourceMetadata?: Omit<CachedTileSourceMetadata, 'sourceId' | 'storedAt'>,
): Promise<DownloadProgress> {
  const restriction = getOfflineTileSourceRestriction(url)
  if (restriction) throw new Error(restriction)

  validateGeographicBounds(bounds)
  validateZoomRange(minZoom, maxZoom)
  const { total } = calculateTileCount(bounds, minZoom, maxZoom)
  let downloaded = 0
  let skipped = 0
  let failed = 0
  let bytesDownloaded = 0
  let metadataStored = false

  // Open IndexedDB
  let db: IDBDatabase
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('METARDUTileCache', 1)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = (event) => {
        const d = (event.target as IDBOpenDBRequest).result
        if (!d.objectStoreNames.contains('tiles')) d.createObjectStore('tiles', { keyPath: 'url' })
        if (!d.objectStoreNames.contains('metadata')) d.createObjectStore('metadata', { keyPath: 'key' })
      }
    })
  } catch {
    return { total, downloaded: 0, skipped: 0, failed: total, bytesDownloaded: 0, currentZoom: minZoom, percent: 0 }
  }

  // Helper: cache a tile
  const cacheTile = async (tileUrl: string, blob: Blob) => {
    return new Promise<void>((resolve) => {
      const tx = db.transaction('tiles', 'readwrite')
      const store = tx.objectStore('tiles')
      const req = store.put({ url: tileUrl, blob, timestamp: Date.now(), sourceId })
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
    })
  }

  // Helper: check if tile is already cached
  const getCachedTile = async (tileUrl: string): Promise<{ blob: Blob; sourceId?: string } | null> => {
    return new Promise((resolve) => {
      const tx = db.transaction('tiles', 'readonly')
      const store = tx.objectStore('tiles')
      const req = store.get(tileUrl)
      req.onsuccess = () => resolve((req.result as { blob: Blob; sourceId?: string } | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
  }

  const storeSourceMetadata = async () => {
    if (metadataStored) return
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('metadata', 'readwrite')
      tx.objectStore('metadata').put({
        key: `source:${sourceId}`,
        sourceId,
        label: sourceMetadata?.label || sourceId,
        urlTemplate: sourceMetadata?.urlTemplate || url,
        attribution: sourceMetadata?.attribution || '',
        minZoom,
        maxZoom,
        storedAt: Date.now(),
      } satisfies CachedTileSourceMetadata & { key: string })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    metadataStored = true
  }

  for (let z = minZoom; z <= maxZoom; z++) {
    const tileBounds = calculateTileBounds(bounds.maxLat, bounds.minLat, bounds.maxLon, bounds.minLon, z)

    for (let x = tileBounds.minX; x <= tileBounds.maxX; x++) {
      for (let y = tileBounds.minY; y <= tileBounds.maxY; y++) {
        if (signal?.aborted) {
          if (downloaded + skipped > 0) await storeSourceMetadata().catch(() => undefined)
          return { total, downloaded, skipped, failed, bytesDownloaded, currentZoom: z, percent: Math.round(((downloaded + skipped) / total) * 100) }
        }

        const tileUrl = expandXyzTileUrl(url, z, x, y)

        // Check cache first
        const cachedTile = await getCachedTile(tileUrl)
        if (cachedTile) {
          skipped++
          // Adopt tiles from the earlier label-based cache IDs into the stable
          // URL-based source package so existing downloads remain selectable.
          if (cachedTile.sourceId !== sourceId) await cacheTile(tileUrl, cachedTile.blob)
          await storeSourceMetadata()
        } else {
          try {
            const response = await fetch(tileUrl, { mode: 'cors', signal })
            if (response.ok) {
              const blob = await response.blob()
              await cacheTile(tileUrl, blob)
              bytesDownloaded += blob.size
              downloaded++
              await storeSourceMetadata()
            } else {
              failed++
            }
          } catch {
            failed++
          }
        }

        // Report progress every 10 tiles
        if ((downloaded + skipped + failed) % 10 === 0) {
          onProgress({
            total,
            downloaded,
            skipped,
            failed,
            bytesDownloaded,
            currentZoom: z,
            percent: Math.round(((downloaded + skipped) / total) * 100),
          })
        }
      }
    }
  }

  const finalProgress: DownloadProgress = {
    total,
    downloaded,
    skipped,
    failed,
    bytesDownloaded,
    currentZoom: maxZoom,
    percent: Math.round(((downloaded + skipped) / total) * 100),
  }
  onProgress(finalProgress)
  return finalProgress
}

/** Information about a cached tile source — matches what the UI manager expects */
export interface CachedSourceInfo {
  sourceId: string
  label: string
  urlTemplate?: string
  attribution?: string
  minZoom?: number
  maxZoom?: number
  stats: {
    count: number
    sizeBytes: number
    newestTimestamp: number
  }
}

/** List all cached tile sources by scanning IndexedDB */
export async function listCachedSources(): Promise<CachedSourceInfo[]> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('METARDUTileCache', 1)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = (event) => {
        const d = (event.target as IDBOpenDBRequest).result
        if (!d.objectStoreNames.contains('tiles')) d.createObjectStore('tiles', { keyPath: 'url' })
        if (!d.objectStoreNames.contains('metadata')) d.createObjectStore('metadata', { keyPath: 'key' })
      }
    })

    return new Promise<CachedSourceInfo[]>((resolve) => {
      const tx = db.transaction(['tiles', 'metadata'], 'readonly')
      const tileRequest = tx.objectStore('tiles').getAll()
      const metadataRequest = tx.objectStore('metadata').getAll()
      let tiles: Array<{ url: string; blob: Blob; timestamp: number; sourceId?: string }> = []
      let sourceMetadata: Array<CachedTileSourceMetadata & { key: string }> = []

      tileRequest.onsuccess = () => {
        tiles = tileRequest.result as typeof tiles
      }
      metadataRequest.onsuccess = () => {
        sourceMetadata = (metadataRequest.result as Array<CachedTileSourceMetadata & { key: string }>)
          .filter((entry) => typeof entry.sourceId === 'string' && entry.key === `source:${entry.sourceId}`)
      }
      tx.oncomplete = () => {
        const sourceMap = new Map<string, { count: number; sizeBytes: number; newestTimestamp: number }>()

        for (const tile of tiles) {
          const sid = tile.sourceId || 'unknown'
          const existing = sourceMap.get(sid) || { count: 0, sizeBytes: 0, newestTimestamp: 0 }
          existing.count++
          existing.sizeBytes += tile.blob?.size || 0
          existing.newestTimestamp = Math.max(existing.newestTimestamp, tile.timestamp || 0)
          sourceMap.set(sid, existing)
        }

        const metadataById = new Map(sourceMetadata.map((entry) => [entry.sourceId, entry]))
        resolve(Array.from(sourceMap.entries()).map(([sourceId, stats]) => {
          const metadata = metadataById.get(sourceId)
          return {
            sourceId,
            label: metadata?.label || sourceId,
            urlTemplate: metadata?.urlTemplate,
            attribution: metadata?.attribution,
            minZoom: metadata?.minZoom,
            maxZoom: metadata?.maxZoom,
            stats,
          }
        }))
      }
      tx.onerror = () => resolve([])
      tx.onabort = () => resolve([])
    })
  } catch {
    return []
  }
}

/** Delete cached tiles for a specific source */
export async function deleteCachedTiles(sourceId: string): Promise<void> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('METARDUTileCache', 1)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
    })

    const tx = db.transaction(['tiles', 'metadata'], 'readwrite')
    const store = tx.objectStore('tiles')
    tx.objectStore('metadata').delete(`source:${sourceId}`)
    const cursorReq = store.openCursor()

    await new Promise<void>((resolve) => {
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor) {
          if ((cursor.value as { sourceId: string }).sourceId === sourceId) {
            cursor.delete()
          }
          cursor.continue()
        }
      }
      cursorReq.onerror = () => resolve()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch {
    // ignore
  }
}

/** Clear all tile cache */
export async function clearAllTileCache(): Promise<void> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('METARDUTileCache', 1)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
    })

    const tx = db.transaction(['tiles', 'metadata'], 'readwrite')
    const store = tx.objectStore('tiles')
    const metadataStore = tx.objectStore('metadata')

    await new Promise<void>((resolve) => {
      store.clear()
      metadataStore.clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch {
    // ignore
  }
}

/** Get a cached tile blob by URL — used by custom tileLoadFunction for offline basemaps */
export async function getCachedTileBlob(url: string): Promise<Blob | null> {
  try {
    const { getCachedTileBlob: readBlob } = await import('./tileCacheStore')
    return await readBlob(url)
  } catch {
    return null
  }
}
