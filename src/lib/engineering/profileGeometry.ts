import { shoelaceArea } from '@/lib/engine/area'

export interface ProfilePoint { offset: number; level: number }

export function validateProfile(points: ProfilePoint[]): ProfilePoint[] {
  if (points.length < 2 || points.length > 10000 || points.some(p => !Number.isFinite(p.offset) || !Number.isFinite(p.level))) {
    throw new RangeError('A measured profile requires 2–10,000 finite offset/level observations.')
  }
  const sorted = [...points].sort((a, b) => a.offset - b.offset)
  if (sorted.some((p, i) => i > 0 && p.offset === sorted[i - 1].offset)) throw new RangeError('Duplicate profile offsets require survey review.')
  return sorted
}

/** Bounded linear interpolation; no invented ground outside the observations. */
export function interpolateProfile(points: ProfilePoint[], offset: number): number | null {
  if (points.length < 2 || !Number.isFinite(offset) || offset < points[0].offset || offset > points[points.length - 1].offset) return null
  let low = 1, high = points.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (points[middle].offset < offset) low = middle + 1
    else high = middle
  }
  const a = points[low - 1], b = points[low]
  return a.level + (offset - a.offset) / (b.offset - a.offset) * (b.level - a.level)
}

/** Exact cut/fill separation between piecewise-linear observed and design profiles. */
export function integrateProfileAreas(ground: ProfilePoint[], formation: ProfilePoint[]) {
  const g = validateProfile(ground), f = validateProfile(formation)
  const min = f[0].offset, max = f[f.length - 1].offset
  if (g[0].offset > min || g[g.length - 1].offset < max) throw new RangeError('Extend measured ground to cover the complete design profile; extrapolation is not used.')
  const offsets = [...new Set([...g, ...f].map(p => p.offset).filter(x => x >= min && x <= max))].sort((a, b) => a - b)
  const cutPolygons: ProfilePoint[][] = [], fillPolygons: ProfilePoint[][] = []
  let cutArea = 0, fillArea = 0, signedIntegral = 0
  const valueAt = (profile: ProfilePoint[], x: number) => {
    const value = interpolateProfile(profile, x)
    if (value === null) throw new RangeError('Profile interpolation is outside the measured extent.')
    return value
  }
  function add(x1: number, x2: number) {
    const g1 = valueAt(g, x1), g2 = valueAt(g, x2), f1 = valueAt(f, x1), f2 = valueAt(f, x2)
    const difference = ((g1 - f1) + (g2 - f2)) * (x2 - x1) / 2
    if (difference === 0) return
    const polygon = [{ offset: x1, level: g1 }, { offset: x2, level: g2 }, { offset: x2, level: f2 }, { offset: x1, level: f1 }]
    if (difference > 0) { cutArea += difference; cutPolygons.push(polygon) }
    else { fillArea -= difference; fillPolygons.push(polygon) }
  }
  for (let i = 1; i < offsets.length; i++) {
    const a = offsets[i - 1], b = offsets[i]
    const d1 = valueAt(g, a) - valueAt(f, a), d2 = valueAt(g, b) - valueAt(f, b)
    signedIntegral += (d1 + d2) * (b - a) / 2
    if (d1 * d2 < 0) {
      const x = a + (b - a) * Math.abs(d1) / (Math.abs(d1) + Math.abs(d2))
      add(a, x); add(x, b)
    } else add(a, b)
  }
  const polygonArea = [...cutPolygons, ...fillPolygons].reduce((sum, polygon) => sum + shoelaceArea(polygon.map(p => ({ easting: p.offset, northing: p.level }))), 0)
  if (![cutArea, fillArea, signedIntegral, polygonArea].every(Number.isFinite)) throw new RangeError('Profile quantities exceed the finite calculation range.')
  const difference = polygonArea - cutArea - fillArea
  return { cutArea, fillArea, netArea: cutArea - fillArea, cutPolygons, fillPolygons,
    arithmeticCheck: { passed: Math.abs(difference) <= Math.max(1, polygonArea) * 1e-9, diff: difference } }
}
