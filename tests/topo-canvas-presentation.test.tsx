import {fireEvent, render, screen} from '@testing-library/react'
import {TopoEntityCanvas} from '@/components/drawing/TopoEntityCanvas'
import type {DrawingEntity} from '@/lib/drawing/topoEntities'

const mockShapes: Array<Record<string, unknown>> = []
jest.mock('konva', () => {
  class Node {
    constructor(public attrs: Record<string, unknown> = {}) { mockShapes.push(attrs) }
    add() {} draw() {} destroy() {} batchDraw() {} draggable() {}
    scale() {} position() {} scaleX() { return 1 } scaleY() { return 1 }
    x() { return 0 } y() { return 0 } width() { return 900 } height() { return 560 }
    getClientRect() { return {x:0,y:0,width:900,height:560} }
  }
  return {__esModule:true,default:{Stage:Node,Layer:Node,Group:Node,Line:Node,Text:Node,Circle:Node}}
})
const entities: DrawingEntity[] = [
  {kind:'polyline',layer:'CONTOURS',pts:[[0,0],[10,10]]},
  {kind:'polyline',layer:'CONTOUR_I',pts:[[0,1],[10,11]]},
  {kind:'text',layer:'POINT_LABELS',e:1,n:1,height:1,text:'P1 100.000'},
  {kind:'line',layer:'PLAN_LEADERS',x1:0,y1:0,x2:1,y2:1},
  {kind:'text',layer:'TITLE_BLOCK',e:1,n:0,height:1,text:'Retained reference'},
]
const props = {entities,layers:[{name:'TITLE_BLOCK',colorHex:'#ffffff',lineTypeName:'CONTINUOUS'}],extents:{minX:0,maxX:20,minY:0,maxY:20}}
beforeEach(()=>{mockShapes.length=0})
test('paper preview gives white CAD annotations dark contrast and index contours greater visual weight',()=>{
  render(<TopoEntityCanvas {...props} initialPaperView />)
  expect(screen.getByRole('checkbox',{name:'Paper view'})).toBeChecked()
  expect(mockShapes.find(shape=>shape.text==='Retained reference')?.fill).toBe('#25313d')
  expect(mockShapes.find(shape=>shape.stroke==='#70411e')?.strokeWidth).toBeGreaterThan(Number(mockShapes.find(shape=>shape.stroke==='#97704a')?.strokeWidth))
})
test('preview visibility is reversible, retains the reference block and never mutates exported entities',()=>{
  const original=JSON.stringify(entities)
  render(<TopoEntityCanvas {...props} initialPaperView />)
  mockShapes.length=0
  fireEvent.click(screen.getByRole('checkbox',{name:'Point labels'}))
  expect(mockShapes.some(shape=>shape.text==='P1 100.000')).toBe(false)
  expect(mockShapes.some(shape=>shape.text==='Retained reference')).toBe(true)
  mockShapes.length=0
  fireEvent.click(screen.getByRole('checkbox',{name:'Point labels'}))
  expect(mockShapes.some(shape=>shape.text==='P1 100.000')).toBe(true)
  fireEvent.click(screen.getByRole('checkbox',{name:'Paper view'}))
  expect(mockShapes.findLast(shape=>shape.text==='Retained reference')?.fill).toBe('#ffffff')
  expect(JSON.stringify(entities)).toBe(original)
})
