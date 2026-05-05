'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Plus, Trash2, Save, Loader2, CheckCircle2, AlertCircle,
  X, ChevronDown, ChevronUp
} from 'lucide-react'

interface ObservationRow {
  station: string
  bs: string
  fs: string
  hcl_deg: number
  hcl_min: number
  hcl_sec: number
  hcr_deg: number
  hcr_min: number
  hcr_sec: number
  slope_dist: string
  va_deg: number
  va_min: number
  va_sec: number
  ih: string
  th: string
  remarks: string
}

interface TraverseResult {
  legs: Array<{
    from: string
    to: string
    meanAngleDMS: string
    wcbDMS: string
    hd: number
    adjDep: number
    adjLat: number
  }>
  coordinates: Array<{ station: string; easting: number; northing: number; rl?: number }>
  area_ha: number | null
  accuracy: {
    order: string
    precision_ratio: number
    linear_error: number
    formula: string
    is_closed: boolean
  }
}

interface TraverseConfig {
  opening_station: string
  closing_station: string
  opening_easting: string
  opening_northing: string
  opening_rl: string
  closing_easting: string
  closing_northing: string
  bs_bearing_deg: string
  bs_bearing_min: string
  bs_bearing_sec: string
  is_closed: boolean
}

const emptyObs = (): ObservationRow => ({
  station: '', bs: '', fs: '',
  hcl_deg: 0, hcl_min: 0, hcl_sec: 0,
  hcr_deg: 0, hcr_min: 0, hcr_sec: 0,
  slope_dist: '', va_deg: 0, va_min: 0, va_sec: 0,
  ih: '1.500', th: '1.500', remarks: '',
})

export default function TraverseComputePanel({ parcelId }: { parcelId: number }) {
  const [config, setConfig] = useState<TraverseConfig>({
    opening_station: 'T1', closing_station: 'T1',
    opening_easting: '', opening_northing: '', opening_rl: '',
    closing_easting: '', closing_northing: '',
    bs_bearing_deg: '', bs_bearing_min: '', bs_bearing_sec: '',
    is_closed: false,
  })
  const [observations, setObservations] = useState<ObservationRow[]>([emptyObs(), emptyObs()])
  const [result, setResult] = useState<TraverseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPanel, setShowPanel] = useState(true)
  const [loadingSaved, setLoadingSaved] = useState(false)

  // Load saved traverse data
  useEffect(() => {
    const loadSaved = async () => {
      try {
        const res = await fetch(`/api/scheme/traverse?parcel_id=${parcelId}`)
        const json = await res.json()
        if (res.ok && json.data) {
          const { traverse, observations: savedObs } = json.data

          setConfig({
            opening_station: traverse.opening_station || 'T1',
            closing_station: traverse.closing_station || '',
            opening_easting: String(traverse.opening_easting || ''),
            opening_northing: String(traverse.opening_northing || ''),
            opening_rl: traverse.opening_rl ? String(traverse.opening_rl) : '',
            closing_easting: traverse.closing_easting ? String(traverse.closing_easting) : '',
            closing_northing: traverse.closing_northing ? String(traverse.closing_northing) : '',
            bs_bearing_deg: '', bs_bearing_min: '', bs_bearing_sec: '',
            is_closed: traverse.is_closed || false,
          })

          if (savedObs && savedObs.length > 0) {
            setObservations(savedObs.map((o: any) => ({
              station: o.station, bs: o.bs, fs: o.fs,
              hcl_deg: o.hcl_deg || 0, hcl_min: o.hcl_min || 0, hcl_sec: o.hcl_sec || 0,
              hcr_deg: o.hcr_deg || 0, hcr_min: o.hcr_min || 0, hcr_sec: o.hcr_sec || 0,
              slope_dist: o.slope_dist ? String(o.slope_dist) : '',
              va_deg: o.va_deg || 0, va_min: o.va_min || 0, va_sec: o.va_sec || 0,
              ih: o.ih ? String(o.ih) : '1.500', th: o.th ? String(o.th) : '1.500',
              remarks: o.remarks || '',
            })))
          }

          if (traverse.computed_area_ha) {
            setResult(null) // Will re-compute
          }
        }
      } catch {}
    }
    void loadSaved()
  }, [parcelId])

  const updateObs = (index: number, field: keyof ObservationRow, value: any) => {
    setObservations(prev => prev.map((obs, i) =>
      i === index ? { ...obs, [field]: value } : obs
    ))
  }

  const addRow = () => {
    const last = observations[observations.length - 1]
    setObservations(prev => [...prev, {
      ...emptyObs(),
      bs: last?.fs || '',
      station: '',
    }])
  }

  const removeRow = (index: number) => {
    if (observations.length <= 2) return
    setObservations(prev => prev.filter((_, i) => i !== index))
  }

  const handleCompute = async () => {
    if (!config.opening_easting || !config.opening_northing) {
      setError('Opening coordinates are required')
      return
    }
    if (config.is_closed && (!config.closing_easting || !config.closing_northing)) {
      setError('Closing coordinates are required for closed traverses')
      return
    }

    const validObs = observations.filter(o => o.station && o.slope_dist)
    if (validObs.length < 1) {
      setError('At least one observation with station and distance is required')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const payload: any = {
        parcel_id: parcelId,
        opening_station: config.opening_station,
        closing_station: config.is_closed ? config.closing_station : undefined,
        opening_easting: parseFloat(config.opening_easting),
        opening_northing: parseFloat(config.opening_northing),
        opening_rl: config.opening_rl ? parseFloat(config.opening_rl) : undefined,
        closing_easting: config.is_closed ? parseFloat(config.closing_easting) : undefined,
        closing_northing: config.is_closed ? parseFloat(config.closing_northing) : undefined,
        backsight_bearing_deg: config.bs_bearing_deg ? parseFloat(config.bs_bearing_deg) : 0,
        backsight_bearing_min: config.bs_bearing_min ? parseFloat(config.bs_bearing_min) : 0,
        backsight_bearing_sec: config.bs_bearing_sec ? parseFloat(config.bs_bearing_sec) : 0,
        observations: validObs.map(obs => ({
          ...obs,
          slope_dist: parseFloat(obs.slope_dist) || 0,
          ih: parseFloat(obs.ih) || 0,
          th: parseFloat(obs.th) || 0,
        })),
      }

      const res = await fetch('/api/scheme/traverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Computation failed')

      setResult(json.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none transition-colors'
  const numClass = 'w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-xs text-[var(--text-primary)] text-center focus:border-[var(--accent)] focus:outline-none transition-colors'
  const labelClass = 'block text-[10px] font-medium text-[var(--text-muted)] mb-0.5'

  return (
    <div className="border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-card)]">
      {/* Header */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <span className="text-sm font-semibold text-[var(--text-primary)]">Traverse Computation</span>
        {showPanel ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
      </button>

      {!showPanel ? null : (
        <div className="px-4 pb-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-2.5 bg-red-900/20 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
              <button onClick={() => setError('')} className="ml-auto"><X className="w-3 h-3" /></button>
            </div>
          )}

          {/* Config */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className={labelClass}>Opening Station</label>
              <input type="text" value={config.opening_station} onChange={e => setConfig(p => ({ ...p, opening_station: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Opening E</label>
              <input type="number" step="0.0001" value={config.opening_easting} onChange={e => setConfig(p => ({ ...p, opening_easting: e.target.value }))} className={inputClass} placeholder="e.g., 400000" />
            </div>
            <div>
              <label className={labelClass}>Opening N</label>
              <input type="number" step="0.0001" value={config.opening_northing} onChange={e => setConfig(p => ({ ...p, opening_northing: e.target.value }))} className={inputClass} placeholder="e.g., 9800000" />
            </div>
            <div>
              <label className={labelClass}>Opening RL</label>
              <input type="number" step="0.001" value={config.opening_rl} onChange={e => setConfig(p => ({ ...p, opening_rl: e.target.value }))} className={inputClass} placeholder="Optional" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={config.is_closed}
                onChange={e => setConfig(p => ({ ...p, is_closed: e.target.checked }))}
                className="rounded border-[var(--border-color)]"
              />
              Closed Traverse
            </label>
          </div>

          {config.is_closed && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg">
              <div>
                <label className={labelClass}>Closing Station</label>
                <input type="text" value={config.closing_station} onChange={e => setConfig(p => ({ ...p, closing_station: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Closing E</label>
                <input type="number" step="0.0001" value={config.closing_easting} onChange={e => setConfig(p => ({ ...p, closing_easting: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Closing N</label>
                <input type="number" step="0.0001" value={config.closing_northing} onChange={e => setConfig(p => ({ ...p, closing_northing: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>BS Bearing (D M S)</label>
                <div className="grid grid-cols-3 gap-1">
                  <input type="number" value={config.bs_bearing_deg} onChange={e => setConfig(p => ({ ...p, bs_bearing_deg: e.target.value }))} className={numClass} placeholder="D" />
                  <input type="number" value={config.bs_bearing_min} onChange={e => setConfig(p => ({ ...p, bs_bearing_min: e.target.value }))} className={numClass} placeholder="M" />
                  <input type="number" value={config.bs_bearing_sec} onChange={e => setConfig(p => ({ ...p, bs_bearing_sec: e.target.value }))} className={numClass} placeholder="S" />
                </div>
              </div>
            </div>
          )}

          {/* Observations Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] text-[var(--text-muted)] border-b border-[var(--border-color)]">
                  <th className="px-1 py-1.5 w-6">#</th>
                  <th className="px-1 py-1.5">Station</th>
                  <th className="px-1 py-1.5">BS</th>
                  <th className="px-1 py-1.5">FS</th>
                  <th className="px-1 py-1.5">HCL (D M S)</th>
                  <th className="px-1 py-1.5">HCR (D M S)</th>
                  <th className="px-1 py-1.5">Slope Dist</th>
                  <th className="px-1 py-1.5">VA (D M S)</th>
                  <th className="px-1 py-1.5">IH</th>
                  <th className="px-1 py-1.5">TH</th>
                  <th className="px-1 py-1.5 w-6"></th>
                </tr>
              </thead>
              <tbody>
                {observations.map((obs, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)]/30">
                    <td className="px-1 py-1 text-[var(--text-muted)]">{i + 1}</td>
                    <td className="px-1 py-1">
                      <input type="text" value={obs.station} onChange={e => updateObs(i, 'station', e.target.value)} className={inputClass} placeholder="T2" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="text" value={obs.bs} onChange={e => updateObs(i, 'bs', e.target.value)} className={inputClass} />
                    </td>
                    <td className="px-1 py-1">
                      <input type="text" value={obs.fs} onChange={e => updateObs(i, 'fs', e.target.value)} className={inputClass} />
                    </td>
                    <td className="px-1 py-1">
                      <div className="grid grid-cols-3 gap-0.5">
                        <input type="number" value={obs.hcl_deg} onChange={e => updateObs(i, 'hcl_deg', parseInt(e.target.value) || 0)} className={numClass} />
                        <input type="number" value={obs.hcl_min} onChange={e => updateObs(i, 'hcl_min', parseInt(e.target.value) || 0)} className={numClass} />
                        <input type="number" step="0.1" value={obs.hcl_sec} onChange={e => updateObs(i, 'hcl_sec', parseFloat(e.target.value) || 0)} className={numClass} />
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <div className="grid grid-cols-3 gap-0.5">
                        <input type="number" value={obs.hcr_deg} onChange={e => updateObs(i, 'hcr_deg', parseInt(e.target.value) || 0)} className={numClass} />
                        <input type="number" value={obs.hcr_min} onChange={e => updateObs(i, 'hcr_min', parseInt(e.target.value) || 0)} className={numClass} />
                        <input type="number" step="0.1" value={obs.hcr_sec} onChange={e => updateObs(i, 'hcr_sec', parseFloat(e.target.value) || 0)} className={numClass} />
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" step="0.001" value={obs.slope_dist} onChange={e => updateObs(i, 'slope_dist', e.target.value)} className={inputClass} placeholder="m" />
                    </td>
                    <td className="px-1 py-1">
                      <div className="grid grid-cols-3 gap-0.5">
                        <input type="number" value={obs.va_deg} onChange={e => updateObs(i, 'va_deg', parseInt(e.target.value) || 0)} className={numClass} />
                        <input type="number" value={obs.va_min} onChange={e => updateObs(i, 'va_min', parseInt(e.target.value) || 0)} className={numClass} />
                        <input type="number" step="0.1" value={obs.va_sec} onChange={e => updateObs(i, 'va_sec', parseFloat(e.target.value) || 0)} className={numClass} />
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" step="0.001" value={obs.ih} onChange={e => updateObs(i, 'ih', e.target.value)} className={numClass} />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" step="0.001" value={obs.th} onChange={e => updateObs(i, 'th', e.target.value)} className={numClass} />
                    </td>
                    <td className="px-1 py-1">
                      <button
                        onClick={() => removeRow(i)}
                        disabled={observations.length <= 2}
                        className="p-1 hover:bg-red-900/20 rounded text-[var(--text-muted)] hover:text-red-400 disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button onClick={addRow} className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Observation
            </button>
            <button
              onClick={handleCompute}
              disabled={loading}
              className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-dim)] text-black text-sm font-semibold rounded-lg transition-all disabled:opacity-40 flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Compute & Save
            </button>
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-4 pt-2">
              {/* Accuracy & Area */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                  <div className="text-[10px] text-[var(--text-muted)]">Accuracy</div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">{result.accuracy.order}</div>
                </div>
                <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                  <div className="text-[10px] text-[var(--text-muted)]">Precision</div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">1:{result.accuracy.precision_ratio.toFixed(0)}</div>
                </div>
                <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg">
                  <div className="text-[10px] text-[var(--text-muted)]">Linear Error</div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">{result.accuracy.linear_error.toFixed(4)} m</div>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <div className="text-[10px] text-emerald-400">Computed Area</div>
                  <div className="text-sm font-bold text-emerald-400">{result.area_ha ? result.area_ha.toFixed(6) : 'N/A'} ha</div>
                </div>
              </div>

              {/* Coordinates Table */}
              <div className="overflow-x-auto">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Computed Coordinates</h4>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] text-[var(--text-muted)] border-b border-[var(--border-color)]">
                      <th className="px-3 py-1.5">Station</th>
                      <th className="px-3 py-1.5">Easting</th>
                      <th className="px-3 py-1.5">Northing</th>
                      <th className="px-3 py-1.5">RL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.coordinates.map((c, i) => (
                      <tr key={i} className="border-b border-[var(--border-color)]/30">
                        <td className="px-3 py-1.5 font-mono text-[var(--accent)]">{c.station}</td>
                        <td className="px-3 py-1.5 font-mono">{c.easting.toFixed(4)}</td>
                        <td className="px-3 py-1.5 font-mono">{c.northing.toFixed(4)}</td>
                        <td className="px-3 py-1.5 font-mono">{c.rl ? c.rl.toFixed(3) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Traverse computed and saved. Parcel area updated.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
