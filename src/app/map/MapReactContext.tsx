'use client'
/**
 * MapReactContext — React Context for the METARDU map page
 *
 * Eliminates prop drilling: MapClient provides the context,
 * and any child component (MapToolbar, MapOverlays, MapStatusBar, etc.)
 * can consume what it needs via useMapContext().
 *
 * Previously, MapToolbar alone received 40+ props. Now it reads from context.
 */

import React, { createContext, useContext } from 'react'
import type { BasemapMode, DrawMode, MeasureMode } from '@/hooks/useMapTypes'
import type { StakeoutState } from '@/lib/map/stakeout'

// ─── Context Value Type ──────────────────────────────────────────────────

export interface MapContextValue {
  // ── Map refs ──
  mapInstance: React.MutableRefObject<any>
  popupRef: React.MutableRefObject<HTMLDivElement | null>

  // ── UI state ──
  mapReady: boolean
  initError: string
  projectCount: number
  basemap: BasemapMode
  drawMode: DrawMode
  measureMode: MeasureMode
  editMode: boolean
  mouseCoord: { lon: number; lat: number; e: number; n: number } | null
  gpsTracking: boolean
  gpsPos: { lon: number; lat: number; accuracy: number } | null
  featureCount: number
  importMsg: string
  panelOpen: boolean
  dragHint: boolean
  selectedFeature: any
  featureName: string
  measureResult: string
  layerOpacity: number
  stakeoutTarget: { e: number; n: number } | null
  stakeoutActive: boolean
  stakeoutState: StakeoutState | null
  audioMuted: boolean
  saveMsg: string
  offlineDialogOpen: boolean
  showAnnotations: boolean
  projectSearch: string
  isMobile: boolean

  // ── Scheme layer state ──
  schemeLoading: boolean
  schemeError: string
  schemeLoaded: boolean
  schemeParcelCount: number
  schemeBlockCount: number
  schemeBeaconCount: number
  showSchemeParcels: boolean
  showSchemeBlocks: boolean
  showSchemeBeacons: boolean
  hasTraverse: boolean
  traverseParcelPreviewActive: boolean
  hasProjectId: boolean

  // ── Vertex editing state (Tier 1) ──
  vertexEditingEnabled: boolean
  snapEnabled: boolean
  snapTolerance: number
  vertexEditState: {
    vertexCount: number
    hoveredVertex: { easting: number; northing: number; index: number } | null
    lastEditedVertex: { easting: number; northing: number; index: number } | null
  }
  vertexEditingVertices: Array<{ easting: number; northing: number }>

  // ── GPS in EPSG:21037 (for StakeoutPanel) ──
  gpsPos21037: { easting: number; northing: number; accuracy: number } | null

  // ── Projection state (Tier 2) ──
  activeProjection: string

  // ── Print state (Tier 1) ──
  showSheetLayout: boolean
  isPrinting: boolean

  // ── Feature flags ──
  hasFeature: (feature: string) => boolean

  // ── History ──
  canUndo: boolean
  canRedo: boolean

  // ── Setters ──
  setPanelOpen: (v: boolean) => void
  setProjectSearch: (v: string) => void
  setAudioMuted: React.Dispatch<React.SetStateAction<boolean>>
  setOfflineDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setVertexEditingEnabled: React.Dispatch<React.SetStateAction<boolean>>
  setSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>
  setSnapTolerance: React.Dispatch<React.SetStateAction<number>>
  setShowSheetLayout: React.Dispatch<React.SetStateAction<boolean>>

  // ── Actions ──
  toggleDraw: (mode: DrawMode) => void
  toggleEdit: () => void
  toggleMeasure: (mode: MeasureMode) => void
  toggleAnnotations: () => void
  toggleBasemap: (mode: BasemapMode) => void
  toggleGPS: () => void
  toggleStakeout: () => void
  deleteSelected: () => void
  undo: () => void
  redo: () => void
  fitToKenya: () => void
  fitToDrawn: () => void
  saveToProject: () => void
  exportFeatures: (format: 'GeoJSON' | 'KML' | 'WKT' | 'DXF' | 'LandXML') => void
  clearDrawn: () => void
  updateFeatureName: (name: string) => void
  handleOpacityChange: (val: number) => void
  handleCoordSearch: (input: string) => Promise<void>
  stakeoutInfo: () => { distance: number; bearing: number; dE: number; dN: number } | null
  deactivateStakeout: () => void
  getMapExtent: () => Promise<any>

  // ── Scheme actions ──
  loadSchemeData: () => void
  toggleSchemeParcelVisibility: () => void
  toggleSchemeBlockVisibility: () => void
  toggleSchemeBeaconVisibility: () => void
  zoomToScheme: () => void
  removeScheme: () => void
  createParcelFromTraverse: () => void
  confirmTraverseParcel: () => void
  cancelTraverseParcel: () => void

  // ── Projection actions (Tier 2) ──
  switchProjection: (projection: string) => void

  // ── Print actions (Tier 1) ──
  printMap: (overrides?: any) => Promise<void>
}

// ─── Context Creation ────────────────────────────────────────────────────

const MapReactContext = createContext<MapContextValue | null>(null)

// ─── Provider Component ──────────────────────────────────────────────────

export function MapProvider({
  value,
  children,
}: {
  value: MapContextValue
  children: React.ReactNode
}) {
  return (
    <MapReactContext.Provider value={value}>
      {children}
    </MapReactContext.Provider>
  )
}

// ─── Consumer Hook ───────────────────────────────────────────────────────

/**
 * useMapContext — Access the map state and actions from any child component.
 *
 * Must be used within a <MapProvider>.
 *
 * @example
 * ```tsx
 * function MyMapWidget() {
 *   const { drawMode, featureCount, toggleDraw } = useMapContext()
 *   return <button onClick={() => toggleDraw('Point')}>Draw Point ({featureCount})</button>
 * }
 * ```
 */
export function useMapContext(): MapContextValue {
  const ctx = useContext(MapReactContext)
  if (!ctx) {
    throw new Error('useMapContext must be used within a <MapProvider>')
  }
  return ctx
}
