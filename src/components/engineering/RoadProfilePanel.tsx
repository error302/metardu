'use client'
import { useState } from 'react'
import type { RoadDesignData } from '@/types/engineering'
import { calculateRoadSection } from '@/lib/engineering/roadProjectOutputs'
import { resolveRoadDesignStations } from '@/lib/engineering/roadVerticalAlignment'

export function RoadProfilePanel({ data }: { data: RoadDesignData | null }) {
  const [index, setIndex] = useState(0)
  const resolved = resolveRoadDesignStations(data)
  const stations = resolved.stations
  const station = stations[index] ?? stations[0]
  let section: ReturnType<typeof calculateRoadSection> | null = null
  let issue = ''
  try {
    if (resolved.issues.length) throw new RangeError(resolved.issues.join(' '))
    if (!station || !data?.crossSectionTemplate) throw new RangeError('Save measured station profiles and a complete template to draw a cross-section.')
    section = calculateRoadSection(station, data.crossSectionTemplate)
  } catch (error) { issue = error instanceof Error ? error.message : 'Review the measured profile and design inputs.' }
  const vertices = section ? [...section.ground, ...section.formation] : []
  const minX = Math.min(...vertices.map(p => p.offset)), maxX = Math.max(...vertices.map(p => p.offset))
  const minY = Math.min(...vertices.map(p => p.level)), maxY = Math.max(...vertices.map(p => p.level))
  const scale = vertices.length ? Math.min(610 / (maxX - minX), 250 / Math.max(maxY - minY, 0.01)) : 1
  const x = (offset: number) => 50 + (610 - (maxX - minX) * scale) / 2 + (offset - minX) * scale
  const y = (level: number) => 30 + (250 - (maxY - minY) * scale) / 2 + (maxY - level) * scale
  const path = (points: Array<{ offset: number; level: number }>) => points.map(p => `${x(p.offset)},${y(p.level)}`).join(' ')
  return <div className="space-y-4">
    <h3 className="text-lg font-semibold">Measured Road Cross Sections</h3>
    {!!stations.length && <label className="block text-sm">Station chainage (m)<select aria-label="Cross-section station" value={Math.min(index, stations.length - 1)} onChange={event => setIndex(Number(event.target.value))} className="ml-3 min-h-11 rounded border border-zinc-700 bg-zinc-900 p-2">{stations.map((s, i) => <option key={`${s.chainage}-${i}`} value={i}>{s.chainage.toFixed(3)}</option>)}</select></label>}
    {issue && <p role="status" className="text-sm text-amber-300">{issue}</p>}
    {section && <>
      <svg role="img" aria-label="Measured road cross-section with ground, formation and daylight" viewBox="0 0 720 330" className="w-full rounded bg-white">
        <rect x="1" y="1" width="718" height="328" fill="white" stroke="#94a3b8" />
        {section.cutPolygons.map((p, i) => <polygon key={`cut-${i}`} points={path(p)} fill="#b45309" fillOpacity="0.22" />)}
        {section.fillPolygons.map((p, i) => <polygon key={`fill-${i}`} points={path(p)} fill="#2563eb" fillOpacity="0.18" />)}
        <polyline points={path(section.ground)} fill="none" stroke="#92400e" strokeWidth="1.7" />
        <polyline points={path(section.formation)} fill="none" stroke="#1e293b" strokeWidth="2" />
        {section.ground.map(p => <g key={p.offset}><circle cx={x(p.offset)} cy={y(p.level)} r="2" fill="#92400e" /><title>{`Observed offset ${p.offset}m, RL ${p.level}m`}</title></g>)}
        {[section.leftCatch, section.rightCatch].map(p => <g key={p.offset}><circle cx={x(p.offset)} cy={y(p.level)} r="3" fill="#1e293b" /><title>{`Daylight offset ${p.offset}m, RL ${p.level}m`}</title></g>)}
        <text x="360" y="315" textAnchor="middle" fontSize="11" fill="#334155">Offset (m) · ground RL (m) · equal horizontal/vertical scale</text>
      </svg>
      <p className="text-sm">Cut {section.cutArea.toFixed(3)} m² · Fill {section.fillArea.toFixed(3)} m² · Formation centre RL {section.formationLevel.toFixed(3)} m</p>
      <p className="text-xs text-zinc-400">Brown: observed ground. Dark line: supplied crowned formation and side slopes. Brown shading: cut. Blue shading: fill. Ground is interpolated between observations, with no extrapolated daylight. This is a draft section, not an issued construction plan.</p>
    </>}
  </div>
}
