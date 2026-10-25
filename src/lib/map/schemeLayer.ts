import type { OLMap, OLLayer, OLEvent } from './olTypes'
import type VectorSource from 'ol/source/Vector'
import { z } from 'zod'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import { requireMatchingSchemeCrs } from './schemeCrs'
import {
  schemeExtentSchema,
  schemeViewportSchema,
  schemeViewMessage,
  type SchemeExtent,
  type SchemeViewport,
  type SchemeViewQuery,
  type SchemeParcelFeature,
} from '@/lib/scheme/schemeView'

async function body(response: Response): Promise<unknown> {
  if (!response.body) {
    const data: unknown = await response.json()
    if (new TextEncoder().encode(JSON.stringify(data)).length > 3145728)
      throw new Error(
        'The stored geometry response exceeds the display window.',
      )
    return data
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > 3145728) {
        await reader.cancel()
        throw new Error(
          'The stored geometry response exceeds the 3 MiB display window.',
        )
      }
      chunks.push(part.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  ) as unknown
}
export async function loadSchemeData(
  projectId: string,
  query?: { mode: 'extent' },
  signal?: AbortSignal,
): Promise<SchemeExtent>
// eslint-disable-next-line no-redeclare -- TypeScript overload for a bounded viewport reply.
export async function loadSchemeData(
  projectId: string,
  query: Exclude<SchemeViewQuery, { mode: 'extent' }>,
  signal?: AbortSignal,
): Promise<SchemeViewport>
// eslint-disable-next-line no-redeclare -- Implementation of the two typed read overloads.
export async function loadSchemeData(
  projectId: string,
  query: SchemeViewQuery = { mode: 'extent' },
  signal?: AbortSignal,
): Promise<SchemeExtent | SchemeViewport> {
  const params = new URLSearchParams({ project_id: projectId })
  if ('mode' in query) params.set('mode', 'extent')
  else {
    params.set('bbox', query.bbox.join(','))
    params.set('cellSize', String(query.cellSize))
  }
  const response = await fetch(`/api/scheme/map?${params}`, {
      signal,
      cache: 'no-store',
    }),
    data = await body(response)
  if (!response.ok) {
    const message = z.object({ error: z.string() }).safeParse(data)
    throw new Error(
      message.success
        ? message.data.error
        : `Stored geometry request failed (${response.status}).`,
    )
  }
  const parsed =
    'mode' in query
      ? schemeExtentSchema.safeParse(data)
      : schemeViewportSchema.safeParse(data)
  if (!parsed.success || parsed.data.projectId !== projectId)
    throw new Error(
      'The stored geometry response does not match the selected project or read contract.',
    )
  assertProjectedCrs(parsed.data.crs)
  if (
    !('mode' in query) &&
    'bbox' in parsed.data &&
    JSON.stringify(parsed.data.bbox) !== JSON.stringify(query.bbox)
  )
    throw new Error('The geometry reply does not match the requested viewport.')
  return parsed.data
}
export interface SchemeViewportStatus {
  loading: boolean
  error: string | null
  message: string
  view: SchemeViewport | null
  extent: SchemeExtent
}
export interface SchemeLayerOptions {
  epsg?: string
  autoZoom?: boolean
  showParcelLabels?: boolean
  signal?: AbortSignal
  onViewportStatus?: (status: SchemeViewportStatus) => void
  onSnapSource?: (source: VectorSource | null) => void
  onParcelClick?: (feature: SchemeParcelFeature) => void
}
export interface SchemeLayerResult {
  parcelLayer: import('ol/layer/Vector').default
  blockLayer: import('ol/layer/Vector').default
  beaconLayer: import('ol/layer/Vector').default
  parcelSnapSource: VectorSource
  parcelCount: number
  blockCount: number
  beaconCount: number
  extent: number[] | null
  cleanup: () => void
}
export async function zoomToSchemeExtent(
  map: OLMap,
  extent: number[] | null,
  padding: number[] = [72, 72, 72, 72],
) {
  if (
    extent?.length === 4 &&
    extent.every(Number.isFinite) &&
    extent[0] < extent[2] &&
    extent[1] < extent[3]
  )
    map.getView().fit(extent, { padding, maxZoom: 19, duration: 0 })
}
function finiteCoordinates(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) =>
      typeof item === 'number'
        ? Number.isFinite(item)
        : finiteCoordinates(item),
    )
  )
}

/** Viewport layers own only their own sources/listeners, never the user's drawing. */
export async function createSchemeLayers(
  projectId: string,
  map: OLMap,
  options: SchemeLayerOptions,
): Promise<SchemeLayerResult> {
  const metadata = await loadSchemeData(
    projectId,
    { mode: 'extent' },
    options.signal,
  )
  const crs = options.epsg
    ? requireMatchingSchemeCrs(metadata.crs, options.epsg)
    : metadata.crs
  const { registerProjectProjection } = await import('@/lib/map/projection')
  await registerProjectProjection(crs)
  const [
    { default: VectorLayer },
    { default: VectorSource },
    { default: GeoJSON },
    proj,
    styles,
    { default: CircleStyle },
  ] = await Promise.all([
    import('ol/layer/Vector'),
    import('ol/source/Vector'),
    import('ol/format/GeoJSON'),
    import('ol/proj'),
    import('ol/style'),
    import('ol/style/Circle'),
  ])
  const parcelSource = new VectorSource(),
    groupSource = new VectorSource(),
    vertexSource = new VectorSource(),
    snapSource = new VectorSource(),
    format = new GeoJSON()
  const parcelLayer = new VectorLayer({
    source: parcelSource,
    declutter: true,
    properties: { name: 'scheme-parcels', projectId },
    style: (feature) => {
      const state = feature.get('evidenceState') as string,
        color =
          state === 'reviewed_draft'
            ? '#6F8D7A'
            : state === 'changed_since_review'
              ? '#C88B54'
              : '#8A8D92'
      return new styles.Style({
        stroke: new styles.Stroke({
          color,
          width: 2,
          lineDash: state === 'reviewed_draft' ? undefined : [6, 4],
        }),
        fill: new styles.Fill({ color: `${color}22` }),
        text:
          options.showParcelLabels === false
            ? undefined
            : new styles.Text({
                text: String(feature.get('parcelNumber') ?? ''),
                font: '12px system-ui',
                fill: new styles.Fill({ color: '#E8E4DE' }),
                stroke: new styles.Stroke({ color: '#181A1D', width: 3 }),
              }),
      })
    },
  })
  const blockLayer = new VectorLayer({
    source: groupSource,
    declutter: true,
    properties: { name: 'scheme-density', projectId },
    style: (feature) =>
      new styles.Style({
        image: new CircleStyle({
          radius: Math.min(
            22,
            9 + Math.log2(Number(feature.get('count')) || 1),
          ),
          fill: new styles.Fill({ color: '#616C74' }),
          stroke: new styles.Stroke({ color: '#E8E4DE', width: 1.5 }),
        }),
        text: new styles.Text({
          text: Number(feature.get('count')).toLocaleString(),
          font: '12px system-ui',
          fill: new styles.Fill({ color: '#FFFFFF' }),
        }),
      }),
  })
  const beaconLayer = new VectorLayer({
    source: vertexSource,
    properties: { name: 'scheme-vertex-compatibility', projectId },
    visible: false,
  })
  let disposed = false,
    attached = false,
    timer: ReturnType<typeof setTimeout> | null = null,
    request: AbortController | null = null,
    view: SchemeViewport | null = null
  const clear = () => {
    parcelSource.clear(true)
    groupSource.clear(true)
    snapSource.clear(true)
    options.onSnapSource?.(null)
  }
  let displayExtent: number[] | null = null
  if (metadata.extent) {
    displayExtent = proj.transformExtent(metadata.extent, crs, 'EPSG:3857', 8)
    if (!displayExtent.every(Number.isFinite))
      throw new Error(
        'The saved geometry extent cannot be transformed for display.',
      )
  }
  const report = (loading: boolean, error: string | null, message: string) =>
    options.onViewportStatus?.({
      loading,
      error,
      message,
      view,
      extent: metadata,
    })
  const refresh = async () => {
    if (disposed) return
    request?.abort()
    request = new AbortController()
    const active = request
    clear()
    view = null
    if (metadata.geometryRecords === 0) {
      report(
        false,
        null,
        `${metadata.totalParcels.toLocaleString()} parcel records; no plottable stored geometry in this reference. ${metadata.missingGeometry} without geometry, ${metadata.otherReferenceRecords} in another reference, ${metadata.unplottableGeometry} unplottable.`,
      )
      return
    }
    report(true, null, 'Loading the current stored-geometry view…')
    try {
      const size = map.getSize()
      if (!size || size[0] <= 0 || size[1] <= 0)
        throw new Error('The map has no usable display size.')
      const extent = map.getView().calculateExtent(size),
        bbox = proj.transformExtent(extent, 'EPSG:3857', crs, 8) as [
          number,
          number,
          number,
          number,
        ]
      const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]),
        cellSize = Math.min(
          span,
          Math.max(
            span / 100,
            (bbox[2] - bbox[0]) / Math.max(1, size[0] / 72),
            (bbox[3] - bbox[1]) / Math.max(1, size[1] / 72),
          ),
        )
      const payload = await loadSchemeData(
        projectId,
        { bbox, cellSize },
        active.signal,
      )
      if (disposed || active !== request || active.signal.aborted) return
      requireMatchingSchemeCrs(payload.crs, crs)
      if (payload.referenceHash !== metadata.referenceHash)
        throw new Error(
          'The saved reference changed. Reload the scheme before continuing.',
        )
      const polygons = [],
        groups = [],
        snappable = []
      for (const raw of payload.features) {
        const feature = format.readFeature(raw, {
          dataProjection: crs,
          featureProjection: 'EPSG:3857',
        })
        if (Array.isArray(feature))
          throw new Error(
            'A stored geometry unexpectedly expanded into multiple features.',
          )
        const geometry = feature.getGeometry() as
          | import('ol/geom/Polygon').default
          | import('ol/geom/Point').default
          | null
        if (!finiteCoordinates(geometry?.getCoordinates()))
          throw new Error(
            'A stored geometry cannot be transformed safely into this map view.',
          )
        if (raw.properties.kind === 'parcel') {
          feature.set('schemeParcel', true)
          polygons.push(feature)
          if (raw.properties.canSnap) snappable.push(feature)
        } else {
          const clusterExtent = proj.transformExtent(
            raw.properties.extent,
            crs,
            'EPSG:3857',
            8,
          )
          if (!clusterExtent.every(Number.isFinite))
            throw new Error('A density group has no usable display extent.')
          feature.set('groupExtent', clusterExtent)
          groups.push(feature)
        }
      }
      parcelSource.addFeatures(polygons)
      groupSource.addFeatures(groups)
      snapSource.addFeatures(snappable)
      view = payload
      options.onSnapSource?.(snappable.length ? snapSource : null)
      report(
        false,
        null,
        `${schemeViewMessage(payload)} Project register: ${metadata.totalParcels.toLocaleString()} parcels; ${metadata.otherReferenceRecords} stored in another reference are hidden.`,
      )
    } catch (failure) {
      if (disposed || active !== request || active.signal.aborted) return
      clear()
      view = null
      const message =
        failure instanceof Error
          ? failure.message
          : 'The stored geometry view could not be loaded.'
      report(
        false,
        message,
        `${message} Pan/zoom to retry or reload the scheme. No parcel geometry is available for snapping.`,
      )
    }
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    request?.abort()
    request = null
    clear()
    view = null
    report(true, null, 'The view changed; loading stored geometry…')
    timer = setTimeout(() => {
      timer = null
      void refresh()
    }, 100)
  }
  const clicked = (event: OLEvent) => {
    const hit = map.forEachFeatureAtPixel(event.pixel, (feature, layer) =>
      layer === (parcelLayer as unknown as OLLayer) ||
      layer === (blockLayer as unknown as OLLayer)
        ? feature
        : undefined,
    )
    if (!hit || typeof hit !== 'object' || !('get' in hit)) return
    const feature = hit as import('ol/Feature').default
    const groupExtent = feature.get('groupExtent') as unknown
    if (Array.isArray(groupExtent)) {
      void zoomToSchemeExtent(map, groupExtent)
      return
    }
    const selected = view?.features.find(
      (item) =>
        item.properties.kind === 'parcel' &&
        'id' in item &&
        item.id === feature.getId(),
    )
    if (selected && selected.properties.kind === 'parcel' && 'id' in selected)
      options.onParcelClick?.(selected)
  }
  const cleanup = () => {
    if (disposed) return
    disposed = true
    options.signal?.removeEventListener('abort', cleanup)
    request?.abort()
    if (timer) clearTimeout(timer)
    clear()
    if (attached) {
      map.un('moveend', schedule)
      map.un('change:size', schedule)
      map.un('singleclick', clicked)
      for (const layer of [parcelLayer, blockLayer, beaconLayer])
        map.removeLayer(layer as unknown as OLLayer)
    }
  }
  try {
    options.signal?.throwIfAborted()
    for (const layer of [parcelLayer, blockLayer, beaconLayer])
      map.addLayer(layer as unknown as OLLayer)
    attached = true
    if (options.autoZoom !== false && displayExtent)
      await zoomToSchemeExtent(map, displayExtent)
    map.on('moveend', schedule)
    map.on('change:size', schedule)
    map.on('singleclick', clicked)
    options.signal?.addEventListener('abort', cleanup, { once: true })
    await refresh()
    options.signal?.throwIfAborted()
    return {
      parcelLayer,
      blockLayer,
      beaconLayer,
      parcelSnapSource: snapSource,
      parcelCount: parcelSource.getFeatures().length,
      blockCount: groupSource.getFeatures().length,
      beaconCount: 0,
      extent: displayExtent,
      cleanup,
    }
  } catch (failure) {
    cleanup()
    throw failure
  }
}
