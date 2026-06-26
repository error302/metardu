'use client'
/**
 * SchemeLayerPanel — Floating panel for scheme data layer controls
 *
 * Provides:
 *  - Load Scheme button (fetches from API)
 *  - Toggle switches for parcel / block / beacon layers
 *  - Parcel / block / beacon counts
 *  - Loading spinner during fetch
 *  - Error state with retry
 *  - Zoom-to-scheme button
 *  - Create Parcel from Traverse button (when traverse is computed)
 *  - Traverse-to-parcel preview/confirm/cancel workflow
 *
 * Positioned at the top-right of the map, styled to match the
 * existing dark glass-morphism UI (bg-[#14141e]/95, #E8841A accents).
 */

import React, { memo, useCallback, useState } from 'react'

export interface SchemeLayerPanelProps {
  /** Whether a project ID is available for loading scheme data */
  hasProjectId: boolean
  /** Project name (for display) */
  projectName?: string
  /** Loading state */
  loading: boolean
  /** Error message (empty = no error) */
  error: string
  /** Whether scheme data is currently loaded */
  loaded: boolean
  /** Feature counts */
  parcelCount: number
  blockCount: number
  beaconCount: number
  /** Layer visibility toggles */
  showParcels: boolean
  showBlocks: boolean
  showBeacons: boolean
  /** Whether a traverse has been computed for the project */
  hasTraverse?: boolean
  /** Traverse-to-parcel workflow state */
  traverseParcelPreviewActive?: boolean
  /** Handlers */
  onLoadScheme: () => void
  onRetry: () => void
  onToggleParcels: () => void
  onToggleBlocks: () => void
  onToggleBeacons: () => void
  onZoomToScheme: () => void
  onRemoveScheme: () => void
  /** Traverse-to-parcel handlers */
  onCreateParcelFromTraverse?: () => void
  onConfirmTraverseParcel?: () => void
  onCancelTraverseParcel?: () => void
}

export const SchemeLayerPanel = memo(function SchemeLayerPanel({
  hasProjectId,
  projectName,
  loading,
  error,
  loaded,
  parcelCount,
  blockCount,
  beaconCount,
  showParcels,
  showBlocks,
  showBeacons,
  hasTraverse,
  traverseParcelPreviewActive,
  onLoadScheme,
  onRetry,
  onToggleParcels,
  onToggleBlocks,
  onToggleBeacons,
  onZoomToScheme,
  onRemoveScheme,
  onCreateParcelFromTraverse,
  onConfirmTraverseParcel,
  onCancelTraverseParcel,
}: SchemeLayerPanelProps) {
  const [showTraverseWorkflow, setShowTraverseWorkflow] = useState(false)

  if (!hasProjectId) return null

  return (
    <div
      className="absolute top-3 right-3 z-20 sm:top-4 sm:right-4 max-w-[260px]"
      role="region"
      aria-label="Scheme layer controls"
    >
      <div className="bg-[#14141e]/95 border border-white/[0.08] rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#E8841A]" />
            <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
              Scheme Data
            </span>
          </div>
          {projectName && (
            <span className="text-[10px] text-gray-500 truncate max-w-[120px]">
              {projectName}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-3 py-2.5 space-y-2.5">
          {/* Load / Loading / Error State */}
          {!loaded && !loading && !error && (
            <button
              onClick={onLoadScheme}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                         bg-[#E8841A]/15 border border-[#E8841A]/30 text-[#E8841A]
                         text-xs font-semibold transition-all duration-200
                         hover:bg-[#E8841A]/25 hover:border-[#E8841A]/50
                         focus:outline-none focus:ring-1 focus:ring-[#E8841A]/50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Load Scheme
            </button>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-3">
              <svg className="animate-spin h-4 w-4 text-[#E8841A]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs text-gray-400">Loading scheme data...</span>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="space-y-2">
              <div className="text-[11px] text-red-400 bg-red-500/10 rounded-lg px-2.5 py-1.5 border border-red-500/20">
                {error}
              </div>
              <button
                onClick={onRetry}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg
                           bg-white/[0.04] border border-white/[0.08] text-gray-400
                           text-[11px] font-medium transition-all duration-200
                           hover:bg-white/[0.08] hover:text-gray-300
                           focus:outline-none focus:ring-1 focus:ring-white/20"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry
              </button>
            </div>
          )}

          {/* Layer Toggles (only when loaded) */}
          {loaded && (
            <>
              <div className="space-y-1.5">
                {/* Parcels toggle */}
                <LayerToggle
                  label="Parcels"
                  count={parcelCount}
                  active={showParcels}
                  color="#006600"
                  onToggle={onToggleParcels}
                />
                {/* Blocks toggle */}
                <LayerToggle
                  label="Blocks"
                  count={blockCount}
                  active={showBlocks}
                  color="#E8841A"
                  onToggle={onToggleBlocks}
                />
                {/* Beacons toggle */}
                <LayerToggle
                  label="Beacons"
                  count={beaconCount}
                  active={showBeacons}
                  color="#FFD700"
                  onToggle={onToggleBeacons}
                />
              </div>

              {/* Traverse-to-Parcel Workflow */}
              {hasTraverse && !traverseParcelPreviewActive && onCreateParcelFromTraverse && (
                <div className="pt-1 border-t border-white/[0.06]">
                  <button
                    onClick={() => {
                      setShowTraverseWorkflow(true)
                      onCreateParcelFromTraverse()
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                               bg-green-500/10 border border-green-500/25 text-green-400
                               text-xs font-semibold transition-all duration-200
                               hover:bg-green-500/20 hover:border-green-500/40
                               focus:outline-none focus:ring-1 focus:ring-green-500/40"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                    </svg>
                    Create Parcel from Traverse
                  </button>
                </div>
              )}

              {/* Traverse preview confirm/cancel */}
              {traverseParcelPreviewActive && (
                <div className="pt-1 border-t border-white/[0.06] space-y-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] text-green-400 uppercase tracking-wider font-semibold">
                      Traverse Preview
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    The traverse stations are shown as a polygon preview. Confirm to save as a parcel boundary.
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={onConfirmTraverseParcel}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg
                                 bg-green-500/20 border border-green-500/30 text-green-400
                                 text-[11px] font-semibold transition-all duration-200
                                 hover:bg-green-500/30 hover:text-green-300
                                 focus:outline-none focus:ring-1 focus:ring-green-500/30"
                      title="Save traverse as parcel boundary"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Confirm
                    </button>
                    <button
                      onClick={onCancelTraverseParcel}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg
                                 bg-red-500/10 border border-red-500/20 text-red-400
                                 text-[11px] font-medium transition-all duration-200
                                 hover:bg-red-500/20 hover:text-red-300
                                 focus:outline-none focus:ring-1 focus:ring-red-500/30"
                      title="Cancel — remove preview"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onZoomToScheme}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg
                             bg-white/[0.04] border border-white/[0.08] text-gray-400
                             text-[11px] font-medium transition-all duration-200
                             hover:bg-white/[0.08] hover:text-gray-300
                             focus:outline-none focus:ring-1 focus:ring-white/20"
                  title="Zoom to scheme extent"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                  Zoom
                </button>
                <button
                  onClick={onRemoveScheme}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg
                             bg-red-500/10 border border-red-500/20 text-red-400
                             text-[11px] font-medium transition-all duration-200
                             hover:bg-red-500/20 hover:text-red-300
                             focus:outline-none focus:ring-1 focus:ring-red-500/30"
                  title="Remove scheme layers"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Remove
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
})

// ── Sub-component: Layer Toggle ─────────────────────────────────────────

function LayerToggle({
  label,
  count,
  active,
  color,
  onToggle,
}: {
  label: string
  count: number
  active: boolean
  color: string
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`
        w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all duration-200
        ${active
          ? 'bg-white/[0.06] border border-white/[0.10]'
          : 'bg-transparent border border-transparent opacity-50'}
        focus:outline-none focus:ring-1 focus:ring-white/20
      `}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-sm transition-opacity duration-200"
          style={{ backgroundColor: color, opacity: active ? 1 : 0.3 }}
        />
        <span className={`text-[11px] font-medium ${active ? 'text-gray-200' : 'text-gray-500'}`}>
          {label}
        </span>
      </div>
      <span className="text-[10px] text-gray-500 tabular-nums">
        {count}
      </span>
    </button>
  )
}
