'use client'

import { useMemo, useState } from 'react'
import { tacheometryReduction } from '@/lib/engine/tacheometry'
import { downloadRowsCsv } from './csvDownload'

const parseNumber = (value: string) => value.trim() === '' || !Number.isFinite(Number(value)) ? undefined : Number(value)

export function TacheometryPanel() {
  const [values, setValues] = useState({ instrumentAxisRl: '', upper: '', middle: '', lower: '', verticalAngle: '', k: '', c: '' })
  const result = useMemo(() => {
    const parsed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, parseNumber(value)])) as Record<keyof typeof values, number | undefined>
    const labels: Record<keyof typeof values, string> = {
      instrumentAxisRl: 'instrument-axis RL (station RL plus instrument height)', upper: 'upper staff reading', middle: 'middle staff reading',
      lower: 'lower staff reading', verticalAngle: 'vertical angle', k: 'stadia multiplying constant K', c: 'additive constant C',
    }
    const issues = (Object.keys(parsed) as Array<keyof typeof values>).filter(key => parsed[key] === undefined).map(key => `Enter a finite ${labels[key]}.`)
    if (issues.length) return { value: null, issues }
    const { instrumentAxisRl, upper, middle, lower, verticalAngle, k, c } = parsed as Record<keyof typeof values, number>
    if (!(upper >= middle && middle >= lower && upper > lower)) issues.push('Staff readings must satisfy upper ≥ middle ≥ lower, with a positive staff intercept.')
    if (k <= 0) issues.push('Stadia multiplying constant K must be greater than zero.')
    if (issues.length) return { value: null, issues }
    return { value: tacheometryReduction({ instrumentHeight: instrumentAxisRl, upper, middle, lower, verticalAngleDeg: verticalAngle, K: k, C: c }), issues: [] }
  }, [values])

  const set = (key: keyof typeof values, value: string) => setValues(current => ({ ...current, [key]: value }))
  const output = result.value
  const fields: Array<[keyof typeof values, string, string, string?]> = [
    ['instrumentAxisRl', 'Instrument axis RL (m)', 'Reduced level of station + measured instrument height.'],
    ['upper', 'Upper staff reading (m)', ''], ['middle', 'Middle staff reading (m)', ''], ['lower', 'Lower staff reading (m)', ''],
    ['verticalAngle', 'Vertical angle (degrees)', 'Positive is above the horizontal; negative is below.'],
    ['k', 'Stadia multiplying constant K', 'Enter the instrument constant.'], ['c', 'Additive constant C (m)', 'Enter the instrument constant.'],
  ]

  return (
    <div className="space-y-5 text-white">
      <div><h2 className="text-xl font-semibold">Tacheometric reduction</h2><p className="mt-1 text-sm text-zinc-400">Compute stadia distance and staff-station RL from the observed staff readings, vertical angle and instrument constants. No readings or constants are prefilled.</p></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([key, label, help]) => <label key={key} className="text-xs text-zinc-400">{label}<input type="number" step="any" value={values[key]} onChange={event => set(key, event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white" />{help && <span className="mt-1 block text-[11px] text-zinc-500">{help}</span>}</label>)}
      </div>
      {result.issues.length > 0 && <div role="status" className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200"><ul className="list-inside list-disc space-y-1">{result.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      {output && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
          ['Staff intercept S', `${output.S.toFixed(4)} m`], ['Horizontal distance', `${output.horizontalDistance.toFixed(3)} m`],
          ['Vertical distance', `${output.verticalDistance.toFixed(3)} m`], ['Staff station RL', `${output.staffStationRL.toFixed(3)} m`],
        ].map(([label, value]) => <div key={label} className="rounded border border-zinc-800 bg-zinc-950/50 p-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div>
        <button type="button" onClick={() => downloadRowsCsv('metardu-tacheometry-reduction.csv', ['Staff_intercept_m', 'Horizontal_distance_m', 'Vertical_distance_m', 'Staff_station_RL_m'], [[output.S, output.horizontalDistance, output.verticalDistance, output.staffStationRL]])} className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">Download reduction CSV</button>
      </>}
    </div>
  )
}
