/** @jest-environment node */
import { createProjectSchema } from '@/lib/validation/projectCreation'
import { mapDrawingSchema, siteReconnaissanceDrawing } from '@/lib/validation/mapDrawing'
const ring = [[39,-4],[39.001,-4],[39.001,-4.001],[39,-4]]
const drawing = { source: 'map-drawing', createdFrom: 'map-client', coordinateCrs: 'EPSG:4326', measurementCrs: 'EPSG:32737', drawnFeatures: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'retain-id', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { role: 'SYNTHETIC', nested: { keep: [0,null,'text'] } } }] }, drawnAreaSqM: 0, drawnPerimeterM: 0 }
const base = { name: 'SYNTHETIC map drawing', survey_type: 'road', datum: 'WGS84', utm_zone: 37, hemisphere: 'S' }
test('map drawing JSON is preserved including properties IDs and explicit zero metrics', () => {
  expect(createProjectSchema.parse({ ...base, boundary_data: drawing }).boundary_data).toEqual(drawing)
})
test.each([
  { datum: null, utm_zone: null, hemisphere: null },
  { utm_zone: 36 },
  { datum: 'ARC1960' },
])('a projected drawing cannot be saved against absent or different project reference %p', reference => {
  expect(createProjectSchema.safeParse({ ...base, ...reference, boundary_data: drawing }).success).toBe(false)
})
test.each([
  { type: 'Point', coordinates: [Infinity,-4] },
  { type: 'Point', coordinates: [39,91] },
  { type: 'Point', coordinates: [181,-4] },
  { type: 'LineString', coordinates: [[39,-4]] },
  { type: 'Polygon', coordinates: [[[39,-4],[39.1,-4],[39.1,-4.1]]] },
  { type: 'Polygon', coordinates: [] },
  { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: ['39',-4] }] },
  null,
])('malformed geometry %p is rejected without silently dropping the feature', geometry => {
  expect(mapDrawingSchema.safeParse({ ...drawing, drawnFeatures: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry, properties: {} }] } }).success).toBe(false)
})
test('unknown top-level creation fields fail rather than being silently discarded', () => {
  expect(createProjectSchema.safeParse({ ...base, boundary: { type: 'Polygon', coordinates: [ring] } }).success).toBe(false)
  expect(createProjectSchema.safeParse({ ...base, user_id: 'another-owner' }).success).toBe(false)
})
test('a site sketch may be retained without a grid, with its method and evidence status', () => {
  const sketch = siteReconnaissanceDrawing(ring, 0)
  expect(createProjectSchema.parse({ name: 'SYNTHETIC reconnaissance', survey_type: 'road', boundary_data: sketch })).toMatchObject({ datum: null, boundary_data: { source: 'site-reconnaissance', evidenceStatus: 'reconnaissance_unverified', areaMethod: 'spherical-geodesic-preview', estimatedAreaSqM: 0 } })
  expect(sketch?.drawnFeatures.features[0].geometry).toEqual({ type: 'Polygon', coordinates: [ring] })
  expect(siteReconnaissanceDrawing([], null)).toBeUndefined()
  expect(() => siteReconnaissanceDrawing(ring, null)).toThrow()
})
