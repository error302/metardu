/** Draft earthworks schedule derived from checked measured cross-sections. */
import { buildPrintDocument, openPrint, type PrintMeta } from './buildPrintDocument'
import type { CrossSectionComputed, EarthworkResult, RoadTemplate } from '@/lib/computations/earthworksEngine'
import { computeCrossSection, computeEarthwork } from '@/lib/computations/earthworksEngine'

export interface EarthworksBoQInput {
  sections: CrossSectionComputed[]; result: EarthworkResult; template: RoadTemplate
  roadName: string; startChainage: string; endChainage: string; meta: PrintMeta
  horizontalCrs?: string; verticalDatum?: string; designRevision?: string
  cutRate?: number; fillRate?: number; compactionRate?: number; haulRate?: number
  avgHaulDistance?: number; compactionFactor?: number
}
function esc(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
const number = (value: number, dp = 3) => value.toLocaleString('en-KE', { minimumFractionDigits: dp, maximumFractionDigits: dp })
const table = (headers: string[], rows: Array<Array<string | number>>) => `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(v => `<td>${esc(typeof v === 'number' ? number(v) : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`

export function generateEarthworksBoQ(input: EarthworksBoQInput): string {
  const { sections, result, template } = input
  if (!sections.length || !result.legs.length || sections.some(s => !s.arithmeticCheck.passed)) throw new RangeError('A draft quantity schedule requires at least two checked measured sections.')
  const freshSections = sections.map(section => computeCrossSection({ chainage: section.chainage, centrelineRL: section.centrelineRL,
    formationRL: section.formationRL, leftShots: section.groundPolygon.filter(p => p.x < 0).map(p => ({ offset: p.x, rl: p.y })),
    rightShots: section.groundPolygon.filter(p => p.x > 0).map(p => ({ offset: p.x, rl: p.y })) }, template))
  const fresh = computeEarthwork(freshSections, result.shrinkageFactor ?? undefined)
  if (JSON.stringify(fresh) !== JSON.stringify(result) || freshSections.some((section, i) => section.cutArea !== sections[i].cutArea || section.fillArea !== sections[i].fillArea)) throw new RangeError('The supplied quantity schedule is stale or inconsistent with the current observed ground and template; recompute before printing.')
  const balance = (result.adjustedCut ?? result.totalCutEndArea) - result.totalFillEndArea
  const sectionsTable = table(['Chainage (m)', 'Ground CL RL (m)', 'Formation RL (m)', 'Cut (m²)', 'Fill (m²)'], sections.map(s => [s.chainage, s.centrelineRL, s.formationRL, s.cutArea, s.fillArea]))
  const volumesTable = table(['From (m)', 'To (m)', 'Span (m)', 'Cut (m³)', 'Fill (m³)', 'Cumulative cut (m³)', 'Cumulative fill (m³)'], result.legs.map(l => [l.fromChainage, l.toChainage, l.distance, l.cutVolEndArea, l.fillVolEndArea, l.cumCutEndArea, l.cumFillEndArea]))
  const material = result.shrinkageFactor == null ? 'Not supplied. Balance is unadjusted geometric cut minus fill.' : `Supplied factor ${number(result.shrinkageFactor)} applied to cut. Adjusted cut: ${number(result.adjustedCut as number)} m³.`
  const rates = [input.cutRate, input.fillRate, input.compactionRate, input.haulRate, input.avgHaulDistance, input.compactionFactor]
  if (rates.some(v => v != null && (!Number.isFinite(v) || v < 0))) throw new RangeError('Rates and conversion inputs must be finite and non-negative.')
  const boqRows: Array<Array<string | number>> = []
  if (input.cutRate != null) boqRows.push(['Excavation (geometric cut)', result.totalCutEndArea, 'm³', input.cutRate, result.totalCutEndArea * input.cutRate])
  if (input.fillRate != null) boqRows.push(['Fill (geometric)', result.totalFillEndArea, 'm³', input.fillRate, result.totalFillEndArea * input.fillRate])
  if (input.compactionRate != null && input.compactionFactor != null) {
    const quantity = result.totalFillEndArea * input.compactionFactor
    boqRows.push(['Compaction with supplied factor', quantity, 'm³', input.compactionRate, quantity * input.compactionRate])
  }
  if (input.haulRate != null && input.avgHaulDistance != null && result.shrinkageFactor != null) {
    const quantity = Math.abs(balance) * input.avgHaulDistance / 1000
    boqRows.push(['Balance haul screening with supplied distance', quantity, 'm³·km', input.haulRate, quantity * input.haulRate])
  }
  if (boqRows.some(row => row.some(v => typeof v === 'number' && !Number.isFinite(v)))) throw new RangeError('Cost quantities exceed the finite calculation range.')
  const body = `<p><strong>DRAFT — NOT CERTIFIED</strong></p>
<h2>Road and design inputs</h2>
<p>${esc(input.roadName || 'Road description not supplied')} · Chainage ${esc(input.startChainage || sections[0].chainage)} to ${esc(input.endChainage || sections.at(-1)?.chainage)} m</p>
<p>Horizontal CRS: ${esc(input.horizontalCrs || 'Not supplied')}. Height reference: ${esc(input.verticalDatum || 'Not supplied')}.</p>
<p>Declared approved-design revision: ${esc(input.designRevision || 'Not supplied')}. These operator-entered references are not independently verified.</p>
<p>Carriageway ${number(template.carriagewayWidth)} m; each shoulder ${number(template.shoulderWidth)} m; camber ${number(template.camber)}%; shoulder crossfall ${template.shoulderWidth === 0 ? 'not applicable' : number(template.shoulderCrossfall as number) + '%'}; cut ${number(template.cutSlopeH)}H:1V; fill ${number(template.fillSlopeH)}H:1V.</p>
<h2>Measured cross-section areas</h2>${sectionsTable}
<h2>Average end-area volume schedule</h2>${volumesTable}
<p>Total cut ${number(result.totalCutEndArea)} m³; total fill ${number(result.totalFillEndArea)} m³.</p>
<p>Material conversion: ${esc(material)} Balance ${number(balance)} m³.</p>
${boqRows.length ? '<h2>Draft priced schedule — KES, before tax</h2>' + table(['Description', 'Quantity', 'Unit', 'Rate (KES)', 'Amount (KES)'], boqRows) : '<p>Unit rates not supplied; this is an unpriced quantity schedule.</p>'}
<h2>Mass ordinates</h2>${table(['Chainage (m)', 'Cumulative cut (m³)', 'Cumulative fill (m³)', 'Ordinate (m³)'], result.massOrdinates.map(m => [m.chainage, m.cumCut, m.cumFill, m.ordinate]))}
<h3>Method and review</h3><p>Ground is linearly interpolated only within measured offsets. The approved crowned formation and side slopes define observed daylight. Mixed cut and fill are integrated separately. Volumes use actual chainage spans and average end areas. No measured middle sections were supplied for prismoidal quantities. Curvature, material suitability, haul routing, tax and contractual acceptance are not assessed. Review the design revision, declared references, control, observations and field checks before issue.</p>`
  return buildPrintDocument(body, { ...input.meta, title: input.meta.title || 'Draft Earthworks Quantity Schedule', reference: 'Piecewise-linear profiles · Average end-area volumes · Operator-supplied design', reviewOnly: true })
}
export function printEarthworksBoQ(input: EarthworksBoQInput): void { openPrint(generateEarthworksBoQ(input)) }
