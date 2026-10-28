import { requiredValue } from '@/test-utils/requiredValue'
import {
  endpointsBearingInCrs,
  polygonAreaInCrs,
  polygonPerimeterInCrs,
  polylineLengthInCrs,
} from '@/lib/surveyMapEngine/core/measure'
import { toDisplay, fromDisplay } from '@/lib/spatial/projectCrs'

const CRS = 'EPSG:21037' // Arc 1960 / UTM zone 37S

/** Round-trip a project-CRS point into the display CRS (EPSG:3857). */
function toDisplayPt(e: number, n: number): number[] {
  const [x, y] = toDisplay(e, n, CRS)
  return [x, y]
}

describe('map measurement uses survey maths, not Web Mercator', () => {
  it('measures an east-west line as its project-CRS length', () => {
    // 500 m easting apart at Nairobi latitude in Arc 1960 / UTM 37S
    const coords = [toDisplayPt(500000, 9860000), toDisplayPt(500500, 9860000)]
    const length = polylineLengthInCrs(coords, CRS)
    expect(length).toBeCloseTo(500, 3)
    // The old Web Mercator measurement differed from ground truth
    const mercator = Math.hypot(coords[1][0] - coords[0][0], coords[1][1] - coords[0][1])
    expect(Math.abs(mercator - 500)).toBeGreaterThan(0.05)
  })

  it('measures a 100 m × 100 m square as 10 000 m²', () => {
    const ring = [
      toDisplayPt(500000, 9860000),
      toDisplayPt(500100, 9860000),
      toDisplayPt(500100, 9860100),
      toDisplayPt(500000, 9860100),
      toDisplayPt(500000, 9860000), // closed ring, as OpenLayers returns
    ]
    expect(polygonAreaInCrs(ring, CRS)).toBeCloseTo(10000, 2)
    expect(polygonPerimeterInCrs(ring, CRS)).toBeCloseTo(400, 3)
  })

  it('measures a diagonal bearing between endpoints', () => {
    // 300 m east, 400 m north → bearing 036.8699°
    const coords = [toDisplayPt(500000, 9860000), toDisplayPt(500300, 9860400)]
    const bearing = endpointsBearingInCrs(coords, CRS)
    expect(bearing).not.toBeNull()
    expect(requiredValue(bearing)).toBeCloseTo((Math.atan2(300, 400) * 180) / Math.PI, 6)
  })

  it('returns null bearing for coincident endpoints', () => {
    const p = toDisplayPt(500000, 9860000)
    expect(endpointsBearingInCrs([p, p], CRS)).toBeNull()
    expect(endpointsBearingInCrs([p], CRS)).toBeNull()
  })

  it('throws for an unknown CRS instead of falling back to display units', () => {
    const coords = [toDisplayPt(500000, 9860000), toDisplayPt(500500, 9860000)]
    expect(() => polylineLengthInCrs(coords, 'EPSG:99999')).toThrow()
  })

  it('agrees with direct project-CRS measurement (single math path)', () => {
    const a = fromDisplay(...(toDisplayPt(500000, 9860000) as [number, number]), CRS)
    const b = fromDisplay(...(toDisplayPt(500300, 9860400) as [number, number]), CRS)
    const coords = [toDisplayPt(500000, 9860000), toDisplayPt(500300, 9860400)]
    expect(polylineLengthInCrs(coords, CRS)).toBeCloseTo(Math.hypot(b[0] - a[0], b[1] - a[1]), 6)
  })
})
