'use client'

import { useRef, useState, useCallback } from 'react'
import type Feature from 'ol/Feature'
import type { LineString, Polygon } from 'ol/geom'
import type { HistoryEntry, MapContext } from './useMapTypes'
import { cloneMapDrawingFeature } from '@/lib/mapDrawing/codec'
import { isSimplePolygonRing } from '@/lib/spatial/simplePolygon'

type SketchEntry = HistoryEntry & {
  vertexRange?: { featureIndex: number; min: number; max: number }
}

function findSketchStep(entry: SketchEntry, from: number, direction: -1 | 1): number | null {
  const range = entry.vertexRange
  if (!range || from < range.min || from > range.max) return null
  const geometry = entry.features[range.featureIndex].getGeometry()
  if (geometry?.getType() !== 'Polygon') return from

  // Reclosing a shorter ring can introduce a crossing or leave no area.
  const vertices = (geometry as Polygon).getCoordinates()[0]
    .map(([easting, northing]) => ({ easting, northing }))
  for (let count = from; count >= range.min && count <= range.max; count += direction) {
    if (count === range.max || isSimplePolygonRing(vertices.slice(0, count))) return count
  }
  return null
}

function cloneHistoryFeatures(entry: SketchEntry, vertexCount: number | null) {
  const features = entry.features.map(cloneMapDrawingFeature)
  if (vertexCount === null || !entry.vertexRange) return features

  const geometry = features[entry.vertexRange.featureIndex].getGeometry()
  if (geometry?.getType() === 'LineString') {
    const line = geometry as LineString
    line.setCoordinates(line.getCoordinates().slice(0, vertexCount), line.getLayout())
  } else if (geometry?.getType() === 'Polygon') {
    const polygon = geometry as Polygon
    const ring = polygon.getCoordinates()[0].slice(0, vertexCount)
    polygon.setCoordinates([[...ring, ring[0]]], polygon.getLayout())
  }
  return features
}

/**
 * Manages undo/redo history for the draw source features.
 * Keeps at most 50 action snapshots. Finished sketches share one snapshot
 * across their vertex steps, so long lines do not evict earlier actions.
 */
export function useMapHistory(ctx: MapContext) {
  const historyRef = useRef<SketchEntry[]>([])
  const historyIndexRef = useRef(-1)
  const vertexCountRef = useRef<number | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // ── Push current state to history ──
  const pushHistory = useCallback((completedSketch?: Feature) => {
    const drawSource = ctx.drawSourceRef.current
    if (!drawSource) return
    // Clone before changing history; unsupported/circular metadata cannot clear the live drawing.
    const liveFeatures = drawSource.getFeatures()
    const entry: SketchEntry = { features: liveFeatures.map(cloneMapDrawingFeature) }
    const featureIndex = completedSketch ? liveFeatures.indexOf(completedSketch) : -1
    const geometry = liveFeatures[featureIndex]?.getGeometry()
    if (geometry?.getType() === 'LineString') {
      entry.vertexRange = { featureIndex, min: 2, max: (geometry as LineString).getCoordinates().length }
    } else if (geometry?.getType() === 'Polygon') {
      const rings = (geometry as Polygon).getCoordinates()
      if (rings.length === 1) entry.vertexRange = { featureIndex, min: 3, max: rings[0].length - 1 }
    }

    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
    const previous = newHistory.at(-1)
    const vertexCount = vertexCountRef.current
    if (previous?.vertexRange && vertexCount !== null) {
      newHistory[newHistory.length - 1] = {
        features: cloneHistoryFeatures(previous, vertexCount),
        vertexRange: { ...previous.vertexRange, max: vertexCount },
      }
    }
    newHistory.push(entry)
    if (newHistory.length > 50) newHistory.shift()
    historyRef.current = newHistory
    historyIndexRef.current = newHistory.length - 1
    vertexCountRef.current = null
    setCanUndo(historyIndexRef.current > 0)
    setCanRedo(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Restore features from a history entry ──
  const restoreEntry = useCallback((index: number, vertexCount: number | null = null) => {
    const drawSource = ctx.drawSourceRef.current
    const entry = historyRef.current[index]
    if (!drawSource || !entry) return
    const partial = vertexCount !== null && entry.vertexRange && vertexCount < entry.vertexRange.max ? vertexCount : null
    const features = cloneHistoryFeatures(entry, partial)
    ctx.selectInteractionRef.current?.getFeatures().clear()
    ctx.setSelectedFeature(null)
    ctx.setSelectedFeatures?.([])
    ctx.setFeatureName('')
    const popup = ctx.popupRef.current
    if (popup) {
      popup.className = 'hidden'
      popup.replaceChildren()
      popup.onclick = null
      ctx.mapInstance.current?.getOverlays().getArray()
        .find(overlay => overlay.getElement() === popup)?.setPosition(undefined)
    }
    drawSource.clear()
    drawSource.addFeatures(features)
    ctx.setFeatureCount(features.length)
    historyIndexRef.current = index
    vertexCountRef.current = partial
    setCanUndo(index > 0)
    setCanRedo(partial !== null || index < historyRef.current.length - 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const undo = useCallback(async () => {
    const index = historyIndexRef.current
    if (index <= 0) return
    const entry = historyRef.current[index]
    const count = vertexCountRef.current ?? entry.vertexRange?.max
    const previous = count === undefined ? null : findSketchStep(entry, count - 1, -1)
    if (previous !== null) {
      restoreEntry(index, previous)
      return
    }
    restoreEntry(index - 1)
  }, [restoreEntry])

  const redo = useCallback(async () => {
    const index = historyIndexRef.current
    const count = vertexCountRef.current
    if (count !== null) {
      restoreEntry(index, findSketchStep(historyRef.current[index], count + 1, 1))
      return
    }
    const next = historyRef.current[index + 1]
    if (next) restoreEntry(index + 1, findSketchStep(next, next.vertexRange?.min ?? 0, 1))
  }, [restoreEntry])

  // ── Clear history (used by "Clear All") ──
  const clearHistory = useCallback(() => {
    historyRef.current = []
    historyIndexRef.current = -1
    vertexCountRef.current = null
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  return {
    pushHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    historyRef,
    historyIndexRef,
  }
}
