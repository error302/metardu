import type Map from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import Polygon from 'ol/geom/Polygon'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import VectorSource from 'ol/source/Vector'
import { DrawEvent } from 'ol/interaction/Draw'
import type Interaction from 'ol/interaction/Interaction'
import { createEditingInteractionStack, createSubdivisionInteraction } from '../ol/cadastralEditing'
import { DISPLAY_CRS, surveyArea, transformPoint } from '@/lib/spatial/projectCrs'

jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn() } }))

const grid = 'EPSG:32633'
function parcel() {
  const coordinates = [[350000, 6650000], [350100, 6650000], [350100, 6650100], [350000, 6650100], [350000, 6650000]]
    .map(([x, y]) => transformPoint(x, y, grid, DISPLAY_CRS))
  const feature = new Feature<Geometry>(new Polygon([coordinates]))
  feature.setId('synthetic-parent')
  feature.set('parcel_reference', 'synthetic-retained-reference')
  return feature
}

test('the subdivision interaction delivers two complete grid parcels without replacing its parent automatically', async () => {
  const parent = parcel()
  const source = new VectorSource({ features: [parent] })
  const onComplete = jest.fn<void, [Feature, Feature]>()
  const errors: Error[] = []
  const options = { source, targetFeature: parent, sourceProjection: DISPLAY_CRS, projectCrs: grid, onComplete, onError: (error: Error) => { errors.push(error) } }
  const handle = await createSubdivisionInteraction(options)
  const cut = [[350050, 6649990], [350050, 6650110]].map(([x, y]) => transformPoint(x, y, grid, DISPLAY_CRS))
  handle.draw.dispatchEvent(new DrawEvent('drawend', new Feature<Geometry>(new LineString(cut))))
  await Promise.resolve()
  expect(errors).toEqual([])
  expect(onComplete).toHaveBeenCalledTimes(1)
  const children = onComplete.mock.calls[0]
  if (!children) throw new Error('Subdivision was not delivered')
  for (const child of children) {
    const geometry = child.getGeometry()
    expect(geometry).toBeInstanceOf(Polygon)
    if (!(geometry instanceof Polygon)) throw new Error('A non-polygon was delivered')
    const ring = geometry.getCoordinates()[0].map(([x, y]) => transformPoint(x, y, DISPLAY_CRS, grid))
    expect(surveyArea(ring, grid)).toBeCloseTo(5000, 3)
    expect(child.get('parcel_reference')).toBe('synthetic-retained-reference')
    expect(child.get('subdivided_from')).toBe('synthetic-parent')
  }
  expect(source.getFeatures()).toEqual([parent])
  handle.cleanup()
})

test('a parent edited during drawing cannot deliver a split of a different revision', async () => {
  const parent = parcel()
  const onComplete = jest.fn<void, [Feature, Feature]>()
  const onError = jest.fn<void, [Error]>()
  const options = { source: new VectorSource({ features: [parent] }), targetFeature: parent, sourceProjection: DISPLAY_CRS, projectCrs: grid, onComplete, onError }
  const handle = await createSubdivisionInteraction(options)
  parent.getGeometry()?.translate(1, 0)
  const cut = [[350050, 6649990], [350050, 6650110]].map(([x, y]) => transformPoint(x, y, grid, DISPLAY_CRS))
  handle.draw.dispatchEvent(new DrawEvent('drawend', new Feature<Geometry>(new LineString(cut))))
  await Promise.resolve()
  expect(onComplete).not.toHaveBeenCalled()
  expect(onError.mock.calls[0]?.[0].message).toMatch(/changed|revision/i)
  handle.cleanup()
})

test('subdivision refuses an undeclared project grid before installing interactions', async () => {
  const parent = parcel()
  const options = { source: new VectorSource({ features: [parent] }), targetFeature: parent, sourceProjection: DISPLAY_CRS, projectCrs: undefined as unknown as string, onComplete: jest.fn() }
  await expect(createSubdivisionInteraction(options)).rejects.toThrow(/project.*CRS|declared/i)
})

test('snapping indexes both actual sources, follows changes and retains features shared by two sources', async () => {
  const shared = new Feature<Geometry>(new Point([0, 0]))
  const primary = new VectorSource({ features: [shared] })
  const secondary = new VectorSource({ features: [shared] })
  const stack = await createEditingInteractionStack({ source: primary, snapSource: secondary, orthogonalConstraint: false })
  // Actual Snap indexing and pixel tolerance, with a deterministic renderer host.
  const host = { getView: () => new View({ projection: DISPLAY_CRS, resolution: 1 }), getPixelFromCoordinate: (coordinate: number[]) => coordinate.slice(0, 2) } as unknown as Map
  stack.snap.setMap(host)
  expect(stack.snap.snapTo([1, 1], [1, 1], host)?.feature).toBe(shared)
  primary.removeFeature(shared)
  expect(stack.snap.snapTo([1, 1], [1, 1], host)?.feature).toBe(shared)
  const added = new Feature<Geometry>(new Point([50, 50]))
  secondary.addFeature(added)
  expect(stack.snap.snapTo([51, 51], [51, 51], host)?.feature).toBe(added)
  secondary.clear(true)
  expect(stack.snap.snapTo([1, 1], [1, 1], host)).toBeNull()
  expect(stack.snap.snapTo([51, 51], [51, 51], host)).toBeNull()
  stack.removeAll()
  // Snap's declaration narrows setMap incorrectly; the base interaction's
  // public contract and Snap's implementation both support detachment.
  const interaction: Interaction = stack.snap
  interaction.setMap(null)
})
