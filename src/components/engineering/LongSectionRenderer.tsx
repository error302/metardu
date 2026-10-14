'use client'
import { useState } from 'react'
import type { RoadDesignData } from '@/types/engineering'
import { buildRoadLongSection } from '@/lib/engineering/roadLongSection'

export default function LongSectionRenderer({ data, projectName, heightReference }: { data: RoadDesignData | null; projectName: string; heightReference: string | null }) {
  const [page, setPage] = useState(0)
  const computed = buildRoadLongSection(data)
  const manual = computed.rows.filter(row => row.source === 'manual' && row.target != null)
  const points = [...computed.ground.map(p => ({ ch: p.chainage, level: p.groundLevel })), ...computed.design.map(p => ({ ch: p.chainage, level: p.elevation })), ...manual.map(p => ({ ch: p.chainage, level: p.target as number }))]
  const bounds = points.reduce((b, p) => ({ minCh: Math.min(b.minCh,p.ch), maxCh: Math.max(b.maxCh,p.ch), minRl: Math.min(b.minRl,p.level), maxRl: Math.max(b.maxRl,p.level) }), { minCh: Infinity, maxCh: -Infinity, minRl: Infinity, maxRl: -Infinity })
  const chPadding = points.length ? Math.max(0.5, (bounds.maxCh - bounds.minCh) * 0.02) : 0.5
  const rlPadding = points.length ? Math.max(0.1, (bounds.maxRl - bounds.minRl) * 0.05) : 0.5
  const minCh = points.length ? bounds.minCh - chPadding : 0, maxCh = points.length ? bounds.maxCh + chPadding : 1
  const minRl = points.length ? bounds.minRl - rlPadding : 0, maxRl = points.length ? bounds.maxRl + rlPadding : 1
  const x = (ch: number) => 65 + (ch - minCh) / (maxCh - minCh) * 800
  const y = (rl: number) => 35 + (maxRl - rl) / (maxRl - minRl) * 270
  const path = (values: Array<{ ch: number; level: number }>) => values.map(p => `${x(p.ch)},${y(p.level)}`).join(' ')
  const pages = Math.max(1, Math.ceil(computed.rows.length / 100)), active = Math.min(page, pages - 1)
  const value = (number: number | null) => number == null ? 'Unknown' : number.toFixed(3)
  return <section className="space-y-4">
    <h3 className="text-lg font-semibold">Long Section · {projectName}</h3>
    <p className="text-sm text-zinc-400">Declared height reference: {heightReference || 'Not declared'}. Brown: observed ground. Dark: evaluated vertical alignment. Blue points: manual targets, without an inferred connecting design.</p>
    {computed.issues.map(issue => <p role="status" key={issue} className="text-sm text-amber-300">{issue}</p>)}
    {!!points.length && <svg role="img" aria-label="Measured ground and evaluated road vertical profile" viewBox="0 0 930 360" className="w-full rounded bg-white">
      <line x1="65" y1="305" x2="865" y2="305" stroke="#94a3b8" /><line x1="65" y1="35" x2="65" y2="305" stroke="#94a3b8" />
      <polyline points={path(computed.ground.map(p => ({ ch: p.chainage, level: p.groundLevel })))} fill="none" stroke="#92400e" strokeWidth="1.6" />
      <polyline points={path(computed.design.map(p => ({ ch: p.chainage, level: p.elevation })))} fill="none" stroke="#1e293b" strokeWidth="2" />
      {manual.map(p => <g key={p.chainage}><circle cx={x(p.chainage)} cy={y(p.target as number)} r="3" fill="#2563eb" /><title>{`Manual target ch ${p.chainage} m, RL ${p.target} m`}</title></g>)}
      {[0, 1, 2, 3, 4].map(i => <g key={i}><text x={65 + i * 200} y="325" textAnchor="middle" fontSize="10" fill="#334155">{(minCh + (maxCh - minCh) * i / 4).toFixed(2)}</text><text x="58" y={35 + i * 67.5} textAnchor="end" fontSize="10" fill="#334155">{(maxRl - (maxRl - minRl) * i / 4).toFixed(3)}</text></g>)}
      <text x="465" y="347" textAnchor="middle" fontSize="11" fill="#334155">Chainage (m) · RL (m) · independently scaled axes; screen preview, not a printed-scale drawing</text>
    </svg>}
    {!!computed.curves.length && <div className="overflow-x-auto"><table aria-label="Evaluated vertical curve schedule" className="w-full text-right text-sm"><thead><tr>{['VIP', 'Type', 'g1 %', 'g2 %', 'Length m', 'K m/%', 'PVC ch m', 'PVC RL m', 'PVT ch m', 'PVT RL m'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{computed.curves.map(c => <tr key={c.vipId}><td className="p-2">{c.vipId}</td><td>{c.type}</td>{[c.gradeIn,c.gradeOut,c.length,c.k,c.pvcChainage,c.pvcLevel,c.pvtChainage,c.pvtLevel].map((v,i) => <td key={i} className="p-2">{v.toFixed(3)}</td>)}</tr>)}</tbody></table></div>}
    {!!computed.rows.length && <><div className="overflow-x-auto"><table aria-label="Observed and target station levels" className="w-full text-right text-sm"><thead><tr>{['Chainage m', 'Ground RL m', 'Surface target RL m', 'Formation RL m', 'Ground minus formation m', 'Target source'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{computed.rows.slice(active * 100, (active + 1) * 100).map(row => <tr key={row.chainage}>{[row.chainage, row.ground, row.target, row.formation, row.difference].map((v,i) => <td key={i} className="p-2">{value(v)}</td>)}<td>{row.source}</td></tr>)}</tbody></table></div><div className="flex items-center gap-4"><button type="button" disabled={!active} onClick={() => setPage(active - 1)} className="min-h-11 px-3">Previous</button><span>Page {active + 1} of {pages}</span><button type="button" disabled={active >= pages - 1} onClick={() => setPage(active + 1)} className="min-h-11 px-3">Next</button></div></>}
    <p className="text-xs text-zinc-400">Design curves are symmetrically parabolic and use supplied length/K. The curve does not pass through its tangent intersection RL. Curve samples draw the design only and are not ground observations. Centreline height differences are not earthworks volumes; sight distance, control, specification and construction acceptance remain unassessed.</p>
  </section>
}
