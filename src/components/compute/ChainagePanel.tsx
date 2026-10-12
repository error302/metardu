'use client'

import { useMemo, useState } from 'react'
import { computeChainageTable } from '@/lib/engine/chainage'
import { downloadRowsCsv } from './csvDownload'

function parseFinite(value: string): number | undefined {
  if (!value.trim()) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export function ChainagePanel() {
  const [startName, setStartName] = useState('START')
  const [startE, setStartE] = useState('')
  const [startN, setStartN] = useState('')
  const [startChainage, setStartChainage] = useState('')
  const [alignmentCsv, setAlignmentCsv] = useState('')

  const { rows, issues } = useMemo(() => {
    const errors: string[] = []
    const easting = parseFinite(startE)
    const northing = parseFinite(startN)
    const chainage = parseFinite(startChainage)
    if (easting === undefined) errors.push('Enter the start-point easting.')
    if (northing === undefined) errors.push('Enter the start-point northing.')
    if (chainage === undefined) errors.push('Enter the known start chainage.')
    if (!startName.trim()) errors.push('Enter a start-point name.')

    const points: Array<{ name: string; easting: number; northing: number }> = []
    const lines = alignmentCsv.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    for (const [index, line] of lines.entries()) {
      if (index === 0 && /^name\s*,/i.test(line)) continue
      const fields = line.split(',').map(field => field.trim())
      if (fields.length !== 3 || !fields[0]) {
        errors.push(`Alignment row ${index + 1}: use name,easting,northing.`)
        continue
      }
      const pointE = parseFinite(fields[1])
      const pointN = parseFinite(fields[2])
      if (pointE === undefined || pointN === undefined) {
        errors.push(`Alignment row ${index + 1}: easting and northing must be finite numbers.`)
        continue
      }
      points.push({ name: fields[0], easting: pointE, northing: pointN })
    }
    if (points.length === 0) errors.push('Add at least one alignment point.')

    const allPoints = easting !== undefined && northing !== undefined
      ? [{ name: startName.trim(), easting, northing }, ...points]
      : points
    for (let index = 1; index < allPoints.length; index += 1) {
      if (allPoints[index].easting === allPoints[index - 1].easting && allPoints[index].northing === allPoints[index - 1].northing) {
        errors.push(`Alignment point ${allPoints[index].name} duplicates the previous coordinate; check the sequence.`)
      }
    }
    if (errors.length || easting === undefined || northing === undefined || chainage === undefined) return { rows: [], issues: errors }
    return {
      rows: computeChainageTable({ start: { easting, northing }, startName: startName.trim(), startChainage: chainage, alignment: points }),
      issues: [],
    }
  }, [startName, startE, startN, startChainage, alignmentCsv])

  return (
    <div className="space-y-5 text-white">
      <div>
        <h2 className="text-xl font-semibold">Coordinate-based chainage</h2>
        <p className="mt-1 text-sm text-zinc-400">Accumulate straight-line distances through an ordered coordinate list. Confirm the coordinate reference system and traverse order before using the chainages for design or set-out.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-zinc-400">Start point name<input value={startName} onChange={event => setStartName(event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-zinc-400">Start easting (m)<input type="number" value={startE} onChange={event => setStartE(event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-zinc-400">Start northing (m)<input type="number" value={startN} onChange={event => setStartN(event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-zinc-400">Known start chainage (m)<input type="number" value={startChainage} onChange={event => setStartChainage(event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white" /></label>
      </div>
      <label className="block text-xs text-zinc-400">Ordered alignment points — CSV: name,easting,northing<textarea value={alignmentCsv} onChange={event => setAlignmentCsv(event.target.value)} rows={6} placeholder={'P1,500120.000,9850040.000\nP2,500205.000,9850100.000'} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-600" /></label>

      {issues.length > 0 && <div role="status" className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200"><ul className="list-inside list-disc space-y-1">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      {rows.length > 0 && <>
        <div className="overflow-x-auto rounded border border-zinc-800"><table className="w-full min-w-[560px] text-sm"><thead className="bg-zinc-800 text-zinc-300"><tr><th className="px-3 py-2 text-left">Point</th><th className="px-3 py-2 text-right">Easting</th><th className="px-3 py-2 text-right">Northing</th><th className="px-3 py-2 text-right">Segment (m)</th><th className="px-3 py-2 text-right">Chainage (m)</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.pointName}-${index}`} className="border-t border-zinc-800"><td className="px-3 py-2">{row.pointName}</td><td className="px-3 py-2 text-right">{row.easting.toFixed(3)}</td><td className="px-3 py-2 text-right">{row.northing.toFixed(3)}</td><td className="px-3 py-2 text-right">{row.distance.toFixed(3)}</td><td className="px-3 py-2 text-right font-medium">{row.chainage.toFixed(3)}</td></tr>)}</tbody></table></div>
        <button type="button" onClick={() => downloadRowsCsv('metardu-chainage.csv', ['Point', 'Easting_m', 'Northing_m', 'Segment_distance_m', 'Chainage_m'], rows.map(row => [row.pointName, row.easting, row.northing, row.distance, row.chainage]))} className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">Download chainage CSV</button>
      </>}
    </div>
  )
}
