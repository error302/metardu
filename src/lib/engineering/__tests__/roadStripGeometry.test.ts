/** @jest-environment node */
import {roadWorkbenchExample} from '../roadWorkbenchExample'
import {buildRoadHorizontalGeometry,roadHorizontalSegmentStation,roadHorizontalStation} from '../roadCoordinateSetout'
import {roadStripEnclosure} from '../roadStripGeometry'
import {terrainOrientation} from '@/lib/topo/terrainDomainValidation'
function fixture(transition:boolean,reflection:number) {
  const {road,reference}=roadWorkbenchExample()
  const ips=road.ips.map((p,i)=>({...p,northing:9500000+reflection*(p.northing-9500000),...(i===1?{hasTransition:transition,transitionLengthIn:transition?10:undefined,transitionLengthOut:transition?10:undefined}:{})}))
  const result=buildRoadHorizontalGeometry(ips,road.startChainage,reference.code)
  if(!result.alignment)throw Error(result.issues.join(' '))
  return result.alignment
}
it.each([[false,-1],[false,1],[true,-1],[true,1]] as const)('encloses offset endpoints and interiors for transition=%s reflection=%s',(transition,reflection)=>{
  const alignment=fixture(transition,reflection)
  for(const segment of alignment.segments)for(const [from,to] of [[0,1],[0,.25],[.15,.85],[.99,1]]){
    const start=segment.start+from*(segment.end-segment.start),end=segment.start+to*(segment.end-segment.start)
    const enclosure=roadStripEnclosure(segment,start,end,20)
    for(let i=0;i<=100;i++){
      const position=roadHorizontalSegmentStation(segment,i===100?end:start+(end-start)*i/100)
      if(!position)throw Error('The enclosure fixture left its segment.')
      const angle=position.bearing*Math.PI/180
      for(const offset of [-20,0,20]){
        const point={x:position.easting+offset*Math.cos(angle),y:position.northing-offset*Math.sin(angle)}
        expect(enclosure.rectangle.every((a,j,list)=>terrainOrientation(a,list[(j+1)%4],point)<=0)).toBe(true)
      }
    }
  }
})
it('retains ordinary global station values while allowing explicit segment endpoint evaluation',()=>{
  const alignment=fixture(true,1)
  for(const segment of alignment.segments){
    const middle=(segment.start+segment.end)/2
    expect(roadHorizontalSegmentStation(segment,middle)).toEqual(roadHorizontalStation(alignment,middle))
    expect(roadHorizontalSegmentStation(segment,segment.start)).not.toBeNull()
    expect(roadHorizontalSegmentStation(segment,segment.end)).not.toBeNull()
    expect(roadHorizontalSegmentStation(segment,segment.start-1)).toBeNull()
  }
  expect(roadHorizontalStation({start:0,end:1,segments:[]},0)).toBeNull()
})
it('refuses invalid intervals and widths instead of producing an empty enclosure',()=>{
  const s=fixture(false,1).segments[0]
  for(const width of [0,-1,NaN,Infinity,501])expect(()=>roadStripEnclosure(s,s.start,s.end,width)).toThrow()
  expect(()=>roadStripEnclosure(s,s.start,s.start,20)).toThrow()
  expect(()=>roadStripEnclosure(s,s.start-1,s.end,20)).toThrow()
})
