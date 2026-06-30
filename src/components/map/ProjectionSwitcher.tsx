'use client'

/**
 * ProjectionSwitcher — Compact dropdown for switching the map projection
 *
 * Allows surveyors to switch between Web Mercator (EPSG:3857) and
 * Kenya-specific Arc 1960 / WGS84 UTM projections.
 * Uses nativeProjectionView.ts for the actual projection switching.
 *
 * Now consumes activeProjection and switchProjection from MapReactContext.
 */

import { useState, useEffect, useRef, memo } from 'react'
import { Globe, ChevronDown } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'

interface ProjectionOption {
  code: string
  label: string
  shortLabel: string
}

const PROJECTIONS: ProjectionOption[] = [
  { code: 'EPSG:3857', label: 'Web Mercator (default)', shortLabel: '3857' },
  { code: 'EPSG:21037', label: 'Arc 1960 / UTM 37S', shortLabel: '21037' },
  { code: 'EPSG:21036', label: 'Arc 1960 / UTM 36S', shortLabel: '21036' },
  { code: 'EPSG:32736', label: 'WGS 84 / UTM 36S', shortLabel: '32736' },
]

export const ProjectionSwitcher = memo(function ProjectionSwitcher() {
  const { activeProjection, switchProjection } = useMapContext()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const active = PROJECTIONS.find(p => p.code === activeProjection) ?? PROJECTIONS[0]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg shadow-lg border border-gray-200 text-xs font-medium text-gray-700 hover:border-[#1B3A5C] hover:text-[#1B3A5C] transition-colors"
        title={`Map projection: ${active.label}`}
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{active.shortLabel}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[200px] py-1">
          <div className="px-3 py-1.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold border-b border-gray-100">
            Projection
          </div>
          {PROJECTIONS.map(p => (
            <button
              key={p.code}
              onClick={() => {
                switchProjection(p.code)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                p.code === activeProjection
                  ? 'bg-[#1B3A5C] text-white'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="font-medium">{p.shortLabel}</div>
              <div className={`text-[10px] ${p.code === activeProjection ? 'text-white/70' : 'text-gray-400'}`}>
                {p.label}
              </div>
            </button>
          ))}
          <div className="px-3 py-1.5 border-t border-gray-100 text-[9px] text-gray-400">
            Switches map CRS — tiles may re-render
          </div>
        </div>
      )}
    </div>
  )
})
