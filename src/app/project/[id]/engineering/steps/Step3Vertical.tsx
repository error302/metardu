'use client'
import { useState } from 'react'
import type { RoadDesignData, VerticalIP } from '@/types/engineering'
import { calculateRoadVertical, validateVerticalDraft } from '@/lib/engineering/roadVerticalAlignment'

interface Draft { id: string; chainage: string; rl: string; k: string; length: string; original?: VerticalIP }
const draft = (p?: VerticalIP): Draft => ({ id: p?.id || crypto.randomUUID(), chainage: p ? String(p.chainage) : '', rl: p ? String(p.reducedLevel) : '', k: p?.kValue != null ? String(p.kValue) : '', length: p?.curveLength != null ? String(p.curveLength) : '', original: p })
const value = (text: string, label: string) => {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) || !Number.isFinite(Number(text))) throw new RangeError(`${label}: supply a complete finite decimal.`)
  return Number(text)
}
export function Step3Vertical({ data, onSave }: { data: RoadDesignData | null; onSave: (vips: VerticalIP[], interval?: number) => void | Promise<boolean> }) {
  const [rows, setRows] = useState(() => (data?.vips ?? []).map(draft))
  const [interval, setInterval] = useState(data?.verticalStationIntervalM != null ? String(data.verticalStationIntervalM) : '')
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const update = (id: string, field: keyof Omit<Draft, 'id' | 'original'>, text: string) => { setError(''); setRows(old => old.map(row => row.id === id ? { ...row, [field]: text } : row)) }
  const parse = (): VerticalIP[] => rows.map((row, i) => ({ ...row.original, id: row.id, chainage: value(row.chainage, `VIP ${i + 1} chainage`), reducedLevel: value(row.rl, `VIP ${i + 1} tangent intersection RL`),
    kValue: row.k.trim() ? value(row.k, `VIP ${i + 1} K`) : undefined, curveLength: row.length.trim() ? value(row.length, `VIP ${i + 1} curve length`) : undefined })).sort((a, b) => a.chainage - b.chainage)
  const save = async () => {
    setError('')
    try {
      const points = parse(), spacing = interval.trim() ? value(interval, 'Design interval') : undefined
      validateVerticalDraft(points, spacing); setSaving(true)
      if (await onSave(points, spacing) === false) throw new Error('Vertical design could not be saved; your entered values remain on this page.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Review the vertical design inputs.') }
    finally { setSaving(false) }
  }
  let issues: string[] = []
  try { if (rows.length >= 2) issues = calculateRoadVertical(parse()).issues } catch { /* Incomplete fields are reported when saving. */ }
  return <div className="space-y-5">
    <h3 className="text-lg font-semibold">Vertical Alignment</h3>
    <p className="text-sm text-zinc-400">Enter approved tangent intersection points and symmetric parabolic curve lengths or K values (metres per percent grade change). Endpoints define coverage. Missing values remain unknown; curve length is never selected from a standard or shortened automatically.</p>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {issues.map(issue => <p role="status" key={issue} className="text-sm text-amber-300">Draft design requires review: {issue}</p>)}
    {rows.map((row, i) => <section key={row.id} className="rounded border border-zinc-700 p-4">
      <div className="mb-3 flex justify-between"><h4>VIP {i + 1}</h4><button type="button" aria-label={`Remove VIP ${i + 1}`} onClick={() => setRows(old => old.filter(p => p.id !== row.id))} className="min-h-11 px-3 text-red-300">Remove</button></div>
      <div className="grid gap-3 sm:grid-cols-2">{([{ field: 'chainage', label: 'Chainage (m)' }, { field: 'rl', label: 'Tangent intersection RL (m)' }, { field: 'length', label: 'Approved curve length (m, optional)' }, { field: 'k', label: 'Approved K (m/%, optional)' }] as const).map(({ field, label }) => <label key={field} className="text-sm text-zinc-400">{label}<input aria-label={`VIP ${i + 1} ${field}`} type="number" step="any" value={row[field]} onChange={e => update(row.id, field, e.target.value)} className="mt-1 min-h-11 w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-white" /></label>)}</div>
    </section>)}
    <label className="block text-sm text-zinc-400">Design profile interval (m, optional)<input type="number" step="any" value={interval} onChange={e => setInterval(e.target.value)} className="mt-1 min-h-11 w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-white" /></label>
    <p className="text-xs text-zinc-400">Blank interval exports saved station and critical design chainages only. VIP RL is a tangent intersection level; the actual parabolic surface at that chainage can differ. Saved drafts do not establish design approval or sight-distance compliance.</p>
    <div className="flex flex-wrap gap-3"><button type="button" onClick={() => setRows(old => [...old, draft()])} className="min-h-11 rounded border border-zinc-700 px-4">+ Add VIP</button>{(rows.length > 0 || !!data?.vips.length) && <button type="button" disabled={saving} onClick={() => void save()} className="min-h-11 rounded bg-amber-500 px-5 font-semibold text-black">{saving ? 'Saving…' : 'Save VIPs'}</button>}</div>
  </div>
}
