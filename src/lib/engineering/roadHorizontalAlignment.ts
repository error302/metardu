import { computeHorizontalCurve } from '@/lib/engine/engineering'
import { assertProjectedCrs } from '@/lib/spatial/projectCrs'
import type { IntersectionPoint } from '@/types/engineering'
const message = (error: unknown) => error instanceof Error ? error.message : 'Review the supplied alignment data.'
export interface ProjectRoadCurve {
  ipId: string; name: string; radius: number; turn: 'left' | 'right'; deflectionAngle: number;
  tangentLength: number; arcLength: number; chainageTC: number; chainageMC: number; chainageCT: number
}

export function calculateRoadHorizontal(ips: IntersectionPoint[], startChainage: number, crsCode: string) {
  const curves: ProjectRoadCurve[] = []
  try {
    if (assertProjectedCrs(crsCode).units !== 'metres') throw new RangeError('Road alignment requires a projected metre CRS.')
    if (!Number.isFinite(startChainage)) throw new RangeError('The starting chainage must be finite.')
    if (ips.length < 2) throw new RangeError('Enter at least two observed alignment endpoints; a curve requires three points.')
    if (ips.some(ip => ![ip.easting, ip.northing, ip.radius].every(Number.isFinite)) || new Set(ips.map(ip => ip.id)).size !== ips.length) throw new RangeError('Alignment points need unique IDs and finite coordinates/radii.')
    const legs = ips.slice(1).map((ip, i) => Math.hypot(ip.easting - ips[i].easting, ip.northing - ips[i].northing))
    if (legs.some(length => !Number.isFinite(length) || length <= 0)) throw new RangeError('Adjacent alignment points must have distinct coordinates and finite separation.')
    const elements = ips.map((ip, i) => {
      if (i === 0 || i === ips.length - 1) return null
      const before = ips[i - 1], after = ips[i + 1]
      const b1 = Math.atan2(ip.easting - before.easting, ip.northing - before.northing) * 180 / Math.PI
      const b2 = Math.atan2(after.easting - ip.easting, after.northing - ip.northing) * 180 / Math.PI
      const signed = ((b2 - b1 + 540) % 360) - 180
      if (Math.abs(signed) < 1e-9) return null
      if (Math.abs(signed) >= 180 - 1e-9) throw new RangeError(`${ip.name}: a reversing tangent cannot define a simple circular curve.`)
      if (ip.radius <= 0) throw new RangeError(`${ip.name}: supply a positive design radius; no default radius is used.`)
      if (ip.hasTransition || ip.transitionLengthIn || ip.transitionLengthOut) throw new RangeError(`${ip.name}: transition-curve geometry must be resolved before using a simple circular schedule.`)
      return { ...computeHorizontalCurve(ip.radius, Math.abs(signed), 0), signed }
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
      const tc = rawChainage - correction - curve.tangentLength
      if (![tc, tc + curve.curveLength, curve.tangentLength, curve.curveLength].every(Number.isFinite)) throw new RangeError('Curve quantities exceed the finite calculation range.')
      curves.push({ ipId: ips[i].id, name: ips[i].name, radius: curve.radius,
        turn: curve.signed > 0 ? 'right' : 'left', deflectionAngle: curve.delta,
        tangentLength: curve.tangentLength, arcLength: curve.curveLength,
        chainageTC: tc, chainageMC: tc + curve.curveLength / 2, chainageCT: tc + curve.curveLength })
      correction += 2 * curve.tangentLength - curve.curveLength
    }
    const length = legs.reduce((sum, span) => sum + span, 0) - correction
    if (!Number.isFinite(length)) throw new RangeError('Alignment length exceeds the finite calculation range.')
    return { curves, issues: [] as string[], length }
  } catch (error) { return { curves: [] as ProjectRoadCurve[], issues: [message(error)], length: null } }
}
