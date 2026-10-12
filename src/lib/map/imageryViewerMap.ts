import type OlMapType from 'ol/Map'
import type { ImageryProvider, ImageryView } from '@/lib/online/satellite'
import { imageryTileTemplate, imageryViewSchema } from '@/lib/online/satellite'
import { SRID_3857 } from '@/lib/map/projectionConstants'
import type { ImageryExportFrame } from '@/lib/surveyMapEngine/io/imageryExport'

export interface ImageryMapConfiguration {
  provider: ImageryProvider
  date: string | null
  view: ImageryView
  catalogueRetrievedAt: string
}
export interface ImageryMapStatus {
  phase: 'loading' | 'ready' | 'error'
  message: string
  view?: ImageryView
}
export interface ImageryMapController {
  exportFrame(): ImageryExportFrame
  destroy(): void
}
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)

/** Loaded on demand. No project coordinate or survey calculation lives here. */
export async function createImageryMap(target: HTMLElement, configuration: ImageryMapConfiguration, onStatus: (status: ImageryMapStatus) => void, signal: AbortSignal): Promise<ImageryMapController> {
  const { provider, date } = configuration
  const viewInput = imageryViewSchema.parse(configuration.view)
  if (provider.minZoom == null || provider.maxZoom == null || provider.tileSize !== 256 || viewInput.zoom < provider.minZoom || viewInput.zoom > provider.maxZoom) throw new Error('Choose a zoom supported by the selected imagery source.')
  const template = imageryTileTemplate(provider, date)
  const [{ default: OlMap }, { default: View }, { default: TileLayer }, { default: XYZ }, { default: Attribution }, { default: Zoom }, { fromLonLat, toLonLat }] = await Promise.all([
    import('ol/Map'), import('ol/View'), import('ol/layer/Tile'), import('ol/source/XYZ'), import('ol/control/Attribution'), import('ol/control/Zoom'), import('ol/proj'),
  ])
  if (signal.aborted) throw new Error('Imagery loading was cancelled')
  const source = new XYZ({ url: template, crossOrigin: 'anonymous', wrapX: false, minZoom: provider.minZoom, maxZoom: provider.maxZoom, tileSize: provider.tileSize,
    attributions: `${escapeHtml(provider.credits)} · <a href="${escapeHtml(provider.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>`, attributionsCollapsible: false,
  })
  const layer = new TileLayer({ source, cacheSize: 128 })
  const map: OlMapType = new OlMap({ target, layers: [layer], controls: [new Attribution({ collapsible: false }), new Zoom()],
    view: new View({ projection: SRID_3857, center: fromLonLat([viewInput.longitude, viewInput.latitude]), zoom: viewInput.zoom, minZoom: provider.minZoom, maxZoom: provider.maxZoom, multiWorld: false }),
  })
  const states = new Map<string, 'loading' | 'loaded' | 'error'>()
  let destroyed = false, ready = false, timeout: ReturnType<typeof setTimeout> | null = null
  const report = (status: ImageryMapStatus) => { if (!destroyed && !signal.aborted) onStatus({ ...status, view: status.view ?? currentView() }) }
  const currentView = () => {
    const center = map.getView().getCenter(), zoom = map.getView().getZoom()
    if (!center || zoom == null) throw new Error('The imagery viewport is unavailable')
    const [longitude, latitude] = toLonLat(center)
    return { longitude, latitude, zoom }
  }
  const clearTimeoutIfNeeded = () => { if (timeout !== null) clearTimeout(timeout); timeout = null }
  const loading = () => {
    ready = false; clearTimeoutIfNeeded(); report({ phase: 'loading', message: 'Loading imagery for this view…' })
    timeout = setTimeout(() => { ready = false; report({ phase: 'error', message: 'Imagery did not finish loading. Check your connection or load the view again.' }) }, 20000)
  }
  const grid = source.getTileGrid()
  if (!grid) { map.dispose(); throw new Error('The imagery tile grid is unavailable') }
  const readiness = () => {
    const size = map.getSize(), resolution = map.getView().getResolution()
    if (!size || resolution == null || size[0] <= 0 || size[1] <= 0) return 'loading'
    const extent = map.getView().calculateExtent(size), z = grid.getZForResolution(resolution)
    const range = grid.getTileRangeForExtentAndZ(extent, z), full = grid.getFullTileRange(z)
    if (!full || range.minX < full.minX || range.maxX > full.maxX || range.minY < full.minY || range.maxY > full.maxY) return 'outside'
    if ((range.maxX - range.minX + 1) * (range.maxY - range.minY + 1) > 512) return 'outside'
    for (let x = range.minX; x <= range.maxX; x++) for (let y = range.minY; y <= range.maxY; y++) {
      const state = states.get(`${z}/${x}/${y}`)
      if (state === 'error') return 'error'
      if (state !== 'loaded') return 'loading'
    }
    return 'ready'
  }
  const tileEvent = (event: import('ol/source/Tile').TileSourceEvent) => {
    const [z, x, y] = event.tile.getTileCoord()
    states.set(`${z}/${x}/${y}`, event.type === 'tileloadend' ? 'loaded' : event.type === 'tileloaderror' ? 'error' : 'loading')
    if (states.size > 2048) { const oldest = states.keys().next().value; if (oldest) states.delete(oldest) }
    if (event.type === 'tileloaderror') { ready = false; report({ phase: 'error', message: 'Some imagery tiles failed. Load the view again before exporting.' }) }
  }
  const complete = () => {
    const state = readiness()
    if (state === 'ready') {
      ready = true; clearTimeoutIfNeeded(); report({ phase: 'ready', message: 'Imagery tiles loaded. Clouds and source-data gaps may still be present.', view: currentView() })
    } else if (state === 'outside') {
      ready = false; clearTimeoutIfNeeded(); report({ phase: 'error', message: 'The view extends beyond this imagery tile grid. Zoom in or move the view inside its coverage.' })
    } else if (state === 'error') { ready = false; clearTimeoutIfNeeded(); report({ phase: 'error', message: 'Some imagery tiles failed. Load the view again before exporting.' }) }
  }
  source.on('tileloadstart', tileEvent); source.on('tileloadend', tileEvent); source.on('tileloaderror', tileEvent)
  map.on('rendercomplete', complete)
  map.getView().on('change', loading)
  map.on('change:size', loading)
  const updateSize = () => map.updateSize()
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize)
  resize?.observe(target); window.addEventListener('resize', updateSize)
  const destroy = () => {
    if (destroyed) return
    destroyed = true; clearTimeoutIfNeeded(); resize?.disconnect(); window.removeEventListener('resize', updateSize)
    source.un('tileloadstart', tileEvent); source.un('tileloadend', tileEvent); source.un('tileloaderror', tileEvent)
    map.un('rendercomplete', complete); map.un('change:size', loading); map.getView().un('change', loading)
    signal.removeEventListener('abort', destroy); map.setTarget(undefined); map.dispose(); layer.dispose(); source.dispose(); states.clear()
  }
  signal.addEventListener('abort', destroy, { once: true })
  loading(); map.renderSync()
  return {
    destroy,
    exportFrame() {
      map.updateSize()
      if (destroyed || signal.aborted || !ready || readiness() !== 'ready') throw new Error('Wait for all imagery tiles in the current view to load before exporting.')
      if (provider.id !== 'nasa-modis-terra' || !provider.exportAllowed) throw new Error(provider.exportReason ?? 'This source is not licensed for this raster export.')
      map.renderSync()
      const size = map.getSize()
      if (!size || !Number.isInteger(size[0]) || !Number.isInteger(size[1])) throw new Error('The imagery viewport size is unavailable')
      const coordinate = (pixel: number[]): [number, number] => {
        const result = map.getCoordinateFromPixel(pixel)
        if (!result || result.length !== 2 || !result.every(Number.isFinite)) throw new Error('The imagery viewport georeferencing is unavailable')
        return [result[0], result[1]]
      }
      return { width: size[0], height: size[1], viewport: map.getViewport(), topLeftPixel: coordinate([0.5, 0.5]), nextColumnPixel: coordinate([1.5, 0.5]), nextRowPixel: coordinate([0.5, 1.5]),
        provider, dataDay: date, catalogueRetrievedAt: configuration.catalogueRetrievedAt, view: currentView(), exportedAt: new Date().toISOString(),
      }
    },
  }
}
