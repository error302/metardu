/**
 * METARDU useSubdivision Hook
 *
 * React hook for managing subdivision state and map interactions.
 * Follows the patterns established in useMeasurement.ts.
 *
 * Provides:
 * - State management for subdivision method, parameters, and results
 * - Map layer management (add/remove subdivision overlay)
 * - Split line drawing interaction
 * - DXF export trigger
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type Map from 'ol/Map'
import type { SubdivisionMethod, SubdivisionParams, SubdivisionResult, SplitLine } from '@/types/subdivision'
import type { Point2D } from '@/lib/engine/types'
import { subdivide } from '@/lib/engine/subdivision'
import { downloadSubdivisionDXF } from '@/lib/export/subdivisionDXF'
import { createSubdivisionLayer, createSplitLineLayer } from '@/lib/map/subdivisionLayer'

export interface UseSubdivisionOptions {
  /** Parent parcel vertices (EPSG:21037) */
  parentVertices: Point2D[]
  /** OpenLayers map instance */
  map: Map | null
  /** Project name for DXF export */
  projectName?: string
}

export function useSubdivision({
  parentVertices,
  map,
  projectName = 'METARDU_Subdivision',
}: UseSubdivisionOptions) {
  // ─── State ────────────────────────────────────────────────────────────
  const [method, setMethod] = useState<SubdivisionMethod | null>(null)
  const [params, setParams] = useState<SubdivisionParams>({})
  const [result, setResult] = useState<SubdivisionResult | null>(null)
  const [splitLine, setSplitLine] = useState<SplitLine | null>(null)
  const [isDrawingSplitLine, setIsDrawingSplitLine] = useState(false)
  const [isComputing, setIsComputing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Refs for map layers ──────────────────────────────────────────────
  const subdivisionLayerRef = useRef<any>(null)
  const splitLineLayerRef = useRef<any>(null)
  const drawInteractionRef = useRef<any>(null)
  const clickHandlerRef = useRef<any>(null)
  const splitLinePointsRef = useRef<Point2D[]>([])

  // ─── Stable refs for cleanup callbacks ────────────────────────────────
  const mapRef = useRef<Map | null>(null)
  const removeSubdivisionLayerRef = useRef<() => void>(() => {})
  const removeSplitLineLayerRef = useRef<() => void>(() => {})
  const removeDrawInteractionRef = useRef<() => void>(() => {})
  const addSubdivisionLayerRef = useRef<(r: any) => void>(() => {})
  const addSplitLineLayerRef = useRef<(l: any) => void>(() => {})

  // Keep map ref in sync
  useEffect(() => { mapRef.current = map }, [map])

  // Keep stable cleanup/add refs
  useEffect(() => {
    removeSubdivisionLayerRef.current = removeSubdivisionLayer
    removeSplitLineLayerRef.current = removeSplitLineLayer
    removeDrawInteractionRef.current = removeDrawInteraction
    addSubdivisionLayerRef.current = addSubdivisionLayer
    addSplitLineLayerRef.current = addSplitLineLayer
  })

  // ─── Clean up layers on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      removeSubdivisionLayerRef.current()
      removeSplitLineLayerRef.current()
      removeDrawInteractionRef.current()
    }
  }, [])

  // ─── Method selection ────────────────────────────────────────────────

  const selectMethod = useCallback((newMethod: SubdivisionMethod) => {
    setMethod(newMethod)
    setResult(null)
    setError(null)
    removeSubdivisionLayerRef.current()

    // If switching away from single-split, remove split line stuff
    if (newMethod !== 'single-split') {
      setSplitLine(null)
      removeSplitLineLayerRef.current()
      removeDrawInteractionRef.current()
      setIsDrawingSplitLine(false)
      splitLinePointsRef.current = []
    }
  }, [])

  // ─── Parameters ───────────────────────────────────────────────────────

  const updateParams = useCallback((newParams: Partial<SubdivisionParams>) => {
    setParams(prev => ({ ...prev, ...newParams }))
  }, [])

  // ─── Execute subdivision ──────────────────────────────────────────────

  const execute = useCallback(() => {
    if (!method) {
      setError('Select a subdivision method first.')
      return
    }

    if (parentVertices.length < 3) {
      setError('Parent parcel must have at least 3 vertices.')
      return
    }

    // Validate params per method
    if (method === 'single-split' && !splitLine) {
      setError('Draw a split line on the map first.')
      return
    }
    if (method === 'grid' && (!params.rows || !params.cols)) {
      setError('Specify rows and columns for grid subdivision.')
      return
    }
    if (method === 'radial' && (!params.numLots || params.numLots < 2)) {
      setError('Specify at least 2 lots for radial subdivision.')
      return
    }
    if (method === 'area' && (!params.targetArea || params.targetArea <= 0)) {
      setError('Specify a valid target area.')
      return
    }

    setIsComputing(true)
    setError(null)

    try {
      const fullParams: SubdivisionParams = { ...params }
      if (method === 'single-split') {
        fullParams.splitLine = splitLine!
      }

      const subResult = subdivide(parentVertices, method, fullParams)
      setResult(subResult)

      // Add subdivision layer to map
      addSubdivisionLayerRef.current(subResult)
    } catch (err: any) {
      setError(err.message || 'Subdivision computation failed.')
      setResult(null)
    } finally {
      setIsComputing(false)
    }
  }, [method, params, splitLine, parentVertices])

  // ─── Clear everything ────────────────────────────────────────────────

  const clear = useCallback(() => {
    setMethod(null)
    setParams({})
    setResult(null)
    setSplitLine(null)
    setError(null)
    setIsDrawingSplitLine(false)
    splitLinePointsRef.current = []
    removeSubdivisionLayerRef.current()
    removeSplitLineLayerRef.current()
    removeDrawInteractionRef.current()
  }, [])

  // ─── Split line drawing ──────────────────────────────────────────────

  const startSplitLineDrawing = useCallback(() => {
    if (!map) return
    setIsDrawingSplitLine(true)
    splitLinePointsRef.current = []
    setSplitLine(null)
    removeSplitLineLayerRef.current()
    setError(null)
  }, [map])

  // Handle clicks for split line drawing
  useEffect(() => {
    if (!map || !isDrawingSplitLine) return

    const handleClick = async (evt: any) => {
      const [x, y] = evt.coordinate as [number, number]

      // Convert from EPSG:3857 to EPSG:21037
      const { to21037 } = await import('@/lib/map/projection')
      const [e, n] = await to21037(x, y)

      const point: Point2D = { easting: e, northing: n }
      splitLinePointsRef.current = [...splitLinePointsRef.current, point]

      if (splitLinePointsRef.current.length === 1) {
        return
      }

      if (splitLinePointsRef.current.length === 2) {
        const newSplitLine: SplitLine = {
          startPoint: splitLinePointsRef.current[0],
          endPoint: splitLinePointsRef.current[1],
        }
        setSplitLine(newSplitLine)
        setIsDrawingSplitLine(false)
        addSplitLineLayerRef.current(newSplitLine)
      }
    }

    clickHandlerRef.current = handleClick
    map.on('click', handleClick)

    return () => {
      if (clickHandlerRef.current) {
        map.un('click', clickHandlerRef.current)
        clickHandlerRef.current = null
      }
    }
  }, [map, isDrawingSplitLine])

  // ─── DXF export ──────────────────────────────────────────────────────

  const exportDXF = useCallback(() => {
    if (!result) return
    downloadSubdivisionDXF(result, projectName)
  }, [result, projectName])

  // ─── Map layer management (using stable refs to avoid dep warnings) ────

  const removeSubdivisionLayer = useCallback(() => {
    if (mapRef.current && subdivisionLayerRef.current) {
      mapRef.current.removeLayer(subdivisionLayerRef.current)
      subdivisionLayerRef.current = null
    }
  }, [map])

  const addSubdivisionLayer = useCallback(async (subResult: SubdivisionResult) => {
    if (!map) return
    removeSubdivisionLayerRef.current()

    try {
      const layer = await createSubdivisionLayer(subResult)
      map.addLayer(layer)
      subdivisionLayerRef.current = layer
    } catch (err) {
      console.error('Failed to create subdivision layer:', err)
    }
  }, [map, removeSubdivisionLayer])

  const removeSplitLineLayer = useCallback(() => {
    if (mapRef.current && splitLineLayerRef.current) {
      mapRef.current.removeLayer(splitLineLayerRef.current)
      splitLineLayerRef.current = null
    }
  }, [map])

  const removeDrawInteraction = useCallback(() => {
    if (drawInteractionRef.current) {
      drawInteractionRef.current = null
    }
  }, [])

  const addSplitLineLayer = useCallback(async (sLine: SplitLine) => {
    if (!map) return
    removeSplitLineLayerRef.current()

    try {
      const layer = await createSplitLineLayer(sLine)
      if (layer) {
        map.addLayer(layer)
        splitLineLayerRef.current = layer
      }
    } catch (err) {
      console.error('Failed to create split line layer:', err)
    }
  }, [map, removeSplitLineLayer])

  // ─── Center point picking (for radial) ───────────────────────────────

  const pickCenterPoint = useCallback(() => {
    if (!map) return

    const handleMapClick = async (evt: any) => {
      const [x, y] = evt.coordinate as [number, number]
      const { to21037 } = await import('@/lib/map/projection')
      const [e, n] = await to21037(x, y)

      const center: Point2D = { easting: e, northing: n }
      updateParams({ center })

      map.un('click', handleMapClick)
    }

    map.on('click', handleMapClick)

    return () => {
      map.un('click', handleMapClick)
    }
  }, [map, updateParams])

  // ─── Return ──────────────────────────────────────────────────────────

  return {
    // State
    method,
    params,
    result,
    splitLine,
    isDrawingSplitLine,
    isComputing,
    error,

    // Actions
    selectMethod,
    updateParams,
    execute,
    clear,
    startSplitLineDrawing,
    pickCenterPoint,
    exportDXF,
    setSplitLine,
  }
}
