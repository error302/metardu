'use client'
/**
 * MapToolDock — Floating tool dock for the METARDU map
 *
 * Design philosophy:
 * - Map fills 100% of viewport by default (no obstructions)
 * - A thin floating action bar on the left edge shows tool category icons
 * - Clicking a category opens a sliding drawer panel
 * - Only one drawer open at a time
 * - All scattered overlays consolidated into docked panels
 *
 * Categories:
 * 1. Draw/Edit   — Drawing tools + vertex editing
 * 2. Measure     — Distance & area measurement
 * 3. COGO        — Traverse readout + computation tools
 * 4. Stakeout    — GPS stakeout
 * 5. Layers      — Basemap, scheme layers, offline tiles
 * 6. Import/Export — File I/O
 * 7. More        — Bookmarks, GPS track, print, shortcuts
 */

import React, { memo, useState, useCallback } from 'react'
import {
  Pencil, Ruler, Compass, Target,
  Layers, ArrowUpDown, MoreHorizontal,
  X,
  MapPin, PenTool, Hexagon, Circle,
  Undo2, Redo2, Trash2, Edit3,
  Navigation,
  Download, Upload,
  Satellite, Globe, Mountain, Moon,
} from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'
import { CogoInfoPanel } from '@/app/map/components/CogoInfoPanel'
import { CogoToolsPanel } from '@/app/map/components/CogoToolsPanel'
import { BookmarkPanel } from '@/app/map/components/BookmarkPanel'
import { GpsTrackPanel } from '@/app/map/components/GpsTrackPanel'
import { StakeoutPanel } from '@/components/map/StakeoutPanel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DockCategory = 'draw' | 'measure' | 'cogo' | 'stakeout' | 'layers' | 'io' | 'more' | null

interface CategoryDef {
  id: DockCategory
  icon: React.ComponentType<{ className?: string }>
  label: string
}

const CATEGORIES: CategoryDef[] = [
  { id: 'draw', icon: Pencil, label: 'Draw' },
  { id: 'measure', icon: Ruler, label: 'Measure' },
  { id: 'cogo', icon: Compass, label: 'COGO' },
  { id: 'stakeout', icon: Target, label: 'Stakeout' },
  { id: 'layers', icon: Layers, label: 'Layers' },
  { id: 'io', icon: ArrowUpDown, label: 'I/O' },
  { id: 'more', icon: MoreHorizontal, label: 'More' },
]

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold px-1 pt-3 pb-2 first:pt-1">
      {children}
    </div>
  )
}

function ToolBtn({ label, icon, isActive, onClick }: {
  label: string
  icon: React.ReactNode
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`
        flex flex-col items-center justify-center gap-1 rounded-xl transition-all duration-200
        w-[52px] h-[52px] shrink-0
        ${isActive
          ? 'bg-[#E8841A]/10 border border-[#E8841A]/30 text-[#E8841A] shadow-[0_0_12px_rgba(232,132,26,0.15)]'
          : 'bg-white/[0.02] border border-white/[0.06] text-gray-400 hover:bg-white/[0.04] hover:text-gray-300'}
      `}
    >
      <span className="w-5 h-5">{icon}</span>
      <span className="text-[10px] leading-tight font-medium">{label}</span>
    </button>
  )
}

function ActionBtn({ label, icon, isActive, onClick, danger }: {
  label: string
  icon: React.ReactNode
  isActive: boolean
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2.5 w-full px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium
        ${danger && isActive
          ? 'bg-red-500/10 border border-red-500/30 text-red-400'
          : isActive
            ? 'bg-[#E8841A]/10 border border-[#E8841A]/30 text-[#E8841A]'
            : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 border border-transparent'}
      `}
    >
      <span className="w-4 h-4 shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Panel: Draw/Edit
// ---------------------------------------------------------------------------

const DrawPanel = memo(function DrawPanel() {
  const ctx = useMapContext()
  return (
    <div className="space-y-1">
      <SectionLabel>Draw</SectionLabel>
      <div className="grid grid-cols-4 gap-1.5">
        <ToolBtn label="Point" icon={<MapPin className="w-5 h-5" />} isActive={ctx.drawMode === 'Point'} onClick={() => ctx.toggleDraw('Point')} />
        <ToolBtn label="Line" icon={<PenTool className="w-5 h-5" />} isActive={ctx.drawMode === 'LineString'} onClick={() => ctx.toggleDraw('LineString')} />
        <ToolBtn label="Polygon" icon={<Hexagon className="w-5 h-5" />} isActive={ctx.drawMode === 'Polygon'} onClick={() => ctx.toggleDraw('Polygon')} />
        <ToolBtn label="Circle" icon={<Circle className="w-5 h-5" />} isActive={ctx.drawMode === 'Circle'} onClick={() => ctx.toggleDraw('Circle')} />
      </div>
      <SectionLabel>Edit</SectionLabel>
      <ActionBtn label="Modify Vertices" icon={<Edit3 className="w-4 h-4" />} isActive={ctx.editMode} onClick={ctx.toggleEdit} />
      <div className="flex gap-1.5">
        <button onClick={ctx.undo} disabled={!ctx.canUndo} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/[0.06] text-xs font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <Undo2 className="w-3.5 h-3.5" /> Undo
        </button>
        <button onClick={ctx.redo} disabled={!ctx.canRedo} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/[0.06] text-xs font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <Redo2 className="w-3.5 h-3.5" /> Redo
        </button>
      </div>
      <ActionBtn label="Delete Selected" icon={<Trash2 className="w-4 h-4" />} isActive={false} onClick={ctx.deleteSelected} danger />
      {ctx.selectedFeature && (
        <div className="mt-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-semibold">Feature</span>
          <input
            type="text"
            value={ctx.featureName}
            onChange={(e) => ctx.updateFeatureName(e.target.value)}
            placeholder="Feature name..."
            className="w-full h-7 bg-white/[0.04] border border-white/[0.06] rounded-md px-2 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-[#E8841A]/30 transition-colors"
          />
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Panel: Measure
// ---------------------------------------------------------------------------

const MeasurePanel = memo(function MeasurePanel() {
  const { measureMode, measureResult, toggleMeasure } = useMapContext()
  return (
    <div className="space-y-1">
      <SectionLabel>Measurement</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        <ToolBtn label="Distance" icon={<Ruler className="w-5 h-5" />} isActive={measureMode === 'distance'} onClick={() => toggleMeasure(measureMode === 'distance' ? 'none' : 'distance')} />
        <ToolBtn label="Area" icon={<Hexagon className="w-5 h-5" />} isActive={measureMode === 'area'} onClick={() => toggleMeasure(measureMode === 'area' ? 'none' : 'area')} />
      </div>
      {measureResult && (
        <div className="mt-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-semibold">Result</span>
          <p className="text-sm text-white font-mono mt-1">{measureResult}</p>
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Panel: COGO (reuses existing zero-prop context components)
// ---------------------------------------------------------------------------

const CogoPanel = memo(function CogoPanel() {
  return (
    <div className="space-y-1">
      <SectionLabel>COGO Computation</SectionLabel>
      <CogoToolsPanel />
      <SectionLabel>Traverse Readout</SectionLabel>
      <CogoInfoPanel />
    </div>
  )
})

// ---------------------------------------------------------------------------
// Panel: Stakeout
// ---------------------------------------------------------------------------

const StakeoutDockPanel = memo(function StakeoutDockPanel() {
  return (
    <div className="space-y-1">
      <SectionLabel>GPS Stakeout</SectionLabel>
      <StakeoutPanel />
      <p className="text-[10px] text-gray-600 px-1 mt-2">
        Set a target coordinate and navigate to it using GPS. Pro+ feature for field work.
      </p>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Panel: Layers
// ---------------------------------------------------------------------------

const LayersDockPanel = memo(function LayersDockPanel() {
  const { basemap, toggleBasemap, setOfflineDialogOpen } = useMapContext()
  return (
    <div className="space-y-1">
      <SectionLabel>Basemap</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        <ToolBtn label="OSM" icon={<Globe className="w-5 h-5" />} isActive={basemap === 'osm'} onClick={() => toggleBasemap('osm')} />
        <ToolBtn label="Satellite" icon={<Satellite className="w-5 h-5" />} isActive={basemap === 'satellite'} onClick={() => toggleBasemap('satellite')} />
        <ToolBtn label="Dark" icon={<Moon className="w-5 h-5" />} isActive={basemap === 'dark'} onClick={() => toggleBasemap('dark')} />
        <ToolBtn label="Terrain" icon={<Mountain className="w-5 h-5" />} isActive={basemap === 'terrain'} onClick={() => toggleBasemap('terrain')} />
      </div>
      <SectionLabel>Offline</SectionLabel>
      <ActionBtn label="Download Tiles" icon={<Download className="w-4 h-4" />} isActive={false} onClick={() => setOfflineDialogOpen(true)} />
      <SectionLabel>Scheme Layers</SectionLabel>
      <p className="text-[10px] text-gray-600 px-1">
        Use the Scheme Layer panel on the right side of the map to load SoK sheet data.
      </p>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Panel: Import/Export
// ---------------------------------------------------------------------------

const IoPanel = memo(function IoPanel() {
  const { saveToProject, exportFeatures, clearDrawn, featureCount } = useMapContext()
  return (
    <div className="space-y-1">
      <SectionLabel>Import</SectionLabel>
      <p className="text-[10px] text-gray-600 px-1">
        Drag &amp; drop GeoJSON, KML, WKT, DXF, or LandXML files onto the map to import.
      </p>
      <SectionLabel>Export</SectionLabel>
      <ActionBtn label="Save to Project" icon={<Download className="w-4 h-4" />} isActive={false} onClick={saveToProject} />
      <div className="grid grid-cols-3 gap-1 mt-1">
        <button onClick={() => exportFeatures('GeoJSON')} className="px-2 py-1.5 rounded-lg border border-white/[0.06] text-[10px] font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 transition-all">GeoJSON</button>
        <button onClick={() => exportFeatures('KML')} className="px-2 py-1.5 rounded-lg border border-white/[0.06] text-[10px] font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 transition-all">KML</button>
        <button onClick={() => exportFeatures('DXF')} className="px-2 py-1.5 rounded-lg border border-white/[0.06] text-[10px] font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 transition-all">DXF</button>
        <button onClick={() => exportFeatures('WKT')} className="px-2 py-1.5 rounded-lg border border-white/[0.06] text-[10px] font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 transition-all">WKT</button>
        <button onClick={() => exportFeatures('LandXML')} className="col-span-2 px-2 py-1.5 rounded-lg border border-white/[0.06] text-[10px] font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 transition-all">LandXML</button>
      </div>
      {featureCount > 0 && (
        <ActionBtn label={`Clear All (${featureCount})`} icon={<Trash2 className="w-4 h-4" />} isActive={false} onClick={clearDrawn} danger />
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Panel: More (Bookmarks, GPS Track, Print, Shortcuts)
// ---------------------------------------------------------------------------

const MorePanel = memo(function MorePanel() {
  const { gpsTracking, toggleGPS } = useMapContext()
  return (
    <div className="space-y-1">
      <SectionLabel>GPS Track</SectionLabel>
      <ActionBtn
        label={gpsTracking ? 'Stop GPS Track' : 'Start GPS Track'}
        icon={<Navigation className="w-4 h-4" />}
        isActive={gpsTracking}
        onClick={toggleGPS}
      />
      <GpsTrackPanel />
      <SectionLabel>Bookmarks</SectionLabel>
      <BookmarkPanel />
      <SectionLabel>Print</SectionLabel>
      <p className="text-[10px] text-gray-600 px-1">
        Use the print button in the bottom-right corner to generate survey plans.
      </p>
      <SectionLabel>Shortcuts</SectionLabel>
      <p className="text-[10px] text-gray-600 px-1">
        Press <kbd className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-[9px]">?</kbd> to see all keyboard shortcuts.
      </p>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Main: MapToolDock
// ---------------------------------------------------------------------------

export const MapToolDock = memo(function MapToolDock() {
  const [activeCategory, setActiveCategory] = useState<DockCategory>(null)
  const { drawMode, editMode, measureMode, gpsTracking, stakeoutActive, hasTraverse } = useMapContext()

  const toggleCategory = useCallback((cat: DockCategory) => {
    setActiveCategory(prev => prev === cat ? null : cat)
  }, [])

  const isCategoryActive = (cat: DockCategory): boolean => {
    if (activeCategory === cat) return true
    switch (cat) {
      case 'draw': return drawMode !== 'none' || editMode
      case 'measure': return measureMode !== 'none'
      case 'cogo': return hasTraverse
      case 'stakeout': return stakeoutActive
      case 'more': return gpsTracking
      default: return false
    }
  }

  const renderPanel = () => {
    switch (activeCategory) {
      case 'draw': return <DrawPanel />
      case 'measure': return <MeasurePanel />
      case 'cogo': return <CogoPanel />
      case 'stakeout': return <StakeoutDockPanel />
      case 'layers': return <LayersDockPanel />
      case 'io': return <IoPanel />
      case 'more': return <MorePanel />
      default: return null
    }
  }

  return (
    <>
      {/* ── Floating icon bar (left edge, always visible) ── */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon
          const active = isCategoryActive(cat.id)
          const isOpen = activeCategory === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              title={cat.label}
              className={`
                w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 backdrop-blur-xl
                ${isOpen
                  ? 'bg-[#E8841A]/15 border border-[#E8841A]/30 text-[#E8841A] shadow-[0_0_12px_rgba(232,132,26,0.15)]'
                  : active
                    ? 'bg-[#0d0d14]/80 border border-[#E8841A]/20 text-[#E8841A]/70 hover:bg-[#0d0d14]/90'
                    : 'bg-[#0d0d14]/60 border border-white/[0.06] text-gray-500 hover:bg-[#0d0d14]/80 hover:text-gray-300'}
              `}
            >
              <Icon className="w-4 h-4" />
            </button>
          )
        })}
      </div>

      {/* ── Sliding drawer panel (opens next to icon bar) ── */}
      {activeCategory && (
        <div className="absolute top-3 left-14 z-20 w-[260px] sm:w-[280px] max-h-[calc(100%-80px)] bg-[#0d0d14]/95 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-left-2 duration-200">
          {/* Drawer header */}
          <div className="h-10 flex items-center justify-between px-4 shrink-0 border-b border-white/[0.06]">
            <span className="text-xs text-gray-300 font-semibold">
              {CATEGORIES.find(c => c.id === activeCategory)?.label}
            </span>
            <button
              onClick={() => setActiveCategory(null)}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Drawer body */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 custom-scrollbar">
            {renderPanel()}
          </div>
        </div>
      )}
    </>
  )
})
