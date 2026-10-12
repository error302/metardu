/** @jest-environment node */
import {prepareCadastralInput} from '@/lib/survey/cadastralInput'
import {fieldToFinish} from '@/lib/survey/field-to-finish'
test('a geometrically closed crossing boundary is rejected',async()=>{
 const vertices=[[0,0],[100,100],[0,100],[100,0]]
 const rows=vertices.map(([e,n],i)=>{const next=vertices[(i+1)%4];return {station:`P${i}`,raw_data:{target:`P${(i+1)%4}`,bearing:(Math.atan2(next[0]-e,next[1]-n)*180/Math.PI+360)%360,distance:Math.hypot(next[0]-e,next[1]-n),distanceType:'grid'}}})
 const input=prepareCadastralInput({boundary_data:{startControl:{name:'P0',easting:500000,northing:9900000}}},rows,[])
 const result=await fieldToFinish(input)
 expect(result.status).toBe('failed')
 expect(result.errors.join(' ')).toMatch(/boundary|cross|area/i)
})
