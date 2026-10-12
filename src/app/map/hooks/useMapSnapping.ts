'use client'

import { useEffect } from 'react'
import type OLMap from 'ol/Map'
import type VectorSource from 'ol/source/Vector'
import type Feature from 'ol/Feature'
import { logger } from '@/lib/logger'
import {
  createSnapInteraction,
  type SnapMode,
  type SnapType,
} from '@/lib/surveyMapEngine/ol/snapping'

interface UseMapSnappingParams {
  mapInstance: React.RefObject<OLMap | null>
  mapReady: boolean
  drawSource: VectorSource | null
  parcelSource: VectorSource | null
  beaconSource: VectorSource | null
  enabled: boolean
  mode: SnapMode
  pixelTolerance: number
  snapTypes: Set<SnapType>
}

/** Own one OpenLayers Snap interaction over the map's selected vector sources.
 * This keeps target selection and tolerance in sync, and puts Snap before
 * drawing/modifying interactions so it can adjust their browser-event coords. */
export function useMapSnapping({
  mapInstance,
  mapReady,
  drawSource,
  parcelSource,
  beaconSource,
  enabled,
  mode,
  pixelTolerance,
  snapTypes,
}: UseMapSnappingParams) {
  useEffect(() => {
    const map = mapInstance.current
    if (!mapReady || !map || !enabled) return

    const sources = [
      snapTypes.has('drawn') ? drawSource : null,
      snapTypes.has('parcels') ? parcelSource : null,
      snapTypes.has('beacons') ? beaconSource : null,
    ].filter((source): source is VectorSource => source !== null)
    if (sources.length === 0) return

    let cancelled = false
    let snapInteraction: import('ol/interaction/Snap').default | null = null
    const listenerKeys: import('ol/events').EventsKey[] = []
    const featureCounts = new Map<Feature, number>()

    void (async () => {
      try {
        const [{ default: Collection }, { unByKey }] = await Promise.all([
          import('ol/Collection'),
          import('ol/Observable'),
        ])
        if (cancelled || mapInstance.current !== map) return

        const features = new Collection<Feature>()
        const retainFeature = (feature: Feature) => {
          const count = featureCounts.get(feature) ?? 0
          featureCounts.set(feature, count + 1)
          if (count === 0) features.push(feature)
        }
        const releaseFeature = (feature: Feature) => {
          const count = featureCounts.get(feature) ?? 0
          if (count <= 1) {
            featureCounts.delete(feature)
            features.remove(feature)
          } else {
            featureCounts.set(feature, count - 1)
          }
        }

        for (const source of sources) {
          const sourceFeatures = new Set(source.getFeatures())
          sourceFeatures.forEach(retainFeature)
          listenerKeys.push(
            source.on('addfeature', (event) => {
              const feature = event.feature as Feature | undefined
              if (!feature || sourceFeatures.has(feature)) return
              sourceFeatures.add(feature)
              retainFeature(feature)
            }),
            source.on('removefeature', (event) => {
              const feature = event.feature as Feature | undefined
              if (!feature || !sourceFeatures.delete(feature)) return
              releaseFeature(feature)
            }),
            source.on('clear', () => {
              sourceFeatures.forEach(releaseFeature)
              sourceFeatures.clear()
            }),
          )
        }

        const interaction = await createSnapInteraction(features, pixelTolerance, mode)
        if (cancelled || mapInstance.current !== map) {
          unByKey(listenerKeys)
          return
        }
        map.getInteractions().insertAt(0, interaction)
        snapInteraction = interaction
      } catch (error) {
        if (!cancelled) {
          logger.error('[useMapSnapping] Could not configure map snapping', { error })
        }
      }
    })()

    return () => {
      cancelled = true
      if (listenerKeys.length > 0) {
        void import('ol/Observable').then(({ unByKey }) => unByKey(listenerKeys))
      }
      if (snapInteraction) map.removeInteraction(snapInteraction)
    }
  }, [
    mapInstance,
    mapReady,
    drawSource,
    parcelSource,
    beaconSource,
    enabled,
    mode,
    pixelTolerance,
    snapTypes,
  ])
}
