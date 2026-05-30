'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  MapPinIcon, PencilIcon, HexagonIcon, CircleIcon,
  GlobeIcon, CrosshairIcon, SatelliteIcon, MapIcon,
  TrashIcon, BoltIcon, CompassIcon, RulerIcon,
  EditIcon, UndoIcon, RedoIcon,
  TargetIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon,
  LocationDotIcon,
  MoonIcon, TerrainIcon, GridIcon, OpacityIcon,
} from '@/components/map/PremiumIcons'
import { useMapHistory } from '@/hooks/useMapHistory'
import type { MapContext } from '@/hooks/useMapTypes'
import MapErrorBoundary from '@/app/map/MapErrorBoundary'
import MapGlobalStyles from '@/app/map/MapGlobalStyles'
import type { BasemapMode, DrawMode, MeasureMode, PopupData } from '@/app/map/mapTypes'
import { handleCoordSearch } from '@/app/map/utils/coordSearch'
import { useIsMobile } from '@/hooks/use-mobile'

/**
 * METARDU Global Map Page — Premium OpenLayers Interface
 *
 * Features:
 *  - Draw interaction (Point, Line, Polygon, Circle)
 *  - Modify interaction (vertex editing)
 *  - Select interaction + Popup overlays
 *  - Undo / Redo history (via useMapHistory hook)
 *  - Measurement (Distance & Area)
 *  - GeoJSON / KML / WKT import & export
 *  - Drag & Drop file import
 *  - MousePosition (live EPSG:21037 coords)
 *  - Geolocation (GPS tracking)
 *  - Cluster source for project markers
 *  - Multiple basemaps (OSM, Satellite, Dark, Terrain)
 *
 * ── Surveyor Workflow Integration ──
 *
 * The map is NOT a standalone feature — it integrates into the surveyor's
 * end-to-end workflow across the Metardu platform:
 *
 *   1. PROJECT CREATION → Surveyor creates a project in the dashboard,
 *      entering parcel details, client info, and survey type. The project
 *      is stored in the PostgreSQL `projects` table with `boundary_data` JSONB.
 *
 *   2. DATA ENTRY → Field observations (traverse data, control points)
 *      are entered via the project form. These get stored in
 *      `projects.boundary_data.adjustedStations` with Easting/Northing
 *      in EPSG:21037 (Arc 1960 / UTM Zone 37S).
 *
 *   3. MAP VISUALIZATION → This map fetches all the surveyor's projects,
 *      transforms UTM coordinates to EPSG:3857 (web mercator), and displays
 *      them as cluster markers. Clicking a cluster zooms to the project area.
 *      The MousePosition control shows live EPSG:21037 coordinates.
 *
 *   4. DRAWING & EDITING → The draw/modify tools let the surveyor sketch
 *      boundaries, mark beacons, or annotate on the map. Drawn features
 *      represent visual survey data that can be named and organized.
 *
 *   5. MEASUREMENT → Distance and area measurement tools verify values
 *      against computed values from traverse adjustments.
 *
 *   6. EXPORT → Features can be exported as GeoJSON/KML/WKT for QGIS,
 *      ArcGIS, or other GIS software. The coordinate search box accepts
 *      UTM Easting/Northing pairs (EPSG:21037) to navigate directly.
 *
 *   7. DOCUMENT GENERATION → The project's boundary_data feeds into
 *      document generators (Working Diagram PDF/DXF, Form C22, Deed Plans,
 *      Mutation Plans) accessible from the project detail page.
 *
 * Current data flow:
 *   projects.boundary_data → PostgreSQL → MapClient (cluster markers)
 *   MapClient draw layer → Export (GeoJSON/KML/WKT) → External GIS
 *
 * Future wiring (Phase 3):
 *   - "Save to Project" button to push drawn features → boundary_data
 *   - URL param ?projectId=xxx to auto-load a specific project boundary
 *   - Two-way sync: edit on map → update boundary_data → regenerate docs
 */

/* ══════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════════════ */
export default function MapClient() {
  const isMobile = useIsMobile()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [initError, setInitError] = useState('')
  const [projectCount, setProjectCount] = useState(0)
  const [basemap, setBasemap] = useState<BasemapMode>('osm')
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [measureMode, setMeasureMode] = useState<MeasureMode>('none')
  const [editMode, setEditMode] = useState(false)
  const [mouseCoord, setMouseCoord] = useState<{ lon: number; lat: number; e: number; n: number } | null>(null)
  const mouseCoordThrottleRef = useRef(0)
  const [gpsTracking, setGpsTracking] = useState(false)
  const [gpsPos, setGpsPos] = useState<{ lon: number; lat: number; accuracy: number } | null>(null)
  // showOverview removed — no longer needed
  const [featureCount, setFeatureCount] = useState(0)
  const [importMsg, setImportMsg] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [dragHint, setDragHint] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [selectedFeature, setSelectedFeature] = useState<any>(null)
  const [featureName, setFeatureName] = useState('')
  const [measureResult, setMeasureResult] = useState('')
  const [layerOpacity, setLayerOpacity] = useState(100)

  // OL refs
  const drawSourceRef = useRef<any>(null)
  const drawLayerRef = useRef<any>(null)
  const drawInteractionRef = useRef<any>(null)
  const selectInteractionRef = useRef<any>(null)
  const modifyInteractionRef = useRef<any>(null)
  const measureInteractionRef = useRef<any>(null)
  const measureSourceRef = useRef<any>(null)
  const measureLayerRef = useRef<any>(null)

  // ── History (via useMapHistory hook) ──
  // MapContext wires all refs/setters so the hook can coordinate with
  // other hooks in future modularization passes. The pushHistory field
  // is a placeholder because useMapHistory provides the real implementation.
  const ctx: MapContext = {
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
    pushHistory: () => {}, // placeholder; hook provides the real implementation
  }

  const {
    pushHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
  } = useMapHistory(ctx)

  // ══════════════════════════════════════════════════════════════════
  //  MAP INITIALIZATION
  // ══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    let map: any = null
    let cancelled = false
    const olModules: any = {}

    async function initMap() {
      try {
        // Register projections with error handling
        try {
          const { registerProjections } = await import('@/lib/map/projection')
          await registerProjections()
        } catch (projErr) {
          console.warn('Projection registration failed, using defaults:', projErr)
        }

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
          import('ol/interaction/Snap'),
          import('ol/interaction/Modify'),
          import('ol/interaction/DragAndDrop'),
          import('ol/Overlay'),
          import('ol/Geolocation'),
          import('ol/format/GeoJSON'),
          import('ol/format/KML'),
          import('ol/format/WKT'),
        ])

        const [projModule] = await Promise.all([import('ol/proj')])
        const proj = projModule as typeof import('ol/proj')

        const [Map, View, TileLayer, VectorLayer, LayerGroup, OSM, XYZ, VectorSource,
          Cluster, Feature, Point, Polygon, CircleGeom, LineString, Style, Fill, Stroke,
          CircleStyle, Text, Icon, ScaleLine, Attribution, MousePosition,
          Draw, Select, Snap, Modify, DragAndDrop, Overlay, Geolocation,
          GeoJSONFormat, KMLFormat, WKTFormat] = imports.map(i => ('default' in i ? i.default : i)) as any[]

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
        olModules.Snap = Snap

        if (cancelled || !mapRef.current) return

        // ── Basemap layers ──
        const basemaps: Record<string, any> = {
          osm: new TileLayer({
            source: new OSM({ crossOrigin: 'anonymous' }),
            visible: true,
          }),
          satellite: new TileLayer({
            source: new XYZ({
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              crossOrigin: 'anonymous', maxZoom: 19,
              attributions: 'Tiles &copy; Esri',
            }),
            visible: false,
          }),
          dark: new TileLayer({
            source: new XYZ({
              url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
              crossOrigin: 'anonymous', maxZoom: 19,
              attributions: '&copy; CartoDB',
            }),
            visible: false,
          }),
          terrain: new TileLayer({
            source: new XYZ({
              url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
              crossOrigin: 'anonymous', maxZoom: 19,
              attributions: '&copy; CartoDB',
            }),
            visible: false,
          }),
        }
        Object.entries(basemaps).forEach(([id, layer]) => layer.set('basemapId', id))

        // ── Draw layer ──
        const drawSource = new VectorSource()
        drawSourceRef.current = drawSource
        const drawLayer = new VectorLayer({
          source: drawSource,
          style: new Style({
            fill: new Fill({ color: 'rgba(232, 132, 26, 0.15)' }),
            stroke: new Stroke({ color: '#E8841A', width: 2.5 }),
            image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#E8841A' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
          }),
          zIndex: 50,
        })
        drawLayerRef.current = drawLayer

        // ── Measure layer ──
        const measureSource = new VectorSource()
        measureSourceRef.current = measureSource
        const measureLayer = new VectorLayer({
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
          source: clusterSource,
          style: (feature: any) => {
            const size = feature.get('features')?.length || 1
            return new Style({
              image: new CircleStyle({
                radius: size > 1 ? 12 + Math.min(size * 2, 20) : 8,
                fill: new Fill({ color: size > 1 ? 'rgba(232,132,26,0.8)' : '#E8841A' }),
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

        // ── Fetch projects from DbClient ──
        try {
          const { createClient } = await import('@/lib/api-client/client')
          const dbClient = createClient()
          const { data: { session } } = await dbClient.auth.getSession()

          if (session?.user) {
            const { data } = await dbClient
              .from('projects')
              .select('id, name, location, utm_zone, hemisphere, survey_type, boundary_data')
              .eq('user_id', session.user.id)
              .order('created_at', { ascending: false })

            const projects = data || []
            setProjectCount(projects.length)

            for (const project of projects) {
              const bd = project.boundary_data
              const adjustedStations = bd?.adjustedStations || bd?.stations || []
              if (adjustedStations.length === 0) continue

              // ── Projection fix ──
              // Kenyan survey data is in EPSG:21037 (Arc 1960 / UTM Zone 37S,
              // Clarke 1880 ellipsoid). Using a WGS84-based UTM datum would
              // introduce a ~340m datum shift error. We always use EPSG:21037.
              const projCode = 'EPSG:21037'

              const validCoords = adjustedStations
                .map((s: any) => [parseFloat(s.easting || s.E || s.e), parseFloat(s.northing || s.N || s.n)])
                .filter((c: number[]) => !isNaN(c[0]) && !isNaN(c[1]))

              if (validCoords.length === 0) continue
              const avgE = validCoords.reduce((s: number, c: number[]) => s + c[0], 0) / validCoords.length
              const avgN = validCoords.reduce((s: number, c: number[]) => s + c[1], 0) / validCoords.length

              try {
                // Transform directly from EPSG:21037 → EPSG:3857 (web mercator)
                const coords3857 = proj.transform([avgE, avgN], projCode, 'EPSG:3857')
                const feature = new Feature({
                  geometry: new Point(coords3857),
                  projectName: project.name,
                  stationCount: validCoords.length,
                  surveyType: project.survey_type || 'cadastral',
                })
                projectSource.addFeature(feature)
              } catch { /* skip */ }
            }
          }
        } catch (err) { 
          console.warn('DbClient query failed:', err) 
        }

        // ── Popup overlay ──
        // OpenLayers moves overlay elements into its own overlay container. Keep
        // this node outside React's rendered tree so React never reconciles a
        // DOM node after OpenLayers has reparented it.
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
          selectInteractionRef.current?.getFeatures()?.clear()
        }

        const renderPopup = (data: PopupData) => {
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

          if (data.easting) {
            const coords = document.createElement('div')
            coords.className = 'text-[11px] text-gray-400 font-mono mt-2'
            coords.textContent = `E: ${data.easting} | N: ${data.northing}`
            card.append(coords)
          }

          popupElement.append(card)
        }

        // ── Create the map ──
        map = new Map({
          target: mapRef.current,
          layers: [basemaps.osm, basemaps.satellite, basemaps.dark, basemaps.terrain, clusterLayer, drawLayer, measureLayer],
          view: new View({
            center: proj.fromLonLat([37.91, 0.02]),  // geographic centre of Kenya
            zoom: 6,
            minZoom: 6,
            maxZoom: 20,      // cadastral-grade close zoom
            extent: [-2.2e7, -1.2e7, 2.2e7, 1.5e7],
          }),
          controls: [
            new ScaleLine({ units: 'metric' }),
            new Attribution({ collapsible: true }),
            new MousePosition({
              coordinateFormat: (coord: number[]) => {
                const lon = coord[0]
                const lat = coord[1]
                // Guard against undefined/NaN coords (e.g. during projection transform failures)
                if (lon == null || lat == null || isNaN(lon) || isNaN(lat)) return ''
                try {
                  const [e, n] = proj.transform(coord, 'EPSG:3857', 'EPSG:21037')
                  const eSafe = (e != null && !isNaN(e)) ? e : 0
                  const nSafe = (n != null && !isNaN(n)) ? n : 0
                  const now = Date.now()
                  if (now - mouseCoordThrottleRef.current > 100) {
                    mouseCoordThrottleRef.current = now
                    setMouseCoord({ lon, lat, e: eSafe, n: nSafe })
                  }
                  return `E: ${eSafe.toFixed(1)}  N: ${nSafe.toFixed(1)}`
                } catch {
                  const now = Date.now()
                  if (now - mouseCoordThrottleRef.current > 100) {
                    mouseCoordThrottleRef.current = now
                    setMouseCoord({ lon, lat, e: 0, n: 0 })
                  }
                  return `${lon.toFixed(5)}, ${lat.toFixed(5)}`
                }
              },
              projection: 'EPSG:3857',
              className: 'ol-mouse-position',
            }),
          ],
          overlays: [popupOverlay],
        })

        mapInstance.current = map

        // ── Select interaction ──
        const select = new Select({
          style: new Style({
            fill: new Fill({ color: 'rgba(232,132,26,0.3)' }),
            stroke: new Stroke({ color: '#E8841A', width: 3 }),
            image: new CircleStyle({ radius: 10, fill: new Fill({ color: '#E8841A' }), stroke: new Stroke({ color: '#fff', width: 3 }) }),
          }),
          hitTolerance: 5,
          layers: [drawLayer],
        })
        selectInteractionRef.current = select
        map.addInteraction(select)

        select.on('select', (evt: any) => {
          const selected = evt.selected
          if (selected.length > 0) {
            const feature = selected[0]
            const coord = feature.getGeometry()?.getClosestPoint(evt.mapBrowserEvent.coordinate)
            const geometry = feature.getGeometry()
            const geomType = geometry?.getType?.() || 'unknown'
            const props = feature.getProperties()

            const clusterFeatures = feature.get('features')
            if (clusterFeatures && clusterFeatures.length > 1) {
              const extent = feature.getGeometry()?.getExtent()
              if (extent) map.getView().fit(extent, { padding: [100, 100, 100, 100], duration: 500, maxZoom: 15 })
              return
            }

            const projectName = props.projectName || (clusterFeatures?.[0]?.get?.('projectName')) || ''
            const stationName = props.stationName || props.label || props.name || ''

            setSelectedFeature(feature)
            setFeatureName(stationName || projectName || geomType)

            const popupData: PopupData = {
              coordinate: coord,
              projectName: projectName || undefined,
              stationName: stationName || undefined,
              geometryType: geomType,
            }
            renderPopup(popupData)
            if (coord) popupOverlay.setPosition(coord)
          } else {
            popupElement.className = 'hidden'
            popupElement.replaceChildren()
            popupOverlay.setPosition(undefined)
            setSelectedFeature(null)
          }
        })

        // ── Snap interaction ──
        const snap = new Snap({ source: drawSource })
        map.addInteraction(snap)

        // ── Geolocation ──
        const geolocation = new Geolocation({
          trackingOptions: { enableHighAccuracy: true },
          projection: 'EPSG:3857',
        })
        geolocation.on('change:position', () => {
          const pos = geolocation.getPosition()
          if (pos) {
            const lonLat = proj.toLonLat(pos)
            setGpsPos({ lon: lonLat[0], lat: lonLat[1], accuracy: geolocation.getAccuracy() })
          }
        })

        // ── Drag & Drop ──
        const dragAndDrop = new DragAndDrop({
          formatConstructors: [GeoJSONFormat, KMLFormat, WKTFormat],
        })
        dragAndDrop.on('addfeatures', (evt: any) => {
          const features = evt.features
          if (features && features.length > 0) {
            drawSource.addFeatures(features)
            setFeatureCount(drawSource.getFeatures().length)
            const extent = drawSource.getExtent()
            if (extent[0] !== Infinity) {
              map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18, duration: 500 })
            }
            setImportMsg(`Imported ${features.length} feature(s)`)
            setTimeout(() => setImportMsg(''), 3000)
            pushHistory()
          }
        })
        map.addInteraction(dragAndDrop)

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
            if (extent[0] !== Infinity) {
              map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18 })
            }
          } catch { /* keep default */ }
        }

        // Store cleanup
        ;(map as any)._cleanup = { geolocation, snap, dragAndDrop }

        if (!cancelled) setMapReady(true)
      } catch (err: any) {
        console.error('Map initialization failed:', err)
        if (!cancelled) setInitError(err?.message || 'Map failed to load')
      }
    }

    initMap()

    // Fade drag hint after 5s
    const hintTimer = setTimeout(() => setDragHint(false), 5000)

    // Safety timeout: force mapReady after 5 seconds regardless
    const readyTimeout = setTimeout(() => {
      if (!cancelled && !mapReady) {
        console.warn('[MapClient] Forcing mapReady=true after 5s timeout')
        setMapReady(true)
      }
    }, 5000)

    return () => {
      cancelled = true
      clearTimeout(hintTimer)
      clearTimeout(readyTimeout)
      if (map) {
        try {
          const cleanup = (map as any)._cleanup
          if (cleanup?.geolocation) cleanup.geolocation.setTracking(false)
        } catch { /* ignore */ }
        try { map.setTarget(undefined) } catch { /* ignore */ }
        mapInstance.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ══════════════════════════════════════════════════════════════════
  //  BASEMAP TOGGLE
  // ══════════════════════════════════════════════════════════════════
  const toggleBasemap = useCallback((mode: BasemapMode) => {
    if (!mapInstance.current) return
    for (const layer of mapInstance.current.getLayers().getArray()) {
      const id = layer.get('basemapId')
      if (id && Object.keys({ osm: 1, satellite: 1, dark: 1, terrain: 1 }).includes(id)) {
        layer.setVisible(id === mode)
      }
    }
    setBasemap(mode)
  }, [])

  // ══════════════════════════════════════════════════════════════════
  //  DRAW INTERACTION
  // ══════════════════════════════════════════════════════════════════
  const toggleDraw = useCallback(async (mode: DrawMode) => {
    if (!mapInstance.current) return
    const { default: Draw } = await import('ol/interaction/Draw')
    const { default: Style } = await import('ol/style/Style')
    const { default: Fill } = await import('ol/style/Fill')
    const { default: Stroke } = await import('ol/style/Stroke')
    const { default: CircleStyle } = await import('ol/style/Circle')

    // Deactivate measure and edit when drawing
    if (measureMode !== 'none') {
      if (measureInteractionRef.current) {
        mapInstance.current.removeInteraction(measureInteractionRef.current)
        measureInteractionRef.current = null
      }
      if (measureSourceRef.current) measureSourceRef.current.clear()
      setMeasureMode('none')
      setMeasureResult('')
    }
    if (editMode) {
      if (modifyInteractionRef.current) {
        mapInstance.current.removeInteraction(modifyInteractionRef.current)
        modifyInteractionRef.current = null
      }
      setEditMode(false)
    }

    // Remove existing draw
    if (drawInteractionRef.current) {
      mapInstance.current.removeInteraction(drawInteractionRef.current)
      drawInteractionRef.current = null
    }

    if (mode === 'none' || mode === drawMode) {
      setDrawMode('none')
      return
    }

    const source = drawSourceRef.current
    if (!source) return

    const geomType = mode as 'Point' | 'LineString' | 'Polygon' | 'Circle'
    const draw = new Draw({
      source,
      type: geomType,
      style: new Style({
        fill: new Fill({ color: 'rgba(232,132,26,0.3)' }),
        stroke: new Stroke({ color: '#E8841A', width: 2, lineDash: [8, 4] }),
        image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#E8841A' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
      }),
    })

    draw.on('drawend', () => {
      setTimeout(() => selectInteractionRef.current?.getFeatures()?.clear(), 100)
      setTimeout(pushHistory, 150)
    })

    mapInstance.current.addInteraction(draw)
    drawInteractionRef.current = draw
    setDrawMode(mode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, editMode, measureMode, pushHistory])

  // ══════════════════════════════════════════════════════════════════
  //  MODIFY / EDIT INTERACTION
  // ══════════════════════════════════════════════════════════════════
  const toggleEdit = useCallback(async () => {
    if (!mapInstance.current) return

    if (editMode) {
      if (modifyInteractionRef.current) {
        mapInstance.current.removeInteraction(modifyInteractionRef.current)
        modifyInteractionRef.current = null
      }
      setEditMode(false)
      return
    }

    // Deactivate draw and measure when editing
    if (drawInteractionRef.current) {
      mapInstance.current.removeInteraction(drawInteractionRef.current)
      drawInteractionRef.current = null
    }
    setDrawMode('none')
    if (measureMode !== 'none') {
      if (measureInteractionRef.current) {
        mapInstance.current.removeInteraction(measureInteractionRef.current)
        measureInteractionRef.current = null
      }
      if (measureSourceRef.current) measureSourceRef.current.clear()
      setMeasureMode('none')
      setMeasureResult('')
    }

    const { default: Modify } = await import('ol/interaction/Modify')
    const source = drawSourceRef.current
    if (!source) return

    const modify = new Modify({ source })
    modify.on('modifyend', () => {
      setTimeout(pushHistory, 100)
    })
    mapInstance.current.addInteraction(modify)
    modifyInteractionRef.current = modify
    setEditMode(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, measureMode, pushHistory])

  // ══════════════════════════════════════════════════════════════════
  //  DELETE SELECTED
  // ══════════════════════════════════════════════════════════════════
  const deleteSelected = useCallback(() => {
    if (!selectInteractionRef.current || !drawSourceRef.current) return
    const features = selectInteractionRef.current.getFeatures().getArray()
    features.forEach((f: any) => drawSourceRef.current.removeFeature(f))
    selectInteractionRef.current.getFeatures().clear()
    setSelectedFeature(null)
    pushHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushHistory])

  // ── Undo / Redo now provided by useMapHistory hook (see ctx above) ──

  // ══════════════════════════════════════════════════════════════════
  //  MEASUREMENT
  // ══════════════════════════════════════════════════════════════════
  const toggleMeasure = useCallback(async (mode: MeasureMode) => {
    if (!mapInstance.current) return
    const { default: Draw } = await import('ol/interaction/Draw')
    const { default: Style } = await import('ol/style/Style')
    const { default: Fill } = await import('ol/style/Fill')
    const { default: Stroke } = await import('ol/style/Stroke')
    const { default: CircleStyle } = await import('ol/style/Circle')

    // Deactivate draw and edit when measuring
    if (drawInteractionRef.current) {
      mapInstance.current.removeInteraction(drawInteractionRef.current)
      drawInteractionRef.current = null
    }
    setDrawMode('none')
    if (editMode) {
      if (modifyInteractionRef.current) {
        mapInstance.current.removeInteraction(modifyInteractionRef.current)
        modifyInteractionRef.current = null
      }
      setEditMode(false)
    }

    // Remove existing measure
    if (measureInteractionRef.current) {
      mapInstance.current.removeInteraction(measureInteractionRef.current)
      measureInteractionRef.current = null
    }
    if (measureSourceRef.current) measureSourceRef.current.clear()
    setMeasureResult('')

    if (mode === 'none' || mode === measureMode) {
      setMeasureMode('none')
      return
    }

    const source = measureSourceRef.current
    if (!source) return

    const geomType = mode === 'distance' ? 'LineString' as const : 'Polygon' as const
    const draw = new Draw({
      source,
      type: geomType,
      style: new Style({
        fill: new Fill({ color: 'rgba(96,165,250,0.2)' }),
        stroke: new Stroke({ color: '#60a5fa', width: 2, lineDash: [6, 4] }),
        image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#60a5fa' }), stroke: new Stroke({ color: '#fff', width: 1.5 }) }),
      }),
    })

    draw.on('drawabort', () => {
      setMeasureMode('none')
      setMeasureResult('')
    })

    draw.on('drawend', (evt: any) => {
      const geom = evt.feature.getGeometry()
      if (mode === 'distance') {
        const length = geom.getLength()
        if (length > 1000) {
          setMeasureResult(`Distance: ${(length / 1000).toFixed(3)} km`)
        } else {
          setMeasureResult(`Distance: ${length.toFixed(2)} m`)
        }
      } else {
        const area = geom.getArea()
        if (area > 1000000) {
          setMeasureResult(`Area: ${(area / 1000000).toFixed(4)} km\u00B2`)
        } else {
          setMeasureResult(`Area: ${area.toFixed(2)} m\u00B2`)
        }
      }
      setMeasureMode('none')
    })

    mapInstance.current.addInteraction(draw)
    measureInteractionRef.current = draw
    setMeasureMode(mode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, editMode, measureMode])

  // ══════════════════════════════════════════════════════════════════
  //  EXPORT FEATURES
  // ══════════════════════════════════════════════════════════════════
  const exportFeatures = useCallback(async (format: 'GeoJSON' | 'KML' | 'WKT') => {
    if (!drawSourceRef.current || drawSourceRef.current.getFeatures().length === 0) return

    let output = ''
    let filename = ''
    let mimeType = ''

    if (format === 'GeoJSON') {
      const { default: GeoJSONFormat } = await import('ol/format/GeoJSON')
      const fmt = new GeoJSONFormat()
      output = JSON.stringify(fmt.writeFeatures(drawSourceRef.current.getFeatures(), {
        featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326',
      }), null, 2)
      filename = 'metardu-export.geojson'
      mimeType = 'application/geo+json'
    } else if (format === 'KML') {
      const { default: KMLFormat } = await import('ol/format/KML')
      const fmt = new KMLFormat()
      output = fmt.writeFeatures(drawSourceRef.current.getFeatures(), {
        featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326',
      })
      filename = 'metardu-export.kml'
      mimeType = 'application/vnd.google-earth.kml+xml'
    } else {
      const { default: WKTFormat } = await import('ol/format/WKT')
      const fmt = new WKTFormat()
      const features = drawSourceRef.current.getFeatures()
      output = features.map((f: any) => fmt.writeGeometry(f.getGeometry(), {
        dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857', rightHanded: true,
      })).join('\n')
      filename = 'metardu-export.wkt'
      mimeType = 'text/plain'
    }

    const blob = new Blob([output], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // ══════════════════════════════════════════════════════════════════
  //  CLEAR DRAWN
  // ══════════════════════════════════════════════════════════════════
  const clearDrawn = useCallback(() => {
    if (drawSourceRef.current) {
      drawSourceRef.current.clear()
      setFeatureCount(0)
    }
    if (measureSourceRef.current) measureSourceRef.current.clear()
    setSelectedFeature(null)
    if (popupRef.current && mapInstance.current) {
      mapInstance.current.getOverlays().forEach((o: any) => o.setPosition(undefined))
    }
    clearHistory()
  }, [])

  // ══════════════════════════════════════════════════════════════════
  //  GPS TRACKING
  // ══════════════════════════════════════════════════════════════════
  const toggleGPS = useCallback(() => {
    if (!mapInstance.current) return
    const cleanup = (mapInstance.current as any)._cleanup
    if (!cleanup?.geolocation) return

    if (gpsTracking) {
      cleanup.geolocation.setTracking(false)
      setGpsTracking(false)
    } else {
      cleanup.geolocation.setTracking(true)
      setGpsTracking(true)
      cleanup.geolocation.once('change:position', () => {
        const pos = cleanup.geolocation.getPosition()
        if (pos) mapInstance.current.getView().animate({ center: pos, zoom: 16, duration: 1000 })
      })
    }
  }, [gpsTracking])

  // ══════════════════════════════════════════════════════════════════
  //  RESET TO KENYA
  // ══════════════════════════════════════════════════════════════════
  const resetToKenya = useCallback(() => {
    if (!mapInstance.current) return
    const KENYA_EXTENT = mapInstance.current.getView().getExtent()
    mapInstance.current.getView().fit(KENYA_EXTENT, { duration: 400, padding: [0, 0, 0, 0] })
  }, [])

  // ══════════════════════════════════════════════════════════════════
  //  NAVIGATION
  // ══════════════════════════════════════════════════════════════════
  const fitToKenya = async () => {
    if (!mapInstance.current) return
    try {
      const { fromLonLat, toLonLat } = await import('ol/proj')
      const extent = [
        ...fromLonLat([33.9, -4.7]),
        ...fromLonLat([41.9, 5.5]),
      ]
      mapInstance.current.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 600 })

      // Safety check: verify the view center is within reasonable bounds of Kenya
      setTimeout(() => {
        try {
          const view = mapInstance.current?.getView()
          if (!view) return
          const center = view.getCenter()
          if (!center) return
          const lonLat = toLonLat(center)
          const lon = lonLat[0]
          const lat = lonLat[1]
          // Kenya bounds: lon 30-45, lat -10 to 10
          if (lon < 30 || lon > 45 || lat < -10 || lat > 10) {
            console.warn('[fitToKenya] View center out of Kenya bounds, falling back to center:', { lon, lat })
            view.setCenter(fromLonLat([37.0, -1.0]))
            view.setZoom(7)
          }
        } catch { /* ignore safety check failure */ }
      }, 700)
    } catch (err) {
      console.error('[fitToKenya] Extent transform failed, falling back to center:', err)
      try {
        const { fromLonLat } = await import('ol/proj')
        mapInstance.current.getView().setCenter(fromLonLat([37.0, -1.0]))
        mapInstance.current.getView().setZoom(7)
      } catch { /* absolute fallback */ }
    }
  }

  const fitToDrawn = useCallback(() => {
    if (!mapInstance.current || !drawSourceRef.current) return
    const extent = drawSourceRef.current.getExtent()
    if (extent[0] !== Infinity) {
      mapInstance.current.getView().fit(extent, { padding: [80, 80, 80, 80], duration: 400 })
    }
  }, [])

  // ══════════════════════════════════════════════════════════════════
  //  COORDINATE SEARCH
  // ══════════════════════════════════════════════════════════════════
  const handleCoordSearchLocal = useCallback(async () => {
    await handleCoordSearch(searchInput, mapInstance)
    setSearchInput('')
  }, [searchInput])

  // ══════════════════════════════════════════════════════════════════
  //  FEATURE NAME UPDATE
  // ══════════════════════════════════════════════════════════════════
  const updateFeatureName = useCallback((name: string) => {
    setFeatureName(name)
    if (selectedFeature) {
      selectedFeature.set('name', name)
      selectedFeature.set('label', name)
    }
  }, [selectedFeature])

  // ══════════════════════════════════════════════════════════════════
  //  LAYER OPACITY
  // ══════════════════════════════════════════════════════════════════
  const handleOpacityChange = useCallback((val: number) => {
    setLayerOpacity(val)
    if (drawLayerRef.current) {
      drawLayerRef.current.setOpacity(val / 100)
    }
  }, [])

  // ══════════════════════════════════════════════════════════════════
  //  SECTION HELPER
  // ══════════════════════════════════════════════════════════════════
  const sectionHeader = (label: string) => (
    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold px-1 pt-4 pb-2">
      {label}
    </div>
  )

  const toolButton = (
    label: string,
    icon: React.ReactNode,
    isActive: boolean,
    onClick: () => void,
    title?: string
  ) => (
    <button
      onClick={onClick}
      title={title || label}
      className={`
        flex flex-col items-center justify-center gap-1 rounded-xl transition-all duration-200
        w-[52px] h-[52px] shrink-0
        ${isActive
          ? 'bg-[#E8841A]/10 border border-[#E8841A]/30 text-[#E8841A] shadow-[0_0_12px_rgba(232,132,26,0.15)]'
          : 'bg-white/[0.02] border border-white/[0.06] text-gray-400 hover:bg-white/[0.04] hover:text-gray-300'}
      `}
    >
      <span className="w-5 h-5">{icon}</span>
      <span className="text-[10px] leading-tight font-medium">{label}</span>
    </button>
  )

  const actionButton = (
    label: string,
    icon: React.ReactNode,
    isActive: boolean,
    onClick: () => void,
    isDanger = false
  ) => (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2.5 w-full px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium
        ${isDanger && isActive
          ? 'bg-red-500/10 border border-red-500/30 text-red-400'
          : isActive
            ? 'bg-[#E8841A]/10 border border-[#E8841A]/30 text-[#E8841A]'
            : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 border border-transparent'}
      `}
    >
      <span className="w-4 h-4 shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  )

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <MapErrorBoundary>
    <div className="h-[calc(100vh-4rem)] bg-[#0a0a0f] relative overflow-hidden" style={{ '--map-bottom-offset': isMobile ? '64px' : '0px' } as React.CSSProperties}>

      {/* ── MAP CONTAINER ────────────────────────────────────────────── */}
      <div className="w-full h-full relative">
        {/* Map container */}
        <div ref={mapRef} className="w-full h-full" />

        {/* ── FLOATING TOP CONTROLS ──────────────────────────────────── */}
        {mapReady && (
          <>
            {/* Hamburger toggle - only visible when panel is open, sits inside panel */}
            {panelOpen && (
              <button
                onClick={() => setPanelOpen(false)}
                className="absolute top-3 z-30 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                style={{ left: '280px' }}
                title="Collapse panel"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
            )}

            {/* Zoom controls - top right */}
            <div className="fixed top-[16px] right-[16px] z-[1000] flex flex-col gap-1">
              <button onClick={() => mapInstance.current?.getView().animate({zoom: mapInstance.current.getView().getZoom() + 1}, {duration: 200})}
                className="w-10 h-10 bg-[#14141e]/90 backdrop-blur-sm border border-[var(--border-color)] rounded-lg text-white flex items-center justify-center hover:bg-[#E8841A]/20 transition-colors"
                title="Zoom In">+</button>
              <button onClick={() => mapInstance.current?.getView().animate({zoom: Math.max(6, mapInstance.current.getView().getZoom() - 1)}, {duration: 200})}
                className="w-10 h-10 bg-[#14141e]/90 backdrop-blur-sm border border-[var(--border-color)] rounded-lg text-white flex items-center justify-center hover:bg-[#E8841A]/20 transition-colors"
                title="Zoom Out">−</button>
              <button onClick={resetToKenya}
                className="w-10 h-10 bg-[#14141e]/90 backdrop-blur-sm border border-[#E8841A]/30 rounded-lg text-[#E8841A] flex items-center justify-center hover:bg-[#E8841A]/20 transition-colors text-xs font-bold"
                title="Reset to Kenya">KE</button>
            </div>

            {/* GPS status badge - bottom left */}
            {gpsTracking && gpsPos && (
              <div className="fixed bottom-[16px] left-[16px] z-[1000] bg-[#14141e]/90 backdrop-blur-sm border border-green-500/30 rounded-lg px-3 py-1.5 text-xs text-green-400 font-mono">
                GPS ±{Math.round(gpsPos.accuracy)}m
              </div>
            )}

            {/* Project count - top center */}
            {projectCount > 0 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
                <div className="bg-[#0d0d14]/90 backdrop-blur-xl border border-white/[0.06] rounded-full px-3 py-1 shadow-lg">
                  <span className="text-[11px] text-[#E8841A] font-semibold">{projectCount} project{projectCount > 1 ? 's' : ''}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Loading overlay - semi-transparent so map tiles are visible underneath */}
        {!mapReady && !initError && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center bg-[#14141e]/90 rounded-xl px-6 py-5 shadow-2xl">
              <div className="w-8 h-8 border-2 border-[#E8841A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Loading map...</p>
            </div>
          </div>
        )}

        {/* Error overlay - semi-transparent with retry */}
        {initError && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center max-w-md px-6 bg-[#14141e]/90 rounded-xl py-5 shadow-2xl">
              <div className="text-red-400 text-lg mb-2">Map Error</div>
              <p className="text-sm text-gray-400 mb-4">{initError}</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => { setInitError(''); setMapReady(false); }} className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition-colors">
                  Retry
                </button>
                <button onClick={() => window.location.reload()} className="px-4 py-2 bg-[#E8841A] text-white rounded-lg text-sm hover:bg-[#E8841A]/80 transition-colors">
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            LEFT PANEL
        ════════════════════════════════════════════════════════════ */}
        {mapReady && (
          <>
            {/* Collapsed icon strip */}
            {!panelOpen && (
              <div className="absolute top-0 left-0 bottom-0 z-10 flex flex-col items-center pt-2 gap-1 w-12 bg-[#0d0d14]/95 backdrop-blur-xl border-r border-white/[0.06] transition-all duration-300 ease-out">
                <button
                  onClick={() => setPanelOpen(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors mb-2"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
                {(['Point', 'LineString', 'Polygon', 'Circle'] as DrawMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => toggleDraw(mode)}
                    title={`Draw ${mode === 'LineString' ? 'Line' : mode}`}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 ${
                      drawMode === mode
                        ? 'bg-[#E8841A]/10 text-[#E8841A] shadow-[0_0_12px_rgba(232,132,26,0.15)]'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    {mode === 'Point' && <MapPinIcon className="w-4 h-4" active={drawMode === mode} />}
                    {mode === 'LineString' && <PencilIcon className="w-4 h-4" active={drawMode === mode} />}
                    {mode === 'Polygon' && <HexagonIcon className="w-4 h-4" active={drawMode === mode} />}
                    {mode === 'Circle' && <CircleIcon className="w-4 h-4" active={drawMode === mode} />}
                  </button>
                ))}
                <div className="w-6 h-px bg-white/[0.06] my-1" />
                <button
                  onClick={toggleEdit}
                  title="Modify features"
                  className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 ${
                    editMode
                      ? 'bg-[#E8841A]/10 text-[#E8841A] shadow-[0_0_12px_rgba(232,132,26,0.15)]'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <EditIcon className="w-4 h-4" active={editMode} />
                </button>
              </div>
            )}

            {/* Expanded panel */}
            {panelOpen && (
              <div className="absolute top-0 left-0 bottom-0 z-10 w-[280px] bg-[#0d0d14]/95 backdrop-blur-xl border-r border-white/[0.06] flex flex-col transition-all duration-300 ease-out overflow-hidden">
                {/* Panel header */}
                <div className="h-11 flex items-center justify-between px-3 shrink-0 border-b border-white/[0.06]">
                  <span className="text-xs text-gray-400 font-medium">Tools</span>
                  <button
                    onClick={() => setPanelOpen(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <ChevronLeftIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Scrollable panel body */}
                <div className="flex-1 overflow-y-auto px-3 pb-3 custom-scrollbar">
                  {/* ── DRAW ── */}
                  {sectionHeader('Draw')}
                  <div className="grid grid-cols-4 gap-1.5">
                    {toolButton('Point', <MapPinIcon className="w-5 h-5" active={drawMode === 'Point'} />, drawMode === 'Point', () => toggleDraw('Point'), 'Draw Point')}
                    {toolButton('Line', <PencilIcon className="w-5 h-5" active={drawMode === 'LineString'} />, drawMode === 'LineString', () => toggleDraw('LineString'), 'Draw Line')}
                    {toolButton('Polygon', <HexagonIcon className="w-5 h-5" active={drawMode === 'Polygon'} />, drawMode === 'Polygon', () => toggleDraw('Polygon'), 'Draw Polygon')}
                    {toolButton('Circle', <CircleIcon className="w-5 h-5" active={drawMode === 'Circle'} />, drawMode === 'Circle', () => toggleDraw('Circle'), 'Draw Circle')}
                  </div>

                  {/* ── EDIT ── */}
                  {sectionHeader('Edit')}
                  <div className="space-y-1">
                    {actionButton('Modify Vertices', <EditIcon className="w-4 h-4" active={editMode} />, editMode, toggleEdit)}
                    <div className="flex gap-1.5">
                      <button
                        onClick={undo}
                        disabled={!canUndo}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/[0.06] text-xs font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        <UndoIcon className="w-3.5 h-3.5" />
                        <span>Undo</span>
                      </button>
                      <button
                        onClick={redo}
                        disabled={!canRedo}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/[0.06] text-xs font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        <RedoIcon className="w-3.5 h-3.5" />
                        <span>Redo</span>
                      </button>
                    </div>
                    {actionButton('Delete Selected', <TrashIcon className="w-4 h-4" active={false} />, false, deleteSelected, true)}
                  </div>

                  {/* Feature properties (when selected) */}
                  {selectedFeature && (
                    <div className="mt-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-2">
                      <span className="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-semibold">Feature Properties</span>
                      <input
                        type="text"
                        value={featureName}
                        onChange={(e) => updateFeatureName(e.target.value)}
                        placeholder="Feature name..."
                        className="w-full h-7 bg-white/[0.04] border border-white/[0.06] rounded-md px-2 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-[#E8841A]/30 transition-colors"
                      />
                      <div className="text-[10px] text-gray-600">
                        Type: {selectedFeature.getGeometry()?.getType() || 'unknown'}
                      </div>
                    </div>
                  )}

                  {/* ── MEASURE ── */}
                  {sectionHeader('Measure')}
                  <div className="space-y-1">
                    {actionButton('Distance', <RulerIcon className="w-4 h-4" active={measureMode === 'distance'} />, measureMode === 'distance', () => toggleMeasure('distance'))}
                    {actionButton('Area', <GridIcon className="w-4 h-4" active={measureMode === 'area'} />, measureMode === 'area', () => toggleMeasure('area'))}
                  </div>
                  {measureResult && (
                    <div className="mt-1.5 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <span className="text-[11px] text-blue-300 font-mono font-medium">{measureResult}</span>
                    </div>
                  )}
                  {measureMode !== 'none' && !measureResult && (
                    <div className="mt-1.5 px-3 py-1.5 text-[10px] text-blue-400/70">
                      {measureMode === 'distance' ? 'Click two or more points to measure distance. Double-click to finish.' : 'Click three or more points to measure area. Double-click to finish.'}
                    </div>
                  )}

                  {/* ── LAYERS ── */}
                  {sectionHeader('Layers')}
                  <div className="grid grid-cols-4 gap-1.5">
                    {toolButton('OSM', <MapIcon className="w-5 h-5" active={basemap === 'osm'} />, basemap === 'osm', () => toggleBasemap('osm'), 'OpenStreetMap')}
                    {toolButton('Satellite', <SatelliteIcon className="w-5 h-5" active={basemap === 'satellite'} />, basemap === 'satellite', () => toggleBasemap('satellite'), 'Satellite Imagery')}
                    {toolButton('Dark', <MoonIcon className="w-5 h-5" active={basemap === 'dark'} />, basemap === 'dark', () => toggleBasemap('dark'), 'CartoDB Dark')}
                    {toolButton('Terrain', <TerrainIcon className="w-5 h-5" active={basemap === 'terrain'} />, basemap === 'terrain', () => toggleBasemap('terrain'), 'Light Terrain')}
                  </div>

                  {/* Layer opacity */}
                  <div className="mt-3 flex items-center gap-2.5">
                    <OpacityIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={layerOpacity}
                      onChange={(e) => handleOpacityChange(Number(e.target.value))}
                      className="flex-1 h-1 accent-[#E8841A] cursor-pointer"
                    />
                    <span className="text-[10px] text-gray-500 font-mono w-7 text-right">{layerOpacity}%</span>
                  </div>

                  {/* ── ACTIONS ── */}
                  {sectionHeader('Actions')}
                  <div className="space-y-1">
                    {actionButton('Fit to Kenya', <TargetIcon className="w-4 h-4" active={false} />, false, fitToKenya)}
                    {actionButton('Fit to Drawn', <CrosshairIcon className="w-4 h-4" active={false} />, false, fitToDrawn)}
                    {actionButton('GPS Tracking', <LocationDotIcon className="w-4 h-4" active={gpsTracking} />, gpsTracking, toggleGPS)}
                  </div>

                  {/* ── EXPORT ── */}
                  {featureCount > 0 && (
                    <>
                      {sectionHeader(`Export (${featureCount})`)}
                      <div className="space-y-1">
                        {actionButton('GeoJSON', <DownloadIcon className="w-4 h-4" active={false} />, false, () => exportFeatures('GeoJSON'))}
                        {actionButton('KML', <DownloadIcon className="w-4 h-4" active={false} />, false, () => exportFeatures('KML'))}
                        {actionButton('WKT', <DownloadIcon className="w-4 h-4" active={false} />, false, () => exportFeatures('WKT'))}
                        <div className="pt-1">
                          {actionButton('Clear All', <TrashIcon className="w-4 h-4" active={false} />, false, clearDrawn, true)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── BOTTOM BAR ── */}
            <div className="absolute bottom-0 left-0 right-0 z-10 md:bottom-0" style={{ bottom: 'var(--map-bottom-offset, 0px)' }}>
              <div className="mx-2 mb-2 h-8 bg-[#0d0d14]/95 backdrop-blur-xl border border-white/[0.06] rounded-lg flex items-center justify-between px-2 md:px-3 overflow-x-auto">
                {/* Coordinates */}
                <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
                  {mouseCoord ? (
                    <div className="flex items-center gap-1.5 md:gap-3 text-[10px] md:text-[11px] font-mono whitespace-nowrap">
                      <span className="text-gray-600">Lon</span>
                      <span className="text-gray-300 w-[60px] md:w-[76px] text-right">{mouseCoord.lon.toFixed(6)}</span>
                      <span className="text-gray-600">Lat</span>
                      <span className="text-gray-300 w-[60px] md:w-[76px] text-right">{mouseCoord.lat.toFixed(6)}</span>
                      <span className="hidden md:block w-px h-3.5 bg-white/[0.06]" />
                      <span className="text-[#E8841A]/70">E</span>
                      <span className="text-[#E8841A] font-medium w-[64px] md:w-[80px] text-right">{mouseCoord.e.toFixed(1)}</span>
                      <span className="text-[#E8841A]/70">N</span>
                      <span className="text-[#E8841A] font-medium w-[64px] md:w-[80px] text-right">{mouseCoord.n.toFixed(1)}</span>
                      <span className="text-gray-600 text-[9px] md:text-[10px]">EPSG:21037</span>
                    </div>
                  ) : (
                    <span className="text-[10px] md:text-[11px] text-gray-600">Move cursor for coordinates</span>
                  )}
                </div>

                {/* Right side placeholder for potential future info */}
                <div />
              </div>

              {/* Drag-drop hint */}
              {dragHint && (
                <div className="text-center mb-1 transition-opacity duration-1000">
                  <span className="text-[10px] text-gray-700 bg-[#0d0d14]/60 px-3 py-0.5 rounded-full backdrop-blur-sm">
                    Drag & drop GeoJSON, KML, or WKT files onto the map
                  </span>
                </div>
              )}
            </div>

            {/* ── IMPORT NOTIFICATION ── */}
            {importMsg && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#E8841A] text-white px-5 py-2.5 rounded-xl shadow-2xl text-sm font-semibold">
                {importMsg}
              </div>
            )}
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          GLOBAL STYLES (injected via useEffect to avoid styled-jsx
          issues with next/dynamic ssr:false components)
      ════════════════════════════════════════════════════════════ */}
      <MapGlobalStyles />
    </div>
    </MapErrorBoundary>
  )
}
