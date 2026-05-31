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
 * │  ├─ components/MapToolbar.tsx   → Left sidebar panel        │
 * │  ├─ components/MapOverlays.tsx  → Zoom/GPS/Stakeout HUD    │
 * │  ├─ components/MapStatusBar.tsx → Bottom coordinate bar     │
 * │  ├─ components/MapLoadingOverlay.tsx → Loading/Error states │
 * │  ├─ components/MapNotifications.tsx  → Toast notifications  │
 * │  └─ components/MapCoordSearch.tsx   → Coord search input    │
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

// ── Sub-components (lazy where appropriate) ──
import { MapToolbar } from '@/app/map/components/MapToolbar'
import { MapOverlays } from '@/app/map/components/MapOverlays'
import { MapStatusBar } from '@/app/map/components/MapStatusBar'
import { MapLoadingOverlay } from '@/app/map/components/MapLoadingOverlay'
import { MapNotifications } from '@/app/map/components/MapNotifications'
import { MapCoordSearch } from '@/app/map/components/MapCoordSearch'

// ── Hooks ──
import { useMapBasemaps } from '@/app/map/hooks/useMapBasemaps'
import { useMapInit } from '@/app/map/hooks/useMapInit'
import { useMapState } from '@/app/map/hooks/useMapState'
import { useMapInteractions } from '@/app/map/hooks/useMapInteractions'

// ── Dynamic imports for heavy components ──
const OfflineTileDownloader = dynamic(
  () => import('@/components/map/OfflineTileDownloader').then(m => ({ default: m.OfflineTileDownloader })),
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
  const [saveMsg, setSaveMsg] = useState('')
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')

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
    drawMode,
    editMode,
    measureMode,
    showAnnotations,
    gpsTracking,
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
    setShowAnnotations,
    setSaveMsg,
    pushHistory,
    clearHistory,
    popupRef,
    toggleGPS: () => {}, // placeholder, wired below
  })

  // Wire GPS toggle (needs interactions reference)
  const toggleGPS = useCallback(() => {
    if (!mapInstance.current) return
    const cleanup = (mapInstance.current as any)._cleanup
    if (!cleanup?.geolocation) return

    if (gpsTracking) {
      cleanup.geolocation.setTracking(false)
      setGpsTracking(false)
      setStakeoutActive(false)
    } else {
      cleanup.geolocation.setTracking(true)
      setGpsTracking(true)
      cleanup.geolocation.once('change:position', () => {
        const pos = cleanup.geolocation.getPosition()
        if (pos) mapInstance.current.getView().animate({ center: pos, zoom: 16, duration: 1000 })
      })
    }
  }, [gpsTracking])

  // ── Basemap toggle wrapper ──
  const toggleBasemap = useCallback((mode: BasemapMode) => {
    toggleBasemapHook(mapInstance, mode, setBasemap)
  }, [toggleBasemapHook])

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

  // ── Geolocation position tracking ──
  useEffect(() => {
    if (!mapInstance.current) return
    const cleanup = (mapInstance.current as any)._cleanup
    if (!cleanup?.geolocation) return

    const geolocation = cleanup.geolocation
    const { default: proj } = require('ol/proj')

    const onPositionChange = () => {
      const pos = geolocation.getPosition()
      if (pos) {
        const lonLat = proj.toLonLat(pos)
        setGpsPos({ lon: lonLat[0], lat: lonLat[1], accuracy: geolocation.getAccuracy() })
      }
    }

    geolocation.on('change:position', onPositionChange)
    return () => geolocation.un('change:position', onPositionChange)
  }, [mapReady])

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <MapErrorBoundary>
      <div
        className="h-[calc(100vh-4rem)] bg-[#0a0a0f] relative overflow-hidden"
        style={{ '--map-bottom-offset': isMobile ? '64px' : '0px' } as React.CSSProperties}
      >
        {/* Map container */}
        <div className="w-full h-full relative">
          <div ref={mapRef} className="w-full h-full" />

          {/* ── Overlays (only when map is ready) ── */}
          {mapReady && (
            <>
              <MapOverlays
                mapInstance={mapInstance}
                panelOpen={panelOpen}
                setPanelOpen={setPanelOpen}
                gpsTracking={gpsTracking}
                gpsPos={gpsPos}
                stakeoutActive={stakeoutActive}
                stakeoutTarget={stakeoutTarget}
                stakeoutInfo={interactions.stakeoutInfo}
                toggleStakeout={interactions.toggleStakeout}
                toggleGPS={toggleGPS}
                projectCount={projectCount}
                isMobile={isMobile}
              />

              <MapCoordSearch onSearch={handleCoordSearch} />

              <MapToolbar
                panelOpen={panelOpen}
                setPanelOpen={setPanelOpen}
                drawMode={drawMode}
                editMode={editMode}
                measureMode={measureMode}
                showAnnotations={showAnnotations}
                basemap={basemap}
                layerOpacity={layerOpacity}
                gpsTracking={gpsTracking}
                stakeoutActive={stakeoutActive}
                featureCount={featureCount}
                featureName={featureName}
                selectedFeature={selectedFeature}
                projectCount={projectCount}
                projectSearch={projectSearch}
                setProjectSearch={setProjectSearch}
                measureResult={measureResult}
                hasFeature={hasFeature}
                canUndo={canUndo}
                canRedo={canRedo}
                onToggleDraw={interactions.toggleDraw}
                onToggleEdit={interactions.toggleEdit}
                onUndo={undo}
                onRedo={redo}
                onDeleteSelected={interactions.deleteSelected}
                onToggleMeasure={interactions.toggleMeasure}
                onToggleAnnotations={interactions.toggleAnnotations}
                onToggleBasemap={toggleBasemap}
                onOpacityChange={handleOpacityChange}
                onFitToKenya={interactions.fitToKenya}
                onFitToDrawn={interactions.fitToDrawn}
                onToggleGPS={toggleGPS}
                onToggleStakeout={interactions.toggleStakeout}
                onToggleOfflineDialog={() => setOfflineDialogOpen(true)}
                onSaveToProject={interactions.saveToProject}
                onExportFeatures={interactions.exportFeatures}
                onClearDrawn={interactions.clearDrawn}
                onUpdateFeatureName={handleUpdateFeatureName}
              />

              <MapStatusBar
                mouseCoord={mouseCoord}
                dragHint={dragHint}
                isMobile={isMobile}
              />

              <MapNotifications
                importMsg={importMsg}
                saveMsg={saveMsg}
              />
            </>
          )}

          {/* Loading / Error overlay */}
          <MapLoadingOverlay
            mapReady={mapReady}
            initError={initError}
            onRetry={() => { setInitError(''); setMapReady(false) }}
          />
        </div>

        {/* Global styles */}
        <MapGlobalStyles />

        {/* Offline tile dialog */}
        {mapReady && (
          <OfflineTileDownloader
            open={offlineDialogOpen}
            onOpenChange={setOfflineDialogOpen}
            mapExtent={interactions.getMapExtent()}
          />
        )}
      </div>
    </MapErrorBoundary>
  )
}
