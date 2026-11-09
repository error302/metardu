import { requiredValue } from '@/test-utils/requiredValue'
import React, { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import Map from 'ol/Map'
import Collection from 'ol/Collection'
import VectorLayer from 'ol/layer/Vector'
import CircleStyle from 'ol/style/Circle'
import RegularShape from 'ol/style/RegularShape'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { readSketchPointDetails, updateSketchPointDetails } from '@/app/map/utils/sketchPointDetails'
import { createSketchStyle, defaultSketchAppearance } from '@/app/map/utils/sketchAppearance'
import type { MapContextValue } from '@/app/map/MapReactContext'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import XYZ from 'ol/source/XYZ'
import { useMapBasemaps } from '@/app/map/hooks/useMapBasemaps'
import { computeStakeoutState, formatBearingDmsInt as formatBearingWCB } from '@/lib/surveyMapEngine/ol/stakeout'
import { StakeoutPanel } from '@/components/map/StakeoutPanel'
import { useMapInteractions } from '@/app/map/hooks/useMapInteractions'

jest.mock('ol/Map')
let mockContext: Partial<MapContextValue> = {}
let container: HTMLDivElement
let root: Root
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers() })
jest.mock('@/app/map/MapReactContext', () => ({ useMapContext: () => mockContext }))
jest.mock('@/lib/surveyMapEngine/ol/stakeoutVoice', () => ({ stakeoutVoice: { stop: jest.fn(), speakGuidance: jest.fn() } }))

test('dark basemap uses a key-free source and isolates its rendering from survey overlays', () => {
  let basemaps: ReturnType<typeof useMapBasemaps> | undefined
  function Harness() { basemaps = useMapBasemaps(); return null }
  act(() => root.render(<Harness />))
  const layers = requiredValue(basemaps).createBasemaps({ TileLayer, OSM, XYZ })
  const source = layers.dark.getSource() as XYZ
  const url = requiredValue(source.getTileUrlFunction()([3, 4, 3], 1, requiredValue(source.getProjection())))
  expect(url).toBe('https://tile.openstreetmap.org/3/4/3.png')
  expect(layers.dark.getClassName()).toBe('metardu-dark-basemap')
  expect(layers.osm.getClassName()).not.toBe(layers.dark.getClassName())
})

test.each([0, 10, NaN, -1])('proximity never certifies stakeout with accuracy %s', accuracy => {
  const state = computeStakeoutState({ easting: 0, northing: 0, accuracy }, { easting: 0.2, northing: 0 })
  expect(state.proximityLabel).not.toBe('ARRIVED')
})

test('bearing rounding carries seconds and wraps a full circle', () => {
  expect(formatBearingWCB(359.999999)).toBe('0°00\'00"')
  expect(formatBearingWCB(12.999999)).toBe('13°00\'00"')
})

test('opacity adjusts all basemaps without fading survey drawings', () => {
  const basemapLayers = ['osm', 'satellite', 'dark', 'terrain'].map(id => {
    const layer = new TileLayer({ source: new XYZ() })
    layer.set('basemapId', id)
    return layer
  })
  const drawing = new VectorLayer()
  const layers = [...basemapLayers, drawing]
  const map = new Map()
  map.on = jest.fn()
  map.un = jest.fn()
  jest.spyOn(map, 'getLayers').mockReturnValue(new Collection(layers))
  let interactions: ReturnType<typeof useMapInteractions> | undefined
  function Harness() {
    interactions = useMapInteractions({
      mapInstance: { current: map }, drawLayerRef: { current: drawing },
      sketchAppearanceRef: { current: defaultSketchAppearance },
      drawSourceRef: { current: null }, drawInteractionRef: { current: null },
      selectInteractionRef: { current: null }, modifyInteractionRef: { current: null },
      measureInteractionRef: { current: null }, measureSourceRef: { current: null },
      measureLayerRef: { current: null }, annotationLayerRef: { current: null },
      cleanupRef: { current: null }, popupRef: { current: null },
      drawMode: 'none', editMode: false, measureMode: 'none', showAnnotations: false,
      gpsTracking: false, stakeoutActive: false, stakeoutTarget: null, gpsPos: null, gpsPosInSurveyCrs: null,
      hasFeature: () => false, setDrawMode: jest.fn(), setEditMode: jest.fn(), setMeasureMode: jest.fn(),
      setMeasureResult: jest.fn(), setFeatureCount: jest.fn(), setSelectedFeature: jest.fn(),
      setFeatureName: jest.fn(), setGpsTracking: jest.fn(), setGpsPos: jest.fn(),
      setStakeoutTarget: jest.fn(), setStakeoutActive: jest.fn(), setStakeoutState: jest.fn(),
      setShowAnnotations: jest.fn(), setSaveMsg: jest.fn(), projectId: null, currentSurveyCrs: null,
      pushHistory: jest.fn(), toggleGPS: jest.fn(),
    })
    return null
  }
  act(() => root.render(<Harness />))
  const setOpacity = jest.fn()
  requiredValue(interactions).handleOpacityChange(0.5, setOpacity)
  expect(setOpacity).toHaveBeenCalledWith(0.5)
  expect(layers.map(layer => layer.getOpacity())).toEqual([0.5, 0.5, 0.5, 0.5, 1])
})

test.each(['drawn', 'draft', 'selected'] as const)('sketch appearance updates the line and dot together (%s)', variant => {
  const appearance = { current: defaultSketchAppearance }
  const getStyle = createSketchStyle(appearance, variant)
  const output = getStyle()
  const style = Array.isArray(output) ? output[0] : output
  expect(style.getStroke()?.getColor()).toEqual([209, 123, 71, 1])
  expect((style.getImage() as CircleStyle).getRadius()).toBe(7)

  appearance.current = { ...defaultSketchAppearance, lineOpacity: 40, pointSize: 20 }
  expect(getStyle()).toBe(style)
  expect(style.getStroke()?.getColor()).toEqual([209, 123, 71, 0.4])
  expect((style.getImage() as CircleStyle).getRadius()).toBe(10)
})

test('line pointer changes shape without changing the stored sketch point symbol', () => {
  const appearance = { current: defaultSketchAppearance }
  const pointer = createSketchStyle(appearance, 'draft', true)
  const point = createSketchStyle(appearance)
  const getImage = (style: ReturnType<typeof pointer>) => Array.isArray(style) ? style[0].getImage() : style.getImage()
  expect(getImage(pointer())).toBeInstanceOf(CircleStyle)
  appearance.current = { ...defaultSketchAppearance, linePointerShape: 'square' }
  expect((getImage(pointer()) as RegularShape).getAngle()).toBe(Math.PI / 4)
  appearance.current = { ...defaultSketchAppearance, linePointerShape: 'diamond' }
  expect((getImage(pointer()) as RegularShape).getAngle()).toBe(0)
  appearance.current = { ...defaultSketchAppearance, linePointerShape: 'crosshair' }
  expect((getImage(pointer()) as RegularShape).getRadius2()).toBeCloseTo(1.54)
  expect(getImage(point())).toBeInstanceOf(CircleStyle)
})

test('sketch point details keep the point coordinate and unrelated properties', () => {
  const geometry = new Point([10, 20])
  const feature = new Feature({ geometry, pointName: 'Imported point', source: 'field file' })
  expect(readSketchPointDetails(feature).name).toBe('Imported point')
  feature.set('elevation', '101.42')
  expect(updateSketchPointDetails(feature, { ...readSketchPointDetails(feature), name: 'Renamed point' })).toBe(true)
  expect(feature.get('elevation')).toBe('101.42')
  expect(updateSketchPointDetails(feature, readSketchPointDetails(feature))).toBe(false)
  const details = { name: 'Culvert 12', code: 'CULV', description: 'Inlet', elevation: '101.42' }
  expect(() => updateSketchPointDetails(feature, { ...details, elevation: '1e100' })).toThrow('finite decimal')
  updateSketchPointDetails(feature, details)
  expect(readSketchPointDetails(feature)).toEqual(details)
  expect(feature.get('source')).toBe('field file')
  expect(feature.getGeometry()?.getCoordinates()).toEqual([10, 20])
  const style = createSketchStyle({ current: defaultSketchAppearance })(feature)
  expect(Array.isArray(style) && style[1].getText()?.getText()).toBe('Culvert 12')
})

test('unknown accuracy stays unknown and the navigation panel remains cancellable near target', () => {
  jest.useFakeTimers()
  mockContext = {
    stakeoutActive: true, stakeoutTarget: { e: 500000, n: 9900000 },
    stakeoutState: null, gpsPos: null, deactivateStakeout: jest.fn(),
    audioMuted: true, setAudioMuted: jest.fn(), isMobile: true,
  }
  act(() => root.render(<StakeoutPanel />))
  expect(container.textContent).toContain('Unknown')
  mockContext = { ...mockContext, stakeoutState: computeStakeoutState(
    { easting: 500000, northing: 9900000, accuracy: 0.1 },
    { easting: 500000, northing: 9900000 },
  ) }
  act(() => root.render(<StakeoutPanel />))
  act(() => jest.advanceTimersByTime(4000))
  mockContext = { ...mockContext, stakeoutState: { ...requiredValue(mockContext.stakeoutState) } }
  act(() => root.render(<StakeoutPanel />))
  expect(container.querySelector('[aria-label="Cancel stakeout"]')).not.toBeNull()
  jest.useRealTimers()
})
