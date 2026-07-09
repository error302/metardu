'use client'

/**
 * StakeoutRadar — Hot/Cold directional guidance for beacon recovery
 *
 * Features:
 * - Radar-style circular display
 * - Directional arrow pointing to target
 * - Distance countdown (large, color-coded)
 * - Color shifts: Red (far) → Amber (close) → Green (on target)
 * - Bearing display in DMS
 * - Vibration feedback when within 1m (mobile)
 * - Audio beep that speeds up as you approach
 *
 * Uses:
 * - Live GPS position from navigator.geolocation
 * - Inverse coordinate computation (bearing + distance)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Target, Navigation, Crosshair, Volume2, VolumeX, X } from 'lucide-react'

interface StakeoutRadarProps {
  targetE: number  // Target easting (UTM)
  targetN: number  // Target northing (UTM)
  onClose?: () => void
  /** T1.5 FIX (2026-07-09): UTM EPSG for GPS→UTM transform (default 'EPSG:21037') */
  epsg?: string
}

interface Position {
  lat: number
  lng: number
  accuracy: number
  easting: number
  northing: number
}

export function StakeoutRadar({ targetE, targetN, onClose, epsg = 'EPSG:21037' }: StakeoutRadarProps) {
  const [position, setPosition] = useState<Position | null>(null)
  const [distance, setDistance] = useState<number | null>(null)
  const [bearing, setBearing] = useState<number | null>(null)
  const [soundOn, setSoundOn] = useState(true)
  const [watching, setWatching] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const lastBeepRef = useRef<number>(0)

  // Transform WGS84 to UTM
  const transformToUTM = useCallback(async (lat: number, lng: number): Promise<{ easting: number; northing: number }> => {
    try {
      const { transform } = await import('ol/proj')
      const [e, n] = transform([lng, lat], 'EPSG:4326', epsg) as [number, number]
      return { easting: e, northing: n }
    } catch {
      return { easting: 0, northing: 0 }
    }
  }, [epsg])

  // Start watching position
  const startWatch = useCallback(() => {
    if (watching) return
    setWatching(true)

    if (!('geolocation' in navigator)) {
      setWatching(false)
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { easting, northing } = await transformToUTM(pos.coords.latitude, pos.coords.longitude)
        const newPos: Position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          easting,
          northing,
        }
        setPosition(newPos)

        // Compute distance and bearing
        const dE = targetE - easting
        const dN = targetN - northing
        const dist = Math.sqrt(dE * dE + dN * dN)
        let brg = Math.atan2(dE, dN) * 180 / Math.PI
        if (brg < 0) brg += 360

        setDistance(dist)
        setBearing(brg)

        // Beep feedback
        if (soundOn && dist < 10) {
          const now = Date.now()
          const interval = dist < 0.5 ? 200 : dist < 2 ? 500 : 1000
          if (now - lastBeepRef.current > interval) {
            lastBeepRef.current = now
            playBeep(dist < 0.5 ? 880 : dist < 2 ? 660 : 440)
          }
        }

        // Vibration
        if (dist < 1 && 'vibrate' in navigator) {
          navigator.vibrate(100)
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 }
    )
  }, [watching, targetE, targetN, transformToUTM, soundOn])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setWatching(false)
  }, [])

  useEffect(() => {
    startWatch()
    return () => stopWatch()
  }, [startWatch, stopWatch])

  // Audio beep
  const playBeep = useCallback((frequency: number) => {
    if (!soundOn) return
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.frequency.value = frequency
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.15)
    } catch {}
  }, [soundOn])

  // Determine color based on distance
  const getColor = (dist: number | null) => {
    if (dist == null) return { ring: '#6b7280', text: 'text-gray-400', bg: 'bg-gray-500/10' }
    if (dist < 0.1) return { ring: '#10b981', text: 'text-emerald-400', bg: 'bg-emerald-500/10' }
    if (dist < 0.5) return { ring: '#10b981', text: 'text-emerald-400', bg: 'bg-emerald-500/10' }
    if (dist < 2) return { ring: '#84cc16', text: 'text-lime-400', bg: 'bg-lime-500/10' }
    if (dist < 5) return { ring: '#eab308', text: 'text-amber-400', bg: 'bg-amber-500/10' }
    if (dist < 15) return { ring: '#f97316', text: 'text-orange-400', bg: 'bg-orange-500/10' }
    return { ring: '#ef4444', text: 'text-red-400', bg: 'bg-red-500/10' }
  }

  const colors = getColor(distance)
  const isOnTarget = distance != null && distance < 0.5

  // Format bearing as DMS
  const formatBearing = (brg: number) => {
    const deg = Math.floor(brg)
    const minFull = (brg - deg) * 60
    const min = Math.floor(minFull)
    const sec = (minFull - min) * 60
    return `${deg}°${min}'${sec.toFixed(0)}"`
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0a0a0f] flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-[#D17B47]" />
          <span className="text-sm font-semibold text-white">Stakeout Radar</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundOn(!soundOn)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.06] text-gray-400 hover:text-white"
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.06] text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Radar display */}
      <div className="relative w-72 h-72 mb-8">
        {/* Outer ring */}
        <div
          className="absolute inset-0 rounded-full border-2 transition-colors duration-300"
          style={{ borderColor: colors.ring, opacity: 0.3 }}
        />
        {/* Middle ring */}
        <div
          className="absolute inset-8 rounded-full border transition-colors duration-300"
          style={{ borderColor: colors.ring, opacity: 0.2 }}
        />
        {/* Inner ring */}
        <div
          className="absolute inset-16 rounded-full border transition-colors duration-300"
          style={{ borderColor: colors.ring, opacity: 0.4 }}
        />

        {/* Crosshair lines */}
        <div className="absolute top-1/2 left-0 right-0 h-px" style={{ backgroundColor: colors.ring, opacity: 0.2 }} />
        <div className="absolute left-1/2 top-0 bottom-0 w-px" style={{ backgroundColor: colors.ring, opacity: 0.2 }} />

        {/* Center target */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className={`w-4 h-4 rounded-full ${isOnTarget ? 'animate-ping' : ''}`}
            style={{ backgroundColor: colors.ring }}
          />
        </div>

        {/* Directional arrow */}
        {bearing != null && (
          <div
            className="absolute top-1/2 left-1/2 origin-bottom"
            style={{
              transform: `translate(-50%, -100%) rotate(${bearing}deg)`,
              height: '50%',
            }}
          >
            <div className="flex flex-col items-center">
              <Navigation
                className="w-8 h-8 transition-colors duration-300"
                style={{ color: colors.ring }}
                fill="currentColor"
              />
            </div>
          </div>
        )}

        {/* Compass labels */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-gray-500">N</div>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-gray-500">S</div>
        <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-500">W</div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-500">E</div>
      </div>

      {/* Distance display */}
      <div className="text-center mb-6">
        <div className={`text-6xl font-bold font-mono ${colors.text} transition-colors duration-300`}>
          {distance != null ? distance.toFixed(2) : '—'}
        </div>
        <div className="text-xs text-gray-500 mt-1">meters to target</div>
      </div>

      {/* Bearing */}
      {bearing != null && (
        <div className="flex items-center gap-2 mb-4">
          <Crosshair className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-mono text-gray-400">Bearing: {formatBearing(bearing)}</span>
        </div>
      )}

      {/* Status message */}
      <div className={`px-4 py-2 rounded-lg ${colors.bg} border ${colors.text} border-current/20`}>
        <p className="text-sm font-medium text-center">
          {isOnTarget ? 'ON TARGET — Dig here!' :
           distance == null ? 'Waiting for GPS...' :
           distance < 2 ? 'Almost there — slow down' :
           distance < 5 ? 'Getting close' :
           distance < 15 ? 'Approaching target' :
           'Walk toward the arrow'}
        </p>
      </div>

      {/* Target coordinates */}
      <div className="mt-6 text-center">
        <p className="text-[10px] text-gray-600">Target coordinates:</p>
        <p className="text-xs font-mono text-gray-400">
          E: {targetE.toFixed(3)} | N: {targetN.toFixed(3)}
        </p>
        {position && (
          <p className="text-[10px] font-mono text-gray-600 mt-1">
            Your position: E: {position.easting.toFixed(3)} | N: {position.northing.toFixed(3)}
            <br />
            GPS accuracy: ±{position.accuracy.toFixed(1)}m
          </p>
        )}
      </div>
    </div>
  )
}
