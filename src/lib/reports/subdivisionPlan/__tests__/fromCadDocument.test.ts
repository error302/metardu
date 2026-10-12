import { closedSubdivisionPortionFromCad } from '../fromCadDocument'
import type { CADDocument } from '@/components/cad-editor/CADEditor'

function square(): CADDocument {
  return {
    beacons: [
      { id: 'a', label: 'A', x: 100, y: 100, easting: 500_000, northing: 9_800_000 },
      { id: 'b', label: 'B', x: 200, y: 100, easting: 500_020, northing: 9_800_000 },
      { id: 'c', label: 'C', x: 200, y: 200, easting: 500_020, northing: 9_800_020 },
      { id: 'd', label: 'D', x: 100, y: 200, easting: 500_000, northing: 9_800_020 },
    ],
    boundaries: [
      { id: 'ab', fromId: 'a', toId: 'b', bearing: '90°', distance: '20.00', distanceM: 20, type: 'standard' },
      { id: 'bc', fromId: 'b', toId: 'c', bearing: '0°', distance: '20.00', distanceM: 20, type: 'standard' },
      { id: 'cd', fromId: 'c', toId: 'd', bearing: '270°', distance: '20.00', distanceM: 20, type: 'standard' },
      { id: 'da', fromId: 'd', toId: 'a', bearing: '180°', distance: '20.00', distanceM: 20, type: 'standard' },
    ],
    annotations: [], northArrow: { x: 900, y: 80, rotation: 0, type: 'grid', bearing: '0°' },
    scaleBar: { x: 50, y: 700, scaleMeters: 20 },
    titleBlock: { projectName: 'Test', lrNumber: '', surveyor: '', regNo: '', date: '', scale: '', sheet: '1 of 1' },
    width: 1122, height: 794, metersPerPixel: 0.2,
    originEasting: 499_980, originNorthing: 9_799_980,
    coordinateReferenceSystem: 'EPSG:21037',
  }
}

test('builds a portion only from a closed, CRS-bound CAD loop and computes its area from coordinates', () => {
  const result = closedSubdivisionPortionFromCad(square())
  expect(result?.projectCrs).toBe('EPSG:21037')
  expect(result?.portion.areaSqM).toBe(400)
  expect(result?.portion.areaHa).toBe(0.04)
  expect(result?.portion.boundaryPoints).toHaveLength(4)
})

test('does not infer a portion from point-only or open-line CAD drawings', () => {
  const drawing = square()
  drawing.boundaries.pop()
  expect(closedSubdivisionPortionFromCad(drawing)).toBeNull()
  drawing.boundaries = []
  expect(closedSubdivisionPortionFromCad(drawing)).toBeNull()
})

test('rejects a self-intersecting loop rather than reporting its shoelace area', () => {
  const drawing = square()
  drawing.beacons[1].easting = 500_020
  drawing.beacons[1].northing = 9_800_020
  drawing.beacons[2].easting = 500_000
  drawing.beacons[2].northing = 9_800_020
  drawing.beacons[3].easting = 500_020
  drawing.beacons[3].northing = 9_800_000
  expect(closedSubdivisionPortionFromCad(drawing)).toBeNull()
})

test('requires a registered metre coordinate system', () => {
  const drawing = square()
  drawing.coordinateReferenceSystem = 'EPSG:3857'
  expect(closedSubdivisionPortionFromCad(drawing)).toBeNull()
})
