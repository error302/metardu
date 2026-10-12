'use client'

import { useMemo, useState } from 'react'
import { computeSettingOut, parseSettingOutCSV, type Backsight, type InstrumentStation } from '@/lib/computations/settingOutEngine'
import { downloadRowsCsv } from './csvDownload'

const strictNumber = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined

export function SettingOutPanel() {
  const [stationText, setStationText] = useState({ e: '', n: '', rl: '', ih: '' })
  const [backsightText, setBacksightText] = useState({ e: '', n: '' })
  const [pointsCsv, setPointsCsv] = useState('')

  const computation = useMemo(() => {
    const issues: string[] = []
    const stationValues = Object.fromEntries(Object.entries(stationText).map(([key, value]) => [key, strictNumber(value)])) as Record<keyof typeof stationText, number | undefined>
    const backsightValues = Object.fromEntries(Object.entries(backsightText).map(([key, value]) => [key, strictNumber(value)])) as Record<keyof typeof backsightText, number | undefined>
    for (const key of Object.keys(stationValues) as Array<keyof typeof stationText>) if (stationValues[key] === undefined) issues.push(`Enter a finite station ${key.toUpperCase()}.`)
    for (const key of Object.keys(backsightValues) as Array<keyof typeof backsightText>) if (backsightValues[key] === undefined) issues.push(`Enter a finite backsight ${key.toUpperCase()}.`)
    if (stationValues.e !== undefined && stationValues.n !== undefined && backsightValues.e !== undefined && backsightValues.n !== undefined && stationValues.e === backsightValues.e && stationValues.n === backsightValues.n) {
      issues.push('The backsight coordinate must differ from the instrument station.')
    }

    const lines = pointsCsv.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    const seenIds = new Set<string>()
    lines.forEach((line, index) => {
      if (index === 0 && /^(id|point_id)\s*,/i.test(line)) return
      const fields = line.split(',')
      if (fields.length < 5) {
        issues.push(`Design point row ${index + 1}: include ID, easting, northing, RL and target height.`)
        return
      }
      const pointId = fields[0].trim()
      if (!pointId) issues.push(`Design point row ${index + 1}: enter a point ID.`)
      else if (seenIds.has(pointId)) issues.push(`Design point row ${index + 1}: point ID “${pointId}” is duplicated.`)
      seenIds.add(pointId)
      const numeric = fields.slice(1, 5).map(strictNumber)
      if (numeric.some(value => value === undefined)) issues.push(`Design point row ${index + 1}: easting, northing, RL and target height must be finite numbers.`)
      if (numeric[3] !== undefined && numeric[3] < 0) issues.push(`Design point row ${index + 1}: target height must be non-negative.`)
    })
    if (lines.length === 0) issues.push('Add at least one design point.')

    if (issues.length > 0) return { result: null, issues }
    const points = parseSettingOutCSV(pointsCsv)
    if (points.length === 0 || points.length !== lines.length - (/^(id|point_id)\s*,/i.test(lines[0]) ? 1 : 0)) {
      return { result: null, issues: ['One or more design-point rows could not be parsed; check comma-separated values and use a unique, non-empty point ID.'] }
    }
    const station: InstrumentStation = stationValues as InstrumentStation
    const backsight: Backsight = backsightValues as Backsight
    for (const point of points) {
      if (point.e === station.e && point.n === station.n) issues.push(`Design point ${point.id}: target coordinate coincides with the station.`)
    }
    if (issues.length > 0) return { result: null, issues }
    return { result: computeSettingOut(station, backsight, points), issues: [] }
  }, [stationText, backsightText, pointsCsv])

  const setStation = (key: keyof typeof stationText, value: string) => setStationText(current => ({ ...current, [key]: value }))
  const setBacksight = (key: keyof typeof backsightText, value: string) => setBacksightText(current => ({ ...current, [key]: value }))
  const result = computation.result

  return (
    <div className="space-y-5 text-white">
      <div><h2 className="text-xl font-semibold">Coordinate-based setting out</h2><p className="mt-1 text-sm text-zinc-400">Calculate horizontal angle, horizontal/slope distance and vertical angle from an instrument station and oriented backsight. Confirm project CRS, orientation, units and target heights before field use.</p></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <fieldset className="grid grid-cols-2 gap-3 rounded border border-zinc-800 p-3"><legend className="px-2 text-sm font-medium">Instrument station</legend>
          {(['e', 'n', 'rl', 'ih'] as const).map(key => <label key={key} className="text-xs text-zinc-400">{key === 'e' ? 'Easting (m)' : key === 'n' ? 'Northing (m)' : key === 'rl' ? 'Station RL (m)' : 'Instrument height (m)'}<input type="number" step="any" value={stationText[key]} onChange={event => setStation(key, event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white" /></label>)}
        </fieldset>
        <fieldset className="grid grid-cols-2 gap-3 rounded border border-zinc-800 p-3"><legend className="px-2 text-sm font-medium">Orientation backsight</legend>
          {(['e', 'n'] as const).map(key => <label key={key} className="text-xs text-zinc-400">{key === 'e' ? 'Easting (m)' : 'Northing (m)'}<input type="number" step="any" value={backsightText[key]} onChange={event => setBacksight(key, event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white" /></label>)}
          <p className="col-span-2 text-xs text-zinc-500">The backsight defines the horizontal circle orientation; verify its bearing and setup in the field.</p>
        </fieldset>
      </div>
      <label className="block text-xs text-zinc-400">Design points CSV: id,easting,northing,RL,target_height[,description]<textarea value={pointsCsv} onChange={event => setPointsCsv(event.target.value)} rows={6} placeholder={'P01,500100.000,9850020.000,102.500,1.800,Drain inlet'} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-600" /></label>
      {computation.issues.length > 0 && <div role="status" className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200"><ul className="list-inside list-disc space-y-1">{computation.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      {result && <>
        <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-300">Backsight bearing: <span className="font-semibold text-white">{result.bsBearing}</span> · {result.totalPoints} design point(s)</div>
        <div className="overflow-x-auto rounded border border-zinc-800"><table className="w-full min-w-[800px] text-sm"><thead className="bg-zinc-800 text-zinc-300"><tr><th className="px-3 py-2 text-left">Point</th><th className="px-3 py-2 text-right">Hz angle</th><th className="px-3 py-2 text-right">HD (m)</th><th className="px-3 py-2 text-right">Vertical angle</th><th className="px-3 py-2 text-right">Slope distance (m)</th><th className="px-3 py-2 text-right">Design RL</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.id} className="border-t border-zinc-800"><td className="px-3 py-2">{row.id}</td><td className="px-3 py-2 text-right">{row.HzAngle}</td><td className="px-3 py-2 text-right">{row.HD.toFixed(3)}</td><td className="px-3 py-2 text-right">{row.VA}</td><td className="px-3 py-2 text-right">{row.SD.toFixed(3)}</td><td className="px-3 py-2 text-right">{row.designRL.toFixed(3)}</td></tr>)}</tbody></table></div>
        <button type="button" onClick={() => downloadRowsCsv('metardu-setting-out.csv', ['Point_ID', 'Design_Easting_m', 'Design_Northing_m', 'Design_RL_m', 'Horizontal_angle_DMS', 'Horizontal_distance_m', 'Vertical_angle_DMS', 'Slope_distance_m', 'Target_height_m'], result.rows.map(row => [row.id, row.designE, row.designN, row.designRL, row.HzAngle, row.HD, row.VA, row.SD, row.TH]))} className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">Download setting-out CSV</button>
      </>}
    </div>
  )
}
