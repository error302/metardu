import { triangulate, generateContours, buildTINSurface, interpolateElevation } from '../contours'

const SPOT_HEIGHTS = [
  { name: 'A', easting: 0,   northing: 0,   elevation: 10 },
  { name: 'B', easting: 100, northing: 0,   elevation: 20 },
  { name: 'C', easting: 100, northing: 100, elevation: 15 },
  { name: 'D', easting: 0,   northing: 100, elevation: 5  },
  { name: 'E', easting: 50,  northing: 50,  elevation: 25 },
]

describe('triangulate', () => {
  it('returns triangles from spot heights', () => {
    const tris = triangulate(SPOT_HEIGHTS)
    expect(tris.length).toBeGreaterThan(0)
  })

  it('each triangle has 3 vertices', () => {
    const tris = triangulate(SPOT_HEIGHTS)
    tris.forEach((tri) => {
      expect(tri.p1).toBeDefined()
      expect(tri.p2).toBeDefined()
      expect(tri.p3).toBeDefined()
    })
  })

  it('returns empty array for < 3 points', () => {
    const tris = triangulate([SPOT_HEIGHTS[0], SPOT_HEIGHTS[1]])
    expect(tris.length).toBe(0)
  })
})

describe('generateContours', () => {
  it('retains measured ridge endpoints and draws both physical isolines through the compatibility API', () => {
    const points = [{ name: 'A', easting: 0, northing: 0, elevation: 0 }, { name: 'B', easting: 10, northing: 0, elevation: 0 },
      { name: 'C', easting: 10, northing: 10, elevation: 0 }, { name: 'D', easting: 0, northing: 10, elevation: 0 }]
    const breaklines = [{ start: { name: 'RIDGE-A', easting: 5, northing: 0, elevation: 2 }, end: { name: 'RIDGE-B', easting: 5, northing: 10, elevation: 2 } }]
    const surface = buildTINSurface(points, breaklines)
    expect(surface.points).toHaveLength(6)
    expect(interpolateElevation(surface, 5, 5)).toBeCloseTo(2, 9)
    const lines = generateContours(points, 1, 5, breaklines).filter(c => c.elevation === 1)
    expect(lines).toHaveLength(2)
    expect(lines.flatMap(c => c.points).every(p => p.easting === 2.5 || p.easting === 7.5)).toBe(true)
    expect(points).toHaveLength(4)
  })
  it('generates contour lines between min and max elevation', () => {
    const contours = generateContours(SPOT_HEIGHTS, 5)
    expect(contours.length).toBeGreaterThan(0)
  })

  it('all contour elevations are between min and max elevation', () => {
    const elevations = SPOT_HEIGHTS.map((p) => p.elevation)
    const minE = Math.min(...elevations)
    const maxE = Math.max(...elevations)
    const contours = generateContours(SPOT_HEIGHTS, 5)
    contours.forEach((c) => {
      expect(c.elevation).toBeGreaterThanOrEqual(minE)
      expect(c.elevation).toBeLessThanOrEqual(maxE)
    })
  })

  it('finer interval gives more contours', () => {
    const coarse = generateContours(SPOT_HEIGHTS, 10)
    const fine = generateContours(SPOT_HEIGHTS, 5)
    expect(fine.length).toBeGreaterThanOrEqual(coarse.length)
  })

  it('returns empty array for < 3 points', () => {
    const result = generateContours([SPOT_HEIGHTS[0], SPOT_HEIGHTS[1]], 5)
    expect(result.length).toBe(0)
  })
})
