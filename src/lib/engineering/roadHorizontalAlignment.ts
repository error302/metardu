import { computeHorizontalCurve } from '@/lib/engine/engineering'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import { computeSpiralAlignment, type SpiralAlignmentResult } from '@/lib/survey/curves/spiralAlignment'
import type { IntersectionPoint } from '@/types/engineering'
const message = (error: unknown) => error instanceof Error ? error.message : 'Review the supplied alignment data.'
export interface ProjectRoadCurve {
  ipId: string; name: string; radius: number; turn: 'left' | 'right'; deflectionAngle: number;
  tangentLength: number; arcLength: number; chainageTC: number; chainageMC: number; chainageCT: number
  kind: 'circular' | 'spiral-circular-spiral'; transitionLength: number; totalLength: number
  chainageTS: number | null; chainageST: number | null; spiralAlignment: SpiralAlignmentResult | null
}

/** No inferred lengths or averaging of asymmetric transition designs. */
export function projectTransitionLength(ip: IntersectionPoint): number {
  const entry = ip.transitionLengthIn, exit = ip.transitionLengthOut
  if (!ip.hasTransition && entry == null && exit == null) return 0
  if (entry == null || exit == null || ![entry, exit].every(Number.isFinite) || entry < 0 || exit < 0) throw new RangeError(`${ip.name}: supply finite non-negative entry and exit spiral lengths.`)
  if (entry !== exit) throw new RangeError(`${ip.name}: the connected engine requires equal entry and exit lengths; asymmetric transitions need a separate evaluated design.`)
  if (ip.hasTransition === false && (entry > 0 || exit > 0)) throw new RangeError(`${ip.name}: transition lengths conflict with the disabled transition flag.`)
  return entry
}

export function calculateRoadHorizontal(ips: IntersectionPoint[], startChainage: number, crsCode: string) {
  const curves: ProjectRoadCurve[] = []
  try {
    if (assertProjectedCrs(crsCode).units !== 'metres') throw new RangeError('Road alignment requires a projected metre CRS.')
    if (!Number.isFinite(startChainage)) throw new RangeError('The starting chainage must be finite.')
    if (ips.length < 2) throw new RangeError('Enter at least two observed alignment endpoints; a curve requires three points.')
    if (ips.length > 1000) throw new RangeError('Use at most 1,000 horizontal alignment points per route.')
    if (ips.some(ip => ![ip.easting, ip.northing, ip.radius].every(Number.isFinite)) || new Set(ips.map(ip => ip.id)).size !== ips.length) throw new RangeError('Alignment points need unique IDs and finite coordinates/radii.')
    const legs = ips.slice(1).map((ip, i) => Math.hypot(ip.easting - ips[i].easting, ip.northing - ips[i].northing))
    if (legs.some(length => !Number.isFinite(length) || length <= 0)) throw new RangeError('Adjacent alignment points must have distinct coordinates and finite separation.')
    const elements = ips.map((ip, i) => {
      const transitionLength = projectTransitionLength(ip)
      if (i === 0 || i === ips.length - 1) {
        if (ip.hasTransition || transitionLength > 0) throw new RangeError(`${ip.name}: transition curves require a middle PI, not an endpoint.`)
        return null
      }
      const before = ips[i - 1], after = ips[i + 1]
      const b1 = Math.atan2(ip.easting - before.easting, ip.northing - before.northing) * 180 / Math.PI
      const b2 = Math.atan2(after.easting - ip.easting, after.northing - ip.northing) * 180 / Math.PI
      const signed = ((b2 - b1 + 540) % 360) - 180
      if (Math.abs(signed) < 1e-9) {
        if (ip.hasTransition || transitionLength > 0) throw new RangeError(`${ip.name}: a collinear PI cannot define transition-curve deflection.`)
        return null
      }
      if (Math.abs(signed) >= 180 - 1e-9) throw new RangeError(`${ip.name}: a reversing tangent cannot define a simple circular curve.`)
      if (ip.radius <= 0) throw new RangeError(`${ip.name}: supply a positive design radius; no default radius is used.`)
      if (transitionLength > 0) {
        const spiral = computeSpiralAlignment({ radius: ip.radius, intersectionAngleDeg: signed, spiralLength: transitionLength, piChainage: 0 })
        return { radius: ip.radius, delta: Math.abs(signed), tangentLength: spiral.T, curveLength: spiral.Lc, totalLength: spiral.totalLength, transitionLength, signed, approachBearing: b1 }
      }
      const circle = computeHorizontalCurve(ip.radius, Math.abs(signed), 0)
      return { ...circle, totalLength: circle.curveLength, transitionLength: 0, signed, approachBearing: b1 }
    })
    for (let i = 0; i < legs.length; i++) {
      if ((elements[i]?.tangentLength ?? 0) + (elements[i + 1]?.tangentLength ?? 0) > legs[i] + 1e-9) throw new RangeError('Curve tangents overlap or extend beyond the observed alignment endpoints; review radii and spacing.')
    }
    let rawChainage = startChainage, correction = 0
    for (let i = 1; i < ips.length; i++) {
      rawChainage += legs[i - 1]
      if (!Number.isFinite(rawChainage)) throw new RangeError('Alignment chainages exceed the finite calculation range.')
      const curve = elements[i]
      if (!curve) continue
      const beginning = rawChainage - correction - curve.tangentLength
      const spiralAlignment = curve.transitionLength > 0 ? computeSpiralAlignment({
        radius: curve.radius, intersectionAngleDeg: curve.signed, spiralLength: curve.transitionLength,
        piChainage: rawChainage - correction, piEasting: ips[i].easting, piNorthing: ips[i].northing, approachBearingDeg: curve.approachBearing,
      }) : null
      const tc = spiralAlignment?.scChainage ?? beginning, ct = spiralAlignment?.csChainage ?? (beginning + curve.curveLength)
      if (![tc, ct, beginning + curve.totalLength, curve.tangentLength, curve.curveLength].every(Number.isFinite)) throw new RangeError('Curve quantities exceed the finite calculation range.')
      curves.push({ ipId: ips[i].id, name: ips[i].name, radius: curve.radius,
        turn: curve.signed > 0 ? 'right' : 'left', deflectionAngle: curve.delta,
        tangentLength: curve.tangentLength, arcLength: curve.curveLength,
        chainageTC: tc, chainageMC: tc + curve.curveLength / 2, chainageCT: ct,
        kind: spiralAlignment ? 'spiral-circular-spiral' : 'circular', transitionLength: curve.transitionLength,
        totalLength: curve.totalLength, chainageTS: spiralAlignment?.tsChainage ?? null, chainageST: spiralAlignment?.stChainage ?? null, spiralAlignment })
      correction += 2 * curve.tangentLength - curve.totalLength
    }
    const length = legs.reduce((sum, span) => sum + span, 0) - correction
    if (!Number.isFinite(length)) throw new RangeError('Alignment length exceeds the finite calculation range.')
    return { curves, issues: [] as string[], length }
  } catch (error) { return { curves: [] as ProjectRoadCurve[], issues: [message(error)], length: null } }
}
