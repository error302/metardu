import { requiredValue } from '@/test-utils/requiredValue'
import React, { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import Map from 'ol/Map'
import Collection from 'ol/Collection'
import VectorLayer from 'ol/layer/Vector'
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
      pushHistory: jest.fn(), clearHistory: jest.fn(), toggleGPS: jest.fn(),
    })
    return null
  }
  act(() => root.render(<Harness />))
  const setOpacity = jest.fn()
  requiredValue(interactions).handleOpacityChange(0.5, setOpacity)
  expect(setOpacity).toHaveBeenCalledWith(0.5)
  expect(layers.map(layer => layer.getOpacity())).toEqual([0.5, 0.5, 0.5, 0.5, 1])
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
