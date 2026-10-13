'use client'
import type { EncumbranceParcel, EncumbranceResult } from '@/lib/cadastral/encumbranceAnalysis'

export function EncumbranceCoverageDrawing({ result, parcel }: { result: EncumbranceResult; parcel: EncumbranceParcel }) {
  const minE = Math.min(...parcel.boundary.map(p => p.easting)), maxE = Math.max(...parcel.boundary.map(p => p.easting))
  const minN = Math.min(...parcel.boundary.map(p => p.northing)), maxN = Math.max(...parcel.boundary.map(p => p.northing))
  const scale = Math.min(620 / (maxE - minE), 250 / (maxN - minN))
  const x = (easting: number) => 50 + (620 - (maxE - minE) * scale) / 2 + (easting - minE) * scale
  const y = (northing: number) => 25 + (250 - (maxN - minN) * scale) / 2 + (maxN - northing) * scale
  const path = (rings: number[][][]) => rings.map(ring => ring.map((p, i) => `${i ? 'L' : 'M'} ${x(p[0])} ${y(p[1])}`).join(' ') + ' Z').join(' ')
  const coverage = result.unionGeometry?.type === 'Polygon' ? [result.unionGeometry.coordinates] : result.unionGeometry?.coordinates ?? []
  return <div className="space-y-2">
    <svg viewBox="0 0 720 330" role="img" aria-label="Parcel and assessed encumbrance coverage" className="w-full rounded bg-white">
      <path d={path([parcel.boundary, ...(parcel.holes ?? [])].map(ring => ring.map(p => [p.easting, p.northing])))} fill="#f8fafc" fillRule="evenodd" stroke="#1e293b" strokeWidth="1.5" />
      {coverage.map((polygon, i) => <path key={i} d={path(polygon)} fill="#d97706" fillOpacity="0.3" fillRule="evenodd" stroke="#92400e" strokeWidth="1" />)}
      {parcel.boundary.map((p, i) => <g key={i}><circle cx={x(p.easting)} cy={y(p.northing)} r="2" fill="#1e293b" /><title>{`Supplied parcel E ${p.easting} m, N ${p.northing} m`}</title></g>)}
      <text x="360" y="315" textAnchor="middle" fontSize="11" fill="#334155">Easting / northing in metres · grid north up · equal axis scale</text>
    </svg>
    <p className="text-xs text-zinc-400">Dark: supplied parcel boundary. Amber: union of assessed footprints inside the parcel, with holes excluded. Unmapped records remain in the schedule. This preview does not verify source boundaries or title status.</p>
  </div>
}
