'use client'

import { useState, useCallback } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { validateCadastralBoundary, type ValidationResult, type ValidationIssue } from '@/lib/compute/topologyValidator'

interface CoordRow {
  id: number
  easting: string
  northing: string
}


export default function TopologyCheckPage() {
  const [rows, setRows] = useState<CoordRow[]>([
    { id: 1, easting: '274812.403', northing: '9856214.778' },
    { id: 2, easting: '274937.108', northing: '9856220.336' },
    { id: 3, easting: '274943.291', northing: '9856098.105' },
    { id: 4, easting: '274818.586', northing: '9856092.547' },
  ])
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [coordinateReference, setCoordinateReference] = useState('')
  const [coordinatesConfirmed, setCoordinatesConfirmed] = useState(false)
  const [reviewAreaThreshold, setReviewAreaThreshold] = useState('')

  const addRow = () => {
    setRows(prev => [...prev, { id: prev.length + 1, easting: '', northing: '' }])
  }

  const removeRow = (id: number) => {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const updateRow = (id: number, field: 'easting' | 'northing', value: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const runValidation = useCallback(() => {
    if (!coordinateReference.trim() || !coordinatesConfirmed) {
      setResult(null)
      return
    }

    const coords: [number, number][] = rows.map(r => [parseFloat(r.easting), parseFloat(r.northing)])

    if (coords.length < 3 || coords.some(([easting, northing]) => !Number.isFinite(easting) || !Number.isFinite(northing))) {
      setResult(null)
      return
    }

    const enteredThreshold = reviewAreaThreshold.trim() ? Number(reviewAreaThreshold) : undefined
    if (enteredThreshold !== undefined && (!Number.isFinite(enteredThreshold) || enteredThreshold <= 0)) {
      setResult(null)
      return
    }

    const res = validateCadastralBoundary(coords, {
      minAreaSqM: enteredThreshold,
      sliverThresholdSqM: 5,
      sliverRatioThreshold: 0.01,
      minVertices: 4,
    })
    setResult(res)
  }, [rows, coordinateReference, coordinatesConfirmed, reviewAreaThreshold])

  const loadFromProject = async () => {
    const projectId = prompt('Enter project ID:')
    if (!projectId) return
    try {
      const res = await fetch(`/api/project/${projectId}/points`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = (await res.json()) as { data?: Array<{ easting?: string | number; northing?: string | number }> }
      const points = json.data || []
      const newRows: CoordRow[] = points.map((p, i: number) => ({
        id: i + 1,
        easting: String(p.easting),
        northing: String(p.northing),
      }))
      if (newRows.length > 0) {
        setRows(newRows)
      }
    } catch {
      alert('Could not load project points. Check the project ID.')
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10">
      <PageHeader
        title="Topology pre-flight check"
        subtitle="Check cadastral boundary geometry for self-intersections, sliver polygons, area values, and winding order. These geometry checks do not predict registry acceptance."
        reference="METARDU geometry checks · GeoJSON spec (RFC 7946)"
        badge="Geometry QA"
      />

      <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        The preloaded polygon is fictional demonstration geometry, not field evidence. Results cover geometry only and do not determine legal validity or submission readiness.
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        {/* Left: input */}
        <div>
          <div className="card mb-4">
            <div className="card-header">
              <span className="label">Boundary coordinates</span>
              <button
                onClick={loadFromProject}
                className="font-mono text-[10px] text-[var(--accent)] hover:opacity-80 tracking-[0.06em] uppercase"
              >
                Load from project →
              </button>
            </div>
            <div className="card-body">
              <p className="text-xs text-[var(--text-muted)] mb-4 font-mono">
                Enter boundary vertices in one declared projected coordinate reference system with metre units. METARDU does not transform or verify the CRS. Order matters — go clockwise or counter-clockwise around the parcel.
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-[40px_1fr_1fr_32px] gap-2 items-center font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase">
                  <span>#</span>
                  <span>Easting (m)</span>
                  <span>Northing (m)</span>
                  <span></span>
                </div>
                {rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[40px_1fr_1fr_32px] gap-2 items-center">
                    <span className="font-mono text-xs text-[var(--text-muted)]">{row.id}</span>
                    <input
                      className="input font-mono text-sm"
                      value={row.easting}
                      onChange={(e) => updateRow(row.id, 'easting', e.target.value)}
                      aria-label="Easting (m)" placeholder="274812.403"
                    />
                    <input
                      className="input font-mono text-sm"
                      value={row.northing}
                      onChange={(e) => updateRow(row.id, 'northing', e.target.value)}
                      aria-label="Northing (m)" placeholder="9856214.778"
                    />
                    <button
                      onClick={() => removeRow(row.id)}
                      className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors text-sm"
                      aria-label="Remove row"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addRow}
                className="mt-3 font-mono text-[11px] text-[var(--accent)] hover:opacity-80 tracking-[0.04em]"
              >
                + Add vertex
              </button>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header">
              <span className="label">Coordinate reference declaration</span>
            </div>
            <div className="card-body space-y-3">
              <label className="block text-sm" htmlFor="topology-crs">Projected CRS identifier</label>
              <input
                id="topology-crs"
                className="input font-mono text-sm"
                value={coordinateReference}
                onChange={(event) => { setCoordinateReference(event.target.value); setResult(null) }}
                placeholder="Enter the project's declared CRS (for example, an EPSG code)"
                autoComplete="off"
              />
              <label className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={coordinatesConfirmed}
                  onChange={(event) => { setCoordinatesConfirmed(event.target.checked); setResult(null) }}
                  className="mt-0.5"
                />
                <span>I confirm these coordinates use the declared projected CRS and metres. This declaration is not independently verified.</span>
              </label>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header">
              <span className="label">Optional area review threshold</span>
            </div>
            <div className="card-body">
              <label htmlFor="topology-area-threshold" className="block text-xs text-[var(--text-muted)] mb-2">Leave blank to skip area screening. Entered values are local review thresholds, not legal minimums.</label>
              <input
                id="topology-area-threshold"
                className="input font-mono text-sm"
                type="number"
                min="0"
                step="any"
                value={reviewAreaThreshold}
                onChange={(event) => { setReviewAreaThreshold(event.target.value); setResult(null) }}
                aria-label="Optional area review threshold in square metres"
                placeholder="No threshold"
              />
            </div>
          </div>

          <button onClick={runValidation} disabled={!coordinateReference.trim() || !coordinatesConfirmed} className="btn btn-primary w-full disabled:opacity-50">
            Run pre-flight check
          </button>
        </div>

        {/* Right: results */}
        <div>
          {!result ? (
            <div className="card">
              <div className="card-body text-center py-16">
                <p className="text-sm text-[var(--text-muted)]">
                  Enter boundary coordinates and run the check.
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-2 font-mono">
                  Results will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Verdict */}
              <div className={`card ${result.isValid ? 'border-[var(--success)]' : 'border-[var(--error)]'}`}>
                <div className="card-body">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 flex items-center justify-center ${result.isValid ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)]' : 'bg-[color-mix(in_srgb,var(--error)_15%,transparent)]'}`}>
                      {result.isValid ? (
                        <svg className="w-6 h-6 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-[var(--error)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h2 className={`font-display text-xl tracking-[-0.015em] ${result.isValid ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                  {result.isValid ? 'No geometry errors flagged' : 'Geometry issues found'}
                      </h2>
                      <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
                        {result.errors.length} error{result.errors.length !== 1 ? 's' : ''} · {result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-[var(--text-muted)]">Geometry result for declared CRS {coordinateReference}. This does not certify the coordinate reference system, boundary, legal compliance or registry acceptance.</p>

              {/* Stats */}
              <div className="card">
                <div className="card-header">
                  <span className="label">Geometry stats</span>
                </div>
                <div className="card-body grid grid-cols-2 gap-4">
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Area</div>
                    <div className="font-display text-xl text-[var(--text-primary)]">{result.stats.areaSqM.toFixed(2)} <span className="text-sm text-[var(--text-muted)]">m²</span></div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">{(result.stats.areaSqM / 10000).toFixed(4)} ha</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Perimeter</div>
                    <div className="font-display text-xl text-[var(--text-primary)]">{result.stats.perimeterM.toFixed(2)} <span className="text-sm text-[var(--text-muted)]">m</span></div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Vertices</div>
                    <div className="font-display text-xl text-[var(--text-primary)]">{result.stats.vertexCount}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">Ring closed</div>
                    <div className="font-display text-xl text-[var(--text-primary)]">{result.stats.isClosed ? 'Yes' : 'No'}</div>
                  </div>
                </div>
              </div>

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="card border-[color-mix(in_srgb,var(--error)_40%,transparent)]">
                  <div className="card-header bg-[color-mix(in_srgb,var(--error)_5%,transparent)]">
                    <span className="label text-[var(--error)]">Blocking errors</span>
                  </div>
                  <div className="card-body space-y-3">
                    {result.errors.map((err, i) => (
                      <IssueItem key={err.id} issue={err} index={i} />
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="card border-[color-mix(in_srgb,var(--warning)_40%,transparent)]">
                  <div className="card-header bg-[color-mix(in_srgb,var(--warning)_5%,transparent)]">
                    <span className="label text-[var(--warning)]">Warnings</span>
                  </div>
                  <div className="card-body space-y-3">
                    {result.warnings.map((warn, i) => (
                      <IssueItem key={warn.id} issue={warn} index={i} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function IssueItem({ issue, index }: { issue: ValidationIssue; index: number }) {
  const color = issue.severity === 'error' ? 'var(--error)' : 'var(--warning)'
  return (
    <div className="flex items-start gap-3">
      <div className={`shrink-0 w-6 h-6 border flex items-center justify-center mt-0.5`} style={{ borderColor: color, color }}>
        <span className="font-mono text-[10px]">{issue.severity === 'error' ? 'E' : 'W'}{index + 1}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-primary)] leading-snug">{issue.message}</p>
        {issue.detail && (
          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{issue.detail}</p>
        )}
        {issue.location && (
          <p className="font-mono text-[10px] text-[var(--text-muted)] mt-1">
            Location: [{issue.location[0].toFixed(3)}, {issue.location[1].toFixed(3)}]
          </p>
        )}
      </div>
    </div>
  )
}
