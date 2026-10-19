'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  CAMERA_PRESETS,
  computeFlightPlan,
  FlightParameters,
  PolygonNode,
  FlightPlan,
  exportToKML,
  exportToWPML,
} from '@/lib/drone/flightPlanningEngine'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  Drone,
  Compass,
  Download,
  Upload,
  Copy,
  Plus,
  Trash2,
  RefreshCw,
  Layers,
  BatteryCharging,
  Clock,
  Camera,
  MapPin,
  Check,
} from 'lucide-react'

// Realistic benchmark parcel presets (Lat/Lon)
const PRESET_PARCELS: Record<string, { name: string; nodes: PolygonNode[] }> = {
  eldoret_farm: {
    name: 'Eldoret 5-Hectare Farm Cadastral',
    nodes: [
      { x: 35.2690, y: 0.5140 },
      { x: 35.2725, y: 0.5140 },
      { x: 35.2730, y: 0.5115 },
      { x: 35.2685, y: 0.5118 },
    ],
  },
  naivasha_scheme: {
    name: 'Naivasha 25-Hectare Residential Subdivision',
    nodes: [
      { x: 36.4250, y: -0.7180 },
      { x: 36.4310, y: -0.7170 },
      { x: 36.4325, y: -0.7225 },
      { x: 36.4270, y: -0.7240 },
      { x: 36.4240, y: -0.7210 },
    ],
  },
  nyeri_topo: {
    name: 'Nyeri Hill 12-Hectare Topographic Survey',
    nodes: [
      { x: 36.9500, y: -0.4200 },
      { x: 36.9560, y: -0.4200 },
      { x: 36.9575, y: -0.4260 },
      { x: 36.9490, y: -0.4250 },
    ],
  },
}

export default function DroneFlightPlanPage() {
  const [selectedPreset, setSelectedPreset] = useState<string>('eldoret_farm')
  const [polygon, setPolygon] = useState<PolygonNode[]>(PRESET_PARCELS.eldoret_farm.nodes)
  const [pasteModalOpen, setPasteModalOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const [params, setParams] = useState<FlightParameters>({
    cameraId: CAMERA_PRESETS[0].id,
    targetGsd: 2.0,
    flightAltitude: 100,
    forwardOverlap: 0.75,
    sideOverlap: 0.70,
    flightSpeed: 10,
    flightAngle: 'auto',
  })

  const [flightPlan, setFlightPlan] = useState<FlightPlan | null>(null)
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null)

  // Active camera sensor details
  const activeCamera = useMemo(() => {
    return CAMERA_PRESETS.find((c) => c.id === params.cameraId) || CAMERA_PRESETS[0]
  }, [params.cameraId])

  // Two-way calculation between GSD and Altitude
  const handleAltitudeChange = (newAlt: number) => {
    const pixelSize = Math.max(
      activeCamera.sensorWidth / activeCamera.pixelWidth,
      activeCamera.sensorHeight / activeCamera.pixelHeight
    )
    const newGsd = (newAlt * pixelSize * 100) / activeCamera.focalLength
    setParams((prev) => ({
      ...prev,
      flightAltitude: newAlt,
      targetGsd: Math.round(newGsd * 100) / 100,
    }))
  }

  const handleGsdChange = (newGsd: number) => {
    const pixelSize = Math.max(
      activeCamera.sensorWidth / activeCamera.pixelWidth,
      activeCamera.sensorHeight / activeCamera.pixelHeight
    )
    const newAlt = (newGsd * activeCamera.focalLength) / (pixelSize * 100)
    setParams((prev) => ({
      ...prev,
      targetGsd: newGsd,
      flightAltitude: Math.round(newAlt),
    }))
  }

  // Preset switch
  const handlePresetSelect = (key: string) => {
    setSelectedPreset(key)
    if (PRESET_PARCELS[key]) {
      setPolygon(PRESET_PARCELS[key].nodes)
    }
  }

  // Node editing
  const updateNode = (index: number, field: 'x' | 'y', val: number) => {
    const next = [...polygon]
    next[index] = { ...next[index], [field]: val }
    setPolygon(next)
  }

  const addNode = () => {
    const last = polygon[polygon.length - 1]
    setPolygon([...polygon, { x: last.x + 0.001, y: last.y + 0.001 }])
  }

  const removeNode = (index: number) => {
    if (polygon.length <= 3) {
      alert('A polygon boundary requires at least 3 vertices.')
      return
    }
    setPolygon(polygon.filter((_, i) => i !== index))
  }

  // Handle parse pasted text (e.g. lon,lat or lat,lon)
  const handleApplyPasted = () => {
    try {
      const lines = pasteText.trim().split('\n')
      const parsed: PolygonNode[] = []
      for (const line of lines) {
        const parts = line.split(/[,\s\t]+/).filter(Boolean)
        if (parts.length >= 2) {
          const v1 = parseFloat(parts[0])
          const v2 = parseFloat(parts[1])
          if (!isNaN(v1) && !isNaN(v2)) {
            // Check if lon, lat or lat, lon
            // Longitude in East Africa is ~30 to 42, Latitude is ~ -5 to +5
            if (Math.abs(v1) > Math.abs(v2)) {
              parsed.push({ x: v1, y: v2 }) // lon, lat
            } else {
              parsed.push({ x: v2, y: v1 }) // lat, lon -> x: lon, y: lat
            }
          }
        }
      }
      if (parsed.length >= 3) {
        setPolygon(parsed)
        setPasteModalOpen(false)
        setPasteText('')
      } else {
        alert('Please enter at least 3 valid coordinate pairs.')
      }
    } catch {
      alert('Error parsing coordinates. Format: Longitude, Latitude')
    }
  }

  // Compute flight path whenever params or polygon change
  useEffect(() => {
    if (polygon.length < 3) return

    const centerLon = polygon[0].x
    const centerLat = polygon[0].y
    const mPerDegLat = 111320
    const mPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180)

    const projectedPoly = polygon.map((p) => ({
      x: (p.x - centerLon) * mPerDegLon,
      y: (p.y - centerLat) * mPerDegLat,
    }))

    const plan = computeFlightPlan(projectedPoly, params)

    plan.waypoints = plan.waypoints.map((w) => ({
      x: centerLon + w.x / mPerDegLon,
      y: centerLat + w.y / mPerDegLat,
      isTrigger: w.isTrigger,
    }))

    setFlightPlan(plan)
  }, [params, polygon])

  // File downloads
  const handleDownload = (format: 'wpml' | 'kml' | 'csv') => {
    if (!flightPlan) return
    let content = ''
    let filename = ''
    let type = 'text/plain'

    const baseName = (PRESET_PARCELS[selectedPreset]?.name || 'Mission').replace(/\s+/g, '_')

    if (format === 'wpml') {
      content = exportToWPML(flightPlan)
      filename = `${baseName}_DJI_Pilot2.wpml`
      type = 'application/xml'
    } else if (format === 'kml') {
      content = exportToKML(flightPlan)
      filename = `${baseName}_GoogleEarth.kml`
      type = 'application/vnd.google-earth.kml+xml'
    } else if (format === 'csv') {
      content =
        'Waypoint_ID,Longitude,Latitude,Altitude_AGL_m,Is_Camera_Trigger\n' +
        flightPlan.waypoints
          .map(
            (w, i) =>
              `${i + 1},${w.x.toFixed(6)},${w.y.toFixed(6)},${flightPlan.altitude.toFixed(1)},${
                w.isTrigger ? 'YES' : 'NO'
              }`
          )
          .join('\n')
      filename = `${baseName}_Waypoints.csv`
      type = 'text/csv'
    }

    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/tools">Tools</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Automated Drone Flight Planner</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          badge="UAV PHOTOGRAMMETRY"
          title="Automated Drone Flight Planner & Mission Builder"
          subtitle="Design terrain-optimized serpentine flight plans with Ground Sampling Distance (GSD) calibration, forward & side overlap controls, camera optical sensor modeling, and direct export to DJI WPML, Google Earth KML, and waypoint CSV."
          reference="ASPRS Positional Accuracy Standards for Digital Geospatial Data | DJI Pilot 2 WPML"
        />

        {/* 4 Summary Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
              <span>GSD & Altitude</span>
              <Camera className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div className="text-xl font-black font-mono text-[var(--text-primary)]">
              {flightPlan?.gsd.toFixed(2)} cm/px
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
              Flight Alt: {flightPlan?.altitude.toFixed(0)} m AGL
            </div>
          </div>

          <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
              <span>Flight Time & Batteries</span>
              <BatteryCharging className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-black font-mono text-[var(--text-primary)]">
              {flightPlan?.flightTimeMinutes.toFixed(1)} min
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
              Est. Batteries: {flightPlan?.batteriesNeeded} pack(s)
            </div>
          </div>

          <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
              <span>Survey Coverage</span>
              <Layers className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl font-black font-mono text-[var(--text-primary)]">
              {flightPlan?.areaHectares.toFixed(2)} ha
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
              Flight Distance: {flightPlan?.totalDistance.toFixed(2)} km
            </div>
          </div>

          <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
              <span>Photos & Strips</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-black font-mono text-[var(--text-primary)]">
              {flightPlan?.photoCount} photos
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
              {flightPlan?.linesCount} flight strip lines
            </div>
          </div>
        </div>

        {/* Main Workbench: Controls on Left, Visualizer on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Mission Parameters & Boundary (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Boundary Geometry Manager */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[var(--accent)]" />
                  1. Parcel Boundary Geometry
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPasteModalOpen(true)}
                    className="py-1 px-2 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-[11px] font-medium transition-colors flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" /> Paste Coordinates
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Load Survey Benchmark Preset
                </label>
                <select
                  value={selectedPreset}
                  onChange={(e) => handlePresetSelect(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs focus:outline-none focus:border-[var(--accent)]"
                >
                  {Object.entries(PRESET_PARCELS).map(([k, v]) => (
                    <option key={k} value={k} className="bg-[var(--bg-secondary)]">
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vertex Nodes Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs text-[var(--text-secondary)] font-medium px-1">
                  <span>Polygon Vertices ({polygon.length} nodes)</span>
                  <button
                    onClick={addNode}
                    className="text-[var(--accent)] hover:underline flex items-center gap-1 text-[11px]"
                  >
                    <Plus className="w-3 h-3" /> Add Vertex
                  </button>
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {polygon.map((node, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-1.5 rounded-lg border border-[var(--border-color)] bg-black/20 text-xs"
                    >
                      <span className="w-6 text-center font-mono text-[var(--text-secondary)] text-[10px]">
                        #{idx + 1}
                      </span>
                      <div className="flex-1 flex gap-1 items-center">
                        <span className="text-[10px] text-zinc-500">Lon:</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={node.x}
                          onChange={(e) => updateNode(idx, 'x', parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent font-mono text-xs focus:outline-none"
                        />
                      </div>
                      <div className="flex-1 flex gap-1 items-center">
                        <span className="text-[10px] text-zinc-500">Lat:</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={node.y}
                          onChange={(e) => updateNode(idx, 'y', parseFloat(e.target.value) || 0)}
                          className="w-full bg-transparent font-mono text-xs focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={() => removeNode(idx)}
                        className="text-red-400 hover:text-red-300 p-1"
                        title="Remove node"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Flight Optics & Parameters */}
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="border-b border-[var(--border-color)] pb-3">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Drone className="w-4 h-4 text-[var(--accent)]" />
                  2. Optical Sensor & Flight Altitude
                </h2>
              </div>

              {/* Camera Presets */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Drone Payload & Sensor
                </label>
                <select
                  value={params.cameraId}
                  onChange={(e) => setParams({ ...params, cameraId: e.target.value })}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs focus:outline-none focus:border-[var(--accent)]"
                >
                  {CAMERA_PRESETS.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[var(--bg-secondary)]">
                      {c.name} (Focal: {c.focalLength}mm, Sensor: {c.sensorWidth}×{c.sensorHeight}mm)
                    </option>
                  ))}
                </select>
              </div>

              {/* Target GSD and Altitude Sliders */}
              <div className="space-y-3 pt-1">
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-[var(--text-secondary)]">Target Ground Resolution (GSD):</span>
                    <span className="font-mono font-bold text-[var(--accent)]">{params.targetGsd} cm/px</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="5.0"
                    step="0.1"
                    value={params.targetGsd}
                    onChange={(e) => handleGsdChange(parseFloat(e.target.value))}
                    className="w-full accent-[var(--accent)] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-[var(--text-secondary)]">Flight Altitude (Above Ground Level):</span>
                    <span className="font-mono font-bold text-emerald-400">{params.flightAltitude} m AGL</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="200"
                    step="5"
                    value={params.flightAltitude}
                    onChange={(e) => handleAltitudeChange(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Overlap Sliders */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-[var(--text-secondary)]">Forward Overlap:</span>
                    <span className="font-mono font-bold">{(params.forwardOverlap * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="85"
                    step="1"
                    value={params.forwardOverlap * 100}
                    onChange={(e) => setParams({ ...params, forwardOverlap: parseInt(e.target.value, 10) / 100 })}
                    className="w-full accent-[var(--accent)] cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-[var(--text-secondary)]">Side Overlap:</span>
                    <span className="font-mono font-bold">{(params.sideOverlap * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="80"
                    step="1"
                    value={params.sideOverlap * 100}
                    onChange={(e) => setParams({ ...params, sideOverlap: parseInt(e.target.value, 10) / 100 })}
                    className="w-full accent-[var(--accent)] cursor-pointer"
                  />
                </div>
              </div>

              {/* Speed & Grid Angle */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Flight Speed (m/s)
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="15"
                    value={params.flightSpeed}
                    onChange={(e) => setParams({ ...params, flightSpeed: parseFloat(e.target.value) || 8 })}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs font-mono focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Grid Flight Line Angle
                  </label>
                  <select
                    value={params.flightAngle === 'auto' ? 'auto' : params.flightAngle}
                    onChange={(e) =>
                      setParams({
                        ...params,
                        flightAngle: e.target.value === 'auto' ? 'auto' : parseFloat(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-[var(--border-color)] bg-black/20 px-3 py-2 text-xs focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value="auto">Auto (Longest Axis)</option>
                    <option value="0">0° (North - South)</option>
                    <option value="90">90° (East - West)</option>
                    <option value="45">45° (North-East)</option>
                  </select>
                </div>
              </div>

              {/* Downloads Bar */}
              <div className="pt-3 border-t border-[var(--border-color)] space-y-2">
                <button
                  onClick={() => handleDownload('wpml')}
                  className="w-full py-2.5 px-4 rounded-xl bg-[var(--accent)] text-black font-bold text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-md shadow-[color-mix(in_srgb,var(--accent)_15%,transparent)]"
                >
                  <Download className="w-4 h-4" /> Download DJI Pilot 2 WPML (.kmz)
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleDownload('kml')}
                    className="py-2 px-3 rounded-xl border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-400" /> Google Earth KML
                  </button>
                  <button
                    onClick={() => handleDownload('csv')}
                    className="py-2 px-3 rounded-xl border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" /> Waypoints CSV
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Flight Path Visualizer (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <div>
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[var(--accent)]" />
                    Interactive Serpentine Flight Mission Map
                  </h2>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Polygon boundary (green), flight track lines (cyan), camera shutter triggers (yellow dots)
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
                  <span>Zoom: Fit</span>
                </div>
              </div>

              {/* SVG Canvas */}
              <div className="relative w-full h-[520px] bg-black/40 border border-[var(--border-color)] rounded-xl overflow-hidden flex items-center justify-center p-4">
                {flightPlan && polygon.length >= 3 && (
                  <svg
                    viewBox="-50 -50 1100 1100"
                    className="w-full h-full"
                    style={{ transform: 'scaleY(-1)' }}
                  >
                    {(() => {
                      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
                      polygon.forEach((p) => {
                        if (p.x < minX) minX = p.x
                        if (p.x > maxX) maxX = p.x
                        if (p.y < minY) minY = p.y
                        if (p.y > maxY) maxY = p.y
                      })

                      const width = maxX - minX
                      const height = maxY - minY
                      const scale = Math.min(1000 / (width || 1), 1000 / (height || 1)) * 0.9

                      const nx = (x: number) => (x - minX) * scale + 50
                      const ny = (y: number) => (y - minY) * scale + 50

                      const polyPoints = polygon.map((p) => `${nx(p.x)},${ny(p.y)}`).join(' ')
                      const wpPoints = flightPlan.waypoints.map((w) => `${nx(w.x)},${ny(w.y)}`).join(' ')

                      return (
                        <g>
                          {/* Background Grid Lines */}
                          <defs>
                            <pattern id="flight-grid" width="100" height="100" patternUnits="userSpaceOnUse">
                              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                            </pattern>
                          </defs>
                          <rect x="-50" y="-50" width="1100" height="1100" fill="url(#flight-grid)" />

                          {/* Parcel Polygon */}
                          <polygon
                            points={polyPoints}
                            fill="rgba(34, 197, 94, 0.12)"
                            stroke="#22c55e"
                            strokeWidth="3"
                          />

                          {/* Parcel Vertices */}
                          {polygon.map((p, i) => (
                            <circle
                              key={i}
                              cx={nx(p.x)}
                              cy={ny(p.y)}
                              r="5"
                              fill="#22c55e"
                              stroke="white"
                              strokeWidth="1.5"
                            />
                          ))}

                          {/* Flight Strip Lines */}
                          <polyline
                            points={wpPoints}
                            fill="none"
                            stroke="#06b6d4"
                            strokeWidth="2.5"
                            strokeLinejoin="round"
                            strokeDasharray="6 3"
                          />

                          {/* Shutter Trigger Positions */}
                          {flightPlan.waypoints
                            .filter((w) => w.isTrigger)
                            .map((w, i) => (
                              <circle
                                key={i}
                                cx={nx(w.x)}
                                cy={ny(w.y)}
                                r="3.5"
                                fill="#eab308"
                                stroke="#713f12"
                                strokeWidth="0.5"
                              />
                            ))}

                          {/* Takeoff / Home Waypoint */}
                          {flightPlan.waypoints.length > 0 && (
                            <circle
                              cx={nx(flightPlan.waypoints[0].x)}
                              cy={ny(flightPlan.waypoints[0].y)}
                              r="8"
                              fill="#ef4444"
                              stroke="white"
                              strokeWidth="2"
                            />
                          )}
                        </g>
                      )
                    })()}
                  </svg>
                )}

                {/* Overlay Legend */}
                <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 text-[11px] space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500 border border-white" />
                    <span>Home / Takeoff Point</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-[#06b6d4]" />
                    <span>Flight Path ({flightPlan?.linesCount} strips)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <span>Photo Shutter Trigger ({flightPlan?.photoCount} shots)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal: Paste Coordinates */}
        {pasteModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h3 className="text-base font-bold">Paste Parcel Boundary Coordinates</h3>
                <button onClick={() => setPasteModalOpen(false)} className="text-zinc-400 hover:text-white">
                  ✕
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Paste coordinate pairs (one per line). Format can be <code>Longitude, Latitude</code> or <code>Latitude, Longitude</code> (e.g. <code>35.2690, 0.5140</code>).
              </p>
              <textarea
                rows={6}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="35.2690, 0.5140&#10;35.2725, 0.5140&#10;35.2730, 0.5115&#10;35.2685, 0.5118"
                className="w-full rounded-xl border border-[var(--border-color)] bg-black/30 p-3 text-xs font-mono focus:outline-none focus:border-[var(--accent)]"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setPasteModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-color)] text-xs hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyPasted}
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] text-black font-bold text-xs hover:opacity-90"
                >
                  Apply Boundary
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
