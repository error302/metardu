import { computeVolumeFromTIN, computeVolumeBetweenSurfaces, buildTINSurface, type TINSurface } from '../contours'

it('separates excavation and fill within one triangle crossing the reference plane', () => {
  const points = [{ name: 'A', easting: 0, northing: 0, elevation: 1 }, { name: 'B', easting: 2, northing: 0, elevation: -1 }, { name: 'C', easting: 0, northing: 2, elevation: -1 }]
  const surface: TINSurface = { points, triangles: [{ p1: points[0], p2: points[1], p3: points[2] }], bounds: { minE: 0, maxE: 2, minN: 0, maxN: 2 } }
  const volume = computeVolumeFromTIN(surface, 0)
  expect(volume.cut).toBeCloseTo(1 / 6, 10)
  expect(volume.fill).toBeCloseTo(5 / 6, 10)
  expect(volume.net).toBeCloseTo(-2 / 3, 10)
  expect(() => computeVolumeFromTIN(surface, Infinity)).toThrow()
})

it('covers each grid area once, including residual edge cells', () => {
  const square = (elevation: number) => buildTINSurface([[0, 0], [10, 0], [10, 10], [0, 10]].map(([easting, northing], i) => ({ name: String(i), easting, northing, elevation })))
  expect(computeVolumeBetweenSurfaces(square(5), square(3), 3).cut).toBeCloseTo(200, 10)
  expect(() => computeVolumeBetweenSurfaces(square(5), square(3), 0)).toThrow()
})
