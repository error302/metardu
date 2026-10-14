'use client'
import { useRef, useState } from 'react'
import Papa from 'papaparse'
import type { RoadDesignData, StationData } from '@/types/engineering'
import { parseRoadStationsCSV } from '@/lib/engineering/roadProjectOutputs'
import { resolveRoadDesignStations } from '@/lib/engineering/roadVerticalAlignment'
import { validateProfile } from '@/lib/engineering/profileGeometry'

interface DraftStation { id: string; chainage: string; groundLevel: string; designLevel: string; source: 'manual' | 'vertical-alignment'; profile: string; original?: StationData }
const draft = (station?: StationData): DraftStation => ({ id: crypto.randomUUID(), chainage: station ? String(station.chainage) : '',
  groundLevel: station ? String(station.groundLevel) : '', designLevel: station?.designLevel != null ? String(station.designLevel) : '',
  source: station?.designLevelSource ?? 'manual', profile: station?.groundProfile?.map(p => `${p.offset},${p.level}`).join('\n') ?? '', original: station })
const decimal = (text: string) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) && Number.isFinite(Number(text))

export function Step5Stations({ data, onSave }: { data: RoadDesignData | null; onSave: (stations: StationData[]) => void | Promise<boolean> }) {
  const [rows, setRows] = useState(() => (data?.stations ?? []).map(draft))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const update = (id: string, field: keyof Omit<DraftStation, 'id' | 'original'>, value: string) => {
    setRows(old => old.map(row => row.id === id ? { ...row, [field]: value } : row)); setError('')
  }
  const save = async () => {
    setError('')
    try {
      const stations = rows.map((row, i): StationData => {
        if (!decimal(row.chainage) || !decimal(row.groundLevel) || row.source === 'manual' && row.designLevel.trim() && !decimal(row.designLevel)) throw new RangeError(`Station ${i + 1}: complete finite chainage and ground RL are required; supply a finite design RL or leave it unknown.`)
        let groundProfile: StationData['groundProfile']
        if (row.profile.trim()) {
          const parsed = Papa.parse<string[]>(row.profile.trim(), { skipEmptyLines: 'greedy' })
          if (parsed.errors.length || parsed.data.some(pair => pair.length !== 2 || !pair.every(decimal))) throw new RangeError(`Station ${i + 1}: enter complete offset,ground_RL pairs, one per line.`)
          groundProfile = validateProfile(parsed.data.map(([offset, level]) => ({ offset: Number(offset), level: Number(level) })))
        }
        return { ...row.original, chainage: Number(row.chainage), groundLevel: Number(row.groundLevel),
          designLevel: row.source === 'manual' && row.designLevel.trim() ? Number(row.designLevel) : undefined,
          ...(row.source === 'vertical-alignment' ? { designLevelSource: 'vertical-alignment' as const } : row.original?.designLevelSource ? { designLevelSource: 'manual' as const } : {}), groundProfile }
      }).sort((a, b) => a.chainage - b.chainage)
      if (new Set(stations.map(s => s.chainage)).size !== stations.length) throw new RangeError('Station chainages must be unique.')
      if (data && stations.some(s => s.designLevelSource === 'vertical-alignment')) {
        const resolved = resolveRoadDesignStations({ ...data, stations }); if (resolved.issues.length) throw new RangeError(resolved.issues.join(' '))
      }
      setSaving(true)
      if (await onSave(stations) === false) throw new Error('Stations could not be saved. Your entered observations are preserved; retry after reviewing the connection.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Stations could not be saved.') }
    finally { setSaving(false) }
  }
  const importFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try { setRows(parseRoadStationsCSV(String(reader.result)).map(draft)); setError('') }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'The CSV could not be read.') }
    }
    reader.onerror = () => setError('The CSV file could not be read; current stations are preserved.')
    reader.readAsText(file); event.target.value = ''
  }
  return <div className="space-y-5">
    <div><h3 className="text-lg font-semibold text-white">Stations & Levels</h3><p className="text-sm text-zinc-400">Enter surveyed centreline RL, design surface RL and measured ground offsets. Blank levels remain unknown; zero is a valid measurement.</p></div>
    {error && <p role="alert" className="rounded border border-red-700 p-3 text-sm text-red-300">{error}</p>}
    {rows.map((row, i) => <section key={row.id} className="rounded border border-zinc-700 p-4">
      <div className="mb-3 flex justify-between"><h4>Station {i + 1}</h4><button type="button" className="min-h-11 px-3 text-red-300" onClick={() => setRows(old => old.filter(item => item.id !== row.id))}>Remove station {i + 1}</button></div>
      <label className="mb-3 block text-sm text-zinc-400">Design level source<select aria-label={`Design level source ${i + 1}`} value={row.source} onChange={event => update(row.id, 'source', event.target.value as DraftStation['source'])} className="ml-3 min-h-11 rounded border border-zinc-700 bg-zinc-900 p-2"><option value="manual">Manual target RL</option><option value="vertical-alignment">Saved vertical alignment</option></select></label>
      <div className="grid gap-3 sm:grid-cols-3">{([{ field: 'chainage', label: 'Chainage' }, { field: 'groundLevel', label: 'Ground RL' }, { field: 'designLevel', label: 'Design surface RL' }] as const).map(({ field, label }) => <label key={field} className="text-sm text-zinc-400">{label} (m)<input aria-label={`${label} ${i + 1}`} type="number" step="any" disabled={field === 'designLevel' && row.source === 'vertical-alignment'} value={field === 'designLevel' && row.source === 'vertical-alignment' ? '' : row[field]} onChange={event => update(row.id, field, event.target.value)} className="mt-1 min-h-11 w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-white" /></label>)}</div>
      <label className="mt-3 block text-sm text-zinc-400">Measured ground profile — offset, ground RL (m)<textarea aria-label={`Measured ground profile ${i + 1}`} rows={4} value={row.profile} onChange={event => update(row.id, 'profile', event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 p-2 font-mono text-white" /></label>
      <p className="text-xs text-zinc-400">One pair per line. Negative offsets are left and positive offsets right. Survey far enough to capture both slope daylight points; the profile must agree with the centreline RL.</p>
    </section>)}
    <div className="flex flex-wrap gap-3"><button type="button" className="min-h-11 rounded border border-zinc-700 px-4" onClick={() => setRows(old => [...old, draft()])}>+ Add Station</button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importFile} />
      <button type="button" className="min-h-11 rounded border border-zinc-700 px-4" onClick={() => inputRef.current?.click()}>Import CSV</button>
      {(rows.length > 0 || !!data?.stations.length) && <button type="button" disabled={saving} className="min-h-11 rounded bg-amber-500 px-5 font-semibold text-black" onClick={() => void save()}>{saving ? 'Saving…' : 'Save Stations'}</button>}
    </div><p className="text-xs text-zinc-400">CSV headers: chainage,ground_level,design_level. Add offset for a measured profile CSV with multiple observations at each chainage. Choose the saved vertical alignment explicitly to use freshly evaluated surface levels; manual targets are retained. Design surface RL is the finished centreline level; the saved template depth defines formation beneath it.</p>
  </div>
}
