'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Compass, X, Target, Copy, Check, Crosshair } from 'lucide-react';
import { computeBearingAndDistance, computePoint, lineLineIntersection, circleCircleIntersection, type Point } from '@/lib/survey/cogo/engine';
export type COGOMode = 'bearing_bearing' | 'distance_distance' | 'radiation' | 'missing_on_line'

export type COGOResult =
  | {
      type: 'intersection'
      valid: boolean
      point?: Point
      dist1?: number
      dist2?: number
    }
  | {
      type: 'circle_intersect'
      valid: boolean
      points: Point[]
    }
  | {
      type: 'radiation'
      valid: boolean
      point: Point
    }
  | {
      type: 'line_interpolation'
      valid: boolean
      point: Point
      totalDistance: number
      bearing: number
    }
  | null

interface QuickFieldCOGOModalProps {
  isOpen: boolean
  onClose: () => void
  onSetStakeoutTarget?: (target: { easting: number; northing: number; name?: string }) => void
}

export function QuickFieldCOGOModal({
  isOpen,
  onClose,
  onSetStakeoutTarget,
}: QuickFieldCOGOModalProps) {
  const [mode, setMode] = useState<COGOMode>('bearing_bearing')
  const [copied, setCopied] = useState(false)
  const [stakeoutSent, setStakeoutSent] = useState(false)

  // Inputs for Point A
  const [p1Name, setP1Name] = useState('MB-01')
  const [p1E, setP1E] = useState('254120.500')
  const [p1N, setP1N] = useState('9856100.250')

  // Inputs for Point B
  const [p2Name, setP2Name] = useState('MB-02')
  const [p2E, setP2E] = useState('254245.800')
  const [p2N, setP2N] = useState('9856185.600')

  // Mode-specific parameters
  const [bearing1, setBearing1] = useState('045.3015') // DDD.MMSS format
  const [bearing2, setBearing2] = useState('135.1545')
  const [dist1, setDist1] = useState('50.000')
  const [dist2, setDist2] = useState('65.250')
  const [radBearing, setRadBearing] = useState('085.1230')
  const [radDist, setRadDist] = useState('35.400')
  const [chainageOnLine, setChainageOnLine] = useState('40.000')

  // Parse DDD.MMSS to decimal degrees helper
  const parseKenyaDms = (val: string): number => {
    const clean = val.trim()
    if (!clean) return 0
    if (clean.includes('.') && clean.indexOf('.') <= 3) {
      // DDD.MMSS format: e.g. 45.3015 => 45 deg, 30 min, 15 sec
      const [degStr, fracStr = ''] = clean.split('.')
      const deg = parseFloat(degStr) || 0
      const padded = fracStr.padEnd(4, '0')
      const min = parseFloat(padded.slice(0, 2)) || 0
      const sec = parseFloat(padded.slice(2, 4) + (padded.slice(4) ? '.' + padded.slice(4) : '')) || 0
      return deg + min / 60 + sec / 3600
    }
    return parseFloat(clean) || 0
  }

  // Compute Results
  const result = useMemo<COGOResult>(() => {
    const pt1: Point = { easting: parseFloat(p1E) || 0, northing: parseFloat(p1N) || 0 }
    const pt2: Point = { easting: parseFloat(p2E) || 0, northing: parseFloat(p2N) || 0 }

    if (mode === 'bearing_bearing') {
      const b1 = parseKenyaDms(bearing1)
      const b2 = parseKenyaDms(bearing2)
      const inter = lineLineIntersection(pt1, b1, pt2, b2)
      return {
        type: 'intersection',
        valid: inter.exists,
        point: inter.point,
        dist1: inter.distance1,
        dist2: inter.distance2,
      }
    }

    if (mode === 'distance_distance') {
      const r1 = parseFloat(dist1) || 0
      const r2 = parseFloat(dist2) || 0
      const points = circleCircleIntersection(pt1, r1, pt2, r2)
      return {
        type: 'circle_intersect',
        valid: points.length > 0,
        points,
      }
    }

    if (mode === 'radiation') {
      const b = parseKenyaDms(radBearing)
      const d = parseFloat(radDist) || 0
      const pt = computePoint(pt1, b, d)
      return {
        type: 'radiation',
        valid: true,
        point: pt,
      }
    }

    if (mode === 'missing_on_line') {
      const lineData = computeBearingAndDistance(pt1, pt2)
      const c = parseFloat(chainageOnLine) || 0
      const pt = computePoint(pt1, lineData.bearing, c)
      return {
        type: 'line_interpolation',
        valid: true,
        point: pt,
        totalDistance: lineData.distance,
        bearing: lineData.bearing,
      }
    }

    return null
  }, [mode, p1E, p1N, p2E, p2N, bearing1, bearing2, dist1, dist2, radBearing, radDist, chainageOnLine])

  // Copy result coordinates
  const handleCopy = (pt: Point) => {
    const text = `E: ${pt.easting.toFixed(3)}, N: ${pt.northing.toFixed(3)}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Send to GPS Stakeout
  const handleSendStakeout = (pt: Point, name = 'COGO-TARGET') => {
    if (onSetStakeoutTarget) {
      onSetStakeoutTarget({ easting: pt.easting, northing: pt.northing, name })
      setStakeoutSent(true)
      setTimeout(() => setStakeoutSent(false), 2500)
    } else {
      // Dispatch custom event that map listens to
      const event = new CustomEvent('metardu:set-stakeout-target', {
        detail: { easting: pt.easting, northing: pt.northing, name },
      })
      window.dispatchEvent(event)
      setStakeoutSent(true)
      setTimeout(() => setStakeoutSent(false), 2500)
    }
  }

  // Keyboard shortcut Alt+O to toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault()
        if (isOpen) onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border-color,#3f3f46)] bg-[var(--bg-secondary,#18181b)] text-[var(--text-primary,#ffffff)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color,#27272a)] bg-zinc-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Quick Field COGO & Beacon Recovery</h2>
              <p className="text-[11px] text-zinc-400">
                Instant on-site intersections, radiation & missing beacon solve
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-4 p-1.5 bg-black/40 border-b border-[var(--border-color,#27272a)] gap-1 text-[11px] font-semibold">
          <button
            onClick={() => setMode('bearing_bearing')}
            className={`py-2 rounded-xl transition-all ${
              mode === 'bearing_bearing'
                ? 'bg-amber-500 text-black font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Bearing-Bearing
          </button>
          <button
            onClick={() => setMode('distance_distance')}
            className={`py-2 rounded-xl transition-all ${
              mode === 'distance_distance'
                ? 'bg-amber-500 text-black font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Distance-Distance
          </button>
          <button
            onClick={() => setMode('radiation')}
            className={`py-2 rounded-xl transition-all ${
              mode === 'radiation'
                ? 'bg-amber-500 text-black font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Radiation (Forward)
          </button>
          <button
            onClick={() => setMode('missing_on_line')}
            className={`py-2 rounded-xl transition-all ${
              mode === 'missing_on_line'
                ? 'bg-amber-500 text-black font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Lost on Line
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Known Station A */}
          <div className="p-3 rounded-xl border border-[var(--border-color,#27272a)] bg-black/20 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
              <span>Known Station 1 (P1)</span>
              <input
                type="text"
                value={p1Name}
                onChange={(e) => setP1Name(e.target.value)}
                placeholder="MB-01"
                className="w-24 px-2 py-0.5 text-right font-mono text-[11px] bg-transparent border border-zinc-700 rounded text-amber-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-zinc-400 block mb-0.5">Easting (m)</label>
                <input
                  type="number"
                  step="0.001"
                  value={p1E}
                  onChange={(e) => setP1E(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-400 block mb-0.5">Northing (m)</label>
                <input
                  type="number"
                  step="0.001"
                  value={p1N}
                  onChange={(e) => setP1N(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Known Station B (for modes that require 2 stations) */}
          {mode !== 'radiation' && (
            <div className="p-3 rounded-xl border border-[var(--border-color,#27272a)] bg-black/20 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                <span>Known Station 2 (P2)</span>
                <input
                  type="text"
                  value={p2Name}
                  onChange={(e) => setP2Name(e.target.value)}
                  placeholder="MB-02"
                  className="w-24 px-2 py-0.5 text-right font-mono text-[11px] bg-transparent border border-zinc-700 rounded text-amber-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-0.5">Easting (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={p2E}
                    onChange={(e) => setP2E(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-0.5">Northing (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={p2N}
                    onChange={(e) => setP2N(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mode Inputs */}
          {mode === 'bearing_bearing' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Bearing from P1 (DDD.MMSS)
                </label>
                <input
                  type="text"
                  value={bearing1}
                  onChange={(e) => setBearing1(e.target.value)}
                  placeholder="045.3015"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Bearing from P2 (DDD.MMSS)
                </label>
                <input
                  type="text"
                  value={bearing2}
                  onChange={(e) => setBearing2(e.target.value)}
                  placeholder="135.1545"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {mode === 'distance_distance' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Distance from P1 (m)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={dist1}
                  onChange={(e) => setDist1(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Distance from P2 (m)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={dist2}
                  onChange={(e) => setDist2(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {mode === 'radiation' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Radiation Bearing (DDD.MMSS)
                </label>
                <input
                  type="text"
                  value={radBearing}
                  onChange={(e) => setRadBearing(e.target.value)}
                  placeholder="085.1230"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Distance (m)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={radDist}
                  onChange={(e) => setRadDist(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {mode === 'missing_on_line' && (
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">
                Distance / Chainage from P1 along line P1→P2 (m)
              </label>
              <input
                type="number"
                step="0.001"
                value={chainageOnLine}
                onChange={(e) => setChainageOnLine(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 font-mono text-xs focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}

          {/* Results Display Panel */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Computed Target Solution
              </span>
              {stakeoutSent && (
                <span className="text-[10px] text-emerald-400 font-bold animate-pulse">
                  ✓ Set as GPS Stakeout Target!
                </span>
              )}
            </div>

            {/* Bearing-Bearing Result */}
            {result?.type === 'intersection' && (
              result.valid && result.point ? (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800 font-mono text-xs flex justify-between items-center">
                    <div>
                      <div className="text-zinc-400 text-[10px]">Intersection Point:</div>
                      <div className="font-bold text-white text-sm">
                        E: {result.point.easting.toFixed(3)} | N: {result.point.northing.toFixed(3)}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        Dist from P1: {(result.dist1 ?? 0).toFixed(2)}m | Dist from P2: {(result.dist2 ?? 0).toFixed(2)}m
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => result.point && handleCopy(result.point)}
                        className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white"
                        title="Copy coordinates"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => result.point && handleSendStakeout(result.point, 'INTERSECT')}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 flex items-center gap-1"
                        title="Navigate to this beacon immediately with GPS"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        Stakeout
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-red-400">Lines are parallel or do not intersect.</div>
              )
            )}

            {/* Distance-Distance (2 Solutions) */}
            {result?.type === 'circle_intersect' && (
              result.valid && result.points ? (
                <div className="space-y-2">
                  <div className="text-[10px] text-zinc-400">Two potential solutions found:</div>
                  {result.points.map((pt, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-black/40 border border-zinc-800 font-mono text-xs flex justify-between items-center"
                    >
                      <div>
                        <div className="text-amber-400 font-bold text-xs">Solution {idx + 1} ({idx === 0 ? 'Left' : 'Right'} of line):</div>
                        <div className="text-white">
                          E: {pt.easting.toFixed(3)} | N: {pt.northing.toFixed(3)}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleCopy(pt)}
                          className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleSendStakeout(pt, `SOL-${idx + 1}`)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 flex items-center gap-1"
                        >
                          <Crosshair className="w-3.5 h-3.5" />
                          Stakeout
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-red-400">Radii do not intersect (circles too far apart or inside).</div>
              )
            )}

            {/* Radiation Result */}
            {result?.type === 'radiation' && result.point && (
              <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800 font-mono text-xs flex justify-between items-center">
                <div>
                  <div className="text-zinc-400 text-[10px]">Radiated Target Beacon:</div>
                  <div className="font-bold text-white text-sm">
                    E: {result.point.easting.toFixed(3)} | N: {result.point.northing.toFixed(3)}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => result.point && handleCopy(result.point)}
                    className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => result.point && handleSendStakeout(result.point, 'RAD-PT')}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 flex items-center gap-1"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    Stakeout
                  </button>
                </div>
              </div>
            )}

            {/* Missing on Line Result */}
            {result?.type === 'line_interpolation' && result.point && (
              <div className="space-y-1.5">
                <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800 font-mono text-xs flex justify-between items-center">
                  <div>
                    <div className="text-zinc-400 text-[10px]">Intermediate Station:</div>
                    <div className="font-bold text-white text-sm">
                      E: {result.point.easting.toFixed(3)} | N: {result.point.northing.toFixed(3)}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      Line Total: {(result.totalDistance ?? 0).toFixed(2)}m @ {(result.bearing ?? 0).toFixed(4)}°
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => result.point && handleCopy(result.point)}
                      className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => result.point && handleSendStakeout(result.point, 'LINE-PT')}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 flex items-center gap-1"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      Stakeout
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-color,#27272a)] bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400">
          <span>Shortcut: <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 font-mono text-[10px]">Alt+O</kbd></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
