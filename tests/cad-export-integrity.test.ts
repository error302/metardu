import { generateCADDocumentDXF } from '@/components/cad-editor/cadDxfExport'
import { exportDrawing } from './fixtures/cad-export-document'

test.each([
  ['CRS', { coordinateReferenceSystem: undefined }],
  ['scale', { metersPerPixel: undefined }],
  ['origin', { originEasting: undefined }],
  ['display CRS', { coordinateReferenceSystem: 'EPSG:3857' }],
] as const)('direct DXF export refuses missing or invalid %s instead of inventing a frame', (_name, patch) => {
  expect(() => generateCADDocumentDXF(exportDrawing(patch))).toThrow()
})

test('direct DXF export refuses a layout that disagrees with supplied grid controls', () => {
  const doc = exportDrawing()
  doc.beacons[1].x = 301
  expect(() => generateCADDocumentDXF(doc)).toThrow(/reference|align/i)
})

test('DXF measurement labels are derived from endpoint coordinates, not stale saved values', () => {
  const original = exportDrawing()
  const dxf = generateCADDocumentDXF(original)
  expect(dxf).toContain('90°00\'00"  100.000m')
  expect(dxf).not.toContain('0°00\'00"  10.000m')
  expect(original.boundaries[0].distanceM).toBe(10)
})

test('DXF includes line annotations with grid coordinates', () => {
  const dxf = generateCADDocumentDXF(exportDrawing())
  expect(dxf).toContain('ANNOTATIONS')
  expect(dxf).toMatch(/10\n500050(?:\.0*)?\n20\n-50(?:\.0*)?/)
})

test('DXF text cannot inject group codes through a multiline label', () => {
  const doc = exportDrawing()
  doc.beacons[0].label = 'CP-01\n0\nENDSEC\n0\nEOF'
  const dxf = generateCADDocumentDXF(doc)
  expect(dxf.match(/^EOF$/gm)).toHaveLength(1)
  expect(dxf).toContain('CP-01 0 ENDSEC 0 EOF')
})

test('DXF preserves supplied control precision even within the frame reconciliation tolerance', () => {
  const doc = exportDrawing()
  doc.beacons[0].easting = 500050.00000001
  expect(generateCADDocumentDXF(doc)).toContain('500050.00000001')
})
