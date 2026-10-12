import React, { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import XYZ from 'ol/source/XYZ'
import { useMapBasemaps } from '@/app/map/hooks/useMapBasemaps'
import { computeStakeoutState, formatBearingDmsInt as formatBearingWCB } from '@/lib/surveyMapEngine/ol/stakeout'
import { StakeoutPanel } from '@/components/map/StakeoutPanel'
import { useMapInteractions } from '@/app/map/hooks/useMapInteractions'

let mockContext: any
let container: HTMLDivElement
let root: Root
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers() })
jest.mock('@/app/map/MapReactContext', () => ({ useMapContext: () => mockContext }))
jest.mock('@/lib/surveyMapEngine/ol/stakeoutVoice', () => ({ stakeoutVoice: { stop: jest.fn(), speakGuidance: jest.fn() } }))

test('dark basemap uses a key-free source and isolates its rendering from survey overlays', () => {
  let basemaps: ReturnType<typeof useMapBasemaps>
  function Harness() { basemaps = useMapBasemaps(); return null }
  act(() => root.render(<Harness />))
  const layers = basemaps!.createBasemaps({ TileLayer, OSM, XYZ })
  const source = layers.dark.getSource() as XYZ
  const url = source.getTileUrlFunction()([3, 4, 3], 1, source.getProjection()!)!
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
  const layers = ['osm', 'satellite', 'dark', 'terrain', 'drawing'].map(id => {
    const layer = new TileLayer({ source: new XYZ() })
    layer.set('basemapId', id)
    return layer
  })
  const map = { on: jest.fn(), un: jest.fn(), getLayers: () => ({ getArray: () => layers }) }
  let interactions: ReturnType<typeof useMapInteractions>
  function Harness() {
    interactions = useMapInteractions({ mapInstance: { current: map }, drawLayerRef: { current: layers[4] } } as any)
    return null
  }
  act(() => root.render(<Harness />))
  const setOpacity = jest.fn()
  interactions!.handleOpacityChange(0.5, setOpacity)
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
  mockContext = { ...mockContext, stakeoutState: { ...mockContext.stakeoutState } }
  act(() => root.render(<StakeoutPanel />))
  expect(container.querySelector('[aria-label="Cancel stakeout"]')).not.toBeNull()
  jest.useRealTimers()
})
