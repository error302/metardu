'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Point, GeofenceZone, HazardZone, GeofenceStatus, evaluateZoneStatus, playGeofenceAlert } from '@/lib/survey/geofenceEngine';
import { ShieldAlert, ShieldCheck, AlertTriangle, MapPin, Volume2, VolumeX, Vibrate, Download, Plus, Trash2, Upload, Navigation, Clock } from 'lucide-react';

interface IncidentEvent {
  id: string
  timestamp: string
  status: GeofenceStatus
  easting: number
  northing: number
  distanceToBoundary: number
  message: string
}

const DEFAULT_BOUNDARY: Point[] = [
  { easting: 250000, northing: 9945000 },
  { easting: 250150, northing: 9945000 },
  { easting: 250150, northing: 9945120 },
  { easting: 250000, northing: 9945120 },
]

const DEFAULT_HAZARDS: HazardZone[] = [
  {
    center: { easting: 250110, northing: 9945060 },
    radius: 20,
    type: 'Riparian / River Bank Reserve',
  },
]

export default function GeofenceMonitor() {
  // Boundary Vertices & Hazards
  const [boundaryPoints, setBoundaryPoints] = useState<Point[]>(DEFAULT_BOUNDARY)
  const [hazardPoints, setHazardPoints] = useState<HazardZone[]>(DEFAULT_HAZARDS)
  const [bufferDistance, setBufferDistance] = useState<number>(10)

  // Rover Position
  const [position, setPosition] = useState<Point>({
    easting: 250060,
    northing: 9945060,
  })


  // Alert Settings
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [hapticEnabled, setHapticEnabled] = useState(true)

  // Paste coordinates modal
  const [pasteModalOpen, setPasteModalOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  // Incident Log
  const [incidentLog, setIncidentLog] = useState<IncidentEvent[]>([])
  const lastAlertRef = useRef<number>(0)
  const lastLoggedStatusRef = useRef<string>('UNKNOWN')

  // Status Evaluation
  const statusInfo = useMemo(() => {
    if (boundaryPoints.length < 3) {
      return { status: 'UNKNOWN' as GeofenceStatus, distanceToBoundary: 0 }
    }
    const zone: GeofenceZone = { boundary: boundaryPoints, bufferDistance }
    return evaluateZoneStatus(position, zone, hazardPoints)
  }, [position, boundaryPoints, bufferDistance, hazardPoints])

  // Trigger alerts and log incidents
  useEffect(() => {
    if (!position || boundaryPoints.length < 3) return

    const now = Date.now()
    const currentStatus = statusInfo.status

    // Trigger audio / vibration throttle (once every 2.5s)
    if (now - lastAlertRef.current > 2500) {
      if (currentStatus === 'BOUNDARY_WARNING' || currentStatus === 'HAZARD_PROXIMITY') {
        if (audioEnabled) playGeofenceAlert('warning')
        if (hapticEnabled && 'vibrate' in navigator) navigator.vibrate(200)
        lastAlertRef.current = now
      } else if (currentStatus === 'OUTSIDE_BREACH') {
        if (audioEnabled) playGeofenceAlert('breach')
        if (hapticEnabled && 'vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 300])
        lastAlertRef.current = now
      }
    }

    // Record incident transition
    if (currentStatus !== lastLoggedStatusRef.current && currentStatus !== 'UNKNOWN') {
      lastLoggedStatusRef.current = currentStatus
      if (currentStatus !== 'INSIDE_SAFE') {
        const msg =
          currentStatus === 'OUTSIDE_BREACH'
            ? `Breach: Rover outside boundary by ${statusInfo.distanceToBoundary.toFixed(1)}m`
            : currentStatus === 'HAZARD_PROXIMITY'
            ? `Hazard Warning: Within ${statusInfo.nearestHazardDistance?.toFixed(1)}m of restricted zone`
            : `Proximity Alert: Approaching boundary (${statusInfo.distanceToBoundary.toFixed(1)}m buffer)`

        setIncidentLog((prev) => [
          {
            id: String(Date.now()),
            timestamp: new Date().toLocaleTimeString(),
            status: currentStatus,
            easting: position.easting,
            northing: position.northing,
            distanceToBoundary: statusInfo.distanceToBoundary,
            message: msg,
          },
          ...prev.slice(0, 29), // Keep latest 30
        ])
      }
    }
  }, [position, statusInfo, boundaryPoints, audioEnabled, hapticEnabled])

  // SVG Radar Viewbox Math
  const { viewBox, pointsStr, minX, maxX, minY, maxY } = useMemo(() => {
    if (boundaryPoints.length === 0) {
      return { viewBox: '0 0 100 100', pointsStr: '', minX: 0, maxX: 100, minY: 0, maxY: 100 }
    }

    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity
    boundaryPoints.forEach((p) => {
      bMinX = Math.min(bMinX, p.easting)
      bMinY = Math.min(bMinY, p.northing)
      bMaxX = Math.max(bMaxX, p.easting)
      bMaxY = Math.max(bMaxY, p.northing)
    })

    if (position) {
      bMinX = Math.min(bMinX, position.easting)
      bMinY = Math.min(bMinY, position.northing)
      bMaxX = Math.max(bMaxX, position.easting)
      bMaxY = Math.max(bMaxY, position.northing)
    }

    const pad = Math.max(bMaxX - bMinX, bMaxY - bMinY) * 0.25 || 40
    const vMinX = bMinX - pad
    const vMinY = bMinY - pad
    const vMaxX = bMaxX + pad
    const vMaxY = bMaxY + pad

    const width = vMaxX - vMinX
    const height = vMaxY - vMinY

    // Invert Y for cartographic North up
    const vBox = `${vMinX} ${-vMaxY} ${width} ${height}`
    const pts = boundaryPoints.map((p) => `${p.easting},${-p.northing}`).join(' ')

    return { viewBox: vBox, pointsStr: pts, minX: vMinX, maxX: vMaxX, minY: vMinY, maxY: vMaxY }
  }, [boundaryPoints, position])

  // Handle map click to place rover
  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const width = maxX - minX
    const height = maxY - minY

    const easting = minX + (clickX / rect.width) * width
    const northing = maxY - (clickY / rect.height) * height // Invert Y back to Northing

    setPosition({
      easting: Math.round(easting * 100) / 100,
      northing: Math.round(northing * 100) / 100,
    })
  }

  // Parse pasted coordinates
  const handleApplyPasted = () => {
    try {
      const lines = pasteText.trim().split('\n')
      const pts: Point[] = []
      for (const line of lines) {
        const parts = line.split(/[,\s\t]+/).filter(Boolean)
        if (parts.length >= 2) {
          const e = parseFloat(parts[0])
          const n = parseFloat(parts[1])
          if (!isNaN(e) && !isNaN(n)) {
            pts.push({ easting: e, northing: n })
          }
        }
      }
      if (pts.length >= 3) {
        setBoundaryPoints(pts)
        setPosition({
          easting: (pts[0].easting + pts[1].easting) / 2,
          northing: (pts[0].northing + pts[1].northing) / 2,
        })
        setPasteModalOpen(false)
        setPasteText('')
      } else {
        alert('Please enter at least 3 valid coordinates.')
      }
    } catch {
      alert('Error parsing coordinates. Format: Easting, Northing')
    }
  }

  // Export Incident Log
  const handleDownloadLog = () => {
    if (incidentLog.length === 0) {
      alert('No incidents recorded yet.')
      return
    }
    const csv =
      'Timestamp,Status,Easting,Northing,Distance_m,Details\n' +
      incidentLog
        .map(
          (ev) =>
            `"${ev.timestamp}","${ev.status}",${ev.easting},${ev.northing},${ev.distanceToBoundary.toFixed(
              2
            )},"${ev.message}"`
        )
        .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Geofence_Incidents_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getStatusColor = () => {
    switch (statusInfo.status) {
      case 'INSIDE_SAFE':
        return {
          bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
          title: 'INSIDE PERIMETER (SAFE)',
          icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
        }
      case 'BOUNDARY_WARNING':
        return {
          bg: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
          title: `APPROACHING BOUNDARY (${statusInfo.distanceToBoundary.toFixed(1)}m buffer)`,
          icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
        }
      case 'OUTSIDE_BREACH':
        return {
          bg: 'bg-red-500/15 border-red-500/30 text-red-400 animate-pulse',
          title: `PERIMETER BREACH! OUTSIDE SITE (${statusInfo.distanceToBoundary.toFixed(1)}m)`,
          icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
        }
      case 'HAZARD_PROXIMITY':
        return {
          bg: 'bg-orange-500/15 border-orange-500/30 text-orange-400 animate-pulse',
          title: `RESTRICTED HAZARD ZONE! (${statusInfo.nearestHazardDistance?.toFixed(1)}m away)`,
          icon: <AlertTriangle className="w-5 h-5 text-orange-400" />,
        }
      default:
        return {
          bg: 'bg-zinc-500/15 border-zinc-500/30 text-zinc-400',
          title: 'AWAITING COORDINATES',
          icon: <MapPin className="w-5 h-5" />,
        }
    }
  }

  const statusConfig = getStatusColor()

  return (
    <div className="space-y-6">
      {/* HUD Alert Banner */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-300 shadow-md ${statusConfig.bg}`}
      >
        <div className="flex items-center gap-3">
          {statusConfig.icon}
          <div>
            <div className="text-base sm:text-lg font-black tracking-wide">{statusConfig.title}</div>
            <div className="text-xs opacity-80 mt-0.5">
              Rover Coordinates: E {position.easting.toFixed(2)} m, N {position.northing.toFixed(2)} m
            </div>
          </div>
        </div>

        {/* Mute & Haptic Quick Toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              audioEnabled
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-[var(--border-color)] bg-white/5 text-zinc-400'
            }`}
            title="Toggle Audio Alarms"
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{audioEnabled ? 'Audio ON' : 'Muted'}</span>
          </button>

          <button
            onClick={() => setHapticEnabled(!hapticEnabled)}
            className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              hapticEnabled
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                : 'border-[var(--border-color)] bg-white/5 text-zinc-400'
            }`}
            title="Toggle Device Haptics"
          >
            <Vibrate className="w-4 h-4" />
            <span>{hapticEnabled ? 'Haptic ON' : 'Haptic OFF'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Radar Map on Left (7 cols), Boundary & Hazard controls on Right (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Radar Map */}
        <div className="lg:col-span-7 border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Navigation className="w-4 h-4 text-[var(--accent)]" />
                Live Geofence Radar Screen (North Up)
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Click anywhere on the map to test rover position. Green = boundary, Red circles = hazards.
              </p>
            </div>
            <div className="text-xs font-mono text-[var(--text-secondary)]">
              Buffer: <strong className="text-[var(--text-primary)]">{bufferDistance}m</strong>
            </div>
          </div>

          {/* SVG Map Container */}
          <div className="relative w-full h-[460px] bg-black/40 border border-[var(--border-color)] rounded-xl overflow-hidden flex items-center justify-center">
            <svg
              viewBox={viewBox}
              onClick={handleMapClick}
              className="w-full h-full cursor-crosshair select-none"
            >
              {/* Perimeter Boundary Polygon */}
              <polygon
                points={pointsStr}
                fill="rgba(34, 197, 94, 0.12)"
                stroke="#22c55e"
                strokeWidth={(maxX - minX) / 120}
              />

              {/* Boundary Vertices */}
              {boundaryPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.easting}
                  cy={-p.northing}
                  r={(maxX - minX) / 90}
                  fill="#22c55e"
                  stroke="white"
                  strokeWidth="1.5"
                />
              ))}

              {/* Hazard Zones */}
              {hazardPoints.map((h, i) => (
                <g key={i}>
                  <circle
                    cx={h.center.easting}
                    cy={-h.center.northing}
                    r={h.radius}
                    fill="rgba(239, 68, 68, 0.25)"
                    stroke="#ef4444"
                    strokeWidth={(maxX - minX) / 150}
                    strokeDasharray="4 2"
                  />
                  <circle
                    cx={h.center.easting}
                    cy={-h.center.northing}
                    r={(maxX - minX) / 110}
                    fill="#ef4444"
                  />
                </g>
              ))}

              {/* Rover Indicator */}
              {position && (
                <g>
                  {/* Outer pulse */}
                  <circle
                    cx={position.easting}
                    cy={-position.northing}
                    r={(maxX - minX) / 35}
                    fill="none"
                    stroke={
                      statusInfo.status === 'INSIDE_SAFE'
                        ? '#3b82f6'
                        : statusInfo.status === 'OUTSIDE_BREACH'
                        ? '#ef4444'
                        : '#f59e0b'
                    }
                    strokeWidth="2"
                    opacity="0.6"
                    className="animate-ping"
                  />
                  {/* Rover center pin */}
                  <circle
                    cx={position.easting}
                    cy={-position.northing}
                    r={(maxX - minX) / 60}
                    fill={
                      statusInfo.status === 'INSIDE_SAFE'
                        ? '#3b82f6'
                        : statusInfo.status === 'OUTSIDE_BREACH'
                        ? '#ef4444'
                        : '#f59e0b'
                    }
                    stroke="white"
                    strokeWidth="2"
                  />
                </g>
              )}
            </svg>

            {/* Live coordinates tag */}
            <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs font-mono text-[var(--text-secondary)]">
              E: <strong className="text-[var(--text-primary)]">{position.easting.toFixed(2)}</strong> N:{' '}
              <strong className="text-[var(--text-primary)]">{position.northing.toFixed(2)}</strong>
            </div>

            {/* Legend */}
            <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 text-[11px] space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span>Field Rover Position</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Survey Boundary Perimeter</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span>Restricted Hazard Buffers</span>
              </div>
            </div>
          </div>

          {/* Manual Coordinate Stepper */}
          <div className="p-3 rounded-xl bg-black/20 border border-[var(--border-color)] grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
            <div>
              <label className="text-[10px] text-[var(--text-secondary)] block">Manual Easting (m)</label>
              <input aria-label="Manual easting in metres"
                type="number"
                value={position.easting}
                onChange={(e) => setPosition({ ...position, easting: parseFloat(e.target.value) || 0 })}
                className="w-full bg-transparent border-b border-[var(--border-color)] font-mono text-xs focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-secondary)] block">Manual Northing (m)</label>
              <input aria-label="Manual northing in metres"
                type="number"
                value={position.northing}
                onChange={(e) => setPosition({ ...position, northing: parseFloat(e.target.value) || 0 })}
                className="w-full bg-transparent border-b border-[var(--border-color)] font-mono text-xs focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-[var(--text-secondary)]">
                <span>Buffer Radius</span>
                <span className="font-bold text-[var(--accent)]">{bufferDistance}m</span>
              </div>
              <input aria-label="Boundary buffer radius in metres"
                type="range"
                min="2"
                max="40"
                step="1"
                value={bufferDistance}
                onChange={(e) => setBufferDistance(parseInt(e.target.value, 10))}
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Boundary & Hazard Zones Management (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Boundary Editor */}
          <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--accent)]" />
                Boundary Vertices ({boundaryPoints.length})
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setPasteModalOpen(true)}
                  className="py-1 px-2 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-[11px] font-medium transition-colors flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" /> Paste
                </button>
                <button
                  onClick={() => {
                    const last = boundaryPoints[boundaryPoints.length - 1]
                    setBoundaryPoints([...boundaryPoints, { easting: last.easting + 50, northing: last.northing + 50 }])
                  }}
                  className="py-1 px-2 rounded-lg bg-[var(--accent)] text-black text-[11px] font-bold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {boundaryPoints.map((pt, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-1.5 rounded-lg border border-[var(--border-color)] bg-black/20 text-xs"
                >
                  <span className="w-6 font-mono text-[var(--text-secondary)] text-[10px]">#{idx + 1}</span>
                  <div className="flex-1 flex gap-1 items-center">
                    <span className="text-[10px] text-[var(--text-secondary)]">E:</span>
                    <input aria-label={`Boundary vertex ${idx + 1} easting in metres`}
                      type="number"
                      value={pt.easting}
                      onChange={(e) => {
                        const next = [...boundaryPoints]
                        next[idx] = { ...next[idx], easting: parseFloat(e.target.value) || 0 }
                        setBoundaryPoints(next)
                      }}
                      className="w-full bg-transparent font-mono text-xs focus:outline-none"
                    />
                  </div>
                  <div className="flex-1 flex gap-1 items-center">
                    <span className="text-[10px] text-[var(--text-secondary)]">N:</span>
                    <input aria-label={`Boundary vertex ${idx + 1} northing in metres`}
                      type="number"
                      value={pt.northing}
                      onChange={(e) => {
                        const next = [...boundaryPoints]
                        next[idx] = { ...next[idx], northing: parseFloat(e.target.value) || 0 }
                        setBoundaryPoints(next)
                      }}
                      className="w-full bg-transparent font-mono text-xs focus:outline-none"
                    />
                  </div>
                  <button aria-label={`Remove boundary vertex ${idx + 1}`}
                    onClick={() => {
                      if (boundaryPoints.length <= 3) {
                        alert('Polygon requires at least 3 vertices.')
                        return
                      }
                      setBoundaryPoints(boundaryPoints.filter((_, i) => i !== idx))
                    }}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Hazard Zones Editor */}
          <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Restricted Hazard Buffers ({hazardPoints.length})
              </h3>
              <button
                onClick={() => {
                  setHazardPoints([
                    ...hazardPoints,
                    {
                      center: { easting: position.easting, northing: position.northing },
                      radius: 15,
                      type: 'Restricted Buffer Zone',
                    },
                  ])
                }}
                className="py-1 px-2 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-[11px] font-medium transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Hazard Zone
              </button>
            </div>

            <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
              {hazardPoints.map((hz, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg border border-[var(--border-color)] bg-black/20 space-y-1.5 text-xs"
                >
                  <div className="flex justify-between items-center">
                    <input aria-label={`Hazard ${idx + 1} description`}
                      type="text"
                      value={hz.type}
                      onChange={(e) => {
                        const next = [...hazardPoints]
                        next[idx] = { ...next[idx], type: e.target.value }
                        setHazardPoints(next)
                      }}
                      className="bg-transparent font-semibold text-xs focus:outline-none text-[var(--text-primary)]"
                    />
                    <button aria-label={`Remove hazard ${idx + 1}`}
                      onClick={() => setHazardPoints(hazardPoints.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-300 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <span className="text-[var(--text-secondary)]">Center E: </span>
                      <input aria-label={`Hazard ${idx + 1} centre easting in metres`}
                        type="number"
                        value={hz.center.easting}
                        onChange={(e) => {
                          const next = [...hazardPoints]
                          next[idx].center.easting = parseFloat(e.target.value) || 0
                          setHazardPoints(next)
                        }}
                        className="w-full bg-transparent font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">Center N: </span>
                      <input aria-label={`Hazard ${idx + 1} centre northing in metres`}
                        type="number"
                        value={hz.center.northing}
                        onChange={(e) => {
                          const next = [...hazardPoints]
                          next[idx].center.northing = parseFloat(e.target.value) || 0
                          setHazardPoints(next)
                        }}
                        className="w-full bg-transparent font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">Radius: </span>
                      <input aria-label={`Hazard ${idx + 1} radius in metres`}
                        type="number"
                        value={hz.radius}
                        onChange={(e) => {
                          const next = [...hazardPoints]
                          next[idx].radius = parseFloat(e.target.value) || 5
                          setHazardPoints(next)
                        }}
                        className="w-full bg-transparent font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Real-Time Incident Audit Log */}
          <div className="border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-2xl p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--accent)]" />
                Live Incident Audit Log ({incidentLog.length})
              </h3>
              <button
                onClick={handleDownloadLog}
                disabled={incidentLog.length === 0}
                className="py-1 px-2.5 rounded-lg border border-[var(--border-color)] bg-white/5 hover:bg-white/10 text-[11px] font-medium transition-colors flex items-center gap-1 disabled:opacity-40"
              >
                <Download className="w-3 h-3 text-[var(--accent)]" /> Export Log
              </button>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {incidentLog.length === 0 ? (
                <div className="text-xs text-[var(--text-secondary)] italic py-3 text-center">
                  No breach or hazard incidents detected. System monitoring normal.
                </div>
              ) : (
                incidentLog.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-2 rounded-lg border border-[var(--border-color)] bg-black/20 text-[11px] flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">{ev.message}</div>
                      <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                        {ev.timestamp} • E:{ev.easting.toFixed(1)} N:{ev.northing.toFixed(1)}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ev.status === 'OUTSIDE_BREACH'
                          ? 'bg-red-500/20 text-red-400'
                          : ev.status === 'HAZARD_PROXIMITY'
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {ev.status.replace('_', ' ')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Paste Boundary Coordinates Modal */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-base font-bold">Paste Boundary Coordinates (Easting, Northing)</h3>
              <button aria-label="Close coordinate import" onClick={() => setPasteModalOpen(false)} className="text-zinc-400 hover:text-white">
                ✕
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Paste coordinate pairs in UTM meters, one per line (e.g., <code>250000, 9945000</code>).
            </p>
            <textarea aria-label="Boundary coordinates to import"
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="250000, 9945000&#10;250150, 9945000&#10;250150, 9945120&#10;250000, 9945120"
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
  )
}
