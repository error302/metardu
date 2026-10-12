import { NextResponse } from 'next/server'
import path from 'node:path'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MBTILES_DIR = path.join(process.cwd(), 'upload', 'mbtiles')
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export const GET = apiHandler(
  // Tile URLs identify packages but do not grant access to them. Keep every
  // tile read authenticated and verify that the package belongs to this user.
  { auth: true, rateLimit: { max: 3600, windowMs: 60_000 } },
  async (_req, ctx) => {
    const { key, z, x, y } = ctx.params

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      return new NextResponse('Tile not found', { status: 404, headers: PRIVATE_HEADERS })
    }

    const zoom = Number(z)
    const tileX = Number(x)
    const xyzY = Number(y)
    if (
      !Number.isInteger(zoom) || zoom < 0 || zoom > 24 ||
      !Number.isInteger(tileX) || !Number.isInteger(xyzY) ||
      tileX < 0 || xyzY < 0 || tileX >= 2 ** zoom || xyzY >= 2 ** zoom
    ) {
      return new NextResponse('Invalid tile coordinates', { status: 400, headers: PRIVATE_HEADERS })
    }

    const { rows } = await db.query(
      `SELECT id
         FROM field_basemaps
        WHERE storage_key = $1::uuid AND user_id = $2::uuid AND storage = 'server'
        LIMIT 1`,
      [key, ctx.userId]
    )
    if (rows.length === 0) {
      return new NextResponse('Tile not found', { status: 404, headers: PRIVATE_HEADERS })
    }

    let tileDb: InstanceType<typeof import('better-sqlite3')> | undefined
    try {
      // Load the optional SQLite driver only for this field-map request.
      const Database = (await import('better-sqlite3')).default
      tileDb = new Database(path.join(MBTILES_DIR, `${key}.mbtiles`), { readonly: true })

      // MBTiles stores rows in TMS order; OpenLayers requests XYZ rows.
      const tmsY = 2 ** zoom - 1 - xyzY
      const row = tileDb
        .prepare('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?')
        .get(zoom, tileX, tmsY) as { tile_data: Buffer } | undefined
      if (!row) return new NextResponse(null, { status: 204, headers: PRIVATE_HEADERS })

      const formatRow = tileDb
        .prepare("SELECT value FROM metadata WHERE name='format'")
        .get() as { value?: string } | undefined
      const contentType = ({
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        pbf: 'application/x-protobuf',
      } as Record<string, string>)[formatRow?.value?.toLowerCase() ?? ''] ?? 'application/octet-stream'

      return new NextResponse(row.tile_data as unknown as BodyInit, {
        status: 200,
        headers: { ...PRIVATE_HEADERS, 'Content-Type': contentType },
      })
    } catch {
      return new NextResponse('Tile not found', { status: 404, headers: PRIVATE_HEADERS })
    } finally {
      tileDb?.close()
    }
  }
)
