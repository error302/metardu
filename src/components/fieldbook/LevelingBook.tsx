'use client';

import type { Dispatch, SetStateAction } from 'react'
import type { LevelingResult } from '@/lib/engine/types'
import styles from './FieldbookTable.module.css'

type Translator = (key: string, values?: Record<string, string | number>) => string

export type LevelRow = { id: string; station: string; bs: string; is: string; fs: string; remarks: string }

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
  levelRows,
  setLevelRows,
  computed,
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
  levelRows: LevelRow[]
  setLevelRows: Dispatch<SetStateAction<LevelRow[]>>
  computed: { ok: true; calc: LevelingResult } | { ok: false; errors: string[] }
}) {
  // Both leveling methods prepend one opening benchmark, then one result per input row.
  const outRows = computed.ok ? computed.calc.readings.slice(1) : []
  const hasForwardSight = outRows.some(row => row.is !== undefined || row.fs !== undefined)

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
            <label className="label" htmlFor="lvl-opening-rl">{t('leveling.openingRl')}</label>
            <input id="lvl-opening-rl" aria-label={t('leveling.openingRl')} inputMode="decimal" className="input input-sm" value={openingRL} onChange={(e) => setOpeningRL(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="lvl-closing-rl">{t('leveling.closingRl')}</label>
            <input id="lvl-closing-rl" aria-label={t('leveling.closingRl')} inputMode="decimal" className="input input-sm" value={closingRL} onChange={(e) => setClosingRL(e.target.value)} placeholder={t('common.optional')} />
          </div>
          <div>
            <label className="label" htmlFor="lvl-distance-km">{t('leveling.distanceKm')}</label>
            <input id="lvl-distance-km" aria-label={t('leveling.distanceKm')} inputMode="decimal" className="input input-sm" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
          </div>
        </div>

        <p className="text-xs text-[var(--text-secondary)]">Scroll the table horizontally to see every observation and result. Station names and row actions stay visible.</p>
        <div className={styles.scroll} role="region" aria-label="Leveling observations" tabIndex={0}>
          <table className={`${styles.table} ${styles.leveling}`}>
            <caption className="sr-only">Leveling observations and computed results</caption>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="text-left">{t('common.station')}</th>
                <th>{t('leveling.bs')}</th>
                <th>{t('leveling.is')}</th>
                <th>{t('leveling.fs')}</th>
                <th>{t('leveling.rise')}</th>
                <th>{t('leveling.fall')}</th>
                <th>{t('leveling.rl')}</th>
                <th className="text-left">{t('common.remarks')}</th>
                <th><span className="sr-only">Row actions</span></th>
              </tr>
            </thead>
            <tbody>
              {levelRows.map((r, idx) => {
                const out = outRows[idx]
                return (
                  <tr key={r.id}>
                    <td className="text-left"><input aria-label={t('common.station')} className="input input-sm" value={r.station} onChange={(e) => setLevelRows((p) => p.map((x) => (x.id === r.id ? { ...x, station: e.target.value } : x)))} /></td>
                    <td><input aria-label={t('leveling.bs')} inputMode="decimal" className="input input-sm" value={r.bs} onChange={(e) => setLevelRows((p) => p.map((x) => (x.id === r.id ? { ...x, bs: e.target.value } : x)))} /></td>
                    <td><input aria-label={t('leveling.is')} inputMode="decimal" className="input input-sm" value={r.is} onChange={(e) => setLevelRows((p) => p.map((x) => (x.id === r.id ? { ...x, is: e.target.value } : x)))} /></td>
                    <td><input aria-label={t('leveling.fs')} inputMode="decimal" className="input input-sm" value={r.fs} onChange={(e) => setLevelRows((p) => p.map((x) => (x.id === r.id ? { ...x, fs: e.target.value } : x)))} /></td>
                    <td className="font-mono text-right">{out?.rise !== undefined ? Number(out.rise).toFixed(3) : '—'}</td>
                    <td className="font-mono text-right">{out?.fall !== undefined ? Number(out.fall).toFixed(3) : '—'}</td>
                    <td className="font-mono text-right">{out?.reducedLevel !== undefined ? Number(out.reducedLevel).toFixed(4) : '—'}</td>
                    <td className="text-left"><input aria-label={t('common.remarks')} className="input input-sm" value={r.remarks} onChange={(e) => setLevelRows((p) => p.map((x) => (x.id === r.id ? { ...x, remarks: e.target.value } : x)))} /></td>
                    <td><button className="btn btn-secondary text-xs" onClick={() => setLevelRows((p) => p.filter((x) => x.id !== r.id))}>{t('common.remove')}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <button
          onClick={() => setLevelRows((p) => [...p, { id: crypto.randomUUID(), station: `TP${p.length + 1}`, bs: '', is: '', fs: '', remarks: '' }])}
          className="btn btn-secondary"
        >
          {t('common.addRow')}
        </button>

        {computed.ok && (
          <div className="grid md:grid-cols-3 gap-3">
            <div className="p-3 bg-[color-mix(in_srgb,var(--bg-primary)_40%,transparent)] border border-[var(--border-color)] rounded">
              <div className="text-xs text-[var(--text-muted)]">{t('leveling.arithmeticCheck')}</div>
              <div className="font-mono">{hasForwardSight ? computed.calc.arithmeticCheck ? t('common.pass') : t('common.fail') : 'Forward sight required'}</div>
            </div>
            <div className="p-3 bg-[color-mix(in_srgb,var(--bg-primary)_40%,transparent)] border border-[var(--border-color)] rounded">
              <div className="text-xs text-[var(--text-muted)]">{t('leveling.misclosure')}</div>
              <div className="font-mono">{!computed.calc.closingRLProvided ? 'Closing RL required' : !hasForwardSight ? 'Forward sight required' : `${Number(computed.calc.misclosure).toFixed(4)} m`}</div>
            </div>
            <div className="p-3 bg-[color-mix(in_srgb,var(--bg-primary)_40%,transparent)] border border-[var(--border-color)] rounded">
              <div className="text-xs text-[var(--text-muted)]">{t('leveling.allowable')} · engine reference</div>
              <div className="font-mono">{computed.calc.allowableMisclosure === undefined ? 'Run length required' : `±${Number(computed.calc.allowableMisclosure).toFixed(4)} m`}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
