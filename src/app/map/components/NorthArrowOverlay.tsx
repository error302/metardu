'use client'

import React, { useEffect, useState, useCallback, memo } from 'react'
import type Map from 'ol/Map'
import { useMapContext } from '@/app/map/MapReactContext'

/**
 * NorthArrowOverlay — Unified interactive North Arrow & Compass Control
 *
 * Combines orientation visualization with click-to-reset:
 * - Always points to True North, rotating in sync with the map
 * - When map is rotated, displays rotation degrees badge and glowing accent
 * - Clicking the control resets the map rotation smoothly back to 0° (North)
 * - Conforms to METARDU dark theme tokens
 */

interface NorthArrowOverlayProps {
  /** Ref to the OpenLayers map instance */
  mapInstance: React.MutableRefObject<Map | null>
}

export const NorthArrowOverlay = memo(function NorthArrowOverlay({ mapInstance }: NorthArrowOverlayProps) {
  const { mapReady } = useMapContext()
  const [rotation, setRotation] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (!mapReady) { setMounted(false); return }
    const map = mapInstance.current
    if (!map) return

    const view = map.getView()
    if (!view) return

    setRotation((view.getRotation() * 180) / Math.PI)
    setMounted(true)

    const onRotate = () => {
      setRotation((view.getRotation() * 180) / Math.PI)
    }
    view.on('change:rotation', onRotate)
    return () => {
      view.un('change:rotation', onRotate)
    }
  }, [mapInstance, mapReady])

  const isRotated = Math.abs(rotation) > 0.5
  const rotationDeg = Math.round(rotation)

  const handleResetNorth = useCallback(() => {
    const map = mapInstance.current
    if (!map) return
    const view = map.getView()
    if (!view) return

    view.animate({
      rotation: 0,
      duration: 300,
    })
  }, [mapInstance])

  if (!mounted) return null

  return (
    <button
      onClick={handleResetNorth}
      disabled={!isRotated}
      className={[
        'relative w-11 h-11 sm:w-10 sm:h-10 rounded-xl flex flex-col items-center justify-center transition-all shadow-lg select-none',
        'bg-[color-mix(in_srgb,var(--bg-secondary)_85%,transparent)] backdrop-blur-xl border',
        isRotated
          ? 'border-[var(--accent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] cursor-pointer'
          : 'border-[var(--border-color)]/[0.15] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] cursor-default',
      ].join(' ')}
      title={isRotated ? `Reset North (rotated ${rotationDeg}°)` : 'True North (0°)'}
      aria-label={isRotated ? `Reset North, rotated ${rotationDeg} degrees` : 'True North'}
    >
      <div
        style={{
          transform: `rotate(${-rotation}deg)`,
          transition: 'transform 100ms linear',
          transformOrigin: 'center center',
        }}
        className="flex flex-col items-center"
      >
        <svg width="20" height="26" viewBox="0 0 20 26" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* N label */}
          <text x="10" y="5" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="currentColor" fontFamily="JetBrains Mono, monospace">
            N
          </text>
          {/* Arrow head */}
          <polygon points="10,6.5 6.5,14 10,12 13.5,14" fill="currentColor" />
          {/* Shaft */}
          <line x1="10" y1="12" x2="10" y2="23" stroke="currentColor" strokeWidth="1.5" />
          {/* Tail */}
          <polygon points="10,25 7.5,21 10,22 12.5,21" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
        </svg>
      </div>

      {isRotated && (
        <span className="absolute -top-1 -right-1 bg-[var(--accent)] text-black text-[8px] font-bold font-mono px-1 py-0.2 rounded-full leading-tight shadow">
          {rotationDeg}°
        </span>
      )}
    </button>
  )
})
