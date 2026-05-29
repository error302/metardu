import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const TMP_DIR = '/tmp/metardu-mbtiles';

export async function GET(
  _req: NextRequest,
  { params }: { params: { key: string; z: string; x: string; y: string } }
) {
  const { key, z, x, y } = params;

  // Sanitize key — UUID only
  if (!/^[0-9a-f-]{36}$/.test(key)) {
    return new NextResponse('Invalid key', { status: 400 });
  }

  const filePath = path.join(TMP_DIR, `${key}.mbtiles`);

  try {
    const db = new Database(filePath, { readonly: true });

    // MBTiles uses TMS y-axis (inverted) — flip y for OpenLayers XYZ
    const zoom = parseInt(z);
    const tileX = parseInt(x);
    // TMS y = (2^zoom - 1) - y
    const tileY = (1 << zoom) - 1 - parseInt(y);

    const row = db.prepare(
      'SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?'
    ).get(zoom, tileX, tileY) as { tile_data: Buffer } | undefined;

    db.close();

    if (!row) return new NextResponse(null, { status: 204 });

    return new NextResponse(row.tile_data as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new NextResponse('Tile not found', { status: 404 });
  }
}
