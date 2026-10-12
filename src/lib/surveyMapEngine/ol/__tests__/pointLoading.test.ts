/** @jest-environment node */
import type { Map as OLMap } from 'ol'
import {
  createProjectPointsLayer,
  type ProjectPointsViewportStatus,
  zoomToSurveyPointCluster,
} from '../pointLoading'

const mockOlState: { sources: Array<{ features: unknown[] }>; layers: unknown[] } = {
  sources: [],
  layers: [],
}
type JsonResponse = { ok: boolean; status: number; json: () => Promise<unknown> }
type MockFetch = jest.Mock<Promise<JsonResponse>, [string, RequestInit?]>
let fetchMock: MockFetch

jest.mock('@/lib/map/projection', () => ({
  registerProjectProjection: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('ol/source/Vector', () => ({
  __esModule: true,
  default: class MockVectorSource {
    features: unknown[] = []
    constructor() { mockOlState.sources.push(this) }
    clear() { this.features = [] }
    addFeatures(features: unknown[]) { this.features.push(...features) }
    getFeatures() { return this.features }
  },
}))
jest.mock('ol/layer/Vector', () => ({
  __esModule: true,
  default: class MockVectorLayer {
    constructor(public options: unknown) { mockOlState.layers.push(this) }
  },
}))
jest.mock('ol/Feature', () => ({
  __esModule: true,
  default: class MockFeature {
    properties: Record<string, unknown>
    constructor(properties: Record<string, unknown>) { this.properties = properties }
    set(key: string, value: unknown) { this.properties[key] = value }
  },
}))
jest.mock('ol/geom/Point', () => ({
  __esModule: true,
  default: class MockPoint { constructor(public coordinates: number[]) {} },
}))
jest.mock('ol/style/Style', () => ({ __esModule: true, default: class MockStyle { constructor(public options: unknown) {} } }))
jest.mock('ol/style/Circle', () => ({ __esModule: true, default: class MockCircle { constructor(public options: unknown) {} } }))
jest.mock('ol/style/Fill', () => ({ __esModule: true, default: class MockFill { constructor(public options: unknown) {} } }))
jest.mock('ol/style/Stroke', () => ({ __esModule: true, default: class MockStroke { constructor(public options: unknown) {} } }))
jest.mock('ol/style/Text', () => ({ __esModule: true, default: class MockText { constructor(public options: unknown) {} } }))
jest.mock('ol/proj', () => ({
  transform: jest.fn((coordinate: number[]) => coordinate),
  transformExtent: jest.fn((extent: number[]) => extent),
  get: jest.fn(() => ({ getUnits: () => 'm' })),
}))

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

beforeEach(() => {
  mockOlState.sources = []
  mockOlState.layers = []
  fetchMock = jest.fn<Promise<JsonResponse>, [string, RequestInit?]>()
  global.fetch = fetchMock as unknown as typeof fetch
})

test('loads the declared extent, then fetches only points in the current viewport', async () => {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({
      extent: [100, 200, 300, 400],
      total: 4,
      meta: { project_crs: { horizontal_crs: 'EPSG:3857' } },
    }))
    .mockResolvedValueOnce(jsonResponse({
      truncated: false,
      clustered: true,
      truncationReason: null,
      points: [
        {
          id: 'p-1', name: 'BM01', easting: 150, northing: 250,
          elevation: 14.5, code: 'CONTROL', description: null, is_control: true,
          feature_kind: 'point', cluster_count: 1, cell_extent: null,
        },
        {
          id: null, name: '3 topo points', easting: 160, northing: 260,
          elevation: null, code: null, description: null, is_control: false,
          feature_kind: 'cluster', cluster_count: 3, cell_extent: [155, 255, 165, 265],
        },
      ],
    }))

  const listeners = new globalThis.Map<string, () => void>()
  const view = {
    calculateExtent: jest.fn(() => [90, 190, 310, 410]),
    fit: jest.fn(),
  }
  const map = {
    getSize: () => [800, 600],
    getView: () => view,
    on: jest.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    un: jest.fn(),
    addLayer: jest.fn(),
    removeLayer: jest.fn(),
  } as unknown as OLMap
  const statuses: ProjectPointsViewportStatus[] = []
  const onViewportStatus = (status: ProjectPointsViewportStatus) => { statuses.push(status) }

  const result = await createProjectPointsLayer('project-1', map, { onViewportStatus })

  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/project/project-1/map-points?mode=extent')
  expect(fetchMock.mock.calls[1]?.[0]).toContain(
    '/api/project/project-1/map-points?bbox=90%2C190%2C310%2C410&clustered=true&cellSize=',
  )
  expect(fetchMock.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/project/project-1/points')
  expect(view.fit).toHaveBeenCalledWith([90, 190, 310, 410], expect.objectContaining({ maxZoom: 18 }))
  expect(result.pointCount).toBe(4)
  expect(result.controlPointCount).toBe(1)
  expect(result.projectCrs).toBe('EPSG:3857')
  expect(mockOlState.sources[0].features).toHaveLength(2)
  expect(statuses.at(-1)).toMatchObject({ pointCount: 4, controlPointCount: 1, truncated: false, message: null })
  const cluster = mockOlState.sources[0].features[1] as { properties: Record<string, unknown> }
  expect(cluster.properties).toMatchObject({ pointType: 'survey-cluster', clusterCount: 3 })
  expect(cluster.properties).not.toHaveProperty('easting')
  expect(cluster.properties).not.toHaveProperty('northing')
  expect(cluster.properties).not.toHaveProperty('pointId')

  result.cleanup()
  expect(map.un).toHaveBeenCalledWith('moveend', expect.any(Function))
  expect(map.removeLayer).toHaveBeenCalledTimes(1)
})

test('warns when the viewport response is truncated instead of presenting it as complete', async () => {
  const points = Array.from({ length: 501 }, (_, index) => ({
    id: `p-${index}`,
    point_name: `P${index}`,
    easting: index + 1,
    northing: index + 1,
    elevation: null,
    code: null,
    description: null,
    is_control: false,
    feature_kind: 'point' as const,
    cluster_count: 1,
    cell_extent: null,
  }))
  fetchMock
    .mockResolvedValueOnce(jsonResponse({
      extent: [100, 200, 300, 400],
      total: 501,
      meta: { project_crs: { horizontal_crs: 'EPSG:3857' } },
    }))
    .mockResolvedValueOnce(jsonResponse({
      points, truncated: true, clustered: true, truncationReason: 'topographic-density',
    }))

  const statuses: ProjectPointsViewportStatus[] = []
  const onViewportStatus = (status: ProjectPointsViewportStatus) => { statuses.push(status) }
  const map = {
    getSize: () => [800, 600],
    getView: () => ({ calculateExtent: () => [90, 190, 310, 410], fit: jest.fn() }),
    on: jest.fn(),
    un: jest.fn(),
    addLayer: jest.fn(),
    removeLayer: jest.fn(),
  } as unknown as OLMap

  const result = await createProjectPointsLayer('project-1', map, { onViewportStatus })

  expect(result.pointCount).toBe(500)
  expect(mockOlState.sources[0].features).toHaveLength(500)
  expect(statuses.at(-1)).toMatchObject({ pointCount: 500, truncated: true })
  expect(statuses.at(-1)?.message).toContain('zoom in for finer groups')
  result.cleanup()
})

test('reports a partial view explicitly when the 500-feature cap clips control points', async () => {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({
      extent: [100, 200, 300, 400],
      total: 501,
      meta: { project_crs: { horizontal_crs: 'EPSG:3857' } },
    }))
    .mockResolvedValueOnce(jsonResponse({
      points: [{
        id: 'control-1', name: 'C1', easting: 150, northing: 250,
        elevation: null, code: 'CONTROL', description: null, is_control: true,
        feature_kind: 'point', cluster_count: 1, cell_extent: null,
      }],
      truncated: true,
      clustered: true,
      truncationReason: 'control-points',
    }))
  const statuses: ProjectPointsViewportStatus[] = []
  const map = {
    getSize: () => [800, 600],
    getView: () => ({ calculateExtent: () => [90, 190, 310, 410], fit: jest.fn() }),
    on: jest.fn(),
    un: jest.fn(),
    addLayer: jest.fn(),
    removeLayer: jest.fn(),
  } as unknown as OLMap

  await createProjectPointsLayer('project-1', map, { onViewportStatus: status => statuses.push(status) })

  expect(statuses.at(-1)?.message).toContain('More than 500 control points are in view')
  expect(statuses.at(-1)?.message).toContain('this map view is partial')
})

test('zooms to a cluster cell only when its projected bounds are finite and non-degenerate', () => {
  const fit = jest.fn()
  const map = { getView: () => ({ fit }) } as unknown as OLMap

  expect(zoomToSurveyPointCluster(map, [10, 20, 30, 40])).toBe(true)
  expect(fit).toHaveBeenCalledWith([10, 20, 30, 40], expect.objectContaining({ maxZoom: 22 }))

  fit.mockClear()
  expect(zoomToSurveyPointCluster(map, [10, 20, 10, 40])).toBe(false)
  expect(zoomToSurveyPointCluster(map, [10, 20, Number.NaN, 40])).toBe(false)
  expect(fit).not.toHaveBeenCalled()
})
