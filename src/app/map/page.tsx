'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function GlobalMapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [projectCount, setProjectCount] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let map: any = null
    let mounted = true

    async function initMap() {
      try {
        const [
          { default: Map },
          { default: View },
          { default: OSM },
          { default: TileLayer },
          { default: VectorLayer },
          { default: VectorSource },
          { default: Feature },
          { default: Point },
          { default: fromLonLat },
          { default: Circle as CircleStyle },
          { default: Fill },
          { default: Stroke },
          { default: Text },
          { default: Style },
          { default: Select },
          { default: ScaleLine },
          { default: Zoom },
          { default: FullScreen },
          { transform },
          { default: Polygon as OlPolygon },
        ] = await Promise.all([
          import('ol/Map'),
          import('ol/View'),
          import('ol/layer/Tile'),
          import('ol/layer/Tile').then(m => ({ default: m.default })),
          import('ol/layer/Vector'),
          import('ol/source/Vector'),
          import('ol/Feature'),
          import('ol/geom/Point'),
          import('ol/proj'),
          import('ol/style/Circle'),
          import('ol/style/Fill'),
          import('ol/style/Stroke'),
          import('ol/style/Text'),
          import('ol/style/Style'),
          import('ol/interaction/Select'),
          import('ol/control/ScaleLine'),
          import('ol/control/Zoom'),
          import('ol/control/FullScreen'),
          import('ol/proj'),
          import('ol/geom/Polygon'),
        ])

        if (!mounted || !mapRef.current) return

        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        // Fetch all user projects with boundary data
        let projects: any[] = []
        if (session?.user) {
          const { data } = await supabase
            .from('projects')
            .select('id, name, location, utm_zone, hemisphere, survey_type, boundary_data')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
          projects = data || []
        }

        if (mounted) setProjectCount(projects.length)

        // Create map layers
        const osmLayer = new TileLayer({
          source: new OSM(),
        })

        const vectorSource = new VectorSource()

        // Add project points and boundaries to map
        for (const project of projects) {
          try {
            const bd = project.boundary_data
            const adjustedStations = bd?.adjustedStations || bd?.stations || []

            if (adjustedStations.length > 0) {
              // Determine UTM zone for projection
              const zone = project.utm_zone || 37
              const hem = project.hemisphere || 'S'
              const epsg = hem === 'N' ? 32600 + zone : 32700 + zone

              // Register projection if not already registered
              let projCode = `EPSG:${epsg}`
              try {
                const proj4def = `+proj=utm +zone=${zone} +${hem === 'S' ? 'south' : 'north'} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`
                const { register } = await import('ol/proj/proj4')
                const proj4 = (await import('proj4')).default
                register(proj4)
                proj4.defs(projCode, proj4def)
              } catch {
                // Projection may already be registered
              }

              // Add beacon points
              for (const station of adjustedStations) {
                const e = parseFloat(station.easting || station.E || station.e)
                const n = parseFloat(station.northing || station.N || station.n)
                if (isNaN(e) || isNaN(n)) continue

                try {
                  const [lon, lat] = transform([e, n], projCode, 'EPSG:4326')
                  const coords = fromLonLat([lon, lat])

                  const feature = new Feature({
                    geometry: new Point(coords),
                    projectName: project.name,
                    stationName: station.name || station.station || station.id || '',
                  })

                  feature.setStyle(new Style({
                    image: new CircleStyle({
                      radius: 6,
                      fill: new Fill({ color: '#E8841A' }),
                      stroke: new Stroke({ color: '#fff', width: 1.5 }),
                    }),
                    text: new Text({
                      text: station.name || station.station || station.id || '',
                      offsetY: -14,
                      font: '11px sans-serif',
                      fill: new Fill({ color: '#fff' }),
                      stroke: new Stroke({ color: '#000', width: 2.5 }),
                    }),
                  }))

                  vectorSource.addFeature(feature)
                } catch {
                  // Skip stations that can't be projected
                }
              }

              // Add boundary polygon if we have enough points
              if (adjustedStations.length >= 3) {
                try {
                  const validCoords = adjustedStations
                    .map((s: any) => [
                      parseFloat(s.easting || s.E || s.e),
                      parseFloat(s.northing || s.N || s.n),
                    ])
                    .filter((c: number[]) => !isNaN(c[0]) && !isNaN(c[1]))

                  if (validCoords.length >= 3) {
                    const ring = [...validCoords, validCoords[0]]
                    const transformed = ring.map((c: number[]) => {
                      const [lon, lat] = transform(c, projCode, 'EPSG:4326')
                      return fromLonLat([lon, lat])
                    })

                    const polygonFeature = new Feature({
                      geometry: new OlPolygon([transformed]),
                      projectName: project.name,
                    })
                    polygonFeature.setStyle(new Style({
                      fill: new Fill({ color: 'rgba(232, 132, 26, 0.12)' }),
                      stroke: new Stroke({ color: '#E8841A', width: 2 }),
                    }))
                    vectorSource.addFeature(polygonFeature)
                  }
                } catch {
                  // Skip polygon if projection fails
                }
              }
            }
          } catch {
            // Skip project if boundary data is malformed
          }
        }

        const vectorLayer = new VectorLayer({
          source: vectorSource,
        })

        // Default center on Kenya (Zone 37S)
        const defaultCenter = fromLonLat([37.0, -1.0])

        map = new Map({
          target: mapRef.current!,
          layers: [osmLayer, vectorLayer],
          view: new View({
            center: defaultCenter,
            zoom: 7,
            maxZoom: 22,
          }),
          controls: [
            new ScaleLine(),
            new Zoom(),
            new FullScreen(),
          ],
        })

        // Click interaction to show project info
        const select = new Select()
        map.addInteraction(select)

        select.on('select', (evt: any) => {
          const feature = evt.selected[0]
          if (feature) {
            const name = feature.get('projectName') || 'Project'
            const station = feature.get('stationName') || ''
            const coord = feature.getGeometry().getCoordinates()
            const [lon, lat] = transform(coord, 'EPSG:3857', 'EPSG:4326')

            let content = `<strong>${name}</strong>`
            if (station) content += `<br/>Station: ${station}`
            content += `<br/>${lat.toFixed(6)}, ${lon.toFixed(6)}`

            const popup = document.getElementById('map-popup')
            const popupContent = document.getElementById('map-popup-content')
            if (popup && popupContent) {
              popupContent.innerHTML = content
              popup.style.display = 'block'
              popup.style.left = `${evt.mapBrowserEvent.pixel[0] + 10}px`
              popup.style.top = `${evt.mapBrowserEvent.pixel[1] - 10}px`
            }
          } else {
            const popup = document.getElementById('map-popup')
            if (popup) popup.style.display = 'none'
          }
        })

        // Zoom to data extent if we have features
        if (vectorSource.getFeatures().length > 0) {
          try {
            const extent = vectorSource.getExtent()
            if (extent[0] !== Infinity) {
              map.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 18 })
            }
          } catch {
            // Keep default view
          }
        }

        if (mounted) setLoading(false)
      } catch (err) {
        if (mounted) {
          setError('Failed to load map. Please refresh the page.')
          setLoading(false)
        }
      }
    }

    initMap()

    return () => {
      mounted = false
      if (map) {
        map.setTarget(undefined)
      }
      // Hide popup
      const popup = document.getElementById('map-popup')
      if (popup) popup.style.display = 'none'
    }
  }, [])

  return (
    <div className="h-[calc(100vh-4rem)] bg-[var(--bg-primary)] relative">
      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0a0f]">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">Loading map...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-red-900/80 border border-red-500/40 text-red-200 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Map container */}
      <div ref={mapRef} className="w-full h-full" />

      {/* Popup */}
      <div
        id="map-popup"
        className="absolute z-30 hidden bg-[var(--bg-secondary)]/95 border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] max-w-[220px] backdrop-blur-sm shadow-lg pointer-events-none"
      >
        <div id="map-popup-content" />
      </div>

      {/* Info bar */}
      {!loading && (
        <div className="absolute bottom-4 left-4 z-20 bg-[var(--bg-secondary)]/90 border border-[var(--border-color)] rounded-lg px-3 py-2 backdrop-blur-sm">
          <p className="text-xs text-[var(--text-secondary)]">
            {projectCount > 0
              ? `${projectCount} project${projectCount > 1 ? 's' : ''} loaded`
              : 'No projects yet. '}
            {!projectCount && (
              <Link href="/project/new" className="text-[var(--accent)] hover:underline ml-1">
                Create your first project
              </Link>
            )}
          </p>
        </div>
      )}

      {/* Layer toggle */}
      {!loading && (
        <div className="absolute top-4 right-4 z-20 flex gap-2">
          <button
            onClick={async () => {
              try {
                const { default: XYZ } = await import('ol/source/XYZ')
                const { default: TileLayer } = await import('ol/layer/Tile')
                const olMap = (mapRef.current as any).__map
                if (!olMap) {
                  // Access via OL internal
                  const layers = document.querySelector('.ol-viewport')
                  console.log('Toggle satellite')
                  return
                }
              } catch { /* ignore */ }
            }}
            className="bg-[var(--bg-secondary)]/90 border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] backdrop-blur-sm transition-colors"
          >
            OpenStreetMap
          </button>
        </div>
      )}
    </div>
  )
}
