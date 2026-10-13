// Standalone adapter: survey geometry remains in the shared engineering engine.
import Papa from 'papaparse'
import { calculateRoadSection } from '@/lib/engineering/roadProjectOutputs'
import { endAreaVolume } from '@/lib/engine/engineering'

export interface GroundShot { offset: number; rl: number }
export interface CrossSectionInput {
  chainage: number; centrelineRL: number; formationRL: number
  leftShots: GroundShot[]; rightShots: GroundShot[]
}
export interface CatchPoint { offset: number; rl: number; type: 'cut' | 'fill'; sideWidth: number }
export interface RoadTemplate {
  carriagewayWidth: number; shoulderWidth: number; camber: number
  cutSlopeH: number; fillSlopeH: number; shoulderCrossfall?: number
}
type DrawingPoint = { x: number; y: number }
export interface CrossSectionComputed {
  chainage: number; centrelineRL: number; formationRL: number; centreHeight: number
  mode: 'cut' | 'fill' | 'transition'
  leftCatchPoint: CatchPoint; rightCatchPoint: CatchPoint
  cutArea: number; fillArea: number; totalArea: number
  arithmeticCheck: { passed: boolean; diff: number }
  cutPolygons: DrawingPoint[][]; fillPolygons: DrawingPoint[][]
  groundPolygon: DrawingPoint[]; formationProfile: DrawingPoint[]
  steps: Array<{ description: string; formula: string; value: string }>
}
export function getHalfFormationWidth(template: RoadTemplate): number {
  return template.carriagewayWidth / 2 + template.shoulderWidth
}

export function computeCrossSection(input: CrossSectionInput, template: RoadTemplate): CrossSectionComputed {
  if (input.leftShots.some(p => p.offset >= 0) || input.rightShots.some(p => p.offset <= 0)) throw new RangeError('Left offsets must be negative and right offsets positive.')
  const section = calculateRoadSection({ chainage: input.chainage, groundLevel: input.centrelineRL,
    designLevel: input.formationRL, groundProfile: [...input.leftShots, { offset: 0, rl: input.centrelineRL }, ...input.rightShots]
      .map(p => ({ offset: p.offset, level: p.rl })) },
  { ...template, cutSlope: `${template.cutSlopeH}:1`, fillSlope: `${template.fillSlopeH}:1`, subgradeDepth: 0 })
  const drawing = (p: { offset: number; level: number }): DrawingPoint => ({ x: p.offset, y: p.level })
  const catchPoint = (p: typeof section.leftCatch): CatchPoint => ({ offset: p.offset, rl: p.level, type: p.type, sideWidth: Math.abs(p.offset) })
  const centreHeight = input.centrelineRL - input.formationRL
  const mode = section.cutArea > 0 && section.fillArea > 0 ? 'transition' : section.cutArea > 0 ? 'cut' : section.fillArea > 0 ? 'fill' : 'transition'
  return { chainage: input.chainage, centrelineRL: input.centrelineRL, formationRL: input.formationRL, centreHeight, mode,
    leftCatchPoint: catchPoint(section.leftCatch), rightCatchPoint: catchPoint(section.rightCatch),
    cutArea: section.cutArea, fillArea: section.fillArea, totalArea: section.cutArea + section.fillArea,
    arithmeticCheck: section.arithmeticCheck, cutPolygons: section.cutPolygons.map(p => p.map(drawing)),
    fillPolygons: section.fillPolygons.map(p => p.map(drawing)), groundPolygon: section.ground.map(drawing), formationProfile: section.formation.map(drawing),
    steps: [
      { description: 'Centre ground minus formation', formula: 'Ground RL − formation RL', value: `${centreHeight.toFixed(4)} m` },
      { description: 'Cut / fill areas', formula: 'Piecewise-linear integration split at each ground/formation crossing', value: `${section.cutArea.toFixed(3)} / ${section.fillArea.toFixed(3)} m²` },
      { description: 'Independent polygon area check', formula: 'Σ polygon areas − cut − fill', value: `${section.arithmeticCheck.passed ? 'PASS' : 'FAIL'} (difference ${section.arithmeticCheck.diff.toExponential(3)} m²)` },
    ] }
}

export interface VolumeLeg {
  fromChainage: number; toChainage: number; distance: number
  cutArea1: number; fillArea1: number; cutArea2: number; fillArea2: number
  cutVolEndArea: number; fillVolEndArea: number; cumCutEndArea: number; cumFillEndArea: number
}
export interface EarthworkResult {
  legs: VolumeLeg[]; totalCutEndArea: number; totalFillEndArea: number
  method: 'average-end-area'; shrinkageFactor: number | null; adjustedCut: number | null
  massOrdinates: Array<{ chainage: number; ordinate: number; cumCut: number; cumFill: number }>
}

/** Average end-area only: no fabricated middle section or hidden material factor. */
export function computeEarthwork(sections: CrossSectionComputed[], shrinkageFactor?: number): EarthworkResult {
  if (shrinkageFactor != null && (!Number.isFinite(shrinkageFactor) || shrinkageFactor <= 0)) throw new RangeError('The supplied material conversion factor must be finite and positive.')
  if (sections.some((s, i) => ![s.chainage, s.cutArea, s.fillArea].every(Number.isFinite) || s.cutArea < 0 || s.fillArea < 0 ||
    !s.arithmeticCheck.passed || i > 0 && s.chainage <= sections[i - 1].chainage)) throw new RangeError('Use checked non-negative areas and unique, strictly increasing finite chainages.')
  const legs: VolumeLeg[] = [], massOrdinates: EarthworkResult['massOrdinates'] = []
  let totalCutEndArea = 0, totalFillEndArea = 0
  if (sections.length) massOrdinates.push({ chainage: sections[0].chainage, ordinate: 0, cumCut: 0, cumFill: 0 })
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1], b = sections[i], distance = b.chainage - a.chainage
    const cutVolEndArea = endAreaVolume(a.cutArea, b.cutArea, distance), fillVolEndArea = endAreaVolume(a.fillArea, b.fillArea, distance)
    totalCutEndArea += cutVolEndArea; totalFillEndArea += fillVolEndArea
    const ordinate = totalCutEndArea * (shrinkageFactor ?? 1) - totalFillEndArea
    if (![totalCutEndArea, totalFillEndArea, ordinate].every(Number.isFinite)) throw new RangeError('Earthworks quantities exceed the finite calculation range.')
    legs.push({ fromChainage: a.chainage, toChainage: b.chainage, distance, cutArea1: a.cutArea, fillArea1: a.fillArea,
      cutArea2: b.cutArea, fillArea2: b.fillArea, cutVolEndArea, fillVolEndArea, cumCutEndArea: totalCutEndArea, cumFillEndArea: totalFillEndArea })
    massOrdinates.push({ chainage: b.chainage, ordinate, cumCut: totalCutEndArea, cumFill: totalFillEndArea })
  }
  return { legs, totalCutEndArea, totalFillEndArea, method: 'average-end-area', shrinkageFactor: shrinkageFactor ?? null,
    adjustedCut: shrinkageFactor == null ? null : totalCutEndArea * shrinkageFactor, massOrdinates }
}

export function parseEarthworkNumber(value: string, description: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) || !Number.isFinite(Number(value))) throw new RangeError(`${description}: supply a complete finite decimal measurement.`)
  return Number(value)
}

/** Existing wide CSV format; paired observations are atomic and zero RL stays valid. */
export function parseEarthworkCSV(csv: string): CrossSectionInput[] {
  if (csv.length > 10 * 1024 * 1024) throw new RangeError('Use a CSV smaller than 10 MiB.')
  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: 'greedy' })
  if (parsed.errors.length) throw new RangeError('Malformed earthworks CSV.')
  const rows = parsed.data.filter((row, i) => !(i === 0 && /^chainage/i.test(row[0].trim())))
  if (!rows.length) throw new RangeError('The CSV contains no measured sections.')
  if (rows.length > 20000) throw new RangeError('Import at most 20,000 measured sections per CSV.')
  const sections = rows.map((cols, i) => {
    if (cols.length < 4 || cols.length > 20) throw new RangeError(`CSV row ${i + 1}: use four required values and up to eight offset/RL pairs.`)
    const value = (index: number) => parseEarthworkNumber(cols[index] ?? '', `CSV row ${i + 1}, column ${index + 1}`)
    const km = value(0), metres = value(1)
    if (!Number.isInteger(km) || km < 0 || metres < 0 || metres >= 1000 || !Number.isFinite(km * 1000 + metres)) throw new RangeError('Chainage uses finite whole non-negative kilometres and metres from 0 to below 1000.')
    const shots = (start: number, direction: number) => {
      const list: GroundShot[] = []
      for (let j = start; j < start + 8; j += 2) {
        const hasOffset = !!cols[j]?.trim(), hasLevel = !!cols[j + 1]?.trim()
        if (!hasOffset && !hasLevel) continue
        if (hasOffset !== hasLevel) throw new RangeError(`CSV row ${i + 1}: an offset and its RL must both be supplied.`)
        const offset = value(j)
        if (offset <= 0) throw new RangeError('Shot offsets in this wide format are positive distances on the named side.')
        list.push({ offset: direction * offset, rl: value(j + 1) })
      }
      if (new Set(list.map(p => p.offset)).size !== list.length) throw new RangeError('Duplicate profile offsets require survey review.')
      return list.sort((a, b) => a.offset - b.offset)
    }
    return { chainage: km * 1000 + metres, centrelineRL: value(2), formationRL: value(3), leftShots: shots(4, -1), rightShots: shots(12, 1) }
  })
  if (new Set(sections.map(s => s.chainage)).size !== sections.length) throw new RangeError('CSV section chainages must be unique.')
  return sections.sort((a, b) => a.chainage - b.chainage)
}
