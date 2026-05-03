import { MBTilesSession } from '@/types/field';
import XYZ from 'ol/source/XYZ';
import TileLayer from 'ol/layer/Tile';

export async function uploadMBTiles(file: File): Promise<MBTilesSession> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/field/mbtiles/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Upload failed');
  }
  return res.json() as Promise<MBTilesSession>;
}

export function buildOLMBTilesLayer(session: MBTilesSession): TileLayer<XYZ> {
  return new TileLayer({
    source: new XYZ({
      url: `/api/field/mbtiles/tiles/${session.key}/{z}/{x}/{y}`,
      minZoom: session.minZoom,
      maxZoom: session.maxZoom,
    }),
    opacity: 1.0,
  });
}
