'use client';

import { useState, type Dispatch, type SetStateAction } from 'react'
import type { ControlRow } from '@/app/fieldbook/types'

type Translator = (key: string, values?: Record<string, string | number>) => string

export function ControlBook({
  t,
  station,
  setStation,
  rows,
  setRows,
  onReject,
  onRestore,
  computed,
}: {
  t: Translator
  station: { name: string; e: string; n: string; z: string }
  setStation: Dispatch<SetStateAction<{ name: string; e: string; n: string; z: string }>>
  rows: ControlRow[]
  setRows: Dispatch<SetStateAction<ControlRow[]>>
  onReject?: (rowId: string, reason: string) => void
  onRestore?: (rowId: string) => void
  computed: { ok: true; rows: Array<{ computed: { easting: number; northing: number; elevation: number } | null }> } | { ok: false; errors: string[] }
}) {
  const outRows = computed.ok ? computed.rows : []
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  return (
    <div role="region" aria-label="Control observations" className="card">
      <div className="card-header flex items-center justify-between gap-3">
        <span className="label">{t('field.controlNotes')}</span>
        <button
          onClick={() =>
            setRows((p) => [
              ...p,
              { id: crypto.randomUUID(), pointId: `P${p.length + 1}`, instrumentHeight: '1.500', targetHeight: '1.500', bearing: '', verticalAngle: '0', slopeDistance: '', remarks: '' },
            ])
          }
          className="btn btn-secondary text-xs"
        >
          {t('common.addRow')}
        </button>
      </div>
      <div className="card-body space-y-4">
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="label">{t('common.station')}</label>
            <input aria-label="Name" className="input input-sm" value={station.name} onChange={(e) => setStation((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('common.easting')}</label>
            <input aria-label="E" inputMode="decimal" className="input input-sm" value={station.e} onChange={(e) => setStation((p) => ({ ...p, e: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('common.northing')}</label>
            <input aria-label="N" inputMode="decimal" className="input input-sm" value={station.n} onChange={(e) => setStation((p) => ({ ...p, n: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('common.elevation')}</label>
            <input aria-label="Z" inputMode="decimal" className="input input-sm" value={station.z} onChange={(e) => setStation((p) => ({ ...p, z: e.target.value }))} />
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="table min-w-[1100px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="text-left">{t('common.pointId')}</th>
                <th>{t('field.instrumentHeight')}</th>
                <th>{t('field.targetHeight')}</th>
                <th className="text-left">{t('traverse.bearing')}</th>
                <th>{t('field.verticalAngle')}</th>
                <th>{t('field.slopeDistance')}</th>
                <th className="text-right">{t('common.easting')}</th>
                <th className="text-right">{t('common.northing')}</th>
                <th className="text-right">{t('common.elevation')}</th>
                <th className="text-left">{t('common.remarks')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const out = outRows[idx]
                return (
                  <tr key={r.id}>
                    <td className="text-left"><input disabled={r.rejected} aria-label="Point ID" className="input input-sm" value={String(r.pointId ?? '')} onChange={(e) => setRows((p) => p.map((x) => (x.id === r.id ? { ...x, pointId: e.target.value } : x)))} /></td>
                    <td><input disabled={r.rejected} aria-label="Instrument Height" inputMode="decimal" className="input input-sm" value={String(r.instrumentHeight ?? '')} onChange={(e) => setRows((p) => p.map((x) => (x.id === r.id ? { ...x, instrumentHeight: e.target.value } : x)))} /></td>
                    <td><input disabled={r.rejected} aria-label="Target Height" inputMode="decimal" className="input input-sm" value={String(r.targetHeight ?? '')} onChange={(e) => setRows((p) => p.map((x) => (x.id === r.id ? { ...x, targetHeight: e.target.value } : x)))} /></td>
                    <td className="text-left"><input disabled={r.rejected} aria-label="Bearing" className="input input-sm font-mono" value={String(r.bearing ?? '')} onChange={(e) => setRows((p) => p.map((x) => (x.id === r.id ? { ...x, bearing: e.target.value } : x)))} /></td>
                    <td><input disabled={r.rejected} aria-label="Vertical Angle" inputMode="decimal" className="input input-sm font-mono" value={String(r.verticalAngle ?? '')} onChange={(e) => setRows((p) => p.map((x) => (x.id === r.id ? { ...x, verticalAngle: e.target.value } : x)))} /></td>
                    <td><input disabled={r.rejected} aria-label="Slope Distance" inputMode="decimal" className="input input-sm font-mono" value={String(r.slopeDistance ?? '')} onChange={(e) => setRows((p) => p.map((x) => (x.id === r.id ? { ...x, slopeDistance: e.target.value } : x)))} /></td>
                    <td className="font-mono text-right">{out?.computed ? Number(out.computed.easting).toFixed(4) : '—'}</td>
                    <td className="font-mono text-right">{out?.computed ? Number(out.computed.northing).toFixed(4) : '—'}</td>
                    <td className="font-mono text-right">{out?.computed ? Number(out.computed.elevation).toFixed(4) : '—'}</td>
                    <td className="text-left"><input aria-label="Remarks" className="input input-sm" value={String(r.remarks ?? '')} onChange={(e) => setRows((p) => p.map((x) => (x.id === r.id ? { ...x, remarks: e.target.value } : x)))} /></td>
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

        <button
          onClick={() =>
            setRows((p) => [
              ...p,
              { id: crypto.randomUUID(), pointId: `P${p.length + 1}`, instrumentHeight: '1.500', targetHeight: '1.500', bearing: '', verticalAngle: '0', slopeDistance: '', remarks: '' },
            ])
          }
          className="btn btn-secondary"
        >
          {t('common.addRow')}
        </button>

        {rejectTarget && (
          <div className="p-3 border border-amber-500/40 bg-amber-500/5 rounded space-y-2" role="dialog" aria-label="Reject observation">
            <p className="text-sm font-semibold">Reject this observation? It stays in the book, struck through, and is excluded from computation.</p>
            <input
              className="input input-sm"
              placeholder="Reason (required)"
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
      </div>
    </div>
  )
}
