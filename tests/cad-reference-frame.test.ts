const fixtureCrs32636 = 'EPSG:32636'
const fixtureCrs21036 = 'EPSG:21036'
import { requiredValue } from '@/test-utils/requiredValue'
import type { CADDocument } from '@/components/cad-editor/CADEditor'
import { applyCadReferenceFrame, calibrateCadScale } from '@/lib/cad/cadReferenceFrame'

function drawing(patch: Partial<CADDocument> = {}): CADDocument {
  return {
    width: 1122, height: 794,
    beacons: [{ id: 'a', label: 'A', x: 100, y: 100 }, { id: 'b', label: 'B', x: 200, y: 100 }],
    boundaries: [{ id: 'ab', fromId: 'a', toId: 'b', bearing: '', distance: '', type: 'standard' }],
    annotations: [{ id: 'text', type: 'text', x: 150, y: 100, text: 'Draft' }],
    northArrow: { x: 1012, y: 90, rotation: 0, type: 'grid', bearing: '0' },
    scaleBar: { x: 70, y: 744, scaleMeters: 0 },
    titleBlock: { projectName: 'Synthetic reference QA', lrNumber: '', surveyor: '', regNo: '', date: '', scale: 'Uncalibrated', sheet: '1 of 1' },
    ...patch,
  }
}
const reference = { coordinateReferenceSystem: 'EPSG:32636', metersPerPixel: 1, anchorId: 'a', easting: 500100, northing: 0 }
const picks = [{ x: 50, y: 50 }, { x: 150, y: 50 }] as const
const raster = { id: 'raster', url: 'data:image/png;base64,AA==', x: 20, y: 20, width: 400, height: 300, opacity: 0.5, rotation: 0, visible: true, locked: false }

test('explicit reference anchors zero northing and derives grid coordinates and edge measurements', () => {
  const original = drawing()
  const doc = applyCadReferenceFrame(original, reference)
  expect(doc).toMatchObject({ originEasting: 500000, originNorthing: -694, coordinateReferenceSystem: fixtureCrs32636, metersPerPixel: 1 })
  expect(doc.beacons.map(b => [b.easting, b.northing])).toEqual([[500100, 0], [500200, 0]])
  expect(doc.boundaries[0]).toMatchObject({ distanceM: 100, bearingDeg: 90, bearing: '90°00\'00"' })
  expect(original.beacons[0].easting).toBeUndefined()
})

test('changing layout scale preserves all supplied grid controls and remaps raster and annotations', () => {
  const old = applyCadReferenceFrame(drawing({ backgroundImage: raster }), reference)
  const doc = applyCadReferenceFrame(old, { ...reference, metersPerPixel: 0.5 })
  expect(doc.beacons.map(b => [b.x, b.y, b.easting, b.northing])).toEqual([[100, 100, 500100, 0], [300, 100, 500200, 0]])
  expect(doc.annotations[0]).toMatchObject({ x: 200, y: 100 })
  expect(doc.backgroundImage).toMatchObject({ x: -60, y: -60, width: 800, height: 600 })
  expect(doc.boundaries[0].distanceM).toBe(100)
})

test('an uncoordinated anchor in an existing frame receives the explicitly supplied anchor coordinates', () => {
  const old = applyCadReferenceFrame(drawing(), reference)
  const doc = { ...old, beacons: [...old.beacons, { id: 'design', label: 'Design', x: 400, y: 100 }] }
  const next = applyCadReferenceFrame(doc, { ...reference, anchorId: 'design', easting: 500500, northing: 50 })
  expect(next.beacons[2]).toMatchObject({ x: 400, y: 100, easting: 500500, northing: 50 })
  expect(next.beacons[0]).toMatchObject({ easting: 500100, northing: 0 })
})

test('raster calibration refuses a saved frame that disagrees with supplied control coordinates', () => {
  const doc = applyCadReferenceFrame(drawing({ backgroundImage: raster }), reference)
  doc.beacons[1].x += 1
  expect(() => calibrateCadScale(doc, picks, 50)).toThrow(/reference.*align|align.*reference/i)
})

test.each(['EPSG:4326', 'EPSG:3857', 'EPSG:99999'])('refuses unsuitable or unknown CRS %s', code => {
  expect(() => applyCadReferenceFrame(drawing(), { ...reference, coordinateReferenceSystem: code })).toThrow()
})

test('cannot relabel a registered CRS or replace a known anchor coordinate through layout settings', () => {
  const doc = applyCadReferenceFrame(drawing(), reference)
  expect(() => applyCadReferenceFrame(doc, { ...reference, coordinateReferenceSystem: fixtureCrs21036 })).toThrow(/transform/i)
  expect(() => applyCadReferenceFrame(doc, { ...reference, easting: 500101 })).toThrow(/anchor/i)
})

test('rejects partial controls and invalid scale without mutating the drawing', () => {
  const doc = drawing({ beacons: [{ id: 'a', label: 'A', x: 100, y: 100, easting: 500100 }] , boundaries: [] })
  expect(() => applyCadReferenceFrame(doc, reference)).toThrow(/pair/i)
  for (const scale of [0, -1, Infinity, 100001]) expect(() => applyCadReferenceFrame(drawing(), { ...reference, metersPerPixel: scale })).toThrow()
})

test('referenced raster calibration scales only the image about the first picked point', () => {
  const doc = applyCadReferenceFrame(drawing({ backgroundImage: raster }), reference)
  const next = calibrateCadScale(doc, picks, 50)
  expect(next.metersPerPixel).toBe(1)
  expect(next.beacons).toEqual(doc.beacons)
  expect(next.boundaries).toEqual(doc.boundaries)
  expect(next.backgroundImage).toMatchObject({ x: 35, y: 35, width: 200, height: 150 })
  expect(doc.backgroundImage).toEqual(raster)
})

test('unreferenced calibration establishes metric distances without inventing grid coordinates or CRS', () => {
  const doc = calibrateCadScale(drawing(), picks, 50)
  expect(doc.metersPerPixel).toBe(0.5)
  expect(doc.boundaries[0]).toMatchObject({ distanceM: 50, bearingDeg: 90 })
  expect(doc.originEasting).toBeUndefined()
  expect(doc.originNorthing).toBeUndefined()
  expect(doc.coordinateReferenceSystem).toBeUndefined()
  expect(doc.beacons[0].easting).toBeUndefined()
})

test('known survey coordinates require a reference and raster before calibration can change anything', () => {
  const unreferenced = drawing({ beacons: [{ id: 'a', label: 'A', x: 100, y: 100, easting: 500100, northing: 0 }], boundaries: [] })
  expect(() => calibrateCadScale(unreferenced, picks, 50)).toThrow(/reference/i)
  const referenced = applyCadReferenceFrame(drawing(), reference)
  expect(() => calibrateCadScale(referenced, picks, 50)).toThrow(/image/i)
})

test('calibration respects rotated image bounds, visibility, locks and finite distances', () => {
  const doc = applyCadReferenceFrame(drawing({ backgroundImage: { ...raster, rotation: 90 } }), reference)
  const inside = [{ x: 220, y: 100 }, { x: 220, y: 200 }] as const
  expect(calibrateCadScale(doc, inside, 50).backgroundImage?.rotation).toBe(90)
  expect(() => calibrateCadScale(doc, picks, 50)).toThrow(/inside/i)
  for (const patch of [{ locked: true }, { visible: false }]) {
    expect(() => calibrateCadScale({ ...doc, backgroundImage: { ...requiredValue(doc.backgroundImage), ...patch } }, inside, 50)).toThrow()
  }
  for (const distance of [NaN, Infinity, 0, -50]) expect(() => calibrateCadScale(doc, inside, distance)).toThrow()
  expect(() => calibrateCadScale(doc, [inside[0], inside[0]], 50)).toThrow(/close/i)
  expect(() => calibrateCadScale(doc, inside, 1e8)).toThrow(/limits/i)
})
