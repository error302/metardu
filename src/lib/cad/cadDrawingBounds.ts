import type {CADDocument} from '@/components/cad-editor/CADEditor'

/** Include off-sheet model geometry in vector exports, independently of the camera. */
export function cadDrawingBounds(doc:CADDocument) {
  const points=[{x:0,y:0},{x:doc.width,y:doc.height}]
  for(const point of doc.beacons)points.push({x:point.x-24,y:point.y-24},{x:point.x+Math.max(32,point.label.length*9),y:point.y+28})
  for(const annotation of doc.annotations){
    points.push({x:annotation.x-24,y:annotation.y-(annotation.fontSize??10)-24})
    points.push({x:annotation.x+(annotation.type==='text'?(annotation.text?.length??0)*(annotation.fontSize??10):0)+24,y:annotation.y+24})
    if(annotation.x2!==undefined&&annotation.y2!==undefined)points.push({x:annotation.x2-24,y:annotation.y2-24},{x:annotation.x2+24,y:annotation.y2+24})
  }
  points.push({x:doc.northArrow.x-48,y:doc.northArrow.y-48},{x:doc.northArrow.x+48,y:doc.northArrow.y+48})
  if(doc.metersPerPixel&&doc.scaleBar.scaleMeters>0)points.push({x:doc.scaleBar.x-24,y:doc.scaleBar.y-24},{x:doc.scaleBar.x+doc.scaleBar.scaleMeters/doc.metersPerPixel+24,y:doc.scaleBar.y+24})
  if(doc.backgroundImage?.visible){
    const image=doc.backgroundImage,cx=image.x+image.width/2,cy=image.y+image.height/2,angle=image.rotation*Math.PI/180
    for(const x of [-image.width/2,image.width/2])for(const y of [-image.height/2,image.height/2])points.push({x:cx+x*Math.cos(angle)-y*Math.sin(angle),y:cy+x*Math.sin(angle)+y*Math.cos(angle)})
  }
  let x=0,y=0,right=doc.width,bottom=doc.height
  for(const point of points){x=Math.min(x,point.x);y=Math.min(y,point.y);right=Math.max(right,point.x);bottom=Math.max(bottom,point.y)}
  if(![x,y,right,bottom,right-x,bottom-y].every(Number.isFinite))throw new RangeError('The drawing extent is too large to export safely.')
  return {x,y,width:right-x,height:bottom-y}
}
