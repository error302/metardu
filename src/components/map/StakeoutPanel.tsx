'use client'
/**
 * StakeoutPanel — Floating stakeout info panel for GPS-guided point navigation
 *
 * Positioned at bottom-center of the map for mobile field use.
 * Shows distance, bearing, accuracy, elevation diff, and proximity progress.
 * Includes audio mute toggle and cancel stakeout button.
 * Remains visible until cancelled; proximity is not survey acceptance.
 *
 * Touch-friendly with large text for field use.
 *
 * Now consumes all state from MapReactContext via useMapContext().
 * Previously received 9 props from MapClient — now reads from context directly.
 */

import React, { memo, useState, useEffect, useRef, useMemo } from 'react'
import { useMapContext } from '@/app/map/MapReactContext'
import { ARRIVAL_TOLERANCE_M, NEAR_TARGET_TOLERANCE_M } from '@/lib/surveyMapEngine/ol/stakeout'
import { stakeoutVoice } from '@/lib/surveyMapEngine/ol/stakeoutVoice'
import { Volume2, VolumeX } from 'lucide-react'

export const StakeoutPanel = memo(function StakeoutPanel() {
  const {
    stakeoutActive: active,
    stakeoutTarget,
    stakeoutState,
    gpsPos,
    deactivateStakeout,
    audioMuted,
    setAudioMuted,
    isMobile,
  } = useMapContext()

  // Derive target in StakeoutTarget format
  const target = useMemo(
    () => stakeoutTarget
      ? { easting: stakeoutTarget.e, northing: stakeoutTarget.n }
      : null,
    [stakeoutTarget]
  )

  const gpsAccuracy = gpsPos && Number.isFinite(gpsPos.accuracy) && gpsPos.accuracy > 0
    ? gpsPos.accuracy : null
  const panelRef = useRef<HTMLDivElement>(null)

  const [voiceEnabled, setVoiceEnabled] = useState(true)

  // Spoken voice guidance for hands-free stakeout
  useEffect(() => {
    if (!active || !target || !stakeoutState || !voiceEnabled || audioMuted) {
      stakeoutVoice.stop()
      return
    }

    stakeoutVoice.speakGuidance({
      distance: stakeoutState.distance,
      dE: stakeoutState.dE,
      dN: stakeoutState.dN,
      bearing: stakeoutState.bearing,
      elevationDiff: stakeoutState.elevationDiff,
      arrivalAssessment: stakeoutState.arrivalAssessment,
      enabled: voiceEnabled && !audioMuted,
    })
  }, [active, target, stakeoutState, voiceEnabled, audioMuted])

  // Stop voice on unmount or cancel
  useEffect(() => {
    return () => {
      stakeoutVoice.stop()
    }
  }, [])

  if (!active || !target) return null

  const proximityColorMap = {
    green: {
      bg: 'bg-green-500/15',
      border: 'border-green-500/40',
      text: 'text-green-400',
      barBg: 'bg-green-500/20',
      barFill: 'bg-green-500',
      glow: 'shadow-green-500/20',
    },
    amber: {
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/40',
      text: 'text-amber-400',
      barBg: 'bg-amber-500/20',
      barFill: 'bg-amber-500',
      glow: 'shadow-amber-500/20',
    },
    red: {
      bg: 'bg-[#D17B47]/15',
      border: 'border-[#D17B47]/40',
      text: 'text-[#D17B47]',
      barBg: 'bg-[#D17B47]/20',
      barFill: 'bg-[#D17B47]',
      glow: 'shadow-[#D17B47]/20',
    },
  }

  const colors = stakeoutState
    ? proximityColorMap[stakeoutState.proximityColor]
    : proximityColorMap.red

  // Progress bar uses the same navigation range as the stakeout engine.
  const progressPercent = stakeoutState
    ? Math.max(0, Math.min(100, ((NEAR_TARGET_TOLERANCE_M - Math.min(stakeoutState.distance, NEAR_TARGET_TOLERANCE_M)) / NEAR_TARGET_TOLERANCE_M) * 100))
    : 0

  const onToggleAudio = () => setAudioMuted(m => !m)

  return (
    <div
      ref={panelRef}
      className={`
        fixed z-[1001] left-1/2 -translate-x-1/2
        ${isMobile ? 'bottom-[72px] w-[calc(100%-24px)] max-w-[360px]' : 'bottom-4 w-[380px]'}
        bg-slate-950 ${colors.border} border rounded-2xl
        shadow-2xl ${colors.glow} overflow-hidden
        transition-all duration-300 ease-out
      `}
      role="region"
      aria-label="Stakeout navigation panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          {/* Pulsing dot */}
          <div className="relative">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                stakeoutState?.proximityColor === 'green'
                  ? 'bg-green-500'
                  : stakeoutState?.proximityColor === 'amber'
                  ? 'bg-amber-500'
                  : 'bg-[#D17B47]'
              }`}
            />
            <div
              className={`absolute inset-0 rounded-full animate-ping opacity-50 ${
                stakeoutState?.proximityColor === 'green'
                  ? 'bg-green-500'
                  : stakeoutState?.proximityColor === 'amber'
                  ? 'bg-amber-500'
                  : 'bg-[#D17B47]'
              }`}
            />
          </div>
          <span className="text-[11px] font-bold text-gray-300 uppercase tracking-[0.15em]">
            Stakeout
          </span>
          {stakeoutState && (
            <span className={`text-[10px] font-semibold ${colors.text} uppercase`}>
              {stakeoutState.proximityLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Spoken voice guidance toggle */}
          <button
            onClick={() => setVoiceEnabled(v => !v)}
            className={`w-11 h-11 flex items-center justify-center rounded-lg border transition-colors ${
              voiceEnabled && !audioMuted
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
                : 'bg-white/[0.06] border-white/[0.08] text-gray-500 hover:text-gray-300'
            }`}
            title={voiceEnabled ? 'Voice Guidance ON (speaking directional cues)' : 'Voice Guidance OFF'}
            aria-label={voiceEnabled ? 'Disable Voice Guidance' : 'Enable Voice Guidance'}
          >
            {voiceEnabled && !audioMuted ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Audio beep mute toggle */}
          <button
            onClick={onToggleAudio}
            className="w-11 h-11 flex items-center justify-center rounded-lg
                       bg-white/[0.06] border border-white/[0.08] text-gray-400
                       hover:text-white hover:bg-white/[0.10] transition-colors"
            title={audioMuted ? 'Unmute proximity beeps' : 'Mute proximity beeps'}
            aria-label={audioMuted ? 'Unmute proximity beeps' : 'Mute proximity beeps'}
          >
            {audioMuted ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>

          {/* Cancel button */}
          <button
            onClick={deactivateStakeout}
            className="w-11 h-11 flex items-center justify-center rounded-lg
                       bg-red-500/10 border border-red-500/20 text-red-400
                       hover:text-red-300 hover:bg-red-500/20 transition-colors"
            title="Cancel stakeout"
            aria-label="Cancel stakeout"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="mb-3 text-xs text-slate-300">Device-location navigation only. Its reported uncertainty is not survey acceptance; verify the point with survey GNSS and the job tolerance before marking.</p>
        {/* Target info */}
        <div className="mb-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
            Target
          </div>
          <div className="text-sm text-white font-semibold truncate">
            Point
          </div>
          <div className="text-[11px] text-gray-400 font-mono">
            E: {target.easting.toFixed(2)} &nbsp; N: {target.northing.toFixed(2)}
          </div>
        </div>

        {/* Distance — large, bold, prominent */}
        {stakeoutState ? (
          <div className="mb-3">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
              Distance
            </div>
            <div className={`text-3xl font-bold font-mono ${colors.text} tabular-nums leading-tight`}>
              {stakeoutState.distance < 1000
                ? `${stakeoutState.distance.toFixed(2)} m`
                : `${(stakeoutState.distance / 1000).toFixed(3)} km`}
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
              Distance
            </div>
            <div className="text-sm text-gray-600">Waiting for GPS...</div>
          </div>
        )}

        {/* Bearing */}
        {stakeoutState && (
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
                Bearing (WCB)
              </div>
              <div className="text-base font-semibold font-mono text-blue-300 tabular-nums">
                {stakeoutState.bearingWCB}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
                Azimuth
              </div>
              <div className="text-base font-semibold font-mono text-blue-300 tabular-nums">
                {stakeoutState.bearing.toFixed(4)}&deg;
              </div>
            </div>
          </div>
        )}

        {/* Accuracy & Elevation */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
              Reported device accuracy
            </div>
            <div className="text-[11px] font-mono text-gray-300">
              {gpsAccuracy === null ? 'Unknown' : `\u00B1${gpsAccuracy.toFixed(1)} m`}
            </div>
          </div>
          {stakeoutState?.elevationDiff != null && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
                Elevation Diff
              </div>
              <div className="text-[11px] font-mono text-gray-300">
                {stakeoutState.elevationDiff >= 0 ? '+' : ''}
                {stakeoutState.elevationDiff.toFixed(2)} m
              </div>
            </div>
          )}
        </div>

        {stakeoutState?.arrivalAssessment === 'reported-uncertainty-overlaps-band' && (
          <p role="status" className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-200">
            The reported position uncertainty crosses the {ARRIVAL_TOLERANCE_M.toFixed(1)} m navigation band. Use survey GNSS to verify arrival.
          </p>
        )}
        {stakeoutState?.arrivalAssessment === 'reported-accuracy-unknown' && (
          <p role="status" className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-amber-200">
            The device reports no usable accuracy radius. This position cannot confirm arrival; use survey GNSS to verify.
          </p>
        )}

        {/* dE / dN */}
        {stakeoutState && (
          <div className="mb-3 text-[10px] text-gray-500 font-mono">
            dE: {stakeoutState.dE >= 0 ? '+' : ''}{stakeoutState.dE.toFixed(2)} &nbsp;|&nbsp;
            dN: {stakeoutState.dN >= 0 ? '+' : ''}{stakeoutState.dN.toFixed(2)}
          </div>
        )}

        {/* Progress bar (near-target navigation range) */}
        <div className="mb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Proximity</span>
            <span className="text-[10px] text-gray-500 tabular-nums">
              {stakeoutState ? `${stakeoutState.distance.toFixed(1)} m · band ≤ ${ARRIVAL_TOLERANCE_M.toFixed(1)} m` : '---'}
            </span>
          </div>
          <div className={`h-2 rounded-full ${colors.barBg} overflow-hidden`}>
            <div
              className={`h-full rounded-full ${colors.barFill} transition-all duration-300 ease-out`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-gray-600">{NEAR_TARGET_TOLERANCE_M.toFixed(0)} m</span>
            <span className="text-[9px] text-gray-600">{ARRIVAL_TOLERANCE_M.toFixed(1)} m</span>
            <span className="text-[9px] text-gray-600">0 m</span>
          </div>
        </div>
      </div>
    </div>
  )
})
