/**
 * Shared types and MapContext for the modular MapClient hooks.
 *
 * All hooks receive a `MapContext` object so they can coordinate
 * interactions (e.g. toggling draw deactivates measure & edit).
 */

import { MutableRefObject, Dispatch, SetStateAction } from 'react'

// ─── Mode types ────────────────────────────────────────────────────────
export type BasemapMode = 'osm' | 'satellite' | 'dark' | 'terrain'
export type DrawMode = 'none' | 'Point' | 'LineString' | 'Polygon' | 'Circle'
export type MeasureMode = 'none' | 'distance' | 'area'

// ─── Data types ────────────────────────────────────────────────────────
export interface PopupData {
  coordinate: number[]
  projectName?: string
  stationName?: string
  easting?: string
  northing?: string
  geometryType?: string
}

export interface HistoryEntry {
  featuresJson: string
}

export interface MouseCoord {
  lon: number
  lat: number
  e: number
  n: number
}

export interface GpsPos {
  lon: number
  lat: number
  accuracy: number
}

// ─── MapContext ────────────────────────────────────────────────────────
/**
 * Shared context passed to every map hook so they can read refs,
 * call state setters, and coordinate deactivation of other modes.
 */
export interface MapContext {
  /** The OpenLayers Map instance ref */
  mapInstance: MutableRefObject<any>

  // ── Source & layer refs ──
  drawSourceRef: MutableRefObject<any>
  drawLayerRef: MutableRefObject<any>
  measureSourceRef: MutableRefObject<any>
  measureLayerRef: MutableRefObject<any>

  // ── Interaction refs ──
  drawInteractionRef: MutableRefObject<any>
  selectInteractionRef: MutableRefObject<any>
  modifyInteractionRef: MutableRefObject<any>
  measureInteractionRef: MutableRefObject<any>

  // ── Popup ref ──
  popupRef: MutableRefObject<HTMLDivElement | null>

  // ── Cross-hook state setters ──
  setDrawMode: Dispatch<SetStateAction<DrawMode>>
  setEditMode: Dispatch<SetStateAction<boolean>>
  setMeasureMode: Dispatch<SetStateAction<MeasureMode>>
  setMeasureResult: Dispatch<SetStateAction<string>>
  setFeatureCount: Dispatch<SetStateAction<number>>
  setSelectedFeature: Dispatch<SetStateAction<any>>
  setFeatureName: Dispatch<SetStateAction<string>>

  // ── History hook callback ──
  pushHistory: () => void
}
