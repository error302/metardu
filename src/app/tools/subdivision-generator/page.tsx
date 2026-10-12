'use client'

import { useState, useCallback, useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  generateSubdivision,
  KENYA_PLOT_PRESETS,
  KENYA_ROAD_PRESETS,
  type SubdivisionResult,
} from '@/lib/compute/subdivisionGenerator'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { Building } from 'lucide-react'
import { SubdivisionPlanModal } from '@/components/cad-editor/SubdivisionPlanModal'
import type { SubdivisionPlanData } from '@/lib/reports/subdivisionPlan/types'
import type { CADDocument } from '@/components/cad-editor/CADEditor'
import { closedSubdivisionPortionFromCad } from '@/lib/reports/subdivisionPlan/fromCadDocument'
import { isSimplePolygonRing } from '@/lib/spatial/simplePolygon'
import { resolveProjectCadCrs } from '@/lib/cad/projectCadDocument'

interface CoordRow {
  id: number
  easting: string
  northing: string
}

function openRing(coordinates: [number, number][]): [number, number][] {
  if (coordinates.length > 1
    && coordinates[0][0] === coordinates[coordinates.length - 1][0]
    && coordinates[0][1] === coordinates[coordinates.length - 1][1]) return coordinates.slice(0, -1)
  return coordinates
}

export default function SubdivisionGeneratorPage() {
  useLanguage()
  const [rows, setRows] = useState<CoordRow[]>([])
  const [projectCrs, setProjectCrs] = useState('')
  const [result, setResult] = useState<SubdivisionResult | null>(null)
  const [plotPreset, setPlotPreset] = useState(0) // 50×100 default
  const [customWidth, setCustomWidth] = useState('')
  const [customDepth, setCustomDepth] = useState('')
  const [roadPreset, setRoadPreset] = useState(0) // 9m default
  const [roadPlacement, setRoadPlacement] = useState<'center' | 'edge'>('center')
  const [generating, setGenerating] = useState(false)
  const [schemeModalOpen, setSchemeModalOpen] = useState(false)

  const roadWidth = KENYA_ROAD_PRESETS[roadPreset].width

  // Keep the export draft tied to this run's declared CRS and generated geometry.
  const schemePlanData = useMemo<Partial<SubdivisionPlanData>>(() => {
    if (!result) return {}
    return {
      projectCrs,
      portions: result.plots.map(p => ({
        id: p.id,
        label: p.label,
        areaHa: parseFloat((p.areaSqM / 10000).toFixed(4)),
        areaSqM: p.areaSqM,
        boundaryPoints: openRing(p.coordinates).map(([e, n]) => ({ easting: e, northing: n })),
      })),
      roadReserves: [
        {
          label: 'Generated access road reserve',
          widthM: roadWidth,
          boundaryRings: result.roadReserve.boundaryRings.map((ring) => openRing(ring).map(([e, n]) => ({ easting: e, northing: n }))),
        },
      ],
    }
  }, [projectCrs, result, roadWidth])

  const plotWidth = plotPreset === KENYA_PLOT_PRESETS.length - 1
    ? Number(customWidth)
    : KENYA_PLOT_PRESETS[plotPreset].width
  const plotDepth = plotPreset === KENYA_PLOT_PRESETS.length - 1
    ? Number(customDepth)
    : KENYA_PLOT_PRESETS[plotPreset].depth

  const addRow = () => {
    setResult(null)
    setRows(prev => [...prev, { id: Math.max(0, ...prev.map(row => row.id)) + 1, easting: '', northing: '' }])
  }
  const removeRow = (id: number) => {
    setResult(null)
    setRows(prev => prev.filter(r => r.id !== id))
  }
  const updateRow = (id: number, field: 'easting' | 'northing', value: string) =>
    { setResult(null); setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r))) }

  const runSubdivision = useCallback(() => {
    try {
      resolveProjectCadCrs(projectCrs)
    } catch {
      alert('Enter the project CRS exactly as declared by the survey control or source plan. METARDU cannot infer a datum or UTM zone.')
      return
    }

    if (!Number.isFinite(plotWidth) || plotWidth <= 0 || !Number.isFinite(plotDepth) || plotDepth <= 0) {
      alert('Enter positive finite target plot width and depth in metres.')
      return
    }

    if (rows.some((row) => !row.easting.trim() || !row.northing.trim())) {
      alert('Complete every boundary easting and northing before generating.')
      return
    }
    const coords: [number, number][] = rows.map(r => [Number(r.easting), Number(r.northing)])
    const openCoords = coords.length > 1
      && coords[0][0] === coords[coords.length - 1][0]
      && coords[0][1] === coords[coords.length - 1][1]
      ? coords.slice(0, -1)
      : coords

    if (!isSimplePolygonRing(openCoords.map(([easting, northing]) => ({ easting, northing })))) {
      alert('Parent boundary must be a finite, non-self-intersecting ring with at least three distinct vertices.')
      return
    }

    setGenerating(true)
    try {
      const res = generateSubdivision({
        parentBoundary: coords,
        plotWidth,
        plotDepth,
        roadWidth,
        roadPlacement,
      })
      setResult(res)
    } catch (err) {
      alert(`Subdivision failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setGenerating(false)
    }
  }, [projectCrs, rows, plotWidth, plotDepth, roadWidth, roadPlacement])

  const loadFromProject = async () => {
    const projectId = prompt('Enter project ID:')
    if (!projectId) return
    try {
      const res = await fetch(`/api/project/${projectId}/cad-document`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed')
      const json = (await res.json()) as { document?: CADDocument }
      const boundary = closedSubdivisionPortionFromCad(json.document)
      if (!boundary) throw new Error('No explicit closed CAD boundary with a registered CRS was found.')
      const newRows: CoordRow[] = boundary.portion.boundaryPoints.map((p, i: number) => ({
        id: i + 1,
        easting: String(p.easting),
        northing: String(p.northing),
      }))
      setRows(newRows)
      setProjectCrs(boundary.projectCrs)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not load a validated project CAD boundary.')
    }
  }

  const exportBeacons = () => {
    if (!result) return
    const csv = 'Beacon ID,Easting,Northing,Shared by plots\n' +
      result.beacons.map(b => `${b.id},${b.easting.toFixed(3)},${b.northing.toFixed(3)},${b.sharedBy.join(' ')}`).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'subdivision-beacons.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10">
      <PageHeader
        title="Generative subdivision"
        subtitle="Explore a draft plot layout from an ordered parent boundary. Review the geometry and ground evidence before any design or stakeout use."
        reference="Coordinate output uses the explicitly declared project CRS; confirm planning rules with the responsible authority."
        badge="Cadastral"
      />

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        {/* Left: input controls */}
        <div className="space-y-4">
          {/* Parent boundary */}
          <div className="card">
            <div className="card-header">
              <span className="label">Parent parcel boundary</span>
              <button onClick={loadFromProject} className="font-mono text-[10px] text-[var(--accent)] hover:opacity-80 tracking-[0.06em] uppercase">
                Load saved CAD boundary →
              </button>
            </div>
            <div className="card-body">
              <p className="text-xs text-[var(--text-muted)] mb-4 font-mono">
                Enter boundary vertices in order in the project’s registered projected metre CRS. Survey control points alone are not a parcel boundary.
              </p>
              <div className="mb-4">
                <label className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase block mb-1" htmlFor="project-crs">Project CRS (required)</label>
                <input
                  id="project-crs"
                  className="input font-mono text-sm"
                  value={projectCrs}
                  onChange={event => { setResult(null); setProjectCrs(event.target.value) }}
                  placeholder="EPSG:21037"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Use the exact code declared by project control or the source plan. EPSG:3857 and geographic-degree systems are not accepted for survey area calculations.</p>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[40px_1fr_1fr_32px] gap-2 items-center font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase">
                  <span>#</span><span>Easting (m)</span><span>Northing (m)</span><span></span>
                </div>
                {rows.map(row => (
                  <div key={row.id} className="grid grid-cols-[40px_1fr_1fr_32px] gap-2 items-center">
                    <span className="font-mono text-xs text-[var(--text-muted)]">{row.id}</span>
                    <input className="input font-mono text-sm" value={row.easting} onChange={e => updateRow(row.id, 'easting', e.target.value)} aria-label="Easting (m)" placeholder="274812.403" />
                    <input className="input font-mono text-sm" value={row.northing} onChange={e => updateRow(row.id, 'northing', e.target.value)} aria-label="Northing (m)" placeholder="9856214.778" />
                    <button onClick={() => removeRow(row.id)} className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors text-sm">×</button>
                  </div>
                ))}
              </div>
              <button onClick={addRow} className="mt-3 font-mono text-[11px] text-[var(--accent)] hover:opacity-80 tracking-[0.04em]">+ Add vertex</button>
            </div>
          </div>

          {/* Plot size */}
          <div className="card">
            <div className="card-header"><span className="label">Target plot size</span></div>
            <div className="card-body">
              <select aria-label="Target plot size" value={plotPreset} onChange={e => { setResult(null); setPlotPreset(parseInt(e.target.value)) }} className="input text-sm mb-3">
                {KENYA_PLOT_PRESETS.map((opt, i) => (
                  <option key={opt.label} value={i}>{opt.label}</option>
                ))}
              </select>
              {plotPreset === KENYA_PLOT_PRESETS.length - 1 && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase" htmlFor="width-m">Width (m)</label>
                    <input id="width-m" aria-label="Width (m)" className="input font-mono text-sm" type="number" value={customWidth} onChange={e => { setResult(null); setCustomWidth(e.target.value) }} />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase" htmlFor="depth-m">Depth (m)</label>
                    <input id="depth-m" aria-label="Depth (m)" className="input font-mono text-sm" type="number" value={customDepth} onChange={e => { setResult(null); setCustomDepth(e.target.value) }} />
                  </div>
                </div>
              )}
              <p className="text-xs text-[var(--text-muted)] mt-2 font-mono">
                Selected: {plotWidth.toFixed(2)}m × {plotDepth.toFixed(2)}m = {(plotWidth * plotDepth).toFixed(1)}m²
              </p>
            </div>
          </div>

          {/* Road reserve */}
          <div className="card">
            <div className="card-header"><span className="label">Road reserve</span></div>
            <div className="card-body">
              <select aria-label="Road reserve" value={roadPreset} onChange={e => { setResult(null); setRoadPreset(parseInt(e.target.value)) }} className="input text-sm mb-3">
                {KENYA_ROAD_PRESETS.map((opt, i) => (
                  <option key={opt.label} value={i}>{opt.label}</option>
                ))}
              </select>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input aria-label="Center" type="radio" checked={roadPlacement === 'center'} onChange={() => { setResult(null); setRoadPlacement('center') }} />
                  Center spine
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input aria-label="Edge" type="radio" checked={roadPlacement === 'edge'} onChange={() => { setResult(null); setRoadPlacement('edge') }} />
                  Edge road
                </label>
              </div>
            </div>
          </div>

          <button onClick={runSubdivision} disabled={generating} className="btn btn-primary w-full">
            {generating ? 'Generating...' : 'Generate subdivision'}
          </button>
        </div>

        {/* Right: results */}
        <div>
          {!result ? (
            <div className="card">
              <div className="card-body text-center py-16">
                <p className="text-sm text-[var(--text-muted)]">Configure parameters and generate.</p>
                <p className="text-xs text-[var(--text-muted)] mt-2 font-mono">Plots, road reserve, and beacons will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="card">
                <div className="card-header"><span className="label">Yield report</span></div>
                <div className="card-body grid grid-cols-2 gap-4">
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Plots yielded</div>
                    <div className="font-display text-3xl text-[var(--accent)] tracking-[-0.02em]">{result.stats.totalPlots}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Rows</div>
                    <div className="font-display text-3xl text-[var(--text-primary)] tracking-[-0.02em]">{result.stats.rowsCreated}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Plot area</div>
                    <div className="font-display text-xl text-[var(--text-primary)] tracking-[-0.02em]">{result.stats.totalPlotAreaSqM.toFixed(0)} <span className="text-sm text-[var(--text-muted)]">m²</span></div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">{(result.stats.totalPlotAreaSqM / 10000).toFixed(2)} ha</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Road area</div>
                    <div className="font-display text-xl text-[var(--text-primary)] tracking-[-0.02em]">{result.stats.totalRoadAreaSqM.toFixed(0)} <span className="text-sm text-[var(--text-muted)]">m²</span></div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Parent area</div>
                    <div className="font-display text-xl text-[var(--text-primary)] tracking-[-0.02em]">{result.stats.parentAreaSqM.toFixed(0)} <span className="text-sm text-[var(--text-muted)]">m²</span></div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Efficiency</div>
                    <div className="font-display text-xl text-[var(--success)] tracking-[-0.02em]">{result.stats.efficiency.toFixed(1)}%</div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">plot / parent ratio</div>
                  </div>
                </div>
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="card border-[color-mix(in_srgb,var(--warning)_40%,transparent)]">
                  <div className="card-header bg-[color-mix(in_srgb,var(--warning)_5%,transparent)]"><span className="label text-[var(--warning)]">Warnings</span></div>
                  <div className="card-body space-y-2">
                    {result.warnings.map((w, i) => (
                      <p key={`${w}-${i}`} className="text-xs text-[var(--text-secondary)] font-mono">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Plot list */}
              {result.plots.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <span className="label">Plot schedule</span>
                    <button onClick={exportBeacons} className="font-mono text-[10px] text-[var(--accent)] hover:opacity-80 tracking-[0.06em] uppercase">
                      Export beacons CSV →
                    </button>
                  </div>
                  <div className="card-body">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[var(--bg-card)]">
                          <tr className="text-[var(--text-muted)] border-b border-[var(--border-color)]">
                            <th className="text-left py-2">Plot</th>
                            <th className="text-right py-2">Area (m²)</th>
                            <th className="text-right py-2">Area (ha)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.plots.map(plot => (
                            <tr key={plot.id} className="border-b border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]">
                              <td className="py-1.5 font-mono text-[var(--accent)]">{plot.label}</td>
                              <td className="py-1.5 text-right font-mono text-[var(--text-primary)]">{plot.areaSqM.toFixed(1)}</td>
                              <td className="py-1.5 text-right font-mono text-[var(--text-muted)]">{(plot.areaSqM / 10000).toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Beacon count & Scheme Plan Export */}
              <div className="card">
                <div className="card-body flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Beacons generated</div>
                    <div className="font-display text-xl text-[var(--text-primary)] tracking-[-0.02em]">{result.beacons.length} corners</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={exportBeacons} className="btn btn-secondary text-xs">
                      Export CSV
                    </button>
                    <button
                      onClick={() => setSchemeModalOpen(true)}
                      className="btn text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                    >
                      <Building className="w-3.5 h-3.5" /> Open A3 draft plan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User-generated A3 subdivision-plan draft */}
      <SubdivisionPlanModal
        isOpen={schemeModalOpen}
        onClose={() => setSchemeModalOpen(false)}
        initialPlanData={schemePlanData}
      />
    </div>
  )
}
