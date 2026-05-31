'use client'
/**
 * MapToolbar — The left sidebar panel with draw, edit, measure, layers, actions
 *
 * Memoized to prevent re-renders when parent state changes that don't affect
 * the toolbar. Receives all needed data via props.
 */

import React, { memo } from 'react'
import {
  MapPinIcon, PencilIcon, HexagonIcon, CircleIcon,
  GlobeIcon, CrosshairIcon, SatelliteIcon, MapIcon,
  TrashIcon, BoltIcon, CompassIcon, RulerIcon,
  EditIcon, UndoIcon, RedoIcon,
  TargetIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon,
  LocationDotIcon,
  MoonIcon, TerrainIcon, GridIcon, OpacityIcon,
} from '@/components/map/PremiumIcons'
import { Search as SearchIcon } from 'lucide-react'
import type { BasemapMode, DrawMode, MeasureMode } from '@/app/map/mapTypes'

// ── Helper sub-components ──

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold px-1 pt-4 pb-2">
      {label}
    </div>
  )
}

function ToolButton({
  label,
  icon,
  isActive,
  onClick,
  title,
}: {
  label: string
  icon: React.ReactNode
  isActive: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title || label}
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

function ActionButton({
  label,
  icon,
  isActive,
  onClick,
  isDanger = false,
}: {
  label: string
  icon: React.ReactNode
  isActive: boolean
  onClick: () => void
  isDanger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2.5 w-full px-3 py-2 rounded-lg transition-all duration-200 text-xs font-medium
        ${isDanger && isActive
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

// ── Feature Properties ──

function FeatureProperties({
  featureName,
  selectedFeature,
  onUpdateName,
}: {
  featureName: string
  selectedFeature: any
  onUpdateName: (name: string) => void
}) {
  if (!selectedFeature) return null

  const geom = selectedFeature.getGeometry()
  const type = geom?.getType()

  let details: string[] = []
  if (type === 'Point') {
    const c = geom.getCoordinates()
    if (c) details.push(`Coords: ${c[0].toFixed(1)}, ${c[1].toFixed(1)}`)
  } else if (type === 'LineString') {
    const coords = geom.getCoordinates()
    details.push(`Vertices: ${coords?.length || 0}`)
    const len = geom.getLength()
    details.push(len > 1000 ? `Length: ${(len/1000).toFixed(3)} km` : `Length: ${len.toFixed(2)} m`)
  } else if (type === 'Polygon') {
    const coords = geom.getCoordinates()
    const ring = coords?.[0] || []
    details.push(`Vertices: ${(ring?.length || 1) - 1}`)
    const area = geom.getArea()
    details.push(area > 10000 ? `Area: ${(area/10000).toFixed(4)} ha` : `Area: ${area.toFixed(2)} m\u00B2`)
    const peri = ring.reduce((acc: number, _: any, i: number) => {
      if (i === 0) return acc
      const dx = ring[i][0] - ring[i-1][0]
      const dy = ring[i][1] - ring[i-1][1]
      return acc + Math.sqrt(dx*dx + dy*dy)
    }, 0)
    details.push(peri > 1000 ? `Perimeter: ${(peri/1000).toFixed(3)} km` : `Perimeter: ${peri.toFixed(2)} m`)
  } else if (type === 'Circle') {
    const r = geom.getRadius()
    details.push(`Radius: ${r.toFixed(2)} m`)
    const cArea = Math.PI * r * r
    details.push(cArea > 10000 ? `Area: ${(cArea/10000).toFixed(4)} ha` : `Area: ${cArea.toFixed(2)} m\u00B2`)
  }

  return (
    <div className="mt-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-2">
      <span className="text-[10px] text-gray-500 uppercase tracking-[0.15em] font-semibold">Feature Properties</span>
      <input
        type="text"
        value={featureName}
        onChange={(e) => onUpdateName(e.target.value)}
        placeholder="Feature name..."
        className="w-full h-7 bg-white/[0.04] border border-white/[0.06] rounded-md px-2 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-[#E8841A]/30 transition-colors"
      />
      <div className="text-[10px] text-gray-600 space-y-0.5">
        <div>Type: {type || 'unknown'}</div>
        {details.map((d, i) => <div key={i}>{d}</div>)}
      </div>
    </div>
  )
}

// ── Main component props ──

interface MapToolbarProps {
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void
  drawMode: DrawMode
  editMode: boolean
  measureMode: MeasureMode
  showAnnotations: boolean
  basemap: BasemapMode
  layerOpacity: number
  gpsTracking: boolean
  stakeoutActive: boolean
  featureCount: number
  featureName: string
  selectedFeature: any
  projectCount: number
  projectSearch: string
  setProjectSearch: (v: string) => void
  measureResult: string
  hasFeature: (feature: string) => boolean
  canUndo: boolean
  canRedo: boolean
  onToggleDraw: (mode: DrawMode) => void
  onToggleEdit: () => void
  onUndo: () => void
  onRedo: () => void
  onDeleteSelected: () => void
  onToggleMeasure: (mode: MeasureMode) => void
  onToggleAnnotations: () => void
  onToggleBasemap: (mode: BasemapMode) => void
  onOpacityChange: (val: number) => void
  onFitToKenya: () => void
  onFitToDrawn: () => void
  onToggleGPS: () => void
  onToggleStakeout: () => void
  onToggleOfflineDialog: () => void
  onSaveToProject: () => void
  onExportFeatures: (format: 'GeoJSON' | 'KML' | 'WKT' | 'DXF' | 'LandXML') => void
  onClearDrawn: () => void
  onUpdateFeatureName: (name: string) => void
}

export const MapToolbar = memo(function MapToolbar({
  panelOpen,
  setPanelOpen,
  drawMode,
  editMode,
  measureMode,
  showAnnotations,
  basemap,
  layerOpacity,
  gpsTracking,
  stakeoutActive,
  featureCount,
  featureName,
  selectedFeature,
  projectCount,
  projectSearch,
  setProjectSearch,
  measureResult,
  hasFeature,
  canUndo,
  canRedo,
  onToggleDraw,
  onToggleEdit,
  onUndo,
  onRedo,
  onDeleteSelected,
  onToggleMeasure,
  onToggleAnnotations,
  onToggleBasemap,
  onOpacityChange,
  onFitToKenya,
  onFitToDrawn,
  onToggleGPS,
  onToggleStakeout,
  onToggleOfflineDialog,
  onSaveToProject,
  onExportFeatures,
  onClearDrawn,
  onUpdateFeatureName,
}: MapToolbarProps) {
  return (
    <>
      {/* Collapsed icon strip */}
      {!panelOpen && (
        <div className="absolute top-0 left-0 bottom-0 z-10 flex flex-col items-center pt-2 gap-1 w-12 bg-[#0d0d14]/95 backdrop-blur-xl border-r border-white/[0.06] transition-all duration-300 ease-out">
          <button
            onClick={() => setPanelOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors mb-2"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
          {(['Point', 'LineString', 'Polygon', 'Circle'] as DrawMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => onToggleDraw(mode)}
              title={`Draw ${mode === 'LineString' ? 'Line' : mode}`}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 ${
                drawMode === mode
                  ? 'bg-[#E8841A]/10 text-[#E8841A] shadow-[0_0_12px_rgba(232,132,26,0.15)]'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
              }`}
            >
              {mode === 'Point' && <MapPinIcon className="w-4 h-4" active={drawMode === mode} />}
              {mode === 'LineString' && <PencilIcon className="w-4 h-4" active={drawMode === mode} />}
              {mode === 'Polygon' && <HexagonIcon className="w-4 h-4" active={drawMode === mode} />}
              {mode === 'Circle' && <CircleIcon className="w-4 h-4" active={drawMode === mode} />}
            </button>
          ))}
          <div className="w-6 h-px bg-white/[0.06] my-1" />
          <button
            onClick={onToggleEdit}
            title="Modify features"
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 ${
              editMode
                ? 'bg-[#E8841A]/10 text-[#E8841A] shadow-[0_0_12px_rgba(232,132,26,0.15)]'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
            }`}
          >
            <EditIcon className="w-4 h-4" active={editMode} />
          </button>
        </div>
      )}

      {/* Expanded panel */}
      {panelOpen && (
        <div className="absolute top-0 left-0 bottom-0 z-10 w-[280px] bg-[#0d0d14]/95 backdrop-blur-xl border-r border-white/[0.06] flex flex-col transition-all duration-300 ease-out overflow-hidden">
          {/* Panel header */}
          <div className="h-11 flex items-center justify-between px-3 shrink-0 border-b border-white/[0.06]">
            <span className="text-xs text-gray-400 font-medium">Tools</span>
            <button
              onClick={() => setPanelOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Scrollable panel body */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 custom-scrollbar">
            {/* DRAW */}
            <SectionHeader label="Draw" />
            <div className="grid grid-cols-4 gap-1.5">
              <ToolButton label="Point" icon={<MapPinIcon className="w-5 h-5" active={drawMode === 'Point'} />} isActive={drawMode === 'Point'} onClick={() => onToggleDraw('Point')} title="Draw Point" />
              <ToolButton label="Line" icon={<PencilIcon className="w-5 h-5" active={drawMode === 'LineString'} />} isActive={drawMode === 'LineString'} onClick={() => onToggleDraw('LineString')} title="Draw Line" />
              <ToolButton label="Polygon" icon={<HexagonIcon className="w-5 h-5" active={drawMode === 'Polygon'} />} isActive={drawMode === 'Polygon'} onClick={() => onToggleDraw('Polygon')} title="Draw Polygon" />
              <ToolButton label="Circle" icon={<CircleIcon className="w-5 h-5" active={drawMode === 'Circle'} />} isActive={drawMode === 'Circle'} onClick={() => onToggleDraw('Circle')} title="Draw Circle" />
            </div>

            {/* EDIT */}
            <SectionHeader label="Edit" />
            <div className="space-y-1">
              <ActionButton label="Modify Vertices" icon={<EditIcon className="w-4 h-4" active={editMode} />} isActive={editMode} onClick={onToggleEdit} />
              <div className="flex gap-1.5">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/[0.06] text-xs font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <UndoIcon className="w-3.5 h-3.5" />
                  <span>Undo</span>
                </button>
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/[0.06] text-xs font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <RedoIcon className="w-3.5 h-3.5" />
                  <span>Redo</span>
                </button>
              </div>
              <ActionButton label="Delete Selected" icon={<TrashIcon className="w-4 h-4" active={false} />} isActive={false} onClick={onDeleteSelected} isDanger />
            </div>

            {/* Feature properties */}
            <FeatureProperties
              featureName={featureName}
              selectedFeature={selectedFeature}
              onUpdateName={onUpdateFeatureName}
            />

            {/* MEASURE */}
            <SectionHeader label="Measure" />
            <div className="space-y-1">
              <ActionButton label="Distance" icon={<RulerIcon className="w-4 h-4" active={measureMode === 'distance'} />} isActive={measureMode === 'distance'} onClick={() => onToggleMeasure('distance')} />
              <ActionButton label="Area" icon={<GridIcon className="w-4 h-4" active={measureMode === 'area'} />} isActive={measureMode === 'area'} onClick={() => onToggleMeasure('area')} />
              <ActionButton label="Bearings" icon={<CompassIcon className="w-4 h-4" active={showAnnotations} />} isActive={showAnnotations} onClick={onToggleAnnotations} />
            </div>
            {measureResult && (
              <div className="mt-1.5 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <span className="text-[11px] text-blue-300 font-mono font-medium">{measureResult}</span>
              </div>
            )}
            {measureMode !== 'none' && !measureResult && (
              <div className="mt-1.5 px-3 py-1.5 text-[10px] text-blue-400/70">
                {measureMode === 'distance' ? 'Click two or more points to measure distance. Double-click to finish.' : 'Click three or more points to measure area. Double-click to finish.'}
              </div>
            )}

            {/* LAYERS */}
            <SectionHeader label="Layers" />
            <div className="grid grid-cols-4 gap-1.5">
              <ToolButton label="OSM" icon={<MapIcon className="w-5 h-5" active={basemap === 'osm'} />} isActive={basemap === 'osm'} onClick={() => onToggleBasemap('osm')} title="OpenStreetMap" />
              <ToolButton label="Satellite" icon={<SatelliteIcon className="w-5 h-5" active={basemap === 'satellite'} />} isActive={basemap === 'satellite'} onClick={() => onToggleBasemap('satellite')} title="Satellite Imagery" />
              <ToolButton label="Dark" icon={<MoonIcon className="w-5 h-5" active={basemap === 'dark'} />} isActive={basemap === 'dark'} onClick={() => onToggleBasemap('dark')} title="CartoDB Dark" />
              <ToolButton label="Terrain" icon={<TerrainIcon className="w-5 h-5" active={basemap === 'terrain'} />} isActive={basemap === 'terrain'} onClick={() => onToggleBasemap('terrain')} title="Topographic Terrain" />
            </div>

            {/* Layer opacity */}
            <div className="mt-3 flex items-center gap-2.5">
              <OpacityIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={layerOpacity}
                onChange={(e) => onOpacityChange(Number(e.target.value))}
                className="flex-1 h-1 accent-[#E8841A] cursor-pointer"
              />
              <span className="text-[10px] text-gray-500 font-mono w-7 text-right">{layerOpacity}%</span>
            </div>

            {/* ACTIONS */}
            <SectionHeader label="Actions" />
            <div className="space-y-1">
              <ActionButton label="Fit to Kenya" icon={<TargetIcon className="w-4 h-4" active={false} />} isActive={false} onClick={onFitToKenya} />
              <ActionButton label="Fit to Drawn" icon={<CrosshairIcon className="w-4 h-4" active={false} />} isActive={false} onClick={onFitToDrawn} />
              <ActionButton label="GPS Tracking" icon={<LocationDotIcon className="w-4 h-4" active={gpsTracking} />} isActive={gpsTracking} onClick={onToggleGPS} />
              <ActionButton
                label={stakeoutActive ? 'Stakeout ON' : 'Stakeout'}
                icon={<CompassIcon className="w-4 h-4" active={stakeoutActive} />}
                isActive={stakeoutActive}
                onClick={onToggleStakeout}
              />
              {!hasFeature('gps_stakeout') && (
                <div className="text-[10px] text-amber-400/70 px-1">Pro+ required for Stakeout</div>
              )}
              <ActionButton label="Offline Tiles" icon={<BoltIcon className="w-4 h-4" active={false} />} isActive={false} onClick={onToggleOfflineDialog} />
              {!hasFeature('offline_tiles') && (
                <div className="text-[10px] text-amber-400/70 px-1">Pro+ required for Offline Tiles</div>
              )}
            </div>

            {/* PROJECTS */}
            <SectionHeader label="Projects" />
            <div className="space-y-1.5">
              <div className="relative">
                <input
                  type="text"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  placeholder="Filter projects..."
                  className="w-full h-7 bg-white/[0.04] border border-white/[0.06] rounded-md pl-7 pr-2 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-[#E8841A]/30 transition-colors"
                />
                <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
              </div>
              <div className="text-[10px] text-gray-600">
                {projectCount} project{projectCount !== 1 ? 's' : ''} loaded
              </div>
            </div>

            {/* SAVE TO PROJECT */}
            {featureCount > 0 && (
              <>
                <SectionHeader label="Project" />
                <div className="space-y-1">
                  <ActionButton label="Save to Project" icon={<BoltIcon className="w-4 h-4" active={false} />} isActive={false} onClick={onSaveToProject} />
                </div>
              </>
            )}

            {/* EXPORT */}
            {featureCount > 0 && (
              <>
                <SectionHeader label={`Export (${featureCount})`} />
                <div className="space-y-1">
                  <ActionButton label="GeoJSON" icon={<DownloadIcon className="w-4 h-4" active={false} />} isActive={false} onClick={() => onExportFeatures('GeoJSON')} />
                  <ActionButton label="KML" icon={<DownloadIcon className="w-4 h-4" active={false} />} isActive={false} onClick={() => onExportFeatures('KML')} />
                  <ActionButton label="WKT" icon={<DownloadIcon className="w-4 h-4" active={false} />} isActive={false} onClick={() => onExportFeatures('WKT')} />
                  <ActionButton
                    label={hasFeature('dxf_export') ? 'DXF' : 'DXF (Pro+)'}
                    icon={<DownloadIcon className="w-4 h-4" active={false} />}
                    isActive={false}
                    onClick={() => onExportFeatures('DXF')}
                  />
                  {!hasFeature('dxf_export') && (
                    <div className="text-[10px] text-amber-400/70 px-1">Pro+ required for DXF export</div>
                  )}
                  <ActionButton
                    label={hasFeature('landxml') ? 'LandXML' : 'LandXML (Pro+)'}
                    icon={<DownloadIcon className="w-4 h-4" active={false} />}
                    isActive={false}
                    onClick={() => onExportFeatures('LandXML')}
                  />
                  {!hasFeature('landxml') && (
                    <div className="text-[10px] text-amber-400/70 px-1">Pro+ required for LandXML</div>
                  )}
                  <div className="pt-1">
                    <ActionButton label="Clear All" icon={<TrashIcon className="w-4 h-4" active={false} />} isActive={false} onClick={onClearDrawn} isDanger />
                  </div>
                </div>
              </>
            )}

            {/* KEYBOARD SHORTCUTS HINT */}
            <div className="mt-4 pt-3 border-t border-white/[0.06]">
              <div className="text-[10px] text-gray-600 space-y-1">
                <div className="font-semibold text-gray-500 mb-1">Shortcuts</div>
                <div>Ctrl+Z Undo | Ctrl+Y Redo</div>
                <div>Del Delete | Esc Cancel</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
})
