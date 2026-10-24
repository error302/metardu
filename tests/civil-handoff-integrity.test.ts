/** @jest-environment node */
import {exportCivil,exportLandXMLSurface,type CivilPoint} from '@/lib/export/civilHandoff'
const points:CivilPoint[]=[
  {name:'SYNTHETIC A',easting:500000,northing:9800000,elevation:0,is_control:false},
  {name:'SYNTHETIC B',easting:500010,northing:9800000,elevation:1,is_control:false},
  {name:'SYNTHETIC C',easting:500000,northing:9800010,elevation:2,is_control:false},
]
test('a live point list cannot pretend to be a retained surface revision',()=>{
  expect(()=>exportLandXMLSurface(points,'SYNTHETIC',37,'S','WGS84')).toThrow(/retained|revision/i)
})
test.each(['civil3d','12d','moss','pointcloud','shapefile_csv'] as const)('%s cannot export missing coordinates or height as zeros',format=>{
  for(const field of ['easting','northing','elevation']){
    const invalid=points.map((p,i)=>i===0?{...p,[field]:null}:p) as unknown as CivilPoint[]
    expect(()=>exportCivil(invalid,format,'SYNTHETIC',37,'S','WGS84')).toThrow(/missing|finite|height|coordinate/i)
  }
})
test('projected civil exports require the actual supported project grid',()=>{
  expect(()=>exportCivil(points,'civil3d','SYNTHETIC',37,'S','unknown')).toThrow(/CRS|grid/i)
})
test('unknown formats and record injection cannot create a different or spliced deliverable',()=>{
  expect(()=>exportCivil(points,'unknown' as never,'SYNTHETIC',37,'S','WGS84')).toThrow(/Unknown.*format/i)
  expect(()=>exportCivil(points,'civil3d','SYNTHETIC\n1,2,3,4,5',37,'S','WGS84')).toThrow(/record separators/i)
})
