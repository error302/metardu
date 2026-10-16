'use client'
/**
 * useMapInit — Core map initialization hook
 *
 * Handles the entire map initialization lifecycle:
 * - Dynamic imports of all OpenLayers modules
 * - Projection registration
 * - Layer creation (basemaps, draw, measure, cluster)
 * - Project data fetching and marker placement
 * - Interaction setup (select, snap, drag-and-drop)
 * - View state restoration from localStorage
 * - Proper cleanup on unmount
 *
 * Performance optimizations:
 * - All OL modules loaded in parallel via Promise.all
 * - Project markers use Cluster source (distance: 40, minDistance: 20)
 * - Mouse position throttled to 100ms
 * - Map view state saved every 10s (not on every move)
 * - Tile cache size set to 2048 for better caching
 */

import { useEffect, useRef } from 'react'
import { logger } from '@/lib/logger'
import type { MapCleanupRefs } from '@/lib/map/olTypes'
import type OLMapType from 'ol/Map'
import type { SelectEvent } from 'ol/interaction/Select'
import type { BasemapModules } from './useMapBasemaps'
import type { DragAndDropEvent } from 'ol/interaction/DragAndDrop'
import { registerProjectProjection } from '@/lib/map/projection'
import { assertProjectedCrs, validateCoordinateRange } from '@/lib/spatial/projectCrs'
import { resolveStageReference } from '@/lib/workspaces/stageReference'
import { reportCrs } from '@/lib/generators/reportCrs'

interface UseMapInitParams {
  mapRef: React.RefObject<HTMLDivElement | null>
  attributionTargetRef?: React.RefObject<HTMLDivElement | null>
  setMapReady: (v: boolean) => void
  setInitError: (v: string) => void
  setProjectCount: (v: number) => void
  setMouseCoord: (v: { lon: number; lat: number; e: number | null; n: number | null; epsg: string | null } | null) => void
  setFeatureCount: (v: number) => void
  setImportMsg: (v: string) => void
  setSelectedFeature: (v: import('ol/Feature').default | null) => void
  setSelectedFeatures: (v: import('ol/Feature').default[]) => void
  setFeatureName: (v: string) => void
  mouseCoordThrottleRef: React.MutableRefObject<number>
  searchParams: URLSearchParams
  pushHistory: () => void
  drawSourceRef: React.MutableRefObject<import('ol/source/Vector').default | null>
  drawLayerRef: React.MutableRefObject<import('ol/layer/Vector').default | null>
  measureSourceRef: React.MutableRefObject<import('ol/source/Vector').default | null>
  measureLayerRef: React.MutableRefObject<import('ol/layer/Vector').default | null>
  selectInteractionRef: React.MutableRefObject<import('ol/interaction/Select').default | null>
  mapInstance: React.MutableRefObject<import('ol/Map').default | null>
  cleanupRef: React.MutableRefObject<MapCleanupRefs | null>
  popupRef: React.MutableRefObject<HTMLDivElement | null>
  createBasemaps: (olModules: BasemapModules) => Record<string, import('ol/layer/Tile').default>
  onPopupRender: (popupElement: HTMLDivElement, data: { coordinate?: import('ol/coordinate').Coordinate; projectName?: string; stationName?: string; geometryType?: string; projectId?: string; onDelete?: () => void }, hidePopup: () => void) => void
  /** T1.5 FIX (2026-07-09): UTM EPSG for mouse position coordinate display */
  currentSurveyCrs: string | null
}

export function useMapInit(params: UseMapInitParams) {
  const surveyCrsRef = useRef<string | null>(params.currentSurveyCrs)
  useEffect(() => {
    surveyCrsRef.current = params.currentSurveyCrs
  }, [params.currentSurveyCrs])

  const {
    mapRef, attributionTargetRef, setMapReady, setInitError, setProjectCount,
    setMouseCoord, setFeatureCount, setImportMsg,
    setSelectedFeature, setSelectedFeatures, setFeatureName, mouseCoordThrottleRef,
    searchParams, pushHistory,
    drawSourceRef, drawLayerRef, measureSourceRef, measureLayerRef,
    selectInteractionRef, mapInstance, cleanupRef, popupRef,
    createBasemaps, onPopupRender,
  } = params

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    let map: OLMapType | null = null
    let cancelled = false
    let dxfDropTarget: HTMLElement | null = null
    let dxfDropHandler: ((event: DragEvent) => void) | null = null
    const olModules: {
      VectorSource?: typeof import('ol/source/Vector').default
      VectorLayer?: typeof import('ol/layer/Vector').default
      Feature?: typeof import('ol/Feature').default
      Point?: typeof import('ol/geom/Point').default
      Polygon?: typeof import('ol/geom/Polygon').default
      LineString?: typeof import('ol/geom/LineString').default
      CircleGeom?: typeof import('ol/geom/Circle').default
      Style?: typeof import('ol/style/Style').default
      Fill?: typeof import('ol/style/Fill').default
      Stroke?: typeof import('ol/style/Stroke').default
      CircleStyle?: typeof import('ol/style/Circle').default
      Text?: typeof import('ol/style/Text').default
      proj?: typeof import('ol/proj')
      Draw?: typeof import('ol/interaction/Draw').default
      Modify?: typeof import('ol/interaction/Modify').default
      TileLayer?: typeof import('ol/layer/Tile').default
      OSM?: typeof import('ol/source/OSM').default
      XYZ?: typeof import('ol/source/XYZ').default
      Cluster?: typeof import('ol/source/Cluster').default
    } = {}

    async function initMap() {
      try {
        // Register projections with error handling
        try {
          const { registerProjections } = await import('@/lib/map/projection')
          await registerProjections()
        } catch (projErr) {
          logger.warn('Projection registration failed, using defaults:', { error: projErr })
        }

        // Parallel import of all OL modules for performance
        const imports = await Promise.all([
          import('ol/Map'),
          import('ol/View'),
          import('ol/layer/Tile'),
          import('ol/layer/Vector'),
          import('ol/layer/Group'),
          import('ol/source/OSM'),
          import('ol/source/XYZ'),
          import('ol/source/Vector'),
          import('ol/source/Cluster'),
          import('ol/Feature'),
          import('ol/geom/Point'),
          import('ol/geom/Polygon'),
          import('ol/geom/Circle'),
          import('ol/geom/LineString'),
          import('ol/style/Style'),
          import('ol/style/Fill'),
          import('ol/style/Stroke'),
          import('ol/style/Circle'),
          import('ol/style/Text'),
          import('ol/style/Icon'),
          import('ol/control/ScaleLine'),
          import('ol/control/Attribution'),
          import('ol/control/MousePosition'),
          import('ol/interaction/Draw'),
          import('ol/interaction/Select'),
          import('ol/interaction/Modify'),
          import('ol/interaction/DragAndDrop'),
          import('ol/interaction/DragRotate'),
          import('ol/interaction/PinchRotate'),
          import('ol/Overlay'),
          import('ol/Geolocation'),
          import('ol/format/GeoJSON'),
          import('ol/format/KML'),
          import('ol/format/WKT'),
        ])

        const [projModule] = await Promise.all([import('ol/proj')])
        const proj = projModule as typeof import('ol/proj')

        const [Map, View, TileLayer, VectorLayer, _LayerGroup, OSM, XYZ, VectorSource,
          Cluster, Feature, Point, Polygon, CircleGeom, LineString, Style, Fill, Stroke,
          CircleStyle, Text, _Icon, ScaleLine, Attribution, MousePosition,
          Draw, Select, Modify, DragAndDrop, DragRotate, PinchRotate, Overlay, Geolocation,
          GeoJSONFormat, KMLFormat, WKTFormat] = imports.map(i => ('default' in i ? i.default : i)) as [
          typeof import('ol/Map').default, typeof import('ol/View').default,
          typeof import('ol/layer/Tile').default, typeof import('ol/layer/Vector').default,
          typeof import('ol/layer/Group').default, typeof import('ol/source/OSM').default,
          typeof import('ol/source/XYZ').default, typeof import('ol/source/Vector').default,
          typeof import('ol/source/Cluster').default, typeof import('ol/Feature').default,
          typeof import('ol/geom/Point').default, typeof import('ol/geom/Polygon').default,
          typeof import('ol/geom/Circle').default, typeof import('ol/geom/LineString').default,
          typeof import('ol/style/Style').default, typeof import('ol/style/Fill').default,
          typeof import('ol/style/Stroke').default, typeof import('ol/style/Circle').default,
          typeof import('ol/style/Text').default, typeof import('ol/style/Icon').default,
          typeof import('ol/control/ScaleLine').default, typeof import('ol/control/Attribution').default,
          typeof import('ol/control/MousePosition').default,
          typeof import('ol/interaction/Draw').default, typeof import('ol/interaction/Select').default,
          typeof import('ol/interaction/Modify').default,
          typeof import('ol/interaction/DragAndDrop').default, typeof import('ol/interaction/DragRotate').default,
          typeof import('ol/interaction/PinchRotate').default, typeof import('ol/Overlay').default,
          typeof import('ol/Geolocation').default, typeof import('ol/format/GeoJSON').default,
          typeof import('ol/format/KML').default, typeof import('ol/format/WKT').default
        ]

        olModules.VectorSource = VectorSource
        olModules.VectorLayer = VectorLayer
        olModules.Feature = Feature
        olModules.Point = Point
        olModules.Polygon = Polygon
        olModules.LineString = LineString
        olModules.CircleGeom = CircleGeom
        olModules.Style = Style
        olModules.Fill = Fill
        olModules.Stroke = Stroke
        olModules.CircleStyle = CircleStyle
        olModules.Text = Text
        olModules.proj = proj
        olModules.Draw = Draw
        olModules.Modify = Modify
        olModules.TileLayer = TileLayer
        olModules.OSM = OSM
        olModules.XYZ = XYZ
        olModules.Cluster = Cluster

        if (cancelled || !mapRef.current) return

        // ── Basemap layers ──
        // TileLayer/OSM/XYZ are assigned above — the cast is safe only after those assignments.
        const basemaps = createBasemaps(olModules as BasemapModules)

        // ── Draw layer — using enhanced SoK-compliant styles ──
        const drawSource = new VectorSource()
        drawSourceRef.current = drawSource

        // Dynamic import of enhanced styles (SoK-compliant, zoom-aware)
        const { getStyleForFeature } = await import('@/lib/map/enhancedStyles')

        const drawLayer = new VectorLayer({
          updateWhileAnimating: true,
          renderBuffer: 4,
          source: drawSource,
          // Use a style function that adapts to feature type + zoom
          style: (feature: import('ol/Feature').FeatureLike, resolution: number) => {
            // For drawn features, use the enhanced SoK style
            const geomType = feature.getGeometry()?.getType()
            if (geomType === 'Polygon') {
              return getStyleForFeature(feature as InstanceType<typeof Feature>, resolution)
            }
            // Default style for points/lines being drawn
            return new Style({
              fill: new Fill({ color: 'rgba(209, 123, 71, 0.15)' }),
              stroke: new Stroke({ color: '#D17B47', width: 2.5 }),
              image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#D17B47' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
            })
          },
          zIndex: 50,
        })
        drawLayerRef.current = drawLayer

        // ── Measure layer ──
        const measureSource = new VectorSource()
        measureSourceRef.current = measureSource
        const measureLayer = new VectorLayer({
          updateWhileAnimating: true,
          renderBuffer: 4,
          source: measureSource,
          style: new Style({
            fill: new Fill({ color: 'rgba(96, 165, 250, 0.15)' }),
            stroke: new Stroke({ color: '#60a5fa', width: 2, lineDash: [6, 4] }),
            image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#60a5fa' }), stroke: new Stroke({ color: '#fff', width: 1.5 }) }),
          }),
          zIndex: 45,
        })
        measureLayerRef.current = measureLayer

        // ── Cluster layer for projects ──
        const projectSource = new VectorSource()
        const clusterSource = new Cluster({
          distance: 40,
          minDistance: 20,
          source: projectSource,
        })
        const clusterLayer = new VectorLayer({
          updateWhileAnimating: true,
          renderBuffer: 4,
          source: clusterSource,
          style: (feature: import('ol/Feature').FeatureLike) => {
            const size = (feature.get('features') as unknown[] | undefined)?.length || 1
            return new Style({
              image: new CircleStyle({
                radius: size > 1 ? 12 + Math.min(size * 2, 20) : 8,
                fill: new Fill({ color: size > 1 ? 'rgba(209, 123, 71,0.8)' : '#D17B47' }),
                stroke: new Stroke({ color: '#fff', width: 2 }),
              }),
              text: new Text({
                text: size > 1 ? String(size) : '',
                font: 'bold 12px sans-serif',
                fill: new Fill({ color: '#fff' }),
              }),
            })
          },
          zIndex: 10,
        })

        // ── Fetch projects ──
        try {
          const { createClient } = await import('@/lib/api-client/client')
          const dbClient = createClient()
          const { data: { session } } = await dbClient.auth.getSession()

          if (session?.user) {
            const { data } = (await dbClient
              .from('projects')
              .select('id, name, location, datum, utm_zone, hemisphere, survey_type, boundary_data')
              .eq('user_id', session.user.id)
              .order('created_at', { ascending: false })) as { data: Array<{
                id: string | number
                name: string
                location?: string | null
                datum?: string | null
                utm_zone?: number | null
                hemisphere?: string | null
                survey_type?: string | null
                boundary_data?: { adjustedStations?: Array<{ easting?: string | number; E?: string | number; e?: string | number; northing?: string | number; N?: string | number; n?: string | number }>; stations?: Array<{ easting?: string | number; E?: string | number; e?: string | number; northing?: string | number; N?: string | number; n?: string | number }> } | null
              }> | null } | { data: null }

            const projects = data || []
            setProjectCount(projects.length)

            // A saved project reference system is authoritative. Read it as
            // one bounded batch so the overview never plots coordinates using
            // stale datum/zone columns when a surveyor has re-declared the CRS.
            const referencesByProject = new globalThis.Map<string, Record<string, unknown>>()
            let referenceLookupFailed = false
            if (projects.length > 0) {
              const referenceLookup: unknown = await dbClient
                .from('project_reference_systems')
                .select('*')
                .in('project_id', projects.map((project) => String(project.id)))
              const referenceResponse = referenceLookup && typeof referenceLookup === 'object'
                ? referenceLookup as { data?: unknown; error?: unknown }
                : null

              if (!referenceResponse || !Array.isArray(referenceResponse.data)) {
                referenceLookupFailed = true
                logger.warn('Skipping project markers because the declared CRS lookup returned an invalid result')
              } else if (referenceResponse.error) {
                referenceLookupFailed = true
                logger.warn('Skipping project markers because the declared CRS lookup failed', { error: referenceResponse.error })
              } else {
                for (const rawReferenceRow of referenceResponse.data) {
                  if (!rawReferenceRow || typeof rawReferenceRow !== 'object' || Array.isArray(rawReferenceRow)) continue
                  const referenceRow = rawReferenceRow as Record<string, unknown>
                  if (typeof referenceRow.project_id === 'string') {
                    referencesByProject.set(referenceRow.project_id, referenceRow)
                  }
                }
              }
            }

            for (const project of projects) {
              if (referenceLookupFailed) continue
              const bd = project.boundary_data
              const adjustedStations = bd?.adjustedStations || bd?.stations || []
              if (adjustedStations.length === 0) continue

              const validCoords = adjustedStations
                .map((s) => [Number(s.easting ?? s.E ?? s.e), Number(s.northing ?? s.N ?? s.n)] as [number, number])
                .filter(([easting, northing]) => Number.isFinite(easting) && Number.isFinite(northing))

              if (validCoords.length === 0) continue
              const projectReference = resolveStageReference(
                referencesByProject.get(String(project.id)),
                project,
              )
              const projectCrs = projectReference.code
              if (!projectCrs) {
                logger.warn('Skipping project marker because its coordinate reference system is undeclared or unsupported', {
                  projectId: project.id,
                  referenceSource: projectReference.source,
                })
                continue
              }
              let invalidCoord: [number, number] | undefined
              try {
                assertProjectedCrs(projectCrs)
                invalidCoord = validCoords.find(([easting, northing]) =>
                  !validateCoordinateRange(easting, northing, projectCrs).valid
                )
              } catch (error) {
                logger.warn('Skipping project marker because its declared CRS is not a supported projected survey CRS', {
                  projectId: project.id,
                  projectCrs,
                  error,
                })
                continue
              }
              if (invalidCoord) {
                logger.warn('Skipping project marker because boundary coordinates do not match the declared project CRS', {
                  projectId: project.id,
                  projectCrs,
                })
                continue
              }
              const avgE = validCoords.reduce((s: number, c: number[]) => s + c[0], 0) / validCoords.length
              const avgN = validCoords.reduce((s: number, c: number[]) => s + c[1], 0) / validCoords.length

              try {
                await registerProjectProjection(projectCrs)
                const coords3857 = proj.transform([avgE, avgN], projectCrs, 'EPSG:3857')
                if (!coords3857.every(Number.isFinite)) throw new Error('Project centre did not transform to finite map coordinates')
                const feature = new Feature({
                  geometry: new Point(coords3857),
                  projectName: project.name,
                  stationCount: validCoords.length,
                  surveyType: project.survey_type || 'cadastral',
                })
                feature.set('projectId', project.id)
                projectSource.addFeature(feature)
              } catch (error) {
                logger.warn('Skipping project marker because its project CRS could not be registered for map display', {
                  projectId: project.id,
                  projectCrs,
                  error,
                })
              }
            }
          }
        } catch (err) {
          logger.warn('DbClient query failed:', { error: err })
        }

        // ── Popup overlay ──
        const popupElement = document.createElement('div')
        popupElement.className = 'hidden'
        popupRef.current = popupElement

        const popupOverlay = new Overlay({
          element: popupElement,
          autoPan: { animation: { duration: 250 } },
          positioning: 'bottom-center',
          offset: [0, -10],
        })

        const hidePopup = () => {
          popupOverlay.setPosition(undefined)
          popupElement.className = 'hidden'
          popupElement.replaceChildren()
          setSelectedFeature(null)
          setSelectedFeatures([])
          // The select interaction is typed now — no cast needed.
          selectInteractionRef.current?.getFeatures().clear()
        }

        // ── Create the map ──
        map = new Map({
          target: mapRef.current,
          layers: [basemaps.osm, basemaps.satellite, basemaps.dark, basemaps.terrain, clusterLayer, drawLayer, measureLayer],
          view: new View({
            center: proj.fromLonLat([37.91, 0.02]),
            zoom: 6,
            minZoom: 2,
            maxZoom: 20,
          }),
          controls: [
            new ScaleLine({ units: 'metric' }),
            new Attribution({ collapsible: false, target: attributionTargetRef?.current ?? undefined }),
            new MousePosition({
              coordinateFormat: (coord?: import('ol/coordinate').Coordinate) => {
                if (!coord || coord[0] == null || coord[1] == null || isNaN(coord[0]) || isNaN(coord[1])) return ''
                try {
                  const [lon, lat] = proj.transform(coord, 'EPSG:3857', 'EPSG:4326')
                  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return ''
                  const surveyCrs = surveyCrsRef.current
                  let e: number | null = null
                  let n: number | null = null
                  if (surveyCrs) {
                    assertProjectedCrs(surveyCrs)
                    const projected = proj.transform(coord, 'EPSG:3857', surveyCrs)
                    if (Number.isFinite(projected[0]) && Number.isFinite(projected[1])) {
                      e = projected[0]
                      n = projected[1]
                    }
                  }
                  const now = Date.now()
                  if (now - mouseCoordThrottleRef.current > 200) {
                    mouseCoordThrottleRef.current = now
                    setMouseCoord({ lon, lat, e, n, epsg: e === null ? null : surveyCrs })
                  }
                  return e !== null && n !== null && surveyCrs
                    ? `Lon: ${lon.toFixed(6)}  Lat: ${lat.toFixed(6)}  E: ${e.toFixed(3)}  N: ${n.toFixed(3)} (${surveyCrs})`
                    : `Lon: ${lon.toFixed(6)}  Lat: ${lat.toFixed(6)}  Survey CRS not set`
                } catch {
                  const now = Date.now()
                  if (now - mouseCoordThrottleRef.current > 200) {
                    mouseCoordThrottleRef.current = now
                    setMouseCoord(null)
                  }
                  return ''
                }
              },
              projection: 'EPSG:3857',
              className: 'ol-mouse-position',
            }),
          ],
          overlays: [popupOverlay],
        })

        mapInstance.current = map
        const mapNonNull = map

        // Restore saved map view state
        try {
          const savedView = localStorage.getItem('metardu-map-view')
          if (savedView) {
            const parsed = JSON.parse(savedView) as { center?: [number, number]; zoom?: number }
            const { center, zoom } = parsed
            if (center && zoom) {
              map.getView().setCenter(center)
              map.getView().setZoom(zoom)
            }
          }
        } catch { /* ignore */ }

        // Restore saved drawn features
        try {
          const savedFeatures = localStorage.getItem('metardu-map-features')
          if (savedFeatures) {
            const { default: GeoJSONFmt } = await import('ol/format/GeoJSON')
            const fmt = new GeoJSONFmt()
            const parsed = JSON.parse(savedFeatures) as object
            const features = fmt.readFeatures(parsed, {
              dataProjection: 'EPSG:4326',
              featureProjection: 'EPSG:3857',
            })
            drawSource.addFeatures(features)
            setFeatureCount(drawSource.getFeatures().length)
          }
        } catch { /* ignore */ }

        // ── Select interaction ──
        const select = new Select({
          style: new Style({
            fill: new Fill({ color: 'rgba(209, 123, 71,0.3)' }),
            stroke: new Stroke({ color: '#D17B47', width: 3 }),
            image: new CircleStyle({ radius: 10, fill: new Fill({ color: '#D17B47' }), stroke: new Stroke({ color: '#fff', width: 3 }) }),
          }),
          hitTolerance: 5,
          layers: [clusterLayer, drawLayer],
        })
        selectInteractionRef.current = select
        map.addInteraction(select)

        select.on('select', (evt: SelectEvent) => {
          const currentSelection = select.getFeatures().getArray().slice()
          setSelectedFeatures(currentSelection)
          const feature = evt.selected.at(-1) ?? currentSelection.at(-1) ?? null
          if (feature) {
            setSelectedFeature(feature)
            const coord = feature.getGeometry()?.getClosestPoint(evt.mapBrowserEvent.coordinate)
            const geometry = feature.getGeometry()
            const geomType = geometry?.getType?.() || 'unknown'
            const props = feature.getProperties()

            const clusterFeatures = feature.get('features') as InstanceType<typeof Feature>[] | undefined
            if (clusterFeatures && clusterFeatures.length > 1) {
              const extent = feature.getGeometry()?.getExtent()
              if (extent) mapNonNull.getView().fit(extent, { padding: [100, 100, 100, 100], duration: 500, maxZoom: 15 })
              popupElement.className = 'hidden'
              popupElement.replaceChildren()
              popupOverlay.setPosition(undefined)
              return
            }

            const projectName = (props.projectName as string | undefined) || (clusterFeatures?.[0]?.get?.('projectName') as string | undefined) || ''
            const stationName = (props.stationName as string | undefined) || (props.label as string | undefined) || (props.name as string | undefined) || ''
            const projectId = (props.projectId as string | undefined) || (clusterFeatures?.[0]?.get?.('projectId') as string | undefined) || ''

            setFeatureName(stationName || projectName || geomType)

            const isDrawnFeature = drawSource.getFeatures().includes(feature)
            onPopupRender(popupElement, {
              coordinate: coord,
              projectName: projectName || undefined,
              stationName: stationName || undefined,
              geometryType: geomType,
              projectId: projectId || undefined,
              // Only locally drawn geometry can be removed here. Project
              // markers are managed by their project workflow, not this source.
              onDelete: isDrawnFeature ? () => {
                try {
                  drawSource.removeFeature(feature)
                  select.getFeatures().remove(feature)
                  const remaining = select.getFeatures().getArray().slice()
                  setSelectedFeatures(remaining)
                  setSelectedFeature(remaining.at(-1) ?? null)
                  pushHistory()
                } catch { /* already removed */ }
              } : undefined,
            }, hidePopup)

            if (coord) popupOverlay.setPosition(coord)
          } else {
            popupElement.className = 'hidden'
            popupElement.replaceChildren()
            popupOverlay.setPosition(undefined)
            setSelectedFeature(null)
          }
        })

        // ── DragRotate interaction (Alt + drag to rotate map) ──
        const dragRotate = new DragRotate({
          condition: (mapBrowserEvent) => {
            // Alt key (or Option on Mac) must be held
            const altKey = mapBrowserEvent.originalEvent?.altKey
            return !!altKey
          },
        })
        map.addInteraction(dragRotate)

        // ── PinchRotate interaction (two-finger rotation on mobile) ──
        const pinchRotate = new PinchRotate()
        map.addInteraction(pinchRotate)

        // ── Geolocation ──
        const geolocation = new Geolocation({
          trackingOptions: { enableHighAccuracy: true },
          projection: 'EPSG:3857',
        })

        // ── Drag & Drop ──
        const dragAndDrop = new DragAndDrop({
          formatConstructors: [GeoJSONFormat, KMLFormat, WKTFormat] as unknown as import('ol/format/Feature').default[],
        })
        dragAndDrop.on('addfeatures', (evt: DragAndDropEvent) => {
          const features = evt.features
          if (features && features.length > 0) {
            drawSource.addFeatures(features as InstanceType<typeof Feature>[])
            setFeatureCount(drawSource.getFeatures().length)
            const extent = drawSource.getExtent()
            if (extent && extent[0] !== Infinity) {
              mapNonNull.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18, duration: 500 })
            }
            setImportMsg(`Imported ${features.length} feature(s)`)
            setTimeout(() => setImportMsg(''), 3000)
            pushHistory()
          }
        })
        map.addInteraction(dragAndDrop)

        // OpenLayers' DragAndDrop formats do not include DXF. Handle ASCII DXF
        // separately so unsupported curves are reported and survey coordinates
        // are never interpreted without the linked project's declared CRS.
        const importDxfFile = async (file: File) => {
          try {
            if (file.size > 20 * 1024 * 1024) {
              throw new Error('DXF import is limited to 20 MB per file to keep the map responsive.')
            }
            const projectId = searchParams.get('projectId')
            if (!projectId) {
              throw new Error('Link this map to a project with a declared CRS before importing survey DXF coordinates.')
            }

            const { parseDxfGeometry } = await import('@/lib/importers/dxfGeometry')
            const document = parseDxfGeometry(await file.text())
            if (document.entities.length === 0) {
              throw new Error(document.warnings.join(' ') || 'The DXF has no supported geometry.')
            }

            const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/reference-system`, { cache: 'no-store' })
            if (!response.ok) throw new Error(`Project CRS request failed (${response.status}).`)
            const body: unknown = await response.json()
            const referenceSystem = (body as { referenceSystem?: { prs?: {
              zone?: number
              hemisphere?: string
              datum?: string
              horizontalCrs?: string
            } | null } | null } | null)?.referenceSystem
            const declared = referenceSystem?.prs
            const crs = reportCrs({ utmZone: declared?.zone, hemisphere: declared?.hemisphere, datum: declared?.datum })
            if (!declared || !crs.verified || !crs.epsgCode || crs.epsgCode !== declared.horizontalCrs) {
              throw new Error('Declare a supported projected CRS in Project Settings before importing survey DXF coordinates.')
            }
            await registerProjectProjection(crs.epsgCode)

            if (document.units.code !== null && document.units.metresPerUnit === null) {
              throw new Error(`The DXF declares ${document.units.label}; METARDU cannot safely convert that unit.`)
            }
            const unitsQuestion = document.units.metresPerUnit === null
              ? `The DXF does not declare reliable drawing units. Continue only if its coordinate values are metres.`
              : `The DXF declares ${document.units.label}; values will be converted to metres using ${document.units.metresPerUnit} m per unit.`
            const approved = window.confirm(
              `DXF files do not reliably identify their coordinate reference system.\n\n` +
              `Interpret this drawing in ${crs.crsName} (${crs.epsgCode}) for the linked project?\n\n` +
              `${unitsQuestion}\n\nContinue only if the drawing matches both the project's CRS and the stated unit handling.`,
            )
            if (!approved) {
              setImportMsg('DXF import cancelled; no coordinates were added.')
              return
            }

            const metresPerUnit = document.units.metresPerUnit ?? 1
            const importedFeatures = document.entities.map((entity, entityIndex) => {
              const sourceCoordinates = entity.coordinates.map(([x, y]) => {
                const easting = x * metresPerUnit
                const northing = y * metresPerUnit
                const range = validateCoordinateRange(easting, northing, crs.epsgCode as string)
                if (!range.valid) {
                  throw new Error(`DXF entity ${entity.handle || entityIndex + 1} is outside ${crs.epsgCode}: ${range.errors.join('; ')}`)
                }
                const projected = proj.transform([easting, northing], crs.epsgCode as string, 'EPSG:3857') as number[]
                if (projected.length < 2 || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) {
                  throw new Error(`DXF entity ${entity.handle || entityIndex + 1} could not be transformed for map display.`)
                }
                return [projected[0], projected[1]] as [number, number]
              })
              if (sourceCoordinates.length === 0) throw new Error(`DXF entity ${entity.handle || entityIndex + 1} has no coordinates.`)

              const geometry = entity.kind === 'point' || entity.kind === 'label'
                ? new Point(sourceCoordinates[0])
                : new LineString(entity.closed && !sameCoordinate(sourceCoordinates[0], sourceCoordinates[sourceCoordinates.length - 1])
                  ? [...sourceCoordinates, sourceCoordinates[0]]
                  : sourceCoordinates)
              const feature = new Feature({ geometry })
              if (entity.text) {
                feature.set('name', entity.text)
                feature.set('label', entity.text)
              }
              feature.setProperties({
                dxfLayer: entity.layer,
                dxfEntityType: entity.kind,
                dxfClosed: entity.closed,
                dxfHandle: entity.handle,
                dxfSourceCoordinates: entity.coordinates,
                dxfSourceCrs: crs.epsgCode,
                dxfSourceUnits: document.units.label,
                dxfMetresPerUnit: metresPerUnit,
              })
              return feature
            })

            if (cancelled) return
            drawSource.addFeatures(importedFeatures)
            setFeatureCount(drawSource.getFeatures().length)
            const extent = drawSource.getExtent()
            if (extent && extent[0] !== Infinity) {
              mapNonNull.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18, duration: 500 })
            }
            const importWarnings = [...document.warnings]
            if (document.entities.some((entity) => entity.coordinates.some((coordinate) => coordinate.length === 3))) {
              importWarnings.push('Z ordinates are retained as source metadata; the map preview and DXF export are horizontal 2D.')
            }
            const warningSummary = importWarnings.length
              ? ` ${importWarnings.length} warning(s): ${importWarnings.slice(0, 3).join(' ')}`
              : ''
            setImportMsg(`Imported ${importedFeatures.length} DXF feature(s) in ${crs.epsgCode}.${warningSummary}`)
            pushHistory()
          } catch (error) {
            logger.warn('DXF map import rejected:', { error })
            if (!cancelled) setImportMsg(error instanceof Error ? error.message : 'DXF could not be imported.')
          }
        }

        const sameCoordinate = (left: [number, number], right: [number, number]) =>
          left[0] === right[0] && left[1] === right[1]
        dxfDropTarget = map.getViewport()
        dxfDropHandler = (event: DragEvent) => {
          const files = Array.from(event.dataTransfer?.files ?? [])
          const dxfFiles = files.filter((file) => file.name.toLowerCase().endsWith('.dxf'))
          if (dxfFiles.length === 0) return
          event.preventDefault()
          event.stopImmediatePropagation()
          if (files.length !== 1 || dxfFiles.length !== 1) {
            setImportMsg('Import one DXF file at a time. Other dropped files were not added.')
            return
          }
          void importDxfFile(dxfFiles[0])
        }
        dxfDropTarget.addEventListener('drop', dxfDropHandler, true)

        // ── Track feature count ──
        drawSource.on('addfeature', () => {
          setFeatureCount(drawSource.getFeatures().length)
        })
        drawSource.on('removefeature', () => {
          setFeatureCount(drawSource.getFeatures().length)
        })

        // ── Zoom to data ──
        if (projectSource.getFeatures().length > 0) {
          try {
            const extent = projectSource.getExtent()
            if (extent && extent[0] !== Infinity) {
              map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18 })
            }
          } catch { /* keep default */ }
        }

        // Auto-load specific project from URL param
        const projectIdParam = searchParams.get('projectId')
        if (projectIdParam) {
          const projectFeature = projectSource.getFeatures().find((f) => f.get('projectId') === projectIdParam)
          if (projectFeature) {
            const extent = projectFeature.getGeometry()?.getExtent()
            if (extent && extent[0] !== Infinity) {
              map.getView().fit(extent, { padding: [200, 200, 200, 200], maxZoom: 17, duration: 800 })
            }
          }
        }

        // Store cleanup refs in dedicated ref (not on map object)
        cleanupRef.current = { geolocation, dragAndDrop } as unknown as MapCleanupRefs

        if (!cancelled) setMapReady(true)
      } catch (err: unknown) {
        logger.error('Map initialization failed:', { error: err })
        if (!cancelled) setInitError(err instanceof Error ? (err as Error).message : 'Map failed to load')
      }
    }

    initMap()

    // Mount-once map initialization: adding the ~20 refs/setters/helpers in this
    // effect body to deps would tear down and re-create the whole OpenLayers map
    // whenever searchParams/params or any helper identity changes.
    return () => {
      cancelled = true
      if (dxfDropTarget && dxfDropHandler) {
        dxfDropTarget.removeEventListener('drop', dxfDropHandler, true)
      }
      if (map) {
        try {
          if (cleanupRef.current?.geolocation) {
            cleanupRef.current.geolocation.setTracking(false)
          }
        } catch { /* ignore */ }
        try { map.setTarget(undefined) } catch { /* ignore */ }
        mapInstance.current = null
        cleanupRef.current = null
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
