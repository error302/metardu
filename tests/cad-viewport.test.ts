import {cadViewport,fitCadGeometry,zoomCadAt} from '@/lib/cad/cadViewport'

test('camera fills the physical viewport without moving model coordinates or clipping to a paper rectangle',()=>{
  const view=cadViewport({width:400,height:800},{width:1122,height:794},1,{x:0,y:0})
  expect(view.width/view.height).toBeCloseTo(0.5,10)
  expect(view.y).toBeLessThan(0)
  expect(view.x+view.width/2).toBeCloseTo(561,10)
  const panned=cadViewport({width:400,height:800},{width:1122,height:794},1,{x:400,y:800})
  expect(panned.x).toBeLessThan(-500)
})
test('wheel zoom keeps the pointed model position fixed in screen pixels',()=>{
  const viewport={width:1200,height:700},sheet={width:1122,height:794},pan={x:100,y:-50},before=cadViewport(viewport,sheet,1,pan)
  const screen={x:900,y:300},world={x:before.x+screen.x/before.scale,y:before.y+screen.y/before.scale}
  const next=zoomCadAt(1,pan,2,screen,viewport),after=cadViewport(viewport,sheet,next.zoom,next.pan)
  expect((world.x-after.x)*after.scale).toBeCloseTo(screen.x,10)
  expect((world.y-after.y)*after.scale).toBeCloseTo(screen.y,10)
})
test('fit includes geometry beyond the old page and respects a narrow phone viewport',()=>{
  const viewport={width:390,height:500},sheet={width:1122,height:794},points=[{x:-1000,y:-2000},{x:3000,y:4000}]
  const camera=fitCadGeometry(viewport,sheet,points),view=cadViewport(viewport,sheet,camera.zoom,camera.pan)
  for(const point of points){expect(point.x).toBeGreaterThan(view.x);expect(point.x).toBeLessThan(view.x+view.width);expect(point.y).toBeGreaterThan(view.y);expect(point.y).toBeLessThan(view.y+view.height)}
})
