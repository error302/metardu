const fixtureCrs21037 = 'EPSG:21037'
const fixtureCrs32737 = 'EPSG:32737'
import { assertControlImportReference, publicControlSchema } from '@/lib/survey/publicControl'
const submission = {name:'SYN-CTRL',beaconType:'control',easting:500000.01234,northing:9800000.05678,elevation:0,horizontalCrs:'EPSG:21037',verticalDatum:'Synthetic BM',sourceReference:'Synthetic catalogue sheet only',authority:'Synthetic reference publisher',country:'Kenya'}
test('published zero and unknown heights retain distinct evidence',()=>{
 expect(publicControlSchema.parse(submission).elevation).toBe(0)
 expect(publicControlSchema.parse({...submission,elevation:null,verticalDatum:null}).elevation).toBeNull()
 expect(publicControlSchema.safeParse({...submission,verticalDatum:null}).success).toBe(false)
})
test('catalogue submissions cannot infer grids or self-assert a review',()=>{
 for(const change of [{horizontalCrs:''},{horizontalCrs:'EPSG:3857'},{easting:Infinity},{northing:NaN},{status:'verified'},{verifiedBy:'someone'},{sourceReference:''}])expect(publicControlSchema.safeParse({...submission,...change}).success).toBe(false)
})
test('control import requires an actual declaration and matching height/grid references',()=>{
 const source={horizontal_crs:fixtureCrs21037,elevation:0,vertical_datum:'Synthetic BM'}
 const project={code:fixtureCrs21037,source:'declared',verticalDatum:'Synthetic BM'}
 expect(()=>assertControlImportReference(source,project)).not.toThrow()
 for(const change of [{source:'legacy'},{code:null},{code:fixtureCrs32737},{verticalDatum:null},{verticalDatum:'Other BM'}])expect(()=>assertControlImportReference(source,{...project,...change})).toThrow()
 expect(()=>assertControlImportReference({...source,elevation:null,vertical_datum:null},{...project,verticalDatum:null})).not.toThrow()
})
