'use client'

/**
 * useProjectPoints — /map project survey-point layer lifecycle
 * (plan Phase 5: MapClient thinning).
 *
 * Loads the project's own survey points (control points vs topo points) into
 * a styled OL vector layer through the engine's point-loading adapter
 * (`ol/pointLoading`), keeps the layer reference for visibility toggling,
 * and reloads when the project changes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createProjectPointsLayer } from '@/lib/surveyMapEngine/ol/pointLoading'
import { logger } from '@/lib/logger'

export interface UseProjectPointsParams {
  schemeProjectId: string | null
  mapInstance: React.RefObject<import('ol/Map').default | null>
  mapReady: boolean
}

export function useProjectPoints({ schemeProjectId, mapInstance, mapReady }: UseProjectPointsParams) {
  const [projectPointsCount, setProjectPointsCount] = useState(0)
  const [projectPointsLoading, setProjectPointsLoading] = useState(false)
  const [projectPointsError, setProjectPointsError] = useState<string | null>(null)
  const [projectCrs, setProjectCrs] = useState<string | null>(null)
  const [projectCrsProjectId, setProjectCrsProjectId] = useState<string | null>(null)
  const [showProjectPoints, setShowProjectPoints] = useState(true)
  const loadedProjectIdRef = useRef<string | null>(null)
  const currentProjectIdRef = useRef(schemeProjectId)
  currentProjectIdRef.current = schemeProjectId
  const requestIdRef = useRef(0)
  const projectPointsCleanupRef = useRef<(() => void) | null>(null)
  const projectPointsLayerRef = useRef<import('ol/layer/Vector').default | null>(null)

  const loadProjectPoints = useCallback(async () => {
    if (!schemeProjectId || !mapInstance.current) return

    const requestId = ++requestIdRef.current
    setProjectPointsLoading(true)
    setProjectPointsError(null)
    setProjectCrs(null)
    setProjectPointsCount(0)
    setShowProjectPoints(true)
    try {
      // Clean up existing points layer
      if (projectPointsCleanupRef.current) {
        projectPointsCleanupRef.current()
        projectPointsCleanupRef.current = null
        projectPointsLayerRef.current = null
      }

      const result = await createProjectPointsLayer(schemeProjectId, mapInstance.current, {
        onViewportStatus: (status) => {
          if (requestId !== requestIdRef.current || currentProjectIdRef.current !== schemeProjectId) return
          setProjectPointsCount(status.pointCount)
          setProjectPointsError(status.message)
        },
      })
      if (requestId !== requestIdRef.current || currentProjectIdRef.current !== schemeProjectId) {
        result.cleanup()
        return
      }
      projectPointsCleanupRef.current = result.cleanup
      projectPointsLayerRef.current = result.pointsLayer
      loadedProjectIdRef.current = schemeProjectId
      setProjectCrs(result.projectCrs)
      setProjectCrsProjectId(schemeProjectId)
      setProjectPointsCount(result.pointCount)
    } catch (err) {
      if (requestId !== requestIdRef.current || currentProjectIdRef.current !== schemeProjectId) return
      logger.error('[useProjectPoints] Failed to load project points:', { error: err })
      loadedProjectIdRef.current = schemeProjectId
      setProjectPointsCount(0)
      setProjectCrs(null)
      setProjectCrsProjectId(null)
      setProjectPointsError(
        err instanceof Error && err.message.includes('no declared coordinate reference system')
          ? 'Project survey points are hidden because no coordinate reference system is declared. Set the project reference system, then reload the map.'
          : 'Project survey points could not be loaded. Check the connection and reload the map.',
      )
    } finally {
      if (requestId === requestIdRef.current) setProjectPointsLoading(false)
    }
  }, [schemeProjectId, mapInstance])

  // Load once for each linked project. The CRS is returned even when the
  // project currently has no points, so downstream survey tools can still
  // use the saved declaration without guessing from the map view.
  useEffect(() => {
    if (!schemeProjectId) {
      requestIdRef.current++
      if (loadedProjectIdRef.current) {
        projectPointsCleanupRef.current?.()
        projectPointsCleanupRef.current = null
        projectPointsLayerRef.current = null
      }
      loadedProjectIdRef.current = null
      setProjectCrs(null)
      setProjectCrsProjectId(null)
      setProjectPointsCount(0)
      setProjectPointsError(null)
      setProjectPointsLoading(false)
      setShowProjectPoints(true)
      return
    }
    if (mapReady && loadedProjectIdRef.current !== schemeProjectId) {
      void loadProjectPoints()
    }
  }, [schemeProjectId, mapReady, loadProjectPoints])

  useEffect(() => () => {
    requestIdRef.current++
    projectPointsCleanupRef.current?.()
    projectPointsCleanupRef.current = null
    projectPointsLayerRef.current = null
  }, [])

  // Toggle points layer visibility
  const toggleProjectPointsVisibility = useCallback(() => {
    if (!projectPointsLayerRef.current) return
    const newVisible = !showProjectPoints
    projectPointsLayerRef.current.setVisible(newVisible)
    setShowProjectPoints(newVisible)
  }, [showProjectPoints])

  return {
    projectPointsCount,
    projectPointsLoading,
    projectPointsError,
    projectCrs: projectCrsProjectId === schemeProjectId ? projectCrs : null,
    showProjectPoints,
    loadProjectPoints,
    toggleProjectPointsVisibility,
  }
}
