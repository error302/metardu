'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { useMapContext } from '../MapReactContext'

/** Read layer visibility so cached maps and both selectors share one truth. */
export function useVisibleBasemap() {
  const { mapInstance } = useMapContext()
  const subscribe = useCallback((notify: () => void) => {
    const layers = mapInstance.current?.getLayers()
    if (!layers) return () => {}
    const watch = (layer: import('ol/layer/Base').default) => layer.on('change:visible', notify)
    const unwatch = (layer: import('ol/layer/Base').default) => layer.un('change:visible', notify)
    layers.forEach(watch)
    const added = (event: { element: import('ol/layer/Base').default }) => { watch(event.element); notify() }
    const removed = (event: { element: import('ol/layer/Base').default }) => { unwatch(event.element); notify() }
    layers.on('add', added)
    layers.on('remove', removed)
    return () => { layers.forEach(unwatch); layers.un('add', added); layers.un('remove', removed) }
  }, [mapInstance])
  const snapshot = useCallback(() => {
    const layer = mapInstance.current?.getLayers().getArray().find(layer => {
      const id: unknown = layer.get('basemapId')
      return typeof id === 'string' && (['osm', 'satellite', 'terrain', 'dark'].includes(id) || id.startsWith('offline-')) && layer.getVisible()
    })
    return layer ? String(layer.get('basemapId')) : ''
  }, [mapInstance])
  return useSyncExternalStore(subscribe, snapshot, () => '')
}
