'use client'

/**
 * DepthSounderPanel — Live echo sounder connection + bathymetric tracking
 *
 * Connects to single-beam echo sounders via Web Serial API.
 * Parses NMEA $SDDPT / $SDDBT / $SDMTW sentences in real-time.
 * Builds a bathymetric track with tide correction.
 *
 * Hardware: Any echo sounder with NMEA 0183 output (e.g., Airmar, Garmin,
 * Lowrance, Humminbird) connected via USB-Serial adapter.
 *
 * Workflow:
 * 1. Connect to echo sounder via Web Serial
 * 2. Simultaneously track GPS position (internal or external GNSS)
 * 3. Parse depth + temperature sentences
 * 4. Apply tide correction (manual or interpolated)
 * 5. Build bathymetric track (lat, lng, depth, time)
 * 6. Export as CSV / GeoJSON for contour generation
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Waves, Usb, WifiOff, Loader2, Download, Trash2,
  Activity, Thermometer, Ruler, MapPin, X, Settings2,
} from 'lucide-react'
import {
  parseSDDPT,
  parseSDDBT,
  parseSDMTW,
  createDepthReading,
  generateBathymetricTrack,
  applyTideCorrection,
  type DepthReading,
  type TideStation,
} from '@/lib/engine/depthSounderParser'

interface BathymetricPoint {
  latitude: number
  longitude: number
  depth: number
  reducedDepth: number | null
  temperature: number | null
  timestamp: string
}

export function DepthSounderPanel() {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readings, setReadings] = useState<BathymetricPoint[]>([])
  const [currentDepth, setCurrentDepth] = useState<number | null>(null)
  const [currentTemp, setCurrentTemp] = useState<number | null>(null)
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null)
  const [tideHeight, setTideHeight] = useState<string>('')
  const [transducerOffset, setTransducerOffset] = useState<string>('0')
  const [showSettings, setShowSettings] = useState(false)

  const serialPortRef = useRef<any>(null)
  const readerRef = useRef<any>(null)
  const readLoopRef = useRef<boolean>(false)
  const gpsWatchRef = useRef<number | null>(null)
  const bufferRef = useRef<string>('')

  const serialSupported = typeof navigator !== 'undefined' && 'serial' in navigator

  // ─── GPS tracking ──────────────────────────────────────────────
  const startGPSTracking = useCallback(() => {
    if (!('geolocation' in navigator)) return

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 },
    )
  }, [])

  const stopGPSTracking = useCallback(() => {
    if (gpsWatchRef.current != null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current)
      gpsWatchRef.current = null
    }
  }, [])

  // ─── Connect to echo sounder via Web Serial ────────────────────
  const handleConnect = useCallback(async () => {
    setConnecting(true)
    setError(null)

    try {
      if (!serialSupported) {
        throw new Error('Web Serial API not supported. Use Chrome or Edge.')
      }

      const port = await (navigator as any).serial.requestPort()
      await port.open({ baudRate: 4800 }) // NMEA standard baud rate

      serialPortRef.current = port
      readLoopRef.current = true

      // Start GPS tracking simultaneously
      startGPSTracking()

      // Read loop
      const decoder = new TextDecoder()
      const reader = port.readable.getReader()
      readerRef.current = reader

      const readLoop = async () => {
        try {
          while (readLoopRef.current) {
            const { done, value } = await reader.read()
            if (done) break

            bufferRef.current += decoder.decode(value, { stream: true })

            // Process complete NMEA sentences (terminated by \r\n)
            const lines = bufferRef.current.split('\n')
            bufferRef.current = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.startsWith('$')) continue

              // Try parsing depth sentences
              const dpt = parseSDDPT(trimmed)
              const dbt = !dpt ? parseSDDBT(trimmed) : null
              const temp = parseSDMTW(trimmed)

              if (dpt || dbt) {
                const rawDepth = dpt?.depth ?? dbt?.depthMeters ?? 0
                const offset = dpt?.offset ?? (parseFloat(transducerOffset) || 0)
                const depthToBottom = rawDepth + Math.abs(offset)

                setCurrentDepth(depthToBottom)

                // Apply tide correction if set
                const tide = parseFloat(tideHeight) || 0
                const reducedDepth = tide !== 0 ? applyTideCorrection(depthToBottom, tide) : null

                // Record point if we have GPS position
                if (currentPos) {
                  setReadings(prev => [...prev, {
                    latitude: currentPos.lat,
                    longitude: currentPos.lng,
                    depth: depthToBottom,
                    reducedDepth,
                    temperature: currentTemp,
                    timestamp: new Date().toISOString(),
                  }])
                }
              }

              if (temp != null) {
                setCurrentTemp(temp)
              }
            }
          }
        } catch (err) {
          if (readLoopRef.current) {
            setError('Serial read error: ' + (err instanceof Error ? err.message : 'unknown'))
          }
        }
      }

      readLoop()
      setConnected(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }, [serialSupported, startGPSTracking, transducerOffset, tideHeight, currentPos, currentTemp])

  // ─── Disconnect ────────────────────────────────────────────────
  const handleDisconnect = useCallback(async () => {
    readLoopRef.current = false

    if (readerRef.current) {
      try { await readerRef.current.cancel() } catch {}
      readerRef.current = null
    }

    if (serialPortRef.current) {
      try { await serialPortRef.current.close() } catch {}
      serialPortRef.current = null
    }

    stopGPSTracking()
    setConnected(false)
    setCurrentDepth(null)
    setCurrentTemp(null)
    bufferRef.current = ''
  }, [stopGPSTracking])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      readLoopRef.current = false
      stopGPSTracking()
      if (readerRef.current) {
        try { readerRef.current.cancel() } catch {}
      }
    }
  }, [stopGPSTracking])

  // ─── Export ────────────────────────────────────────────────────
  const handleExport = useCallback((format: 'csv' | 'geojson') => {
    if (readings.length === 0) return

    let content = ''
    let filename = ''

    if (format === 'csv') {
      content = 'Latitude,Longitude,Depth (m),Reduced Depth (m),Temperature (C),Timestamp\n'
      for (const r of readings) {
        content += `${r.latitude.toFixed(8)},${r.longitude.toFixed(8)},`
        content += `${r.depth.toFixed(3)},${r.reducedDepth?.toFixed(3) || ''},`
        content += `${r.temperature?.toFixed(1) || ''},${r.timestamp}\n`
      }
      filename = 'bathymetric-track.csv'
    } else {
      const features = readings.map(r => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
        properties: {
          depth: r.depth,
          reducedDepth: r.reducedDepth,
          temperature: r.temperature,
          timestamp: r.timestamp,
        },
      }))
      content = JSON.stringify({ type: 'FeatureCollection', features }, null, 2)
      filename = 'bathymetric-track.geojson'
    }

    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [readings])

  const handleClear = useCallback(() => {
    setReadings([])
  }, [])

  // Compute stats
  const depths = readings.map(r => r.reducedDepth ?? r.depth).filter(d => d > 0)
  const avgDepth = depths.length > 0 ? depths.reduce((s, d) => s + d, 0) / depths.length : 0
  const maxDepth = depths.length > 0 ? Math.max(...depths) : 0
  const minDepth = depths.length > 0 ? Math.min(...depths) : 0

  // Depth color coding
  const getDepthColor = (depth: number | null) => {
    if (depth == null) return '#6b7280'
    if (depth < 2) return '#dc2626'    // shallow — red
    if (depth < 5) return '#f97316'    // orange
    if (depth < 10) return '#eab308'   // yellow
    if (depth < 20) return '#22c55e'   // green
    if (depth < 50) return '#3b82f6'   // blue
    return '#1e3a8a'                    // deep — dark blue
  }

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              connected ? 'bg-emerald-500/10' : 'bg-[var(--bg-tertiary)]'
            }`}>
              <Waves className={`w-4 h-4 ${connected ? 'text-emerald-400' : 'text-gray-400'}`} />
            </div>
            <div>
              <span className="text-sm font-semibold text-[var(--text-primary)]">Echo Sounder</span>
              <p className="text-[10px] text-gray-500">
                {connected ? 'Connected — streaming depth data' : 'Connect via Web Serial'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {connected && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
            <span className={`text-[10px] font-medium ${
              connected ? 'text-emerald-400' : 'text-gray-500'
            }`}>
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Live depth display */}
          {connected && currentDepth != null && (
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]/50 text-center">
                <div className="text-2xl font-bold font-mono" style={{ color: getDepthColor(currentDepth) }}>
                  {currentDepth.toFixed(2)}
                </div>
                <div className="text-[9px] text-gray-500 uppercase">Depth (m)</div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]/50 text-center">
                <div className="text-2xl font-bold font-mono text-blue-400">
                  {currentTemp != null ? currentTemp.toFixed(1) : '—'}
                </div>
                <div className="text-[9px] text-gray-500 uppercase">Temp (°C)</div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]/50 text-center">
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  {currentPos ? 'FIX' : '—'}
                </div>
                <div className="text-[9px] text-gray-500 uppercase">GPS</div>
              </div>
            </div>
          )}

          {/* GPS position */}
          {connected && currentPos && (
            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
              <MapPin className="w-3 h-3 text-emerald-400" />
              {currentPos.lat.toFixed(6)}, {currentPos.lng.toFixed(6)}
            </div>
          )}

          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300"
          >
            <Settings2 className="w-3 h-3" />
            Tide & Transducer Settings
          </button>

          {showSettings && (
            <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-[var(--bg-tertiary)]/50">
              <div>
                <label className="block text-[8px] text-gray-500 uppercase mb-0.5">Tide Height (m)</label>
                <input
                  type="number"
                  step="0.01"
                  value={tideHeight}
                  onChange={e => setTideHeight(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-7 px-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[8px] text-gray-500 uppercase mb-0.5">Transducer Offset (m)</label>
                <input
                  type="number"
                  step="0.01"
                  value={transducerOffset}
                  onChange={e => setTransducerOffset(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-7 px-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-xs text-white font-mono"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
              <span className="text-xs text-red-400">{error}</span>
            </div>
          )}

          {/* Connect/Disconnect */}
          {!connected ? (
            <button
              onClick={handleConnect}
              disabled={connecting || !serialSupported}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-[var(--accent)] text-black text-sm font-semibold hover:bg-[var(--accent-dim)] disabled:opacity-40"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Usb className="w-4 h-4" />}
              {connecting ? 'Connecting...' : 'Connect Echo Sounder'}
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/30"
            >
              <WifiOff className="w-4 h-4" />
              Disconnect
            </button>
          )}

          {!serialSupported && (
            <p className="text-[9px] text-amber-400 text-center">
              Web Serial API not available — use Chrome or Edge on desktop/Android
            </p>
          )}
        </div>
      </div>

      {/* Bathymetric track stats */}
      {readings.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]/50 text-center">
            <div className="text-sm font-bold text-[var(--text-primary)]">{readings.length}</div>
            <div className="text-[9px] text-gray-500 uppercase">Points</div>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]/50 text-center">
            <div className="text-sm font-bold text-blue-400">{avgDepth.toFixed(2)}</div>
            <div className="text-[9px] text-gray-500 uppercase">Avg (m)</div>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]/50 text-center">
            <div className="text-sm font-bold text-emerald-400">{minDepth.toFixed(2)}</div>
            <div className="text-[9px] text-gray-500 uppercase">Min (m)</div>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bg-tertiary)]/50 text-center">
            <div className="text-sm font-bold text-red-400">{maxDepth.toFixed(2)}</div>
            <div className="text-[9px] text-gray-500 uppercase">Max (m)</div>
          </div>
        </div>
      )}

      {/* Depth visualization (color-coded track) */}
      {readings.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[var(--text-primary)]">Depth Track</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleExport('csv')}
                className="flex items-center gap-1 px-2 h-7 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[10px] text-gray-400 hover:text-gray-200"
              >
                <Download className="w-3 h-3" /> CSV
              </button>
              <button
                onClick={() => handleExport('geojson')}
                className="flex items-center gap-1 px-2 h-7 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[10px] text-gray-400 hover:text-gray-200"
              >
                <Download className="w-3 h-3" /> GeoJSON
              </button>
              <button
                onClick={handleClear}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Color-coded depth strip */}
          <div className="flex h-8 rounded-lg overflow-hidden">
            {readings.slice(-100).map((r, i) => (
              <div
                key={i}
                className="flex-1 min-w-[2px]"
                style={{ backgroundColor: getDepthColor(r.reducedDepth ?? r.depth) }}
                title={`Depth: ${(r.reducedDepth ?? r.depth).toFixed(2)}m at ${new Date(r.timestamp).toLocaleTimeString()}`}
              />
            ))}
          </div>

          {/* Color legend */}
          <div className="flex items-center justify-between mt-2 text-[8px] text-gray-500">
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 bg-red-600 rounded-sm" /> {'<2m'}</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 bg-orange-500 rounded-sm" /> 2-5m</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 bg-yellow-500 rounded-sm" /> 5-10m</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 bg-green-500 rounded-sm" /> 10-20m</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 bg-blue-500 rounded-sm" /> 20-50m</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 bg-blue-900 rounded-sm" /> {'>50m'}</span>
          </div>

          {/* Recent readings */}
          <div className="mt-3 max-h-[150px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[var(--bg-card)]">
                <tr className="border-b border-[var(--border-color)]">
                  <th className="px-1 py-1 text-left text-[8px] text-gray-500 uppercase">Time</th>
                  <th className="px-1 py-1 text-right text-[8px] text-gray-500 uppercase">Depth</th>
                  <th className="px-1 py-1 text-right text-[8px] text-gray-500 uppercase">Reduced</th>
                  <th className="px-1 py-1 text-right text-[8px] text-gray-500 uppercase">Temp</th>
                </tr>
              </thead>
              <tbody>
                {readings.slice(-20).reverse().map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)]/30">
                    <td className="px-1 py-1 text-[9px] text-gray-500 font-mono">
                      {new Date(r.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-1 py-1 text-[9px] text-right font-mono text-gray-300">
                      {r.depth.toFixed(2)}
                    </td>
                    <td className="px-1 py-1 text-[9px] text-right font-mono" style={{ color: getDepthColor(r.reducedDepth ?? r.depth) }}>
                      {r.reducedDepth?.toFixed(2) ?? '—'}
                    </td>
                    <td className="px-1 py-1 text-[9px] text-right font-mono text-blue-400">
                      {r.temperature?.toFixed(1) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
        <Waves className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-blue-400/70 leading-relaxed">
          Connects to any NMEA 0183 echo sounder (Airmar, Garmin, Lowrance) via USB-Serial.
          Parses $SDDPT (depth below transducer), $SDDBT (depth in units), $SDMTW (water temperature).
          GPS position tracked simultaneously for georeferenced bathymetric points.
          Tide correction applied for chart-datum depths.
        </p>
      </div>
    </div>
  )
}
