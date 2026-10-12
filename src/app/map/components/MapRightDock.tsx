'use client'

/**
 * MapRightDock — Unified, collapsible right-side map tools dock
 *
 * Consolidates all floating right-side controls into a single, clean,
 * collapsible workstation dock:
 * - Collapse/Expand toggle button (clean map view on demand)
 * - Zoom In & Zoom Out controls (with Lucide icons)
 * - Repositioned Projection Switcher (never overlaps or sits behind anything)
 * - Interactive Unified North Arrow & Compass (click-to-reset, true north)
 * - Map Print & Layout Button
 *
 * Matches METARDU dark glassmorphic design language.
 */

import React, { useState, useCallback, memo } from 'react'
import { Plus, Minus, ChevronRight, ChevronLeft } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'
import { ProjectionSwitcher } from '@/components/map/ProjectionSwitcher'
import { NorthArrowOverlay } from '@/app/map/components/NorthArrowOverlay'
import { MapPrintButton } from '@/app/map/components/MapPrintButton'

export const MapRightDock = memo(function MapRightDock() {
  const { mapInstance, isMobile } = useMapContext()
  const [collapsed, setCollapsed] = useState(false)

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    const view = mapInstance.current?.getView()
    if (!view) return
    view.animate({ zoom: (view.getZoom() ?? 0) + 1, duration: 200 })
  }, [mapInstance])

  const handleZoomOut = useCallback(() => {
    const view = mapInstance.current?.getView()
    if (!view) return
    view.animate({ zoom: Math.max(6, (view.getZoom() ?? 0) - 1), duration: 200 })
  }, [mapInstance])

  return (
    <div
      className={`absolute z-30 transition-all duration-300 ease-in-out flex flex-col items-end gap-2 select-none ${
        isMobile ? 'top-3 right-2' : 'top-4 right-4'
      }`}
      role="region"
      aria-label="Map tools dock"
    >
      {/* Collapse / Expand Toggle Button */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className={[
          'flex items-center justify-center rounded-xl transition-all shadow-lg',
          'bg-[color-mix(in_srgb,var(--bg-secondary)_85%,transparent)] backdrop-blur-xl border border-[var(--border-color)]/[0.15]',
          'text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]',
          collapsed ? 'min-h-11 px-2.5 py-1.5 gap-1 text-xs font-medium' : 'w-11 h-11 sm:w-10 sm:h-10'
        ].join(' ')}
        title={collapsed ? 'Expand map tools' : 'Collapse map tools for clean view'}
        aria-label={collapsed ? 'Expand map tools' : 'Collapse map tools'}
      >
        {collapsed ? (
          <>
            <ChevronLeft className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="text-[11px] font-mono text-[var(--text-primary)]">Tools</span>
          </>
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>

      {/* Dock Content (when expanded) */}
      {!collapsed && (
        <div className="flex flex-col items-end gap-2 animate-in fade-in slide-in-from-right-3 duration-200">
          {/* Zoom Controls */}
          <div
            className="flex flex-col rounded-xl overflow-hidden bg-[color-mix(in_srgb,var(--bg-secondary)_85%,transparent)] backdrop-blur-xl border border-[var(--border-color)]/[0.15] shadow-lg"
            role="group"
            aria-label="Map zoom controls"
          >
            <button
              onClick={handleZoomIn}
              className="w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-colors"
              title="Zoom In (+)"
              aria-label="Zoom in"
            >
              <Plus className="w-4 h-4" />
            </button>
            <div className="h-px bg-[var(--border-color)]/[0.15] w-full" />
            <button
              onClick={handleZoomOut}
              className="w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] transition-colors"
              title="Zoom Out (−)"
              aria-label="Zoom out"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>

          {/* Projection Switcher (Dedicated slot — never behind anything!) */}
          <ProjectionSwitcher />

          {/* Unified Interactive North Arrow & Compass (One compass that resets north on click) */}
          <NorthArrowOverlay mapInstance={mapInstance} />

          {/* Map Print / Sheet Layout Button */}
          <MapPrintButton />
        </div>
      )}
    </div>
  )
})
