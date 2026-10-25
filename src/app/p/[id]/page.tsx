'use client'
import { useParams } from 'next/navigation'
import { z } from 'zod'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Compass,
  Navigation2,
  MapPin,
  ShieldCheck,
  Phone,
  Share2,
  ExternalLink,
  AlertTriangle,
  Layers,
  Info,
  CheckCircle2,
  Target,
  Volume2,
  VolumeX,
  Scale,
  Construction,
  MessagesSquare,
} from 'lucide-react'

const finiteNumber = z.number().finite()
const parcelDataSchema = z.object({
  id: z.string(), name: z.string(), lrNumber: z.string(), clientName: z.string(),
  locality: z.string(), county: z.string(), surveyType: z.string(),
  surveyorName: z.string(), surveyorLicense: z.string(), surveyorFirm: z.string(),
  surveyorPhone: z.string(), datum: z.string(),
  areaHa: finiteNumber, areaAcres: finiteNumber, beaconsCount: z.number().int().nonnegative(),
  beacons: z.array(z.object({
    id: z.string(), name: z.string(), easting: finiteNumber, northing: finiteNumber,
    lat: finiteNumber.min(-90).max(90), lng: finiteNumber.min(-180).max(180),
    monument: z.string(), markStatus: z.string(),
  })),
  boundaryPoints: z.array(z.tuple([finiteNumber, finiteNumber])),
  center: z.object({ lat: finiteNumber, lng: finiteNumber }),
  bounds: z.object({ minLat: finiteNumber, maxLat: finiteNumber, minLng: finiteNumber, maxLng: finiteNumber }),
  certifiedDate: z.string(),
})
type ParcelData = z.infer<typeof parcelDataSchema>

// Great-circle distance between two GPS lat/lng points in meters
function computeHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Initial bearing from point 1 to point 2 in degrees (0-360, clockwise from North)
function computeInitialBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = Math.atan2(y, x)
  const brg = (θ * 180) / Math.PI
  return (brg + 360) % 360
}

export default function ClientParcelPortal() {
  const params = useParams<{ id: string }>()
  const [parcel, setParcel] = useState<ParcelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selected Beacon for "Walk to Beacon"
  const [selectedBeaconId, setSelectedBeaconId] = useState<string | null>(null)

  // Live GPS tracking
  const [userPos, setUserPos] = useState<{
    lat: number
    lng: number
    accuracy: number
  } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [audioMuted, setAudioMuted] = useState(false)
  const [activeView, setActiveView] = useState<'compass' | 'map' | 'guide'>('compass')
  const [shareSuccess, setShareSuccess] = useState(false)

  // Web Audio Context for proximity chimes
  const audioCtxRef = useRef<AudioContext | null>(null)
  const hasChimedArrivalRef = useRef(false)

  // Fetch Parcel Data
  useEffect(() => {
    async function loadParcel() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/public/parcel/${params.id}`)
        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null)
          const parsedError = z.object({ error: z.string() }).safeParse(body)
          throw new Error(parsedError.success ? parsedError.data.error : 'Failed to load parcel details')
        }
        const body: unknown = await res.json()
        const data = z.object({ parcel: parcelDataSchema }).safeParse(body)
        if (!data.success) throw new Error('The parcel response is incomplete. Please contact the surveyor.')
        setParcel(data.data.parcel)
        if (data.data.parcel.beacons.length > 0) {
          setSelectedBeaconId(data.data.parcel.beacons[0].id)
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unable to find survey record')
      } finally {
        setLoading(false)
      }
    }
    loadParcel()
  }, [params.id])

  // Geolocation Watcher
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGpsError('GPS geolocation not supported on this device')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setGpsError(null)
      },
      (err) => {
        if (err.code === 1) {
          setGpsError('Please enable GPS location permissions to find your beacons')
        } else {
          setGpsError('Searching for satellite GPS signal...')
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // Device Orientation (Magnetic Compass Heading)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOrientation = (e: DeviceOrientationEvent) => {
      // webkitCompassHeading for iOS Safari
      const compassHeading = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
      if (typeof compassHeading === 'number' && Number.isFinite(compassHeading)) {
        setHeading(compassHeading)
      } else if (e.alpha !== null) {
        // Standard alpha (0-360deg counterclockwise)
        setHeading((360 - e.alpha) % 360)
      }
    }

    window.addEventListener('deviceorientation', handleOrientation, true)
    return () => window.removeEventListener('deviceorientation', handleOrientation, true)
  }, [])

  // Currently Selected Beacon
  const currentBeacon = useMemo(() => {
    if (!parcel?.beacons) return null
    return parcel.beacons.find((b) => b.id === selectedBeaconId) || parcel.beacons[0] || null
  }, [parcel, selectedBeaconId])

  // Distance & Bearing to Target Beacon
  const navMetrics = useMemo(() => {
    if (!userPos || !currentBeacon) return null

    const distM = computeHaversineDistance(
      userPos.lat,
      userPos.lng,
      currentBeacon.lat,
      currentBeacon.lng
    )

    const targetBrg = computeInitialBearing(
      userPos.lat,
      userPos.lng,
      currentBeacon.lat,
      currentBeacon.lng
    )

    // Needle rotation relative to user's heading
    const userHeading = heading ?? 0
    const relativeAngle = (targetBrg - userHeading + 360) % 360

    let proximity: 'FAR' | 'APPROACHING' | 'CLOSE' | 'ARRIVED' = 'FAR'
    if (distM <= 2.5) proximity = 'ARRIVED'
    else if (distM <= 10) proximity = 'CLOSE'
    else if (distM <= 50) proximity = 'APPROACHING'

    return {
      distanceM: distM,
      bearingDeg: Math.round(targetBrg),
      relativeAngle,
      proximity,
    }
  }, [userPos, currentBeacon, heading])

  // Play arrival chime & vibrate
  const playArrivalSound = useCallback(() => {
    if (audioMuted || typeof window === 'undefined') return
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume()

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime) // A5
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.25) // E6
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.5)

      if (navigator.vibrate) {
        navigator.vibrate([150, 80, 150])
      }
    } catch {
      // ignore
    }
  }, [audioMuted])

  // Trigger arrival feedback once when arriving
  useEffect(() => {
    if (navMetrics?.proximity === 'ARRIVED') {
      if (!hasChimedArrivalRef.current) {
        playArrivalSound()
        hasChimedArrivalRef.current = true
      }
    } else {
      hasChimedArrivalRef.current = false
    }
  }, [navMetrics?.proximity, playArrivalSound])

  // Handle Share link
  const handleShare = async () => {
    const shareData = {
      title: `Plot Boundaries: ${parcel?.lrNumber || 'Land Survey Record'}`,
      text: `View the parcel record and approximate walking directions for ${parcel?.lrNumber || 'my plot'}:`,
      url: window.location.href,
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // user cancelled
      }
    } else {
      navigator.clipboard.writeText(window.location.href)
      setShareSuccess(true)
      setTimeout(() => setShareSuccess(false), 2500)
    }
  }

  // Open in Google Maps
  const handleOpenGoogleMaps = () => {
    if (!currentBeacon) return
    const url = `https://www.google.com/maps/dir/?api=1&destination=${currentBeacon.lat},${currentBeacon.lng}`
    window.open(url, '_blank')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
        <p className="text-zinc-400 text-sm font-medium">Retrieving parcel record...</p>
      </div>
    )
  }

  if (error || !parcel) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold">Survey Record Not Available</h1>
        <p className="text-zinc-400 text-sm max-w-md">
          {error || 'The requested parcel link could not be located. Please contact your licensed land surveyor.'}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased">
      {/* Top Header Bar */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-40 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-amber-500">
                Parcel Record
              </div>
              <h1 className="text-sm font-bold text-white truncate max-w-[200px] sm:max-w-xs">
                {parcel.lrNumber}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAudioMuted(!audioMuted)}
              className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title={audioMuted ? 'Unmute arrival sound' : 'Mute arrival sound'}
            >
              {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
            </button>

            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 transition-colors shadow-sm shadow-amber-500/20"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{shareSuccess ? 'Link Copied!' : 'Share Plot'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6 pb-24">
        {/* Parcel Overview Card */}
        <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 to-zinc-900/50 p-5 space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div>
              <div className="text-xs text-zinc-400">Registered Landowner</div>
              <div className="text-base font-bold text-white">{parcel.clientName}</div>
              <div className="text-xs text-zinc-400 mt-0.5">
                {parcel.locality}, {parcel.county}
              </div>
            </div>

            <div className="sm:text-right">
              <div className="text-xs text-zinc-400">Official Survey Extent</div>
              <div className="text-lg font-black text-amber-400 font-mono">
                {parcel.areaHa} Ha{' '}
                <span className="text-xs font-normal text-zinc-400">
                  ({parcel.areaAcres} Acres)
                </span>
              </div>
              <div className="text-[11px] text-zinc-500">
                {parcel.beaconsCount} Boundary Beacons Fixed
              </div>
            </div>
          </div>

          {/* Licensed Surveyor attribution */}
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <div>
              Surveyor: <span className="text-zinc-200 font-medium">{parcel.surveyorName}</span>{' '}
              ({parcel.surveyorLicense})
            </div>
            {parcel.surveyorPhone && (
              <a
                href={`tel:${parcel.surveyorPhone}`}
                className="inline-flex items-center gap-1 text-amber-400 hover:underline"
              >
                <Phone className="w-3 h-3" />
                <span>Call Surveyor</span>
              </a>
            )}
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex rounded-xl p-1 bg-zinc-900 border border-zinc-800">
          <button
            onClick={() => setActiveView('compass')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              activeView === 'compass'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Walk to Beacon</span>
          </button>

          <button
            onClick={() => setActiveView('map')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              activeView === 'map'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Boundary Map</span>
          </button>

          <button
            onClick={() => setActiveView('guide')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              activeView === 'guide'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>Boundary Rights</span>
          </button>
        </div>

        {/* ─── TAB 1: WALK TO BEACON (COMPASS & GPS GUIDANCE) ─── */}
        {activeView === 'compass' && (
          <div className="space-y-6">
            {/* Beacon Selector Pills */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Select Beacon to Locate:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {parcel.beacons.map((b) => {
                  const isSelected = b.id === selectedBeaconId
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBeaconId(b.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/10 text-white ring-1 ring-amber-500/40'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-amber-400">
                          {b.name}
                        </span>
                        {isSelected && <Target className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate mt-1">
                        {b.monument.split(' ')[0]} Pillar
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Tactical Compass & Distance HUD */}
            <div className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 sm:p-8 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl">
              {/* GPS Signal Status Badge */}
              <div className="mb-4">
                {userPos ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    GPS Active (±{userPos.accuracy.toFixed(1)}m precision)
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    {gpsError || 'Acquiring satellite lock...'}
                  </div>
                )}
              </div>

              {/* Dynamic Compass Rose */}
              <div className="relative w-64 h-64 sm:w-72 sm:h-72 my-2 flex items-center justify-center">
                {/* Outer Ring Dial */}
                <div className="absolute inset-0 rounded-full border-2 border-zinc-800/80 bg-zinc-950/80 shadow-inner flex items-center justify-center">
                  {/* Cardinal Ticks */}
                  <span className="absolute top-2 text-xs font-bold text-zinc-500">N</span>
                  <span className="absolute bottom-2 text-xs font-bold text-zinc-600">S</span>
                  <span className="absolute right-2 text-xs font-bold text-zinc-600">E</span>
                  <span className="absolute left-2 text-xs font-bold text-zinc-600">W</span>
                </div>

                {/* Rotating Direction Needle */}
                {navMetrics ? (
                  <div
                    className="absolute inset-4 flex items-center justify-center transition-transform duration-300 ease-out"
                    style={{
                      transform: `rotate(${navMetrics.relativeAngle}deg)`,
                    }}
                  >
                    {/* Direction Arrow Needle */}
                    <div className="w-full flex flex-col items-center">
                      <div
                        className={`w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent ${
                          navMetrics.proximity === 'ARRIVED'
                            ? 'border-b-[42px] border-b-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]'
                            : 'border-b-[42px] border-b-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                        }`}
                      />
                      <div className="w-1.5 h-20 bg-gradient-to-b from-amber-500/60 to-transparent" />
                    </div>
                  </div>
                ) : (
                  <Navigation2 className="w-16 h-16 text-zinc-700 animate-pulse" />
                )}

                {/* Center Core Display */}
                <div className="z-10 w-28 h-28 rounded-full bg-zinc-900 border border-zinc-700/60 flex flex-col items-center justify-center shadow-lg text-center p-2">
                  {navMetrics ? (
                    <>
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                        Distance
                      </span>
                      <span
                        className={`text-xl font-black font-mono leading-none ${
                          navMetrics.proximity === 'ARRIVED'
                            ? 'text-emerald-400 animate-bounce'
                            : 'text-amber-400'
                        }`}
                      >
                        {navMetrics.distanceM < 1000
                          ? `${navMetrics.distanceM.toFixed(1)}m`
                          : `${(navMetrics.distanceM / 1000).toFixed(2)}km`}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        {navMetrics.bearingDeg}°
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-500">Stand by</span>
                  )}
                </div>
              </div>

              {/* Arrival / Proximity Status Banner */}
              {navMetrics && (
                <div className="mt-4 text-center space-y-1">
                  {navMetrics.proximity === 'ARRIVED' && (
                    <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500 text-emerald-300 text-sm font-bold flex items-center justify-center gap-2 animate-pulse">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Approximate navigation location reached: {currentBeacon?.name}</span>
                    </div>
                  )}
                  {navMetrics.proximity === 'CLOSE' && (
                    <div className="text-xs font-semibold text-amber-400">
                      <Target className="mr-1 inline h-4 w-4" aria-hidden="true" /> Near the mapped beacon location. Check the source record and field evidence before identifying the mark.
                    </div>
                  )}
                  {navMetrics.proximity === 'APPROACHING' && (
                    <div className="text-xs text-zinc-400">
                      Walking towards {currentBeacon?.name} ({navMetrics.distanceM.toFixed(0)}m away)
                    </div>
                  )}
                  {navMetrics.proximity === 'FAR' && (
                    <div className="text-xs text-zinc-400">
                      Follow the amber needle towards your parcel boundary
                    </div>
                  )}
                </div>
              )}

              {/* Target Beacon Spec Card */}
              {currentBeacon && (
                <div className="mt-6 w-full max-w-sm p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/60 text-xs space-y-1.5">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Target Beacon:</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {currentBeacon.name}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Monument Type:</span>
                    <span className="text-zinc-200">{currentBeacon.monument}</span>
                  </div>
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>GPS Coordinates:</span>
                    <span className="font-mono text-[11px] text-amber-400">
                      {currentBeacon.lat.toFixed(6)}, {currentBeacon.lng.toFixed(6)}
                    </span>
                  </div>
                </div>
              )}

              {/* Driving / Google Maps Fallback Button */}
              <div className="mt-5 w-full max-w-sm">
                <button
                  onClick={handleOpenGoogleMaps}
                  className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                  <span>Open Driving Directions in Google Maps</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 2: VISUAL BOUNDARY MAP ─── */}
        {activeView === 'map' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-500" />
                  Visual Boundary Plan & Beacon Coordinates
                </h3>
                <span className="text-xs text-zinc-400 font-mono">{parcel.datum}</span>
              </div>

              {/* Interactive SVG Boundary Visualizer */}
              <div className="w-full h-80 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-center relative overflow-hidden p-4">
                {parcel.beacons.length >= 3 ? (
                  <svg className="w-full h-full" viewBox="0 0 400 300">
                    {/* Grid Background */}
                    <defs>
                      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#27272a" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                    <rect width="400" height="300" fill="url(#grid)" />

                    {/* Scale and Plot Coordinates */}
                    {(() => {
                      const { minE, maxE, minN, maxN } = parcel.beacons.reduce(
                        (acc, b) => ({
                          minE: Math.min(acc.minE, b.easting),
                          maxE: Math.max(acc.maxE, b.easting),
                          minN: Math.min(acc.minN, b.northing),
                          maxN: Math.max(acc.maxN, b.northing),
                        }),
                        { minE: Infinity, maxE: -Infinity, minN: Infinity, maxN: -Infinity }
                      )

                      const pad = 45
                      const w = Math.max(1, maxE - minE)
                      const h = Math.max(1, maxN - minN)
                      const scale = Math.min((400 - pad * 2) / w, (300 - pad * 2) / h)

                      const toSvgX = (e: number) => pad + (e - minE) * scale
                      const toSvgY = (n: number) => 300 - (pad + (n - minN) * scale)

                      const pointsStr = parcel.beacons
                        .map((b) => `${toSvgX(b.easting)},${toSvgY(b.northing)}`)
                        .join(' ')

                      return (
                        <g>
                          {/* Parcel Polygon */}
                          <polygon
                            points={pointsStr}
                            fill="rgba(245, 158, 11, 0.15)"
                            stroke="#f59e0b"
                            strokeWidth="2.5"
                            strokeLinejoin="round"
                          />

                          {/* Beacons and Labels */}
                          {parcel.beacons.map((b) => {
                            const cx = toSvgX(b.easting)
                            const cy = toSvgY(b.northing)
                            const isSelected = b.id === selectedBeaconId

                            return (
                              <g
                                key={b.id}
                                className="cursor-pointer"
                                onClick={() => {
                                  setSelectedBeaconId(b.id)
                                  setActiveView('compass')
                                }}
                              >
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={isSelected ? 7 : 5}
                                  fill={isSelected ? '#34d399' : '#f59e0b'}
                                  stroke="#ffffff"
                                  strokeWidth="1.5"
                                />
                                <text
                                  x={cx + 8}
                                  y={cy - 8}
                                  fill="#f4f4f5"
                                  fontSize="10"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                >
                                  {b.name}
                                </text>
                              </g>
                            )
                          })}
                        </g>
                      )
                    })()}
                  </svg>
                ) : (
                  <div className="text-xs text-zinc-500">Insufficient boundary vertices</div>
                )}

                <div className="absolute bottom-2 left-2 text-[10px] text-zinc-400 bg-zinc-900/80 px-2 py-1 rounded">
                  Tap any beacon to navigate in Compass mode
                </div>
              </div>

              {/* Beacon Coordinates Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-800/60 text-zinc-400 font-semibold">
                    <tr>
                      <th className="p-2.5">Beacon</th>
                      <th className="p-2.5">Easting (m)</th>
                      <th className="p-2.5">Northing (m)</th>
                      <th className="p-2.5">GPS Latitude</th>
                      <th className="p-2.5">GPS Longitude</th>
                      <th className="p-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {parcel.beacons.map((b) => (
                      <tr
                        key={b.id}
                        className={`hover:bg-zinc-800/40 transition-colors ${
                          b.id === selectedBeaconId ? 'bg-amber-500/10' : ''
                        }`}
                      >
                        <td className="p-2.5 font-bold font-mono text-amber-400">{b.name}</td>
                        <td className="p-2.5 font-mono text-zinc-300">{b.easting.toFixed(2)}</td>
                        <td className="p-2.5 font-mono text-zinc-300">{b.northing.toFixed(2)}</td>
                        <td className="p-2.5 font-mono text-zinc-400">{b.lat.toFixed(6)}</td>
                        <td className="p-2.5 font-mono text-zinc-400">{b.lng.toFixed(6)}</td>
                        <td className="p-2.5">
                          <button
                            onClick={() => {
                              setSelectedBeaconId(b.id)
                              setActiveView('compass')
                            }}
                            className="px-2 py-1 rounded bg-amber-500 text-black font-semibold text-[11px] hover:bg-amber-400"
                          >
                            Locate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 3: LANDOWNER RIGHTS & BOUNDARY PROTECTION GUIDE ─── */}
        {activeView === 'guide' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                Boundary records and field guidance
              </h3>

              <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                  <div className="font-bold text-amber-400 text-sm">
                    <Scale className="mr-1 inline h-4 w-4" aria-hidden="true" /> Protection of survey marks
                  </div>
                  <p>
                    Survey marks are protected under the Survey Act. Do not move, damage or
                    alter a mark. Consult a licensed land surveyor before work that may disturb it.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60 space-y-1">
                  <div className="font-bold text-white text-sm">
                    <Construction className="mr-1 inline h-4 w-4" aria-hidden="true" /> Fencing and construction
                  </div>
                  <p>
                    Confirm the surveyed boundary, applicable setbacks and approved construction
                    details before building. A map navigation position does not locate a legal
                    boundary or establish where a foundation may be placed. Preserve survey marks.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60 space-y-1">
                  <div className="font-bold text-white text-sm">
                    <MessagesSquare className="mr-1 inline h-4 w-4" aria-hidden="true" /> Boundary questions and disputes
                  </div>
                  <p>
                    Retain the relevant title and survey records and record the concern without
                    altering marks or fences. Seek guidance from a licensed land surveyor and the
                    appropriate land office about the applicable boundary-review process.
                  </p>
                </div>
              </div>

              {/* Contact Surveyor Card */}
              <div className="pt-4 border-t border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-zinc-400">Assigned Licensed Surveyor</div>
                  <div className="text-sm font-bold text-white">{parcel.surveyorName}</div>
                  <div className="text-xs text-zinc-500">{parcel.surveyorFirm}</div>
                </div>

                {parcel.surveyorPhone && (
                  <a
                    href={`tel:${parcel.surveyorPhone}`}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-black font-semibold text-xs hover:bg-amber-400 transition-colors inline-flex items-center gap-2"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call {parcel.surveyorPhone}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
