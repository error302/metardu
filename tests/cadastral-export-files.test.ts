/** @jest-environment node */
import { requiredValue } from '@/test-utils/requiredValue'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import db from '@/lib/db'
import {generateBoundaryShapefile} from '@/lib/generators/boundaryShapefile'
import {generateCoordinateSchedule} from '@/lib/generators/coordinateSchedule'
jest.mock('@/lib/db',()=>({__esModule:true,default:{query:jest.fn()}}))
jest.mock('@/lib/generators/deedPlanGeometry',()=>({computeDeedPlanGeometry:async()=>({areaM2:8000,stations:[
 {station:'A1',easting:500000,northing:9900000},{station:'A2',easting:500000,northing:9900080},
 {station:'A10',easting:500100,northing:9900080},{station:'A3',easting:500100,northing:9900000}]})}))
beforeEach(()=>{(db.query as jest.Mock).mockResolvedValue({rows:[{name:'Fictional',survey_type:'cadastral',utm_zone:37,hemisphere:'S',datum:'ARC1960'}]})})
test('shapefile ZIP contains a readable closed polygon with the declared Arc 1960 CRS',async()=>{
 const zip=await JSZip.loadAsync(await generateBoundaryShapefile('qa'))
 expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['Boundary.shp','Boundary.shx','Boundary.dbf','Boundary.prj']))
 const shp=await requiredValue(zip.file('Boundary.shp')).async('nodebuffer')
 expect(shp.readInt32BE(0)).toBe(9994)
 expect(shp.readInt32BE(24)*2).toBe(shp.length)
 expect(shp.readInt32LE(108)).toBe(5)
 expect(shp.readInt32LE(144)).toBe(1)
 expect(shp.readInt32LE(148)).toBe(5)
 const points=Array.from({length:5},(_,i)=>[shp.readDoubleLE(156+i*16),shp.readDoubleLE(164+i*16)])
 expect(points[4]).toEqual(points[0])
 const area=points.slice(0,4).reduce((sum,p,i)=>sum+p[0]*points[i+1][1]-points[i+1][0]*p[1],0)/2
 expect(area).toBe(-8000)
 expect(await requiredValue(zip.file('Boundary.prj')).async('string')).toContain('"EPSG","21037"')
 expect((await requiredValue(zip.file('Boundary.dbf')).async('nodebuffer')).readUInt32LE(4)).toBe(1)
})
test('coordinate workbook contains computed stations in boundary order and leaves unknown heights blank',async()=>{
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(new Uint8Array(await generateCoordinateSchedule('qa')).buffer)
 const sheet=requiredValue(wb.getWorksheet('Coordinate Schedule'))
 expect([4,5,6,7].map(row=>sheet.getCell(row,1).value)).toEqual(['A1','A2','A10','A3'])
 expect(sheet.getCell(6,2).value).toBe(500100)
 expect(sheet.getCell(6,3).value).toBe(9900080)
 expect(sheet.getCell(6,4).value).toBe('')
})
test('shapefile export refuses an unknown datum',async()=>{
 ;(db.query as jest.Mock).mockResolvedValue({rows:[{name:'Fictional',utm_zone:37,hemisphere:'S',datum:null}]})
 await expect(generateBoundaryShapefile('qa')).rejects.toThrow(/datum/)
})
