'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

/**
 * Global Map Page
 *
 * Renders a full-screen OpenLayers map accessible from the navbar.
 * Uses next/dynamic to avoid SSR issues with the OL package.
 */

function MapInner() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [projectCount, setProjectCount] = useState(0)
  const [basemap, setBasemap] = useState<'osm' | 'satellite'>('osm')

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    let cancelled = false
    let map: any = null

    async function init() {
      try {
        // Register projections first (needed for UTM transforms)
        const { registerProjections } = await import('@/lib/map/projection')
        await registerProjections()

        // Import all OL modules
        const [
          MapMod,
          ViewMod,
          TileLayerMod,
          VectorLayerMod,
          OSMMod,
          XYZMod,
          VectorSourceMod,
          FeatureMod,
          PointMod,
          PolygonMod,
          CircleStyleMod,
          FillMod,
          StrokeMod,
          TextMod,
          StyleMod,
          SelectMod,
          ScaleLineMod,
          FullScreenMod,
          AttrMod,
          projMod,
        ] = await Promise.all([
          import('ol/Map'),
          import('ol/View'),
          import('ol/layer/Tile'),
          import('ol/layer/Vector'),
          import('ol/source/OSM'),
          import('ol/source/XYZ'),
          import('ol/source/Vector'),
          import('ol/Feature'),
          import('ol/geom/Point'),
          import('ol/geom/Polygon'),
          import('ol/style/Circle'),
          import('ol/style/Fill'),
          import('ol/style/Stroke'),
          import('ol/style/Text'),
          import('ol/style/Style'),
          import('ol/interaction/Select'),
          import('ol/control/ScaleLine'),
          import('ol/control/FullScreen'),
          import('ol/control/Attribution'),
          import('ol/proj'),
        ])

        if (cancelled || !mapRef.current) return

        const Map = MapMod.default
        const View = ViewMod.default
        const TileLayer = TileLayerMod.default
        const VectorLayer = VectorLayerMod.default
        const OSM = OSMMod.default
        const XYZ = XYZMod.default
        const VectorSource = VectorSourceMod.default
        const Feature = FeatureMod.default
        const Point = PointMod.default
        const Polygon = PolygonMod.default
        const CircleStyle = CircleStyleMod.default
        const Fill = FillMod.default
        const Stroke = StrokeMod.default
        const Text = TextMod.default
        const Style = StyleMod.default
        const Select = SelectMod.default
        const ScaleLine = ScaleLineMod.default
        const FullScreen = FullScreenMod.default
        const Attribution = AttrMod.default
        const { fromLonLat, transform } = projMod

        // ── Basemap layers ─────────────────────────────────
        const osmLayer = new TileLayer({
          source: new OSM({
            crossOrigin: 'anonymous',
          }),
          visible: true,
        })
        osmLayer.set('basemapId', 'osm')

        const satelliteLayer = new TileLayer({
          source: new XYZ({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            crossOrigin: 'anonymous',
            maxZoom: 19,
            attributions: 'Tiles &copy; Esri',
          }),
          visible: false,
        })
        satelliteLayer.set('basemapId', 'satellite')

        // ── Vector layer for project data ──────────────────
        const vectorSource = new VectorSource()
        const vectorLayer = new VectorLayer({
          source: vectorSource,
          zIndex: 10,
        })

        // ── Fetch projects from Supabase ───────────────────
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
              try {
                const bd = project.boundary_data
                const adjustedStations = bd?.adjustedStations || bd?.stations || []
                if (adjustedStations.length === 0) continue

                const zone = project.utm_zone || 37
                const hem = project.hemisphere || 'S'
                const epsg = hem === 'N' ? 32600 + zone : 32700 + zone
                const projCode = `EPSG:${epsg}`

                // Register UTM projection if needed
                try {
                  const proj4 = (await import('proj4')).default
                  const { register } = await import('ol/proj/proj4')
                  register(proj4)
                  proj4.defs(projCode, `+proj=utm +zone=${zone} +${hem === 'S' ? 'south' : 'north'} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`)
                } catch {
                  // Projection may already be registered
                }

                // Add beacon points
                for (const station of adjustedStations) {
                  const e = parseFloat(station.easting || station.E || station.e)
                  const n = parseFloat(station.northing || station.N || station.n)
                  if (isNaN(e) || isNaN(n)) continue

                  try {
                    const coords4326 = transform([e, n], projCode, 'EPSG:4326')
                    const coords3857 = fromLonLat(coords4326)

                    const feature = new Feature({
                      geometry: new Point(coords3857),
                      projectName: project.name,
                      stationName: station.name || station.station || station.id || '',
                      type: 'beacon',
                    })

                    feature.setStyle(new Style({
                      image: new CircleStyle({
                        radius: 7,
                        fill: new Fill({ color: '#E8841A' }),
                        stroke: new Stroke({ color: '#ffffff', width: 2 }),
                      }),
                      text: new Text({
                        text: station.name || station.station || station.id || '',
                        offsetY: -16,
                        font: 'bold 11px Calibri, sans-serif',
                        fill: new Fill({ color: '#E8841A' }),
                        stroke: new Stroke({ color: '#ffffff', width: 3 }),
                      }),
                    }))

                    vectorSource.addFeature(feature)
                  } catch {
                    // Skip individual beacon on transform error
                  }
                }

                // Add boundary polygon
                const validCoords = adjustedStations
                  .map((s: any) => [
                    parseFloat(s.easting || s.E || s.e),
                    parseFloat(s.northing || s.N || s.n),
                  ])
                  .filter((c: number[]) => !isNaN(c[0]) && !isNaN(c[1]))

                if (validCoords.length >= 3) {
                  try {
                    const ring = [...validCoords, validCoords[0]]
                    const transformed = ring.map((c: number[]) => {
                      const c4326 = transform(c, projCode, 'EPSG:4326')
                      return fromLonLat(c4326)
                    })
                    const polygonFeature = new Feature({
                      geometry: new Polygon([transformed]),
                      projectName: project.name,
                      type: 'boundary',
                    })
                    polygonFeature.setStyle(new Style({
                      fill: new Fill({ color: 'rgba(232, 132, 26, 0.12)' }),
                      stroke: new Stroke({ color: '#E8841A', width: 2.5 }),
                    }))
                    vectorSource.addFeature(polygonFeature)
                  } catch {
                    // Skip polygon on error
                  }
                }
              } catch {
                // Skip individual project on error
              }
            }
          }
        } catch {
          // Supabase not available or auth failed - show empty map
        }

        if (cancelled || !mapRef.current) return

        // ── Create map ─────────────────────────────────────
        map = new Map({
          target: mapRef.current,
          layers: [osmLayer, satelliteLayer, vectorLayer],
          view: new View({
            center: fromLonLat([37.0, -1.0]), // Kenya center
            zoom: 7,
            maxZoom: 22,
            minZoom: 2,
          }),
          controls: [
            new ScaleLine({ units: 'metric' }),
            new FullScreen(),
            new Attribution({ collapsible: true }),
          ],
        })

        mapInstance.current = map

        // ── Click popup ────────────────────────────────────
        const select = new Select({
          layers: [vectorLayer],
          hitTolerance: 5,
        })
        map.addInteraction(select)

        select.on('select', (evt: any) => {
          const popup = document.getElementById('map-popup')
          const popupContent = document.getElementById('map-popup-content')
          if (!popup || !popupContent) return

          const feature = evt.selected[0]
          if (feature) {
            const name = feature.get('projectName') || 'Project'
            const station = feature.get('stationName') || ''
            const geom = feature.getGeometry()
            if (!geom) return

            const coord = geom.getCoordinates()
            let lon = 0, lat = 0
            try {
              const [x, y] = transform(coord, 'EPSG:3857', 'EPSG:4326')
              lon = x
              lat = y
            } catch {
              // Use raw coords if transform fails
            }

            popupContent.innerHTML = `
              <div style="font-weight:600;color:#E8841A;margin-bottom:2px;">${name}</div>
              ${station ? `<div style="color:#aaa;">Beacon: ${station}</div>` : ''}
              <div style="color:#888;font-size:10px;margin-top:3px;">
                ${lat.toFixed(6)}, ${lon.toFixed(6)}
              </div>
            `
            popup.style.display = 'block'
            popup.style.left = `${evt.mapBrowserEvent.pixel[0] + 12}px`
            popup.style.top = `${evt.mapBrowserEvent.pixel[1] - 12}px`
          } else {
            popup.style.display = 'none'
          }
        })

        // Close popup on map click elsewhere
        map.on('click', () => {
          const popup = document.getElementById('map-popup')
          if (popup && select.getFeatures().getLength() === 0) {
            popup.style.display = 'none'
          }
        })

        // ── Zoom to data extent if available ───────────────
        const features = vectorSource.getFeatures()
        if (features.length > 0) {
          try {
            const extent = vectorSource.getExtent()
            if (extent[0] !== Infinity && extent[1] !== Infinity) {
              map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18, duration: 800 })
            }
          } catch {
            // Keep default view
          }
        }

        if (!cancelled) setReady(true)
      } catch (err: any) {
        console.error('Map init error:', err)
        if (!cancelled) {
          setError(err?.message || 'Failed to load map. Please refresh the page.')
          setReady(true) // Show the error state
        }
      }
    }

    init()

    return () => {
      cancelled = true
      if (map) {
        try { map.setTarget(undefined) } catch { /* ignore */ }
        mapInstance.current = null
      }
    }
  }, [])

  // ── Basemap toggle handler ─────────────────────────────
  const toggleBasemap = (mode: 'osm' | 'satellite') => {
    if (!mapInstance.current) return
    const map = mapInstance.current
    const layers = map.getLayers().getArray()

    for (const layer of layers) {
      const id = layer.get('basemapId')
      if (id === 'osm') layer.setVisible(mode === 'osm')
      if (id === 'satellite') layer.setVisible(mode === 'satellite')
    }
    setBasemap(mode)
  }

  const fitToKenya = () => {
    if (!mapInstance.current) return
    const { fromLonLat } = (window as any).ol?.proj || {}
    mapInstance.current.getView().animate({
      center: [-387647, -999571], // Kenya center in EPSG:3857
      zoom: 7,
      duration: 600,
    })
  }

  return (
    <div className="h-[calc(100vh-4rem)] bg-[#0a0a0f] relative overflow-hidden">
      {/* Loading state */}
      {!ready && !error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0a0a0f]">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[#E8841A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Loading map...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0a0a0f]">
          <div className="text-center max-w-md px-6">
            <div className="text-red-400 text-lg mb-2">Map Error</div>
            <p className="text-sm text-gray-400 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#E8841A] text-white rounded-lg text-sm hover:bg-[#E8841A]/80"
            >
              Reload Page
            </button>
          </div>
        </div>
      )}

      {/* Map container - must be in DOM even during loading for OL to target */}
      <div
        ref={mapRef}
        className="w-full h-full"
        style={{ visibility: ready && !error ? 'visible' : 'hidden' }}
      />

      {/* Map toolbar - only show when ready */}
      {ready && !error && (
        <>
          {/* Top-left controls */}
          <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
            {/* Basemap toggle */}
            <div className="bg-[#0a0a0f]/90 border border-white/10 rounded-lg overflow-hidden backdrop-blur-sm">
              <button
                onClick={() => toggleBasemap('osm')}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  basemap === 'osm'
                    ? 'bg-[#E8841A] text-white'
                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
              >
                Streets
              </button>
              <button
                onClick={() => toggleBasemap('satellite')}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  basemap === 'satellite'
                    ? 'bg-[#E8841A] text-white'
                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
              >
                Satellite
              </button>
            </div>

            {/* Fit to extent */}
            <button
              onClick={fitToKenya}
              className="bg-[#0a0a0f]/90 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-white/5 backdrop-blur-sm transition-colors"
              title="Reset view to Kenya"
            >
              Fit to Kenya
            </button>
          </div>

          {/* Bottom-left info bar */}
          <div className="absolute bottom-3 left-3 z-20 bg-[#0a0a0f]/90 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
            <p className="text-xs text-gray-400">
              {projectCount > 0 ? (
                <span>
                  <span className="text-[#E8841A] font-semibold">{projectCount}</span> project{projectCount > 1 ? 's' : ''} loaded
                  with beacon data
                </span>
              ) : (
                <span>
                  No project data to display.
                  <a href="/project/new" className="text-[#E8841A] hover:underline ml-1">
                    Create a project
                  </a>{' '}
                  to see survey data on the map.
                </span>
              )}
            </p>
          </div>
        </>
      )}

      {/* Click popup */}
      <div
        id="map-popup"
        className="absolute z-30 bg-[#0a0a0f]/95 border border-white/10 rounded-lg px-3 py-2 text-xs max-w-[220px] backdrop-blur-sm shadow-xl pointer-events-none"
        style={{ display: 'none' }}
      >
        <div id="map-popup-content" />
      </div>
    </div>
  )
}

// Use dynamic import with ssr: false to prevent OL from being bundled server-side
export default dynamic(() => Promise.resolve(MapInner), { ssr: false })
