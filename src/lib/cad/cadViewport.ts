interface Size {width:number;height:number}
interface Point {x:number;y:number}
export const CAD_MIN_ZOOM=0.02,CAD_MAX_ZOOM=64
const scaleFor=(viewport:Size,sheet:Size)=>Math.min(viewport.width/sheet.width,viewport.height/sheet.height)
/** View state uses screen pixels. Model coordinates and the survey frame never change. */
export function cadViewport(viewport:Size,sheet:Size,zoom:number,pan:Point) {
  const scale=scaleFor(viewport,sheet)*zoom
  return {x:sheet.width/2-(viewport.width/2+pan.x)/scale,y:sheet.height/2-(viewport.height/2+pan.y)/scale,
    width:viewport.width/scale,height:viewport.height/scale,scale}
}
export function zoomCadAt(zoom:number,pan:Point,nextZoom:number,screen:Point,viewport:Size) {
  const next=Math.min(CAD_MAX_ZOOM,Math.max(CAD_MIN_ZOOM,nextZoom)),ratio=next/zoom
  return {zoom:next,pan:{x:pan.x*ratio-(screen.x-viewport.width/2)*(ratio-1),y:pan.y*ratio-(screen.y-viewport.height/2)*(ratio-1)}}
}
export function fitCadGeometry(viewport:Size,sheet:Size,points:readonly Point[]) {
  if(!points.length)return {zoom:1,pan:{x:0,y:0}}
  const xs=points.map(point=>point.x),ys=points.map(point=>point.y)
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys)
  const scale=Math.min(viewport.width/Math.max(100,maxX-minX+80),viewport.height/Math.max(100,maxY-minY+80))*0.9
  const zoom=Math.min(CAD_MAX_ZOOM,Math.max(CAD_MIN_ZOOM,scale/scaleFor(viewport,sheet))),actual=zoom*scaleFor(viewport,sheet)
  return {zoom,pan:{x:(sheet.width/2-(minX+maxX)/2)*actual,y:(sheet.height/2-(minY+maxY)/2)*actual}}
}
