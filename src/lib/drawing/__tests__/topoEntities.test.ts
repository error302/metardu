import { buildTopoEntities, entitiesToDxfString, type DrawingEntity } from '../topoEntities'
import { parseDxfGeometry } from '@/lib/importers/dxfGeometry'

const settings = { scale: 500, includeSpotHeights: false, includeTitleBlock: false, gridTickInterval: 10, includeLabels: false, includeLegend: false }
const points = [{ name: 'A', code: 'SH', easting: 500000, northing: 9800000, elevation: 10 }, { name: 'B', code: 'SH', easting: 500010, northing: 9800010, elevation: 10 }]

test('drawing preserves true contour coordinates and open/closed topology', () => {
  const open: [number, number][] = [[499990, 9800000], [500002, 9800005], [500020, 9800010]]
  const closed: [number, number][] = [[500000, 9800000], [500001, 9800000], [500000, 9800001], [500000, 9800000]]
  const drawing = buildTopoEntities(points, settings, { contours: [
    { elevation: 10.25, isIndex: false, coordinates: [open] }, { elevation: 15, isIndex: true, coordinates: [closed] },
  ] })
  const contours = drawing.entities.filter(e => e.kind === 'polyline' && ['CONTOURS', 'CONTOUR_I'].includes(e.layer))
  expect(contours).toEqual([
    expect.objectContaining({ pts: open, closed: false, elevation: 10.25 }),
    expect.objectContaining({ pts: closed, closed: true, elevation: 15 }),
  ])
  expect(drawing.extents.minX).toBeLessThanOrEqual(open[0][0])
  expect(drawing.extents.maxX).toBeGreaterThanOrEqual(open[2][0])
})

test('real DXF round-trip retains contour RL, connectivity and alternating entity layers', () => {
  const entities: DrawingEntity[] = [
    { kind: 'line', layer: 'A', x1: 0, y1: 0, x2: 1, y2: 0 },
    { kind: 'text', layer: 'B', e: 1, n: 1, height: 0.2, text: 'Synthetic label' },
    { kind: 'line', layer: 'A', x1: 2, y1: 0, x2: 3, y2: 0 },
    { kind: 'polyline', layer: 'CONTOURS', pts: [[500002.5, 9800000], [500002.5, 9800005], [500002.5, 9800010]], closed: false, elevation: 10.25 },
    { kind: 'polyline', layer: 'CONTOUR_I', pts: [[0, 0], [1, 0], [0, 1], [0, 0]], closed: true, elevation: 15 },
  ]
  const source = entitiesToDxfString(entities, ['A', 'B', 'CONTOURS', 'CONTOUR_I'].map(name => ({ name, colorHex: '#ffffff', lineTypeName: 'CONTINUOUS' })))
  const parsed = parseDxfGeometry(source)
  expect(parsed.units.metresPerUnit).toBe(1)
  expect(parsed.entities.filter(e => e.kind === 'line' && e.layer === 'A')).toHaveLength(2)
  const line = parsed.entities.find(e => e.layer === 'CONTOURS')
  if (!line) throw new Error('DXF round-trip lost the contour entity.')
  expect(line.kind).toBe('polyline')
  expect(line.closed).toBe(false)
  expect(line.coordinates).toEqual([[500002.5, 9800000, 10.25], [500002.5, 9800005, 10.25], [500002.5, 9800010, 10.25]])
  expect(parsed.entities.find(e => e.layer === 'CONTOUR_I')?.closed).toBe(true)
})
