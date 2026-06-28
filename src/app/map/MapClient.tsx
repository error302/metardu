'use client'
/**
 * METARDU Global Map Page — Premium OpenLayers Interface
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  ARCHITECTURE: Split into sub-components for maintainability │
 * │                                                              │
 * │  MapClient.tsx    → Orchestrator (state + wiring)           │
 * │  ├─ hooks/useMapInit.ts        → Map initialization         │
 * │  ├─ hooks/useMapBasemaps.ts    → Basemap layer management   │
 * │  ├─ hooks/useMapState.ts       → View persistence           │
 * │  ├─ hooks/useMapInteractions.ts → Draw/Measure/GPS/Export   │
 * │  ├─ components/MapToolbar.tsx   → Left sidebar (context)    │
 * │  ├─ components/MapOverlays.tsx  → Zoom/GPS/Stakeout (ctx)   │
 * │  ├─ components/MapStatusBar.tsx → Bottom coord bar (ctx)    │
 * │  ├─ components/MapLoadingOverlay.tsx → Loading/Error (ctx)  │
 * │  ├─ components/MapNotifications.tsx  → Toast (context)      │
 * │  ├─ components/MapCoordSearch.tsx   → Coord search (ctx)    │
 * │  ├─ components/CogoInfoPanel.tsx    → COGO traverse (ctx)   │
 * │  ├─ components/CogoToolsPanel.tsx   → COGO compute (ctx)    │
 * │  ├─ components/RotationControl.tsx  → North arrow reset     │
 * │  ├─ components/MapPrintButton.tsx   → Print button (ctx)    │
 * │  ├─ LayerControl (reusable, props)  → Grid/XYZ/WMS/Opacity │
 * │  ├─ VertexEditToolbar (ctx version) → Vertex editing + snap │
 * │  ├─ ProjectionSwitcher (context)    → CRS switching         │
 * │  ├─ StakeoutPanel (context)         → GPS stakeout HUD      │
 * │  ├─ SchemeLayerPanel (context)      → Scheme layer controls │
 * │  ├─ OfflineTileDownloader (context) → Offline tile dialog   │
 * │  ├─ SheetLayout (dynamic)           → Print layout overlay  │
 * │  └─ MapReactContext                 → Zero-prop data bus    │
 * │                                                              │
 * │  Performance optimizations:                                  │
 * │  - All sub-components wrapped in React.memo                 │
 * │  - useMemo for stable object references                     │
 * │  - useCallback for all interaction handlers                 │
 * │  - 100ms mouse position throttle                            │
 * │  - Dynamic imports for all OpenLayers modules               │
 * │  - Tile cache size 2048 for all basemaps                    │
 * │  - Map state persistence every 10s (not per move)           │
 * │  - Safety timeout: force ready after 5s                     │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Features:
 *  - Draw interaction (Point, Line, Polygon, Circle)
 *  - Modify interaction (vertex editing)
 *  - Select interaction + Popup overlays
 *  - Undo / Redo history (via useMapHistory hook)
 *  - Measurement (Distance & Area with bearing)
 *  - GeoJSON / KML / WKT / DXF / LandXML import & export
 *  - Drag & Drop file import
 *  - MousePosition (live EPSG:21037 coords)
 *  - Geolocation (GPS tracking)
 *  - GPS Stakeout mode (Pro+)
 *  - Cluster source for project markers
 *  - Multiple basemaps (OSM, Satellite, Dark, Terrain)
 *  - Bearing/distance annotations on drawn features
 *  - Save drawn features to project
 *  - Offline tile download (Pro+)
 *  - URL param ?projectId=xxx deep linking
 *  - Keyboard shortcuts (Ctrl+Z/Y, Del, Esc)
 *  - Map state persistence (localStorage)
 *  - Coordinate search (lat/lon, UTM, DMS)
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useMapHistory } from '@/hooks/useMapHistory'
import type { MapContext } from '@/hooks/useMapTypes'
import MapErrorBoundary from '@/app/map/MapErrorBoundary'
import MapGlobalStyles from '@/app/map/MapGlobalStyles'
import type { BasemapMode, DrawMode, MeasureMode } from '@/app/map/mapTypes'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useSubscription } from '@/lib/subscription/subscriptionContext'
import { createSchemeLayers, zoomToSchemeExtent } from '@/lib/map/schemeLayer'
import { SchemeLayerPanel } from '@/app/map/components/SchemeLayerPanel'
import type { StakeoutState } from '@/lib/map/stakeout'
import type { MapCleanupRefs } from '@/lib/map/olTypes'
import {
  createTraversePolygonPreview,
  removeTraversePolygonPreview,
  createParcelFromTraverse,
} from '@/lib/map/traverseToParcel'

// ── Sub-components (lazy where appropriate) ──
import { MapOverlays } from '@/app/map/components/MapOverlays'
import { MapStatusBar } from '@/app/map/components/MapStatusBar'
import { MapLoadingOverlay } from '@/app/map/components/MapLoadingOverlay'
import { MapNotifications } from '@/app/map/components/MapNotifications'
import { RotationControl } from '@/app/map/components/RotationControl'
import { MapPrintButton } from '@/app/map/components/MapPrintButton'
import { MapCoordSearch } from '@/app/map/components/MapCoordSearch'
import { KeyboardShortcutsHelp } from '@/app/map/components/KeyboardShortcutsHelp'
import { MapToolDock } from '@/app/map/components/MapToolDock'
import { MapInteractionToggle } from '@/app/map/components/MapInteractionToggle'
import { OfflineDownloadButton } from '@/app/map/components/OfflineDownloadButton'
import { IdentifyPanel, type IdentifiedFeature } from '@/app/map/components/IdentifyPanel'
import { DigitizingToolbar } from '@/app/map/components/DigitizingToolbar'
import { SnappingOptions } from '@/app/map/components/SnappingOptions'
import { StakeoutRadar } from '@/components/survey/StakeoutRadar'
import { LayerControl } from '@/components/map/LayerControl'
import { VertexEditToolbarContext as VertexEditToolbar } from '@/components/map/VertexEditToolbar'
import { ProjectionSwitcher } from '@/components/map/ProjectionSwitcher'
import { switchMapView } from '@/lib/map/nativeProjectionView'

// ── Hooks ──
import { useMapBasemaps } from '@/app/map/hooks/useMapBasemaps'
import { useMapInit } from '@/app/map/hooks/useMapInit'
import { useMapState } from '@/app/map/hooks/useMapState'
import { useMapInteractions } from '@/app/map/hooks/useMapInteractions'
import { useVertexEditing } from '@/hooks/useVertexEditing'
import { usePrint } from '@/hooks/usePrint'
import { MapProvider, type MapContextValue } from '@/app/map/MapReactContext'
import { Target } from 'lucide-react'

// ── Dynamic imports for heavy components ──
const OfflineTileDownloader = dynamic(
  () => import('@/components/map/OfflineTileDownloader').then(m => ({ default: m.OfflineTileDownloader })),
  { ssr: false }
)

const SheetLayout = dynamic(
  () => import('@/components/map/SheetLayout'),
  { ssr: false }
)

/* ══════════════════════════════════════════════════════════════════════
 *  POPUP RENDERER
 *  Renders feature popup as raw DOM (OL moves the overlay element out
 *  of React's tree, so we can't use React components here).
 * ══════════════════════════════════════════════════════════════════════ */
function renderPopup(popupElement: HTMLDivElement, data: any, hidePopup: () => void) {
  popupElement.replaceChildren()
  popupElement.className = ''

  const card = document.createElement('div')
  card.className = 'bg-[#14141e]/95 border border-[#E8841A]/30 rounded-xl shadow-2xl backdrop-blur-xl p-4 min-w-[220px] max-w-[320px]'

  const header = document.createElement('div')
  header.className = 'flex items-start justify-between mb-2'

  const labelWrap = document.createElement('div')
  labelWrap.className = 'flex items-center gap-2'
  const dot = document.createElement('div')
  dot.className = 'w-1.5 h-1.5 rounded-full bg-[#E8841A]'
  const label = document.createElement('span')
  label.className = 'text-[10px] text-gray-500 uppercase tracking-[0.15em] font-semibold'
  label.textContent = data.geometryType || 'Feature'
  labelWrap.append(dot, label)

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'text-gray-600 hover:text-white transition-colors p-0.5'
  closeButton.textContent = 'x'
  closeButton.addEventListener('click', hidePopup)
  header.append(labelWrap, closeButton)
  card.append(header)

  if (data.projectName) {
    const project = document.createElement('div')
    project.className = 'mb-1'
    project.innerHTML = '<span class="text-[10px] text-gray-600 uppercase tracking-wider">Project</span>'
    const value = document.createElement('p')
    value.className = 'text-sm font-semibold text-white'
    value.textContent = data.projectName
    project.append(value)
    card.append(project)
  }

  if (data.stationName) {
    const station = document.createElement('div')
    station.className = 'mb-1'
    station.innerHTML = '<span class="text-[10px] text-gray-600 uppercase tracking-wider">Station</span>'
    const value = document.createElement('p')
    value.className = 'text-sm text-[#E8841A]'
    value.textContent = data.stationName
    station.append(value)
    card.append(station)
  }

  if (data.projectId) {
    const link = document.createElement('a')
    link.href = `/project/${data.projectId}`
    link.className = 'block mt-2 text-[11px] text-[#E8841A] hover:underline font-medium'
    link.textContent = 'Go to Project \u2192'
    card.append(link)
  }

  popupElement.append(card)
}

/* ══════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════════════ */
export default function MapClient() {
  const isMobile = useIsMobile()
  const searchParams = useSearchParams()
  const { hasFeature, isAdmin, plan } = useSubscription()

  // ── Map refs ──
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const mouseCoordThrottleRef = useRef(0)

  // ── OL layer/interaction refs ──
  const drawSourceRef = useRef<any>(null)
  const drawLayerRef = useRef<any>(null)
  const drawInteractionRef = useRef<any>(null)
  const selectInteractionRef = useRef<any>(null)
  const modifyInteractionRef = useRef<any>(null)
  const measureInteractionRef = useRef<any>(null)
  const measureSourceRef = useRef<any>(null)
  const measureLayerRef = useRef<any>(null)
  const annotationLayerRef = useRef<any>(null)

  // ── GPS toggle ref (allows interactions hook to call the real toggleGPS) ──
  const toggleGPSRef = useRef<() => void>(() => {})

  // ── Map cleanup refs (replaces _cleanup hack on map object) ──
  const cleanupRef = useRef<MapCleanupRefs | null>(null)

  // ── UI state ──
  const [mapReady, setMapReady] = useState(false)
  const [initError, setInitError] = useState('')
  const [projectCount, setProjectCount] = useState(0)
  const [basemap, setBasemap] = useState<BasemapMode>('osm')
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [measureMode, setMeasureMode] = useState<MeasureMode>('none')
  const [editMode, setEditMode] = useState(false)
  const [mouseCoord, setMouseCoord] = useState<{ lon: number; lat: number; e: number; n: number } | null>(null)
  const [gpsTracking, setGpsTracking] = useState(false)
  const [gpsPos, setGpsPos] = useState<{ lon: number; lat: number; accuracy: number } | null>(null)
  const [featureCount, setFeatureCount] = useState(0)
  const [importMsg, setImportMsg] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [dragHint, setDragHint] = useState(true)
  const [selectedFeature, setSelectedFeature] = useState<any>(null)
  const [featureName, setFeatureName] = useState('')
  const [measureResult, setMeasureResult] = useState('')
  const [layerOpacity, setLayerOpacity] = useState(100)
  const [stakeoutTarget, setStakeoutTarget] = useState<{ e: number; n: number } | null>(null)
  const [stakeoutActive, setStakeoutActive] = useState(false)
  const [stakeoutState, setStakeoutState] = useState<StakeoutState | null>(null)
  const [audioMuted, setAudioMuted] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')

  // ── Scheme layer state ──
  const [schemeLoading, setSchemeLoading] = useState(false)
  const [schemeError, setSchemeError] = useState('')
  const [schemeLoaded, setSchemeLoaded] = useState(false)
  const [schemeParcelCount, setSchemeParcelCount] = useState(0)
  const [schemeBlockCount, setSchemeBlockCount] = useState(0)
  const [schemeBeaconCount, setSchemeBeaconCount] = useState(0)
  const [showSchemeParcels, setShowSchemeParcels] = useState(true)
  const [showSchemeBlocks, setShowSchemeBlocks] = useState(true)
  const [showSchemeBeacons, setShowSchemeBeacons] = useState(true)
  const schemeCleanupRef = useRef<(() => void) | null>(null)
  const schemeLayersRef = useRef<{ parcelLayer: any; blockLayer: any; beaconLayer: any; extent: number[] | null } | null>(null)

  // ── Traverse-to-parcel state ──
  const [traverseParcelPreviewActive, setTraverseParcelPreviewActive] = useState(false)
  const [hasTraverse, setHasTraverse] = useState(false)
  const traversePreviewLayerRef = useRef<any>(null)

  // ── Vertex editing state (Tier 1: VertexEditToolbar) ──
  const [vertexEditingEnabled, setVertexEditingEnabled] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapTolerance, setSnapTolerance] = useState(10)
  const [vertexEditingVertices, setVertexEditingVertices] = useState<Array<{ easting: number; northing: number }>>([])

  // ── Print/PDF state (Tier 1: usePrint + SheetLayout) ──
  const [showSheetLayout, setShowSheetLayout] = useState(false)

  // ── Identify Panel state ──
  const [identifiedFeature, setIdentifiedFeature] = useState<IdentifiedFeature | null>(null)

  // ── Digitizing Tools state ──
  const [activeDigitizingTool, setActiveDigitizingTool] = useState<'draw' | 'split' | 'merge' | 'reshape' | 'rotate' | 'offset' | null>(null)
  const [snappingEnabled, setSnappingEnabled] = useState(true)
  const [showSnappingOptions, setShowSnappingOptions] = useState(false)

  // ── Stakeout Radar state ──
  const [showStakeoutRadar, setShowStakeoutRadar] = useState(false)
  const [stakeoutRadarTarget, setStakeoutRadarTarget] = useState<{ e: number; n: number } | null>(null)

  const {
    print: printMap,
    isPrinting,
    paperSize,
    setPaperSize,
    orientation,
    setOrientation,
  } = usePrint({ printTarget: 'metardu-global-map' })

  // ── Map extent for offline tile dialog (async resolve) ──
  const [offlineMapExtent, setOfflineMapExtent] = useState<any>(null)

  // ── Map projection (Tier 2: Projection switching) ──
  const [activeProjection, setActiveProjection] = useState<string>('EPSG:3857')

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

  // ── Map initialization ──
  useMapInit({
    mapRef,
    setMapReady,
    setInitError,
    setProjectCount,
    setMouseCoord,
    setFeatureCount,
    setImportMsg,
    setSelectedFeature,
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
    onPopupRender: renderPopup,
  })

  // ── Map state persistence ──
  useMapState(mapInstance, drawSourceRef, mapReady)

  // ── Interactions hook ──
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
  })

  // Wire GPS toggle (needs interactions reference)
  const toggleGPS = useCallback(() => {
    if (!mapInstance.current) return
    if (!cleanupRef.current?.geolocation) return

    if (gpsTracking) {
      cleanupRef.current.geolocation.setTracking(false)
      setGpsTracking(false)
      setStakeoutActive(false)
    } else {
      cleanupRef.current.geolocation.setTracking(true)
      setGpsTracking(true)
      cleanupRef.current.geolocation.once('change:position', () => {
        const pos = cleanupRef.current?.geolocation?.getPosition()
        if (pos) mapInstance.current.getView().animate({ center: pos, zoom: 16, duration: 1000 })
      })
    }
  }, [gpsTracking])

  // Keep the ref up-to-date so the interactions hook can call the real function
  toggleGPSRef.current = toggleGPS

  // ── Basemap toggle wrapper ──
  const toggleBasemap = useCallback((mode: BasemapMode) => {
    toggleBasemapHook(mapInstance, mode, setBasemap)
  }, [toggleBasemapHook])

  // ── Projection switch handler (Tier 2) ──
  const handleProjectionSwitch = useCallback(async (targetProjection: string) => {
    if (!mapInstance.current) return
    try {
      if (targetProjection === 'EPSG:3857') {
        // Switch back to Web Mercator (default)
        const { default: View } = await import('ol/View')
        const { transform } = await import('ol/proj')
        const currentView = mapInstance.current.getView()
        const currentCenter = currentView.getCenter()
        const currentZoom = currentView.getZoom() ?? 14
        const newCenter = currentCenter
          ? transform(currentCenter, currentView.getProjection(), 'EPSG:3857') as [number, number]
          : undefined
        mapInstance.current.setView(new View({
          projection: 'EPSG:3857',
          center: newCenter ?? [3900000, -500000],
          zoom: currentZoom,
        }))
        setActiveProjection('EPSG:3857')
      } else {
        await switchMapView(mapInstance.current, targetProjection)
        setActiveProjection(targetProjection)
      }
    } catch (err) {
      console.error('[MapClient] Projection switch failed:', err)
      setSaveMsg('Failed to switch projection')
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }, [])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

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

  // ── Fade drag hint after 5s ──
  useEffect(() => {
    const timer = setTimeout(() => setDragHint(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  // ── Safety timeout: force mapReady after 5s ──
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!mapReady) {
        console.warn('[MapClient] Forcing mapReady=true after 5s timeout')
        setMapReady(true)
      }
    }, 5000)
    return () => clearTimeout(timeout)
  }, [mapReady])

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

  // ── Print handler: show sheet layout overlay then trigger browser print ──
  const handlePrintMap = useCallback(async (overrides?: any) => {
    setShowSheetLayout(true)
    // Small delay to let sheet layout render before print
    await new Promise(resolve => setTimeout(resolve, 400))
    await printMap(overrides)
    // Sheet layout stays visible so it appears in the printed output
    // It will be hidden when the user closes the print dialog
    setTimeout(() => setShowSheetLayout(false), 6000)
  }, [printMap])

  // ── Offline dialog toggle (async: resolves map extent when opening) ──
  const handleToggleOfflineDialog = useCallback(async (open: boolean) => {
    setOfflineDialogOpen(open)
    if (open) {
      const extent = await interactions.getMapExtent()
      setOfflineMapExtent(extent)
    }
  }, [interactions])

  // ── Scheme layer: get projectId from URL params ──
  const schemeProjectId = searchParams.get('projectId')

  // ── Scheme layer: load scheme data ──
  const loadSchemeData = useCallback(async () => {
    if (!schemeProjectId || !mapInstance.current || schemeLoading) return

    setSchemeLoading(true)
    setSchemeError('')

    try {
      // Clean up any existing scheme layers first
      if (schemeCleanupRef.current) {
        schemeCleanupRef.current()
        schemeCleanupRef.current = null
        schemeLayersRef.current = null
      }

      const result = await createSchemeLayers(schemeProjectId, mapInstance.current, {
        autoZoom: true,
        showParcelLabels: true,
      })

      schemeCleanupRef.current = result.cleanup
      schemeLayersRef.current = {
        parcelLayer: result.parcelLayer,
        blockLayer: result.blockLayer,
        beaconLayer: result.beaconLayer,
        extent: result.extent,
      }

      setSchemeParcelCount(result.parcelCount)
      setSchemeBlockCount(result.blockCount)
      setSchemeBeaconCount(result.beaconCount)
      setSchemeLoaded(true)

      // ── Extract beacon vertices for vertex editing (Tier 2) ──
      // Read beacon coordinates from the beacon layer source (already in EPSG:21037)
      const beaconSource = result.beaconLayer.getSource()
      if (beaconSource) {
        const beaconFeatures = beaconSource.getFeatures()
        const beaconVertices = beaconFeatures
          .map((f: any) => {
            const geom = f.getGeometry()
            if (!geom || geom.getType() !== 'Point') return null
            const coord = geom.getCoordinates()
            // Beacon coordinates are stored in EPSG:3857 (display projection)
            // We need to transform them back to EPSG:21037 for vertex editing
            return { easting: f.get('easting') as number, northing: f.get('northing') as number }
          })
          .filter((v: { easting: number; northing: number } | null): v is { easting: number; northing: number } =>
            v !== null && v.easting !== undefined && v.northing !== undefined
          )
        if (beaconVertices.length >= 3) {
          setVertexEditingVertices(beaconVertices)
        }
      }
    } catch (err) {
      console.error('[MapClient] Failed to load scheme data:', err)
      setSchemeError(err instanceof Error ? err.message : 'Failed to load scheme data')
      setSchemeLoaded(false)
    } finally {
      setSchemeLoading(false)
    }
  }, [schemeProjectId, schemeLoading])

  // ── Scheme layer: auto-load when projectId is available ──
  useEffect(() => {
    if (schemeProjectId && mapReady && !schemeLoaded && !schemeLoading && !schemeError) {
      loadSchemeData()
    }
  }, [schemeProjectId, mapReady, schemeLoaded, schemeLoading, schemeError, loadSchemeData])

  // ── Scheme layer: toggle layer visibility ──
  const toggleSchemeParcelVisibility = useCallback(() => {
    if (!schemeLayersRef.current?.parcelLayer) return
    const newVisible = !showSchemeParcels
    schemeLayersRef.current.parcelLayer.setVisible(newVisible)
    setShowSchemeParcels(newVisible)
  }, [showSchemeParcels])

  const toggleSchemeBlockVisibility = useCallback(() => {
    if (!schemeLayersRef.current?.blockLayer) return
    const newVisible = !showSchemeBlocks
    schemeLayersRef.current.blockLayer.setVisible(newVisible)
    setShowSchemeBlocks(newVisible)
  }, [showSchemeBlocks])

  const toggleSchemeBeaconVisibility = useCallback(() => {
    if (!schemeLayersRef.current?.beaconLayer) return
    const newVisible = !showSchemeBeacons
    schemeLayersRef.current.beaconLayer.setVisible(newVisible)
    setShowSchemeBeacons(newVisible)
  }, [showSchemeBeacons])

  // ── Scheme layer: zoom to scheme extent ──
  const handleZoomToScheme = useCallback(() => {
    if (!mapInstance.current || !schemeLayersRef.current?.extent) return
    zoomToSchemeExtent(mapInstance.current, schemeLayersRef.current.extent)
  }, [])

  // ── Scheme layer: remove all scheme layers ──
  const handleRemoveScheme = useCallback(() => {
    if (schemeCleanupRef.current) {
      schemeCleanupRef.current()
      schemeCleanupRef.current = null
    }
    schemeLayersRef.current = null
    setSchemeLoaded(false)
    setSchemeParcelCount(0)
    setSchemeBlockCount(0)
    setSchemeBeaconCount(0)
    setSchemeError('')
  }, [])

  // ── Scheme layer: cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (schemeCleanupRef.current) {
        schemeCleanupRef.current()
      }
    }
  }, [])

  // ── Traverse-to-parcel: check if traverse exists ──
  useEffect(() => {
    if (!schemeProjectId || !schemeLoaded) return
    // Check if there are computed traverses for this project
    const checkTraverse = async () => {
      try {
        const res = await fetch(`/api/scheme/traverse/summary?project_id=${schemeProjectId}`)
        if (res.ok) {
          const data = await res.json()
          setHasTraverse(data.data?.hasTraverses ?? false)
        }
      } catch {
        // API not available — assume no traverse
        setHasTraverse(false)
      }
    }
    checkTraverse()
  }, [schemeProjectId, schemeLoaded])

  // ── Traverse-to-parcel: create preview ──
  const handleCreateParcelFromTraverse = useCallback(async () => {
    if (!schemeProjectId || !mapInstance.current) return

    try {
      // Fetch traverse data to get coordinates
      const res = await fetch(`/api/scheme/traverse/summary?project_id=${schemeProjectId}`)
      if (!res.ok) throw new Error('Failed to fetch traverse summary')
      const summaryData = await res.json()

      // Get the first parcel with a traverse
      const parcelId = summaryData.data?.parcels?.[0]?.id
      if (!parcelId) throw new Error('No parcels with traverses found')

      // Fetch the actual traverse coordinates
      const traverseRes = await fetch(`/api/scheme/traverse?parcel_id=${parcelId}`)
      if (!traverseRes.ok) throw new Error('Failed to fetch traverse coordinates')
      const traverseData = await traverseRes.json()

      const coordinates = traverseData.data?.coordinates
      if (!coordinates || coordinates.length < 3) {
        throw new Error('Traverse has fewer than 3 stations — cannot form a polygon')
      }

      const traversePoints = coordinates.map((c: any) => ({
        easting: c.easting,
        northing: c.northing,
        pointName: c.station,
      }))

      // Create the preview layer
      const { layer } = await createTraversePolygonPreview(traversePoints)
      mapInstance.current.addLayer(layer)
      traversePreviewLayerRef.current = layer

      // Zoom to the preview
      const source = layer.getSource()
      if (source) {
        const extent = source.getExtent()
        if (extent && extent[0] !== Infinity) {
          mapInstance.current.getView().fit(extent, { padding: [80, 80, 80, 80], duration: 600 })
        }
      }

      setTraverseParcelPreviewActive(true)
    } catch (err) {
      console.error('[MapClient] Traverse preview failed:', err)
      setSaveMsg(err instanceof Error ? err.message : 'Failed to preview traverse')
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }, [schemeProjectId])

  // ── Traverse-to-parcel: confirm and save ──
  const handleConfirmTraverseParcel = useCallback(async () => {
    if (!schemeProjectId) return

    try {
      // Get the first parcel with a traverse
      const summaryRes = await fetch(`/api/scheme/traverse/summary?project_id=${schemeProjectId}`)
      const summaryData = await summaryRes.json()
      const parcelId = summaryData.data?.parcels?.[0]?.id

      if (!parcelId) throw new Error('No parcel found for traverse')

      const result = await createParcelFromTraverse(schemeProjectId, parcelId)

      // Remove the preview layer
      removeTraversePolygonPreview(mapInstance.current, traversePreviewLayerRef.current)
      traversePreviewLayerRef.current = null
      setTraverseParcelPreviewActive(false)

      const areaHa = result.areaHa?.toFixed(4) ?? 'unknown'
      setSaveMsg(`Parcel boundary created: ${areaHa} ha`)
      setTimeout(() => setSaveMsg(''), 4000)
    } catch (err) {
      console.error('[MapClient] Traverse confirm failed:', err)
      setSaveMsg(err instanceof Error ? err.message : 'Failed to save parcel boundary')
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }, [schemeProjectId])

  // ── Traverse-to-parcel: cancel and remove preview ──
  const handleCancelTraverseParcel = useCallback(() => {
    if (mapInstance.current && traversePreviewLayerRef.current) {
      removeTraversePolygonPreview(mapInstance.current, traversePreviewLayerRef.current)
      traversePreviewLayerRef.current = null
    }
    setTraverseParcelPreviewActive(false)
  }, [])

  // ── Geolocation position tracking ──
  useEffect(() => {
    if (!mapInstance.current) return
    if (!cleanupRef.current?.geolocation) return

    const geolocation = cleanupRef.current.geolocation

    const onPositionChange = async () => {
      const pos = geolocation.getPosition()
      if (pos) {
        try {
          const { transform } = await import('ol/proj')
          const lonLat = transform(pos, 'EPSG:3857', 'EPSG:4326')
          setGpsPos({ lon: lonLat[0], lat: lonLat[1], accuracy: geolocation.getAccuracy() })
        } catch {
          // Fallback: use raw coordinates
          setGpsPos({ lon: pos[0], lat: pos[1], accuracy: geolocation.getAccuracy() })
        }
      }
    }

    geolocation.on('change:position', onPositionChange)
    return () => geolocation.un('change:position', onPositionChange)
  }, [mapReady])

  // ── GPS position in EPSG:21037 (for StakeoutPanel) ──
  // This replaces the synchronous require('ol/proj') that breaks ESM.
  // We compute it asynchronously in an effect and store the result.
  const [gpsPos21037, setGpsPos21037] = useState<{ easting: number; northing: number; accuracy: number } | null>(null)

  useEffect(() => {
    if (!gpsPos) {
      setGpsPos21037(null)
      return
    }
    const currentGpsPos = gpsPos // capture for async closure
    let cancelled = false
    async function transformGpsPos() {
      try {
        const { transform } = await import('ol/proj')
        if (cancelled) return
        const [e, n] = transform([currentGpsPos.lon, currentGpsPos.lat], 'EPSG:4326', 'EPSG:21037') as [number, number]
        setGpsPos21037({ easting: e, northing: n, accuracy: currentGpsPos.accuracy })
      } catch {
        if (!cancelled) setGpsPos21037({ easting: 0, northing: 0, accuracy: currentGpsPos.accuracy })
      }
    }
    transformGpsPos()
    return () => { cancelled = true }
  }, [gpsPos])

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
    importMsg,
    panelOpen,
    dragHint,
    selectedFeature,
    featureName,
    measureResult,
    layerOpacity,
    stakeoutTarget,
    stakeoutActive,
    stakeoutState,
    audioMuted,
    saveMsg,
    offlineDialogOpen,
    showAnnotations,
    projectSearch,
    isMobile,
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
    gpsPos21037,
    activeProjection,
    showSheetLayout,
    isPrinting,
    paperSize,
    orientation,
    setPaperSize,
    setOrientation,
    offlineMapExtent,
    retryInit: () => { setInitError(''); setMapReady(false) },
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
    zoomToScheme: handleZoomToScheme,
    removeScheme: handleRemoveScheme,
    createParcelFromTraverse: handleCreateParcelFromTraverse,
    confirmTraverseParcel: handleConfirmTraverseParcel,
    cancelTraverseParcel: handleCancelTraverseParcel,
    switchProjection: handleProjectionSwitch,
    printMap: handlePrintMap,
    toggleOfflineDialog: handleToggleOfflineDialog,
  }), [
    mapInstance, popupRef, mapReady, initError, projectCount, basemap, drawMode,
    measureMode, editMode, mouseCoord, gpsTracking, gpsPos, featureCount, importMsg,
    panelOpen, dragHint, selectedFeature, featureName, measureResult, layerOpacity,
    stakeoutTarget, stakeoutActive, stakeoutState, audioMuted, saveMsg,
    offlineDialogOpen, showAnnotations, projectSearch, isMobile,
    schemeLoading, schemeError, schemeLoaded, schemeParcelCount, schemeBlockCount,
    schemeBeaconCount, showSchemeParcels, showSchemeBlocks, showSchemeBeacons,
    hasTraverse, traverseParcelPreviewActive, schemeProjectId,
    vertexEditingEnabled, snapEnabled, snapTolerance, vertexEditState, vertexEditingVertices,
    gpsPos21037,
    activeProjection, showSheetLayout, isPrinting,
    paperSize, orientation, offlineMapExtent, schemeProjectId,
    hasFeature, canUndo, canRedo,
    setPanelOpen, setProjectSearch, setAudioMuted, setOfflineDialogOpen,
    setVertexEditingEnabled, setSnapEnabled, setSnapTolerance, setShowSheetLayout,
    interactions, toggleBasemap, toggleGPS,
    handleUpdateFeatureName, handleOpacityChange, handleCoordSearch,
    loadSchemeData, toggleSchemeParcelVisibility, toggleSchemeBlockVisibility,
    toggleSchemeBeaconVisibility, handleZoomToScheme, handleRemoveScheme,
    handleCreateParcelFromTraverse, handleConfirmTraverseParcel,
    handleCancelTraverseParcel, handleProjectionSwitch, handlePrintMap,
    handleToggleOfflineDialog,
    undo, redo,
  ])

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <MapErrorBoundary>
      <MapProvider value={mapContextValue}>
      <div
        id="metardu-global-map"
        className="h-[calc(100vh-4rem)] bg-[#0a0a0f] relative overflow-hidden"
        style={{ '--map-bottom-offset': isMobile ? '64px' : '0px' } as React.CSSProperties}
        role="application"
        aria-label="Survey map — use arrow keys to pan, plus/minus to zoom. Press question mark for keyboard shortcuts."
      >
        {/* Map container */}
        <div className="w-full h-full relative">
          <div ref={mapRef} className="w-full h-full" aria-label="Interactive survey map" />

          {/* ── Overlays (only when map is ready) ── */}
          {mapReady && (
            <>
              <MapOverlays />

              <MapCoordSearch />

              {/* ── Floating Tool Dock (consolidated left-edge dock) ── */}
              <MapToolDock />

              {/* ── Mobile Gesture Lock (two-finger pan requirement) ── */}
              <MapInteractionToggle mapInstance={mapInstance} />

              {/* ── Offline Tile Download (pre-cache for field work) ── */}
              <OfflineDownloadButton />

              {/* ── Digitizing Toolbar (split, merge, reshape, rotate) ── */}
              <DigitizingToolbar
                activeTool={activeDigitizingTool}
                onToolChange={setActiveDigitizingTool}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                snappingEnabled={snappingEnabled}
                onToggleSnapping={() => {
                  setSnappingEnabled(!snappingEnabled)
                  setShowSnappingOptions(!snappingEnabled)
                }}
              />

              {/* ── Snapping Options Panel ── */}
              <SnappingOptions
                open={showSnappingOptions}
                onClose={() => setShowSnappingOptions(false)}
                enabled={snappingEnabled}
                onToggleEnabled={() => setSnappingEnabled(!snappingEnabled)}
              />

              {/* ── Identify Panel (shows when a feature is selected) ── */}
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
              />

              {/* ── Stakeout Radar button (launch beacon recovery) ── */}
              {!showStakeoutRadar && (
                <button
                  onClick={() => {
                    // Use map center as default target, or selected feature
                    const view = mapInstance.current?.getView()
                    if (view) {
                      const center = view.getCenter()
                      if (center) {
                        setStakeoutRadarTarget({ e: center[0], n: center[1] })
                        setShowStakeoutRadar(true)
                      }
                    }
                  }}
                  className="absolute top-14 left-3 z-20 flex items-center gap-1.5 px-3 h-10 rounded-xl bg-[#0d0d14]/60 backdrop-blur-xl border border-white/[0.06] text-gray-400 hover:text-[#E8841A] hover:border-[#E8841A]/30 transition-all shadow-lg"
                  title="Launch stakeout radar for beacon recovery"
                >
                  <Target className="w-4 h-4" />
                  <span className="text-xs font-medium hidden sm:inline">Radar</span>
                </button>
              )}

              {/* ── Stakeout Radar (full-screen when active) ── */}
              {showStakeoutRadar && stakeoutRadarTarget && (
                <StakeoutRadar
                  targetE={stakeoutRadarTarget.e}
                  targetN={stakeoutRadarTarget.n}
                  onClose={() => setShowStakeoutRadar(false)}
                />
              )}

              <MapStatusBar />

              <MapNotifications />

              {/* Scheme Layer Panel (right side, zero-prop) */}
              <SchemeLayerPanel />

              {/* ── Right side controls ── */}
              <div className="absolute top-14 right-3 z-20 sm:top-16 sm:right-4 flex flex-col gap-2 items-end">
                <LayerControl
                  map={mapInstance.current}
                  hideBasemap
                  defaultCollapsed={isMobile}
                  onBasemapChange={(bm) => {
                    if (bm === 'osm' || bm === 'satellite') {
                      toggleBasemap(bm as BasemapMode)
                    }
                  }}
                />

                {/* ── Projection Switcher (zero-prop) ── */}
                <ProjectionSwitcher />

                {/* ── Rotation Control (north reset) ── */}
                <RotationControl />
              </div>

              {/* ── Vertex Edit Toolbar (top, near center when active) ── */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
                <VertexEditToolbar />
              </div>

              {/* ── Tier 1: Print/PDF & Sheet Layout ── */}
              <div className="absolute bottom-10 right-3 z-20 no-print print-hide flex items-center gap-2">
                <button
                  onClick={() => setShowSheetLayout(v => !v)}
                  className={`p-2 rounded-lg border transition-colors text-[var(--text-secondary)] hover:text-[var(--accent)] ${
                    showSheetLayout
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                      : 'border-[var(--border-color)] hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]'
                  }`}
                  title={showSheetLayout ? 'Hide Sheet Layout' : 'Show Sheet Layout (north arrow, scale bar, title block)'}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                </button>
                <MapPrintButton />
              </div>

              {/* ── Tier 1: Sheet Layout Overlay (for print) ── */}
              {showSheetLayout && (
                <SheetLayout
                  show={showSheetLayout}
                  map={mapInstance.current}
                  planGeometry={null}
                  projectName={schemeProjectId ? `Project ${schemeProjectId}` : 'Global Map'}
                />
              )}
            </>
          )}

          {/* Loading / Error overlay (zero-prop, reads from context) */}
          <MapLoadingOverlay />
        </div>

        {/* Keyboard shortcuts modal (global overlay) */}
        <KeyboardShortcutsHelp />

        {/* Global styles */}
        <MapGlobalStyles />

        {/* Offline tile dialog (zero-prop, reads from context) */}
        {mapReady && (
          <OfflineTileDownloader />
        )}
      </div>
      </MapProvider>
    </MapErrorBoundary>
  )
}
