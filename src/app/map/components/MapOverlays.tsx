'use client'
/**
 * MapOverlays — Floating map UI overlays (zoom controls, GPS badge, stakeout HUD, project count)
 *
 * Memoized to prevent re-renders from unrelated state changes.
 * All overlays are absolutely positioned within the map container.
 * Mobile-responsive: adjusts sizes and positions for small screens.
 */

import React, { memo } from 'react'

interface MapOverlaysProps {
  mapInstance: React.MutableRefObject<any>
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void
  gpsTracking: boolean
  gpsPos: { lon: number; lat: number; accuracy: number } | null
  stakeoutActive: boolean
  stakeoutTarget: { e: number; n: number } | null
  stakeoutInfo: () => { distance: number; bearing: number; dE: number; dN: number } | null
  toggleStakeout: () => void
  toggleGPS: () => void
  projectCount: number
  isMobile: boolean
}

export const MapOverlays = memo(function MapOverlays({
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
}: MapOverlaysProps) {
  return (
    <>
      {/* Hamburger toggle when panel is open */}
      {panelOpen && (
        <button
          onClick={() => setPanelOpen(false)}
          className="absolute top-3 z-30 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          style={{ left: isMobile ? '0px' : '260px' }}
          title="Collapse panel"
        >
          <span className="text-sm">{'\u2039'}</span>
        </button>
      )}

      {/* Zoom controls - top right */}
      <div className="fixed top-[16px] right-[16px] z-[1000] flex flex-col gap-1">
        <button
          onClick={() => mapInstance.current?.getView().animate({ zoom: mapInstance.current.getView().getZoom() + 1 }, { duration: 200 })}
          className="w-10 h-10 bg-[#14141e]/90 backdrop-blur-sm border border-[var(--border-color)] rounded-lg text-white flex items-center justify-center hover:bg-[#E8841A]/20 transition-colors"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={() => mapInstance.current?.getView().animate({ zoom: Math.max(6, mapInstance.current.getView().getZoom() - 1) }, { duration: 200 })}
          className="w-10 h-10 bg-[#14141e]/90 backdrop-blur-sm border border-[var(--border-color)] rounded-lg text-white flex items-center justify-center hover:bg-[#E8841A]/20 transition-colors"
          title="Zoom Out"
        >
          {'\u2212'}
        </button>
      </div>

      {/* GPS status badge - bottom left */}
      {gpsTracking && gpsPos && (
        <div
          className="fixed z-[1000] bg-[#14141e]/90 backdrop-blur-sm border border-green-500/30 rounded-lg px-3 py-1.5 text-xs text-green-400 font-mono"
          style={{ bottom: `calc(${isMobile ? '64px' : '0px'} + 56px)`, left: '16px' }}
        >
          GPS {'\u00B1'}{Math.round(gpsPos.accuracy)}m
        </div>
      )}

      {/* Stakeout HUD */}
      {stakeoutActive && stakeoutTarget && (() => {
        const info = stakeoutInfo()
        return (
          <div
            className="fixed z-[1000] bg-[#14141e]/95 backdrop-blur-xl border border-[#E8841A]/30 rounded-xl px-4 py-3 shadow-2xl"
            style={{ bottom: `calc(${isMobile ? '64px' : '0px'} + 56px)`, right: '16px', width: isMobile ? '180px' : '220px' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-[#E8841A] uppercase tracking-[0.15em] font-bold">Stakeout</span>
              <button onClick={toggleStakeout} className="text-[10px] text-gray-500 hover:text-white transition-colors">Stop</button>
            </div>
            <div className="text-[10px] text-gray-500 mb-1">Target</div>
            <div className="text-[11px] text-white font-mono mb-2">E: {stakeoutTarget.e.toFixed(1)} N: {stakeoutTarget.n.toFixed(1)}</div>
            {info ? (
              <>
                <div className="text-[10px] text-gray-500 mb-1">Distance / Bearing</div>
                <div className="text-lg font-bold text-[#E8841A] font-mono">{info.distance.toFixed(1)} m</div>
                <div className="text-sm text-blue-300 font-mono">{info.bearing.toFixed(2)}{'\u00B0'}</div>
                <div className="mt-1.5 text-[10px] text-gray-600">
                  dE: {info.dE.toFixed(1)} | dN: {info.dN.toFixed(1)}
                </div>
              </>
            ) : (
              <div className="text-[10px] text-gray-600">Waiting for GPS position...</div>
            )}
            {!gpsTracking && (
              <button
                onClick={toggleGPS}
                className="mt-2 w-full py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-[10px] font-medium hover:bg-green-500/30 transition-colors"
              >
                Enable GPS
              </button>
            )}
          </div>
        )
      })()}

      {/* Project count - top center */}
      {projectCount > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
          <div className="bg-[#0d0d14]/90 backdrop-blur-xl border border-white/[0.06] rounded-full px-3 py-1 shadow-lg">
            <span className="text-[11px] text-[#E8841A] font-semibold">{projectCount} project{projectCount > 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </>
  )
})
