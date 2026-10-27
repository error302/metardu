import {render,screen,fireEvent,waitFor,act} from '@testing-library/react'
import {RoadQuantityRegister} from '../RoadQuantityRegister'
import {calculateRoadQuantityRun} from '@/lib/engineering/roadQuantity'
import type {RoadDesignData} from '@/types/engineering'
const reference={code:'EPSG:32737',verticalDatum:'Synthetic BM',distanceMode:'grid' as const}
const data:RoadDesignData={roadName:'Synthetic Road',startChainage:0,coordinateSystem:reference.code,datum:'WGS84',designSpeed:40,roadClass:'C',ips:[],vips:[],
  crossSectionTemplate:{carriagewayWidth:6,shoulderWidth:0,camber:0,subgradeDepth:0,cutSlope:'1:1',fillSlope:'1:1'},
  stations:[0,20].map(chainage=>({chainage,groundLevel:0,designLevel:-1,groundProfile:[{offset:-10,level:0},{offset:0,level:0},{offset:10,level:0}]}))}
const calculation=calculateRoadQuantityRun(data,reference),inputHash='a'.repeat(64)
const archived={id:'run',revision:'R01',status:'DRAFT',created_at:'2026-10-16T00:00:00Z',created_by:'actor',quantity:{...calculation,inputHash,outputHash:'b'.repeat(64),clientRunId:'delivery'}}
type HttpResponse={ok:boolean;json:()=>Promise<unknown>}
const mockFetch=jest.fn<Promise<HttpResponse>,[string,RequestInit?]>()
const uuidDescriptor=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID')
afterEach(()=>{
  if(uuidDescriptor)Object.defineProperty(globalThis.crypto,'randomUUID',uuidDescriptor)
  else Reflect.deleteProperty(globalThis.crypto,'randomUUID')
})
beforeEach(()=>{
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:mockFetch});mockFetch.mockReset()
  Object.defineProperty(globalThis.crypto,'randomUUID',{configurable:true,value:jest.fn(()=> '11111111-1111-4111-8111-111111111111')})
  mockFetch.mockImplementation(async(url:string,init?:RequestInit)=>{
    if(url.includes('/api/engineering/alignment?'))return{ok:true,json:async()=>({data:{id:'alignment'}})}
    if(init?.method==='POST')return{ok:true,json:async()=>({data:archived,replayed:false})}
    if(url.includes('preview=1'))return{ok:true,json:async()=>({data:{...calculation,input_hash:inputHash}})}
    return{ok:true,json:async()=>({data:[],next_before:null,can_record:true})}
  })
})
it('records only the saved input identity and exposes an archived CSV action',async()=>{
  render(<RoadQuantityRegister projectId="project" data={data} reference={reference} canRecord />)
  const button=screen.getByRole('button',{name:'Record quantity run'})
  await waitFor(()=>expect(button).not.toBeDisabled())
  fireEvent.click(button)
  await screen.findByRole('button',{name:'Download recorded CSV'})
  const post=mockFetch.mock.calls.find(([,init])=>init?.method==='POST')
  expect(JSON.parse(post?.[1]?.body as string)).toEqual({alignment_id:'alignment',client_run_id:'11111111-1111-4111-8111-111111111111',expected_input_hash:inputHash})
  expect(screen.getByText(/R01/)).toBeInTheDocument()
})
it('labels an earlier algorithm result for review while retaining its recorded CSV action',async()=>{
  const older={...archived,quantity:{...archived.quantity,algorithmVersion:'1.0.0'}}
  const original=mockFetch.getMockImplementation()
  if(!original)throw Error('Missing synthetic fetch implementation')
  mockFetch.mockImplementation(async(url,init)=>init?.method==='POST'?{ok:true,json:async()=>({data:older,replayed:true})}:original(url,init))
  render(<RoadQuantityRegister projectId="project" data={data} reference={reference} canRecord />)
  const button=screen.getByRole('button',{name:'Record quantity run'})
  await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button)
  expect(await screen.findByText(/Earlier profile arithmetic.*review.*new draft/i)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Download recorded CSV'})).toBeEnabled()
})
it('refuses a saved snapshot that differs from the displayed inputs',async()=>{
  const changed={...data,stations:data.stations.map(station=>({...station,designLevel:-2}))}
  render(<RoadQuantityRegister projectId="project" data={changed} reference={reference} canRecord />)
  const button=screen.getByRole('button',{name:'Record quantity run'});await waitFor(()=>expect(button).not.toBeDisabled());fireEvent.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent(/Save All/)
  expect(mockFetch.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false)
})
it('disables recording when measured sections cannot produce a quantity',async()=>{
  render(<RoadQuantityRegister projectId="project" data={data} reference={reference} canRecord={false} />)
  await waitFor(()=>expect(mockFetch).toHaveBeenCalled())
  expect(screen.getByRole('button',{name:'Record quantity run'})).toBeDisabled()
})
it('retains the delivery identity when retrying an uncertain network failure',async()=>{
  const original=mockFetch.getMockImplementation();let failed=false
  if(!original)throw new Error('Missing synthetic fetch implementation')
  mockFetch.mockImplementation(async(url:string,init?:RequestInit)=>{
    if(init?.method==='POST'&&!failed){failed=true;throw new Error('Connection lost')}
    return original(url,init)
  })
  render(<RoadQuantityRegister projectId="project" data={data} reference={reference} canRecord />)
  const button=screen.getByRole('button',{name:'Record quantity run'});await waitFor(()=>expect(button).not.toBeDisabled());fireEvent.click(button)
  await screen.findByRole('alert');await waitFor(()=>expect(button).not.toBeDisabled());fireEvent.click(button)
  await screen.findByRole('button',{name:'Download recorded CSV'})
  const posts=mockFetch.mock.calls.filter(([,init])=>init?.method==='POST')
  expect(posts).toHaveLength(2)
  expect(JSON.parse(posts[0][1]?.body as string)).toEqual(JSON.parse(posts[1][1]?.body as string))
  expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1)
})
it('ignores an old recording response after switching away and back to the same project',async()=>{
  const original=mockFetch.getMockImplementation()
  if(!original)throw new Error('Missing synthetic fetch implementation')
  let finish:((value:HttpResponse)=>void)|undefined
  mockFetch.mockImplementation((url:string,init?:RequestInit)=>init?.method==='POST'?new Promise(resolve=>{finish=resolve}):original(url,init))
  const view=render(<RoadQuantityRegister projectId="project" data={data} reference={reference} canRecord />)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Record quantity run'})).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button',{name:'Record quantity run'}));await waitFor(()=>expect(finish).toBeDefined())
  view.rerender(<RoadQuantityRegister projectId="other-project" data={data} reference={reference} canRecord />)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Record quantity run'})).not.toBeDisabled())
  view.rerender(<RoadQuantityRegister projectId="project" data={data} reference={reference} canRecord />)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Record quantity run'})).not.toBeDisabled())
  await act(async()=>{finish?.({ok:true,json:async()=>({data:archived})});await Promise.resolve()})
  expect(screen.queryByRole('button',{name:'Download recorded CSV'})).not.toBeInTheDocument()
})
it('keeps project readers in read-only mode',async()=>{
  const original=mockFetch.getMockImplementation()
  if(!original)throw new Error('Missing synthetic fetch implementation')
  mockFetch.mockImplementation(async(url:string,init?:RequestInit)=>url.includes('/earthworks?')?{ok:true,json:async()=>({data:[],next_before:null,can_record:false})}:original(url,init))
  render(<RoadQuantityRegister projectId="project" data={data} reference={reference} canRecord />)
  await screen.findByText(/Read-only project access/)
  expect(screen.getByRole('button',{name:'Record quantity run'})).toBeDisabled()
})
