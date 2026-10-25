import { waitFor } from '@testing-library/react'
import {
  createSchemeLayers,
  type SchemeViewportStatus,
} from '@/lib/map/schemeLayer'
import type { OLMap, OLLayer, OLEvent } from '@/lib/map/olTypes'
import {
  schemeExtent,
  schemeViewport,
  schemeProject,
  schemeCrs,
} from './fixtures/schemeView'

// The first real OpenLayers import includes ESM transpilation under Jest.
jest.setTimeout(30000)
const oldFetch = global.fetch
afterEach(() => {
  global.fetch = oldFetch
})
function response(value: unknown) {
  return { ok: true, json: async () => value } as Response
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function mapFixture() {
  const layers: OLLayer[] = [],
    listeners = new Map<string, (event: OLEvent) => void>()
  let extent = [0, 0, 1, 1]
  const map = {
    getSize: () => [800, 600],
    getView: () => ({
      fit: (value: number[]) => {
        extent = value
      },
      calculateExtent: () => extent,
    }),
    addLayer: (layer: OLLayer) => layers.push(layer),
    removeLayer: (layer: OLLayer) => {
      layers.splice(layers.indexOf(layer), 1)
    },
    on: (key: string, callback: (event: OLEvent) => void) =>
      listeners.set(key, callback),
    un: (key: string) => listeners.delete(key),
  } as unknown as OLMap
  return {
    map,
    layers,
    listeners,
    pan: () =>
      listeners.get('moveend')?.({
        type: 'moveend',
        target: map,
        pixel: [0, 0],
        coordinate: [],
      }),
  }
}
function bboxFrom(url: string) {
  const value = new URL(url, 'http://127.0.0.1').searchParams.get('bbox')
  if (!value) throw new Error('Expected a viewport request.')
  return value.split(',').map(Number) as [number, number, number, number]
}
it('does not restore a late viewport response during the pan debounce', async () => {
  const pending = deferred<Response>(),
    fixture = mapFixture(),
    statuses: SchemeViewportStatus[] = []
  let requestUrl = '',
    requestSignal: AbortSignal | undefined
  const fetcher = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('mode=extent')) return response(schemeExtent())
      requestUrl = url
      requestSignal = init?.signal ?? undefined
      return pending.promise
    })
  global.fetch = fetcher
  const loading = createSchemeLayers(schemeProject, fixture.map, {
    epsg: schemeCrs,
    onViewportStatus: (value) => statuses.push(value),
  })
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2), {
    timeout: 25000,
  })
  fixture.pan()
  expect(requestSignal?.aborted).toBe(true)
  pending.resolve(response(schemeViewport(bboxFrom(requestUrl))))
  const result = await loading
  expect(result.parcelSnapSource.getFeatures()).toHaveLength(0)
  expect(result.parcelLayer.getSource()?.getFeatures()).toHaveLength(0)
  expect(statuses.at(-1)).toMatchObject({ loading: true, view: null })
  result.cleanup()
  expect(fixture.layers).toHaveLength(0)
  expect(fixture.listeners.size).toBe(0)
})
it('uses actual saved grid geometry and clears only its own layers on abort', async () => {
  const fixture = mapFixture(),
    drawing = { get: () => 'preserved-training-drawing' } as unknown as OLLayer
  fixture.layers.push(drawing)
  global.fetch = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementation(async (input) => {
      const url = String(input)
      return response(
        url.includes('mode=extent')
          ? schemeExtent()
          : schemeViewport(bboxFrom(url)),
      )
    })
  const controller = new AbortController(),
    result = await createSchemeLayers(schemeProject, fixture.map, {
      signal: controller.signal,
    })
  expect(result.parcelSnapSource.getFeatures()).toHaveLength(1)
  expect(result.beaconLayer.getVisible()).toBe(false)
  expect(result.beaconLayer.getSource()?.getFeatures()).toHaveLength(0)
  const polygon = result.parcelLayer.getSource()?.getFeatures()[0] as
    | import('ol/Feature').default
    | undefined
  expect(polygon?.get('parcelNumber') as unknown).toBe('SYN-A')
  expect(polygon?.getGeometry()?.getExtent().every(Number.isFinite)).toBe(true)
  controller.abort()
  expect(result.parcelSnapSource.getFeatures()).toHaveLength(0)
  expect(fixture.layers).toEqual([drawing])
  expect(fixture.listeners.size).toBe(0)
})
