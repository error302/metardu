import { z } from 'zod'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
export interface KenCORSStation {
  id: string; name: string; easting: number; northing: number; county: string;
  status: 'catalogue_reviewed'; horizontalCrs: string; sourceReference: string;
}
const sourceSchema = z.object({ id: z.string().guid(), name: z.string(), easting: z.number().finite(), northing: z.number().finite(),
  horizontal_crs: z.string(), source_reference: z.string().min(1), country: z.string().nullable(), status: z.literal('verified'), distance_m: z.number().finite().min(0) })
/** Compatibility name: returns reviewed GNSS source marks, not live station availability. */
export async function nearestKenCORSStations(easting: number, northing: number, count: number, crs: string, signal?: AbortSignal): Promise<Array<KenCORSStation & { distanceKm: number }>> {
  const code = assertProjectedCrs(crs).code
  if (!Number.isFinite(easting) || !Number.isFinite(northing) || !Number.isInteger(count) || count < 1 || count > 200) throw new Error('Valid coordinates, count and a survey grid are required')
  const query = new URLSearchParams({ easting: String(easting), northing: String(northing), crs: code, type: 'gnss', radius: '100000', limit: String(count) })
  const controller = new AbortController(), abort = () => controller.abort(signal?.reason)
  if (signal?.aborted) abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => controller.abort(new Error('Reference catalogue lookup timed out')), 10000)
  try {
    const response = await fetch(`/api/public-beacons?${query}`, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) throw new Error('Reviewed GNSS reference locations could not be loaded')
    const payload: unknown = await response.json()
    const data = z.object({ data: z.object({ beacons: z.array(sourceSchema) }) }).parse(payload)
    return data.data.beacons.map(mark => {
      if (mark.horizontal_crs !== code) throw new Error('The reference grid does not match the map')
      return { id: mark.id, name: mark.name, easting: mark.easting, northing: mark.northing, county: '', status: 'catalogue_reviewed' as const, horizontalCrs: code, sourceReference: mark.source_reference, distanceKm: mark.distance_m / 1000 }
    })
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
