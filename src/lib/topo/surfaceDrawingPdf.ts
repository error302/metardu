/** Vector output of the exact saved plan; no resampling or new terrain geometry. */
import PDFDocument from 'pdfkit'
import path from 'node:path'
import {buildSurfaceRevisionDrawing} from './surfaceDrawing'
const PT_PER_MM = 72 / 25.4
const PAPER: Record<string, [number, number]> = { 'A4 landscape':[297,210], 'A3 landscape':[420,297], 'A2 landscape':[594,420], 'A1 landscape':[841,594], 'A0 landscape':[1189,841] }
const COLORS: Record<string,string> = { CONTOURS:'#97704a',CONTOUR_I:'#70411e',GRID:'#adb8c2',PLAN_LEADERS:'#78828a',SURVEY_BREAKLINES_3D:'#1c6778',TERRAIN_EXCLUSIONS:'#a13636' }
export async function renderSurfaceDrawingPdf(drawing: ReturnType<typeof buildSurfaceRevisionDrawing>): Promise<Buffer> {
  const paper=PAPER[drawing.layout.paper], scale=drawing.layout.nominalScale
  if(!paper || !Number.isFinite(scale) || scale<=0)throw new Error('The saved drawing has no valid print scale or paper size.')
  const factor=1000/scale*PT_PER_MM
  const {extents}=drawing
  if(!Object.values(extents).every(Number.isFinite) || extents.maxX<=extents.minX || extents.maxY<=extents.minY || (extents.maxX-extents.minX)*factor>(paper[0]-20)*PT_PER_MM+1e-6 || (extents.maxY-extents.minY)*factor>(paper[1]-20)*PT_PER_MM+1e-6)throw new Error('The complete saved plan does not fit the selected paper at its recorded scale.')
  const within = (e:number,n:number) => Number.isFinite(e) && Number.isFinite(n) && e>=extents.minX-1e-8 && e<=extents.maxX+1e-8 && n>=extents.minY-1e-8 && n<=extents.maxY+1e-8
  for(const entity of drawing.entities){
    const coordinates = entity.kind==='point'||entity.kind==='text'?[[entity.e,entity.n]]:entity.kind==='line'?[[entity.x1,entity.y1],[entity.x2,entity.y2]]:entity.pts
    if(coordinates.some(point=>!within(point[0],point[1])))throw new Error('A saved plan entity lies outside the sheet or has invalid coordinates. No plan was registered.')
  }
  const doc=new PDFDocument({size:paper.map(mm=>mm*PT_PER_MM),margin:0,bufferPages:true,info:{Title:'Topographic survey - computed draft',Creator:'METARDU retained surface plan',Subject:'Print at 100% actual size. Review and field acceptance required.'}})
  const chunks:Buffer[]=[]
  const output=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(chunk:Buffer)=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)})
  // The repository font is embedded for portable text, including non-ASCII project names.
  doc.font(path.join(process.cwd(),'public','fonts','JetBrainsMono-Regular.ttf'))
  // PDFKit exposes its embedded font through this adapter. Refuse to issue
  // an unreadable plan if the installed PDFKit/font implementation changes.
  const embedded = (doc as unknown as { _font?: { font?: { hasGlyphForCodePoint?: (code:number)=>boolean } } })._font?.font
  if (typeof embedded?.hasGlyphForCodePoint !== 'function') throw new Error('The PDF font could not be checked. No plan was registered.')
  for (const entity of drawing.entities) if (entity.kind === 'text') for (const char of entity.text) {
    const code=char.codePointAt(0)
    if (code === undefined || !embedded.hasGlyphForCodePoint(code)) throw new Error('A recorded plan label contains characters unsupported by the PDF font. Use a compatible font before exporting; the saved source is unchanged.')
  }
  // Balance unused sheet space without changing recorded scale or model coordinates.
  const left=(paper[0]*PT_PER_MM-(extents.maxX-extents.minX)*factor)/2
  const top=(paper[1]*PT_PER_MM-(extents.maxY-extents.minY)*factor)/2
  const x=(e:number)=>left+(e-extents.minX)*factor,y=(n:number)=>top+(extents.maxY-n)*factor
  for(const entity of drawing.entities){
    const color=COLORS[entity.layer]??'#25313d'
    doc.save().strokeColor(color).fillColor(color).lineWidth((entity.layer==='CONTOUR_I'?.35:entity.layer==='CONTOURS'?.15:entity.layer==='GRID'?.08:.18)*PT_PER_MM)
    if(entity.kind==='text'){
      const size=entity.height*factor
      if(!Number.isFinite(size)||size<=0)throw new Error('The saved plan contains an invalid annotation.')
      doc.fontSize(size)
      // Baseline rotation matches the world-coordinate DXF entity; never reflow an annotation.
      doc.rotate(-(entity.rotation??0),{origin:[x(entity.e),y(entity.n)]}).text(entity.text,x(entity.e),y(entity.n),{lineBreak:false,baseline:'alphabetic'})
    }else if(entity.kind==='point')doc.circle(x(entity.e),y(entity.n),.45*PT_PER_MM).fill()
    else if(entity.kind==='line')doc.moveTo(x(entity.x1),y(entity.y1)).lineTo(x(entity.x2),y(entity.y2)).stroke()
    else if(entity.pts.length){doc.moveTo(x(entity.pts[0][0]),y(entity.pts[0][1]));for(const point of entity.pts.slice(1))doc.lineTo(x(point[0]),y(point[1]));if(entity.kind==='polyline'&&entity.closed)doc.closePath();doc.stroke()}
    doc.restore()
  }
  if(doc.bufferedPageRange().count!==1)throw new Error('The saved plan unexpectedly overflowed its single sheet.')
  doc.end()
  return output
}
