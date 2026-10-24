'use client'
/**
 * Global OpenLayers map. MapClient wires the shared survey engine, project
 * layers, drawing, measurement, set-out and export hooks into the workspace.
 * The header, tool panels, navigation controls and status strip share the
 * scoped layout in map-workspace.css. Controls mount after initialization.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { logger } from '@/lib/logger'
import { useMapHistory } from '@/hooks/useMapHistory'
import type { MapContext } from '@/hooks/useMapTypes'
import MapErrorBoundary from '@/app/map/MapErrorBoundary'
import MapGlobalStyles from '@/app/map/MapGlobalStyles'
import type { BasemapMode, DrawMode, MeasureMode } from '@/app/map/mapTypes'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useSavedProjectDrawing } from '@/app/map/hooks/useSavedProjectDrawing'
import { MapDrawingStatus } from '@/app/map/components/MapDrawingStatus'
import dynamic from 'next/dynamic'
import { useSubscription } from '@/lib/subscription/subscriptionContext'
import { useSchemeLayers } from '@/app/map/hooks/useSchemeLayers'
import { useDigitizingTools } from '@/app/map/hooks/useDigitizingTools'
import { useTraverseParcelPreview } from '@/app/map/hooks/useTraverseParcelPreview'
import { useGpsTracking } from '@/app/map/hooks/useGpsTracking'
import { useMapGpsControl } from '@/app/map/hooks/useMapGpsControl'
import { useProjectPoints } from '@/app/map/hooks/useProjectPoints'
import { useMapPrintFlow } from '@/app/map/hooks/useMapPrintFlow'
import { useMapSnapping } from '@/app/map/hooks/useMapSnapping'
import type { StakeoutState } from '@/lib/surveyMapEngine/ol/stakeout'
import type { MapCleanupRefs } from '@/lib/map/olTypes'

// ── Sub-components (lazy where appropriate) ──
import { MapOverlays } from '@/app/map/components/MapOverlays'
import { MapStatusBar } from '@/app/map/components/MapStatusBar'
import { MapLoadingOverlay } from '@/app/map/components/MapLoadingOverlay'
import { MapNotifications } from '@/app/map/components/MapNotifications'
import { MapRightDock } from '@/app/map/components/MapRightDock'
import { MapOverlayProvider } from '@/app/map/components/MapOverlayManager'
import { MapWorkspaceHeader, MapBasemapBar } from '@/app/map/components/MapWorkspaceHeader'
import { KeyboardShortcutsHelp } from '@/app/map/components/KeyboardShortcutsHelp'
import { MapToolDock } from '@/app/map/components/MapToolDock'
import { MapInteractionToggle } from '@/app/map/components/MapInteractionToggle'
import { IdentifyPanel, type IdentifiedFeature } from '@/app/map/components/IdentifyPanel'
import { SnappingOptions } from '@/app/map/components/SnappingOptions'
import { OsmBuildingsLayer } from '@/app/map/components/OsmBuildingsLayer'
import { resolveMapSurveyCrs } from '@/app/map/mapSurveyCrs'
import { useSelectionStore } from '@/lib/surveyMapEngine/ol/selection'
import type { SnapMode, SnapType } from '@/lib/surveyMapEngine/ol/snapping'

// ── Hooks ──
import { useMapBasemaps } from '@/app/map/hooks/useMapBasemaps'
import { useMapInit } from '@/app/map/hooks/useMapInit'
import { useMapState } from '@/app/map/hooks/useMapState'
import { useMapInteractions } from '@/app/map/hooks/useMapInteractions'
import { useVertexEditing } from '@/hooks/useVertexEditing'
import type { PaperSize, Orientation } from '@/lib/surveyMapEngine/io/printSurface'
import { SurveyMapEngineProvider } from '@/lib/surveyMapEngine/react/SurveyMapEngineContext'
import type { MapExtent } from './MapReactContext'
import { MapProvider, type MapContextValue } from '@/app/map/MapReactContext'
// LINT FIX (2026-08-30): StakeoutPanel is rendered by MapToolDock (and
// FieldDataCollector) — the local import was dead. Building2 unused.
// ── Dynamic imports for heavy components ──
const OfflineTileDownloader = dynamic(
  () => import('@/components/map/OfflineTileDownloader').then(m => ({ default: m.OfflineTileDownloader })),
  { ssr: false }
)

const SheetLayout = dynamic(
  () => import('@/components/map/SheetLayout'),
  { ssr: false, loading: () => null }
)

/* ══════════════════════════════════════════════════════════════════════
 *  POPUP RENDERER
 *  Renders feature popup as raw DOM (OL moves the overlay element out
 *  of React's tree, so we can't use React components here).
 * ══════════════════════════════════════════════════════════════════════ */
function renderPopup(popupElement: HTMLDivElement, data: {
  coordinate?: import('ol/coordinate').Coordinate
  projectName?: string
  stationName?: string
  geometryType?: string
  projectId?: string
  onDelete?: () => void
}, hidePopup: () => void) {
  popupElement.replaceChildren()
  popupElement.className = ''

  const card = document.createElement('div')
  card.className = 'bg-[color-mix(in_srgb,var(--bg-secondary)_95%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-xl shadow-2xl backdrop-blur-xl p-4 min-w-[220px] max-w-[320px]'

  const header = document.createElement('div')
  header.className = 'flex items-start justify-between mb-2'

  const labelWrap = document.createElement('div')
  labelWrap.className = 'flex items-center gap-2'
  const dot = document.createElement('div')
  dot.className = 'w-1.5 h-1.5 rounded-full bg-[var(--accent)]'
  const label = document.createElement('span')
  label.className = 'text-[10px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-semibold'
  label.textContent = data.geometryType || 'Feature'
  labelWrap.append(dot, label)

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5'
  closeButton.textContent = 'x'
  closeButton.addEventListener('click', hidePopup)
  header.append(labelWrap, closeButton)
  card.append(header)

  if (data.projectName) {
    const project = document.createElement('div')
    project.className = 'mb-1'
    project.innerHTML = '<span class="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Project</span>'
    const value = document.createElement('p')
    value.className = 'text-sm font-semibold text-[var(--text-primary)]'
    value.textContent = data.projectName
    project.append(value)
    card.append(project)
  }

  if (data.stationName) {
    const station = document.createElement('div')
    station.className = 'mb-1'
    station.innerHTML = '<span class="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Station</span>'
    const value = document.createElement('p')
    value.className = 'text-sm text-[var(--accent)]'
    value.textContent = data.stationName
    station.append(value)
    card.append(station)
  }

  if (data.projectId) {
    const link = document.createElement('a')
    link.href = `/project/${data.projectId}`
    link.className = 'block mt-2 text-[11px] text-[var(--accent)] hover:underline font-medium'
    link.textContent = 'Go to Project \u2192'
    card.append(link)
  }

  // FIX (2026-08-30): selection popup previously had no way to remove a wrong
  // point — Delete existed only via the tool dock / Del key (unavailable on
  // mobile). Add a delete action directly in the popup.
  if (data.onDelete) {
    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = 'mt-3 w-full py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--error)_15%,transparent)] border border-[color-mix(in_srgb,var(--error)_40%,transparent)] text-[11px] font-medium text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_25%,transparent)] transition-colors'
    deleteBtn.textContent = 'Remove point'
    deleteBtn.addEventListener('click', () => {
      data.onDelete?.()
      hidePopup()
    })
    card.append(deleteBtn)
  }

  popupElement.append(card)
}

/* ══════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════════════ */
export default function MapClient() {
  const search = useSearchParams()
  const session = useSession()
  const projectId = search.get('projectId')
  return <MapWorkspace key={projectId ? `${projectId}:${session.data?.user?.id ?? 'loading'}` : 'unlinked'} />
}

function MapWorkspace() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const searchParams = useSearchParams()
  const { hasFeature } = useSubscription()

  // ── Map refs ──
  const mapRef = useRef<HTMLDivElement>(null)
  const attributionTargetRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<import('ol/Map').default | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const mouseCoordThrottleRef = useRef(0)

  // ── OL layer/interaction refs ──
  const drawSourceRef = useRef<import('ol/source/Vector').default | null>(null)
  const drawLayerRef = useRef<import('ol/layer/Vector').default | null>(null)
  const drawInteractionRef = useRef<import('ol/interaction').Interaction | null>(null)
  const selectInteractionRef = useRef<import('ol/interaction/Select').default | null>(null)
  const modifyInteractionRef = useRef<import('ol/interaction').Interaction | null>(null)
  const measureInteractionRef = useRef<import('ol/interaction').Interaction | null>(null)
  const measureSourceRef = useRef<import('ol/source/Vector').default | null>(null)
  const measureLayerRef = useRef<import('ol/layer/Vector').default | null>(null)
  const annotationLayerRef = useRef<import('ol/layer/Vector').default | null>(null)

  // ── GPS toggle ref (allows interactions hook to call the real toggleGPS) ──
  const toggleGPSRef = useRef<() => void>(() => {})

  // ── Map cleanup refs (replaces _cleanup hack on map object) ──
  const cleanupRef = useRef<MapCleanupRefs | null>(null)

  // ── Project ID from URL params (declared early — used by useMapInteractions) ──
  const schemeProjectId = searchParams.get('projectId')

  // ── UI state ──
  const [mapReady, setMapReady] = useState(false)
  const [browserDrawingReady,setBrowserDrawingReady] = useState(false)
  const [browserDrawingError,setBrowserDrawingError] = useState('')
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const [initError, setInitError] = useState('')
  const [projectCount, setProjectCount] = useState(0)
  const [basemap, setBasemap] = useState<BasemapMode>('osm')
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [measureMode, setMeasureMode] = useState<MeasureMode>('none')
  const [editMode, setEditMode] = useState(false)
  const [mouseCoord, setMouseCoord] = useState<{
    lon: number
    lat: number
    e: number | null
    n: number | null
    epsg: string | null
  } | null>(null)
  const [gpsTracking, setGpsTracking] = useState(false)
  const [gpsPos, setGpsPos] = useState<{ lon: number; lat: number; accuracy: number } | null>(null)
  const [featureCount, setFeatureCount] = useState(0)
  const [importMsg, setImportMsg] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [dragHint, setDragHint] = useState(true)
  const [selectedFeature, setSelectedFeature] = useState<import('ol/Feature').default | null>(null)
  const [selectedFeatures, setSelectedFeatures] = useState<import('ol/Feature').default[]>([])
  const [featureName, setFeatureName] = useState('')
  const [measureResult, setMeasureResult] = useState('')
  const [layerOpacity, setLayerOpacity] = useState(1)
  const [stakeoutTarget, setStakeoutTarget] = useState<{ e: number; n: number } | null>(null)
  const [stakeoutActive, setStakeoutActive] = useState(false)
  const [stakeoutState, setStakeoutState] = useState<StakeoutState | null>(null)
  const [audioMuted, setAudioMuted] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')

  // ── Scheme / project-points / traverse / print state ── (Phase 5: lives in
  //    useSchemeLayers, useProjectPoints, useTraverseParcelPreview, useMapPrintFlow)

  // ── Vertex editing state (Tier 1: VertexEditToolbar) ──
  const [vertexEditingEnabled, setVertexEditingEnabled] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapTolerance, setSnapTolerance] = useState(10)
  const [vertexEditingVertices, setVertexEditingVertices] = useState<Array<{ easting: number; northing: number }>>([])

  // ── Identify Panel state ──
  const [identifiedFeature, setIdentifiedFeature] = useState<IdentifiedFeature | null>(null)

  // ── Digitizing Tools state ──
  const [activeDigitizingTool, setActiveDigitizingTool] = useState<'draw' | 'split' | 'merge' | 'reshape' | 'rotate' | 'offset' | null>(null)
  const [offsetDistance, setOffsetDistance] = useState(5)
  const [rotateAngle, setRotateAngle] = useState(15)
  const [snappingEnabled, setSnappingEnabled] = useState(true)
  const [snappingMode, setSnappingMode] = useState<SnapMode>('vertex_segment')
  const [snappingTolerance, setSnappingTolerance] = useState(10)
  const [snappingTypes, setSnappingTypes] = useState<Set<SnapType>>(new Set(['drawn', 'parcels', 'beacons']))
  const [showSnappingOptions, setShowSnappingOptions] = useState(false)

  // ── OSM Buildings overlay toggle ──
  const [showOsmBuildings, setShowOsmBuildings] = useState(false)
  const [paperSize, setPaperSize] = useState<PaperSize>('a4')
  const [orientation, setOrientation] = useState<Orientation>('landscape')

  // ── Map extent for offline tile dialog (async resolve) ──
  const [offlineMapExtent, setOfflineMapExtent] = useState<MapExtent | null>(null)

  // Map geometry and tile sources stay in EPSG:3857. For an unlinked map,
  // this is only the explicitly selected working survey grid; linked projects
  // always use their persisted reference system instead.
  const [unlinkedSurveyCrs, setUnlinkedSurveyCrs] = useState<string>('EPSG:3857')

  // ── History hook ──
  const ctx: MapContext = useMemo(() => ({
    mapInstance,
    drawSourceRef,
    drawLayerRef,
    measureSourceRef,
    measureLayerRef,
    drawInteractionRef,
    selectInteractionRef,
    modifyInteractionRef,
    measureInteractionRef,
    popupRef,
    setDrawMode,
    setEditMode,
    setMeasureMode,
    setMeasureResult,
    setFeatureCount,
    setSelectedFeature,
    setFeatureName,
    pushHistory: () => {},
  }), [])

  const { pushHistory, undo, redo, canUndo, canRedo, clearHistory } = useMapHistory(ctx)

  // ── Basemaps hook ──
  const { createBasemaps, toggleBasemap: toggleBasemapHook } = useMapBasemaps()

  // Project points API returns the saved project CRS even when there are no
  // points, so the map never infers survey mathematics from its display view.
  const { projectPointsError, projectCrs } = useProjectPoints({ schemeProjectId, mapInstance, mapReady })
  const currentSurveyCrs = useMemo(() => resolveMapSurveyCrs({
    projectId: schemeProjectId,
    declaredProjectCrs: projectCrs,
    selectedUnlinkedSurveyCrs: unlinkedSurveyCrs,
  }), [schemeProjectId, projectCrs, unlinkedSurveyCrs])

  // ── Map initialization ──
  useMapInit({
    mapRef,
    attributionTargetRef,
    setMapReady,
    setInitError,
    setProjectCount,
    setMouseCoord,
    setFeatureCount,
    setImportMsg,
    setSelectedFeature,
    setSelectedFeatures,
    setFeatureName,
    mouseCoordThrottleRef,
    searchParams,
    pushHistory,
    drawSourceRef,
    drawLayerRef,
    measureSourceRef,
    measureLayerRef,
    selectInteractionRef,
    mapInstance,
    cleanupRef,
    popupRef,
    createBasemaps,
    currentSurveyCrs,
    onBrowserDrawingRestored: error => {setBrowserDrawingError(error??'');setBrowserDrawingReady(!error)},
    onPopupRender: renderPopup,
  })

  // ── Map state persistence ──
  useMapState(mapInstance, drawSourceRef, mapReady, schemeProjectId, browserDrawingReady, setBrowserDrawingError)
  const projectDrawing = useSavedProjectDrawing({ projectId:schemeProjectId,mapReady,source:drawSourceRef,map:mapInstance,
    pushHistory,clearHistory,setMessage:setSaveMsg,
    clearSelection:()=>{selectInteractionRef.current?.getFeatures().clear();setSelectedFeature(null);setSelectedFeatures([]);setFeatureName('')} })

  // ── Interactions hook ──

  // ── Scheme layer lifecycle (Phase 5: extracted from MapClient) ──
  const {
    schemeLoading,
    schemeError,
    schemeLoaded,
    schemeParcelCount,
    schemeBlockCount,
    schemeBeaconCount,
    schemeParcelSnapSource,
    schemeBeaconSnapSource,
    showSchemeParcels,
    showSchemeBlocks,
    showSchemeBeacons,
    loadSchemeData,
    toggleSchemeParcelVisibility,
    toggleSchemeBlockVisibility,
    toggleSchemeBeaconVisibility,
    zoomToScheme,
    removeScheme,
  } = useSchemeLayers({
    schemeProjectId,
    mapInstance,
    mapReady,
    currentSurveyCrs,
    setVertexEditingVertices,
  })

  const availableSnapTypes = useMemo(() => {
    const available = new Set<SnapType>(['drawn'])
    if (schemeLoaded && showSchemeParcels && schemeParcelCount > 0 && schemeParcelSnapSource) {
      available.add('parcels')
    }
    if (schemeLoaded && showSchemeBeacons && schemeBeaconCount > 0 && schemeBeaconSnapSource) {
      available.add('beacons')
    }
    return available
  }, [
    schemeLoaded,
    showSchemeParcels,
    showSchemeBeacons,
    schemeParcelCount,
    schemeBeaconCount,
    schemeParcelSnapSource,
    schemeBeaconSnapSource,
  ])

  // ── GPS tracking + project-CRS position (Phase 5: extracted to useGpsTracking) ──
  // Declared before useMapInteractions because the interactions hook consumes
  // the project-CRS GPS position this derives.
  const { gpsPosInSurveyCrs } = useGpsTracking({
    mapInstance,
    mapReady,
    cleanupRef,
    gpsPos,
    setGpsPos,
    currentSurveyCrs,
  })

  // Snap one interaction to all enabled vector layers. It is installed before
  // drawing/editing interactions so OpenLayers can adjust their input coords.
  useMapSnapping({
    mapInstance,
    mapReady,
    drawSource: drawSourceRef.current,
    parcelSource: showSchemeParcels ? schemeParcelSnapSource : null,
    beaconSource: showSchemeBeacons ? schemeBeaconSnapSource : null,
    enabled: snappingEnabled,
    mode: snappingMode,
    pixelTolerance: snappingTolerance,
    snapTypes: snappingTypes,
  })

  const interactions = useMapInteractions({
    mapInstance,
    drawSourceRef,
    drawLayerRef,
    drawInteractionRef,
    selectInteractionRef,
    modifyInteractionRef,
    measureInteractionRef,
    measureSourceRef,
    measureLayerRef,
    annotationLayerRef,
    cleanupRef,
    drawMode,
    editMode,
    measureMode,
    showAnnotations,
    gpsTracking,
    stakeoutActive,
    stakeoutTarget,
    gpsPos,
    gpsPosInSurveyCrs,
    currentSurveyCrs,
    projectId: schemeProjectId,
    saveLinkedDrawing: projectDrawing.save,
    onProjectCreated: id => router.push(`/map?projectId=${encodeURIComponent(id)}`),
    onDrawEnd: (areaSqM, perimeterM, featureType) => {
      if (featureType === 'Polygon') {
        setSaveMsg(`Area: ${areaSqM.toFixed(1)} m² (${(areaSqM / 10000).toFixed(4)} ha) · Perimeter: ${perimeterM.toFixed(1)} m`)
      } else if (featureType === 'LineString') {
        setSaveMsg(`Length: ${perimeterM.toFixed(1)} m`)
      } else {
        setSaveMsg(`Point drawn`)
      }
      setTimeout(() => setSaveMsg(''), 5000)
    },
    onIdentify: (feature) => {
      setSelectedFeature(feature)
      setSelectedFeatures(feature ? [feature] : [])
      const name = (feature?.get?.('pointName') || feature?.get?.('parcelNumber') || feature?.get?.('name')) as string | undefined
      if (name) setFeatureName(name)
    },
    hasFeature,
    setDrawMode,
    setEditMode,
    setMeasureMode,
    setMeasureResult,
    setFeatureCount,
    setSelectedFeature,
    setFeatureName,
    setGpsTracking,
    setGpsPos,
    setStakeoutTarget,
    setStakeoutActive,
    setStakeoutState,
    setShowAnnotations,
    setSaveMsg,
    pushHistory,
    clearHistory,
    popupRef,
    toggleGPS: () => toggleGPSRef.current(), // wired via ref to real toggleGPS
  })

  // ── Vertex editing hook (Tier 1) ──
  const { state: vertexEditState } = useVertexEditing({
    map: mapInstance.current,
    vertices: vertexEditingVertices,
    enabled: vertexEditingEnabled,
    onVerticesChange: setVertexEditingVertices,
    snapTolerance,
    snapEnabled,
    epsg: currentSurveyCrs,
  })

  // Wire GPS toggle (needs interactions reference)
  const toggleGPS = useMapGpsControl({ mapInstance, cleanupRef, mapReady, setGpsTracking, setGpsPos, setStakeoutActive, setSaveMsg })

  // Keep the ref up-to-date so the interactions hook can call the real function
  toggleGPSRef.current = toggleGPS

  // ── Basemap toggle wrapper ──
  const toggleBasemap = useCallback((mode: BasemapMode) => {
    toggleBasemapHook(mapInstance, mode, setBasemap)
  }, [toggleBasemapHook])

  // ── Survey-grid selection (map tiles and geometry remain EPSG:3857) ──
  const handleSurveyGridSelection = useCallback((targetCrs: string) => {
    if (schemeProjectId) {
      setSaveMsg('This project uses its saved CRS for survey calculations. Change it in Project Settings.')
      setTimeout(() => setSaveMsg(''), 4000)
      return
    }
    try {
      resolveMapSurveyCrs({
        projectId: null,
        declaredProjectCrs: null,
        selectedUnlinkedSurveyCrs: targetCrs,
      })
      setUnlinkedSurveyCrs(targetCrs)
      setMeasureMode('none')
      setMeasureResult('')
    } catch (err) {
      logger.warn('[MapClient] Rejected unsupported survey grid:', { error: err })
      setSaveMsg(err instanceof Error ? err.message : 'Choose a supported projected CRS.')
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }, [schemeProjectId])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't hijack keys while the user is typing in any editable control.
      // Covers inputs, textareas, native selects, and contenteditable hosts,
      // plus IME composition (e.g. Windows character composing) which can
      // briefly retarget events and cause accidental Delete mishits.
      const target = e.target as HTMLElement | null
      if (
        e.isComposing ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target && target.isContentEditable)
      ) {
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedFeature) {
          e.preventDefault()
          interactions.deleteSelected()
        }
      } else if (e.key === 'Escape') {
        if (drawMode !== 'none') interactions.toggleDraw('none')
        else if (editMode) interactions.toggleEdit()
        else if (measureMode !== 'none') interactions.toggleMeasure('none')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, selectedFeature, drawMode, editMode, measureMode, interactions])

  useEffect(() => {
    const store = useSelectionStore.getState()
    if (selectedFeature) {
      const rawId = selectedFeature.get('id') as unknown
      store.setSelection({
        kind: 'feature',
        surface: 'map',
        id: typeof rawId === 'string' ? rawId : null,
        name: featureName,
      })
    } else {
      store.clearSelectionFrom('map')
    }
  }, [selectedFeature, featureName])

  useEffect(() => () => useSelectionStore.getState().clearSelectionFrom('map'), [])

  // ── Fade drag hint after 5s ──
  useEffect(() => {
    const timer = setTimeout(() => setDragHint(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  // ── Feature name update wrapper ──
  const handleUpdateFeatureName = useCallback((name: string) => {
    setFeatureName(name)
    interactions.updateFeatureName(name, selectedFeature)
  }, [interactions, selectedFeature])

  // ── Opacity change wrapper ──
  const handleOpacityChange = useCallback((val: number) => {
    interactions.handleOpacityChange(val, setLayerOpacity)
  }, [interactions])

  // ── Coord search wrapper ──
  const handleCoordSearch = useCallback(async (input: string) => {
    await interactions.handleCoordSearchLocal(input)
  }, [interactions])

  // ── Print/sheet-layout flow (Phase 5: extracted to useMapPrintFlow) ──
  const { showSheetLayout, setShowSheetLayout, printPlanGeometry, handlePrintMap, printApi, isPrinting } =
    useMapPrintFlow({ mapInstance, attributionTargetRef, drawSourceRef, currentSurveyCrs, onError: setSaveMsg })

  // ── Offline dialog toggle (async: resolves map extent when opening) ──
  const handleToggleOfflineDialog = useCallback(async (open: boolean) => {
    setOfflineDialogOpen(open)
    if (open) {
      const extent = await interactions.getMapExtent()
      setOfflineMapExtent(extent)
    }
  }, [interactions])

  // ── Digitizing tool interactions (Phase 5: extracted to useDigitizingTools) ──
  const { applyOneShotTool } = useDigitizingTools({
    activeDigitizingTool,
    setActiveDigitizingTool,
    mapInstance,
    mapReady,
    selectedFeature,
    selectedFeatures,
    setSelectedFeature,
    setSelectedFeatures,
    selectInteractionRef,
    offsetDistance,
    rotateAngle,
    drawSourceRef,
    currentSurveyCrs,
    pushHistory,
    setSaveMsg,
  })

  // ── Traverse-to-parcel (Phase 5: extracted to useTraverseParcelPreview) ──
  const {
    traverseParcelPreviewActive,
    hasTraverse,
    createParcelFromTraversePreview: handleCreateParcelFromTraverse,
    confirmTraverseParcel: handleConfirmTraverseParcel,
    cancelTraverseParcel: handleCancelTraverseParcel,
  } = useTraverseParcelPreview({ schemeProjectId, mapInstance, schemeLoaded, setSaveMsg })


  // ── Update stakeout overlay on each GPS position change ──
  useEffect(() => {
    if (stakeoutActive && gpsPos) {
      interactions.updateStakeoutOnGPS()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stakeoutActive, gpsPos])

  // ══════════════════════════════════════════════════════════════════
  //  CONTEXT VALUE (for MapReactContext — eliminates prop drilling)
  // ══════════════════════════════════════════════════════════════════
  const mapContextValue = useMemo<MapContextValue>(() => ({
    mapInstance,
    popupRef,
    mapReady,
    activeDigitizingTool,
    setActiveDigitizingTool,
    offsetDistance,
    setOffsetDistance,
    rotateAngle,
    setRotateAngle,
    snappingEnabled,
    setSnappingEnabled,
    showSnappingOptions,
    setShowSnappingOptions,
    initError,
    projectCount,
    basemap,
    drawMode,
    measureMode,
    editMode,
    mouseCoord,
    gpsTracking,
    gpsPos,
    featureCount,
    projectPointsError,
    importMsg,
    panelOpen,
    dragHint,
    selectedFeature,
    selectedFeatures,
    featureName,
    measureResult,
    layerOpacity,
    stakeoutTarget,
    stakeoutActive,
    stakeoutState,
    audioMuted,
    saveMsg,
    setSaveMsg,
    offlineDialogOpen,
    showAnnotations,
    projectSearch,
    isMobile,
    showOsmBuildings,
    toggleOsmBuildings: () => setShowOsmBuildings(v => !v),
    schemeLoading,
    schemeError,
    schemeLoaded,
    schemeParcelCount,
    schemeBlockCount,
    schemeBeaconCount,
    showSchemeParcels,
    showSchemeBlocks,
    showSchemeBeacons,
    hasTraverse,
    traverseParcelPreviewActive,
    hasProjectId: !!schemeProjectId,
    vertexEditingEnabled,
    snapEnabled,
    snapTolerance,
    vertexEditState: vertexEditState,
    vertexEditingVertices,
    gpsPosInSurveyCrs,
    activeSurveyCrs: unlinkedSurveyCrs,
    currentSurveyCrs,
    applyOneShotTool,
    showSheetLayout,
    isPrinting,
    paperSize,
    orientation,
    setPaperSize,
    setOrientation,
    offlineMapExtent,
    retryInit: () => window.location.reload(),
    schemeProjectId,
    hasFeature,
    canUndo,
    canRedo,
    setPanelOpen,
    setProjectSearch,
    setAudioMuted,
    setOfflineDialogOpen,
    setVertexEditingEnabled,
    setSnapEnabled,
    setSnapTolerance,
    setShowSheetLayout,
    toggleDraw: interactions.toggleDraw,
    toggleEdit: interactions.toggleEdit,
    toggleMeasure: interactions.toggleMeasure,
    toggleAnnotations: interactions.toggleAnnotations,
    toggleBasemap,
    toggleGPS,
    toggleStakeout: interactions.toggleStakeout,
    deleteSelected: interactions.deleteSelected,
    undo,
    redo,
    fitToKenya: interactions.fitToKenya,
    fitToDrawn: interactions.fitToDrawn,
    saveToProject: interactions.saveToProject,
    exportFeatures: interactions.exportFeatures,
    clearDrawn: interactions.clearDrawn,
    updateFeatureName: handleUpdateFeatureName,
    handleOpacityChange,
    handleCoordSearch,
    stakeoutInfo: interactions.stakeoutInfo,
    deactivateStakeout: interactions.deactivateStakeout,
    getMapExtent: interactions.getMapExtent,
    loadSchemeData,
    toggleSchemeParcelVisibility,
    toggleSchemeBlockVisibility,
    toggleSchemeBeaconVisibility,
    zoomToScheme,
    removeScheme,
    createParcelFromTraverse: handleCreateParcelFromTraverse,
    confirmTraverseParcel: handleConfirmTraverseParcel,
    cancelTraverseParcel: handleCancelTraverseParcel,
    selectSurveyGrid: handleSurveyGridSelection,
    printMap: handlePrintMap,
    toggleOfflineDialog: handleToggleOfflineDialog,
  }), [
    mapInstance, popupRef, mapReady, initError, projectCount, basemap, drawMode,
    activeDigitizingTool, offsetDistance, rotateAngle, snappingEnabled, showSnappingOptions,
    measureMode, editMode, mouseCoord, gpsTracking, gpsPos, featureCount, projectPointsError, importMsg,
    panelOpen, dragHint, selectedFeature, selectedFeatures, featureName, measureResult, layerOpacity,
    stakeoutTarget, stakeoutActive, stakeoutState, audioMuted, saveMsg,
    offlineDialogOpen, showAnnotations, projectSearch, isMobile, showOsmBuildings,
    schemeLoading, schemeError, schemeLoaded, schemeParcelCount, schemeBlockCount,
    schemeBeaconCount, showSchemeParcels, showSchemeBlocks, showSchemeBeacons,
    hasTraverse, traverseParcelPreviewActive, schemeProjectId,
    vertexEditingEnabled, snapEnabled, snapTolerance, vertexEditState, vertexEditingVertices,
    gpsPosInSurveyCrs,
    unlinkedSurveyCrs, currentSurveyCrs, setSaveMsg, applyOneShotTool, showSheetLayout, isPrinting,
    paperSize, orientation, offlineMapExtent,
    hasFeature, canUndo, canRedo,
    setPanelOpen, setProjectSearch, setAudioMuted, setOfflineDialogOpen,
    setOrientation, setPaperSize,
    setVertexEditingEnabled, setSnapEnabled, setSnapTolerance, setShowSheetLayout,
    interactions, toggleBasemap, toggleGPS,
    handleUpdateFeatureName, handleOpacityChange, handleCoordSearch,
    loadSchemeData, toggleSchemeParcelVisibility, toggleSchemeBlockVisibility,
    toggleSchemeBeaconVisibility, zoomToScheme, removeScheme,
    handleCreateParcelFromTraverse, handleConfirmTraverseParcel,
    handleCancelTraverseParcel, handleSurveyGridSelection, handlePrintMap,
    handleToggleOfflineDialog,
    undo, redo,
  ])

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <MapErrorBoundary>
      <SurveyMapEngineProvider printApi={printApi}>
      <MapProvider value={mapContextValue}>
      <MapOverlayProvider>
      <div
        id="metardu-global-map"
        className="map-workspace h-[calc(100dvh-9rem-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-4rem)] bg-[var(--bg-primary)] relative overflow-hidden"
        style={{ '--map-bottom-offset': isMobile ? '64px' : '0px', '--map-bottom-clearance': toolsExpanded ? '54px' : '0px' } as React.CSSProperties}
        role="application"
        aria-label="Survey map — use arrow keys to pan, plus/minus to zoom. Press question mark for keyboard shortcuts."
      >
        {/* Map container */}
        <div className="map-canvas-area">
          <div ref={mapRef} className="w-full h-full" aria-label="Interactive survey map" />

          {/* ── Overlays (only when map is ready) ── */}
          {mapReady && (
            <>
              <MapOverlays />

              <MapWorkspaceHeader />
              <MapBasemapBar />

              {/* ── Unified Tool Dock (matching UX on desktop & mobile) ── */}
              <MapToolDock expanded={toolsExpanded} onExpandedChange={setToolsExpanded} />
              {schemeProjectId && <MapDrawingStatus drawing={projectDrawing} />}
              {!schemeProjectId&&browserDrawingError&&<div role="alert" className="absolute z-20 left-3 bottom-24 max-w-[min(90vw,28rem)] rounded-lg bg-[var(--bg-secondary)] border border-[var(--error)] p-3 text-sm">
                <p>{browserDrawingError}</p>
                <button className="underline mt-2" onClick={()=>{
                  const raw=localStorage.getItem('metardu-map-features')
                  const url=URL.createObjectURL(new Blob([raw??''],{type:'application/json'})),a=document.createElement('a')
                  a.href=url;a.download='retained-original-browser-map.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
                }}>Download retained browser record</button>
              </div>}

              {/* ── Mobile Gesture Lock (bottom-left, above status bar) ── */}
              <MapInteractionToggle mapInstance={mapInstance} />

              {/* ── Snapping Options Panel (top-right, below zoom) ── */}
              <SnappingOptions
                open={showSnappingOptions}
                onClose={() => setShowSnappingOptions(false)}
                enabled={snappingEnabled}
                onToggleEnabled={() => setSnappingEnabled((current) => !current)}
                mode={snappingMode}
                onModeChange={setSnappingMode}
                tolerance={snappingTolerance}
                onToleranceChange={setSnappingTolerance}
                snapTypes={snappingTypes}
                availableSnapTypes={availableSnapTypes}
                onSnapTypeToggle={(type) => {
                  setSnappingTypes((current) => {
                    const next = new Set(current)
                    if (next.has(type)) next.delete(type)
                    else next.add(type)
                    return next
                  })
                }}
              />

              {/* ── Identify Panel (right side, below layer controls) ── */}
              <IdentifyPanel
                feature={identifiedFeature}
                onClose={() => setIdentifiedFeature(null)}
                onZoomTo={(feature) => {
                  if (feature.centroidE && feature.centroidN) {
                    mapInstance.current?.getView().animate({
                      center: [feature.centroidE, feature.centroidN],
                      zoom: 18,
                      duration: 500,
                    })
                  }
                }}
                onGenerateDeedPlan={(feature) => {
                  const targetProjectId = schemeProjectId || 'current'
                  const parcelParam = encodeURIComponent(feature.parcelNumber || feature.lrNumber || feature.id)
                  router.push(`/project/${targetProjectId}/reports?type=deed_plan&parcel=${parcelParam}`)
                }}
                onGenerateForm3={(feature) => {
                  const targetProjectId = schemeProjectId || 'current'
                  const parcelParam = encodeURIComponent(feature.parcelNumber || feature.lrNumber || feature.id)
                  router.push(`/project/${targetProjectId}/reports?type=form3&parcel=${parcelParam}`)
                }}
              />

              <MapStatusBar />

              <MapNotifications />

              {/* ── Unified Collapsible Right Dock (Zoom, Projection, North Arrow, Print) ── */}
              <MapRightDock />

              {/* OSM Buildings Overlay Layer */}
              {mapInstance.current && (
                <OsmBuildingsLayer map={mapInstance.current} visible={showOsmBuildings} />
              )}



              {/* ── Sheet Layout Overlay (print-only — no manual toggle) ── */}
              {showSheetLayout && (
                <SheetLayout
                  show={showSheetLayout}
                  map={mapInstance.current}
                  planGeometry={printPlanGeometry}
                  epsg={currentSurveyCrs}
                  projectName={schemeProjectId ? `Project ${schemeProjectId}` : 'Global Map'}
                />
              )}
            </>
          )}

          {/* Loading / Error overlay (zero-prop, reads from context) */}
          <MapLoadingOverlay />
        </div>
        <div ref={attributionTargetRef} className="map-attribution-footer" aria-label="Map sources and licences" />

        {/* Keyboard shortcuts modal (global overlay) */}
        <KeyboardShortcutsHelp />

        {/* Global styles */}
        <MapGlobalStyles />

        {/* Offline tile downloader (re-enabled — backend now implemented) */}
        {mapReady && <OfflineTileDownloader />}
      </div>
      </MapOverlayProvider>
      </MapProvider>
      </SurveyMapEngineProvider>
    </MapErrorBoundary>
  )
}
