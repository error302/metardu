import { MBTilesSession } from '@/types/field';

export async function uploadMBTiles(file: File): Promise<MBTilesSession> {
  const form = new FormData();
  form.append('file', file);
  // This viewer reads tiles from the authenticated server route. Device-only
  // storage requires a browser SQLite reader and a local tile resolver, which
  // the current viewer does not have yet.
  form.append('storage', 'server');
  const res = await fetch('/api/field/mbtiles/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? 'Upload failed');
  }

  const payload = (await res.json()) as { data?: Partial<MBTilesSession> };
  const session = payload.data;
  const minZoom = session?.minZoom
  const maxZoom = session?.maxZoom
  const format = session?.format
  if (
    !session || typeof session.key !== 'string' || !session.key ||
    typeof session.name !== 'string' ||
    typeof format !== 'string' || !['png', 'jpg', 'jpeg', 'webp'].includes(format) ||
    typeof minZoom !== 'number' || !Number.isInteger(minZoom) ||
    typeof maxZoom !== 'number' || !Number.isInteger(maxZoom) ||
    minZoom < 0 || maxZoom < minZoom
  ) {
    throw new Error('The server returned incomplete metadata for this MBTiles package.');
  }

  return { ...session, storage: 'server' } as MBTilesSession;
}

// buildOLMBTilesLayer is only called inside MapViewer useEffect (browser-only)
// so the OL imports are safe here — this function is dynamically imported
export function buildOLMBTilesLayer(session: MBTilesSession): import('ol/layer/Tile').default {
  // Browser-only dynamic require (SSR-safe, see note above).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: XYZ } = require('ol/source/XYZ') as typeof import('ol/source/XYZ');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: TileLayer } = require('ol/layer/Tile') as typeof import('ol/layer/Tile');
  
  return new TileLayer({
    source: new XYZ({
      url: `/api/field/mbtiles/tiles/${session.key}/{z}/{x}/{y}`,
      minZoom: session.minZoom,
      maxZoom: session.maxZoom,
    }),
    opacity: 1.0,
  });
}
