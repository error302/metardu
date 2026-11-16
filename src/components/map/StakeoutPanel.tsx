'use client'
/**
 * StakeoutPanel — Compact stakeout navigation HUD for /map.
 *
 * Rendered at workspace level (not inside a tool panel) so it stays visible
 * while the surveyor walks, with every tool panel closed. One slim strip
 * above the status bar: distance + bearing + device accuracy + audio
 * controls + stop. Styled by map-workspace.css (.map-stakeout-strip).
 *
 * Device-location navigation only — the reported uncertainty is not survey
 * acceptance; verify the point with survey GNSS and the job tolerance
 * before marking.
 */

import React, { memo, useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX, X } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'
import { ARRIVAL_TOLERANCE_M } from '@/lib/surveyMapEngine/ol/stakeout'
import { stakeoutVoice } from '@/lib/surveyMapEngine/ol/stakeoutVoice'

/** Beyond this, the "navigation" numbers are implausible for field walking. */
const FAR_TARGET_M = 100_000

export const StakeoutPanel = memo(function StakeoutPanel() {
  const {
    stakeoutActive: active,
    stakeoutTarget,
    stakeoutState,
    gpsPos,
    gpsTracking,
    toggleGPS,
    deactivateStakeout,
    audioMuted,
    setAudioMuted,
  } = useMapContext()

  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const prevDistanceRef = useRef<number | null>(null)

  // Spoken voice guidance for hands-free stakeout
  useEffect(() => {
    if (!active || !stakeoutTarget || !stakeoutState || !voiceEnabled || audioMuted) {
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
    prevDistanceRef.current = stakeoutState.distance
  }, [active, stakeoutTarget, stakeoutState, voiceEnabled, audioMuted])

  useEffect(() => () => stakeoutVoice.stop(), [])

  if (!active || !stakeoutTarget) return null

  const target = { easting: stakeoutTarget.e, northing: stakeoutTarget.n }
  const gpsAccuracy = gpsPos && Number.isFinite(gpsPos.accuracy) && gpsPos.accuracy > 0
    ? gpsPos.accuracy
    : null
  const farDistanceKm = stakeoutState && stakeoutState.distance > FAR_TARGET_M
    ? stakeoutState.distance / 1000
    : null

  const proximityTone =
    stakeoutState?.proximityColor === 'green'
      ? 'map-stakeout-strip--green'
      : stakeoutState?.proximityColor === 'amber'
        ? 'map-stakeout-strip--amber'
        : 'map-stakeout-strip--accent'

  return (
    <div className={`map-stakeout-strip ${proximityTone}`} role="region" aria-label="Stakeout navigation">
      {farDistanceKm !== null && (
        <p role="alert" className="map-stakeout-far-alert">
          Target is {farDistanceKm.toFixed(0)} km away — a stakeout is a walking-distance task. Verify the coordinates and the selected survey grid/hemisphere before navigating.
        </p>
      )}

      <div className="map-stakeout-row">
        <span className="map-stakeout-dot" aria-hidden="true" />
        <span
          className="map-stakeout-label"
          title="Device-location navigation only. Its reported uncertainty is not survey acceptance; verify the point with survey GNSS and the job tolerance before marking."
        >
          Stakeout
        </span>
        {stakeoutState && <span className="map-stakeout-state">{stakeoutState.proximityLabel}</span>}

        <span className="map-stakeout-readout" aria-live="off">
          {stakeoutState ? (
            <>
              <span className="map-stakeout-distance">
                {stakeoutState.distance < 1000
                  ? `${stakeoutState.distance.toFixed(2)} m`
                  : `${(stakeoutState.distance / 1000).toFixed(3)} km`}
              </span>
              <span className="map-stakeout-bearing">{stakeoutState.bearingWCB} · {stakeoutState.bearing.toFixed(1)}°</span>
            </>
          ) : (
            <span className="map-stakeout-waiting">Waiting for GPS…</span>
          )}
        </span>

        <span className="map-stakeout-meta" title="Reported device accuracy">
          {gpsAccuracy === null ? 'Unknown' : `±${gpsAccuracy.toFixed(0)} m`}
        </span>

        {!gpsTracking && (
          <button type="button" className="map-stakeout-gps-btn" onClick={toggleGPS}>Enable GPS</button>
        )}

        <span className="map-stakeout-controls">
          <button
            type="button"
            className="map-stakeout-icon-btn"
            data-on={voiceEnabled && !audioMuted}
            onClick={() => setVoiceEnabled(v => !v)}
            title={voiceEnabled ? 'Voice guidance on' : 'Voice guidance off'}
            aria-label={voiceEnabled ? 'Disable voice guidance' : 'Enable voice guidance'}
            aria-pressed={voiceEnabled}
          >
            {voiceEnabled && !audioMuted ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="map-stakeout-icon-btn"
            data-on={!audioMuted}
            onClick={() => setAudioMuted(m => !m)}
            title={audioMuted ? 'Unmute proximity beeps' : 'Mute proximity beeps'}
            aria-label={audioMuted ? 'Unmute proximity beeps' : 'Mute proximity beeps'}
            aria-pressed={!audioMuted}
          >
            {audioMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="map-stakeout-icon-btn map-stakeout-icon-btn--stop"
            onClick={deactivateStakeout}
            title="Stop stakeout"
            aria-label="Stop stakeout"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      <div className="map-stakeout-sub">
        <span className="map-stakeout-coords">
          E: {target.easting.toFixed(2)}&nbsp; N: {target.northing.toFixed(2)}
        </span>
        {stakeoutState && (
          <span className="map-stakeout-coords">
            dE {stakeoutState.dE >= 0 ? '+' : ''}{stakeoutState.dE.toFixed(1)}&nbsp; dN {stakeoutState.dN >= 0 ? '+' : ''}{stakeoutState.dN.toFixed(1)}
            {stakeoutState.elevationDiff != null && (
              <>&nbsp; ΔH {stakeoutState.elevationDiff >= 0 ? '+' : ''}{stakeoutState.elevationDiff.toFixed(2)} m</>
            )}
          </span>
        )}
        {stakeoutState && (
          <span
            className="map-stakeout-progress"
            role="progressbar"
            aria-label="Proximity"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.max(0, Math.min(100, (1 - Math.min(stakeoutState.distance, 3) / 3) * 100)))}
            aria-valuetext={`${stakeoutState.distance.toFixed(1)} m · band ≤ ${ARRIVAL_TOLERANCE_M.toFixed(1)} m`}
          >
            <span
              className="map-stakeout-progress-fill"
              style={{ width: `${Math.max(0, Math.min(100, (1 - Math.min(stakeoutState.distance, 3) / 3) * 100))}%` }}
            />
          </span>
        )}
      </div>

      {stakeoutState?.arrivalAssessment === 'reported-uncertainty-overlaps-band' && (
        <p role="status" className="map-stakeout-note">Position uncertainty crosses the {ARRIVAL_TOLERANCE_M.toFixed(1)} m band — verify arrival with survey GNSS.</p>
      )}
      {stakeoutState?.arrivalAssessment === 'reported-accuracy-unknown' && (
        <p role="status" className="map-stakeout-note">No usable accuracy radius — this position cannot confirm arrival; verify with survey GNSS.</p>
      )}
    </div>
  )
})
