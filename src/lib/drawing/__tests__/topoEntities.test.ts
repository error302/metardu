import { buildTopoEntities, entitiesToDxfString, type DrawingEntity } from '../topoEntities'
import { parseDxfGeometry } from '@/lib/importers/dxfGeometry'

test('measured breakline chains serialize as native 3D polylines without losing zero or negative Z', () => {
  const entities = [{ kind: 'polyline3d', layer: 'SURVEY_BREAKLINES_3D', pts: [[500000,9850000,-2],[500010,9850010,0],[500020,9850020,2]] }] as unknown as DrawingEntity[]
  const dxf=entitiesToDxfString(entities,[{name:'SURVEY_BREAKLINES_3D',colorHex:'#00ffff',lineTypeName:'CONTINUOUS'}])
  expect(dxf).toContain('\nPOLYLINE\n')
  const parsed=parseDxfGeometry(dxf)
  expect(parsed.entities[0].coordinates).toEqual([[500000,9850000,-2],[500010,9850010,0],[500020,9850020,2]])
})
test('multiline source text cannot inject additional DXF records', () => {
  expect(()=>entitiesToDxfString([{kind:'text',layer:'ANNOTATIONS',e:0,n:0,height:1,text:'Point\n0\nLINE\n'}],[{name:'ANNOTATIONS',colorHex:'#ffffff',lineTypeName:'CONTINUOUS'}])).toThrow(/single-line/)
})

const settings = { scale: 500, includeSpotHeights: false, includeTitleBlock: false, gridTickInterval: 10, includeLabels: false, includeLegend: false }
const points = [{ name: 'A', code: 'SH', easting: 500000, northing: 9800000, elevation: 10 }, { name: 'B', code: 'SH', easting: 500010, northing: 9800010, elevation: 10 }]
const FOREIGN_CRS = 'EPSG:32632'

test('title never guesses a jurisdiction or CRS from an easting', () => {
  for (const easting of [300000, 500001]) {
    const drawing = buildTopoEntities([{ code: 'SH', easting, northing: 6000000, elevation: 0 }], { ...settings, includeTitleBlock: true })
    const title = drawing.entities.filter(e => e.kind === 'text').map(e => e.kind === 'text' ? e.text : '').join('\n')
    expect(title).not.toMatch(/KENYA|Arc 1960|36N|37S/)
    expect(title).toContain('Coordinate System: Not declared')
    expect(title).toContain('DRAFT')
  }
})

test('explicit reference and draft status survive hiding the decorative title block', () => {
  const drawing = buildTopoEntities(points, settings, { reference: { horizontalCrs: FOREIGN_CRS, verticalDatum: 'Synthetic foreign BM' } })
  const dxf = entitiesToDxfString(drawing.entities, drawing.layers)
  expect(dxf).toContain(FOREIGN_CRS)
  expect(dxf).toContain('Synthetic foreign BM')
  expect(dxf).toContain('DRAFT')
  expect(dxf).not.toContain('Arc 1960')
})

test('exported source point geometry retains zero and negative measured heights', () => {
  const source = [-2, 0, 2].map((elevation, index) => ({ code: 'SPOT', easting: 500000 + index * 10, northing: 9850000, elevation }))
  const drawing = buildTopoEntities(source, settings)
  expect(drawing.entities.filter(entity => entity.kind === 'point')).toEqual(source.map(point => ({ kind: 'point', layer: 'OTHER-UNKNOWN', e: point.easting, n: point.northing, elevation: point.elevation })))
  const parsed = parseDxfGeometry(entitiesToDxfString(drawing.entities, drawing.layers))
  expect(parsed.entities.filter(entity => entity.kind === 'point').map(entity => entity.coordinates[0])).toEqual(source.map(point => [point.easting, point.northing, point.elevation]))
})

test.each([0, Number.NaN, -1, Infinity])('invalid grid intervals fail explicitly instead of producing an incomplete drawing (%s)', gridTickInterval => {
  expect(() => buildTopoEntities(points, { ...settings, gridTickInterval })).toThrow(/grid interval/i)
})

test('excessively dense grids fail before allocating or looping through the ticks', () => {
  expect(() => buildTopoEntities(points, { ...settings, gridTickInterval: 0.00001 })).toThrow(/larger grid interval/)
})

test('grid ticks stay within the drawing frame when its bounds are between grid lines', () => {
  const drawing = buildTopoEntities(points, settings)
  const { minX, maxX, minY, maxY } = drawing.extents
  const ticks = drawing.entities.filter(entity => entity.kind === 'line' && entity.layer === 'GRID')
  expect(ticks.length).toBeGreaterThan(0)
  for (const tick of ticks) {
    if (tick.kind !== 'line') throw new Error('Expected a grid line')
    for (const x of [tick.x1, tick.x2]) { expect(x).toBeGreaterThanOrEqual(minX); expect(x).toBeLessThanOrEqual(maxX) }
    for (const y of [tick.y1, tick.y2]) { expect(y).toBeGreaterThanOrEqual(minY); expect(y).toBeLessThanOrEqual(maxY) }
  }
})

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

test('3D breakline uses the DXF 3D POLYLINE flag, with vertex flags kept separate',()=>{
  const dxf=entitiesToDxfString([{kind:'polyline3d',layer:'BREAKLINE',pts:[[1,2,-2],[3,4,0],[5,6,2]]}],
    [{name:'BREAKLINE',colorHex:'#00ffff',lineTypeName:'CONTINUOUS'}])
  const lines=dxf.split(/\r?\n/),tags:Array<[number,string]>=[]
  for(let index=0;index+1<lines.length;index+=2)tags.push([Number(lines[index]),lines[index+1].trim()])
  const start=tags.findIndex(([code,value])=>code===0&&value==='POLYLINE')
  const end=tags.findIndex(([code,value],index)=>index>start&&code===0&&value==='VERTEX')
  expect(tags.slice(start,end)).toContainEqual([70,'8'])
  expect(tags.filter(([code,value])=>code===70&&value==='32')).toHaveLength(3)
})
