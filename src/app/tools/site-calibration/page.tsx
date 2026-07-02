'use client'

import { useState, useCallback } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  computeHelmertTransformation,
  transformPoint,
  type ControlPointPair,
  type HelmertResult,
} from '@/lib/geo/helmertTransform'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface PointRow {
  id: string
  name: string
  // Source (WGS84 from GNSS)
  sx: string; sy: string; sz: string
  // Target (Arc 1960 from registry)
  tx: string; ty: string; tz: string
}

let rowId = 0
const newRow = (): PointRow => ({
  id: `p${++rowId}`,
  name: '',
  sx: '', sy: '', sz: '',
  tx: '', ty: '', tz: '',
})

export default function SiteCalibrationPage() {
  const { t } = useLanguage()
  const [points, setPoints] = useState<PointRow[]>([
    { id: 'p1', name: 'CP1', sx: '274812.403', sy: '9856214.778', sz: '1798.500', tx: '274712.201', ty: '9856314.521', tz: '1790.123' },
    { id: 'p2', name: 'CP2', sx: '274912.108', sy: '9856220.336', sz: '1799.200', tx: '274811.906', ty: '9856320.079', tz: '1790.823' },
    { id: 'p3', name: 'CP3', sx: '274905.291', sy: '9856098.105', sz: '1801.800', tx: '274805.089', ty: '9856197.848', tz: '1793.423' },
  ])
  const [result, setResult] = useState<HelmertResult | null>(null)
  const [error, setError] = useState('')
  const [transformInput, setTransformInput] = useState('')
  const [transformOutput, setTransformOutput] = useState('')

  const addPoint = () => setPoints(p => [...p, newRow()])
  const removePoint = (id: string) => setPoints(p => p.filter(r => r.id !== id))
  const updatePoint = (id: string, field: keyof PointRow, value: string) =>
    setPoints(p => p.map(r => r.id === id ? { ...r, [field]: value } : r))

  const runCalibration = useCallback(() => {
    setError('')
    setResult(null)
    try {
      const pairs: ControlPointPair[] = points
        .filter(p => p.sx && p.sy && p.tx && p.ty)
        .map(p => ({
          id: p.name || p.id,
          sourceX: parseFloat(p.sx),
          sourceY: parseFloat(p.sy),
          sourceZ: parseFloat(p.sz) || 0,
          targetX: parseFloat(p.tx),
          targetY: parseFloat(p.ty),
          targetZ: parseFloat(p.tz) || 0,
        }))

      if (pairs.length < 3) {
        setError('Need at least 3 control points with both source and target coordinates')
        return
      }

      const res = computeHelmertTransformation(pairs)
      if (!res) {
        setError('Transformation failed — check for collinear points or identical coordinates')
        return
      }
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calibration failed')
    }
  }, [points])

  const runTransform = () => {
    if (!result) return
    // Parse input: one point per line, "X Y Z" or "name X Y Z"
    const lines = transformInput.trim().split('\n').filter(l => l.trim())
    const out = lines.map(line => {
      const parts = line.trim().split(/\s+/)
      let name = ''
      let x: number, y: number, z: number
      if (parts.length === 4) {
        name = parts[0]
        x = parseFloat(parts[1]); y = parseFloat(parts[2]); z = parseFloat(parts[3])
      } else if (parts.length === 3) {
        x = parseFloat(parts[0]); y = parseFloat(parts[1]); z = parseFloat(parts[2])
      } else {
        return `# Invalid: ${line}`
      }
      const t = transformPoint(x, y, z, result.parameters)
      return `${name} ${t.x.toFixed(4)} ${t.y.toFixed(4)} ${t.z.toFixed(4)}`
    })
    setTransformOutput(out.join('\n'))
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 md:py-10">
      <PageHeader
        title="Site calibration"
        subtitle="Compute the 7-parameter Helmert transformation between WGS84 (GNSS) and Arc 1960 (registry). Enter 3+ control points with coordinates in both systems."
        reference="Helmert 7-parameter | Arc 1960 (Clarke 1880) ↔ WGS84 | Kenya datum shift"
        badge="Geodesy"
      />

      {error && (
        <div className="mb-4 p-3 border border-[var(--error)]/30 bg-[var(--error)]/5 rounded-md text-sm text-[var(--error)] font-mono">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
        {/* Left: input */}
        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <span className="label">Control point pairs</span>
              <span className="font-mono text-[10px] text-[var(--text-muted)]">{points.length} points</span>
            </div>
            <div className="card-body">
              <p className="text-xs text-[var(--text-muted)] mb-4 font-mono">
                Enter control points with known coordinates in both systems. Source = GNSS (WGS84). Target = Registry (Arc 1960).
              </p>
              <div className="overflow-x-auto">
                <div className="min-w-[700px] space-y-1">
                  {/* Header */}
                  <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_1fr_1fr_28px] gap-1 items-center font-mono text-[9px] text-[var(--text-muted)] tracking-[0.04em] uppercase">
                    <span>Name</span>
                    <span className="text-[var(--accent)]">Src X</span>
                    <span className="text-[var(--accent)]">Src Y</span>
                    <span className="text-[var(--accent)]">Src Z</span>
                    <span className="text-[var(--primary-blue)]">Tgt X</span>
                    <span className="text-[var(--primary-blue)]">Tgt Y</span>
                    <span className="text-[var(--primary-blue)]">Tgt Z</span>
                    <span></span>
                  </div>
                  {points.map(p => (
                    <div key={p.id} className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_1fr_1fr_28px] gap-1 items-center">
                      <input className="input font-mono text-xs px-1 py-1" value={p.name} onChange={e => updatePoint(p.id, 'name', e.target.value)} aria-label="CP1" placeholder="CP1" />
                      <input className="input font-mono text-xs px-1 py-1" style={{ borderColor: 'var(--accent)' }} value={p.sx} onChange={e => updatePoint(p.id, 'sx', e.target.value)} aria-label="274812" placeholder="274812" />
                      <input className="input font-mono text-xs px-1 py-1" style={{ borderColor: 'var(--accent)' }} value={p.sy} onChange={e => updatePoint(p.id, 'sy', e.target.value)} aria-label="9856214" placeholder="9856214" />
                      <input className="input font-mono text-xs px-1 py-1" style={{ borderColor: 'var(--accent)' }} value={p.sz} onChange={e => updatePoint(p.id, 'sz', e.target.value)} aria-label="1798" placeholder="1798" />
                      <input className="input font-mono text-xs px-1 py-1" style={{ borderColor: 'var(--primary-blue)' }} value={p.tx} onChange={e => updatePoint(p.id, 'tx', e.target.value)} aria-label="274712" placeholder="274712" />
                      <input className="input font-mono text-xs px-1 py-1" style={{ borderColor: 'var(--primary-blue)' }} value={p.ty} onChange={e => updatePoint(p.id, 'ty', e.target.value)} aria-label="9856314" placeholder="9856314" />
                      <input className="input font-mono text-xs px-1 py-1" style={{ borderColor: 'var(--primary-blue)' }} value={p.tz} onChange={e => updatePoint(p.id, 'tz', e.target.value)} aria-label="1790" placeholder="1790" />
                      <button onClick={() => removePoint(p.id)} className="text-[var(--text-muted)] hover:text-[var(--error)] text-sm">×</button>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={addPoint} className="mt-3 font-mono text-[11px] text-[var(--accent)] hover:opacity-80">+ Add control point</button>
            </div>
          </div>

          <button onClick={runCalibration} className="btn btn-primary w-full">
            Compute transformation
          </button>
        </div>

        {/* Right: results */}
        <div>
          {!result ? (
            <div className="card">
              <div className="card-body text-center py-16">
                <p className="text-sm text-[var(--text-muted)]">Enter control points and compute.</p>
                <p className="text-xs text-[var(--text-muted)] mt-2 font-mono">7 parameters: Tx, Ty, Tz, Rx, Ry, Rz, Scale</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Parameters */}
              <div className="card">
                <div className="card-header"><span className="label">Helmert parameters</span></div>
                <div className="card-body space-y-2">
                  <ParamRow label="Tx (translation)" value={`${result.parameters.tx.toFixed(4)} m`} />
                  <ParamRow label="Ty (translation)" value={`${result.parameters.ty.toFixed(4)} m`} />
                  <ParamRow label="Tz (translation)" value={`${result.parameters.tz.toFixed(4)} m`} />
                  <ParamRow label="Rx (rotation)" value={`${(result.parameters.rx * 180 / Math.PI).toFixed(6)}°`} />
                  <ParamRow label="Ry (rotation)" value={`${(result.parameters.ry * 180 / Math.PI).toFixed(6)}°`} />
                  <ParamRow label="Rz (rotation)" value={`${(result.parameters.rz * 180 / Math.PI).toFixed(6)}°`} />
                  <ParamRow label="Scale" value={result.parameters.scale.toFixed(8)} highlight />
                </div>
              </div>

              {/* RMS */}
              <div className="card">
                <div className="card-header"><span className="label">Residual analysis</span></div>
                <div className="card-body grid grid-cols-2 gap-4">
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">RMS X</div>
                    <div className="font-display text-lg text-[var(--text-primary)] tracking-[-0.02em]">{result.rmsX.toFixed(4)} m</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">RMS Y</div>
                    <div className="font-display text-lg text-[var(--text-primary)] tracking-[-0.02em]">{result.rmsY.toFixed(4)} m</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">RMS Z</div>
                    <div className="font-display text-lg text-[var(--text-primary)] tracking-[-0.02em]">{result.rmsZ.toFixed(4)} m</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-1">RMS Total</div>
                    <div className={`font-display text-lg tracking-[-0.02em] ${result.rmsTotal < 0.02 ? 'text-[var(--success)]' : result.rmsTotal < 0.05 ? 'text-[var(--warning)]' : 'text-[var(--error)]'}`}>{result.rmsTotal.toFixed(4)} m</div>
                  </div>
                </div>
              </div>

              {/* Per-point residuals */}
              <div className="card">
                <div className="card-header"><span className="label">Per-point residuals</span></div>
                <div className="card-body">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[var(--text-muted)] border-b border-[var(--border-color)]">
                        <th className="text-left py-2">Point</th>
                        <th className="text-right py-2">dX (mm)</th>
                        <th className="text-right py-2">dY (mm)</th>
                        <th className="text-right py-2">dZ (mm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.transformedPoints.map(tp => (
                        <tr key={tp.id} className="border-b border-[var(--border-color)]/50">
                          <td className="py-1.5 font-mono text-[var(--accent)]">{tp.id}</td>
                          <td className="py-1.5 text-right font-mono" style={{ color: Math.abs(tp.residualX) > 0.02 ? 'var(--warning)' : 'var(--text-muted)' }}>{(tp.residualX * 1000).toFixed(2)}</td>
                          <td className="py-1.5 text-right font-mono" style={{ color: Math.abs(tp.residualY) > 0.02 ? 'var(--warning)' : 'var(--text-muted)' }}>{(tp.residualY * 1000).toFixed(2)}</td>
                          <td className="py-1.5 text-right font-mono" style={{ color: Math.abs(tp.residualZ) > 0.02 ? 'var(--warning)' : 'var(--text-muted)' }}>{(tp.residualZ * 1000).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Batch transform */}
              <div className="card">
                <div className="card-header"><span className="label">Batch transform</span></div>
                <div className="card-body space-y-3">
                  <p className="text-xs text-[var(--text-muted)] font-mono">Paste points to transform (one per line: "X Y Z" or "name X Y Z"):</p>
                  <textarea
                    className="input font-mono text-xs h-24"
                    value={transformInput}
                    onChange={e => setTransformInput(e.target.value)}
                    placeholder={'CP4 274850.000 9856150.000 1799.000\n274900.000 9856200.000 1800.500'}
                  />
                  <button onClick={runTransform} className="btn btn-secondary text-xs w-full">Transform points</button>
                  {transformOutput && (
                    <div className="border border-[var(--border-color)] rounded-md p-3 bg-[var(--bg-secondary)]">
                      <div className="font-mono text-[9px] text-[var(--text-muted)] tracking-[0.06em] uppercase mb-2">Output (target system)</div>
                      <pre className="font-mono text-xs text-[var(--success)] whitespace-pre-wrap">{transformOutput}</pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ParamRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="font-mono text-[10px] text-[var(--text-muted)] tracking-[0.04em] uppercase">{label}</span>
      <span className={`font-mono text-sm ${highlight ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-primary)]'}`}>{value}</span>
    </div>
  )
}
