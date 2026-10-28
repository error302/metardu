import type Map from 'ol/Map'
import Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import LineString from 'ol/geom/LineString'
import VectorSource from 'ol/source/Vector'
import Draw, { DrawEvent } from 'ol/interaction/Draw'
import { createMeasureWhileDraw } from '../ol/cadastralEditing'
import { DISPLAY_CRS, transformPoint } from '@/lib/spatial/projectCrs'

jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))

const grid = 'EPSG:32633'
function fixture(projection: string) {
  // Actual OL geometry, source, draw events and annotation layer. A small map
  // host adapter avoids creating a browser renderer for these behavior tests.
  const host = { addLayer: jest.fn(), removeLayer: jest.fn() }
  const draw = new Draw({ type: 'LineString', source: new VectorSource() })
  const errors: Error[] = []
  const options = { map: host as unknown as Map, drawInteraction: draw, projection, projectCrs: grid, onError: (error: Error) => { errors.push(error) } }
  return { host, draw, errors, options }
}
function start(draw: Draw, coords: number[][]) {
  const geometry = new LineString(coords)
  const feature = new Feature<Geometry>(geometry)
  draw.dispatchEvent(new DrawEvent('drawstart', feature))
  return { geometry, feature }
}
function labels(handle: Awaited<ReturnType<typeof createMeasureWhileDraw>>): string[] {
  return handle.layer.getSource()?.getFeatures().map(feature => {
    const value: unknown = feature.get('measureLabel')
    return typeof value === 'string' ? value : ''
  }) ?? []
}

test.each([DISPLAY_CRS, 'EPSG:4326', grid])('labels use the declared grid after conversion from %s, including grid bearings', async source => {
  const f = fixture(source)
  const handle = await createMeasureWhileDraw(f.options)
  const from = transformPoint(350000, 6650000, grid, source)
  const to = transformPoint(350100, 6650100, grid, source)
  const sketch = start(f.draw, [from, from])
  sketch.geometry.setCoordinates([from, to])
  expect(labels(handle)).toEqual(['141.42 m  45.0° NE'])
  expect(f.errors).toEqual([])
  handle.cleanup()
})

test.each([DISPLAY_CRS, 'EPSG:4326', 'EPSG:999999', undefined].map(projectCrs => ({ projectCrs })))('invalid or undeclared project grid $projectCrs is refused before adding a layer', async ({ projectCrs }) => {
  const f = fixture(DISPLAY_CRS)
  await expect(createMeasureWhileDraw({ ...f.options, projectCrs: projectCrs as string })).rejects.toThrow(/CRS|project|projection/i)
  expect(f.host.addLayer).not.toHaveBeenCalled()
})

test('a missing source projection does not become Web Mercator', async () => {
  const f = fixture(undefined as unknown as string)
  await expect(createMeasureWhileDraw(f.options)).rejects.toThrow(/source|projection|CRS/i)
  expect(f.host.addLayer).not.toHaveBeenCalled()
})

test('invalid late geometry removes every previous and partial measurement and reports the failure', async () => {
  const f = fixture(grid)
  const handle = await createMeasureWhileDraw(f.options)
  const sketch = start(f.draw, [[350000, 6650000], [350000, 6650000]])
  sketch.geometry.setCoordinates([[350000, 6650000], [350100, 6650000]])
  expect(labels(handle)).toHaveLength(1)
  sketch.geometry.setCoordinates([[350000, 6650000], [350100, 6650000], [NaN, 6650100]])
  expect(labels(handle)).toEqual([])
  expect(f.errors).toHaveLength(1)
  handle.cleanup()
})

test('coincident cursor positions have no invented north bearing, and cleanup detaches drawing listeners', async () => {
  const f = fixture(grid)
  const handle = await createMeasureWhileDraw(f.options)
  const sketch = start(f.draw, [[350000, 6650000], [350000, 6650000]])
  sketch.geometry.setCoordinates([[350000, 6650000], [350000, 6650000]])
  expect(labels(handle)).toEqual(['0.00 m'])
  handle.cleanup()
  handle.cleanup()
  expect(f.host.removeLayer).toHaveBeenCalledTimes(1)
  sketch.geometry.setCoordinates([[350000, 6650000], [350100, 6650100]])
  expect(labels(handle)).toEqual([])
  f.draw.dispatchEvent(new DrawEvent('drawstart', sketch.feature))
  expect(labels(handle)).toEqual([])
})

test('draw completion rebuilds final geometry and preserves its labels while abort clears them', async () => {
  const f = fixture(grid)
  const handle = await createMeasureWhileDraw(f.options)
  const sketch = start(f.draw, [[350000, 6650000], [350000, 6650000]])
  sketch.geometry.setCoordinates([[350000, 6650000], [350100, 6650000], [350100, 6650100]])
  f.draw.dispatchEvent(new DrawEvent('drawend', sketch.feature))
  expect(labels(handle)).toEqual(['100.00 m  90.0° E', '100.00 m  0.0° N', 'Σ 200.00 m'])
  sketch.geometry.setCoordinates([[350000, 6650000], [350500, 6650500]])
  expect(labels(handle)).toHaveLength(3)
  const next = start(f.draw, [[350000, 6650000], [350000, 6650000]])
  next.geometry.setCoordinates([[350000, 6650000], [350100, 6650000]])
  expect(labels(handle)).toHaveLength(1)
  f.draw.dispatchEvent(new DrawEvent('drawabort', next.feature))
  expect(labels(handle)).toEqual([])
  handle.cleanup()
})
