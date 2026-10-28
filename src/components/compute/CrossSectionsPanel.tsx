'use client'

import { useMemo, useState } from 'react'
import { computeSectionArea, computeCrossSectionVolumes, type CrossSection } from '@/lib/engine/crossSectionVolume'
import { downloadRowsCsv } from './csvDownload'

const strictNumber = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined

function parseProfileCsv(csv: string): { sections: CrossSection[]; issues: string[] } {
  const issues: string[] = []
  const sections = new Map<number, Array<{ offset: number; rl: number }>>()
  const lines = csv.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  lines.forEach((line, index) => {
    if (index === 0 && /^chainage\s*[,\t;]/i.test(line)) return
    const cells = line.split(/[,\t;]/).map(cell => cell.trim())
    if (cells.length !== 3) {
      issues.push(`Profile row ${index + 1}: use chainage,offset,RL.`)
      return
    }
    const [chainage, offset, rl] = cells.map(strictNumber)
    if (chainage === undefined || offset === undefined || rl === undefined) {
      issues.push(`Profile row ${index + 1}: chainage, offset and RL must be finite numbers.`)
      return
    }
    sections.set(chainage, [...(sections.get(chainage) ?? []), { offset, rl }])
  })

  const ordered = Array.from(sections.entries()).sort(([a], [b]) => a - b).map(([chainage, points]) => ({ chainage, points }))
  if (ordered.length < 2) issues.push('Enter profiles for at least two distinct chainages.')
  ordered.forEach(section => {
    if (section.points.length < 2) issues.push(`Chainage ${section.chainage}: enter at least two offset/RL points.`)
    const offsets = section.points.map(point => point.offset)
    if (new Set(offsets).size !== offsets.length) issues.push(`Chainage ${section.chainage}: duplicate offsets make the section ambiguous.`)
  })
  return { sections: ordered, issues }
}

export function CrossSectionsPanel() {
  const [designLevelText, setDesignLevelText] = useState('')
  const [profileCsv, setProfileCsv] = useState('')
  const calculation = useMemo(() => {
    const parsed = parseProfileCsv(profileCsv)
    const designLevel = strictNumber(designLevelText)
    if (designLevel === undefined) parsed.issues.push('Enter the formation/design RL applied to these sections.')
    if (parsed.issues.length || designLevel === undefined) return { sections: parsed.sections, designLevel, areas: [], volume: null, issues: parsed.issues }
    try {
      const areas = parsed.sections.map(section => computeSectionArea(section, designLevel))
      const volume = computeCrossSectionVolumes(parsed.sections, designLevel)
      return { sections: parsed.sections, designLevel, areas, volume, issues: [] }
    } catch (error) {
      return { sections: parsed.sections, designLevel, areas: [], volume: null, issues: [error instanceof Error ? error.message : 'Cross-section calculation failed.'] }
    }
  }, [profileCsv, designLevelText])

  return (
    <div className="space-y-5 text-white">
      <div><h2 className="text-xl font-semibold">Cross-section areas and volumes</h2><p className="mt-1 text-sm text-zinc-400">Paste surveyed profiles as chainage,offset,RL rows and provide the formation RL. The design RL entered here is applied uniformly to every section; use another workflow for a varying vertical alignment.</p></div>
      <label className="block max-w-sm text-xs text-zinc-400">Formation/design RL (m)<input type="number" step="any" value={designLevelText} onChange={event => setDesignLevelText(event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white" /></label>
      <label className="block text-xs text-zinc-400">Surveyed profile CSV: chainage,offset,RL<textarea value={profileCsv} onChange={event => setProfileCsv(event.target.value)} rows={8} placeholder={'chainage,offset,RL\n0,-5,100.2\n0,0,100.0\n0,5,100.3\n10,-5,100.1\n10,0,99.9\n10,5,100.2'} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-600" /></label>
      {calculation.issues.length > 0 && <div role="status" className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200"><ul className="list-inside list-disc space-y-1">{calculation.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      {calculation.volume && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
          ['Total length', `${calculation.volume.totalLength.toFixed(3)} m`], ['Cut', `${calculation.volume.totalCutVolumeM3.toFixed(3)} m³`],
          ['Fill', `${calculation.volume.totalFillVolumeM3.toFixed(3)} m³`], ['Net cut − fill', `${calculation.volume.netVolumeM3.toFixed(3)} m³`],
        ].map(([label, value]) => <div key={label} className="rounded border border-zinc-800 bg-zinc-950/50 p-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div>
        <div className="overflow-x-auto rounded border border-zinc-800"><table className="w-full min-w-[600px] text-sm"><thead className="bg-zinc-800 text-zinc-300"><tr><th className="px-3 py-2 text-right">Chainage</th><th className="px-3 py-2 text-right">Cut area (m²)</th><th className="px-3 py-2 text-right">Fill area (m²)</th><th className="px-3 py-2 text-right">Segment</th><th className="px-3 py-2 text-right">Cut volume (m³)</th><th className="px-3 py-2 text-right">Fill volume (m³)</th><th className="px-3 py-2 text-left">Method</th></tr></thead><tbody>{calculation.areas.map((area, index) => {
          const segments = calculation.volume?.sections.filter(segment => segment.fromChainage === area.chainage) ?? []
          return <tr key={`${area.chainage}-${index}`} className="border-t border-zinc-800"><td className="px-3 py-2 text-right">{area.chainage.toFixed(3)}</td><td className="px-3 py-2 text-right">{area.cutArea.toFixed(3)}</td><td className="px-3 py-2 text-right">{area.fillArea.toFixed(3)}</td><td className="px-3 py-2 text-right">{segments.map(segment => `${segment.fromChainage.toFixed(2)}–${segment.toChainage.toFixed(2)}`).join('; ') || '—'}</td><td className="px-3 py-2 text-right">{segments.map(segment => segment.cutVolumeM3.toFixed(3)).join('; ') || '—'}</td><td className="px-3 py-2 text-right">{segments.map(segment => segment.fillVolumeM3.toFixed(3)).join('; ') || '—'}</td><td className="px-3 py-2">{segments.map(segment => segment.method).join('; ') || '—'}</td></tr>
        })}</tbody></table></div>
        <button type="button" onClick={() => { const volume = calculation.volume; if (!volume) return; downloadRowsCsv('metardu-cross-section-volumes.csv', ['From_chainage_m', 'To_chainage_m', 'Distance_m', 'Area_from_signed_m2', 'Area_to_signed_m2', 'Cut_m3', 'Fill_m3', 'Net_cut_minus_fill_m3', 'Method'], volume.sections.map(segment => [segment.fromChainage, segment.toChainage, segment.distance, segment.endAreaFrom, segment.endAreaTo, segment.cutVolumeM3, segment.fillVolumeM3, segment.netVolumeM3, segment.method])) }} className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">Download volume CSV</button>
        <p className="text-xs text-zinc-500">Review section ordering, survey coverage, formation RL, interpolation method and project specification before using volumes for payment or construction.</p>
      </>}
    </div>
  )
}
