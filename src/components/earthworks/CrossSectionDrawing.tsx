'use client'
import type { CrossSectionComputed, RoadTemplate } from '@/lib/computations/earthworksEngine'

export default function CrossSectionDrawing({ section }: { section: CrossSectionComputed; template: RoadTemplate }) {
  const vertices = [...section.groundPolygon, ...section.formationProfile]
  const minX = Math.min(...vertices.map(p => p.x)), maxX = Math.max(...vertices.map(p => p.x))
  const minY = Math.min(...vertices.map(p => p.y)), maxY = Math.max(...vertices.map(p => p.y))
  const scale = Math.min(600 / (maxX - minX), 240 / Math.max(maxY - minY, 0.01))
  const x = (value: number) => 50 + (600 - (maxX - minX) * scale) / 2 + (value - minX) * scale
  const y = (value: number) => 25 + (240 - (maxY - minY) * scale) / 2 + (maxY - value) * scale
  const path = (points: Array<{ x: number; y: number }>) => points.map(p => `${x(p.x)},${y(p.y)}`).join(' ')
  return <section className="space-y-2">
    <h3 className="text-sm font-semibold">Chainage {section.chainage.toFixed(3)} m · {section.mode}</h3>
    <svg viewBox="0 0 700 310" role="img" aria-label="Observed earthworks cross-section and approved formation" className="w-full bg-white rounded">
      {section.cutPolygons.map((polygon, i) => <polygon key={`cut-${i}`} points={path(polygon)} fill="#b45309" fillOpacity="0.22" />)}
      {section.fillPolygons.map((polygon, i) => <polygon key={`fill-${i}`} points={path(polygon)} fill="#2563eb" fillOpacity="0.18" />)}
      <polyline points={path(section.groundPolygon)} fill="none" stroke="#92400e" strokeWidth="1.7" />
      <polyline points={path(section.formationProfile)} fill="none" stroke="#1e293b" strokeWidth="2" />
      {section.groundPolygon.map(p => <g key={p.x}><circle cx={x(p.x)} cy={y(p.y)} r="2" fill="#92400e" /><title>{`Observed offset ${p.x} m, RL ${p.y} m`}</title></g>)}
      {[section.leftCatchPoint, section.rightCatchPoint].map(p => <g key={p.offset}><circle cx={x(p.offset)} cy={y(p.rl)} r="3" fill="#1e293b" /><title>{`Daylight offset ${p.offset} m, RL ${p.rl} m`}</title></g>)}
      <text x="350" y="295" textAnchor="middle" fontSize="11" fill="#334155">Offset and RL in metres · equal horizontal/vertical scale</text>
    </svg>
    <p className="text-xs">Brown: measured ground / cut shading. Dark: formation. Blue: fill. Cut {section.cutArea.toFixed(3)} m² · Fill {section.fillArea.toFixed(3)} m² · Centre formation RL {section.formationRL.toFixed(3)} m.</p>
    <p className="text-xs text-[var(--text-muted)]">Polygon area check: {section.arithmeticCheck.passed ? 'passed' : 'failed'}. Draft section; design and field acceptance remain required.</p>
  </section>
}
