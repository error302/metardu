import { generatePileGrid, computeSettingOut, formatBearingDMS, parsePileGridCSV, pileGridToCSV, generatePileGridDXF } from '../pileGrid'
import type { PileGridDefinition } from '../pileGrid'
import { parseDXFFileContent } from '@/lib/parsers/parseDXF'
import Papa from 'papaparse'
import { extractDesignPointsFromDXF } from '@/lib/survey/dxfDesignExtractor'

const grid: PileGridDefinition = { name:'Synthetic fixture', originEasting:500000.12345678, originNorthing:9800000.87654321, originRL:100,
  rows:2, columns:2, rowSpacing:5, columnSpacing:6, rotation:90, startLabel:'A1', labelRowsAs:'alpha', labelColumnsAs:'numeric', pileType:'pile', coordinateSystem:'EPSG:32737' }

it('retains clockwise geometry and rejects generated overflow', () => {
  const result = generatePileGrid(grid)
  expect(result.piles[1].northing).toBeCloseTo(grid.originNorthing - 6, 9)
  expect(result.piles[2].easting).toBeCloseTo(grid.originEasting + 5, 9)
  expect(() => generatePileGrid({...grid, rowSpacing:1e308, rows:4})).toThrow(/finite|range|overflow/i)
  expect(() => generatePileGrid({...grid,rotation:0,originEasting:1e20,columnSpacing:0.1})).toThrow(/precision|distinct/i)
})
it('keeps every grid label unique and refuses an ambiguous or zero starting label', () => {
  const result = generatePileGrid({...grid,rows:12,columns:12,labelRowsAs:'numeric',startLabel:'1-1'})
  expect(result.piles[0].label).toBe('1-1')
  expect(new Set(result.piles.map(p=>p.label)).size).toBe(144)
  expect(() => generatePileGrid({...grid,startLabel:'A0'})).toThrow(/label/i)
  expect(() => generatePileGrid({...grid,startLabel:'unapproved'})).toThrow(/label/i)
  expect(generatePileGrid({...grid,startLabel:'A007'}).piles.slice(0,2).map(p=>p.label)).toEqual(['A007','A008'])
})
it('separates a signed ground offset from a level staff reading and explicit prism geometry', () => {
  const piles = generatePileGrid({...grid,rotation:0,rows:1,columns:1}).piles
  const [row] = computeSettingOut(piles, grid.originEasting-3,grid.originNorthing-4,101,1.5,{backsight:{easting:grid.originEasting-3,northing:grid.originNorthing+6},prismHeight:2})
  expect(row.horizontalDistance).toBe(5)
  expect(row.targetHeight).toBe(-2.5)
  expect(row.staffReading).toBe(2.5)
  expect(row.horizontalAngleDeg).toBeCloseTo(36.869897645844,10)
  expect(row.prismVerticalDifference).toBe(-0.5)
  expect(row.slopeDistance).toBeCloseTo(Math.sqrt(25.25),12)
  expect(row.verticalAngleDeg).toBeCloseTo(Math.atan2(-0.5,5)*180/Math.PI,12)
})
it('keeps missing heights and co-located bearings unknown, without inventing north', () => {
  const piles = generatePileGrid({...grid,rows:1,columns:1,originRL:null}).piles
  const [row] = computeSettingOut(piles,grid.originEasting,grid.originNorthing,null,null)
  expect(row.horizontalDistance).toBe(0)
  expect(row.bearingDeg).toBeNull()
  expect(row.staffReading).toBeNull()
  expect(row.slopeDistance).toBeNull()
  expect(row.horizontalAngleDeg).toBeNull()
})
it('rejects incomplete/invalid orientation, heights and duplicated targets atomically', () => {
  const piles = generatePileGrid(grid).piles
  expect(() => computeSettingOut(piles,0,0,100,-1)).toThrow(/height/i)
  expect(() => computeSettingOut(piles,0,0,100,null)).toThrow(/together|height/i)
  expect(() => computeSettingOut(piles,0,0,100,1,{backsight:{easting:0,northing:0}})).toThrow(/backsight/i)
  expect(() => computeSettingOut([piles[0],piles[0]],0,0,100,1)).toThrow(/unique|duplicate/i)
  expect(() => computeSettingOut(piles,Infinity,0,100,1)).toThrow(/finite/i)
})
it('carries rounded seconds into minutes/degrees and wraps the north bearing', () => {
  expect(formatBearingDMS(12+59/60+59.99/3600)).toBe('13°00\'00.0"')
  expect(formatBearingDMS(359+59/60+59.99/3600)).toBe('0°00\'00.0"')
  expect(() => formatBearingDMS(NaN)).toThrow(/finite/i)
})
it('imports complete decimals and rejects duplicate, malformed and unsupported parameters', () => {
  expect(parsePileGridCSV('Parameter,Value\nOrigin E,0\nOrigin RL,\nRows,2')).toMatchObject({originEasting:0,originRL:null,rows:2})
  expect(() => parsePileGridCSV('Rows,2.5')).toThrow(/whole|Rows/i)
  expect(() => parsePileGridCSV('Origin E,2m')).toThrow(/decimal|finite/i)
  expect(() => parsePileGridCSV('Rows,2\nRows,3')).toThrow(/duplicate/i)
  expect(() => parsePileGridCSV('Label Rows As,wrong')).toThrow(/format|alpha|numeric/i)
})
it('retains exact coordinate precision and declared references in draft CSV', () => {
  const csv = pileGridToCSV(generatePileGrid(grid))
  const rows = Papa.parse<Record<string,string>>(csv,{header:true}).data
  expect(Number(rows[0].Easting)).toBe(grid.originEasting)
  expect(rows[0].Declared_CRS).toBe(grid.coordinateSystem)
  expect(rows[0].Issue_status).toBe('DRAFT')
})
it('round-trips metre DXF points with exact XYZ and explicit height reference', async () => {
  const result = generatePileGrid(grid)
  const text = generatePileGridDXF(result,'Synthetic BM')
  const parsed = await parseDXFFileContent(text,'pile.dxf')
  expect(parsed.errors).toEqual([])
  expect(parsed.cad?.units).toBe('meters')
  const points = parsed.cad?.entities.filter(e=>e.layer==='SETOUT_POINTS') ?? []
  expect(points).toHaveLength(4)
  expect(points[0].coordinates[0]).toMatchObject({easting:grid.originEasting,northing:grid.originNorthing,elevation:100})
  expect(text).toContain('Synthetic BM')
  expect(text).toContain('DRAFT')
  const targets=extractDesignPointsFromDXF(text,{layerFilter:['SETOUT_POINTS'],defaultTH:2})
  expect(targets.points).toHaveLength(4)
  expect(targets.points[0]).toMatchObject({e:grid.originEasting,n:grid.originNorthing,rl:100,th:2})
  expect(() => generatePileGridDXF({...result,piles:result.piles.map(p=>({...p,easting:p.easting+1}))},'Synthetic BM')).toThrow(/stale|current/i)
})
it('keeps unreferenced plan Z absent so another METARDU tool cannot read it as RL zero',async()=>{
  const parsed=await parseDXFFileContent(generatePileGridDXF(generatePileGrid(grid)),'plan.dxf')
  const point=parsed.cad?.entities.find(e=>e.layer==='SETOUT_POINTS')
  expect(point?.coordinates[0].elevation).toBeUndefined()
  expect(extractDesignPointsFromDXF(generatePileGridDXF(generatePileGrid(grid)),{layerFilter:['SETOUT_POINTS'],defaultTH:2}).points).toEqual([])
})
