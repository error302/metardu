/** @jest-environment node */
import {inflateSync} from 'node:zlib'
import {buildSurfaceRevisionDrawing} from '../surfaceDrawing'
import {renderSurfaceDrawingPdf} from '../surfaceDrawingPdf'
const points=[{id:'a',pointName:'P1',x:500000,y:9850000,z:100,code:'SH'},{id:'b',pointName:'P2',x:500100,y:9850000,z:101,code:'SH'},{id:'c',pointName:'P3',x:500000,y:9850100,z:102,code:'SH'}]
const syntheticCrs='EPSG:21037'
const drawing=()=>buildSurfaceRevisionDrawing({name:'Synthetic site',revision:1,revisionId:'synthetic-revision',inputHash:'a'.repeat(64),crs:syntheticCrs,verticalDatum:'Local benchmark',contours:[{elevation:101,isIndex:false,coordinates:[[[500100,9850000],[500000,9850050]]]}],parameters:{interval:1},snapshot:{observations:points}})
test('generates a single vector PDF from a retained plan with its measured contour and draft reference',async()=>{
 const input=drawing(),bytes=await renderSurfaceDrawingPdf(input)
 expect(bytes.subarray(0,5).toString()).toBe('%PDF-')
 expect(bytes.toString('latin1')).toMatch(/\/Count 1\b/)
 expect(input.entities.some(e=>e.kind==='polyline'&&e.layer==='CONTOURS')).toBe(true)
 expect(input.entities.some(e=>e.kind==='text'&&e.text.includes('COMPUTED DRAFT'))).toBe(true)
})
test('refuses an impossible scale instead of silently shrinking the plan',async()=>{
 const input=drawing();input.layout.nominalScale=1
 await expect(renderSurfaceDrawingPdf(input)).rejects.toThrow(/fit.*paper/i)
})

test('PDF vector line preserves an independently measured 1:100 scale',async()=>{
 const input=drawing();input.layout.nominalScale=100;input.layout.paper='A0 landscape'
 input.extents={minX:0,minY:0,maxX:20,maxY:20}
 input.entities=[{kind:'line',layer:'CONTOURS',x1:1,y1:1,x2:11,y2:1}]
 const bytes=await renderSurfaceDrawingPdf(input),binary=bytes.toString('latin1')
 const streams=[...binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(match=>{try{return [inflateSync(Buffer.from(match[1],'latin1')).toString('latin1')]}catch{return []}})
 const line=streams.join('\n').match(/([\d.]+)\s+([\d.]+)\s+m\s+([\d.]+)\s+([\d.]+)\s+l/)
 expect(line).not.toBeNull()
 if(!line)throw new Error('Vector line was not found in the PDF content stream')
 expect(Number(line[3])-Number(line[1])).toBeCloseTo(100*72/25.4,3)
 expect(Number(line[4])).toBeCloseTo(Number(line[2]),5)
})

test('refuses unsupported international characters rather than silently dropping them',async()=>{
 const input=drawing();input.entities.push({kind:'text',layer:'TITLE_BLOCK',e:input.extents.minX,n:input.extents.minY,height:1,text:'Survey 中'})
 await expect(renderSurfaceDrawingPdf(input)).rejects.toThrow(/unsupported by the PDF font/)
})

test('refuses an entity outside the saved sheet rather than silently clipping it',async()=>{
 const input=drawing();input.entities.push({kind:'point',layer:'GROUND',e:input.extents.maxX+10,n:input.extents.maxY})
 await expect(renderSurfaceDrawingPdf(input)).rejects.toThrow(/outside the sheet/)
})


test('centres the complete retained plan on its recorded sheet without changing scale',async()=>{
 const input=drawing();input.layout.nominalScale=1000;input.layout.paper='A2 landscape'
 input.extents={minX:100,minY:200,maxX:110,maxY:220}
 input.entities=[{kind:'line',layer:'BORDER',x1:100,y1:200,x2:110,y2:220}]
 const bytes=await renderSurfaceDrawingPdf(input),binary=bytes.toString('latin1')
 const streams=[...binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(match=>{try{return [inflateSync(Buffer.from(match[1],'latin1')).toString('latin1')]}catch{return []}})
 const line=streams.join('\n').match(/([\d.]+)\s+([\d.]+)\s+m\s+([\d.]+)\s+([\d.]+)\s+l/)
 if(!line)throw new Error('Retained plan line was not found in the PDF')
 // A 10 m x 20 m extent at 1:1000 is exactly 10 x 20 mm.
 // Centred on 594 x 420 mm A2: x 292..302 mm, screen y 220..200 mm.
 expect(Number(line[1])).toBeCloseTo(292*72/25.4,3)
 expect(Number(line[2])).toBeCloseTo(220*72/25.4,3)
 expect(Number(line[3])).toBeCloseTo(302*72/25.4,3)
 expect(Number(line[4])).toBeCloseTo(200*72/25.4,3)
})
