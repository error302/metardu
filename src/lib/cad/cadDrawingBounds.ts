import { cadDraftBoundsPoints } from './cadDraftGeometry'
import type { CADBackgroundImage, CADDocument } from '@/components/cad-editor/CADEditor'

export function cadRasterCorners(image: CADBackgroundImage) {
  const centerX = image.x + image.width / 2
  const centerY = image.y + image.height / 2
  const angle = image.rotation * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return [-image.width / 2, image.width / 2].flatMap(x =>
    [-image.height / 2, image.height / 2].map(y => ({ x: centerX + x * cos - y * sin, y: centerY + x * sin + y * cos })))
}

/** Include off-sheet model geometry in vector exports, independently of the camera. */
export function cadDrawingBounds(doc:CADDocument) {
  const points=[{x:0,y:0},{x:doc.width,y:doc.height}]
  for(const point of doc.beacons)points.push({x:point.x-24,y:point.y-24},{x:point.x+Math.max(32,point.label.length*9),y:point.y+28})
  for(const annotation of doc.annotations){
    points.push({x:annotation.x-24,y:annotation.y-(annotation.fontSize??10)-24})
    points.push({x:annotation.x+(annotation.type==='text'?(annotation.text?.length??0)*(annotation.fontSize??10):0)+24,y:annotation.y+24})
    for (const end of cadDraftBoundsPoints(annotation)) points.push({x:end.x-24,y:end.y-24},{x:end.x+24,y:end.y+24})
  }
  points.push({x:doc.northArrow.x-48,y:doc.northArrow.y-48},{x:doc.northArrow.x+48,y:doc.northArrow.y+48})
  if(doc.metersPerPixel&&doc.scaleBar.scaleMeters>0)points.push({x:doc.scaleBar.x-24,y:doc.scaleBar.y-24},{x:doc.scaleBar.x+doc.scaleBar.scaleMeters/doc.metersPerPixel+24,y:doc.scaleBar.y+24})
  if (doc.backgroundImage?.visible) points.push(...cadRasterCorners(doc.backgroundImage))
  let x=0,y=0,right=doc.width,bottom=doc.height
  for(const point of points){x=Math.min(x,point.x);y=Math.min(y,point.y);right=Math.max(right,point.x);bottom=Math.max(bottom,point.y)}
  if(![x,y,right,bottom,right-x,bottom-y].every(Number.isFinite))throw new RangeError('The drawing extent is too large to export safely.')
  return {x,y,width:right-x,height:bottom-y}
}
