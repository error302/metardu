'use client'
import type { EarthworkResult, CrossSectionComputed } from '@/lib/computations/earthworksEngine'

export default function EarthworkQuantitiesTable({ result, sections }: { result: EarthworkResult | null; sections: CrossSectionComputed[] }) {
  if (!result?.legs.length) return <p className="p-4 text-sm text-[var(--text-muted)]">At least two measured sections are needed for a volume schedule.</p>
  const cut = result.adjustedCut ?? result.totalCutEndArea
  return <section className="space-y-3">
    <h3 className="text-sm font-semibold">Earthwork Quantities · Average End Area</h3>
    <p className="text-xs text-[var(--text-muted)]">Actual station spacing; separate cut and fill. Prismoidal quantities require independently measured middle sections and are not inferred from end areas. {result.shrinkageFactor == null ? 'No material conversion factor supplied.' : `Supplied material factor: ${result.shrinkageFactor}.`}</p>
    <div className="overflow-x-auto"><table className="w-full text-xs font-mono">
      <thead><tr>{['From (m)', 'To (m)', 'Span (m)', 'Cut A1 (m²)', 'Fill A1 (m²)', 'Cut A2 (m²)', 'Fill A2 (m²)', 'Cut (m³)', 'Fill (m³)', 'Cum. Cut (m³)', 'Cum. Fill (m³)'].map(h => <th key={h} className="p-2 text-right border-b border-[var(--border-color)]">{h}</th>)}</tr></thead>
      <tbody>{result.legs.map(leg => <tr key={`${leg.fromChainage}-${leg.toChainage}`}>
        {[leg.fromChainage, leg.toChainage, leg.distance, leg.cutArea1, leg.fillArea1, leg.cutArea2, leg.fillArea2, leg.cutVolEndArea, leg.fillVolEndArea, leg.cumCutEndArea, leg.cumFillEndArea].map((value, i) => <td key={i} className="p-2 text-right border-b border-[var(--border-color)]">{value.toFixed(i < 3 ? 3 : 2)}</td>)}
      </tr>)}</tbody>
    </table></div>
    <p className="text-sm">{sections.length} sections · Cut {result.totalCutEndArea.toFixed(2)} m³ · Fill {result.totalFillEndArea.toFixed(2)} m³</p>
    <p className="text-sm">{result.adjustedCut == null ? 'Geometric balance' : 'Balance with supplied material factor'}: {(cut - result.totalFillEndArea).toFixed(2)} m³</p>
  </section>
}
