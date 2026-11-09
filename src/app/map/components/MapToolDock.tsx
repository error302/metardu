'use client'

import { linePointerShapes } from '@/app/map/utils/sketchAppearance'
/** Shared desktop/mobile tool groups with one scrollable context panel at a time. */

import React, { memo, useState, useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import GeomaticsIcon from '@/components/icons/GeomaticsIcon'
import {
  Binoculars, Crosshair, Calculator, Target,
  Layers, Download,
  X,
  MapPin, PenTool, Hexagon, Circle,
  Undo2, Redo2, Trash2, Edit3,
  Navigation,
  Ruler, Globe, Building2,
  Printer,
  Eye, MapPinned,
  Scissors, GitMerge, RefreshCw, Magnet, Info,
  FolderOpen, Link2,
} from 'lucide-react'
import { useMapContext } from '@/app/map/MapReactContext'
import { CogoInfoPanel } from '@/app/map/components/CogoInfoPanel'
import { CogoToolsPanel } from '@/app/map/components/CogoToolsPanel'
import { BookmarkPanel } from '@/app/map/components/BookmarkPanel'
import { GpsTrackPanel } from '@/app/map/components/GpsTrackPanel'
import { InstantClosureFeedback } from '@/app/map/components/InstantClosureFeedback'
import { StakeoutPanel } from '@/components/map/StakeoutPanel'
import { VertexEditToolbarContext } from '@/components/map/VertexEditToolbar'
import { SchemeLayerPanel } from './SchemeLayerPanel'
import { ManualPointEntry } from './ManualPointEntry'
import { MapBasemapBar } from './MapWorkspaceHeader'
import { MapCoordSearch } from './MapCoordSearch'
import { MapCaptureBranding } from './MapCaptureBranding'
import { useVisibleBasemap } from '../hooks/useVisibleBasemap'
import { TopologyGuardrail } from '@/components/survey/TopologyGuardrail'
import { useSearchParams } from 'next/navigation'
import { mapTopologyVertices } from '@/lib/survey/mapTopologyInput'
import type { SurveyPoint } from '@/lib/map/turfHelpers'
import type { CachedSourceInfo } from '@/lib/offline/tileCache'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DockCategory = 'recon' | 'capture' | 'compute' | 'setout' | 'layers' | 'export'

interface CategoryDef {
  id: DockCategory
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut: string
  accent: string
}

const LAYERS_CATEGORY: CategoryDef = { id: 'layers', icon: Layers, label: 'Layers', shortcut: '5', accent: '#D17B47' }

const CATEGORIES: CategoryDef[] = [
  { id: 'recon',   icon: Binoculars,  label: 'Recon',   shortcut: '1', accent: '#D17B47' },
  { id: 'capture', icon: Crosshair,   label: 'Capture', shortcut: '2', accent: '#D17B47' },
  { id: 'compute', icon: Calculator,  label: 'Compute', shortcut: '3', accent: '#D17B47' },
  { id: 'setout',  icon: Target,      label: 'Set Out', shortcut: '4', accent: '#D17B47' },
  { id: 'export',  icon: Download,    label: 'Export',  shortcut: '6', accent: '#D17B47' },
]

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pt-3 pb-1.5 first:pt-1">
      <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] font-semibold">
        {children}
      </span>
    </div>
  )
}

function ActionBtn({ label, icon, isActive, onClick, danger, shortcut, disabled, pressed }: {
  label: string
  icon: React.ReactNode
  isActive: boolean
  onClick: () => void
  danger?: boolean
  shortcut?: string
  disabled?: boolean
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`
        flex items-center gap-2.5 w-full min-h-11 px-3 py-2 rounded-lg transition-all duration-150 text-xs font-medium
        ${disabled
          ? 'opacity-30 cursor-not-allowed text-[var(--text-muted)] border border-transparent'
          : danger && isActive
            ? 'bg-red-500/10 border border-red-500/30 text-red-400'
            : isActive
              ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)] border border-transparent'}
      `}
    >
      <span className="w-4 h-4 shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && !disabled && (
        <kbd className="px-1 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] text-[8px] text-[var(--text-muted)] font-mono">
          {shortcut}
        </kbd>
      )}
    </button>
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
      type="button"
      onClick={onClick}
        aria-pressed={isActive}
      title={label}
      className={`
        flex flex-col items-center justify-center gap-1 rounded-xl transition-all duration-150
        w-full min-h-[50px] shrink-0 relative
        ${isActive
          ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]'
          : 'bg-white/[0.02] border border-white/[0.05] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]'}
      `}
    >
      <span className="w-5 h-5">{icon}</span>
      <span className="text-[9px] leading-tight font-medium">{label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Project badge — shows linked project in panel header
// ---------------------------------------------------------------------------

function ProjectBadge() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId')
  if (!projectId) return null
  return (
    <a
      href={`/project/${projectId}`}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[9px] font-semibold text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-colors no-underline"
      title="Go to linked project"
    >
      <Link2 className="w-2.5 h-2.5" />
      Project
    </a>
  )
}

// ---------------------------------------------------------------------------
// DockPanel — reusable wrapper for each panel card
// ---------------------------------------------------------------------------





// ---------------------------------------------------------------------------
// Helper: polygon vertices from OL feature
// ---------------------------------------------------------------------------

function extractPolygonVertices(feature: import('ol/Feature').default | null, viewCrs: string | null, surveyCrs: string | null): SurveyPoint[] {
  if (!feature) return []
  try {
    const geom = feature.getGeometry()
    if (!geom) return []
    const type = geom.getType()
    if (type === 'Polygon') {
      const rings = (geom as import('ol/geom/Polygon').default).getCoordinates()
      if (rings.length !== 1) return [] // This guardrail assesses a single exterior boundary.
      return mapTopologyVertices(rings[0], viewCrs, surveyCrs)
    }
    if (type === 'LineString') {
      const coords = (geom as import('ol/geom/LineString').default).getCoordinates()
      return mapTopologyVertices(coords, viewCrs, surveyCrs)
    }
  } catch {}
  return []
}

// ---------------------------------------------------------------------------
// Panel content components
// ---------------------------------------------------------------------------

export const ReconContent = memo(function ReconContent({ onFitProject }: { onFitProject: () => void }) {
  const { fitToKenya, fitToDrawn, gpsTracking, gpsPos, toggleGPS, featureCount, schemeProjectId, currentSurveyCrs } = useMapContext()

  return (
    <div className="space-y-0.5">
      <SectionLabel>Search</SectionLabel>
      <MapCoordSearch />
      <p className="px-1 pt-1 text-xs text-[var(--text-secondary)]">Enter latitude, longitude or an E/N pair in the selected survey grid. Beacon and parcel search checks features loaded on this map.</p>

      <SectionLabel>Fit View</SectionLabel>
      <ActionBtn label="Fit to Kenya" icon={<Globe className="w-4 h-4" />} isActive={false} onClick={fitToKenya} />
      {schemeProjectId && <ActionBtn label="Fit to project points" icon={<MapPinned className="w-4 h-4" />} isActive={false} onClick={onFitProject} disabled={!currentSurveyCrs} />}
      <ActionBtn label="Fit to sketches" icon={<PenTool className="w-4 h-4" />} isActive={false} onClick={fitToDrawn} disabled={featureCount === 0} />

      <SectionLabel>GPS</SectionLabel>
      <ActionBtn
        label={gpsTracking ? 'Stop device GPS' : 'Locate with device GPS'}
        icon={<Navigation className="w-4 h-4" />}
        isActive={gpsTracking}
        pressed={gpsTracking}
        onClick={toggleGPS}
      />
      {gpsTracking && <p role="status" className="px-1 text-xs text-[var(--text-secondary)]">
        {gpsPos ? 'Device location active. Use a survey receiver for measured observations.' : 'Waiting for a device location. Check browser location permissions.'}
      </p>}

      <SectionLabel>Bookmarks</SectionLabel>
      <BookmarkPanel />
    </div>
  )
})

export const CaptureContent = memo(function CaptureContent({
  onPointSaved, onSketchStart,
}: { onPointSaved: () => void; onSketchStart: () => void }) {
  const ctx = useMapContext()
  const { selectedFeature, currentSurveyCrs, schemeProjectId } = ctx
  const viewCrs = ctx.mapInstance.current?.getView().getProjection().getCode() ?? null
  const geometryRevision = selectedFeature?.getGeometry()?.getRevision() ?? 0
  const polygonVertices: SurveyPoint[] = useMemo(() => {
    if (selectedFeature?.getGeometry()?.getRevision() !== geometryRevision) return []
    return extractPolygonVertices(selectedFeature, viewCrs, currentSurveyCrs)
  }, [selectedFeature, geometryRevision, viewCrs, currentSurveyCrs])

  return (
    <div className="space-y-0.5">
      <SectionLabel>Project points</SectionLabel>
      <div className="grid gap-2">
        {schemeProjectId ? <ManualPointEntry projectId={schemeProjectId} onSaved={onPointSaved} /> : <p className="px-1 text-xs text-[var(--text-secondary)]">Open the survey map from a project to key in points to its register.</p>}
        <Link href={schemeProjectId ? `/field/collect?projectId=${encodeURIComponent(schemeProjectId)}` : '/field/collect'} prefetch={false} className="btn btn-secondary min-h-11">Measure with instrument</Link>
        <Link href={schemeProjectId ? `/import?projectId=${encodeURIComponent(schemeProjectId)}` : '/import'} prefetch={false} className="btn btn-secondary min-h-11">Import controller file</Link>
      </div>
      <SectionLabel>Map sketch</SectionLabel>
      <p className="px-1 pb-1 text-xs text-[var(--text-secondary)]">Sketches stay in the drawing. Use Project points for field records.</p>
      <div className="grid grid-cols-3 gap-1.5">
        <ToolBtn label="Sketch point"   icon={<MapPin className="w-5 h-5" />}  isActive={ctx.drawMode === 'Point'}      onClick={() => ctx.toggleDraw('Point')}      />
        <ToolBtn label="Line"    icon={<PenTool className="w-5 h-5" />} isActive={ctx.drawMode === 'LineString'} onClick={() => { ctx.toggleDraw('LineString'); onSketchStart() }} />
        <ToolBtn label="Polygon" icon={<Hexagon className="w-5 h-5" />} isActive={ctx.drawMode === 'Polygon'}    onClick={() => { ctx.toggleDraw('Polygon'); onSketchStart() }}    />
        <ToolBtn label="Circle"  icon={<Circle className="w-5 h-5" />}  isActive={ctx.drawMode === 'Circle'}     onClick={() => ctx.toggleDraw('Circle')}     />
      </div>

      <SectionLabel>Measure</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        <ToolBtn label="Distance" icon={<Ruler className="w-5 h-5" />}  isActive={ctx.measureMode === 'distance'} onClick={() => { ctx.toggleMeasure('distance'); onSketchStart() }} />
        <ToolBtn label="Area"     icon={<Hexagon className="w-5 h-5" />} isActive={ctx.measureMode === 'area'}     onClick={() => { ctx.toggleMeasure('area'); onSketchStart() }}         />
      </div>
      {ctx.measureResult && (
        <div className="mt-1 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-semibold">Result</span>
          <p className="text-sm text-[var(--text-primary)] font-mono mt-1">{ctx.measureResult}</p>
        </div>
      )}

      <SectionLabel>Annotations</SectionLabel>
      <ActionBtn
        label={ctx.showAnnotations ? 'Annotations On' : 'Bearing Annotations'}
        icon={<Eye className="w-4 h-4" />}
        isActive={ctx.showAnnotations}
        onClick={ctx.toggleAnnotations}
      />

      <SectionLabel>Edit</SectionLabel>
      <ActionBtn label="Modify Vertices" icon={<Edit3 className="w-4 h-4" />} isActive={ctx.editMode} onClick={ctx.toggleEdit} />
      <details className="py-2 text-xs text-[var(--text-secondary)]">
        <summary className="cursor-pointer py-2">Precision vertex controls</summary>
        <VertexEditToolbarContext />
      </details>
      <ActionBtn label="Delete Selected" icon={<Trash2 className="w-4 h-4" />} isActive={false} onClick={ctx.deleteSelected} disabled={!ctx.selectedFeature} danger shortcut="Del" />

      <SectionLabel>Advanced</SectionLabel>
      <div className="grid grid-cols-3 gap-1">
        <ToolBtn label="Split"   icon={<Scissors className="w-4 h-4" />}  isActive={ctx.activeDigitizingTool === 'split'}   onClick={() => ctx.setActiveDigitizingTool(ctx.activeDigitizingTool === 'split'   ? null : 'split')}   />
        <ToolBtn label="Merge"   icon={<GitMerge className="w-4 h-4" />}  isActive={ctx.activeDigitizingTool === 'merge'}   onClick={() => ctx.setActiveDigitizingTool(ctx.activeDigitizingTool === 'merge'   ? null : 'merge')}   />
        <ToolBtn label="Reshape" icon={<RefreshCw className="w-4 h-4" />} isActive={ctx.activeDigitizingTool === 'reshape'} onClick={() => ctx.setActiveDigitizingTool(ctx.activeDigitizingTool === 'reshape' ? null : 'reshape')} />
        <ToolBtn label="Rotate"  icon={<RefreshCw className="w-4 h-4" />} isActive={ctx.activeDigitizingTool === 'rotate'}  onClick={() => ctx.setActiveDigitizingTool(ctx.activeDigitizingTool === 'rotate'  ? null : 'rotate')}  />
        <ToolBtn label="Offset"  icon={<Ruler className="w-4 h-4" />}     isActive={ctx.activeDigitizingTool === 'offset'}  onClick={() => ctx.setActiveDigitizingTool(ctx.activeDigitizingTool === 'offset'  ? null : 'offset')}  />
      </div>

      {ctx.activeDigitizingTool === 'offset' && (
        <div className="mt-1 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-[var(--text-muted)] uppercase">Distance:</span>
            <input aria-label="Offset distance" type="range" min="-50" max="50" step="1" value={ctx.offsetDistance} onChange={e => ctx.setOffsetDistance(parseFloat(e.target.value))} className="flex-1" />
            <span className="font-mono text-[10px] text-[var(--text-primary)] w-10 text-right">{ctx.offsetDistance}m</span>
          </div>
          <button onClick={ctx.applyOneShotTool} className="w-full py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[10px] font-semibold text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] transition-colors">
            Create Offset
          </button>
        </div>
      )}

      {ctx.activeDigitizingTool === 'rotate' && (
        <div className="mt-1 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-[var(--text-muted)] uppercase">Angle:</span>
            <input aria-label="Rotation angle" type="range" min="-180" max="360" step="1" value={ctx.rotateAngle} onChange={e => ctx.setRotateAngle(parseFloat(e.target.value))} className="flex-1" />
            <span className="font-mono text-[10px] text-[var(--text-primary)] w-10 text-right">{ctx.rotateAngle}°</span>
          </div>
          <button onClick={ctx.applyOneShotTool} className="w-full py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[10px] font-semibold text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] transition-colors">
            Apply Rotation
          </button>
        </div>
      )}

      {ctx.activeDigitizingTool === 'merge' && (
        <div className="mt-1 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
          <button onClick={ctx.applyOneShotTool} className="w-full py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[10px] font-semibold text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] transition-colors">
            Merge Selected Polygons
          </button>
        </div>
      )}

      {ctx.activeDigitizingTool && ctx.activeDigitizingTool !== 'draw' && (
        <div className="mt-1 p-2.5 rounded-lg bg-[var(--accent)]/[0.06] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-start gap-2">
          <Info className="w-3 h-3 text-[var(--accent)] shrink-0 mt-0.5" />
          <p className="text-[10px] text-[var(--text-secondary)]">
            {ctx.activeDigitizingTool === 'split'   && 'Draw a line across the polygon to split it. The line must cross at 2 points.'}
            {ctx.activeDigitizingTool === 'merge'   && 'Shift+click 2+ adjacent polygons, then click Merge.'}
            {ctx.activeDigitizingTool === 'reshape' && 'Draw a new line across the polygon boundary to reshape it.'}
            {ctx.activeDigitizingTool === 'rotate'  && 'Click a polygon, adjust the angle slider, then Apply.'}
            {ctx.activeDigitizingTool === 'offset'  && 'Click a feature, adjust distance, then Create Offset.'}
          </p>
        </div>
      )}

      <ActionBtn
        label="Snapping settings"
        icon={<Magnet className="w-4 h-4" />}
        isActive={ctx.showSnappingOptions}
        pressed={ctx.showSnappingOptions}
        onClick={() => ctx.setShowSnappingOptions(!ctx.showSnappingOptions)}
      />

      {ctx.selectedFeature && (
        <ActionBtn label="Fit selected sketch" icon={<Crosshair className="h-4 w-4" />}
          isActive={false} onClick={ctx.fitSelectedSketch} />
      )}
      {ctx.selectedFeature && (
        <div className="mt-1 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1.5">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-semibold">Feature Name</span>
          <input
            type="text"
            value={ctx.featureName}
            onChange={(e) => ctx.updateFeatureName(e.target.value)}
            aria-label="Feature name"
            placeholder="Feature name…"
            className="w-full h-7 bg-white/[0.03] border border-white/[0.07] rounded-md px-2 text-[11px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-colors"
          />
        </div>
      )}

      {ctx.selectedFeature && ['Polygon', 'LineString'].includes(ctx.selectedFeature.getGeometry()?.getType() ?? '') && polygonVertices.length === 0 && (
        <p role="status" className="text-xs text-[var(--text-muted)]">Topology is not assessed. Select a projected survey reference system and a valid single parcel boundary.</p>
      )}
      {polygonVertices.length >= 3 && (
        <>
          <SectionLabel>Topology Check</SectionLabel>
          <TopologyGuardrail vertices={polygonVertices} epsg={ctx.currentSurveyCrs} compact />
        </>
      )}
    </div>
  )
})

export const ComputeContent = memo(function ComputeContent() {
  const { schemeProjectId } = useMapContext()
  return (
    <div className="space-y-0.5">
      <SectionLabel>COGO Computation</SectionLabel>
      <CogoToolsPanel />
      <SectionLabel>Traverse Readout</SectionLabel>
      <CogoInfoPanel />
      <InstantClosureFeedback />
      <SectionLabel>Parcel Boundary Review</SectionLabel>
      {schemeProjectId ? (
        <div className="space-y-2 px-1 text-xs">
          <p>Choose a parcel in its block register, then review its retained coordinates and boundary order.</p>
          <Link href={`/project/${schemeProjectId}/scheme/blocks`} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 underline underline-offset-4">
            <GeomaticsIcon symbol="parcel" className="h-4 w-4" />Open parcel registers
          </Link>
        </div>
      ) : <p className="px-1 text-xs text-[var(--text-muted)]">Open a project to review a parcel boundary.</p>}
    </div>
  )
})

export const SetOutContent = memo(function SetOutContent() {
  const { gpsTracking, toggleGPS, stakeoutActive, startStakeout, deactivateStakeout, currentSurveyCrs, schemeProjectId, hasFeature } = useMapContext()
  const [target, setTarget] = useState({ easting: '', northing: '' })
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const canNavigate = hasFeature('gps_stakeout')

  async function submitTarget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentSurveyCrs || !canNavigate || starting || stakeoutActive) return
    const values = [target.easting, target.northing].map(value => value.trim())
    const [easting, northing] = values.map(Number)
    if (!values.every(value => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) || !Number.isFinite(easting) || !Number.isFinite(northing)) {
      setError('Enter numeric easting and northing in the displayed survey grid.')
      return
    }
    setError('')
    setStarting(true)
    try {
      await startStakeout({ easting, northing })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start navigation.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-0.5">
      <SectionLabel>Project setout</SectionLabel>
      {schemeProjectId
        ? <Link href={'/field/setout?projectId=' + encodeURIComponent(schemeProjectId)} prefetch={false} className="btn btn-secondary min-h-11">Open field setout register</Link>
        : <p className="px-1 text-xs text-[var(--text-secondary)]">Open the map from a project to use its setout register.</p>}

      <SectionLabel>Device GPS navigation</SectionLabel>
      <p className="px-1 pb-2 text-xs text-[var(--text-secondary)]">Navigate to a known grid coordinate. Verify position and tolerances with a survey instrument.</p>
      {stakeoutActive ? (
        <ActionBtn label="End navigation" icon={<Target className="h-4 w-4" />} isActive onClick={deactivateStakeout} />
      ) : (
        <form onSubmit={submitTarget} className="space-y-2">
          <fieldset disabled={!canNavigate || !currentSurveyCrs || starting} className="grid grid-cols-2 gap-2 disabled:opacity-50">
            <legend className="mb-2 text-xs text-[var(--text-secondary)]">{currentSurveyCrs ?? 'Choose a survey grid first'}</legend>
            {(['easting', 'northing'] as const).map(axis => (
              <label key={axis} className="min-w-0 text-xs capitalize text-[var(--text-secondary)]">
                {axis}
                <input required inputMode="decimal" value={target[axis]} onChange={event => {
                  setTarget(previous => ({ ...previous, [axis]: event.target.value }))
                  setError('')
                }} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 tabular-nums text-[var(--text-primary)]" />
              </label>
            ))}
            <button type="submit" className="btn btn-secondary col-span-2 min-h-11">{starting ? 'Starting…' : 'Navigate to target'}</button>
          </fieldset>
          {!canNavigate && <p className="px-1 text-xs text-[var(--text-secondary)]">Device GPS navigation requires a Pro plan.</p>}
          {error && <p role="alert" className="px-1 text-xs text-[var(--error)]">{error}</p>}
        </form>
      )}
      <StakeoutPanel />

      <SectionLabel>GPS Track</SectionLabel>
      <ActionBtn
        label={gpsTracking ? 'GPS Active' : 'Enable GPS'}
        icon={<Navigation className="w-4 h-4" />}
        isActive={gpsTracking}
        onClick={toggleGPS}
      />
      <GpsTrackPanel />

    </div>
  )
})

export const LayersContent = memo(function LayersContent() {
  const {
    mapInstance, basemap, toggleBasemap, setOfflineDialogOpen,
    layerOpacity, handleOpacityChange, sketchAppearance, setSketchAppearance,
    showOsmBuildings, toggleOsmBuildings,
    hasProjectId, featureCount, currentSurveyCrs,
  } = useMapContext()
  const [section, setSection] = useState<'base' | 'survey' | 'reference'>('base')
  const [cachedTileSources, setCachedTileSources] = useState<CachedSourceInfo[]>([])
  const [cachedTilesLoading, setCachedTilesLoading] = useState(false)
  const [cachedTilesError, setCachedTilesError] = useState<string | null>(null)
  const visibleBasemap = useVisibleBasemap()
  const activeCachedSourceId = visibleBasemap.startsWith('offline-') ? visibleBasemap.slice('offline-'.length) : null

  const refreshCachedTileSources = useCallback(async () => {
    setCachedTilesLoading(true)
    setCachedTilesError(null)
    try {
      const { listCachedSources } = await import('@/lib/offline/tileCache')
      setCachedTileSources(await listCachedSources())
    } catch {
      setCachedTilesError('Could not read downloaded map packages on this device.')
    } finally {
      setCachedTilesLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshCachedTileSources()
  }, [refreshCachedTileSources])

  useEffect(() => {
    window.addEventListener('metardu:offline-tiles-updated', refreshCachedTileSources)
    return () => window.removeEventListener('metardu:offline-tiles-updated', refreshCachedTileSources)
  }, [refreshCachedTileSources])

  const selectCachedBasemap = useCallback(async (source: CachedSourceInfo) => {
    const map = mapInstance.current
    if (!map) return

    if (activeCachedSourceId === source.sourceId) {
      toggleBasemap(basemap)
      return
    }

    setCachedTilesError(null)
    try {
      const { createCachedXyzLayer, isUsableCachedTileSource } = await import('@/lib/offline/cachedXyzLayer')
      if (!isUsableCachedTileSource(source)) {
        throw new Error('This cached source predates map-source registration. Download it again to use it as a basemap.')
      }

      const offlineLayerId = `offline-${source.sourceId}`
      let offlineLayer = map.getLayers().getArray().find(
        (layer) => layer.get('basemapId') === offlineLayerId,
      ) as import('ol/layer/Tile').default | undefined
      if (!offlineLayer) {
        offlineLayer = await createCachedXyzLayer(source)
        map.addLayer(offlineLayer)
      }

      for (const layer of map.getLayers().getArray()) {
        const basemapId = layer.get('basemapId') as string | undefined
        if (basemapId && (['osm', 'satellite', 'dark', 'terrain'].includes(basemapId) || basemapId.startsWith('offline-'))) {
          layer.setVisible(layer === offlineLayer)
        }
      }
      offlineLayer.setVisible(true)
      map.render()
    } catch (error) {
      setCachedTilesError(error instanceof Error ? error.message : 'Could not activate this cached map.')
    }
  }, [mapInstance, activeCachedSourceId, basemap, toggleBasemap])

  return (
    <div className="space-y-0.5">
      <div className="map-layer-tabs mb-2 flex flex-wrap gap-1" role="group" aria-label="Layer groups">
        {(['base', 'survey', 'reference'] as const).map(group => (
          <button type="button" key={group} aria-pressed={section === group} onClick={() => setSection(group)}
            className="min-h-11 rounded-lg border border-transparent px-3 text-xs text-[var(--text-secondary)] aria-pressed:border-[var(--border-color)] aria-pressed:bg-white/[0.08] aria-pressed:text-[var(--text-primary)]">
            {group.charAt(0).toUpperCase() + group.slice(1)}
          </button>
        ))}
      </div>
      <div hidden={section !== 'base'}>
      <SectionLabel>Downloaded Basemaps</SectionLabel>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => void refreshCachedTileSources()}
          disabled={cachedTilesLoading}
          className="flex w-full items-center gap-1.5 px-1 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${cachedTilesLoading ? 'animate-spin' : ''}`} />
          {cachedTilesLoading ? 'Checking this device…' : 'Refresh cached maps'}
        </button>
        {cachedTileSources.length === 0 && !cachedTilesLoading && (
          <p className="px-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
            Download an area from a licensed XYZ provider to use it here without a connection.
          </p>
        )}
        {cachedTileSources.map((source) => (
          <div key={source.sourceId}>
            <ActionBtn
              label={source.label}
              icon={<Layers className="h-4 w-4" />}
              isActive={activeCachedSourceId === source.sourceId}
              onClick={() => void selectCachedBasemap(source)}
            />
            <p className="px-2 pb-1 text-[9px] text-[var(--text-muted)]">
              {source.stats.count.toLocaleString()} tiles · zoom {source.minZoom ?? '?'}–{source.maxZoom ?? '?'}
            </p>
          </div>
        ))}
        {cachedTilesError && <p role="alert" className="px-1 text-[10px] text-red-400">{cachedTilesError}</p>}
      </div>

      <SectionLabel>Basemap Opacity</SectionLabel>
      <div className="flex items-center gap-2 px-1">
        <input
          type="range" min={0} max={1} step={0.05}
          value={layerOpacity}
          onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-[#D17B47] cursor-pointer"
          aria-label="Layer opacity"
        />
        <span className="text-[10px] text-[var(--text-muted)] font-mono w-8 text-right">{Math.round(layerOpacity * 100)}%</span>
      </div>

      <SectionLabel>Offline</SectionLabel>
      <ActionBtn label="Download Tiles" icon={<Download className="w-4 h-4" />} isActive={false} onClick={() => setOfflineDialogOpen(true)} />
      </div>
      <div hidden={section !== 'survey'}>
        <SectionLabel>Sketch appearance</SectionLabel>
        <div className="mb-3 space-y-2 px-1">
          <label className="block text-xs text-[var(--text-secondary)]">
            <span className="flex justify-between gap-2">Line opacity <span aria-hidden="true">{sketchAppearance.lineOpacity}%</span></span>
            <input type="range" min={10} max={100} step={5} value={sketchAppearance.lineOpacity}
              aria-label="Line opacity" aria-valuetext={sketchAppearance.lineOpacity + '%'}
              onChange={event => setSketchAppearance({ ...sketchAppearance, lineOpacity: event.currentTarget.valueAsNumber })}
              className="h-11 w-full accent-[#D17B47]" />
          </label>
          <label className="block text-xs text-[var(--text-secondary)]">
            Line pointer shape
            <select value={sketchAppearance.linePointerShape} className="input mt-1 min-h-11 w-full capitalize"
              onChange={event => {
                const shape = linePointerShapes.find(option => option === event.currentTarget.value)
                if (shape) setSketchAppearance({ ...sketchAppearance, linePointerShape: shape })
              }}>
              {linePointerShapes.map(shape => <option key={shape} value={shape}>{shape.charAt(0).toUpperCase() + shape.slice(1)}</option>)}
            </select>
          </label>
          <label className="block text-xs text-[var(--text-secondary)]">
            <span className="flex justify-between gap-2">Sketch point size <span aria-hidden="true">{sketchAppearance.pointSize} px</span></span>
            <input type="range" min={6} max={28} step={1} value={sketchAppearance.pointSize}
              aria-label="Sketch point size" aria-valuetext={sketchAppearance.pointSize + ' pixels'}
              onChange={event => setSketchAppearance({ ...sketchAppearance, pointSize: event.currentTarget.valueAsNumber })}
              className="h-11 w-full accent-[#D17B47]" />
          </label>
        </div>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">{featureCount} drawn feature{featureCount === 1 ? '' : 's'}. Import GeoJSON, KML or WKT by dropping a file onto the map.</p>
        {hasProjectId ? <SchemeLayerPanel /> : <p className="text-xs leading-relaxed text-[var(--text-muted)]">Open the map from a project to load its parcels, blocks and beacons. <a href="/projects" className="text-[var(--accent)] underline">Choose a project</a></p>}
      </div>
      <div hidden={section !== 'reference'}>
        <SectionLabel>Context layers</SectionLabel>
        <ActionBtn label={showOsmBuildings ? 'OSM Buildings (Active)' : 'OSM Buildings'} icon={<Building2 className="w-4 h-4" />} isActive={showOsmBuildings} onClick={toggleOsmBuildings} />
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">OpenStreetMap footprints provide context and are not surveyed boundaries.</p>
        <SectionLabel>Coordinate reference</SectionLabel>
        <p className="text-xs text-[var(--text-secondary)]">{currentSurveyCrs ?? 'Survey grid not set'}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">The map displays in EPSG:3857. The survey grid in the header controls coordinate calculations.</p>
      </div>
    </div>
  )
})

export const ExportContent = memo(function ExportContent() {
  const { saveToProject, exportFeatures, clearDrawn, featureCount, printMap, captureMap, isPrinting } = useMapContext()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId')

  return (
    <div className="space-y-0.5">
      <SectionLabel>Save to Project</SectionLabel>
      {projectId ? (
        <ActionBtn label="Save to Project" icon={<FolderOpen className="w-4 h-4" />} isActive={false} onClick={saveToProject} />
      ) : (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400">
          Open from a project to enable saving. <a href="/dashboard" className="underline text-[var(--accent)]">Go to dashboard →</a>
        </div>
      )}

      <SectionLabel>Export Format</SectionLabel>
      <div className="grid grid-cols-3 gap-1 mt-1">
        {(['GeoJSON','KML','DXF','WKT'] as const).map(fmt => (
          <button key={fmt} onClick={() => exportFeatures(fmt)} className="px-2 py-1.5 rounded-lg border border-white/[0.06] text-[10px] font-medium text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)] transition-all">{fmt}</button>
        ))}
        <button onClick={() => exportFeatures('LandXML')} className="col-span-2 px-2 py-1.5 rounded-lg border border-white/[0.06] text-[10px] font-medium text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)] transition-all">LandXML</button>
      </div>

      <SectionLabel>Current map</SectionLabel>
      <ActionBtn label={isPrinting ? 'Preparing map…' : 'Capture map (PNG)'} icon={<Download className="w-4 h-4" />}
        isActive={false} disabled={isPrinting} onClick={() => void captureMap()} />
      <ActionBtn label="Print / PDF" icon={<Printer className="w-4 h-4" />}
        isActive={false} disabled={isPrinting} onClick={() => void printMap()} />
      <MapCaptureBranding />

      {featureCount > 0 && (
        <>
          <SectionLabel>Clear</SectionLabel>
          <ActionBtn label={`Clear All (${featureCount})`} icon={<Trash2 className="w-4 h-4" />} isActive={false} onClick={clearDrawn} danger />
        </>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// METARDU Watermark
// ---------------------------------------------------------------------------

const MetarduWatermark = memo(function MetarduWatermark() {
  return (
    <div className="absolute bottom-2 right-3 z-10 pointer-events-none select-none" aria-hidden>
      <span className="text-[10px] font-bold tracking-[0.25em] text-[var(--text-primary)]/[0.06] uppercase">METARDU</span>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Main: MapToolDock
// ---------------------------------------------------------------------------

export const MapToolDock = memo(function MapToolDock({
  expanded = true, onExpandedChange, onPointSaved, onFitProject,
}: { expanded?: boolean; onExpandedChange?: (expanded: boolean) => void; onPointSaved: () => void; onFitProject: () => void }) {
  const [openPanel, setOpenPanel] = useState<DockCategory | null>(null)
  const {
    drawMode, editMode, measureMode, gpsTracking, stakeoutActive, schemeProjectId, currentSurveyCrs,
    hasTraverse, showAnnotations, undo, redo, canUndo, canRedo, sketchHistory,
    canFinishPath, finishPath, toggleDraw, toggleMeasure, measureResult,
  } = useMapContext()
  const finishLabel = measureMode === 'area' ? 'Finish area' : measureMode === 'distance' ? 'Finish distance'
    : drawMode === 'LineString' ? 'Finish line' : drawMode === 'Polygon' ? 'Finish polygon' : null
  const sketchActive = drawMode !== 'none' || measureMode !== 'none'
  const closePanel = useCallback(() => setOpenPanel(null), [])

  const togglePanel = useCallback((cat: DockCategory) => {
    if (cat !== 'layers') onExpandedChange?.(true)
    setOpenPanel(previous => previous === cat ? null : cat)
  }, [onExpandedChange])

  // Keyboard shortcuts
  useEffect(() => {
    const keyMap: Record<string, DockCategory> = {
      '1': 'recon', '2': 'capture', '3': 'compute',
      '4': 'setout', '5': 'layers', '6': 'export',
    }
    function handleKey(e: KeyboardEvent) {
      if (e.defaultPrevented || (e.target as HTMLElement | null)?.closest?.('[role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable) return
      const cat = keyMap[e.key]
      if (cat) { e.preventDefault(); togglePanel(cat) }
      if (e.key === 'Escape') setOpenPanel(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [togglePanel])

  const isActive = (cat: DockCategory) => {
    switch (cat) {
      case 'recon':   return gpsTracking
      case 'capture': return drawMode !== 'none' || editMode || measureMode !== 'none' || showAnnotations
      case 'compute': return hasTraverse
      case 'setout':  return stakeoutActive
      default:        return false
    }
  }

  const renderPanelContent = (cat: DockCategory) => {
    switch (cat) {
      case 'recon':   return <ReconContent onFitProject={onFitProject} />
      case 'capture': return <CaptureContent onPointSaved={onPointSaved} onSketchStart={closePanel} />
      case 'compute': return <ComputeContent />
      case 'setout':  return <SetOutContent key={(schemeProjectId ?? '') + ':' + (currentSurveyCrs ?? '')} />
      case 'layers':  return <LayersContent />
      case 'export':  return <ExportContent />
    }
  }

  return (
    <>
      <MetarduWatermark />
      <MapBasemapBar layersOpen={openPanel === 'layers'} onToggleLayers={() => togglePanel('layers')} />

      {!expanded && <button
        type="button"
        className="map-mobile-tools-toggle"
        aria-expanded={expanded}
        aria-controls="map-mobile-tool-groups"
        onClick={() => {
          setOpenPanel(null)
          onExpandedChange?.(!expanded)
        }}
      >
        <Layers className="h-4 w-4" />
        Map tools
      </button>}

      {/* Active panel — styled gracefully on both mobile & desktop */}
      {openPanel && (expanded || openPanel === 'layers') && (() => {
        const cat = openPanel
        const catDef = cat === 'layers' ? LAYERS_CATEGORY : CATEGORIES.find(c => c.id === cat) ?? CATEGORIES[0]
        return (
          <div
            id={`map-tools-${cat}`}
            className="map-mobile-tool-panel bg-[var(--bg-secondary)] shadow-xl"
            role="region"
            aria-label={`${catDef.label} tools`}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-8 h-1 rounded-full bg-white/[0.12]" />
            </div>
            <div
              className="flex items-center justify-between px-4 pb-2 border-b border-white/[0.06]"
              style={{ borderTop: `2px solid ${catDef.accent}` }}
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catDef.accent }} />
                <span className="text-xs text-[var(--text-secondary)] font-semibold">{catDef.label}</span>
                <ProjectBadge />
              </div>
              <button
                onClick={() => setOpenPanel(null)}
                className="min-h-11 min-w-11 shrink-0 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.06]"
                aria-label="Close panel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="map-mobile-panel-body overflow-y-auto px-3 pb-4 custom-scrollbar">
              {renderPanelContent(cat)}
            </div>
          </div>
        )
      })()}

      {/* Horizontal tool bar / dock */}
      {(expanded || sketchActive || measureResult) && (
        <div id="map-mobile-tool-groups" className="map-tools-dock">
          {sketchActive ? (
            <div className="flex flex-wrap items-center gap-x-2 border-t border-[var(--border-color)] px-2" role="group" aria-label="Active sketch">
              <p className="flex-1 text-xs text-[var(--text-secondary)]" role="status">
                {measureMode === 'area' ? 'Double-tap the last vertex or the start to close the area.'
                  : finishLabel ? 'Double-tap the last vertex to finish.'
                  : drawMode === 'Point' ? 'Tap to place a point.' : 'Tap the centre, then the edge.'}
              </p>
              {finishLabel && <button type="button" className="btn btn-secondary min-h-11" disabled={!canFinishPath} onClick={finishPath}>{finishLabel}</button>}
              <button type="button" className="btn btn-secondary min-h-11" onClick={() => {
                if (measureMode !== 'none') toggleMeasure('none')
                else toggleDraw('none')
              }}>Cancel sketch</button>
            </div>
          ) : measureResult && openPanel !== 'capture' && (
            <p role="status" className="border-t border-[var(--border-color)] px-3 py-2 text-xs font-mono">{measureResult}</p>
          )}
          {expanded && <>
          <div className="map-sketch-history" role="group" aria-label="Sketch history">
            <button type="button" onClick={undo} disabled={!canUndo}
              title={sketchHistory ? 'Undo last vertex (Ctrl+Z)' : 'Undo sketch edit (Ctrl+Z)'}>
              <Undo2 className="h-4 w-4" aria-hidden="true" /> {sketchHistory ? 'Undo vertex' : 'Undo'}
            </button>
            <button type="button" onClick={redo} disabled={!canRedo}
              title={sketchHistory ? 'Redo vertex (Ctrl+Shift+Z)' : 'Redo sketch edit (Ctrl+Shift+Z)'}>
              <Redo2 className="h-4 w-4" aria-hidden="true" /> {sketchHistory ? 'Redo vertex' : 'Redo'}
            </button>
          </div>
          <div className="map-mobile-tool-bar" role="toolbar" aria-label="Map tools">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon
            const open = openPanel === cat.id
            const active = isActive(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => togglePanel(cat.id)}
                aria-label={cat.label}
                aria-keyshortcuts={cat.shortcut}
                aria-expanded={open}
                aria-controls={open ? `map-tools-${cat.id}` : undefined}
                title={`${cat.label} (${cat.shortcut})`}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-200 w-12 h-12 shrink-0 relative
                  ${open ? 'bg-white/[0.08] border border-white/[0.12] text-[var(--text-primary)]'
                    : active ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)]'}`}
                style={open ? { boxShadow: `0 0 12px ${cat.accent}30` } : undefined}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[8px] leading-tight font-medium">{cat.label}</span>
                {open && <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full" style={{ backgroundColor: cat.accent }} />}
              </button>
            )
          })}
          <button type="button" aria-label="Hide map tools" onClick={() => { setOpenPanel(null); onExpandedChange?.(false) }} className="flex flex-col items-center justify-center gap-0.5 text-[var(--text-secondary)]">
            <X className="w-4 h-4" aria-hidden="true" />
            <span className="text-[10px]">Hide</span>
          </button>
          </div>
          </>}
        </div>
      )}
    </>
  )
})
