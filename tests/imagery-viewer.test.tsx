import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ImageryViewer from '@/components/online/ImageryViewer'
import type { ImageryCatalogue } from '@/lib/online/satellite'
import type { ImageryMapConfiguration, ImageryMapStatus, ImageryMapController } from '@/lib/map/imageryViewerMap'
import { exportImageryZip } from '@/lib/surveyMapEngine/io/imageryExport'
import type { ImageryExportFrame } from '@/lib/surveyMapEngine/io/imageryExport'

const source = { available:true,error:null,tileTemplate:'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg',tileSize:256,minZoom:0,acquisitionDate:null,sourceResolution:'TEST source resolution',credits:'TEST source credits',sourceUrl:'https://nasa-gibs.github.io/gibs-api-docs/',termsUrl:'https://nasa-gibs.github.io/gibs-api-docs/' }
const catalogue: ImageryCatalogue = {retrievedAt:'2026-10-05T12:00:00Z',providers:[
 {...source,id:'esri-world',name:'Esri World Imagery',tileTemplate:'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxZoom:20,dated:false,defaultDate:null,dateRanges:[],exportAllowed:false,exportReason:'TEST online-viewing restriction'},
 {...source,id:'nasa-modis-terra',name:'NASA MODIS / Terra true colour',maxZoom:9,dated:true,defaultDate:'2026-10-05',dateRanges:[{start:'2026-10-01',end:'2026-10-02'},{start:'2026-10-04',end:'2026-10-05'}],exportAllowed:true,exportReason:null},
]}
const mockCreate = jest.fn<Promise<ImageryMapController>,[HTMLElement,ImageryMapConfiguration,(status:ImageryMapStatus)=>void,AbortSignal]>(), mockDestroy = jest.fn<void,[]>()
jest.mock('@/lib/map/imageryViewerMap',()=>({createImageryMap:(target:HTMLElement,configuration:ImageryMapConfiguration,report:(status:ImageryMapStatus)=>void,signal:AbortSignal)=>mockCreate(target,configuration,report,signal)}))
jest.mock('@/components/MetarduLogo',()=>()=> <span>METARDU icon</span>)
jest.mock('@/lib/surveyMapEngine/io/imageryExport',()=>({exportImageryZip:jest.fn()}))
const originalFetch = global.fetch
const originalCreateObjectURL = URL.createObjectURL, originalRevokeObjectURL = URL.revokeObjectURL
beforeEach(()=>{
 jest.clearAllMocks()
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>catalogue})
 URL.createObjectURL=jest.fn(()=> 'blob:synthetic-imagery-only')
 URL.revokeObjectURL=jest.fn()
 mockCreate.mockImplementation((_target:HTMLElement,configuration:ImageryMapConfiguration,report:(status:ImageryMapStatus)=>void)=>{
  report({phase:'ready',message:'TEST imagery tiles loaded',view:configuration.view})
  return Promise.resolve({destroy:mockDestroy,exportFrame:()=>{throw new Error('UI tests use a mocked map controller')}})
 })
 HTMLDialogElement.prototype.close=jest.fn(function(this:HTMLDialogElement){this.removeAttribute('open')})
 HTMLDialogElement.prototype.show=jest.fn(function(this:HTMLDialogElement){this.setAttribute('open','')})
 HTMLDialogElement.prototype.showModal=jest.fn(function(this:HTMLDialogElement){this.setAttribute('open','')})
})
afterAll(()=>{global.fetch=originalFetch;URL.createObjectURL=originalCreateObjectURL;URL.revokeObjectURL=originalRevokeObjectURL})
async function coordinates(){
 await screen.findByRole('button',{name:/NASA MODIS/})
 fireEvent.change(screen.getByLabelText('WGS 84 latitude (degrees)'),{target:{value:'0'}})
 fireEvent.change(screen.getByLabelText('WGS 84 longitude (degrees)'),{target:{value:'0'}})
}
test('the viewer does not request location imagery until the user explicitly supplies coordinates',async()=>{
 render(<ImageryViewer/>);await screen.findByRole('button',{name:/Esri World Imagery/})
 expect(screen.getByLabelText('WGS 84 latitude (degrees)')).toHaveValue(null)
 expect(mockCreate).not.toHaveBeenCalled()
 expect(screen.getByRole('button',{name:'Export GIS ZIP'})).toBeDisabled()
})
test('zero coordinates reach the map and the Esri export restriction remains visible',async()=>{
 render(<ImageryViewer/>);await coordinates();fireEvent.click(screen.getByRole('button',{name:'View imagery'}))
 await screen.findByText('TEST imagery tiles loaded')
 expect(mockCreate.mock.calls[0][1]).toMatchObject({view:{latitude:0,longitude:0,zoom:14},date:null})
 expect(screen.getByRole('button',{name:'Export GIS ZIP'})).toBeDisabled()
 expect(screen.getByText('TEST online-viewing restriction')).toBeVisible()
})
test('an unavailable NASA data day is rejected instead of snapping to the next available image',async()=>{
 render(<ImageryViewer/>);await coordinates();fireEvent.click(screen.getByRole('button',{name:/NASA MODIS/}))
 fireEvent.change(screen.getByLabelText('Requested data day (UTC)'),{target:{value:'2026-10-03'}})
 fireEvent.click(screen.getByRole('button',{name:'View imagery'}))
 await screen.findByText(/outside the source’s published availability calendar/)
 expect(mockCreate).not.toHaveBeenCalled()
})
test('editing an input cancels the old map and disables export of stale imagery',async()=>{
 render(<ImageryViewer/>);await coordinates();fireEvent.click(screen.getByRole('button',{name:/NASA MODIS/}));fireEvent.click(screen.getByRole('button',{name:'View imagery'}))
 await screen.findByText('TEST imagery tiles loaded')
 await waitFor(()=>expect(screen.getByRole('button',{name:'Export GIS ZIP'})).toBeEnabled())
 fireEvent.change(screen.getByLabelText('WGS 84 longitude (degrees)'),{target:{value:'33'}})
 expect(screen.getByRole('button',{name:'Export GIS ZIP'})).toBeDisabled()
 await waitFor(()=>expect(mockDestroy).toHaveBeenCalled())
})
test('expanded view uses a modal and Escape returns the same map to normal layout',async()=>{
 render(<ImageryViewer/>);await screen.findByRole('button',{name:/NASA MODIS/})
 fireEvent.click(screen.getByRole('button',{name:'Expand map'}))
 expect(screen.getByRole('dialog',{name:'Imagery map'})).toHaveAttribute('aria-modal','true')
 fireEvent(screen.getByRole('dialog',{name:'Imagery map'}),new Event('cancel',{bubbles:true,cancelable:true}))
 expect(screen.getByRole('dialog',{name:'Imagery map'})).toHaveAttribute('aria-modal','false')
})
async function exportableView(){
 mockCreate.mockImplementation((_target,configuration,report)=>{
  report({phase:'ready',message:'TEST imagery tiles loaded',view:configuration.view})
  return Promise.resolve({destroy:mockDestroy,exportFrame:()=>({provider:configuration.provider} as ImageryExportFrame)})
 })
 render(<ImageryViewer/>);await coordinates()
 fireEvent.click(screen.getByRole('button',{name:/NASA MODIS/}))
 fireEvent.click(screen.getByRole('button',{name:'View imagery'}))
 await screen.findByText('TEST imagery tiles loaded')
 await waitFor(()=>expect(screen.getByRole('button',{name:'Export GIS ZIP'})).toBeEnabled())
}
test('a prepared download stays inside the map and is revoked when the source changes',async()=>{
 jest.mocked(exportImageryZip).mockResolvedValue(new Blob(['synthetic ZIP']))
 await exportableView()
 fireEvent.click(screen.getByRole('button',{name:'Expand map'}))
 fireEvent.click(screen.getByRole('button',{name:'Export GIS ZIP'}))
 const download=await screen.findByRole('link',{name:'Download prepared GIS ZIP'})
 expect(download.closest('dialog')).toBe(screen.getByRole('dialog',{name:'Imagery map'}))
 expect(download).toHaveAttribute('download','METARDU-imagery-2026-10-05.zip')
 fireEvent.click(screen.getByRole('button',{name:/Esri World Imagery/}))
 expect(screen.queryByRole('link',{name:'Download prepared GIS ZIP'})).not.toBeInTheDocument()
 await waitFor(()=>expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-imagery-only'))
})
test('an export failure remains visible inside the expanded map',async()=>{
 jest.mocked(exportImageryZip).mockRejectedValue(new Error('TEST encoder failure'))
 await exportableView();fireEvent.click(screen.getByRole('button',{name:'Expand map'}))
 fireEvent.click(screen.getByRole('button',{name:'Export GIS ZIP'}))
 const error=await screen.findByRole('alert')
 expect(error).toHaveTextContent('TEST encoder failure')
 expect(error.closest('dialog')).toBe(screen.getByRole('dialog',{name:'Imagery map'}))
 expect(screen.getByRole('button',{name:'Export GIS ZIP'})).toBeEnabled()
})
test('a late export cannot offer stale imagery after coordinates change',async()=>{
 let resolveExport!:(blob:Blob)=>void
 jest.mocked(exportImageryZip).mockImplementation(()=>new Promise(resolve=>{resolveExport=resolve}))
 await exportableView();fireEvent.click(screen.getByRole('button',{name:'Export GIS ZIP'}))
 expect(screen.getByRole('button',{name:'Preparing ZIP…'})).toBeDisabled()
 fireEvent.change(screen.getByLabelText('WGS 84 longitude (degrees)'),{target:{value:'34'}})
 resolveExport(new Blob(['stale synthetic ZIP']))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Export GIS ZIP'})).toBeDisabled())
 expect(URL.createObjectURL).not.toHaveBeenCalled()
})
test('a changed camera invalidates a prepared download before new tiles finish',async()=>{
 jest.mocked(exportImageryZip).mockResolvedValue(new Blob(['synthetic ZIP']))
 await exportableView();fireEvent.click(screen.getByRole('button',{name:'Export GIS ZIP'}))
 await screen.findByRole('link',{name:'Download prepared GIS ZIP'})
 const report=mockCreate.mock.calls[0][2]
 act(()=>report({phase:'loading',message:'TEST new camera loading'}))
 expect(screen.queryByRole('link',{name:'Download prepared GIS ZIP'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Export GIS ZIP'})).toBeDisabled()
 await waitFor(()=>expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-imagery-only'))
})
test('download and coordinate rows remain in place before and after preparation',async()=>{
 jest.mocked(exportImageryZip).mockResolvedValue(new Blob(['synthetic ZIP']))
 await exportableView()
 const slot=screen.getByTestId('imagery-download-slot')
 expect(screen.queryByRole('link',{name:'Download prepared GIS ZIP'})).not.toBeInTheDocument()
 expect(screen.getByText(/View centre:/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Export GIS ZIP'}))
 const link=await screen.findByRole('link',{name:'Download prepared GIS ZIP'})
 expect(link.parentElement).toBe(slot)
 act(()=>mockCreate.mock.calls[0][2]({phase:'loading',message:'TEST resized map',view:{latitude:1,longitude:2,zoom:8}}))
 expect(screen.getByTestId('imagery-download-slot')).toBe(slot)
 expect(screen.getByText(/View centre:/)).toHaveTextContent('1.00000, 2.00000')
})
