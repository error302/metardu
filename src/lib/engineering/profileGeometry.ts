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
    if (difference === 0) {
      if (g1 !== f1 || g2 !== f2) throw new RangeError('The profile area is below reliable numeric resolution; a zero quantity was not inferred.')
      return
    }
    const polygon = [{ offset: x1, level: g1 }, { offset: x2, level: g2 }, { offset: x2, level: f2 }, { offset: x1, level: f1 }]
    if (difference > 0) { cutArea += difference; cutPolygons.push(polygon) }
    else { fillArea -= difference; fillPolygons.push(polygon) }
  }
  for (let i = 1; i < offsets.length; i++) {
    const a = offsets[i - 1], b = offsets[i]
    const d1 = valueAt(g, a) - valueAt(f, a), d2 = valueAt(g, b) - valueAt(f, b)
    signedIntegral += (d1 + d2) * (b - a) / 2
    if (d1 > 0 && d2 < 0 || d1 < 0 && d2 > 0) {
      // Compare signs without multiplying: tiny opposite depths can underflow.
      // Scale the ratio before multiplying by width; the depth sum can overflow.
      const first = Math.abs(d1), second = Math.abs(d2)
      const ratio = first >= second ? 1 / (1 + second / first) : (first / second) / (1 + first / second)
      const x = a + (b - a) * ratio
      if (!Number.isFinite(x) || x <= a || x >= b) throw new RangeError('The profile crossing is below reliable offset resolution. Review the original measurements.')
      add(a, x); add(x, b)
    } else add(a, b)
  }
  const polygonArea = [...cutPolygons, ...fillPolygons].reduce((sum, polygon) => sum + shoelaceArea(polygon.map(p => ({ easting: p.offset, northing: p.level }))), 0)
  if (![cutArea, fillArea, signedIntegral, polygonArea].every(Number.isFinite)) throw new RangeError('Profile quantities exceed the finite calculation range.')
  const difference = polygonArea - cutArea - fillArea
  return { cutArea, fillArea, netArea: cutArea - fillArea, cutPolygons, fillPolygons,
    arithmeticCheck: { passed: Math.abs(difference) <= Math.max(1, polygonArea) * 1e-9, diff: difference } }
}

/**
 * Exact transverse moments and local volume rates for piecewise-linear profiles.
 * Offsets are positive right; signed curvature is positive for a right turn.
 * For X(s,t)=P(s)+t Nright(s), the local plan Jacobian is 1-curvature*t.
 * These rates are m³ per metre of grid centreline, not whole-road volumes.
 * Local positivity does not establish global corridor injectivity or coverage.
 */
export function integrateProfileSweep(ground: ProfilePoint[], formation: ProfilePoint[], curvaturePerM: number) {
  if (!Number.isFinite(curvaturePerM)) throw new RangeError('Supply finite signed grid curvature.')
  const f = validateProfile(formation)
  const jacobians = [f[0].offset, f[f.length - 1].offset].map(offset => 1 - curvaturePerM * offset)
  const minimumJacobian = Math.min(...jacobians)
  const guard = 64 * Number.EPSILON * Math.max(1, ...[f[0].offset, f[f.length - 1].offset].map(offset => Math.abs(curvaturePerM * offset)))
  if (!Number.isFinite(minimumJacobian) || minimumJacobian <= guard) throw new RangeError('The formation offset map folds or is numerically singular at this curvature. No local volume rate was inferred.')
  const areas = integrateProfileAreas(ground, f)
  if (!areas.arithmeticCheck.passed) throw new RangeError('The profile area arithmetic check failed; no volume rate was inferred.')
  function accumulate(polygons: ProfilePoint[][]) {
    let moment = 0, rate = 0, momentCorrection = 0, rateCorrection = 0
    for (const p of polygons) {
      const x0 = p[0].offset, x1 = p[1].offset, width = x1 - x0
      const h0 = Math.abs(p[0].level - p[3].level), h1 = Math.abs(p[1].level - p[2].level)
      const j0 = 1 - curvaturePerM * x0, j1 = 1 - curvaturePerM * x1
      // Bernstein products integrate exactly and keep all rate terms positive.
      // Avoid A-k*M cancellation close to the inner offset radius.
      const a0 = (width * h0) / 2, a1 = (width * h1) / 2
      if (h0 > 0 && a0 === 0 || h1 > 0 && a1 === 0) throw new RangeError('A profile contribution is below reliable numeric resolution.')
      const nextMoment = a0 * (x0 + width / 3) + a1 * (x1 - width / 3)
      const nextRate = a0 * (j0 * (2 / 3) + j1 / 3) + a1 * (j0 / 3 + j1 * (2 / 3))
      const m = nextMoment - momentCorrection, mNext = moment + m
      momentCorrection = (mNext - moment) - m; moment = mNext
      const r = nextRate - rateCorrection, rNext = rate + r
      rateCorrection = (rNext - rate) - r; rate = rNext
    }
    if (![moment, rate].every(Number.isFinite) || rate < 0) throw new RangeError('Profile moments or local volume rates exceed the finite calculation range.')
    return { moment: moment === 0 ? 0 : moment, rate: rate === 0 ? 0 : rate }
  }
  const cut = accumulate(areas.cutPolygons), fill = accumulate(areas.fillPolygons)
  return { ...areas, cutMomentM3: cut.moment, fillMomentM3: fill.moment, cutRateM2: cut.rate, fillRateM2: fill.rate, minimumJacobian }
}
