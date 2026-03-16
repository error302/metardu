'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { distanceBearing } from '@/lib/engine/distance'
import { bearingToString } from '@/lib/engine/angles'
import { geographicToUTM } from '@/lib/engine/coordinates'

interface StakeoutPoint {
  id: string
  name: string
  easting: number
  northing: number
  elevation?: number
}

interface StakeoutModeProps {
  points: StakeoutPoint[]
  utmZone: number
  hemisphere: 'N' | 'S'
  onComplete?: (pointId: string) => void
}

export default function StakeoutMode({ points, utmZone, hemisphere, onComplete }: StakeoutModeProps) {
  const [currentPointIndex, setCurrentPointIndex] = useState(0)
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [distance, setDistance] = useState<number | null>(null)
  const [bearing, setBearing] = useState<number | null>(null)
  const [deltaE, setDeltaE] = useState<number | null>(null)
  const [deltaN, setDeltaN] = useState<number | null>(null)
  const [isOnPoint, setIsOnPoint] = useState(false)
  const [stakedPoints, setStakedPoints] = useState<Set<string>>(new Set())
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [gpsWarning, setGpsWarning] = useState<string | null>(null)
  const lastBeepTime = useRef<number>(0)
  const audioContextRef = useRef<AudioContext | null>(null)

  const currentPoint = points[currentPointIndex]

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return audioContextRef.current
  }, [])

  const playProximityBeep = useCallback((dist: number) => {
    if (!audioEnabled) return
    
    const now = Date.now()
    if (now - lastBeepTime.current < (dist < 1 ? 200 : dist < 5 ? 400 : 800)) {
      return
    }
    lastBeepTime.current = now

    try {
      const audioCtx = getAudioContext()
      const oscillator = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioCtx.destination)

      if (dist < 0.1) {
        oscillator.frequency.value = 1000
        gainNode.gain.value = 0.15
        oscillator.start()
        oscillator.stop(audioCtx.currentTime + 0.15)
      } else if (dist < 1) {
        oscillator.frequency.value = 880
        gainNode.gain.value = 0.12
        oscillator.start()
        oscillator.stop(audioCtx.currentTime + 0.1)
      } else if (dist < 5) {
        oscillator.frequency.value = 660
        gainNode.gain.value = 0.1
        oscillator.start()
        oscillator.stop(audioCtx.currentTime + 0.08)
      } else {
        oscillator.frequency.value = 440
        gainNode.gain.value = 0.08
        oscillator.start()
        oscillator.stop(audioCtx.currentTime + 0.06)
      }
    } catch (e) {
      console.error('Audio error:', e)
    }
  }, [audioEnabled, getAudioContext])

  const calculateDistanceAndBearing = useCallback(() => {
    if (!userLocation || !currentPoint) return

    const userUtm = geographicToUTM(userLocation.lat, userLocation.lon, utmZone)
    if (userUtm.hemisphere !== hemisphere) {
      setGpsWarning(`GPS hemisphere (${userUtm.hemisphere}) does not match project hemisphere (${hemisphere}).`)
      setDistance(null)
      setBearing(null)
      setDeltaE(null)
      setDeltaN(null)
      setIsOnPoint(false)
      return
    }

    setGpsWarning(null)
    const result = distanceBearing(
      { easting: userUtm.easting, northing: userUtm.northing },
      { easting: currentPoint.easting, northing: currentPoint.northing }
    )

    setDistance(result.distance)
    setBearing(result.bearing)
    setDeltaE(result.deltaE)
    setDeltaN(result.deltaN)

    playProximityBeep(result.distance)

    if (result.distance < 0.1) {
      setIsOnPoint(true)
      playProximityBeep(0)
    } else {
      setIsOnPoint(false)
    }
  }, [userLocation, currentPoint, playProximityBeep, utmZone, hemisphere])

  useEffect(() => {
    if (userLocation && currentPoint) {
      calculateDistanceAndBearing()
    }
  }, [userLocation, currentPoint, calculateDistanceAndBearing])

  useEffect(() => {
    if ('geolocation' in navigator) {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          })
        },
        (error) => {
          console.error('GPS error:', error)
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      )

      return () => {
        navigator.geolocation.clearWatch(id)
      }
    }
  }, [])

  const handleMarkStaked = () => {
    if (!currentPoint) return
    const newStaked = new Set(stakedPoints)
    newStaked.add(currentPoint.id)
    setStakedPoints(newStaked)
    setIsOnPoint(false)
    
    if (onComplete) {
      onComplete(currentPoint.id)
    }

    if (currentPointIndex < points.length - 1) {
      setCurrentPointIndex(currentPointIndex + 1)
    }
  }

  const handleNextPoint = () => {
    if (currentPointIndex < points.length - 1) {
      setCurrentPointIndex(currentPointIndex + 1)
      setIsOnPoint(false)
    }
  }

  const handlePrevPoint = () => {
    if (currentPointIndex > 0) {
      setCurrentPointIndex(currentPointIndex - 1)
      setIsOnPoint(false)
    }
  }

  if (!currentPoint) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-bold text-gray-100 mb-4">No Points to Stakeout</h2>
        <p className="text-gray-500">Add points to your project first.</p>
      </div>
    )
  }

  const progress = `${stakedPoints.size} of ${points.length} points staked`
  const moveInstruction = (() => {
    if (deltaE === null || deltaN === null) return null
    const eDir = deltaE >= 0 ? 'E' : 'W'
    const nDir = deltaN >= 0 ? 'N' : 'S'
    return {
      eText: `${eDir} ${Math.abs(deltaE).toFixed(2)} m`,
      nText: `${nDir} ${Math.abs(deltaN).toFixed(2)} m`,
    }
  })()

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-100">GPS Stakeout</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{progress}</span>
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`px-3 py-1 rounded text-sm ${
                audioEnabled ? 'bg-green-900 text-green-400' : 'bg-gray-700 text-gray-400'
              }`}
            >
              {audioEnabled ? '🔊' : '🔇'}
            </button>
          </div>
        </div>
      </header>

      {isOnPoint ? (
        <div className="flex-1 flex items-center justify-center bg-green-900/30">
          <div className="text-center">
            <div className="text-8xl mb-4">✓</div>
            <h2 className="text-3xl font-bold text-green-400 mb-4">ON POINT</h2>
            <p className="text-gray-300 mb-6">{currentPoint.name}</p>
            <button
              onClick={handleMarkStaked}
              className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-lg"
            >
              Mark as Staked ✓
            </button>
          </div>
        </div>
      ) : (
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🎯</div>
            <h2 className="text-2xl font-bold text-gray-100 mb-2">{currentPoint.name}</h2>
            <p className="text-gray-400">
              E: {currentPoint.easting.toFixed(4)} m | N: {currentPoint.northing.toFixed(4)} m
            </p>
          </div>

          <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md">
            {gpsWarning ? (
              <div className="mb-4 p-3 rounded border border-yellow-700 bg-yellow-900/20 text-yellow-200 text-sm">
                {gpsWarning}
              </div>
            ) : null}
            <div className="text-center mb-6">
              <div className="text-sm text-gray-500 uppercase tracking-wider mb-2">Distance</div>
              <div className="text-5xl font-bold text-[#E8841A]">
                {distance !== null ? `${distance.toFixed(2)} m` : '—'}
              </div>
            </div>

            <div className="text-center">
              <div className="text-sm text-gray-500 uppercase tracking-wider mb-2">Bearing</div>
              <div className="text-2xl font-mono text-gray-200">
                {bearing !== null ? bearingToString(bearing) : '—'}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded bg-gray-950/40 border border-gray-800">
                <div className="text-gray-500">ΔE (m)</div>
                <div className={deltaE !== null && deltaE >= 0 ? 'text-green-300' : 'text-red-300'}>
                  {deltaE !== null ? deltaE.toFixed(4) : '—'}
                </div>
              </div>
              <div className="p-3 rounded bg-gray-950/40 border border-gray-800">
                <div className="text-gray-500">ΔN (m)</div>
                <div className={deltaN !== null && deltaN >= 0 ? 'text-green-300' : 'text-red-300'}>
                  {deltaN !== null ? deltaN.toFixed(4) : '—'}
                </div>
              </div>
            </div>

            {moveInstruction ? (
              <div className="mt-3 p-3 rounded bg-gray-950/40 border border-gray-800">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Move</div>
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-300">East/West</div>
                  <div className="font-mono text-gray-100">{moveInstruction.eText}</div>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <div className="text-gray-300">North/South</div>
                  <div className="font-mono text-gray-100">{moveInstruction.nText}</div>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex justify-center">
              <div className="relative w-32 h-32">
                <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
                <div 
                  className="absolute inset-0 border-4 border-[#E8841A] rounded-full"
                  style={{
                    clipPath: bearing !== null ? `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.sin(bearing * Math.PI / 180)}% ${50 - 50 * Math.cos(bearing * Math.PI / 180)}%)` : 'none'
                  }}
                ></div>
                <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-[#E8841A] rounded-full -translate-x-1/2 -translate-y-1/2"></div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-4">
            <button
              onClick={handlePrevPoint}
              disabled={currentPointIndex === 0}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg disabled:opacity-50"
            >
              ← Previous
            </button>
            <button
              onClick={handleNextPoint}
              disabled={currentPointIndex === points.length - 1}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </main>
      )}

      <div className="bg-gray-900 border-t border-gray-800 p-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {points.map((pt, idx) => (
            <button
              key={pt.id}
              onClick={() => {
                setCurrentPointIndex(idx)
                setIsOnPoint(false)
              }}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${
                idx === currentPointIndex 
                  ? 'bg-[#E8841A] text-black font-bold' 
                  : stakedPoints.has(pt.id)
                    ? 'bg-green-900 text-green-400'
                    : 'bg-gray-800 text-gray-300'
              }`}
            >
              {stakedPoints.has(pt.id) && '✓ '}{pt.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
