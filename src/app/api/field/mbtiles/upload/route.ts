/**
 * POST /api/field/mbtiles/upload
 *
 * Store a raster MBTiles package on the authenticated account and return the
 * session metadata used by the OpenLayers viewer.
 *
 * This endpoint supports server storage. The field map reads tile images from
 * the authenticated tile route, so its imported packages require a connection.
 * Device-only MBTiles storage must be implemented by a browser SQLite reader
 * and a local OpenLayers tile source; this route cannot provide that behavior.
 */

import { NextResponse } from 'next/server'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { randomUUID } from 'crypto'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 512 * 1024 * 1024 // 512 MB — a ward-scale offline package
// Docker mounts this directory as persistent, writable `/app/upload` for the
// non-root runtime user.
const UPLOAD_DIR = path.join(process.cwd(), 'upload', 'mbtiles')

interface Metadata {
  minZoom: number
  maxZoom: number
  format: 'png' | 'jpg' | 'jpeg' | 'webp'
  bounds?: [number, number, number, number]
}

/** Read and validate the metadata this raster OpenLayers layer can display. */
async function readMetadata(filePath: string): Promise<Metadata> {
  const Database = (await import('better-sqlite3')).default
  const handle = new Database(filePath, { readonly: true })
  try {
    const zoomRow = handle
      .prepare('SELECT MIN(zoom_level) AS min_zoom, MAX(zoom_level) AS max_zoom FROM tiles')
      .get() as { min_zoom: number | null; max_zoom: number | null }
    const formatRow = handle
      .prepare("SELECT value FROM metadata WHERE name='format'")
      .get() as { value?: string } | undefined

    const minZoom = zoomRow?.min_zoom
    const maxZoom = zoomRow?.max_zoom
    if (
      typeof minZoom !== 'number' || !Number.isInteger(minZoom) || minZoom < 0 || minZoom > 24 ||
      typeof maxZoom !== 'number' || !Number.isInteger(maxZoom) || maxZoom < minZoom || maxZoom > 24
    ) {
      throw new Error('The MBTiles archive has no valid tile zoom range.')
    }

    const format = formatRow?.value?.toLowerCase()
    if (!format || !['png', 'jpg', 'jpeg', 'webp'].includes(format)) {
      throw new Error('The field map currently supports raster PNG, JPEG, and WebP MBTiles only.')
    }

    const boundsRow = handle
      .prepare("SELECT value FROM metadata WHERE name='bounds'")
      .get() as { value?: string } | undefined
    const boundsValues = boundsRow?.value?.split(',').map(Number)
    const bounds = boundsValues?.length === 4 && boundsValues.every(Number.isFinite)
      ? boundsValues as [number, number, number, number]
      : undefined

    return { minZoom, maxZoom, format: format as Metadata['format'], bounds }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Could not read MBTiles metadata.')
  } finally {
    handle.close()
  }
}

export const POST = apiHandler(
  { auth: true, rawBody: true, rateLimit: { max: 6, windowMs: 60_000 } },
  async (req, ctx) => {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    const projectIdRaw = form?.get('projectId')
    const storageRaw = form?.get('storage')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'An MBTiles file is required' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'The file is empty' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Offline package too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` },
        { status: 413 }
      )
    }

    if (storageRaw !== null && storageRaw !== 'server') {
      return NextResponse.json(
        { error: 'This import flow currently supports server-hosted MBTiles only. Device-offline packages are not available yet.' },
        { status: 400, headers: { 'Cache-Control': 'private, no-store' } }
      )
    }

    const key = randomUUID()
    const storage = 'server' as const
    const name = file.name?.replace(/\.mbtiles$/i, '') || `basemap-${key.slice(0, 8)}`

    await mkdir(UPLOAD_DIR, { recursive: true })
    const target = path.join(UPLOAD_DIR, `${key}.mbtiles`)
    const temporary = `${target}.uploading`
    try {
      // Stream large packages to disk instead of making a second 512 MB
      // in-memory copy of the uploaded file.
      await pipeline(
        Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>),
        createWriteStream(temporary, { flags: 'wx' })
      )
      await rename(temporary, target)
    } catch (error) {
      await unlink(temporary).catch(() => undefined)
      throw error
    }
    let metadata: Metadata
    let byteSize: number
    try {
      metadata = await readMetadata(target)
      byteSize = (await stat(target)).size
    } catch (error) {
      logger.warn('[field/mbtiles] rejected unreadable or unsupported package', { error })
      await unlink(target).catch(() => undefined)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'The MBTiles package is invalid or unsupported.' },
        { status: 422, headers: { 'Cache-Control': 'private, no-store' } }
      )
    }

    // Record the package so the field app can list what is cached where.
    let registered = false
    try {
      await db.query<never>(
        `INSERT INTO field_basemaps
           (user_id, project_id, name, storage, byte_size, min_zoom, max_zoom, bounds, storage_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          ctx.userId,
          typeof projectIdRaw === 'string' && projectIdRaw ? projectIdRaw : null,
          name,
          storage,
          byteSize,
          metadata.minZoom,
          metadata.maxZoom,
          metadata.bounds ? JSON.stringify(metadata.bounds) : null,
          key,
        ]
      )
      registered = true
    } catch (error) {
      logger.error('[field/mbtiles] could not record package', { error })
      // Server-hosted packages must have an owner record before they can be
      // read. Remove the file if that security record cannot be created.
      await unlink(target).catch(() => undefined)
      return NextResponse.json(
        { error: 'Could not safely register this map package. Please retry.' },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
      )
    }

    return NextResponse.json({
      data: {
        key,
        name,
        storage,
        minZoom: metadata.minZoom,
        maxZoom: metadata.maxZoom,
        bounds: metadata.bounds,
        byteSize,
        registered,
        hint: 'This map package is stored on METARDU and requires an internet connection to display.',
      },
    })
  }
)
