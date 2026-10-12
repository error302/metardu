import { createImageryMap, type ImageryMapStatus, type ImageryMapConfiguration } from '@/lib/map/imageryViewerMap'
import { TileSourceEvent } from 'ol/source/Tile'
import type XYZ from 'ol/source/XYZ'
import type View from 'ol/View'
import type TileLayer from 'ol/layer/Tile'

type MapOptions = {target:HTMLElement;view:View;layers:TileLayer<XYZ>[]}
class MockMap {
  static current:MockMap
  handlers=new Map<string,()=>void>()
  disposed=false
  constructor(readonly options:MapOptions){MockMap.current=this}
  getView(){return this.options.view}getSize(){return [512,512]}
  getViewport(){return this.options.target}updateSize(){}setTarget(){}
  resolution(){const resolution=this.getView().getResolution();if(resolution==null)throw new Error('Test view resolution missing');return resolution}
  getCoordinateFromPixel(pixel:number[]){const extent=this.getView().calculateExtent([512,512]),resolution=this.resolution();return[extent[0]+pixel[0]*resolution,extent[3]-pixel[1]*resolution]}
  on(type:string,callback:()=>void){this.handlers.set(type,callback)}un(type:string){this.handlers.delete(type)}renderSync(){this.handlers.get('rendercomplete')?.()}dispose(){this.disposed=true}
  source(){const source=this.options.layers[0].getSource();if(!source)throw new Error('Test source missing');return source}
  tiles(){const source=this.source(),grid=source.getTileGrid();if(!grid)throw new Error('Test grid missing');const z=grid.getZForResolution(this.resolution()),range=grid.getTileRangeForExtentAndZ(this.getView().calculateExtent([512,512]),z),tiles=[];for(let x=range.minX;x<=range.maxX;x++)for(let y=range.minY;y<=range.maxY;y++)tiles.push(source.getTile(z,x,y,1,this.getView().getProjection()));return tiles}
}
jest.mock('ol/Map',()=>({__esModule:true,default:MockMap}))
jest.mock('ol/control/Attribution',()=>({__esModule:true,default:class{}}))
jest.mock('ol/control/Zoom',()=>({__esModule:true,default:class{}}))
const configuration:ImageryMapConfiguration={
 view:{latitude:0,longitude:0,zoom:3},date:'2026-10-05',catalogueRetrievedAt:'2026-10-05T12:00:00Z',
 provider:{id:'nasa-modis-terra',name:'TEST NASA',available:true,error:null,tileTemplate:'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg',tileSize:256,minZoom:0,maxZoom:9,dated:true,defaultDate:'2026-10-05',dateRanges:[{start:'2026-10-01',end:'2026-10-05'}],acquisitionDate:null,sourceResolution:'TEST only',credits:'TEST credits',sourceUrl:'https://nasa-gibs.github.io/gibs-api-docs/',termsUrl:'https://nasa-gibs.github.io/gibs-api-docs/',exportAllowed:true,exportReason:null},
}
beforeEach(()=>jest.useFakeTimers())
afterEach(()=>jest.useRealTimers())
test('real tile-grid readiness blocks incomplete/error frames and exports the actual viewport when complete',async()=>{
 const status:ImageryMapStatus[]=[],abort=new AbortController(),target=document.createElement('div')
 const controller=await createImageryMap(target,configuration,value=>status.push(value),abort.signal)
 // Real TileLayer schedules its source-ready notification at zero delay.
 jest.advanceTimersByTime(0)
 expect(()=>controller.exportFrame()).toThrow(/Wait for all/)
 const map=MockMap.current,tiles=map.tiles(),source=map.source()
 tiles.slice(1).forEach(tile=>source.dispatchEvent(new TileSourceEvent('tileloadend',tile)))
 map.renderSync();expect(()=>controller.exportFrame()).toThrow(/Wait for all/)
 source.dispatchEvent(new TileSourceEvent('tileloaderror',tiles[0]));map.renderSync()
 expect(status.at(-1)?.phase).toBe('error')
 source.dispatchEvent(new TileSourceEvent('tileloadend',tiles[0]));map.renderSync()
 expect(status.at(-1)?.phase).toBe('ready')
 const frame=controller.exportFrame()
 expect(frame.width).toBe(512);expect(frame.dataDay).toBe('2026-10-05')
 const extent=map.getView().calculateExtent([512,512]),resolution=map.resolution()
 expect(frame.topLeftPixel[0]).toBeCloseTo(extent[0]+resolution/2,8)
 expect(frame.topLeftPixel[1]).toBeCloseTo(extent[3]-resolution/2,8)
 abort.abort();expect(map.disposed).toBe(true);expect(jest.getTimerCount()).toBe(0)
})
test('camera movement invalidates an old ready frame before new tiles are loaded',async()=>{
 const abort=new AbortController(),controller=await createImageryMap(document.createElement('div'),configuration,()=>{},abort.signal),map=MockMap.current
 jest.advanceTimersByTime(0)
 map.tiles().forEach(tile=>map.source().dispatchEvent(new TileSourceEvent('tileloadend',tile)));map.renderSync()
 expect(()=>controller.exportFrame()).not.toThrow()
 map.getView().setCenter([10000000,10000000])
 expect(()=>controller.exportFrame()).toThrow(/Wait for all/)
 controller.destroy();expect(jest.getTimerCount()).toBe(0)
})
test('stalled tiles produce a bounded error and disposal cancels all callbacks',async()=>{
 const status:ImageryMapStatus[]=[],controller=await createImageryMap(document.createElement('div'),configuration,value=>status.push(value),new AbortController().signal)
 jest.advanceTimersByTime(0)
 jest.advanceTimersByTime(20000);expect(status.at(-1)?.phase).toBe('error')
 controller.destroy();const count=status.length;MockMap.current.renderSync();expect(status).toHaveLength(count)
 expect(jest.getTimerCount()).toBe(0)
})
