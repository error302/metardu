import { rasterWorldFile } from '@/lib/surveyMapEngine/io/imageryGeoreference'
test('world file uses pixel centres, with correct order and north-up row sign',()=>{
 const values=rasterWorldFile([100.5,199.5],[101.5,199.5],[100.5,198.5]).split('\n').map(Number)
 expect(values).toEqual([1,0,0,-1,100.5,199.5])
 // Independent reconstruction of a lower-right pixel centre.
 const [a,d,b,e,c,f]=values
 expect([a*9+b*19+c,d*9+e*19+f]).toEqual([109.5,180.5])
})
test('rotated viewport exports keep the full affine, without pretending north-up',()=>{
 expect(rasterWorldFile([0,0],[0.6,-0.8],[-0.8,-0.6]).split('\n').map(Number)).toEqual([0.6,-0.8,-0.8,-0.6,0,0])
})
test('non-finite or singular georeferencing is rejected instead of writing an unusable file',()=>{
 expect(()=>rasterWorldFile([NaN,0],[1,0],[0,-1])).toThrow()
 expect(()=>rasterWorldFile([0,0],[1,0],[2,0])).toThrow()
})
