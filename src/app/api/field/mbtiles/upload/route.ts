/**
 * /api/field/mbtiles/upload
 *
 * POST — Accept an .mbtiles file upload, store it on disk, and return
 * a session descriptor that the field map page can use to request
 * tiles via /api/field/mbtiles/tiles/[key]/[z]/[x]/[y].
 *
 * AUDIT FIX (2026-07-03): The mbtiles helper (src/lib/field/mbtiles.ts)
 * POSTed to this endpoint but no route existed. Uploading offline
 * basemaps on /field/map failed silently.
 *
 * Body (multipart/form-data):
 *   file: File (.mbtiles, max 500 MB)
 *
 * Response (200): MBTilesSession
 *   { key, name, minZoom, maxZoom, bounds }
 *
 * Storage:
 *   Files are written to ${MBTILES_DIR}/<key>.mbtiles
 *   MBTILES_DIR defaults to /data/mbtiles (set via env var).
 *
 * Bounds + zoom levels are extracted from the metadata table inside
 * the .mbtiles file (SQLite). If sqlite3 isn't available or the file
 * is malformed, we fall back to sane defaults (zoom 0-14, world
 * bounds) so the upload still succeeds.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { apiHandler } from '@/lib/apiHandler'

const MAX_BYTES = 500 * 1024 * 1024 // 500 MB
const MBTILES_DIR = process.env.MBTILES_DIR || '/data/mbtiles'

export const POST = apiHandler(
  { auth: true, rateLimit: { max: 20, windowMs: 60000 } },
  async (req: NextRequest, _ctx) => {
    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file uploaded', code: 'NO_FILE' },
        { status: 400 },
      )
    }

    if (!file.name.toLowerCase().endsWith('.mbtiles')) {
      return NextResponse.json(
        { error: 'File must be an .mbtiles SQLite database', code: 'WRONG_TYPE' },
        { status: 400 },
      )
    }

    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File size must be between 1 byte and ${MAX_BYTES / 1024 / 1024}MB`, code: 'BAD_SIZE' },
        { status: 413 },
      )
    }

    // ── Persist file to disk ────────────────────────────────────────────────
    const key = randomUUID()
    await fs.mkdir(MBTILES_DIR, { recursive: true })
    const destPath = path.join(MBTILES_DIR, `${key}.mbtiles`)
    const bytes = await file.arrayBuffer()
    await fs.writeFile(destPath, Buffer.from(bytes))

    // ── Read metadata from the SQLite .mbtiles file ────────────────────────
    // We try to spawn `sqlite3` to query the `metadata` table. If sqlite3
    // isn't installed or the file is malformed, we fall back to defaults.
    let minZoom = 0
    let maxZoom = 14
    let bounds: [number, number, number, number] | undefined

    try {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execFileAsync = promisify(execFile)

      // Read all metadata key/value pairs
      const { stdout } = await execFileAsync('sqlite3', [
        destPath,
        'SELECT name, value FROM metadata;',
      ])

      const meta: Record<string, string> = {}
      for (const line of stdout.split('\n')) {
        const [k, ...rest] = line.split('|')
        if (k) meta[k.trim()] = rest.join('|').trim()
      }

      if (meta.minzoom) minZoom = parseInt(meta.minzoom, 10) || 0
      if (meta.maxzoom) maxZoom = parseInt(meta.maxzoom, 10) || 14
      if (meta.bounds) {
        const parts = meta.bounds.split(',').map((s) => parseFloat(s.trim()))
        if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
          bounds = [parts[0], parts[1], parts[2], parts[3]]
        }
      }
    } catch (err) {
      console.warn(
        `[mbtiles/upload] Could not read metadata (sqlite3 not installed?):`,
        err instanceof Error ? err.message : String(err),
      )
      // Non-fatal — defaults already set above
    }

    // ── Return the session descriptor ───────────────────────────────────────
    return NextResponse.json({
      key,
      name: file.name.replace(/\.mbtiles$/i, ''),
      minZoom,
      maxZoom,
      bounds,
    })
  },
)
