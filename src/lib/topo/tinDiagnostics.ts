import type { TIN } from '@/lib/survey/surfaceTIN'

/** Actual facet gradients; spacing of vertices on one isoline is not a slope. */
export function checkTINSlopes(tin: TIN, maximumDegrees = 45) {
  if (!Number.isFinite(maximumDegrees) || maximumDegrees <= 0 || maximumDegrees > 90) throw new RangeError('Maximum slope must be between 0 and 90 degrees.')
  const issues: Array<{ type: 'steep_facet'; severity: 'warning'; triangleIndex: number; slopeDegrees: number; message: string }> = []
  let steepCount = 0
  tin.triangles.forEach((face, triangleIndex) => {
    const a = tin.points[face.a], b = tin.points[face.b], c = tin.points[face.c]
    const dx1 = b.x - a.x, dy1 = b.y - a.y, dz1 = b.z - a.z
    const dx2 = c.x - a.x, dy2 = c.y - a.y, dz2 = c.z - a.z
    const determinant = dx1 * dy2 - dx2 * dy1
    if (!Number.isFinite(determinant) || determinant === 0) throw new RangeError('Cannot assess an invalid surface triangle.')
    const gx = (dz1 * dy2 - dz2 * dy1) / determinant, gy = (dx1 * dz2 - dx2 * dz1) / determinant
    const slopeDegrees = Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI
    if (slopeDegrees > maximumDegrees) {
      steepCount++
      if (issues.length < 20) issues.push({ type: 'steep_facet', severity: 'warning', triangleIndex, slopeDegrees,
        message: `Surface triangle ${triangleIndex} has a ${slopeDegrees.toFixed(1)}° slope. Review its source observations and breaklines.` })
    }
  })
  return { issues, passed: steepCount === 0, steepCount, maximumDegrees,
    summary: steepCount ? `${steepCount} surface facets exceed the selected slope threshold. Field evidence still requires review.`
      : 'Surface facets are within the selected slope threshold. This check does not certify field accuracy.' }
}
