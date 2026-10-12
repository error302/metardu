import type TileLayer from 'ol/layer/Tile'
import type { CachedSourceInfo } from './tileCache'
import { expandXyzTileUrl } from './tileCache'

export type UsableCachedTileSource = CachedSourceInfo & {
  urlTemplate: string
  attribution: string
  minZoom: number
  maxZoom: number
}

export function isUsableCachedTileSource(source: CachedSourceInfo): source is UsableCachedTileSource {
  const minZoom = source.minZoom
  const maxZoom = source.maxZoom
  return Boolean(
    source.urlTemplate && source.attribution &&
    typeof minZoom === 'number' && Number.isInteger(minZoom) &&
    typeof maxZoom === 'number' && Number.isInteger(maxZoom) &&
    minZoom >= 0 && maxZoom >= minZoom,
  )
}

const TRANSPARENT_TILE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='

/** Create an OpenLayers XYZ layer backed by the downloaded IndexedDB package. */
export async function createCachedXyzLayer(source: UsableCachedTileSource): Promise<TileLayer> {
  const [{ default: TileLayerClass }, { default: XYZ }] = await Promise.all([
    import('ol/layer/Tile'),
    import('ol/source/XYZ'),
  ])

  const attributionElement = document.createElement('span')
  attributionElement.textContent = source.attribution
  // OpenLayers renders attribution strings as markup, so escape user-entered
  // provider text before passing it to the attribution control.
  const safeAttribution = attributionElement.innerHTML

  const tileSource = new XYZ({
    minZoom: source.minZoom,
    maxZoom: source.maxZoom,
    attributions: safeAttribution,
    crossOrigin: 'anonymous',
    wrapX: false,
    transition: 0,
    tileUrlFunction: (tileCoordinate) => {
      if (!tileCoordinate) return undefined
      const [z, x, y] = tileCoordinate
      return expandXyzTileUrl(source.urlTemplate, z, x, y)
    },
    tileLoadFunction: (tile, url) => {
      // XYZ sources provide ImageTile instances, while the public load hook is
      // typed against the base Tile class which does not expose getImage().
      const image = (tile as import('ol/ImageTile').default).getImage() as HTMLImageElement
      void import('./tileCacheStore')
        .then(({ getCachedTileBlob }) => getCachedTileBlob(url))
        .then((blob) => {
          if (blob) {
            const objectUrl = URL.createObjectURL(blob)
            const release = () => URL.revokeObjectURL(objectUrl)
            image.addEventListener('load', release, { once: true })
            image.addEventListener('error', release, { once: true })
            image.src = objectUrl
            return
          }

          // Online viewing can fill gaps outside the downloaded area. With no
          // connection, keep the map tile empty without asking the provider.
          image.src = typeof navigator !== 'undefined' && navigator.onLine
            ? url
            : TRANSPARENT_TILE
        })
        .catch(() => {
          image.src = typeof navigator !== 'undefined' && navigator.onLine
            ? url
            : TRANSPARENT_TILE
        })
    },
  })

  const layer = new TileLayerClass({ source: tileSource, visible: false, zIndex: 0, cacheSize: 512 })
  layer.set('basemapId', `offline-${source.sourceId}`)
  layer.set('title', source.label)
  return layer
}
