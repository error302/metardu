/** @jest-environment jsdom */
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {CivilSurfaceDownload} from '@/components/export/CivilSurfaceDownload'
const projectId='10000000-0000-4000-8000-000000000001',revisionId='10000000-0000-4000-8000-000000000002'
const fixtureGrid='EPSG:32737'
const originalFetch=global.fetch,originalCreate=Object.getOwnPropertyDescriptor(URL,'createObjectURL'),originalRevoke=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL')
type Reply={ok:boolean;status:number;json:()=>Promise<unknown>;headers?:Headers;blob?:()=>Promise<Blob>}
const mockFetch=jest.fn<Promise<Reply>,[string,RequestInit?]>()
beforeEach(()=>{
  mockFetch.mockReset();global.fetch=mockFetch as unknown as typeof fetch
  mockFetch.mockResolvedValueOnce({ok:true,status:200,json:async()=>({data:{projectId,viewerId:'synthetic-owner',limited:false,revisions:[{revision_id:revisionId,name:'SYNTHETIC original grid',revision:2,crs:fixtureGrid,point_count:4,triangle_count:2}]}})})
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:jest.fn(()=> 'blob:synthetic-surface')})
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:jest.fn()})
  jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
})
afterEach(()=>{global.fetch=originalFetch;jest.restoreAllMocks();if(originalCreate)Object.defineProperty(URL,'createObjectURL',originalCreate);else Reflect.deleteProperty(URL,'createObjectURL');if(originalRevoke)Object.defineProperty(URL,'revokeObjectURL',originalRevoke);else Reflect.deleteProperty(URL,'revokeObjectURL')})
test.each([true,false])('downloads only confirmed XML and keeps a refused revision selectable (success=%s)',async success=>{
  const page=render(<CivilSurfaceDownload projectId={projectId}/>)
  try{
    const select=await screen.findByLabelText('Surface revision')
    await act(async()=>fireEvent.change(select,{target:{value:revisionId}}))
    mockFetch.mockResolvedValueOnce(success?{ok:true,status:200,json:async()=>null,headers:new Headers({'content-type':'application/xml'}),blob:async()=>new Blob(['SYNTHETIC XML'])}:{ok:false,status:409,json:async()=>({error:'Retained mesh changed; original preserved'})})
    await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Download retained TIN (LandXML)'})))
    if(success){expect(URL.createObjectURL).toHaveBeenCalledTimes(1);expect(screen.getByRole('status').textContent).toContain('computed draft')}
    else{expect(URL.createObjectURL).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('Retained mesh changed')}
    expect((select as HTMLSelectElement).value).toBe(revisionId)
    expect(mockFetch.mock.calls[1][0]).toContain(`revisionId=${revisionId}`)
  }finally{page.unmount()}
})

test('an older retained revision needs a complete ID and downloads that exact revision',async()=>{
  mockFetch.mockReset()
  mockFetch.mockResolvedValueOnce({ok:true,status:200,json:async()=>({data:{projectId,viewerId:'synthetic-owner',limited:true,revisions:[]}})})
  const page=render(<CivilSurfaceDownload projectId={projectId}/>)
  try{
    const input=await screen.findByLabelText('Older revision ID')
    fireEvent.change(input,{target:{value:'incomplete'}})
    fireEvent.click(screen.getByRole('button',{name:'Download retained TIN (LandXML)'}))
    expect(screen.getByRole('alert').textContent).toContain('complete revision ID')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const olderId='10000000-0000-4000-8000-000000000009'
    fireEvent.change(input,{target:{value:` ${olderId} `}})
    mockFetch.mockResolvedValueOnce({ok:true,status:200,json:async()=>null,headers:new Headers({'content-type':'application/xml'}),blob:async()=>new Blob(['SYNTHETIC OLDER XML'])})
    await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Download retained TIN (LandXML)'})))
    expect(mockFetch.mock.calls[1][0]).toBe(`/api/project/${projectId}/civil-surface-export?revisionId=${olderId}`)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    const clickedLink=jest.mocked(HTMLAnchorElement.prototype.click).mock.contexts[0] as HTMLAnchorElement
    expect(clickedLink.download).toBe(`surface-${olderId}.xml`)
  }finally{page.unmount()}
})

test('a failed inventory is not presented as an empty project and a reload can recover',async()=>{
  mockFetch.mockReset()
  mockFetch.mockResolvedValueOnce({ok:false,status:503,json:async()=>({error:'Saved revision service unavailable'})})
  const page=render(<CivilSurfaceDownload projectId={projectId}/>)
  try{
    expect((await screen.findByRole('alert')).textContent).toContain('service unavailable')
    expect(screen.queryByText(/No saved surface revisions were found/)).toBeNull()
    mockFetch.mockResolvedValueOnce({ok:true,status:200,json:async()=>({data:{projectId,viewerId:'synthetic-owner',limited:false,revisions:[]}})})
    await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Reload revision list'})))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/No saved surface revisions were found/)).toBeTruthy()
  }finally{page.unmount()}
})

test('an aborted previous-project inventory cannot end loading or expose its error in the new project',async()=>{
  mockFetch.mockReset()
  let rejectOld!:(reason:Error)=>void
  let resolveNew!:(reply:Reply)=>void
  mockFetch.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectOld=reject}))
  mockFetch.mockImplementationOnce(()=>new Promise(resolve=>{resolveNew=resolve}))
  const nextProject='10000000-0000-4000-8000-000000000003'
  const page=render(<CivilSurfaceDownload projectId={projectId}/>)
  try{
    page.rerender(<CivilSurfaceDownload projectId={nextProject}/>)
    await act(async()=>{rejectOld(new Error('Old private project error'));await Promise.resolve()})
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Loading saved revisions')
    await act(async()=>resolveNew({ok:true,status:200,json:async()=>({data:{projectId:nextProject,viewerId:'synthetic-owner',limited:false,revisions:[]}})}))
    expect(await screen.findByLabelText('Surface revision')).toBeTruthy()
  }finally{page.unmount()}
})

test('changing projects cancels a pending download without leaking its late error or busy state',async()=>{
  const page=render(<CivilSurfaceDownload projectId={projectId}/>)
  try{
    fireEvent.change(await screen.findByLabelText('Surface revision'),{target:{value:revisionId}})
    let rejectDownload!:(reason:Error)=>void
    mockFetch.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectDownload=reject}))
    fireEvent.click(screen.getByRole('button',{name:'Download retained TIN (LandXML)'}))
    const nextProject='10000000-0000-4000-8000-000000000003'
    mockFetch.mockResolvedValueOnce({ok:true,status:200,json:async()=>({data:{projectId:nextProject,viewerId:'synthetic-owner',limited:false,revisions:[{revision_id:revisionId,name:'SYNTHETIC next project',revision:1,crs:fixtureGrid,point_count:4,triangle_count:2}]}})})
    page.rerender(<CivilSurfaceDownload projectId={nextProject}/>)
    await screen.findByLabelText('Surface revision')
    await act(async()=>rejectDownload(new Error('Previous private project download failed')))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Surface revision'),{target:{value:revisionId}})
    await waitFor(()=>expect((screen.getByRole('button',{name:'Download retained TIN (LandXML)'}) as HTMLButtonElement).disabled).toBe(false))
  }finally{page.unmount()}
})
