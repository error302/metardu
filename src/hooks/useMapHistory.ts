'use client'

import { useRef, useState, useCallback } from 'react'
import type { HistoryEntry, MapContext } from './useMapTypes'
import { cloneMapDrawingFeature } from '@/lib/mapDrawing/codec'

/**
 * Manages undo/redo history for the draw source features.
 * Maintains a stack of complete cloned feature snapshots (max 50 entries).
 */
export function useMapHistory(ctx: MapContext) {
  const historyRef = useRef<HistoryEntry[]>([])
  const historyIndexRef = useRef(-1)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // ── Push current state to history ──
  const pushHistory = useCallback(() => {
    const drawSource = ctx.drawSourceRef.current
    if (!drawSource) return
    // Clone before changing history; unsupported/circular metadata cannot clear the live drawing.
    const features = drawSource.getFeatures().map(cloneMapDrawingFeature)
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
    newHistory.push({ features })
    if (newHistory.length > 50) newHistory.shift()
    historyRef.current = newHistory
    historyIndexRef.current = newHistory.length - 1
    setCanUndo(historyIndexRef.current > 0)
    setCanRedo(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Restore features from a history entry ──
  const restoreEntry = useCallback((entry: HistoryEntry): boolean => {
    const drawSource = ctx.drawSourceRef.current
    if (!drawSource) return false
    const features = entry.features.map(cloneMapDrawingFeature)
    ctx.selectInteractionRef.current?.getFeatures().clear()
    ctx.setSelectedFeature(null)
    ctx.setFeatureName('')
    drawSource.clear()
    drawSource.addFeatures(features)
    ctx.setFeatureCount(features.length)
    return true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const undo = useCallback(async () => {
    if (historyIndexRef.current <= 0 || !ctx.drawSourceRef.current) return
    const index = historyIndexRef.current - 1
    if (!restoreEntry(historyRef.current[index])) return
    historyIndexRef.current = index
    setCanUndo(index > 0)
    setCanRedo(index < historyRef.current.length - 1)
  }, [ctx.drawSourceRef,restoreEntry])

  const redo = useCallback(async () => {
    if (historyIndexRef.current >= historyRef.current.length - 1 || !ctx.drawSourceRef.current) return
    const index = historyIndexRef.current + 1
    if (!restoreEntry(historyRef.current[index])) return
    historyIndexRef.current = index
    setCanUndo(index > 0)
    setCanRedo(index < historyRef.current.length - 1)
  }, [ctx.drawSourceRef,restoreEntry])

  // ── Clear history (used by "Clear All") ──
  const clearHistory = useCallback(() => {
    historyRef.current = []
    historyIndexRef.current = -1
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
