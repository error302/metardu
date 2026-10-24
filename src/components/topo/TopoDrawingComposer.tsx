'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { coordinateNumber } from '@/lib/import/totalStation/coordinateNumber'
import { readDrawingCsv, readProjectDrawingSource, drawingReferenceIssue, MAX_DRAWING_POINTS } from '@/lib/topo/drawingSource'
import { resolveEpsg } from '@/lib/spatial/projectCrs'
import { resolveDeclaredStageReference } from '@/lib/workspaces/stageReference'
import {
  Upload,
  Download,
  FilePlus,
  Settings2,
  Eye,
  BarChart3,
  Trash2,
  Link2,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react'
import {
  type SurveyPointWithCode,
  type FeatureCodeDef,
  type LayerMappingResult,
  getAllGroups,
  getFeatureCode,
  aciToHex,
} from '@/lib/topo/featureCodes'
import { buildTopoEntities, entitiesToDxfString, computeExtents } from '@/lib/drawing/topoEntities'
import type { ContourLine } from '@/lib/topo/contourGenerator'
import { buildBreaklineTIN } from '@/lib/topo/breaklineTIN'
import { generateTINContours } from '@/lib/topo/tinContours'
import TopoEntityCanvas from '@/components/drawing/TopoEntityCanvas'
import FeatureCodeBrowser from './FeatureCodeBrowser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SurveyPointRow extends SurveyPointWithCode {
  id: string          // local react key
  description?: string
}

interface DrawingSettings {
  scale: number
  includeSpotHeights: boolean
  includeTitleBlock: boolean
  contourInterval: number
  gridTickInterval: number
  includeLabels: boolean
  includeLegend: boolean
}

interface DrawingStats {
  totalPoints: number
  totalLayers: number
  joinableLineCount: number
  pointsByCategory: Record<string, number>
}

// ─── Default settings ───────────────────────────────────────────────────────

const DEFAULT_SETTINGS: DrawingSettings = {
  scale: 500,
  includeSpotHeights: true,
  includeTitleBlock: true,
  contourInterval: 1.0,
  gridTickInterval: 50,
  includeLabels: true,
  includeLegend: true,
}

// ─── Scale options ──────────────────────────────────────────────────────────

const SCALE_OPTIONS = [100, 250, 500, 1000, 2500]

// ─── Demo data generator ───────────────────────────────────────────────────

function generateDemoPoints(): SurveyPointRow[] {
  const baseE = 371000
  const baseN = 9845000

  const rows: Array<{ code: string; count: number; pattern: 'line' | 'scatter' }> = [
    { code: 'BND', count: 6, pattern: 'line' },
    { code: 'BLD', count: 5, pattern: 'line' },
    { code: 'BLD', count: 4, pattern: 'line' },
    { code: 'RD', count: 8, pattern: 'line' },
    { code: 'RD-CTR', count: 8, pattern: 'line' },
    { code: 'ELV', count: 5, pattern: 'line' },
    { code: 'ELV-POL', count: 5, pattern: 'scatter' },
    { code: 'SH', count: 12, pattern: 'scatter' },
    { code: 'TRV', count: 8, pattern: 'scatter' },
    { code: 'RIV', count: 7, pattern: 'line' },
    { code: 'BM', count: 2, pattern: 'scatter' },
    { code: 'CTRL', count: 2, pattern: 'scatter' },
    { code: 'WTR', count: 5, pattern: 'line' },
    { code: 'SLB', count: 4, pattern: 'scatter' },
  ]

  const points: SurveyPointRow[] = []
  let ptNum = 1

  for (const group of rows) {
    const def = getFeatureCode(group.code)
    for (let i = 0; i < group.count; i++) {
      const de = Math.sin(ptNum * 1.17) * 40
      const dn = Math.cos(ptNum * 0.87) * 40
      const z = 1225 + Math.sin(ptNum * 0.31) * 25

      points.push({
        id: `demo-${ptNum}`,
        pointNumber: `${ptNum}`,
        easting: group.pattern === 'line'
          ? baseE + 10 * i + Math.sin(ptNum * 0.73) * 2
          : baseE + de,
        northing: group.pattern === 'line'
          ? baseN + 5 * i + Math.cos(ptNum * 0.61) * 1.5
          : baseN + dn,
        elevation: Math.round(z * 1000) / 1000,
        code: group.code,
        description: def?.description ?? '',
      })
      ptNum++
    }
  }
  return points
}

// ─── DXF generation now lives in src/lib/drawing/topoEntities.ts so previews,
// exports and PDF rendering all consume one shared entity model. ─────────────

// __DEL1__
// ─── Download helper ────────────────────────────────────────────────────────

function downloadDXF(dxfString: string, filename: string) {
  const blob = new Blob([dxfString], { type: 'application/dxf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Stats calculator ──────────────────────────────────────────────────────

function computeStats(
  points: SurveyPointRow[],
  layerResults: LayerMappingResult[],
): DrawingStats {
  const catCount: Record<string, number> = {}
  let joinableLines = 0

  for (const p of points) {
    const def = getFeatureCode(p.code)
    const cat = def?.category ?? 'other'
    catCount[cat] = (catCount[cat] || 0) + 1
  }

  for (const lr of layerResults) {
    joinableLines += lr.polylines.length
  }

  return {
    totalPoints: points.length,
    totalLayers: layerResults.length,
    joinableLineCount: joinableLines,
    pointsByCategory: catCount,
  }
}

// ─── CSV parser ─────────────────────────────────────────────────────────────

function parseCSV(text: string): SurveyPointRow[] {
  return readDrawingCsv(text)
}


// ─── Manual add row ─────────────────────────────────────────────────────────

function ManualAddRow({ onAdd }: { onAdd: (pt: SurveyPointRow) => void }) {
  const [ptNum, setPtNum] = useState('')
  const [easting, setEasting] = useState('')
  const [northing, setNorthing] = useState('')
  const [rl, setRl] = useState('')
  const [code, setCode] = useState('SH')
  const [error, setError] = useState('')

  const handleAdd = useCallback(() => {
    const e = coordinateNumber(easting), n = coordinateNumber(northing), elevation = coordinateNumber(rl)
    if (!Number.isFinite(e) || !Number.isFinite(n) || elevation !== undefined && !Number.isFinite(elevation)) { setError('Enter complete finite coordinates and a finite height, or leave height unknown.'); return }
    setError('')

    onAdd({
      id: `manual-${crypto.randomUUID()}`,
      pointNumber: ptNum || undefined,
      easting: e as number,
      northing: n as number,
      elevation,
      code: code.toUpperCase(),
      description: getFeatureCode(code)?.description ?? '',
    })

    setPtNum('')
    setEasting('')
    setNorthing('')
    setRl('')
  }, [ptNum, easting, northing, rl, code, onAdd])

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 bg-zinc-900/50 border border-zinc-800 rounded-md">
      {error && <p role="alert">{error}</p>}
      <Input
        placeholder="#"
        value={ptNum}
        onChange={e => setPtNum(e.target.value)}
        className="h-7 w-14 text-xs bg-zinc-800 border-zinc-700 text-zinc-300"
      />
      <Input
        placeholder="Easting"
        value={easting}
        onChange={e => setEasting(e.target.value)}
        className="h-7 w-28 text-xs bg-zinc-800 border-zinc-700 text-zinc-300"
      />
      <Input
        placeholder="Northing"
        value={northing}
        onChange={e => setNorthing(e.target.value)}
        className="h-7 w-28 text-xs bg-zinc-800 border-zinc-700 text-zinc-300"
      />
      <Input
        placeholder="RL"
        value={rl}
        onChange={e => setRl(e.target.value)}
        className="h-7 w-20 text-xs bg-zinc-800 border-zinc-700 text-zinc-300"
      />
      <Input
        placeholder="Code"
        value={code}
        onChange={e => setCode(e.target.value)}
        className="h-7 w-20 text-xs bg-zinc-800 border-zinc-700 text-zinc-300 font-mono"
      />
      <Button size="sm" variant="outline" onClick={handleAdd} className="h-7 text-xs">
        <Plus size={12} />
        Add
      </Button>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

interface TopoDrawingComposerProps {
  projectId?: string
}

export default function TopoDrawingComposer({ projectId }: TopoDrawingComposerProps) {
  const { data: session, status } = useSession()
  const userId = session?.user?.id
  if (projectId && (status !== 'authenticated' || !userId)) return <p role="status">{status === 'loading' ? 'Checking account…' : 'Sign in to load this project drawing.'}</p>
  return <DrawingWorkspace key={`${userId ?? 'anonymous'}:${projectId ?? 'local'}`} projectId={projectId} />
}

function DrawingWorkspace({ projectId }: TopoDrawingComposerProps) {
  const [points, setPoints] = useState<SurveyPointRow[]>([])
  const [horizontalCrs, setHorizontalCrs] = useState('')
  const [verticalDatum, setVerticalDatum] = useState('')
  const [metresConfirmed, setMetresConfirmed] = useState(false)
  const [referenceHash, setReferenceHash] = useState('')
  const [sourceError, setSourceError] = useState('')
  const [projectLoading, setProjectLoading] = useState(Boolean(projectId))
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [exporting, setExporting] = useState(false)
  const exportLock = useRef(false)
  const alive = useRef(true)
  const importVersion = useRef(0)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    setProjectLoading(true); setSourceError(''); setPoints([]); setReferenceHash(''); setHorizontalCrs(''); setVerticalDatum('')
    void (async () => {
      try {
        const options = { cache: 'no-store' as const, signal: controller.signal }
        const [pointResponse, contextResponse] = await Promise.all([
          fetch(`/api/project/${encodeURIComponent(projectId)}/points?includeIncomplete=true`, options),
          fetch(`/api/project/${encodeURIComponent(projectId)}/point-imports`, options),
        ])
        if (!pointResponse.ok || !contextResponse.ok) throw new Error('Could not load this private project. Check access and retry.')
        const source = readProjectDrawingSource(projectId, await pointResponse.json(), await contextResponse.json())
        if (controller.signal.aborted) return
        setPoints(source.points); setHorizontalCrs(source.reference.code ?? ''); setVerticalDatum(source.reference.verticalDatum ?? '')
        setReferenceHash(source.referenceHash); setMetresConfirmed(true)
        if (!source.points.length) setSourceError('This project has no saved points. Import observations through the project first.')
      } catch (failure) { if (!controller.signal.aborted) setSourceError(failure instanceof Error ? failure.message : 'Could not load project observations.') }
      finally { if (!controller.signal.aborted) setProjectLoading(false) }
    })()
    return () => controller.abort()
  }, [projectId, loadAttempt])
  const [isDemoData, setIsDemoData] = useState(false)
  const [settings, setSettings] = useState<DrawingSettings>(DEFAULT_SETTINGS)
  const [codeDialogOpen, setCodeDialogOpen] = useState(false)
  const [editingPointId, setEditingPointId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showStats, setShowStats] = useState(true)
  const [showLayerPreview] = useState(true)
  const [activeTab, setActiveTab] = useState<'points' | 'layers' | 'preview'>('points')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Derived state ─────────────────────────────────────────────────────
  // Contours use the same TIN engine as saved project surfaces.
  const contourResult = useMemo<{ contours: ContourLine[]; error: string | null }>(() => {
    const zPts = points.filter(p => p.elevation !== undefined)
    if (zPts.length !== points.length) return { contours: [], error: 'Some source heights are unknown. Review the full observations before generating terrain; no rows were excluded.' }
    if (zPts.length < 3) return { contours: [], error: null }
    try {
      const tin = buildBreaklineTIN(zPts.map(p => ({ x: p.easting, y: p.northing, z: p.elevation as number })))
      return { contours: generateTINContours(tin, { interval: settings.contourInterval }), error: null }
    } catch (error) {
      return { contours: [], error: error instanceof Error ? error.message : 'Contour computation failed. Review the survey observations.' }
    }
  }, [points, settings.contourInterval])
  const { contours, error: contourError } = contourResult

  const surveyPoints = useMemo(
    () => points.map(({ id: _id, description: _description, ...rest }) => rest),
    [points],
  )
  const drawingCrs = useMemo(() => { try { return resolveEpsg(horizontalCrs).code } catch { return '' } }, [horizontalCrs])

  // One shared entity model → preview AND DXF stay identical
  const drawing = useMemo(
    () => {
      try {
        return { ...buildTopoEntities(surveyPoints, settings, {
          projectName: projectId ?? 'Topographic Survey', contours,
          reference: drawingCrs ? { horizontalCrs: drawingCrs, verticalDatum: verticalDatum || null } : undefined,
        }), error: null }
      } catch (failure) {
        return { entities: [], layers: [], layerResults: [], extents: computeExtents([]), error: failure instanceof Error ? failure.message : 'Drawing preparation failed. Review its settings.' }
      }
    },
    [surveyPoints, settings, projectId, contours, drawingCrs, verticalDatum],
  )
  const currentDrawing = useRef(drawing)
  currentDrawing.current = drawing

  const layerResults = drawing.layerResults

  const stats = useMemo(
    () => computeStats(points, layerResults),
    [points, layerResults],
  )

  // Group layers by category for preview
  const layersByCategory = useMemo(() => {
    const groups = getAllGroups()
    const result: Array<{ category: string; categoryName: string; layers: LayerMappingResult[] }> = []

    // Build a direct layer-name to category map (O(n) instead of O(n*m*find))
    const layerCatMap = new Map<string, string>()
    for (const p of points) {
      const def = getFeatureCode(p.code)
      if (def && !layerCatMap.has(def.dxfLayer)) {
        layerCatMap.set(def.dxfLayer, def.category)
      }
    }

    for (const group of groups) {
      const matching = layerResults.filter(lr => {
        const cat = layerCatMap.get(lr.layer)
        if (!cat) return lr.layer.toLowerCase().includes(group.category)
        return cat === group.category
      })
      if (matching.length === 0) continue
      result.push({
        category: group.category,
        categoryName: group.name,
        layers: matching,
      })
    }
    return result
  }, [layerResults, points])

  // ─── Actions ───────────────────────────────────────────────────────────

  const handleImportCSV = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const version = ++importVersion.current

    setSourceError('')
    if (file.size > 2_000_000) { setSourceError('Import at most 2 MB of coordinate text.'); e.target.value = ''; return }
    const reader = new FileReader()
    reader.onload = () => {
      if (!alive.current || version !== importVersion.current) return
      try {
        const parsed = parseCSV(reader.result as string)
        setPoints(parsed)
        setIsDemoData(false)
        setHorizontalCrs(''); setVerticalDatum(''); setMetresConfirmed(false)
      } catch (failure) { setSourceError(failure instanceof Error ? failure.message : 'Could not read coordinate CSV. No rows were imported.') }
    }
    reader.onerror = () => { if (alive.current && version === importVersion.current) setSourceError('Could not read coordinate CSV. No rows were imported.') }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  const handleLoadDemo = useCallback(() => {
    importVersion.current++
    setPoints(generateDemoPoints())
    setIsDemoData(true)
  }, [])

  const handleClearPoints = useCallback(() => {
    importVersion.current++
    setPoints([])
    setIsDemoData(false)
  }, [])

  const handleRemovePoint = useCallback((id: string) => {
    importVersion.current++
    setPoints(prev => prev.filter(p => p.id !== id))
  }, [])

  const handleAddPoint = useCallback((pt: SurveyPointRow) => {
    importVersion.current++
    if (points.length >= MAX_DRAWING_POINTS || points.some(point => point.pointNumber && point.pointNumber === pt.pointNumber)) { setSourceError('Point limit or duplicate point name. No point was added.'); return }
    setPoints(prev => [...prev, pt])
  }, [points])

  const handleCodeSelect = useCallback((code: FeatureCodeDef) => {
    if (editingPointId) {
      setPoints(prev =>
        prev.map(p =>
          p.id === editingPointId
            ? { ...p, code: code.code, description: code.description }
            : p,
        ),
      )
    }
    setCodeDialogOpen(false)
    setEditingPointId(null)
  }, [editingPointId])

  const handleOpenCodeDialog = useCallback((pointId: string) => {
    setEditingPointId(pointId)
    setCodeDialogOpen(true)
  }, [])

  const referenceIssue = drawingReferenceIssue(points, horizontalCrs, verticalDatum)
  const exportIssue = drawing.error || referenceIssue || (!metresConfirmed ? 'Confirm that horizontal coordinates and measured heights use metres.' : null)
  const handleExportDXF = useCallback(async () => {
    if (points.length === 0 || isDemoData || contourError || exportIssue || projectLoading || exportLock.current) return
    exportLock.current = true
    setExporting(true); setSourceError('')
    try {
      if (projectId) {
        const response = await fetch(`/api/project/${encodeURIComponent(projectId)}/point-imports`, { cache: 'no-store' })
        const body: unknown = await response.json()
        const context = body && typeof body === 'object' && 'data' in body ? body.data : null
        if (!response.ok || !context || typeof context !== 'object' || !('referenceHash' in context) || context.referenceHash !== referenceHash || !('referenceSystem' in context) || resolveDeclaredStageReference(context.referenceSystem).code !== horizontalCrs) throw new Error('Project reference or access changed. Reload project points before exporting.')
      }
      if (!alive.current) return
      if (currentDrawing.current !== drawing) throw new Error('The drawing changed while export was being checked. Review the current drawing and export again.')
      const dxf = entitiesToDxfString(drawing.entities, drawing.layers)
      const date = new Date().toISOString().split('T')[0]
      downloadDXF(dxf, `topo_${projectId ?? 'survey'}_${date}.dxf`)
    } catch (failure) { if (alive.current) setSourceError(failure instanceof Error ? failure.message : 'DXF export failed.') }
    finally { exportLock.current = false; if (alive.current) setExporting(false) }
  }, [points, drawing, projectId, isDemoData, contourError, exportIssue, projectLoading, referenceHash, horizontalCrs])

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4" style={{ '--bg-tertiary': '#09090b', '--border-color': '#3f3f46', '--accent': '#3b82f6', '--text-muted': '#71717a' } as React.CSSProperties}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-zinc-900 border border-zinc-700 rounded-lg">
        <div className="flex items-center gap-3">
          <Layers size={20} className="text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Topo Drawing Composer</h2>
            <p className="text-xs text-zinc-500">
              {points.length > 0
                ? `${points.length} points across ${stats.totalLayers} layers`
                : 'Import survey points to begin'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!projectId && <>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="text-xs border-zinc-600 text-zinc-300 hover:bg-zinc-800">
            <Upload size={14} />
            Import CSV
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleImportCSV} className="hidden" />
          <Button variant="outline" size="sm" onClick={handleLoadDemo} className="text-xs border-zinc-600 text-zinc-300 hover:bg-zinc-800">
            <FilePlus size={14} />
            Load Example (fictional)
          </Button>
          </>}
          {points.length > 0 && (
            <>
              {!projectId &&
              <Button variant="outline" size="sm" onClick={handleClearPoints} className="text-xs border-red-800/50 text-red-400 hover:bg-red-900/20">
                <Trash2 size={14} />
                Clear
              </Button>}
              <Button variant="outline" size="sm" onClick={handleExportDXF} disabled={isDemoData || Boolean(contourError) || Boolean(exportIssue) || projectLoading || exporting} className="text-xs border-blue-600/50 text-blue-400 hover:bg-blue-900/20 hover:text-blue-300">
                <Download size={14} />
                {exporting ? 'Checking export…' : 'Export DXF'}
              </Button>
            </>
          )}
        </div>
      </div>

      {projectId ? <div className="space-y-2 rounded-lg border border-zinc-700 p-4 text-sm text-zinc-300">
        <p>Project observations · {horizontalCrs || 'Reference not loaded'} · Height reference: {verticalDatum || 'Not declared'}</p>
        <p>Saved coordinates are read only here. Feature-code changes affect this draft only. No field verification or professional approval is established.</p>
        <a className="underline" href={`/project/${encodeURIComponent(projectId)}/observe`}>Review original observations and imports</a>
        <button className="ml-4 underline" disabled={projectLoading || exporting} onClick={() => setLoadAttempt(value => value + 1)}>Reload project points</button>
      </div> : <div className="space-y-3 rounded-lg border border-zinc-700 p-4 text-sm text-zinc-300">
        <p>Local draft. Importing CSV replaces this local set. Use id, easting, northing, elevation and code headers; no measurements are transformed here.</p>
        <label className="block">Horizontal CRS (projected metres)<Input value={horizontalCrs} onChange={event => setHorizontalCrs(event.target.value)} placeholder="EPSG code" /></label>
        <label className="block">Height reference<Input value={verticalDatum} onChange={event => setVerticalDatum(event.target.value)} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={metresConfirmed} onChange={event => setMetresConfirmed(event.target.checked)} />Horizontal coordinates and measured heights are in metres.</label>
      </div>}
      {projectLoading && <p role="status">Loading private project observations…</p>}
      {sourceError && <p role="alert" className="text-red-300">{sourceError}</p>}
      {drawing.error && <p role="alert" className="text-red-300">Drawing could not be prepared: {drawing.error}</p>}
      {points.length > 0 && exportIssue && <p role="status" className="text-amber-200">{exportIssue}</p>}

      {contourError && <div role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">Contours could not be computed: {contourError} Review the observations or contour interval before exporting.</div>}

      {isDemoData && (
        <div role="status" className="rounded-lg border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-200">
          EXAMPLE DATA — fictional coordinates preview the drawing tools. Clear this set and import or enter observed points before exporting a survey drawing.
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-700 rounded-lg p-1">
        {[
          { key: 'points' as const, label: 'Points', icon: <FilePlus size={14} /> },
          { key: 'layers' as const, label: 'Layers', icon: <Layers size={14} /> },
          { key: 'preview' as const, label: 'Preview', icon: <Eye size={14} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.key === 'layers' && stats.totalLayers > 0 && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-zinc-800 text-zinc-400">
                {stats.totalLayers}
              </Badge>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Left column: main content ──────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* TAB: Points */}
          {activeTab === 'points' && (
            <div className="space-y-3">
              {/* Manual add row */}
              {!projectId && <ManualAddRow onAdd={handleAddPoint} />}

              {/* Points table */}
              <div className="border border-zinc-700 rounded-lg overflow-hidden bg-zinc-900">
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-zinc-800">
                      <tr className="text-zinc-400 border-b border-zinc-700">
                        <th className="px-2 py-2 text-left font-medium">#</th>
                        <th className="px-2 py-2 text-right font-medium">Easting</th>
                        <th className="px-2 py-2 text-right font-medium">Northing</th>
                        <th className="px-2 py-2 text-right font-medium">RL</th>
                        <th className="px-2 py-2 text-left font-medium">Code</th>
                        <th className="px-2 py-2 text-left font-medium">Description</th>
                        <th className="px-2 py-2 text-center font-medium w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {points.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                            No points imported. Import CSV or add surveyed points manually. The fictional example is for preview only.
                          </td>
                        </tr>
                      )}
                      {points.map((p, idx) => {
                        const def = getFeatureCode(p.code)
                        return (
                          <tr
                            key={p.id}
                            className="border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors"
                          >
                            <td className="px-2 py-1.5 text-zinc-500">{p.pointNumber ?? idx + 1}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-zinc-300">
                              {p.easting.toFixed(3)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-zinc-300">
                              {p.northing.toFixed(3)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-zinc-400">
                              {p.elevation !== undefined ? p.elevation.toFixed(3) : '—'}
                            </td>
                            <td className="px-2 py-1.5">
                              <button
                                onClick={() => handleOpenCodeDialog(p.id)}
                                className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-xs font-mono font-semibold transition-colors hover:bg-zinc-700"
                                style={{
                                  color: def ? (aciToHex(def.color) === '#FFFFFF' ? '#94a3b8' : aciToHex(def.color)) : '#71717a',
                                }}
                                title="Click to change code"
                              >
                                {p.code}
                                {def?.joinLines && <Link2 size={10} className="text-blue-400/50" />}
                              </button>
                            </td>
                            <td className="px-2 py-1.5 text-zinc-400 truncate max-w-[160px]">
                              {p.description || def?.description || '—'}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {!projectId && <button
                                onClick={() => handleRemovePoint(p.id)}
                                className="text-zinc-600 hover:text-red-400 transition-colors"
                                title="Remove point"
                              >
                                <X size={12} />
                              </button>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Layers */}
          {activeTab === 'layers' && (
            <div className="border border-zinc-700 rounded-lg bg-zinc-900 overflow-hidden">
              <ScrollArea className="max-h-[500px]">
                <div className="p-3 space-y-3">
                  {layersByCategory.length === 0 && (
                    <div className="py-8 text-center text-sm text-zinc-500">
                      Import points to see layer breakdown
                    </div>
                  )}
                  {layersByCategory.map(group => (
                    <div key={group.category}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          {group.categoryName}
                        </span>
                        <div className="flex-1 h-px bg-zinc-800" />
                      </div>
                      <div className="space-y-1">
                        {group.layers.map(lr => (
                          <div
                            key={lr.layer}
                            className="flex items-center gap-2 px-2 py-1.5 rounded bg-zinc-800/40 hover:bg-zinc-800/70 transition-colors"
                          >
                            <span
                              className="w-3 h-3 rounded-sm shrink-0 border border-zinc-600"
                              style={{ backgroundColor: aciToHex(lr.color) === '#FFFFFF' ? '#52525b' : aciToHex(lr.color) }}
                            />
                            <span className="font-mono text-xs text-zinc-300 flex-1">{lr.layer}</span>
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-zinc-700 text-zinc-300">
                              {lr.points.length} pts
                            </Badge>
                            {lr.polylines.length > 0 && (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-blue-900/30 text-blue-400">
                                {lr.polylines.length} lines
                              </Badge>
                            )}
                            <span className="text-[10px] text-zinc-600 font-mono">{lr.lineType}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* TAB: Preview — identical to DXF export (shared entity model) */}
          {activeTab === 'preview' && (
            <div className="border border-zinc-700 rounded-lg bg-zinc-900 overflow-hidden">
              <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-zinc-800">
                <span className="text-xs text-zinc-400">
                  Drawing preview — matches DXF export
                </span>
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <span>1:{settings.scale}</span>
                  <span>·</span>
                  <span>{settings.contourInterval} m contours</span>
                  {contours.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{contours.length} contour lines</span>
                    </>
                  )}
                </div>
              </div>
              <div className="p-3">
                <TopoEntityCanvas
                  entities={drawing.entities}
                  layers={drawing.layers}
                  extents={drawing.extents}
                  height={480}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: settings & stats ─────────────────────────── */}
        <div className="space-y-4 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">

          {/* Drawing Settings */}
          <div className="border border-zinc-700 rounded-lg bg-zinc-900 overflow-hidden">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Settings2 size={14} className="text-zinc-400" />
                Drawing Settings
              </span>
              {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showSettings && (
              <div className="px-4 pb-4 space-y-3 border-t border-zinc-800">
                {/* Scale */}
                <div className="pt-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Drawing Scale</div>
                  <div className="flex gap-1 mt-1.5">
                    {SCALE_OPTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => setSettings(prev => ({ ...prev, scale: s }))}
                        className={`flex-1 px-2 py-1 rounded text-xs font-mono transition-colors border ${
                          settings.scale === s
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        1:{s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      aria-label="Include spot height labels"
                      checked={settings.includeSpotHeights}
                      onCheckedChange={v => setSettings(prev => ({ ...prev, includeSpotHeights: !!v }))}
                      className="border-zinc-600"
                    />
                    <span className="text-xs text-zinc-300">Include spot height labels</span>
                  </div>
                  <div className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      aria-label="Include title block"
                      checked={settings.includeTitleBlock}
                      onCheckedChange={v => setSettings(prev => ({ ...prev, includeTitleBlock: !!v }))}
                      className="border-zinc-600"
                    />
                    <span className="text-xs text-zinc-300">Include title block</span>
                  </div>
                  <div className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      aria-label="Include point labels"
                      checked={settings.includeLabels}
                      onCheckedChange={v => setSettings(prev => ({ ...prev, includeLabels: !!v }))}
                      className="border-zinc-600"
                    />
                    <span className="text-xs text-zinc-300">Include point labels</span>
                  </div>
                  <div className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      aria-label="Include legend"
                      checked={settings.includeLegend}
                      onCheckedChange={v => setSettings(prev => ({ ...prev, includeLegend: !!v }))}
                      className="border-zinc-600"
                    />
                    <span className="text-xs text-zinc-300">Include legend</span>
                  </div>
                </div>

                {/* Contour & Grid intervals */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="tdc-contour-interval" className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Contour Interval (m)</label>
                    <Input
                      id="tdc-contour-interval"
                      type="number"
                      step="0.5"
                      min="0.25"
                      value={settings.contourInterval}
                      onChange={e => setSettings(prev => ({ ...prev, contourInterval: parseFloat(e.target.value) || 1 }))}
                      className="h-8 mt-1 text-xs bg-zinc-800 border-zinc-700 text-zinc-300"
                    />
                  </div>
                  <div>
                    <label htmlFor="tdc-grid-tick" className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Grid Tick (m)</label>
                    <Input
                      id="tdc-grid-tick"
                      type="number"
                      step="10"
                      min="10"
                      value={Number.isFinite(settings.gridTickInterval) ? settings.gridTickInterval : ''}
                      onChange={e => setSettings(prev => ({ ...prev, gridTickInterval: parseFloat(e.target.value) }))}
                      className="h-8 mt-1 text-xs bg-zinc-800 border-zinc-700 text-zinc-300"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="border border-zinc-700 rounded-lg bg-zinc-900 overflow-hidden">
            <button
              onClick={() => setShowStats(!showStats)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <BarChart3 size={14} className="text-zinc-400" />
                Statistics
              </span>
              {showStats ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showStats && (
              <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded bg-zinc-800/50">
                    <div className="text-lg font-bold text-blue-400">{stats.totalPoints}</div>
                    <div className="text-[10px] text-zinc-500">Points</div>
                  </div>
                  <div className="text-center p-2 rounded bg-zinc-800/50">
                    <div className="text-lg font-bold text-emerald-400">{stats.totalLayers}</div>
                    <div className="text-[10px] text-zinc-500">Layers</div>
                  </div>
                  <div className="text-center p-2 rounded bg-zinc-800/50">
                    <div className="text-lg font-bold text-amber-400">{stats.joinableLineCount}</div>
                    <div className="text-[10px] text-zinc-500">Lines</div>
                  </div>
                </div>

                {Object.keys(stats.pointsByCategory).length > 0 && (
                  <div className="space-y-1 mt-2">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Points by Category</div>
                    {Object.entries(stats.pointsByCategory)
                      .sort(([, a], [, b]) => b - a)
                      .map(([cat, count]) => (
                        <div key={cat} className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400 capitalize flex-1">{cat}</span>
                          <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500/60 rounded-full"
                              style={{ width: `${Math.min(100, (count / stats.totalPoints) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-500 font-mono w-6 text-right">{count}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Layer Preview Summary */}
          {showLayerPreview && layerResults.length > 0 && (
            <div className="border border-zinc-700 rounded-lg bg-zinc-900 overflow-hidden">
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Layers size={14} className="text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-200">Layer Preview</span>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-zinc-800 text-zinc-400 ml-auto">
                    {layerResults.length} layers
                  </Badge>
                </div>
                <ScrollArea className="max-h-[300px]">
                  <div className="space-y-1 pr-2">
                    {layerResults.map(lr => (
                      <div key={lr.layer} className="flex items-center gap-2 text-xs">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{
                            backgroundColor:
                              aciToHex(lr.color) === '#FFFFFF' ? '#52525b' : aciToHex(lr.color),
                          }}
                        />
                        <span className="font-mono text-zinc-400 flex-1 truncate">{lr.layer}</span>
                        <span className="text-zinc-600">{lr.points.length}</span>
                      </div>
                    ))}
                    
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Code picker dialog ──────────────────────────────────────── */}
      <Dialog open={codeDialogOpen} onOpenChange={setCodeDialogOpen}>
        <DialogContent className="sm:max-w-[520px] bg-zinc-900 border-zinc-700 p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-zinc-100">Select Feature Code</DialogTitle>
            <DialogDescription className="text-zinc-500 text-xs">
              Choose a feature code to assign to the selected point
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <FeatureCodeBrowser
              onSelect={handleCodeSelect}
              selectedCode={editingPointId ? points.find(p => p.id === editingPointId)?.code : undefined}
              compact={false}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
