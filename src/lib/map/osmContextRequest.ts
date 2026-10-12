import type View from 'ol/View'
import type { Size } from 'ol/size'

export const OSM_CONTEXT_MAX_RADIUS_METERS = 2000

export interface OsmContextRequest {
  lat: number
  lon: number
  radius: number
  coverageLimited: boolean
}

/**
 * Build the OSM context query from the map's actual center and viewport scale.
 * OpenLayers owns projection conversion; no window-level proj4 global is
 * required. The radius is the ground-distance half diagonal of the viewport.
 */
export async function buildOsmContextRequest(
  view: Pick<View, 'getCenter' | 'getProjection' | 'getResolution'>,
  size: Size | undefined,
): Promise<OsmContextRequest> {
  if (!size || size.length < 2 || !Number.isFinite(size[0]) || !Number.isFinite(size[1]) || size[0] <= 0 || size[1] <= 0) {
    throw new Error('The map viewport is not ready for context data.')
  }

  const center = view.getCenter()
  const resolution = view.getResolution()
  if (!center || !center.every(Number.isFinite) || !resolution || !Number.isFinite(resolution) || resolution <= 0) {
    throw new Error('The map center or resolution is unavailable.')
  }

  const projection = view.getProjection()
  const { transform, getPointResolution } = await import('ol/proj')
  const [lon, lat] = transform([...center], projection, 'EPSG:4326')
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new Error('The map center could not be transformed to WGS 84.')
  }

  const metersPerPixel = getPointResolution(projection, resolution, center, 'm')
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    throw new Error('The map scale could not be converted to ground metres.')
  }

  const requiredRadius = Math.ceil(metersPerPixel * Math.hypot(size[0] / 2, size[1] / 2))
  return {
    lat,
    lon,
    radius: Math.max(50, Math.min(requiredRadius, OSM_CONTEXT_MAX_RADIUS_METERS)),
    coverageLimited: requiredRadius > OSM_CONTEXT_MAX_RADIUS_METERS,
  }
}
