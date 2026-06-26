/**
 * OpenLayers Type Aliases for the METARDU map section
 *
 * Provides properly typed aliases for OpenLayers objects used throughout
 * the map hooks and components. Replaces `any` with specific types for
 * better type safety and IDE autocompletion.
 *
 * Uses dynamic imports at runtime, so we define interface stubs here
 * that match the OL API surface we actually use.
 */

// ─── OL Map & View ────────────────────────────────────────────────────────

export interface OLMap {
  getView(): OLView
  getLayers(): { getArray(): OLLayer[] }
  addLayer(layer: OLLayer): void
  removeLayer(layer: OLLayer): void
  addOverlay(overlay: OLOverlay): void
  removeOverlay(overlay: OLOverlay): void
  addInteraction(interaction: any): void
  removeInteraction(interaction: any): void
  getOverlays(): { getArray(): OLOverlay[] }
  getTarget(): HTMLElement | undefined
  getViewport(): HTMLElement
  getSize(): [number, number] | undefined
  setTarget(target: HTMLElement | undefined): void
  on(type: string, listener: (evt: any) => void): void
  un(type: string, listener: (evt: any) => void): void
  forEachFeatureAtPixel(
    pixel: [number, number],
    callback: (feature: OLFeature, layer: OLLayer) => any,
    options?: { hitTolerance?: number; layerFilter?: (layer: OLLayer) => boolean }
  ): any
  getEventPixel(event: Event): [number, number]
}

export interface OLView {
  getCenter(): number[] | undefined
  setCenter(center: number[]): void
  getZoom(): number | undefined
  setZoom(zoom: number): void
  getExtent(): number[]
  fit(extent: number[] | OLLayer, options?: { padding?: number[]; maxZoom?: number; duration?: number }): void
  animate(...animations: Array<Record<string, any>>): void
  calculateExtent(size: [number, number]): number[]
}

// ─── OL Layers ────────────────────────────────────────────────────────────

export interface OLLayer {
  setVisible(visible: boolean): void
  getVisible(): boolean
  setOpacity(opacity: number): void
  get(key: string): any
  set(key: string, value: any): void
  getSource(): OLSource | null
}

export interface OLVectorLayer extends OLLayer {
  getSource(): OLVectorSource | null
  setStyle(style: any): void
}

export interface OLTileLayer extends OLLayer {}

// ─── OL Sources ───────────────────────────────────────────────────────────

export interface OLSource {
  getFeatures(): OLFeature[]
  getExtent(): number[]
}

export interface OLVectorSource extends OLSource {
  addFeature(feature: OLFeature): void
  addFeatures(features: OLFeature[]): void
  removeFeature(feature: OLFeature): void
  getFeatureById(id: string | number): OLFeature | null
  clear(): void
  on(type: string, listener: (evt: any) => void): void
  un(type: string, listener: (evt: any) => void): void
}

export interface OLClusterSource extends OLSource {
  setDistance(distance: number): void
}

// ─── OL Features & Geometry ───────────────────────────────────────────────

export interface OLFeature {
  getGeometry(): OLGeometry | null
  setGeometry(geom: OLGeometry): void
  get(key: string): any
  set(key: string, value: any): void
  getKeys(): string[]
  getProperties(): Record<string, any>
  setStyle(style: any): void
  getStyle(): any
  setId(id: string | number): void
}

export interface OLGeometry {
  getType(): string
  getCoordinates(): any
  getClosestPoint(point: number[]): number[]
  getExtent(): number[]
}

export interface OLPoint extends OLGeometry {
  getCoordinates(): number[]
}

export interface OLLineString extends OLGeometry {
  getCoordinates(): number[][]
  getLength(): number
}

export interface OLPolygon extends OLGeometry {
  getCoordinates(): number[][][]
  getArea(): number
  getInteriorPoint(): OLPoint
}

export interface OLCircle extends OLGeometry {
  getCenter(): number[]
  getRadius(): number
}

// ─── OL Overlay ───────────────────────────────────────────────────────────

export interface OLOverlay {
  setPosition(position: number[] | undefined): void
  getPosition(): number[] | undefined
  getElement(): HTMLElement
}

// ─── OL Interactions ──────────────────────────────────────────────────────

export interface OLInteraction {
  setActive(active: boolean): void
  getActive(): boolean
  on(type: string, listener: (evt: any) => void): void
  un(type: string, listener: (evt: any) => void): void
}

export interface OLSelect extends OLInteraction {
  getFeatures(): { getArray(): OLFeature[]; clear(): void }
}

export interface OLDraw extends OLInteraction {}

export interface OLModify extends OLInteraction {}

export interface OLSnap extends OLInteraction {}

export interface OLDragAndDrop extends OLInteraction {}

// ─── OL Geolocation ───────────────────────────────────────────────────────

export interface OLGeolocation {
  getPosition(): number[] | undefined
  getAccuracy(): number
  setTracking(tracking: boolean): void
  getTracking(): boolean
  on(type: string, listener: (evt: any) => void): void
  un(type: string, listener: (evt: any) => void): void
  once(type: string, listener: (evt: any) => void): void
}

// ─── Cleanup Refs (replaces _cleanup hack) ────────────────────────────────

export interface MapCleanupRefs {
  geolocation: OLGeolocation
  snap: OLSnap
  dragAndDrop: OLDragAndDrop
}
