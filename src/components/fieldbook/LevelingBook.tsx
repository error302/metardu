'use client';

import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { LevelingResult } from '@/lib/engine/types'
import styles from './FieldbookTable.module.css'

type Translator = (key: string, values?: Record<string, string | number>) => string

export type LevelRow = {
  id: string
  station: string
  bs: string
  is: string
  fs: string
  remarks: string
  /** Rejected rows are struck through, excluded from computation, and kept in the audit trail. */
  rejected?: boolean
  rejectedReason?: string
  rejectedAt?: string
  rejectedBy?: string
  /** Automatic provenance stamps, set at creation/edit time by the page. */
  createdAt?: string
  createdBy?: string
  updatedAt?: string
}

export type LevelAuditEntry = {
  id: string
  rowId: string
  at: string
  by: string
  action: 'created' | 'edited' | 'rejected' | 'restored'
  reason?: string
}

export function LevelingBook({
  t,
  openingRL,
  closingRL,
  distanceKm,
  levelMethod,
  setOpeningRL,
  setClosingRL,
  setDistanceKm,
  setLevelMethod,
  closureCoefficient,
  setClosureCoefficient,
  levelRows,
  setLevelRows,
  computed,
  audit = [],
  onReject,
  onRestore,
  signOff,
  onSignOff,
}: {
  t: Translator
  openingRL: string
  closingRL: string
  distanceKm: string
  levelMethod: 'rise_and_fall' | 'height_of_collimation'
  setOpeningRL: Dispatch<SetStateAction<string>>
  setClosingRL: Dispatch<SetStateAction<string>>
  setDistanceKm: Dispatch<SetStateAction<string>>
  setLevelMethod: Dispatch<SetStateAction<'rise_and_fall' | 'height_of_collimation'>>
  /** Allowable-misclosure coefficient k in mm/√km (default 10). */
  closureCoefficient: string
  setClosureCoefficient: Dispatch<SetStateAction<string>>
  levelRows: LevelRow[]
  setLevelRows: Dispatch<SetStateAction<LevelRow[]>>
  computed: { ok: true; calc: LevelingResult } | { ok: false; errors: string[] }
  audit?: LevelAuditEntry[]
  onReject?: (rowId: string, reason: string) => void
  onRestore?: (rowId: string) => void
  signOff?: { name: string; date: string; confirmed: boolean } | null
  onSignOff?: (signOff: { name: string; date: string; confirmed: boolean }) => void
}) {
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Both leveling methods prepend one opening benchmark, then one result per
  // input row. Rejected rows are excluded from the computation, so they get no
  // computed values; active rows map to results in book order.
  const outRows = computed.ok ? computed.calc.readings.slice(1) : []
  const hasForwardSight = outRows.some(row => row.is !== undefined || row.fs !== undefined)
  let activeIndex = -1

  const update = (id: string, patch: Partial<LevelRow>) =>
    setLevelRows((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  const inputInvalid = (row: LevelRow): string | null => {
    const dec = (v: string) => v.trim() !== '' && !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(v.trim())
    if (dec(row.bs)) return 'BS must be a number'
    if (dec(row.is)) return 'IS must be a number'
    if (dec(row.fs)) return 'FS must be a number'
    if (row.bs.trim() && row.fs.trim() && !row.is.trim()) return 'BS and FS on the same row is only valid at a change point with an IS â€” check the booking'
    return null
  }

  return (
    <div className="card">
      <div className="card-header flex flex-wrap gap-4 items-center justify-between">
        <span className="label">{t('field.levelBook')}</span>
        <div className="flex gap-2">
          <button onClick={() => setLevelMethod('rise_and_fall')} className={`btn text-xs ${levelMethod === 'rise_and_fall' ? 'btn-primary' : 'btn-secondary'}`}>
            {t('leveling.riseFall')}
          </button>
          <button
            onClick={() => setLevelMethod('height_of_collimation')}
            className={`btn text-xs ${levelMethod === 'height_of_collimation' ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t('leveling.hoc')}
          </button>
        </div>
      </div>

      <div className="card-body space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="lvl-opening-rl">{t('leveling.openingRl')} (m)</label>
            <input id="lvl-opening-rl" aria-label={t('leveling.openingRl')} inputMode="decimal" className="input input-sm" value={openingRL} onChange={(e) => setOpeningRL(e.target.value)} placeholder="e.g. 100.000" />
          </div>
          <div>
            <label className="label" htmlFor="lvl-closing-rl">{t('leveling.closingRl')} (m)</label>
            <input id="lvl-closing-rl" aria-label={t('leveling.closingRl')} inputMode="decimal" className="input input-sm" value={closingRL} onChange={(e) => setClosingRL(e.target.value)} placeholder={t('common.optional')} />
          </div>
          <div>
            <label className="label" htmlFor="lvl-distance-km">{t('leveling.distanceKm')}</label>
            <input id="lvl-distance-km" aria-label={t('leveling.distanceKm')} inputMode="decimal" className="input input-sm" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="e.g. 1.2" />
          </div>
          <div>
            <label className="label" htmlFor="lvl-closure-k">Closure coefficient k (mm/√km)</label>
            <input id="lvl-closure-k" aria-label="Closure coefficient k" inputMode="decimal" min="0" step="0.1" type="number" className="input input-sm" value={closureCoefficient} onChange={(e) => setClosureCoefficient(e.target.value)} />
            <p className="mt-1 text-[10px] leading-snug text-[var(--text-muted)]">
              Default 10 (RDM 1.1 Kenya 2025 Table 5.1). Editable — confirm the value your specification requires.
            </p>
          </div>
        </div>

        <div className={styles.scroll} role="region" aria-label="Leveling observations" tabIndex={0}>
          <table className={`${styles.table} ${styles.leveling}`}>
            <caption className="sr-only">Leveling observations</caption>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="text-left sticky left-0 z-20 bg-[var(--bg-secondary)]">{t('common.station')}</th>
                <th>{t('leveling.bs')} (m)</th>
                <th>{t('leveling.is')} (m)</th>
                <th>{t('leveling.fs')} (m)</th>
                <th>{t('leveling.rise')}</th>
                <th>{t('leveling.fall')}</th>
                <th>{t('leveling.rl')}</th>
                <th className="text-left">{t('common.remarks')}</th>
                <th><span className="sr-only">Row actions</span></th>
              </tr>
            </thead>
            <tbody>
              {levelRows.map((r) => {
                const invalid = inputInvalid(r)
                const out = !r.rejected && computed.ok ? outRows[++activeIndex] : undefined
                return (
                  <tr key={r.id} className={r.rejected ? 'opacity-50 line-through' : undefined} data-rejected={r.rejected ? 'true' : undefined}>
                    <td className="text-left sticky left-0 z-10 bg-[var(--bg-secondary)]">
                      <input aria-label={t('common.station')} disabled={r.rejected} className="input input-sm" value={r.station} onChange={(e) => update(r.id, { station: e.target.value })} />
                    </td>
                    <td><input aria-label={t('leveling.bs')} inputMode="decimal" disabled={r.rejected} className="input input-sm" value={r.bs} onChange={(e) => update(r.id, { bs: e.target.value })} /></td>
                    <td><input aria-label={t('leveling.is')} inputMode="decimal" disabled={r.rejected} className="input input-sm" value={r.is} onChange={(e) => update(r.id, { is: e.target.value })} /></td>
                    <td><input aria-label={t('leveling.fs')} inputMode="decimal" disabled={r.rejected} className="input input-sm" value={r.fs} onChange={(e) => update(r.id, { fs: e.target.value })} /></td>
                    <td className="font-mono text-right">{out?.rise !== undefined ? Number(out.rise).toFixed(3) : '—'}</td>
                    <td className="font-mono text-right">{out?.fall !== undefined ? Number(out.fall).toFixed(3) : '—'}</td>
                    <td className="font-mono text-right">{out?.reducedLevel !== undefined ? Number(out.reducedLevel).toFixed(4) : '—'}</td>
                    <td className="text-left">
                      <input aria-label={t('common.remarks')} disabled={r.rejected} className="input input-sm" value={r.remarks} onChange={(e) => update(r.id, { remarks: e.target.value })} />
                      {invalid && <span className="block text-[10px] text-amber-400">{invalid}</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.rejected ? (
                        <button className="btn btn-secondary text-xs" onClick={() => onRestore?.(r.id)}>{t('common.restore') ?? 'Restore'}</button>
                      ) : (
                        <button className="btn btn-secondary text-xs" onClick={() => { setRejectTarget(r.id); setRejectReason('') }}>{t('common.reject') ?? 'Reject'}</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {rejectTarget && (
          <div className="p-3 border border-amber-500/40 bg-amber-500/5 rounded space-y-2" role="dialog" aria-label="Reject observation">
            <p className="text-sm font-semibold">Reject this observation? It stays in the book, struck through, and is excluded from computation.</p>
            <input
              className="input input-sm"
              placeholder="Reason (required) â€” e.g. staff not on same point"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              aria-label="Rejection reason"
            />
            <div className="flex gap-2">
              <button
                className="btn btn-primary text-xs"
                disabled={!rejectReason.trim()}
                onClick={() => { onReject?.(rejectTarget, rejectReason.trim()); setRejectTarget(null); setRejectReason('') }}
              >
                Confirm reject
              </button>
              <button className="btn btn-secondary text-xs" onClick={() => setRejectTarget(null)}>Cancel</button>
            </div>
          </div>
        )}

        <button
          onClick={() => setLevelRows((p) => [...p, { id: crypto.randomUUID(), station: `TP${p.length + 1}`, bs: '', is: '', fs: '', remarks: '' }])}
          className="btn btn-secondary"
        >
          {t('common.addRow')}
        </button>

        {audit.length > 0 && (
          <details className="text-xs text-[var(--text-secondary)]">
            <summary className="cursor-pointer">Audit trail ({audit.length} entr{audit.length === 1 ? 'y' : 'ies'})</summary>
            <ul className="mt-2 space-y-1 font-mono">
              {audit.map((a) => (
                <li key={a.id}>{a.at} Â· {a.by} Â· {a.action}{a.reason ? ` Â· ${a.reason}` : ''}</li>
              ))}
            </ul>
          </details>
        )}

        {/* Computed results â€” read-only panel, never mixed into input cells. */}
        <div className="border border-[var(--border-color)] rounded p-3 bg-[color-mix(in_srgb,var(--bg-primary)_40%,transparent)]" aria-label="Computed results (read-only)">
          <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Computed â€” read-only</div>
          {computed.ok ? (
            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <div className="text-xs text-[var(--text-muted)]">{t('leveling.arithmeticCheck')}</div>
                <div className="font-mono">{hasForwardSight ? computed.calc.arithmeticCheck ? t('common.pass') : t('common.fail') : 'Forward sight required'}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">{t('leveling.misclosure')}</div>
                <div className="font-mono">{!computed.calc.closingRLProvided ? 'Closing RL required' : !hasForwardSight ? 'Forward sight required' : `${Number(computed.calc.misclosure).toFixed(4)} m`}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">{t('leveling.allowable')} · k = {closureCoefficient || '10'} mm/√km</div>
                <div className="font-mono">{computed.calc.allowableMisclosure === undefined ? 'Run length required' : `Â±${Number(computed.calc.allowableMisclosure).toFixed(4)} m`}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Closure</div>
                <div className="font-mono">
                  {!computed.calc.closingRLProvided || !hasForwardSight
                    ? 'â€”'
                    : computed.calc.isAcceptable
                      ? <span className="text-green-500">PASS</span>
                      : <span className="text-red-500">FAIL</span>}
                </div>
              </div>
            </div>
          ) : (
            <ul className="text-sm text-red-300 list-disc list-inside">
              {computed.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>

        {signOff !== undefined && (
          <div className="border border-[var(--border-color)] rounded p-3 space-y-2" aria-label="Sign-off">
            <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Sign-off (not certification â€” the surveyor signs)</div>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="label" htmlFor="lvl-signoff-name">Name</label>
                <input id="lvl-signoff-name" className="input input-sm" value={signOff?.name ?? ''} onChange={(e) => onSignOff?.({ ...(signOff ?? { name: '', date: '', confirmed: false }), name: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="lvl-signoff-date">Date</label>
                <input id="lvl-signoff-date" type="date" className="input input-sm" value={signOff?.date ?? ''} onChange={(e) => onSignOff?.({ ...(signOff ?? { name: '', date: '', confirmed: false }), date: e.target.value })} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={signOff?.confirmed ?? false} onChange={(e) => onSignOff?.({ ...(signOff ?? { name: '', date: '', confirmed: false }), confirmed: e.target.checked })} />
                  I confirm these observations
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
