'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Global Map Page
 * Full-screen OpenLayers map accessible from the navbar.
 * Follows the same pattern as SurveyMap (which works in project workspaces).
 */

export default function GlobalMapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [initError, setInitError] = useState('')
  const [projectCount, setProjectCount] = useState(0)
  const [basemap, setBasemap] = useState<'osm' | 'satellite'>('osm')

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    let map: any = null
    let cancelled = false

    async function initMap() {
      try {
        // Step 1: Register projections (needed for UTM)
        await (await import('@/lib/map/projection')).registerProjections()

        // Step 2: Import OL modules one at a time for better error diagnostics
        const { default: Map } = await import('ol/Map')
        const { default: View } = await import('ol/View')
        const { default: TileLayer } = await import('ol/layer/Tile')
        const { default: VectorLayer } = await import('ol/layer/Vector')
        const { default: OSM } = await import('ol/source/OSM')
        const { default: XYZ } = await import('ol/source/XYZ')
        const { default: VectorSource } = await import('ol/source/Vector')
        const { default: Feature } = await import('ol/Feature')
        const { default: Point } = await import('ol/geom/Point')
        const { default: Polygon } = await import('ol/geom/Polygon')
        const { default: CircleStyle } = await import('ol/style/Circle')
        const { default: Fill } = await import('ol/style/Fill')
        const { default: Stroke } = await import('ol/style/Stroke')
        const { default: Text } = await import('ol/style/Text')
        const { default: Style } = await import('ol/style/Style')
        const { default: ScaleLine } = await import('ol/control/ScaleLine')
        const { default: FullScreen } = await import('ol/control/FullScreen')
        const { default: Attribution } = await import('ol/control/Attribution')
        const { fromLonLat, transform } = await import('ol/proj')

        if (cancelled || !mapRef.current) return

        // ── Basemap layers ──────────────────────────────────
        const osmLayer = new TileLayer({
          source: new OSM({ crossOrigin: 'anonymous' }),
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

        // ── Vector layer for project data ───────────────────
        const vectorSource = new VectorSource()
        const vectorLayer = new VectorLayer({ source: vectorSource, zIndex: 10 })

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
              try {
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
                  const { register } = await import('ol/proj/proj4')
                  register(proj4)
                  proj4.defs(projCode, `+proj=utm +zone=${zone} +${hem === 'S' ? 'south' : 'north'} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`)
                } catch {
                  // Already registered
                }

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
                    })
                    feature.setStyle(new Style({
                      image: new CircleStyle({
                        radius: 7,
                        fill: new Fill({ color: '#E8841A' }),
                        stroke: new Stroke({ color: '#fff', width: 2 }),
                      }),
                      text: new Text({
                        text: station.name || station.station || station.id || '',
                        offsetY: -16,
                        font: 'bold 11px Calibri, sans-serif',
                        fill: new Fill({ color: '#E8841A' }),
                        stroke: new Stroke({ color: '#fff', width: 3 }),
                      }),
                    }))
                    vectorSource.addFeature(feature)
                  } catch { /* skip beacon */ }
                }

                // Boundary polygon
                const validCoords = adjustedStations
                  .map((s: any) => [parseFloat(s.easting || s.E || s.e), parseFloat(s.northing || s.N || s.n)])
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
                    })
                    polygonFeature.setStyle(new Style({
                      fill: new Fill({ color: 'rgba(232,132,26,0.12)' }),
                      stroke: new Stroke({ color: '#E8841A', width: 2.5 }),
                    }))
                    vectorSource.addFeature(polygonFeature)
                  } catch { /* skip polygon */ }
                }
              } catch { /* skip project */ }
            }
          }
        } catch {
          // Supabase unavailable
        }

        if (cancelled || !mapRef.current) return

        // ── Create the map ──────────────────────────────────
        map = new Map({
          target: mapRef.current,
          layers: [osmLayer, satelliteLayer, vectorLayer],
          view: new View({
            center: fromLonLat([37.0, -1.0]),
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

        // ── Zoom to data if any ─────────────────────────────
        if (vectorSource.getFeatures().length > 0) {
          try {
            const extent = vectorSource.getExtent()
            if (extent[0] !== Infinity) {
              map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 18 })
            }
          } catch { /* keep default */ }
        }

        if (!cancelled) setMapReady(true)
      } catch (err: any) {
        console.error('Map initialization failed:', err)
        if (!cancelled) {
          setInitError(err?.message || 'Map failed to load')
        }
      }
    }

    initMap()

    return () => {
      cancelled = true
      if (map) {
        try { map.setTarget(undefined) } catch { /* ignore */ }
        mapInstance.current = null
      }
    }
  }, [])

  // ── Basemap toggle ────────────────────────────────────
  const toggleBasemap = (mode: 'osm' | 'satellite') => {
    if (!mapInstance.current) return
    for (const layer of mapInstance.current.getLayers().getArray()) {
      const id = layer.get('basemapId')
      if (id === 'osm') layer.setVisible(mode === 'osm')
      if (id === 'satellite') layer.setVisible(mode === 'satellite')
    }
    setBasemap(mode)
  }

  const fitToKenya = () => {
    if (!mapInstance.current) return
    mapInstance.current.getView().animate({
      center: [-387647, -999571],
      zoom: 7,
      duration: 600,
    })
  }

  return (
    <div className="h-[calc(100vh-4rem)] bg-[#0a0a0f] relative overflow-hidden">
      {/* Map container — always rendered so OL can target it */}
      <div ref={mapRef} className="w-full h-full" />

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
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#E8841A] text-white rounded-lg text-sm hover:bg-[#E8841A]/80"
            >
              Reload Page
            </button>
          </div>
        </div>
      )}

      {/* Toolbar — visible once map is ready */}
      {mapReady && (
        <>
          {/* Top-left: basemap toggle + fit */}
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
            <div className="bg-[#0a0a0f]/90 border border-white/10 rounded-lg overflow-hidden backdrop-blur-sm">
              <button
                onClick={() => toggleBasemap('osm')}
                className={`px-3 py-2 text-xs font-medium transition-colors ${basemap === 'osm' ? 'bg-[#E8841A] text-white' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}
              >
                Streets
              </button>
              <button
                onClick={() => toggleBasemap('satellite')}
                className={`px-3 py-2 text-xs font-medium transition-colors ${basemap === 'satellite' ? 'bg-[#E8841A] text-white' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}
              >
                Satellite
              </button>
            </div>
            <button
              onClick={fitToKenya}
              className="bg-[#0a0a0f]/90 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 hover:text-white hover:bg-white/5 backdrop-blur-sm"
            >
              Fit to Kenya
            </button>
          </div>

          {/* Bottom-left: info */}
          <div className="absolute bottom-3 left-3 z-10 bg-[#0a0a0f]/90 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
            <p className="text-xs text-gray-400">
              {projectCount > 0 ? (
                <span><span className="text-[#E8841A] font-semibold">{projectCount}</span> project{projectCount > 1 ? 's' : ''} loaded</span>
              ) : (
                <span>No project data. <a href="/project/new" className="text-[#E8841A] hover:underline">Create a project</a> to see survey data.</span>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
