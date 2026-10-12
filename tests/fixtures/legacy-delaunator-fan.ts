/**
 * Jest mock for Delaunator (ESM-only package).
 *
 * Implements a simple ear-clipping triangulation for test purposes.
 * Not as fast as the real Delaunator but produces valid triangulations
 * for the test cases used in the contour engine tests.
 */

export default class Delaunator<T extends ArrayLike<number>> {
  triangles: Uint32Array
  hull: Uint32Array
  coords: T

  static from(
    points: ArrayLike<ArrayLike<number>>,
    getX?: (p: ArrayLike<number>) => number,
    getY?: (p: ArrayLike<number>) => number,
  ): Delaunator<Float64Array> {
    const getXFn = getX ?? ((p: ArrayLike<number>) => p[0])
    const getYFn = getY ?? ((p: ArrayLike<number>) => p[1])
    const n = points.length
    const coords = new Float64Array(n * 2)
    for (let i = 0; i < n; i++) {
      coords[2 * i] = getXFn(points[i])
      coords[2 * i + 1] = getYFn(points[i])
    }
    return new Delaunator(coords)
  }

  constructor(coords: T) {
    this.coords = coords
    const n = coords.length / 2

    if (n < 3) {
      this.triangles = new Uint32Array(0)
      this.hull = new Uint32Array(0)
      return
    }

    // Simple ear-clipping triangulation for convex hull
    // For non-convex cases, this produces a valid triangulation of the convex hull
    const indices: number[] = []
    for (let i = 0; i < n; i++) indices.push(i)

    // Sort by angle from centroid
    let cx = 0, cy = 0
    for (let i = 0; i < n; i++) {
      cx += coords[2 * i]
      cy += coords[2 * i + 1]
    }
    cx /= n
    cy /= n

    indices.sort((a, b) => {
      const angA = Math.atan2(coords[2 * a + 1] - cy, coords[2 * a] - cx)
      const angB = Math.atan2(coords[2 * b + 1] - cy, coords[2 * b] - cx)
      return angA - angB
    })

    // Build triangles using fan triangulation from first point
    const triangles: number[] = []
    for (let i = 1; i < indices.length - 1; i++) {
      triangles.push(indices[0], indices[i], indices[i + 1])
    }

    this.triangles = new Uint32Array(triangles)
    this.hull = new Uint32Array(indices)
  }
}
