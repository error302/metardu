import { cadDraftBoundsPoints, copyCadDraftShape, makeCadDraftShape } from '@/lib/cad/cadDraftGeometry'
import { cadRasterCorners } from '@/lib/cad/cadDrawingBounds'
import { parseCadDocument } from '@/lib/cad/cadDocumentValidation'
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

test('draft shapes survive validation and export as native DXF geometry with their line types', () => {
  const rectangle = makeCadDraftShape('rectangle', { x: 100, y: 100 }, { x: 150, y: 125 }, 'dashed', 'rect')
  const circle = makeCadDraftShape('circle', { x: 200, y: 200 }, { x: 203, y: 204 }, 'center', 'circle')
  const copy = copyCadDraftShape(rectangle, { x: 100, y: -40 }, 'copy')
  const document = exportDrawing({ annotations: [rectangle, circle, copy] })
  expect(parseCadDocument(document)?.annotations).toEqual(document.annotations)
  expect(copy).toMatchObject({ x: 200, y: 60, x2: 250, y2: 85, lineStyle: 'dashed' })
  expect(cadDraftBoundsPoints(circle)).toEqual([{ x: 195, y: 195 }, { x: 205, y: 205 }])
  expect(() => copyCadDraftShape(circle, { x: 0, y: 0 }, 'overlap')).toThrow(/nonzero/)
  expect(() => makeCadDraftShape('rectangle', { x: 0, y: 0 }, { x: 0, y: 20 }, 'solid', 'empty')).toThrow()
  const dxf = generateCADDocumentDXF(document)
  expect(dxf).toMatch(/CIRCLE[\s\S]*?8\nDRAFT_CENTER\n/)
  expect(dxf).toMatch(/LWPOLYLINE[\s\S]*?8\nDRAFT_DASHED\n/)
  expect(document.boundaries).toEqual(exportDrawing().boundaries)
})

test('raster fit uses the corners after rotation around the image center', () => {
  const corners = cadRasterCorners({ id: 'img', url: '', x: 0, y: 0, width: 100, height: 50, rotation: 90, locked: false, visible: true, opacity: 1 })
  expect(Math.min(...corners.map(point => point.x))).toBeCloseTo(25)
  expect(Math.max(...corners.map(point => point.x))).toBeCloseTo(75)
  expect(Math.min(...corners.map(point => point.y))).toBeCloseTo(-25)
  expect(Math.max(...corners.map(point => point.y))).toBeCloseTo(75)
})
