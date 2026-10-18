import { importTotalStation } from '../unifiedImport'

test('CSV headers determine Easting/Northing order without guessing and retain absent height', () => {
  const result = importTotalStation('id,easting,northing,elevation,code\nP1,500000,9850000,,EDGE\nP2,500010,9850010,0,"Road, centre"', 'points.csv')
  expect(result.format).toBe('csv')
  expect(result.errors).toEqual([])
  expect(result.rawPoints).toEqual([
    expect.objectContaining({ id: 'P1', easting: 500000, northing: 9850000, elevation: undefined }),
    expect.objectContaining({ id: 'P2', easting: 500010, northing: 9850010, elevation: 0, code: 'Road, centre' }),
  ])
})

test('unlabelled CSV does not guess which numeric column is Easting', () => {
  const result = importTotalStation('P1,9850000,500000,0', 'points.csv')
  expect(result.rawPoints).toEqual([])
  expect(result.errors.join(' ')).toMatch(/column|order/i)
})

test('CSV preserves an incomplete record for review instead of dropping it or creating zero', () => {
  const result = importTotalStation('id,easting,northing,elevation\nP1,500000,9850000,10\nP2,500010,,', 'points.csv')
  expect(result.rawPoints).toHaveLength(2)
  expect(result.rawPoints[1]).toMatchObject({ id: 'P2', easting: 500010 })
  expect(result.rawPoints[1].northing).toBeUndefined()
  expect(result.rawPoints[1].elevation).toBeUndefined()
})

test('numeric suffixes cannot become valid coordinate measurements', () => {
  const result = importTotalStation('id,easting,northing,elevation\nP1,500000m,9850000,1.5staff', 'points.csv')
  expect(Number.isFinite(result.rawPoints[0]?.easting)).toBe(false)
  expect(Number.isFinite(result.rawPoints[0]?.elevation)).toBe(false)
})

test('JobXML absent coordinates and height remain unknown', () => {
  const result = importTotalStation('<JOBFile><PointRecord><Name>P1</Name><Grid><North>9850000</North></Grid></PointRecord></JOBFile>', 'points.jxl')
  expect(result.rawPoints).toHaveLength(1)
  expect(result.rawPoints[0].easting).toBeUndefined()
  expect(result.rawPoints[0].elevation).toBeUndefined()
})

test('GSI coordinate adapter does not invent a height', () => {
  const result = importTotalStation('110001+00001000 81..00+01234567 82..00+09876543', 'points.gsi')
  expect(result.rawPoints).toHaveLength(1)
  expect(result.rawPoints[0].elevation).toBeUndefined()
})

test('LandXML international feet use the declared unit and absent height stays unknown', () => {
  const result = importTotalStation('<LandXML><Units><Imperial linearUnit="internationalFoot"/></Units><CgPoints><CgPoint name="P1">1000 2000</CgPoint></CgPoints></LandXML>', 'points.xml')
  expect(result.rawPoints[0].northing).toBeCloseTo(304.8, 8)
  expect(result.rawPoints[0].easting).toBeCloseTo(609.6, 8)
  expect(result.rawPoints[0].elevation).toBeUndefined()
})
test('CSV rejects ambiguous duplicate coordinate headers instead of choosing one silently',()=>{
  const result=importTotalStation('id,easting,x,northing\nP1,500000,600000,9850000','points.csv')
  expect(result.errors.join(' ')).toMatch(/ambiguous|duplicate/i)
})

