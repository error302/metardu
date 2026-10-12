'use client'
import { useEffect, useRef, useState } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorSource from 'ol/source/Vector'
import VectorLayer from 'ol/layer/Vector'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import { transformPoint } from '@/lib/spatial/projectCrs'
export default function PublicControlMap({ marks }: { marks: Array<{ id: string; name: string; easting: number; northing: number; horizontal_crs: string | null }> }) {
  const target = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!target.current) return
    let map: Map | undefined
    try {
      const features = marks.filter(mark => mark.horizontal_crs).map(mark => new Feature({
        geometry: new Point(transformPoint(mark.easting, mark.northing, mark.horizontal_crs as string, 'EPSG:3857')),
        name: mark.name, id: mark.id,
      }))
      if (!features.length) return
      const source = new VectorSource({ features })
      map = new Map({ target: target.current, layers: [new TileLayer({ source: new OSM() }), new VectorLayer({ source })], view: new View({ center: (features[0].getGeometry() as Point).getCoordinates(), zoom: 12 }) })
      const extent = source.getExtent()
      if (extent) map.getView().fit(extent, { padding: [30, 30, 30, 30], maxZoom: 16 })
      setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Map references could not be rendered') }
    return () => map?.setTarget(undefined)
  }, [marks])
  return <div className="space-y-2">{error && <p role="alert" className="text-red-400 text-sm">{error}</p>}<div ref={target} className="h-[420px] w-full border border-[var(--border-color)] rounded-lg overflow-hidden" aria-label="Published reference locations map" /><p className="text-xs text-[var(--text-muted)]">Map positions use each record’s declared grid. The basemap supports locating the mark; it does not verify its coordinates.</p></div>
}
