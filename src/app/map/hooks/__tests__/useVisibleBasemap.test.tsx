import { act, renderHook } from '@testing-library/react'
import Collection from 'ol/Collection'
import TileLayer from 'ol/layer/Tile'
import type BaseLayer from 'ol/layer/Base'
import { MapProvider, type MapContextValue } from '../../MapReactContext'
import { useVisibleBasemap } from '../useVisibleBasemap'

it('keeps selectors in sync when cached layers are added, hidden or removed without pointer movement', () => {
  const osm = new TileLayer({ visible: true })
  osm.set('basemapId', 'osm')
  const layers = new Collection<BaseLayer>([osm])
  const value = { mapInstance: { current: { getLayers: () => layers } } } as unknown as MapContextValue
  const { result, unmount } = renderHook(useVisibleBasemap, { wrapper: ({ children }) => <MapProvider value={value}>{children}</MapProvider> })
  expect(result.current).toBe('osm')
  const cached = new TileLayer({ visible: true })
  cached.set('basemapId', 'offline-synthetic')
  act(() => { osm.setVisible(false); layers.push(cached) })
  expect(result.current).toBe('offline-synthetic')
  act(() => { cached.setVisible(false); osm.setVisible(true) })
  expect(result.current).toBe('osm')
  act(() => { osm.setVisible(false); cached.setVisible(true); layers.remove(cached) })
  expect(result.current).toBe('')
  unmount()
})
