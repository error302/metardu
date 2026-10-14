import { calculatePipeCover, generatePipeSetoutStations, autoGradeNetwork, generateNetworkDXF, type Manhole, type Pipe } from '../pipeNetworkEngine'
import { parseDxfGeometry } from '@/lib/importers/dxfGeometry'
import { SRID_21037 } from '@/lib/map/projectionConstants'
const manholes: Manhole[] = [
  { id: 'A', easting: 500000, northing: 9800000, groundLevel: 11, invertOut: 10 },
  { id: 'B', easting: 500050, northing: 9800000, groundLevel: 11, invertIn: 9.5 },
]
const pipe: Pipe = { id: 'AB', fromId: 'A', toId: 'B', diameterMm: 300, outsideDiameterMm: 400, material: 'Concrete', designFlowLs: 1 }
test('network cover and set-out use internal invert plus one wall thickness above internal diameter', () => {
  expect(calculatePipeCover(pipe, manholes[0], manholes[1], 0.6).coverUpstream).toBeCloseTo(0.65, 10)
  const stations = generatePipeSetoutStations(manholes, [pipe], 25)
  expect(stations[0].crownLevelM).toBeCloseTo(10.35, 10)
  expect(stations[1].crownLevelM).toBeCloseTo(10.1, 10)
  expect(stations[1].groundLevelM).toBeUndefined()
})
test('auto-grading begins at the requested external cover relative to the internal invert', () => {
  const result = autoGradeNetwork(manholes, [pipe], { targetSlopePercent: 1, minCoverM: 0.6, manholeDropM: 0 })
  expect(result.issues).toEqual([])
  expect(result.manholes[0].invertOut).toBeCloseTo(10.05, 10)
})
test('an outside diameter smaller than the internal diameter cannot generate field targets', () => {
  expect(() => generatePipeSetoutStations(manholes, [{ ...pipe, outsideDiameterMm: 200 }], 25)).toThrow()
  expect(() => calculatePipeCover({ ...pipe, outsideDiameterMm: 200 }, manholes[0], manholes[1], 0.6)).toThrow()
})
test('the exported DXF profile crown is correct in the declared fivefold vertical display', () => {
  const dxf = generateNetworkDXF(manholes, [pipe], SRID_21037)
  // Profile datum = floor(min invert 9.5 - 2) = 7, origin northing 9800000 - 200.
  // Crown ordinate = 9799800 + (10.35 - 7) * 5 = 9799816.75.
  const parsed = parseDxfGeometry(dxf)
  expect(parsed.units.metresPerUnit).toBe(1)
  const ordinates = parsed.entities.filter(entity => entity.layer === 'DRAIN_PROF_PIPE').flatMap(entity => entity.coordinates.map(coordinate => coordinate[1]))
  expect(Math.max(...ordinates)).toBeCloseTo(9799816.75, 8)
})
