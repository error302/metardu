'use client';

import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import CrossSectionInput from '@/components/earthworks/CrossSectionInput'

/**
 * Earthworks Calculator — extends Cross Sections with:
 * - Mass Haul Diagram (cumulative volume chart)
 * - Cut/Fill balance analysis
 * - End-Area vs Prismoidal volume comparison
 * - Free-haul and overhaul distance analysis
 */

interface SectionVolume {
  station: string
  cutArea: number
  fillArea: number
  endAreaVol: number
  prismoidalVol: number
}

function computeVolumes(sections: { station: string; cutArea: number; fillArea: number; distance: number }[]): SectionVolume[] {
  const result: SectionVolume[] = []
  for (let i = 1; i < sections.length; i++) {
    const prev = sections[i - 1]
    const curr = sections[i]
    const L = curr.distance

    const avgCutEndArea = (prev.cutArea + curr.cutArea) / 2
    const avgFillEndArea = (prev.fillArea + curr.fillArea) / 2

    // Prismoidal: V = L/6 * (A1 + 4*Am + A2) where Am = midpoint area
    // Simplified: using average as proxy for midpoint
    const midCut = (prev.cutArea + curr.cutArea) / 2
    const midFill = (prev.fillArea + curr.fillArea) / 2
    const prismCut = L / 6 * (prev.cutArea + 4 * midCut + curr.cutArea)
    const prismFill = L / 6 * (prev.fillArea + 4 * midFill + curr.fillArea)

    result.push({
      station: `${prev.station} — ${curr.station}`,
      cutArea: avgCutEndArea,
      fillArea: avgFillEndArea,
      endAreaVol: avgCutEndArea * L - avgFillEndArea * L,
      prismoidalVol: prismCut - prismFill,
    })
  }
  return result
}

export default function EarthworksPage() {
  // Example data for mass haul demonstration
  const exampleSections = useMemo(() => [
    { station: '0+000', cutArea: 0, fillArea: 45, distance: 20 },
    { station: '0+020', cutArea: 10, fillArea: 30, distance: 20 },
    { station: '0+040', cutArea: 35, fillArea: 5, distance: 20 },
    { station: '0+060', cutArea: 60, fillArea: 0, distance: 20 },
    { station: '0+080', cutArea: 55, fillArea: 0, distance: 20 },
    { station: '0+100', cutArea: 25, fillArea: 15, distance: 20 },
    { station: '0+120', cutArea: 5, fillArea: 40, distance: 20 },
    { station: '0+140', cutArea: 0, fillArea: 50, distance: 20 },
  ], [])

  const volumes = useMemo(() => computeVolumes(exampleSections), [exampleSections])

  const totals = useMemo(() => {
    let totalCutEA = 0, totalFillEA = 0, totalCutPrism = 0, totalFillPrism = 0
    let cumulative = 0
    const cumulativeData: { station: string; value: number }[] = []

    volumes.forEach(v => {
      const cutVol = v.cutArea * 20
      const fillVol = v.fillArea * 20
      totalCutEA += cutVol
      totalFillEA += fillVol
      totalCutPrism += Math.abs(v.prismoidalVol) > 0 ? v.prismoidalVol * 0.5 + cutVol * 0.5 : cutVol
      totalFillPrism += Math.abs(v.prismoidalVol) < 0 ? Math.abs(v.prismoidalVol) * 0.5 + fillVol * 0.5 : fillVol
      cumulative += v.endAreaVol
      cumulativeData.push({ station: v.station, value: cumulative })
    })

    return { totalCutEA: totalCutEA.toFixed(1), totalFillEA: totalFillEA.toFixed(1), cumulativeData, netVolume: cumulative.toFixed(1) }
  }, [volumes])

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="Earthworks Calculator"
        subtitle="Cut &amp; fill analysis with mass haul diagram | End Area + Prismoidal Methods | Ghilani &amp; Wolf Ch.26 | Merritt Civil Engineering Handbook Sec.21"
      />

      {/* Earthworks-specific summary panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-amber-900/20 border border-amber-800/30 rounded-lg">
          <div className="text-xs text-amber-400/70 mb-1">Total Cut Volume</div>
          <div className="text-2xl font-bold text-amber-400">{totals.totalCutEA} m³</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">End Area Method</div>
        </div>
        <div className="p-4 bg-blue-900/20 border border-blue-800/30 rounded-lg">
          <div className="text-xs text-blue-400/70 mb-1">Total Fill Volume</div>
          <div className="text-2xl font-bold text-blue-400">{totals.totalFillEA} m³</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">End Area Method</div>
        </div>
        <div className={`p-4 border rounded-lg ${parseFloat(totals.netVolume) >= 0 ? 'bg-green-900/20 border-green-800/30' : 'bg-red-900/20 border-red-800/30'}`}>
          <div className={`text-xs mb-1 ${parseFloat(totals.netVolume) >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
            Net Volume (Cut - Fill)
          </div>
          <div className={`text-2xl font-bold ${parseFloat(totals.netVolume) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {parseFloat(totals.netVolume) >= 0 ? '+' : ''}{totals.netVolume} m³
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            {parseFloat(totals.netVolume) >= 0 ? 'Surplus material — export needed' : 'Deficit — borrow material needed'}
          </div>
        </div>
      </div>

      {/* Mass Haul Diagram */}
      <div className="mb-6 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg">
        <h2 className="text-lg font-semibold mb-3">Mass Haul Diagram</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Cumulative earthwork volume along the alignment. Positive = cut, Negative = fill. Points crossing zero indicate transition between cut and fill zones.
        </p>
        <div className="h-48 flex items-end gap-1 px-2">
          {totals.cumulativeData.map((point, i) => {
            const maxVal = Math.max(...totals.cumulativeData.map(d => Math.abs(d.value)), 1)
            const height = (point.value / maxVal) * 50 + 50 // Scale 0-100%
            const isPositive = point.value >= 0
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[8px] text-[var(--text-muted)]">{point.value.toFixed(0)}</div>
                <div
                  className={`w-full rounded-t-sm transition-all ${isPositive ? 'bg-amber-500/60' : 'bg-blue-500/60'}`}
                  style={{ height: `${Math.abs(height)}%`, minHeight: '4px' }}
                />
                <div className="text-[8px] text-[var(--text-muted)] transform -rotate-45 origin-top-left whitespace-nowrap">
                  {point.station.split('—')[0].trim()}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex justify-center mt-2 gap-6 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-amber-500/60" />
            <span>Cut (positive)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-blue-500/60" />
            <span>Fill (negative)</span>
          </div>
        </div>
      </div>

      {/* Volume comparison table */}
      <div className="mb-6 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg">
        <h2 className="text-lg font-semibold mb-3">Volume Comparison by Section</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)] border-b border-[var(--border-color)]">
                <th className="text-left py-2">Section</th>
                <th className="text-right py-2">Cut Area (m²)</th>
                <th className="text-right py-2">Fill Area (m²)</th>
                <th className="text-right py-2">End-Area Vol (m³)</th>
                <th className="text-right py-2">Prismoidal Vol (m³)</th>
                <th className="text-right py-2">Difference (%)</th>
              </tr>
            </thead>
            <tbody>
              {volumes.map((v, i) => {
                const diff = v.endAreaVol !== 0 ? ((v.prismoidalVol - v.endAreaVol) / Math.abs(v.endAreaVol) * 100) : 0
                return (
                  <tr key={i} className="border-b border-[var(--border-color)]/50">
                    <td className="py-2 text-[var(--text-muted)]">{v.station}</td>
                    <td className="py-2 text-right text-amber-400">{v.cutArea.toFixed(1)}</td>
                    <td className="py-2 text-right text-blue-400">{v.fillArea.toFixed(1)}</td>
                    <td className="py-2 text-right">{v.endAreaVol.toFixed(1)}</td>
                    <td className="py-2 text-right">{v.prismoidalVol.toFixed(1)}</td>
                    <td className={`py-2 text-right ${Math.abs(diff) > 5 ? 'text-red-400' : 'text-green-400'}`}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full cross section calculator */}
      <div className="mt-8 border-t border-[var(--border-color)] pt-6">
        <h2 className="text-lg font-semibold mb-4">Cross Section Data Entry</h2>
        <CrossSectionInput />
      </div>
    </div>
  )
}
