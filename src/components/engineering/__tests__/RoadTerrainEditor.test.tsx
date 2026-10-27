import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import RoadWorkbenchEditor from '../RoadWorkbenchEditor'
import {roadWorkbenchExample} from '@/lib/engineering/roadWorkbenchExample'
import type {RoadTerrainData} from '@/lib/engineering/roadTerrain'
jest.mock('../RoadWorkbench3D',()=>({__esModule:true,default:()=> <div aria-label="Synthetic 3D view"/>}))
const scope={actorId:'10000000-0000-4000-8000-000000000003',projectId:'10000000-0000-4000-8000-000000000001',engineeringHash:'a'.repeat(64),referenceHash:'b'.repeat(64)}
const example=roadWorkbenchExample()
const terrain:RoadTerrainData={identity:{projectId:scope.projectId,surfaceId:'10000000-0000-4000-8000-000000000004',revisionId:'10000000-0000-4000-8000-000000000002',revision:2,name:'SYNTHETIC retained terrain',inputHash:'c'.repeat(64),meshHash:'d'.repeat(64),referenceHash:'e'.repeat(64),crs:example.road.coordinateSystem,verticalDatum:example.reference.verticalDatum as string,fieldVerified:false},mesh:{points:[{x:499900,y:9499900,z:100.5},{x:500400,y:9499900,z:100.5},{x:500400,y:9500400,z:100.5},{x:499900,y:9500400,z:100.5}],triangles:[{a:0,b:1,c:2},{a:0,b:2,c:3}]}}
beforeEach(()=>{
  global.fetch=jest.fn(async(url:unknown)=>({ok:true,json:async()=>String(url).includes('revisionId=')?{scope,terrain}:{scope,limited:false,revisions:[{revisionId:terrain.identity.revisionId,surfaceId:terrain.identity.surfaceId,name:terrain.identity.name,revision:2,crs:terrain.identity.crs,pointCount:4,triangleCount:2}]}})) as unknown as typeof fetch
})
it('selects retained terrain, reviews computed sections and saves its binding without replacing measurements',async()=>{
  const save=jest.fn(async()=>true)
  render(<RoadWorkbenchEditor projectId={scope.projectId} road={example.road} reference={example.reference} terrainScope={scope} onSave={save}/>)
  const select=await screen.findByLabelText('Retained terrain revision')
  await waitFor(()=>expect(select).toBeEnabled())
  fireEvent.change(select,{target:{value:terrain.identity.revisionId}})
  const mode=await screen.findByRole('button',{name:'Retained terrain (computed)'})
  await waitFor(()=>expect(mode).toBeEnabled())
  fireEvent.click(mode)
  expect(screen.getByText(/Computed terrain sections/)).toBeInTheDocument()
  expect(screen.getByLabelText('Terrain preview cut volume')).toHaveTextContent('Unassessed')
  expect(screen.getByLabelText('Selected cut area')).not.toHaveTextContent('Unassessed')
  fireEvent.click(screen.getByRole('button',{name:'Save road draft'}))
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(1))
  const saved=save.mock.calls[0] as unknown as [typeof example.road]
  expect(saved[0].retainedTerrain?.revisionId).toBe(terrain.identity.revisionId)
  expect(saved[0].stations).toEqual(example.road.stations)
})
it('shows an explicit empty state without inventing a terrain surface',async()=>{
  jest.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({scope,limited:false,revisions:[]})} as Response)
  render(<RoadWorkbenchEditor projectId={scope.projectId} road={example.road} reference={example.reference} terrainScope={scope}/>)
  expect(await screen.findByText(/No saved surface revisions/)).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Retained terrain (computed)'})).not.toBeInTheDocument()
})
it('ignores a late response for the old selection and never saves its metadata as the new revision',async()=>{
  const other={...terrain,identity:{...terrain.identity,revisionId:'10000000-0000-4000-8000-000000000005',name:'SYNTHETIC second terrain'}}
  let finishOld:()=>void=()=>{throw Error('The old terrain request has not started')}
  jest.mocked(fetch).mockImplementation(async(url:unknown)=>{
    if(String(url).includes(`revisionId=${terrain.identity.revisionId}`))return new Promise<Response>(resolve=>{finishOld=()=>resolve({ok:true,json:async()=>({scope,terrain})} as Response)})
    if(String(url).includes(`revisionId=${other.identity.revisionId}`))return{ok:true,json:async()=>({scope,terrain:other})} as Response
    return{ok:true,json:async()=>({scope,limited:false,revisions:[terrain,other].map(t=>({revisionId:t.identity.revisionId,surfaceId:t.identity.surfaceId,name:t.identity.name,revision:2,crs:t.identity.crs,pointCount:4,triangleCount:2}))})} as Response
  })
  const save=jest.fn(async()=>true)
  render(<RoadWorkbenchEditor projectId={scope.projectId} road={example.road} reference={example.reference} terrainScope={scope} onSave={save}/>)
  const select=await screen.findByLabelText('Retained terrain revision')
  await waitFor(()=>expect(select).toBeEnabled())
  fireEvent.change(select,{target:{value:terrain.identity.revisionId}})
  await screen.findByText('Validating the exact retained terrain…')
  fireEvent.change(select,{target:{value:other.identity.revisionId}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'Save road draft'})).toBeEnabled())
  await act(async()=>{finishOld()})
  fireEvent.click(screen.getByRole('button',{name:'Save road draft'}))
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(1))
  expect((save.mock.calls[0] as unknown as [typeof example.road])[0].retainedTerrain?.revisionId).toBe(other.identity.revisionId)
})
it('clears a failed terrain-selection error when returning to measured sections',async()=>{
  const fetcher=jest.mocked(fetch).getMockImplementation()
  jest.mocked(fetch).mockImplementation(async(...args)=>String(args[0]).includes('revisionId=')?{ok:false,json:async()=>({error:'Synthetic unavailable revision'})} as Response:fetcher?fetcher(...args):Promise.reject(Error('Missing synthetic fetch')))
  render(<RoadWorkbenchEditor projectId={scope.projectId} road={example.road} reference={example.reference} terrainScope={scope}/>)
  const select=await screen.findByLabelText('Retained terrain revision')
  await waitFor(()=>expect(select).toBeEnabled())
  fireEvent.change(select,{target:{value:terrain.identity.revisionId}})
  await screen.findByText(/The exact terrain revision is unavailable/)
  fireEvent.change(select,{target:{value:''}})
  await waitFor(()=>expect(screen.queryByText(/The exact terrain revision is unavailable/)).not.toBeInTheDocument())
})
