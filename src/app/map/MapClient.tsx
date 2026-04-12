'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  MapPinIcon, PencilIcon, HexagonIcon, CircleIcon,
  GlobeIcon, CrosshairIcon, SatelliteIcon, MapIcon,
  TrashIcon, BoltIcon, CompassIcon, RulerIcon,
  LayersIcon, EditIcon, UndoIcon, RedoIcon,
  TargetIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon,
  XIcon, SearchIcon, LocationDotIcon,
  MoonIcon, TerrainIcon, GridIcon, OpacityIcon,
} from '@/components/map/PremiumIcons'

// Client-side error catcher — prevents blank page on runtime errors
function MapErrorBoundary({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<{ message: string; stack?: string } | null>(null)

  useEffect(() => {
    const handler = (e: ErrorEvent) => {
      console.error('MapPage error:', e.error)
      setError({ message: e.message, stack: e.error?.stack })
    }
    const rejectionHandler = (e: PromiseRejectionEvent) => {
      console.error('MapPage unhandled rejection:', e.reason)
      setError({ message: String(e.reason) })
    }
    window.addEventListener('error', handler)
    window.addEventListener('unhandledrejection', rejectionHandler)
    return () => {
      window.removeEventListener('error', handler)
      window.removeEventListener('unhandledrejection', rejectionHandler)
    }
  }, [])

  if (error) {
    return (
      <div className="h-[calc(100vh-4rem)] bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center max-w-lg px-6">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-500/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">Map failed to load</h3>
          <p className="text-gray-400 text-sm mb-1">{error.message}</p>
          {error.stack && (
            <pre className="text-[10px] text-gray-600 mt-2 p-2 bg-white/[0.02] rounded-lg text-left overflow-auto max-h-32">
              {error.stack.slice(0, 500)}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-5 py-2 bg-[#E8841A] hover:bg-[#E8841A]/80 text-white text-sm rounded-lg transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

/**
 * METARDU Global Map Page — Premium OpenLayers Interface
 *
 * Features:
 *  - Draw interaction (Point, Line, Polygon, Circle)
 *  - Modify interaction (vertex editing)
 *  - Select interaction + Popup overlays
 *  - Undo / Redo history
 *  - Measurement (Distance & Area)
 *  - GeoJSON / KML / WKT import & export
 *  - Drag & Drop file import
 *  - MousePosition (live EPSG:21037 coords)
 *  - Geolocation (GPS tracking)
 *  - OverviewMap mini-navigation
 *  - Cluster source for project markers
 *  - Multiple basemaps (OSM, Satellite, Dark, Terrain)
 */

type BasemapMode = 'osm' | 'satellite' | 'dark' | 'terrain'
type DrawMode = 'none' | 'Point' | 'LineString' | 'Polygon' | 'Circle'
type MeasureMode = 'none' | 'distance' | 'area'

interface PopupData {
  coordinate: number[]
  projectName?: string
  stationName?: string
  easting?: string
  northing?: string
  geometryType?: string
}

interface HistoryEntry {
  featuresJson: string
}

/* ══════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════════════ */
export default function MapClient() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [mapReady, setMapReady] = useState(false)
  const [initError, setInitError] = useState('')
  const [projectCount, setProjectCount] = useState(0)
  const [basemap, setBasemap] = useState<BasemapMode>('osm')
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [measureMode, setMeasureMode] = useState<MeasureMode>('none')
  const [editMode, setEditMode] = useState(false)
  const [popup, setPopup] = useState<PopupData | null>(null)
  const [mouseCoord, setMouseCoord] = useState<{ lon: number; lat: number; e: number; n: number } | null>(null)
  const [gpsTracking, setGpsTracking] = useState(false)
  const [gpsPos, setGpsPos] = useState<{ lon: number; lat: number; accuracy: number } | null>(null)
  const [showOverview, setShowOverview] = useState(false)
  const [featureCount, setFeatureCount] = useState(0)
  const [importMsg, setImportMsg] = useState('')
  const [panelOpen, setPanelOpen] = useState(true)
  const [dragHint, setDragHint] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [selectedFeature, setSelectedFeature] = useState<any>(null)
  const [featureName, setFeatureName] = useState('')
  const [measureResult, setMeasureResult] = useState('')
  const [layerOpacity, setLayerOpacity] = useState(100)

  // Undo/redo
  const historyRef = useRef<HistoryEntry[]>([])
  const historyIndexRef = useRef(-1)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // OL refs
  const drawSourceRef = useRef<any>(null)
  const drawLayerRef = useRef<any>(null)
  const drawInteractionRef = useRef<any>(null)
  const selectInteractionRef = useRef<any>(null)
  const modifyInteractionRef = useRef<any>(null)
  const measureInteractionRef = useRef<any>(null)
  const measureSourceRef = useRef<any>(null)
  const measureLayerRef = useRef<any>(null)

  // Push to history
  const pushHistory = useCallback(() => {
    if (!drawSourceRef.current) return
    const json = JSON.stringify(drawSourceRef.current.getFeatures().map((f: any) => ({
      geometry: f.getGeometry()?.toJSON(),
      properties: f.getProperties(),
    })))
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
    newHistory.push({ featuresJson: json })
    if (newHistory.length > 50) newHistory.shift()
    historyRef.current = newHistory
    historyIndexRef.current = newHistory.length - 1
    setCanUndo(historyIndexRef.current > 0)
    setCanRedo(false)
  }, [])

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
        // Register projections
        await (await import('@/lib/map/projection')).registerProjections()

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
          import('ol/control/FullScreen'),
          import('ol/control/Attribution'),
          import('ol/control/MousePosition'),
          import('ol/control/OverviewMap'),
          import('ol/control/ZoomSlider'),
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
          CircleStyle, Text, Icon, ScaleLine, FullScreen, Attribution, MousePosition,
          OverviewMap, ZoomSlider, Draw, Select, Snap, Modify, DragAndDrop, Overlay, Geolocation,
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

        // ── Fetch projects from Supabase ──
        try {
          const { createClient } = await import('@/lib/supabase/client')
          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()

          if (session?.user) {
            const { data } = await supabase
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

              const zone = project.utm_zone || 37
              const hem = project.hemisphere || 'S'
              const epsg = hem === 'N' ? 32600 + zone : 32700 + zone
              const projCode = `EPSG:${epsg}`

              try {
                const proj4Module = await import('proj4')
                const proj4 = proj4Module.default
                const { register: reg } = await import('ol/proj/proj4')
                reg(proj4)
                proj4.defs(projCode, `+proj=utm +zone=${zone} +${hem === 'S' ? 'south' : 'north'} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`)
              } catch { /* already registered */ }

              const validCoords = adjustedStations
                .map((s: any) => [parseFloat(s.easting || s.E || s.e), parseFloat(s.northing || s.N || s.n)])
                .filter((c: number[]) => !isNaN(c[0]) && !isNaN(c[1]))

              if (validCoords.length === 0) continue
              const avgE = validCoords.reduce((s: number, c: number[]) => s + c[0], 0) / validCoords.length
              const avgN = validCoords.reduce((s: number, c: number[]) => s + c[1], 0) / validCoords.length

              try {
                const coords4326 = proj.transform([avgE, avgN], projCode, 'EPSG:4326')
                const coords3857 = proj.fromLonLat(coords4326)
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
        } catch { /* Supabase unavailable */ }

        // ── Popup overlay ──
        const popupOverlay = new Overlay({
          element: popupRef.current!,
          autoPan: { animation: { duration: 250 } },
          positioning: 'bottom-center',
          offset: [0, -10],
        })

        // ── Create the map ──
        map = new Map({
          target: mapRef.current,
          layers: [basemaps.osm, basemaps.satellite, basemaps.dark, basemaps.terrain, clusterLayer, drawLayer, measureLayer],
          view: new View({
            center: proj.fromLonLat([37.0, -1.0]),
            zoom: 7,
            maxZoom: 22,
            minZoom: 2,
          }),
          controls: [
            new ScaleLine({ units: 'metric' }),
            new FullScreen(),
            new Attribution({ collapsible: true }),
            new ZoomSlider(),
            new MousePosition({
              coordinateFormat: (coord: number[]) => {
                const lon = coord[0]
                const lat = coord[1]
                try {
                  const [e, n] = proj.transform(coord, 'EPSG:3857', 'EPSG:21037')
                  setMouseCoord({ lon, lat, e, n })
                  return `E: ${e.toFixed(1)}  N: ${n.toFixed(1)}`
                } catch {
                  setMouseCoord({ lon, lat, e: 0, n: 0 })
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
              setPopup(null)
              return
            }

            const projectName = props.projectName || (clusterFeatures?.[0]?.get?.('projectName')) || ''
            const stationName = props.stationName || props.label || props.name || ''

            setSelectedFeature(feature)
            setFeatureName(stationName || projectName || geomType)

            setPopup({
              coordinate: coord,
              projectName: projectName || undefined,
              stationName: stationName || undefined,
              geometryType: geomType,
            })
            if (coord) popupOverlay.setPosition(coord)
          } else {
            setPopup(null)
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

    return () => {
      cancelled = true
      clearTimeout(hintTimer)
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
    setPopup(null)
    setSelectedFeature(null)
    pushHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushHistory])

  // ══════════════════════════════════════════════════════════════════
  //  UNDO / REDO
  // ══════════════════════════════════════════════════════════════════
  const undo = useCallback(async () => {
    if (historyIndexRef.current <= 0 || !drawSourceRef.current) return
    historyIndexRef.current--
    const entry = historyRef.current[historyIndexRef.current]
    try {
      const { default: GeoJSONFormat } = await import('ol/format/GeoJSON')
      const features = JSON.parse(entry.featuresJson)
      drawSourceRef.current.clear()
      for (const f of features) {
        if (f.geometry) {
          const { default: Feature } = await import('ol/Feature')
          const geomType = f.geometry.type
          let geom: any = null
          if (geomType === 'Point') {
            const { default: Point } = await import('ol/geom/Point')
            geom = new Point(f.geometry.coordinates)
          } else if (geomType === 'LineString') {
            const { default: LineString } = await import('ol/geom/LineString')
            geom = new LineString(f.geometry.coordinates)
          } else if (geomType === 'Polygon') {
            const { default: Polygon } = await import('ol/geom/Polygon')
            geom = new Polygon(f.geometry.coordinates)
          } else if (geomType === 'Circle') {
            const { default: Circle } = await import('ol/geom/Circle')
            geom = new Circle(f.geometry.center, f.geometry.radius)
          }
          if (geom) {
            const feature = new Feature({ geometry: geom })
            if (f.properties) {
              Object.entries(f.properties).forEach(([k, v]) => {
                if (k !== 'geometry') feature.set(k, v)
              })
            }
            drawSourceRef.current.addFeature(feature)
          }
        }
      }
      setFeatureCount(drawSourceRef.current.getFeatures().length)
    } catch { /* ignore */ }
    setCanUndo(historyIndexRef.current > 0)
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1)
  }, [])

  const redo = useCallback(async () => {
    if (historyIndexRef.current >= historyRef.current.length - 1 || !drawSourceRef.current) return
    historyIndexRef.current++
    const entry = historyRef.current[historyIndexRef.current]
    try {
      const features = JSON.parse(entry.featuresJson)
      drawSourceRef.current.clear()
      for (const f of features) {
        if (f.geometry) {
          const { default: Feature } = await import('ol/Feature')
          const geomType = f.geometry.type
          let geom: any = null
          if (geomType === 'Point') {
            const { default: Point } = await import('ol/geom/Point')
            geom = new Point(f.geometry.coordinates)
          } else if (geomType === 'LineString') {
            const { default: LineString } = await import('ol/geom/LineString')
            geom = new LineString(f.geometry.coordinates)
          } else if (geomType === 'Polygon') {
            const { default: Polygon } = await import('ol/geom/Polygon')
            geom = new Polygon(f.geometry.coordinates)
          } else if (geomType === 'Circle') {
            const { default: Circle } = await import('ol/geom/Circle')
            geom = new Circle(f.geometry.center, f.geometry.radius)
          }
          if (geom) {
            const feature = new Feature({ geometry: geom })
            if (f.properties) {
              Object.entries(f.properties).forEach(([k, v]) => {
                if (k !== 'geometry') feature.set(k, v)
              })
            }
            drawSourceRef.current.addFeature(feature)
          }
        }
      }
      setFeatureCount(drawSourceRef.current.getFeatures().length)
    } catch { /* ignore */ }
    setCanUndo(historyIndexRef.current > 0)
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1)
  }, [])

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
    setPopup(null)
    setSelectedFeature(null)
    if (popupRef.current && mapInstance.current) {
      mapInstance.current.getOverlays().forEach((o: any) => o.setPosition(undefined))
    }
    historyRef.current = []
    historyIndexRef.current = -1
    setCanUndo(false)
    setCanRedo(false)
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
  //  OVERVIEW MAP TOGGLE
  // ══════════════════════════════════════════════════════════════════
  const toggleOverview = useCallback(async () => {
    if (!mapInstance.current) return
    const { default: OverviewMap } = await import('ol/control/OverviewMap')
    const { default: TileLayer } = await import('ol/layer/Tile')
    const { default: OSM } = await import('ol/source/OSM')

    if (showOverview) {
      const controls = mapInstance.current.getControls()
      controls.forEach((c: any) => {
        if (c instanceof OverviewMap) mapInstance.current.removeControl(c)
      })
      setShowOverview(false)
    } else {
      const overview = new OverviewMap({
        layers: [new TileLayer({ source: new OSM() })],
        collapsed: false,
        className: 'ol-overviewmap',
      })
      mapInstance.current.addControl(overview)
      setShowOverview(true)
    }
  }, [showOverview])

  // ══════════════════════════════════════════════════════════════════
  //  NAVIGATION
  // ══════════════════════════════════════════════════════════════════
  const fitToKenya = () => {
    if (!mapInstance.current) return
    mapInstance.current.getView().animate({ center: [-387647, -999571], zoom: 7, duration: 600 })
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
  const handleCoordSearch = useCallback(async () => {
    if (!mapInstance.current || !searchInput.trim()) return
    const parts = searchInput.trim().split(/[,\s]+/).map(Number).filter(n => !isNaN(n))
    if (parts.length >= 2) {
      let lon = parts[1]
      let lat = parts[0]
      // If values look like Eastings/Northings (large numbers), treat differently
      if (Math.abs(parts[0]) > 100 && Math.abs(parts[1]) > 100) {
        // Likely UTM coordinates - try to transform from EPSG:21037
        try {
          const { transform } = await import('ol/proj')
          const [x, y] = transform([parts[0], parts[1]], 'EPSG:21037', 'EPSG:3857')
          mapInstance.current.getView().animate({ center: [x, y], zoom: 16, duration: 600 })
        } catch { /* fallback */ }
      } else {
        if (lon > lat) { [lon, lat] = [lat, lon] } // common swap
        const { fromLonLat } = await import('ol/proj')
        const center = fromLonLat([lon, lat])
        mapInstance.current.getView().animate({ center, zoom: 16, duration: 600 })
      }
    }
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
  //  CLOSE POPUP
  // ══════════════════════════════════════════════════════════════════
  const closePopup = useCallback(() => {
    setPopup(null)
    setSelectedFeature(null)
    if (mapInstance.current) {
      mapInstance.current.getOverlays().forEach((o: any) => o.setPosition(undefined))
      selectInteractionRef.current?.getFeatures()?.clear()
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
    <div className="h-[calc(100vh-4rem)] bg-[#0a0a0f] relative overflow-hidden">

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

            {/* Search - top right */}
            <div className="absolute top-3 right-3 z-20">
              <div className="relative">
                <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="lat, lon or E N"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCoordSearch()}
                  className="w-44 h-8 bg-[#0d0d14]/90 backdrop-blur-xl border border-white/[0.06] rounded-xl pl-8 pr-3 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-[#E8841A]/30 transition-colors shadow-lg"
                />
              </div>
            </div>

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

        {/* Popup overlay element */}
        <div ref={popupRef} className="hidden">
          {popup && (
            <div className="bg-[#14141e]/95 border border-[#E8841A]/30 rounded-xl shadow-2xl backdrop-blur-xl p-4 min-w-[220px] max-w-[320px]">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#E8841A]" />
                  <span className="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-semibold">{popup.geometryType}</span>
                </div>
                <button onClick={closePopup} className="text-gray-600 hover:text-white transition-colors p-0.5">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              {popup.projectName && (
                <div className="mb-1">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">Project</span>
                  <p className="text-sm font-semibold text-white">{popup.projectName}</p>
                </div>
              )}
              {popup.stationName && (
                <div className="mb-1">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">Station</span>
                  <p className="text-sm text-[#E8841A]">{popup.stationName}</p>
                </div>
              )}
              {popup.easting && (
                <div className="text-[11px] text-gray-400 font-mono mt-2">
                  E: {popup.easting} | N: {popup.northing}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Loading overlay */}
        {!mapReady && !initError && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0a0a0f]">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-[#E8841A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Loading map...</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {initError && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0a0a0f]">
            <div className="text-center max-w-md px-6">
              <div className="text-red-400 text-lg mb-2">Map Error</div>
              <p className="text-sm text-gray-400 mb-4">{initError}</p>
              <button onClick={() => window.location.reload()} className="px-4 py-2 bg-[#E8841A] text-white rounded-lg text-sm hover:bg-[#E8841A]/80 transition-colors">
                Reload Page
              </button>
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
                    {actionButton('Overview Map', <LayersIcon className="w-4 h-4" active={showOverview} />, showOverview, toggleOverview)}
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
            <div className="absolute bottom-0 left-0 right-0 z-10">
              <div className="mx-2 mb-2 h-8 bg-[#0d0d14]/95 backdrop-blur-xl border border-white/[0.06] rounded-lg flex items-center justify-between px-3">
                {/* Coordinates */}
                <div className="flex items-center gap-3">
                  {mouseCoord ? (
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="text-gray-600">Lon</span>
                      <span className="text-gray-300 w-[76px] text-right">{mouseCoord.lon.toFixed(6)}</span>
                      <span className="text-gray-600">Lat</span>
                      <span className="text-gray-300 w-[76px] text-right">{mouseCoord.lat.toFixed(6)}</span>
                      <span className="w-px h-3.5 bg-white/[0.06]" />
                      <span className="text-[#E8841A]/70">E</span>
                      <span className="text-[#E8841A] font-medium w-[80px] text-right">{mouseCoord.e.toFixed(1)}</span>
                      <span className="text-[#E8841A]/70">N</span>
                      <span className="text-[#E8841A] font-medium w-[80px] text-right">{mouseCoord.n.toFixed(1)}</span>
                      <span className="text-gray-600 text-[10px]">EPSG:21037</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-gray-600">Move cursor for coordinates</span>
                  )}
                </div>

                {/* GPS status */}
                <div className="flex items-center gap-2">
                  {gpsTracking && gpsPos && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-[10px] text-green-400/80 font-mono">
                        {gpsPos.accuracy.toFixed(0)}m
                      </span>
                    </div>
                  )}
                </div>
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
          GLOBAL STYLES
      ════════════════════════════════════════════════════════════ */}
      <style jsx global>{`
        .ol-mouse-position {
          display: none !important;
        }
        .ol-overviewmap {
          bottom: 50px !important;
          left: 50% !important;
          right: auto !important;
          transform: translateX(-50%);
          border: 1px solid rgba(232,132,26,0.3) !important;
          border-radius: 10px !important;
          overflow: hidden !important;
          background: rgba(13,13,20,0.95) !important;
        }
        .ol-overviewmap .ol-overviewmap-map {
          border: none !important;
        }
        .ol-overviewmap button {
          background: rgba(13,13,20,0.9) !important;
          color: #E8841A !important;
          border-radius: 6px !important;
        }
        .ol-zoomslider {
          background: rgba(13,13,20,0.9) !important;
          border: 1px solid rgba(255,255,255,0.06) !important;
          border-radius: 10px !important;
          left: auto !important;
          right: 8px !important;
          top: 50% !important;
          transform: translateY(-50%);
          height: 120px !important;
        }
        .ol-zoomslider:hover {
          background: rgba(13,13,20,1) !important;
        }
        .ol-zoomslider .ol-zoomslider-thumb {
          background: #E8841A !important;
          border-radius: 6px !important;
          border: none !important;
        }
        .ol-zoomslider .ol-zoomslider-range {
          background: rgba(232,132,26,0.2) !important;
        }
        .ol-scale-line {
          display: none !important;
        }
        .ol-control button {
          background: rgba(13,13,20,0.9) !important;
          color: #9ca3af !important;
          border-radius: 8px !important;
          border: 1px solid rgba(255,255,255,0.06) !important;
        }
        .ol-control button:hover {
          background: rgba(13,13,20,1) !important;
          color: #E8841A !important;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.08);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.15);
        }
      `}</style>
    </div>
    </MapErrorBoundary>
  )
}
