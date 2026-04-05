'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TopoCanvas } from '@/components/drawing/TopoCanvas'
import { generateContours } from '@/lib/topo/contourGenerator'
import type { ContourLine } from '@/lib/topo/contourGenerator'
import type { SpotHeight } from '@/components/drawing/TopoCanvas'

const INTERVAL_OPTIONS = [0.25, 0.5, 1, 2, 5, 10]
const RESOLUTION_OPTIONS = [0.5, 1, 2, 5]

export default function TopoPage() {
  const { id } = useParams()
  const supabase = createClient()
  const workerRef = useRef<Worker | null>(null)

  const [spotHeights, setSpotHeights] = useState<SpotHeight[]>([])
  const [contours, setContours] = useState<ContourLine[]>([])
  const [interval, setInterval] = useState(1)
  const [resolution, setResolution] = useState(1)
  const [status, setStatus] = useState<'idle' | 'loading' | 'computing' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [pointCount, setPointCount] = useState(0)

  useEffect(() => {
    loadSpotHeights()
    return () => { workerRef.current?.terminate() }
  }, [id])

  async function loadSpotHeights() {
    setStatus('loading')
    const { data, error } = await supabase
      .from('survey_points')
      .select('easting, northing, elevation, name')
      .eq('project_id', id)
      .eq('point_type', 'spot_height')
      .not('elevation', 'is', null)

    if (error || !data) {
      setStatus('error')
      return
    }

    const pts: SpotHeight[] = data.map((p: any) => ({
      e: p.easting,
      n: p.northing,
      z: p.elevation,
      label: p.name
    }))

    setSpotHeights(pts)
    setPointCount(pts.length)
    setStatus('idle')
  }

  function runIDW() {
    if (spotHeights.length < 3) return
    setStatus('computing')
    setProgress(0)
    setContours([])

    workerRef.current?.terminate()

    const worker = new Worker(
      new URL('@/workers/idw.worker.ts', import.meta.url)
    )
    workerRef.current = worker

    worker.postMessage({
      points: spotHeights.map(p => ({ e: p.e, n: p.n, z: p.z })),
      gridResolution: resolution,
      power: 2,
      searchRadius: 0
    })

    worker.onmessage = (e) => {
      const { result, progress: prog } = e.data

      if (prog !== undefined) {
        setProgress(prog)
        return
      }

      if (result) {
        const lines = generateContours(result, { interval, indexInterval: 5 })
        setContours(lines)
        setStatus('done')
        worker.terminate()
      }
    }
  }

  async function exportDXF() {
    const res = await fetch(`/api/topo/export/dxf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id, contours, spotHeights })
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `topo_${id}.dxf`
    a.click()
  }

  async function exportGeoJSON() {
    const features = contours.flatMap(c =>
      c.coordinates.map(ring => ({
        type: 'Feature',
        properties: { elevation: c.elevation, isIndex: c.isIndex },
        geometry: { type: 'LineString', coordinates: ring.map(([e, n]) => [e, n]) }
      }))
    )
    const geojson = { type: 'FeatureCollection', features }
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contours_${id}.geojson`
    a.click()
  }

  async function exportShapefile() {
    const res = await fetch(`/api/topo/export/shapefile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id, contours, spotHeights })
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contours_${id}.zip`
    a.click()
  }

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-xl font-bold">Topographic Map</h2>
        <p className="text-sm text-[var(--text-muted)]">
          {pointCount} spot heights loaded
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">
            Contour Interval (m)
          </label>
          <select
            value={interval}
            onChange={e => setInterval(Number(e.target.value))}
            className="bg-[var(--bg-secondary)] border rounded px-3 py-1.5 text-sm"
          >
            {INTERVAL_OPTIONS.map(v => (
              <option key={v} value={v}>{v}m</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">
            Grid Resolution (m)
          </label>
          <select
            value={resolution}
            onChange={e => setResolution(Number(e.target.value))}
            className="bg-[var(--bg-secondary)] border rounded px-3 py-1.5 text-sm"
          >
            {RESOLUTION_OPTIONS.map(v => (
              <option key={v} value={v}>{v}m</option>
            ))}
          </select>
        </div>

        <button
          onClick={runIDW}
          disabled={spotHeights.length < 3 || status === 'computing'}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm font-medium"
        >
          {status === 'computing' ? `Computing... ${progress}%` : 'Generate Contours'}
        </button>

        {status === 'done' && (
          <span className="text-sm text-green-400">
            ✓ {contours.length} contour levels generated
          </span>
        )}
      </div>

      {status === 'computing' && (
        <div className="w-full bg-[var(--bg-secondary)] rounded-full h-1.5">
          <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <TopoCanvas
        spotHeights={spotHeights}
        contours={contours}
        width={880}
        height={620}
        showLabels
        showSpotHeights
      />

      {status === 'done' && contours.length > 0 && (
        <div className="flex gap-3">
          <button onClick={exportDXF} className="border rounded px-4 py-2 text-sm hover:bg-[var(--bg-secondary)]">
            Export DXF
          </button>
          <button onClick={exportGeoJSON} className="border rounded px-4 py-2 text-sm hover:bg-[var(--bg-secondary)]">
            Export GeoJSON
          </button>
          <button onClick={exportShapefile} className="border rounded px-4 py-2 text-sm hover:bg-[var(--bg-secondary)]">
            Export Shapefile
          </button>
        </div>
      )}
    </div>
  )
}
