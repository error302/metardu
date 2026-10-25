import { act, renderHook, waitFor } from '@testing-library/react'
import {
  useSchemeLayers,
  type UseSchemeLayersParams,
} from '@/app/map/hooks/useSchemeLayers'
import {
  createSchemeLayers,
  type SchemeLayerResult,
  type SchemeLayerOptions,
  type SchemeViewportStatus,
} from '@/lib/map/schemeLayer'
import type VectorSource from 'ol/source/Vector'
import {
  schemeExtent,
  schemeViewport,
  schemeProject,
  schemeCrs,
} from './fixtures/schemeView'
jest.mock('@/lib/map/schemeLayer', () => ({
  createSchemeLayers: jest.fn(),
  zoomToSchemeExtent: jest.fn(),
}))
const create = jest.mocked(createSchemeLayers)
const otherCrs = 'EPSG:32736'
const snap = { getFeatures: () => [{}] } as unknown as VectorSource
function layerResult() {
  return {
    parcelLayer: { setVisible: jest.fn() },
    blockLayer: { setVisible: jest.fn() },
    beaconLayer: { setVisible: jest.fn() },
    parcelSnapSource: snap,
    parcelCount: 1,
    blockCount: 0,
    beaconCount: 3,
    extent: [1, 2, 3, 4],
    cleanup: jest.fn(),
  } as unknown as SchemeLayerResult
}
function params(): UseSchemeLayersParams {
  return {
    schemeProjectId: schemeProject,
    currentSurveyCrs: schemeCrs,
    mapReady: true,
    mapInstance: { current: {} as import('ol/Map').default },
    setVertexEditingVertices: jest.fn(),
  }
}
function status(
  overrides: Partial<SchemeViewportStatus> = {},
): SchemeViewportStatus {
  return {
    loading: false,
    error: null,
    message: 'Stored shapes',
    view: schemeViewport(),
    extent: schemeExtent(),
    ...overrides,
  }
}
function callbacks() {
  const call = create.mock.calls.at(-1)
  if (!call) throw new Error('Expected the map loader to have been called.')
  return call[2] as SchemeLayerOptions
}
beforeEach(() => {
  create.mockReset()
  create.mockResolvedValue(layerResult())
})
it('loads the explicit reference without seeding the drawing from background vertices', async () => {
  const input = params()
  const { result } = renderHook(() => useSchemeLayers(input))
  await waitFor(() => expect(result.current.schemeLoaded).toBe(true))
  expect(callbacks().epsg).toBe(schemeCrs)
  expect(input.setVertexEditingVertices).not.toHaveBeenCalled()
  expect(result.current.schemeBeaconCount).toBe(0)
  expect(result.current.schemeBeaconSnapSource).toBeNull()
})
it('aborts and reloads when the same project changes reference', async () => {
  const input = params()
  const { result, rerender } = renderHook(
    (props: UseSchemeLayersParams) => useSchemeLayers(props),
    { initialProps: input },
  )
  await waitFor(() => expect(result.current.schemeLoaded).toBe(true))
  const old = callbacks()
  const crs = otherCrs
  rerender({ ...input, currentSurveyCrs: crs })
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
  expect(old.signal?.aborted).toBe(true)
  expect(callbacks().epsg).toBe(crs)
})
it('cleans an obsolete project result and ignores its callbacks', async () => {
  let finish!: (value: SchemeLayerResult) => void
  create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const input = params(),
    obsolete = layerResult()
  const { result, rerender } = renderHook(
    (props: UseSchemeLayersParams) => useSchemeLayers(props),
    { initialProps: input },
  )
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  const old = callbacks()
  rerender({
    ...input,
    schemeProjectId: '66666666-6666-4666-8666-666666666666',
  })
  await waitFor(() => expect(result.current.schemeLoaded).toBe(true))
  await act(async () => {
    finish(obsolete)
  })
  act(() => {
    old.onSnapSource?.(snap)
    old.onViewportStatus?.(status({ error: 'Old error' }))
  })
  expect(obsolete.cleanup).toHaveBeenCalledTimes(1)
  expect(result.current.schemeError).toBe('')
  expect(result.current.schemeParcelSnapSource).toBeNull()
})
it('keeps hidden polygons out of snapping and clears sources on loading or failure', async () => {
  const { result } = renderHook(() => useSchemeLayers(params()))
  await waitFor(() => expect(result.current.schemeLoaded).toBe(true))
  const options = callbacks()
  act(() => options.onSnapSource?.(snap))
  expect(result.current.schemeParcelSnapSource).toBe(snap)
  act(() => result.current.toggleSchemeParcelVisibility())
  act(() => options.onSnapSource?.(snap))
  expect(result.current.schemeParcelSnapSource).toBeNull()
  act(() => result.current.toggleSchemeParcelVisibility())
  expect(result.current.schemeParcelSnapSource).toBe(snap)
  act(() => options.onViewportStatus?.(status({ loading: true, view: null })))
  expect(result.current.schemeParcelSnapSource).toBeNull()
  act(() => options.onSnapSource?.(snap))
  act(() => options.onViewportStatus?.(status({ error: 'Read failed' })))
  expect(result.current.schemeParcelSnapSource).toBeNull()
  expect(result.current.schemeError).toBe('Read failed')
})
it('removes owned layers without automatically loading them again', async () => {
  const owned = layerResult()
  create.mockResolvedValue(owned)
  const input = params(),
    { result, rerender, unmount } = renderHook(() => useSchemeLayers(input))
  await waitFor(() => expect(result.current.schemeLoaded).toBe(true))
  const options = callbacks()
  act(() => result.current.removeScheme())
  rerender()
  expect(options.signal?.aborted).toBe(true)
  expect(owned.cleanup).toHaveBeenCalledTimes(1)
  expect(create).toHaveBeenCalledTimes(1)
  act(() => options.onSnapSource?.(snap))
  expect(result.current.schemeParcelSnapSource).toBeNull()
  unmount()
})
it('aborts pending work and disposes a late result after unmount', async () => {
  let finish: ((value: SchemeLayerResult) => void) | undefined
  create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const input = params(),
    late = layerResult()
  const { unmount } = renderHook(() => useSchemeLayers(input))
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  const options = callbacks()
  unmount()
  expect(options.signal?.aborted).toBe(true)
  if (!finish) throw new Error('Expected the pending loader.')
  await act(async () => {
    finish?.(late)
  })
  expect(late.cleanup).toHaveBeenCalledTimes(1)
})
