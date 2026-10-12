'use client'

/**
 * ProjectionSwitcher — Selects a working survey grid; the map stays in 3857.
 *
 * Linked projects always use their saved CRS. On an unlinked map, the user
 * can choose an explicit projected grid for survey calculations.
 * Styled with METARDU dark glassmorphism design tokens.
 */

import { useState, useEffect, useRef, memo } from 'react'
import { Globe, ChevronDown, Check } from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'

interface ProjectionOption {
  code: string
  label: string
  shortLabel: string
  datum: string
}

const PROJECTIONS: ProjectionOption[] = [
  { code: 'EPSG:3857', label: 'No survey grid (map display only)', shortLabel: 'Grid needed', datum: 'Display' },
  { code: 'EPSG:21037', label: 'Arc 1960 / UTM Zone 37S', shortLabel: '21037', datum: 'Arc 1960' },
  { code: 'EPSG:21036', label: 'Arc 1960 / UTM Zone 36S', shortLabel: '21036', datum: 'Arc 1960' },
  { code: 'EPSG:32737', label: 'WGS 84 / UTM Zone 37S', shortLabel: '32737', datum: 'WGS 84' },
  { code: 'EPSG:32736', label: 'WGS 84 / UTM Zone 36S', shortLabel: '32736', datum: 'WGS 84' },
]

export const ProjectionSwitcher = memo(function ProjectionSwitcher() {
  const { activeSurveyCrs, selectSurveyGrid, currentSurveyCrs, schemeProjectId } = useMapContext()
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

  const linkedProject = Boolean(schemeProjectId)
  const selectedCode = linkedProject ? currentSurveyCrs : activeSurveyCrs
  const active = PROJECTIONS.find(p => p.code === selectedCode) ?? {
    code: selectedCode ?? '',
    label: selectedCode ?? (linkedProject ? 'Project CRS required' : 'Survey grid required'),
    shortLabel: selectedCode?.replace(/^EPSG:/, '') ?? (linkedProject ? 'CRS?' : 'Grid?'),
    datum: linkedProject ? 'Saved' : '',
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className={[
          'flex items-center gap-1.5 px-2.5 h-11 sm:h-10 rounded-xl transition-all shadow-lg select-none',
          'bg-[color-mix(in_srgb,var(--bg-secondary)_85%,transparent)] backdrop-blur-xl border',
          'text-xs font-mono text-[var(--text-secondary)]',
          open
            ? 'border-[var(--accent)] text-[var(--accent)]'
            : 'border-[var(--border-color)]/[0.15] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--text-primary)]'
        ].join(' ')}
        title={linkedProject ? `Survey grid: ${active.label}. Set in project reference system.` : `Survey grid: ${active.label}`}
        aria-label={`Survey grid: ${active.label}`}
      >
        <Globe className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        <span className="font-semibold text-[11px]">{active.shortLabel}</span>
        <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180 text-[var(--accent)]' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-[#0d0d0d]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl z-[1200] min-w-[240px] py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1.5 text-[10px] text-zinc-400 uppercase tracking-wider font-semibold border-b border-white/10 flex items-center justify-between">
            <span>{linkedProject ? 'Project survey grid' : 'Survey calculation grid'}</span>
            <span className="text-[9px] text-[var(--accent)] font-mono">EPSG</span>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {PROJECTIONS.map(p => {
              const isSelected = p.code === selectedCode
              return (
                <button
                  key={p.code}
                  disabled={linkedProject}
                  onClick={() => {
                    selectSurveyGrid(p.code)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                    isSelected
                      ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-semibold border-l-2 border-[var(--accent)]'
                      : 'text-zinc-200 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div>
                    <div className="font-mono font-medium flex items-center gap-1.5">
                      <span>{p.code}</span>
                      <span className="text-[9px] text-zinc-400 font-sans px-1.5 py-0.2 rounded bg-white/10">{p.datum}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5 font-sans">
                      {p.label}
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 ml-2" />
                  )}
                </button>
              )
            })}
          </div>
          <div className="px-3 py-1.5 border-t border-white/10 text-[9px] text-zinc-500 flex items-center gap-1">
            <span>{linkedProject
              ? 'Set the project CRS in its reference system settings. Map display stays EPSG:3857.'
              : 'Sets the survey calculation grid. Map display stays EPSG:3857.'}</span>
          </div>
        </div>
      )}
    </div>
  )
})
