/** @jest-environment jsdom */
import { act,render,screen,waitFor } from '@testing-library/react'
import SurveyMap from '@/components/map/SurveyMap'
type ReferenceRequestArgs=[number,number,number,string,AbortSignal]
const mockConstruct=jest.fn(),mockSetLayer=jest.fn(),mockLookup=jest.fn<Promise<unknown[]>,ReferenceRequestArgs>()
const mockParcel = jest.fn<void, [number[][]]>(), mockAnnotations = jest.fn(), mockPlan = jest.fn()
const mockLayer=()=>({set:jest.fn(),getVisible:()=>true,setVisible:jest.fn()})
jest.mock('ol/Map',()=>({__esModule:true,default:class{
 options:{view:unknown};constructor(options:{view:unknown}){this.options=options;mockConstruct(options)}
 getView(){return this.options.view}getLayers(){return{setAt:mockSetLayer}}on(){}un(){}setTarget(){}
}}))
jest.mock('ol/View',()=>({__esModule:true,default:class{on(){}un(){}getCenter(){return[0,0]}getZoom(){return 16}}}))
jest.mock('ol/control/Attribution',()=>({__esModule:true,default:class{}}))
jest.mock('ol/proj',()=>({transform:(coordinate:number[])=>coordinate}))
jest.mock('@/lib/map/projection',()=>({registerProjectProjection:async()=>{},arrayTo3857:async(value:number[][])=>value,toProjectCrs:async(x:number,y:number)=>[x,y],SRID_3857:'EPSG:3857'}))
jest.mock('@/lib/map/kencors',()=>({nearestKenCORSStations:(...args:ReferenceRequestArgs)=>mockLookup(...args)}))
jest.mock('@/lib/map/layers',()=>({createOSMLayer:async()=>mockLayer(),createParcelLayer:async(coords:number[][])=>{mockParcel(coords);return mockLayer()},createBeaconLayer:async()=>mockLayer(),createKenCORSLayer:async()=>mockLayer()}))
jest.mock('@/lib/map/annotations',()=>({createAnnotationLayer:async(options:unknown)=>{mockAnnotations(options);return mockLayer()}}))
jest.mock('@/lib/engine/planGeometry',()=>({computePlanGeometry:(stations:unknown)=>{mockPlan(stations);return null}}))
jest.mock('@/hooks/useVertexEditing',()=>({useVertexEditing:()=>({state:{}})}))
jest.mock('@/components/map/MeasurementTool',()=>({MeasurementTool:()=>null}))
jest.mock('@/components/map/VertexEditToolbar',()=>({VertexEditToolbar:()=>null}))
jest.mock('@/components/map/MapAccessibility',()=>()=>null)
jest.mock('@/components/map/LayerControl',()=>({LayerControl:()=>null}))
jest.mock('@/components/map/SheetLayout',()=>()=>null)
jest.mock('@/lib/surveyMapEngine/react/SurveyMapEngineContext',()=>({SurveyMapEngineProvider:({children}:{children:React.ReactNode})=>children}))
jest.mock('@/lib/surveyMapEngine/react/useSurveyMapEngine',()=>({useSurveyMapEngine:()=>({printApi:{toggleSheetLayout:()=>{},print:()=>{},sheetLayoutOpen:false}})}))
jest.mock('@/lib/surveyMapEngine/io/exportSurface',()=>({exportMapPDF:()=>{}}))
const firstGrid='EPSG:32636',secondGrid='EPSG:32637'
const props={projectId:'synthetic-map-reference-test',centroidEasting:500000,centroidNorthing:500000,epsg:firstGrid,adjustedStations:[{pointName:'SYN-A',adjustedEasting:500000,adjustedNorthing:500000},{pointName:'SYN-B',adjustedEasting:500010,adjustedNorthing:500000},{pointName:'SYN-C',adjustedEasting:500000,adjustedNorthing:500010}].map(station=>({...station,originalEasting:station.adjustedEasting,originalNorthing:station.adjustedNorthing}))}
beforeEach(()=>{jest.clearAllMocks();localStorage.clear()})
test('primary survey map renders while optional catalogue lookup is unresolved',async()=>{
 let resolve:((value:unknown[])=>void)|undefined
 mockLookup.mockImplementation(()=>new Promise<unknown[]>(done=>{resolve=done}))
 render(<SurveyMap {...props}/>)
 await waitFor(()=>expect(mockConstruct).toHaveBeenCalledTimes(1))
 expect(screen.queryByText('Loading map...')).not.toBeInTheDocument()
 expect(screen.getByText('Loading optional reference locations…')).toBeVisible()
 await act(async()=>{resolve?.([])})
 await screen.findByText('No same-grid reference locations within 100 km.')
 expect(mockSetLayer).toHaveBeenCalledTimes(1)
})
test('offline lookup is visible and cannot prevent the primary survey map',async()=>{
 mockLookup.mockRejectedValue(new Error('Synthetic reference connection unavailable'))
 render(<SurveyMap {...props}/>)
 await screen.findByText('Synthetic reference connection unavailable')
 expect(mockConstruct).toHaveBeenCalledTimes(1)
 expect(screen.queryByText('Loading map...')).not.toBeInTheDocument()
})
test('a changed grid aborts old reference requests and cannot install stale locations',async()=>{
 const resolves:Array<(value:unknown[])=>void>=[]
 mockLookup.mockImplementation(()=>new Promise<unknown[]>(resolve=>resolves.push(resolve)))
 const {rerender,unmount}=render(<SurveyMap {...props}/>)
 await waitFor(()=>expect(mockLookup).toHaveBeenCalledTimes(1))
 const oldSignal=mockLookup.mock.calls[0][4]
 rerender(<SurveyMap {...props} epsg={secondGrid}/>)
 await waitFor(()=>expect(mockLookup).toHaveBeenCalledTimes(2))
 expect(oldSignal.aborted).toBe(true)
 await act(async()=>{resolves[0]([])})
 expect(mockSetLayer).not.toHaveBeenCalled()
 unmount();await act(async()=>{resolves[1]([])})
 expect(mockSetLayer).not.toHaveBeenCalled()
})
test('field points do not acquire a parcel, area, perimeter or boundary annotations',async()=>{
 mockLookup.mockResolvedValue([])
 render(<SurveyMap {...props} geometryKind="points" adjustedStations={props.adjustedStations.slice(0,1)}/>)
 await waitFor(()=>expect(mockConstruct).toHaveBeenCalledTimes(1))
 expect(mockParcel).toHaveBeenCalledWith([])
 expect(mockAnnotations).toHaveBeenCalledWith(expect.objectContaining({coords3857:[],stations21037:[]}))
 expect(mockPlan).not.toHaveBeenCalled()
 expect(screen.getByRole('button',{name:'Fit to Points'})).toBeVisible()
})
test('a saved geometry change refreshes layers even if its centroid is unchanged',async()=>{
 mockLookup.mockResolvedValue([])
 const {rerender}=render(<SurveyMap {...props}/>)
 await waitFor(()=>expect(mockConstruct).toHaveBeenCalledTimes(1))
 const changed=props.adjustedStations.map((station,index)=>({...station,adjustedEasting:station.adjustedEasting+(index===0?1:index===1?-1:0)}))
 rerender(<SurveyMap {...props} adjustedStations={changed}/>)
 await waitFor(()=>expect(mockConstruct).toHaveBeenCalledTimes(2))
 expect(mockParcel.mock.calls[1][0][0][0]).toBe(changed[0].adjustedEasting)
})
