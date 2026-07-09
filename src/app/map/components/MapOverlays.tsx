'use client'
/**
 * MapOverlays — Floating map UI overlays (zoom controls, GPS badge, stakeout HUD, project count)
 *
 * T1.5g FIX (2026-07-10): Migrated from raw absolute positioning to
 * MapOverlaySlot. Previously these 5 elements used their own `absolute`
 * classNames with hardcoded z-[1000], conflicting with the slot-based
 * overlay system. Now they register with the MapOverlayProvider and
 * stack properly within their anchor zones.
 *
 * Now reads state from MapReactContext via useMapContext().
 * Memoized to prevent re-renders from unrelated state changes.
 */

import React, { memo } from 'react'
import { useMapContext } from '@/app/map/MapReactContext'
import { MapOverlaySlot } from '@/app/map/components/MapOverlayManager'

export const MapOverlays = memo(function MapOverlays() {
  const {
    mapInstance,
    panelOpen,
    setPanelOpen,
    gpsTracking,
    gpsPos,
    stakeoutActive,
    stakeoutTarget,
    stakeoutInfo,
    toggleStakeout,
    toggleGPS,
    projectCount,
    isMobile,
  } = useMapContext()

  return (
    <>
      {/* Hamburger toggle when panel is open — top-left */}
      {panelOpen && (
        <MapOverlaySlot id="hamburger-toggle" anchor="top-left" order={1} layer="CONTROLS">
          <button
            onClick={() => setPanelOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]/[0.06] transition-colors"
            style={{ marginLeft: isMobile ? '0px' : '260px' }}
            title="Collapse panel"
          >
            <span className="text-sm">{'\u2039'}</span>
          </button>
        </MapOverlaySlot>
      )}

      {/* Zoom controls — top-right, highest priority (order=0) */}
      <MapOverlaySlot id="zoom-controls" anchor="top-right" order={0} layer="CONTROLS" edgeMargin={16}>
        <div className="flex flex-col gap-1" role="group" aria-label="Map zoom controls">
          <button
            onClick={() => mapInstance.current?.getView().animate({ zoom: mapInstance.current.getView().getZoom() + 1 }, { duration: 200 })}
            className="w-10 h-10 bg-[#14141e]/90 backdrop-blur-sm border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] flex items-center justify-center hover:bg-[#D17B47]/20 transition-colors"
            title="Zoom In"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => mapInstance.current?.getView().animate({ zoom: Math.max(6, mapInstance.current.getView().getZoom() - 1) }, { duration: 200 })}
            className="w-10 h-10 bg-[#14141e]/90 backdrop-blur-sm border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] flex items-center justify-center hover:bg-[#D17B47]/20 transition-colors"
            title="Zoom Out"
            aria-label="Zoom out"
          >
            {'\u2212'}
          </button>
        </div>
      </MapOverlaySlot>

      {/* GPS status badge — bottom-left, above status bar */}
      {gpsTracking && gpsPos && (
        <MapOverlaySlot id="gps-badge" anchor="bottom-left" order={40} layer="STAKEOUT">
          <div className="bg-[#14141e]/90 backdrop-blur-sm border border-green-500/30 rounded-lg px-3 py-1.5 text-xs text-[var(--success)] font-mono">
            GPS {'\u00B1'}{Math.round(gpsPos.accuracy)}m
          </div>
        </MapOverlaySlot>
      )}

      {/* Stakeout HUD — bottom-right, above print button */}
      {stakeoutActive && stakeoutTarget && (() => {
        const info = stakeoutInfo()
        return (
          <MapOverlaySlot id="stakeout-hud" anchor="bottom-right" order={5} layer="STAKEOUT">
            <div
              className="bg-[#14141e]/95 backdrop-blur-xl border border-[#D17B47]/30 rounded-xl px-4 py-3 shadow-2xl"
              style={{ width: isMobile ? '180px' : '220px' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-[#D17B47] uppercase tracking-[0.15em] font-bold">Stakeout</span>
                <button onClick={toggleStakeout} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Stop</button>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mb-1">Target</div>
              <div className="text-[11px] text-[var(--text-primary)] font-mono mb-2">E: {stakeoutTarget.e.toFixed(1)} N: {stakeoutTarget.n.toFixed(1)}</div>
              {info ? (
                <>
                  <div className="text-[10px] text-[var(--text-muted)] mb-1">Distance / Bearing</div>
                  <div className="text-lg font-bold text-[#D17B47] font-mono">{info.distance.toFixed(1)} m</div>
                  <div className="text-sm text-[var(--primary-blue)] font-mono">{info.bearing.toFixed(2)}{'\u00B0'}</div>
                  <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                    dE: {info.dE.toFixed(1)} | dN: {info.dN.toFixed(1)}
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-[var(--text-muted)]">Waiting for GPS position...</div>
              )}
              {!gpsTracking && (
                <button
                  onClick={toggleGPS}
                  className="mt-2 w-full py-1.5 rounded-lg bg-[var(--success)]/20 border border-green-500/30 text-[var(--success)] text-[10px] font-medium hover:bg-[var(--success)]/30 transition-colors"
                >
                  Enable GPS
                </button>
              )}
            </div>
          </MapOverlaySlot>
        )
      })()}

      {/* Project count — top-center */}
      {projectCount > 0 && (
        <MapOverlaySlot id="project-count" anchor="top-center" order={1} layer="CONTROLS">
          <div className="bg-[#0d0d14]/90 backdrop-blur-xl border border-[var(--border-color)]/[0.06] rounded-full px-3 py-1 shadow-lg">
            <span className="text-[11px] text-[#D17B47] font-semibold">{projectCount} project{projectCount > 1 ? 's' : ''}</span>
          </div>
        </MapOverlaySlot>
      )}
    </>
  )
})
