'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Global Map Page — Full OpenLayers Power
 * 
 * Features:
 *  - Draw interaction (Point, Line, Polygon, Circle)
 *  - Select interaction + Popup overlays
 *  - GeoJSON / KML / WKT import & export
 *  - Drag & Drop file import
 *  - MousePosition (live EPSG:4326 + EPSG:21037 coords)
 *  - Geolocation (GPS tracking)
 *  - OverviewMap mini-navigation
 *  - Cluster source for project markers
 *  - Multiple basemaps (OSM, Satellite, CartoDB Dark, Terrain)
 */

type BasemapMode = 'osm' | 'satellite' | 'dark' | 'terrain'
type DrawMode = 'none' | 'Point' | 'LineString' | 'Polygon' | 'Circle'

interface PopupData {
  coordinate: number[]
  projectName?: string
  stationName?: string
  easting?: string
  northing?: string
  geometryType?: string
}

export default function GlobalMapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [mapReady, setMapReady] = useState(false)
  const [initError, setInitError] = useState('')
  const [projectCount, setProjectCount] = useState(0)
  const [basemap, setBasemap] = useState<BasemapMode>('osm')
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [popup, setPopup] = useState<PopupData | null>(null)
  const [mouseCoord, setMouseCoord] = useState<{ lon: number; lat: number; e: number; n: number } | null>(null)
  const [gpsTracking, setGpsTracking] = useState(false)
  const [gpsPos, setGpsPos] = useState<{ lon: number; lat: number; accuracy: number } | null>(null)
  const [showOverview, setShowOverview] = useState(false)
  const [featureCount, setFeatureCount] = useState(0)
  const [importMsg, setImportMsg] = useState('')
  const drawSourceRef = useRef<any>(null)
  const drawInteractionRef = useRef<any>(null)
  const selectInteractionRef = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    let map: any = null
    let cancelled = false
    let olModules: any = {}

    async function initMap() {
      try {
        // Register projections
        await (await import('@/lib/map/projection')).registerProjections()

        // Import all OL modules we need
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
          import('ol/interaction/DragAndDrop'),
          import('ol/Overlay'),
          import('ol/Geolocation'),
          import('ol/format/GeoJSON'),
          import('ol/format/KML'),
          import('ol/format/WKT'),
          import('ol/proj'),
        ])

        // Destructure all modules
        const [Map, View, TileLayer, VectorLayer, LayerGroup, OSM, XYZ, VectorSource,
          Cluster, Feature, Point, Polygon, Circle, LineString, Style, Fill, Stroke,
          CircleStyle, Text, Icon, ScaleLine, FullScreen, Attribution, MousePosition,
          OverviewMap, ZoomSlider, Draw, Select, Snap, DragAndDrop, Overlay, Geolocation,
          GeoJSONFormat, KMLFormat, WKTFormat, proj] = imports.map(i => i.default || i)

        olModules = { VectorSource, VectorLayer, Feature, Point, Polygon, LineString, Circle, Style, Fill, Stroke, CircleStyle, Text, GeoJSONFormat, KMLFormat, WKTFormat, proj }

        if (cancelled || !mapRef.current) return

        // ── Basemap layers ──────────────────────────────────
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

        // ── Draw layer ─────────────────────────────────────
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

        // ── Cluster layer for projects ─────────────────────
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

        // ── Fetch projects from Supabase ────────────────────
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

              // Calculate centroid
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

        // ── Popup overlay ──────────────────────────────────
        const popupOverlay = new Overlay({
          element: popupRef.current!,
          autoPan: { animation: { duration: 250 } },
          positioning: 'bottom-center',
          offset: [0, -10],
        })

        // ── Create the map ─────────────────────────────────
        map = new Map({
          target: mapRef.current,
          layers: [basemaps.osm, basemaps.satellite, basemaps.dark, basemaps.terrain, clusterLayer, drawLayer],
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
                // Convert to EPSG:21037 for display
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

        // ── Select interaction for popups ──────────────────
        const select = new Select({
          style: new Style({
            fill: new Fill({ color: 'rgba(232,132,26,0.3)' }),
            stroke: new Stroke({ color: '#E8841A', width: 3 }),
            image: new CircleStyle({ radius: 10, fill: new Fill({ color: '#E8841A' }), stroke: new Stroke({ color: '#fff', width: 3 }) }),
          }),
          hitTolerance: 5,
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

            // Check if it's a cluster feature
            const clusterFeatures = feature.get('features')
            if (clusterFeatures && clusterFeatures.length > 1) {
              // Zoom into cluster
              const extent = feature.getGeometry()?.getExtent()
              if (extent) map.getView().fit(extent, { padding: [100, 100, 100, 100], duration: 500, maxZoom: 15 })
              setPopup(null)
              return
            }

            const projectName = props.projectName || (clusterFeatures?.[0]?.get?.('projectName')) || ''
            const stationName = props.stationName || props.label || ''

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
          }
        })

        // ── Snap interaction for draw ──────────────────────
        const snap = new Snap({ source: drawSource })
        map.addInteraction(snap)

        // ── Geolocation ────────────────────────────────────
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

        // ── Drag & Drop file import ────────────────────────
        const dragAndDrop = new DragAndDrop({
          formatConstructors: [
            GeoJSONFormat,
            KMLFormat,
            WKTFormat,
          ],
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
          }
        })
        map.addInteraction(dragAndDrop)

        // ── Track feature count ────────────────────────────
        drawSource.on('addfeature', () => {
          setFeatureCount(drawSource.getFeatures().length)
        })
        drawSource.on('removefeature', () => {
          setFeatureCount(drawSource.getFeatures().length)
        })

        // ── Zoom to data ──────────────────────────────────
        if (projectSource.getFeatures().length > 0) {
          try {
            const extent = projectSource.getExtent()
            if (extent[0] !== Infinity) {
              map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18 })
            }
          } catch { /* keep default */ }
        }

        // Store cleanup references
        ;(map as any)._cleanup = {
          geolocation, snap, dragAndDrop,
        }

        if (!cancelled) setMapReady(true)
      } catch (err: any) {
        console.error('Map initialization failed:', err)
        if (!cancelled) setInitError(err?.message || 'Map failed to load')
      }
    }

    initMap()

    return () => {
      cancelled = true
      if (map) {
        try {
          const cleanup = (map as any)._cleanup
          if (cleanup?.geolocation) cleanup.geolocation.setTracking(false)
        } catch { /* ignore */ }
        try { map.setTarget(undefined) } catch { /* ignore */ }
        mapInstance.current = null
      }
    }
  }, [])

  // ── Basemap toggle ────────────────────────────────────
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

  // ── Draw interaction management ────────────────────────
  const toggleDraw = useCallback(async (mode: DrawMode) => {
    if (!mapInstance.current) return
    const { default: Draw } = await import('ol/interaction/Draw')
    const { default: Snap } = await import('ol/interaction/Snap')
    const { default: VectorSource } = await import('ol/source/Vector')

    // Remove existing draw interaction
    if (drawInteractionRef.current) {
      mapInstance.current.removeInteraction(drawInteractionRef.current)
      drawInteractionRef.current = null
    }

    if (mode === 'none' || mode === drawMode) {
      setDrawMode('none')
      return
    }

    const source = drawSourceRef.current || new VectorSource()
    if (!drawSourceRef.current) {
      drawSourceRef.current = source
      const { default: VectorLayer } = await import('ol/layer/Vector')
      mapInstance.current.addLayer(new VectorLayer({ source, zIndex: 50 }))
    }

    const geomType = mode as 'Point' | 'LineString' | 'Polygon' | 'Circle'
    const draw = new Draw({
      source,
      type: geomType,
      style: new (await import('ol/style/Style')).default({
        fill: new (await import('ol/style/Fill')).default({ color: 'rgba(232,132,26,0.3)' }),
        stroke: new (await import('ol/style/Stroke')).default({ color: '#E8841A', width: 2, lineDash: [8, 4] }),
        image: new (await import('ol/style/Circle')).default({ radius: 6, fill: new (await import('ol/style/Fill')).default({ color: '#E8841A' }), stroke: new (await import('ol/style/Stroke')).default({ color: '#fff', width: 2 }) }),
      }),
    })

    draw.on('drawend', () => {
      // Deselect after drawing
      setTimeout(() => selectInteractionRef.current?.getFeatures()?.clear(), 100)
    })

    mapInstance.current.addInteraction(draw)
    drawInteractionRef.current = draw
    setDrawMode(mode)
  }, [drawMode])

  // ── Export drawn features ──────────────────────────────
  const exportFeatures = useCallback(async (format: 'GeoJSON' | 'KML' | 'WKT') => {
    if (!drawSourceRef.current || drawSourceRef.current.getFeatures().length === 0) return

    let output = ''
    let filename = ''
    let mimeType = ''

    if (format === 'GeoJSON') {
      const { default: GeoJSONFormat } = await import('ol/format/GeoJSON')
      const fmt = new GeoJSONFormat()
      output = JSON.stringify(fmt.writeFeatures(drawSourceRef.current.getFeatures(), {
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326',
      }), null, 2)
      filename = 'metardu-export.geojson'
      mimeType = 'application/geo+json'
    } else if (format === 'KML') {
      const { default: KMLFormat } = await import('ol/format/KML')
      const fmt = new KMLFormat()
      output = fmt.writeFeatures(drawSourceRef.current.getFeatures(), {
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326',
      })
      filename = 'metardu-export.kml'
      mimeType = 'application/vnd.google-earth.kml+xml'
    } else {
      const { default: WKTFormat } = await import('ol/format/WKT')
      const fmt = new WKTFormat()
      const features = drawSourceRef.current.getFeatures()
      output = features.map((f: any) => fmt.writeGeometry(f.getGeometry(), {
        dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857',
        rightHanded: true,
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

  // ── Clear drawn features ───────────────────────────────
  const clearDrawn = useCallback(() => {
    if (drawSourceRef.current) {
      drawSourceRef.current.clear()
      setFeatureCount(0)
    }
    setPopup(null)
    if (popupRef.current && mapInstance.current) {
      mapInstance.current.getOverlays().forEach((o: any) => o.setPosition(undefined))
    }
  }, [])

  // ── GPS tracking ───────────────────────────────────────
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

  // ── Overview map toggle ────────────────────────────────
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

  // ── Fit to Kenya ────────────────────────────────────────
  const fitToKenya = () => {
    if (!mapInstance.current) return
    mapInstance.current.getView().animate({ center: [-387647, -999571], zoom: 7, duration: 600 })
  }

  // ── Fit to drawn features ──────────────────────────────
  const fitToDrawn = useCallback(() => {
    if (!mapInstance.current || !drawSourceRef.current) return
    const extent = drawSourceRef.current.getExtent()
    if (extent[0] !== Infinity) {
      mapInstance.current.getView().fit(extent, { padding: [80, 80, 80, 80], duration: 400 })
    }
  }, [])

  // ── Close popup ────────────────────────────────────────
  const closePopup = useCallback(() => {
    setPopup(null)
    if (mapInstance.current) {
      mapInstance.current.getOverlays().forEach((o: any) => o.setPosition(undefined))
      selectInteractionRef.current?.getFeatures()?.clear()
    }
  }, [])

  return (
    <div className="h-[calc(100vh-4rem)] bg-[#0a0a0f] relative overflow-hidden">
      {/* Map container */}
      <div ref={mapRef} className="w-full h-full" />

      {/* Popup overlay element */}
      <div ref={popupRef} className="hidden">
        {popup && (
          <div className="bg-[#1a1a2e]/95 border border-[#E8841A]/40 rounded-xl shadow-2xl backdrop-blur-md p-4 min-w-[220px] max-w-[320px]">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#E8841A]" />
                <span className="text-xs text-gray-400 uppercase tracking-wider">{popup.geometryType}</span>
              </div>
              <button onClick={closePopup} className="text-gray-500 hover:text-white text-xs p-1">✕</button>
            </div>
            {popup.projectName && (
              <div className="mb-1">
                <span className="text-xs text-gray-500">Project</span>
                <p className="text-sm font-semibold text-white">{popup.projectName}</p>
              </div>
            )}
            {popup.stationName && (
              <div className="mb-1">
                <span className="text-xs text-gray-500">Station</span>
                <p className="text-sm text-[#E8841A]">{popup.stationName}</p>
              </div>
            )}
            {popup.easting && (
              <div className="text-xs text-gray-400 font-mono">
                E: {popup.easting} | N: {popup.northing}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {!mapReady && !initError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0a0f]">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[#E8841A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Loading map...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {initError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0a0f]">
          <div className="text-center max-w-md px-6">
            <div className="text-red-400 text-lg mb-2">Map Error</div>
            <p className="text-sm text-gray-400 mb-4">{initError}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-[#E8841A] text-white rounded-lg text-sm hover:bg-[#E8841A]/80">
              Reload Page
            </button>
          </div>
        </div>
      )}

      {/* ── TOOLBAR ── */}
      {mapReady && (
        <>
          {/* Top-left: basemap toggle + draw tools */}
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
            {/* Basemap selector */}
            <div className="bg-[#0a0a0f]/90 border border-white/10 rounded-lg overflow-hidden backdrop-blur-sm flex">
              {(['osm', 'satellite', 'dark', 'terrain'] as BasemapMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => toggleBasemap(mode)}
                  className={`px-3 py-2 text-xs font-medium transition-colors capitalize ${
                    basemap === mode ? 'bg-[#E8841A] text-white' : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Draw tools */}
            <div className="bg-[#0a0a0f]/90 border border-white/10 rounded-lg overflow-hidden backdrop-blur-sm">
              <div className="text-[10px] text-gray-500 px-3 pt-2 pb-1 uppercase tracking-wider font-semibold">Draw</div>
              <div className="flex">
                {(['Point', 'LineString', 'Polygon', 'Circle'] as DrawMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => toggleDraw(mode)}
                    className={`flex-1 px-2 py-2 text-xs transition-colors flex flex-col items-center gap-0.5 ${
                      drawMode === mode ? 'bg-[#E8841A] text-white' : 'text-gray-300 hover:text-white hover:bg-white/5'
                    }`}
                    title={`Draw ${mode}`}
                  >
                    {mode === 'Point' && '📍'}
                    {mode === 'LineString' && '✏️'}
                    {mode === 'Polygon' && '⬡'}
                    {mode === 'Circle' && '⭕'}
                    <span className="text-[9px]">{mode === 'LineString' ? 'Line' : mode}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="bg-[#0a0a0f]/90 border border-white/10 rounded-lg overflow-hidden backdrop-blur-sm">
              <button onClick={fitToKenya} className="w-full px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-white/5 text-left">
                🇰🇪 Fit to Kenya
              </button>
              <button onClick={fitToDrawn} className="w-full px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-white/5 text-left border-t border-white/5">
                🔍 Fit to Drawn
              </button>
              <button onClick={toggleGPS} className={`w-full px-3 py-2 text-xs text-left border-t border-white/5 ${gpsTracking ? 'text-green-400 bg-green-900/20' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}>
                {gpsTracking ? '📡 GPS On' : '📡 GPS Track'}
              </button>
              <button onClick={toggleOverview} className={`w-full px-3 py-2 text-xs text-left border-t border-white/5 ${showOverview ? 'text-[#E8841A] bg-[#E8841A]/10' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}>
                🗺️ Overview Map
              </button>
            </div>
          </div>

          {/* Top-right: Export + Clear */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 items-end">
            {featureCount > 0 && (
              <div className="bg-[#0a0a0f]/90 border border-white/10 rounded-lg overflow-hidden backdrop-blur-sm">
                <div className="text-[10px] text-gray-500 px-3 pt-2 pb-1 uppercase tracking-wider font-semibold">
                  Export ({featureCount} features)
                </div>
                <div className="flex">
                  {(['GeoJSON', 'KML', 'WKT'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => exportFeatures(fmt)}
                      className="px-3 py-2 text-xs text-[#E8841A] hover:bg-white/5 transition-colors font-medium"
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                <button onClick={clearDrawn} className="w-full px-3 py-2 text-xs text-red-400 hover:bg-red-900/20 text-left border-t border-white/5">
                  🗑️ Clear All
                </button>
              </div>
            )}
          </div>

          {/* Bottom-left: coordinate display */}
          <div className="absolute bottom-3 left-3 z-10 bg-[#0a0a0f]/90 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
            {mouseCoord ? (
              <div className="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-gray-500">Lon</span>{' '}
                  <span className="text-white">{mouseCoord.lon.toFixed(6)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Lat</span>{' '}
                  <span className="text-white">{mouseCoord.lat.toFixed(6)}</span>
                </div>
                <div className="border-l border-white/10 pl-3">
                  <span className="text-[#E8841A]">E</span>{' '}
                  <span className="text-[#E8841A]">{mouseCoord.e.toFixed(1)}</span>
                  {' '}
                  <span className="text-[#E8841A]">N</span>{' '}
                  <span className="text-[#E8841A]">{mouseCoord.n.toFixed(1)}</span>
                  <span className="text-gray-500 ml-1">21037</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">Move cursor for coordinates</p>
            )}
          </div>

          {/* Bottom-right: GPS info */}
          {gpsTracking && gpsPos && (
            <div className="absolute bottom-3 right-3 z-10 bg-[#0a0a0f]/90 border border-green-500/30 rounded-lg px-3 py-2 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <div className="text-xs font-mono">
                  <span className="text-green-400">GPS</span>{' '}
                  <span className="text-white">{gpsPos.lat.toFixed(6)}, {gpsPos.lon.toFixed(6)}</span>
                  <span className="text-gray-500 ml-2">±{gpsPos.accuracy.toFixed(0)}m</span>
                </div>
              </div>
            </div>
          )}

          {/* Import notification */}
          {importMsg && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-[#E8841A] text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-semibold animate-pulse">
              {importMsg}
            </div>
          )}

          {/* Bottom center: drag-drop hint */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
            <p className="text-[10px] text-gray-600 bg-[#0a0a0f]/70 px-2 py-1 rounded backdrop-blur-sm">
              Drag & drop GeoJSON, KML, or WKT files onto the map
            </p>
          </div>

          {/* Project count info */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-[#0a0a0f]/80 border border-white/5 rounded-full px-4 py-1.5 backdrop-blur-sm">
              <p className="text-xs text-gray-400">
                {projectCount > 0 ? (
                  <span><span className="text-[#E8841A] font-bold">{projectCount}</span> project{projectCount > 1 ? 's' : ''} loaded</span>
                ) : (
                  <span>No projects yet. <a href="/project/new" className="text-[#E8841A] hover:underline">Create one</a></span>
                )}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Overview map styling override */}
      <style jsx global>{`
        .ol-mouse-position {
          display: none !important;
        }
        .ol-overviewmap {
          bottom: 50px !important;
          left: 50% !important;
          right: auto !important;
          transform: translateX(-50%);
          border: 1px solid rgba(232,132,26,0.4) !important;
          border-radius: 8px !important;
          overflow: hidden !important;
        }
        .ol-overviewmap .ol-overviewmap-map {
          border: none !important;
        }
        .ol-overviewmap button {
          background: rgba(10,10,15,0.9) !important;
          color: #E8841A !important;
          border-radius: 4px !important;
        }
        .ol-zoomslider {
          background: rgba(10,10,15,0.9) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 8px !important;
          left: auto !important;
          right: 8px !important;
          top: 50% !important;
          transform: translateY(-50%);
          height: 120px !important;
        }
        .ol-zoomslider:hover {
          background: rgba(10,10,15,1) !important;
        }
        .ol-zoomslider .ol-zoomslider-thumb {
          background: #E8841A !important;
          border-radius: 4px !important;
          border: none !important;
        }
        .ol-zoomslider .ol-zoomslider-range {
          background: rgba(232,132,26,0.3) !important;
        }
        .ol-scale-line {
          left: 50% !important;
          right: auto !important;
          transform: translateX(-50%);
          bottom: 40px !important;
          border-color: rgba(232,132,26,0.5) !important;
        }
        .ol-scale-line-inner {
          background: rgba(232,132,26,0.7) !important;
          color: #ccc !important;
          border-color: rgba(232,132,26,0.5) !important;
          font-size: 10px !important;
        }
      `}</style>
    </div>
  )
}
