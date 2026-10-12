'use client'

/**
 * ControlStagePanel — Interactive control & benchmark register for a project.
 *
 * Blueprint reference:
 *   §5.1 Control — establish project reference, control register, benchmarks, verification
 *   §14.1 Assurance dimensions (Control status: VERIFIED, REVIEW_REQUIRED, DRAFT)
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Crosshair, Plus, AlertTriangle, MapPin, RefreshCw, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface ControlPoint {
  id: string
  point_name: string
  easting: number
  northing: number
  elevation: number | null
  code: string | null
  description: string | null
  is_control: boolean
  source: string | null
}

interface Props {
  projectId: string
  epsg: string
}

function isControlPoint(value: unknown): value is ControlPoint {
  if (!value || typeof value !== 'object') return false
  const point = value as Record<string, unknown>
  return typeof point.id === 'string'
    && typeof point.point_name === 'string'
    && typeof point.easting === 'number'
    && Number.isFinite(point.easting)
    && typeof point.northing === 'number'
    && Number.isFinite(point.northing)
}

export default function ControlStagePanel({ projectId, epsg }: Props) {
  const [points, setPoints] = useState<ControlPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [easting, setEasting] = useState('')
  const [northing, setNorthing] = useState('')
  const [elevation, setElevation] = useState('')
  const [code, setCode] = useState('BM')
  const [desc, setDesc] = useState('')

  const fetchPoints = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/project/${projectId}/points`)
      if (!res.ok) throw new Error('Failed to fetch points')
      const json: unknown = await res.json()
      const data: unknown = json && typeof json === 'object' && 'data' in json ? json.data : null
      const records: unknown[] = Array.isArray(data) ? data : []
      const pts = records.filter(isControlPoint).filter((p) => p.is_control || p.code === 'BM' || p.code === 'TBM' || p.code === 'TRIG')
      setPoints(pts)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading control marks')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchPoints()
  }, [fetchPoints])

  const handleAddControl = async (e: React.FormEvent) => {
    e.preventDefault()
    const eNum = Number(easting)
    const nNum = Number(northing)
    const zNum = elevation.trim() ? Number(elevation) : undefined

    if (!easting.trim() || !northing.trim() || !Number.isFinite(eNum) || !Number.isFinite(nNum) || (zNum !== undefined && !Number.isFinite(zNum))) {
      setError('Enter complete finite coordinates and a valid height, or leave unobserved height blank')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      const res = await fetch(`/api/project/${projectId}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pointName: name.trim(),
          easting: eNum,
          northing: nNum,
          elevation: zNum,
          code: code.trim(),
          description: desc.trim() || undefined,
          isControl: true,
        }),
      })

      if (!res.ok) {
        const payload: unknown = await res.json()
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Failed to save control mark'
        throw new Error(message)
      }

      setName('')
      setEasting('')
      setNorthing('')
      setElevation('')
      setDesc('')
      setShowAddModal(false)
      fetchPoints()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error adding control mark')
    } finally {
      setSubmitting(false)
    }
  }

  const controlCount = points.length

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Control basis · review required
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-secondary)]">
            {epsg}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          {loading
            ? 'Loading the control register.'
            : controlCount === 0
              ? 'No control marks are registered. Add source coordinates and record their basis before using them.'
              : `${controlCount} control mark${controlCount === 1 ? '' : 's'} registered. Registration alone does not verify a mark, baseline, orientation, or statutory tolerance.`}
        </p>
        <Link href="/tools/control-point-verification" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">
          Review verification evidence <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Control Point Register */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Control & Benchmark Register
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchPoints}
              className="p-1.5 rounded-md hover:bg-white/5 text-[var(--text-muted)] transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-black text-xs font-semibold hover:bg-[var(--accent-dim)] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Control Mark
            </button>
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-secondary)]">
          {loading && points.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              Loading control marks...
            </div>
          ) : points.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <MapPin className="w-6 h-6 mx-auto text-[var(--text-muted)] opacity-50" />
              <p className="text-xs text-[var(--text-muted)]">
                No control marks registered for this project.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="text-xs text-[var(--accent)] underline hover:text-[var(--accent-dim)]"
              >
                Add first control mark
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--bg-tertiary)] border-b border-[var(--border-color)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Point</th>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2 text-right">Easting (m)</th>
                    <th className="px-3 py-2 text-right">Northing (m)</th>
                    <th className="px-3 py-2 text-right">Elevation (m)</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)] font-mono text-[11px]">
                {points.map((pt) => (
                  <tr key={pt.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2.5 font-bold text-[var(--text-primary)]">
                      {pt.point_name}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--accent)]">
                      {pt.code || 'CTRL'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[var(--text-secondary)]">
                      {pt.easting?.toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[var(--text-secondary)]">
                      {pt.northing?.toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[var(--text-secondary)]">
                      {pt.elevation != null ? pt.elevation.toFixed(3) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] text-[10px] font-medium">
                        Recorded
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* Network Adjustment and Advanced Tools */}
      <div className="pt-2 border-t border-[var(--border-color)]">
        <h4 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
          Control Engineering Tools
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <Link
            href="/tools/lsa"
            className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors"
          >
            <span>Least Squares Network Adjustment</span>
            <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </Link>
          <Link
            href="/tools/two-peg-test"
            className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors"
          >
            <span>Level 2-Peg Collimation Check</span>
            <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </Link>
        </div>
      </div>

      {/* Modal: Add Control Point */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-color)] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Add Project Control Mark / Benchmark
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[var(--text-muted)] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddControl} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Point Name / Beacon ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BM-12 or KIS-TRIG-4"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Easting (m) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    placeholder="257088.420"
                    value={easting}
                    onChange={(e) => setEasting(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] font-mono focus:border-[var(--accent)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Northing (m) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    placeholder="9857754.230"
                    value={northing}
                    onChange={(e) => setNorthing(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] font-mono focus:border-[var(--accent)] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Elevation (m)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="1650.450"
                    value={elevation}
                    onChange={(e) => setElevation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] font-mono focus:border-[var(--accent)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    Code
                  </label>
                  <select
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                  >
                    <option value="BM">BM (Benchmark)</option>
                    <option value="TBM">TBM (Temporary BM)</option>
                    <option value="TRIG">TRIG (Trigonometrical Station)</option>
                    <option value="PSC">PSC (Primary Survey Control)</option>
                    <option value="SSC">SSC (Secondary Survey Control)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Description / Witness Ties
                </label>
                <input
                  type="text"
                  placeholder="Brass pin in concrete pillar 50m north of highway"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-xs font-semibold hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-xs font-semibold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Control Mark'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
