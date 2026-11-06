import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {SurfaceReviewPanel} from './SurfaceReviewPanel'
import {surfaceReviewCommandSchema} from '@/lib/topo/surfaceReviewProtocol'
const projectId='22222222-2222-4222-8222-222222222222',sourceRevisionId='33333333-3333-4333-8333-333333333333',userId='11111111-1111-4111-8111-111111111111'
const props={projectId,sourceRevisionId,userId,expectedSourceHash:'a'.repeat(64)}
const history={role:'project_manager',source:{revisionId:sourceRevisionId,inputHash:props.expectedSourceHash,referenceHash:'b'.repeat(64),outputHash:'c'.repeat(64),current:true},reviews:[],historyLimited:false}
const originalFetch=global.fetch
const fetchMock=jest.fn<ReturnType<typeof fetch>,Parameters<typeof fetch>>()
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
beforeEach(()=>{fetchMock.mockReset();global.fetch=fetchMock;localStorage.clear();Object.defineProperty(navigator,'locks',{configurable:true,value:{request:async(_name:string,work:()=>unknown)=>work()}})})
afterEach(()=>{global.fetch=originalFetch})
test('viewer may inspect history but cannot record an internal review',async()=>{
  fetchMock.mockResolvedValue(response({data:{...history,role:'viewer'}}))
  render(<SurfaceReviewPanel {...props}/>)
  expect(await screen.findByText('Read-only project access. You can inspect the review history.')).toBeInTheDocument()
  expect(screen.getByRole('textbox',{name:'Review notes / corrections to request'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'Record internal review'})).toBeDisabled()
})
test('lost acknowledgement retries the same request and reports the recovered record',async()=>{
  const onRecorded=jest.fn()
  const posted:string[]=[]
  fetchMock.mockImplementation(async(_url,options)=>{
    if(options?.method!=='POST')return response({data:history})
    const command=surfaceReviewCommandSchema.parse(JSON.parse(String(options.body)) as unknown)
    posted.push(command.requestId)
    if(posted.length===1)throw new Error('Connection lost before acknowledgement')
    return response({data:{id:'55555555-5555-4555-8555-555555555555',projectId,sourceRevisionId,sourceHash:props.expectedSourceHash,
      sourceReferenceHash:history.source.referenceHash,sourceOutputHash:history.source.outputHash,actorId:userId,requestId:command.requestId,
      outcome:command.outcome,note:command.note,createdAt:'2026-11-06T09:00:00.000Z',replayed:true,professionalApproval:false,fieldVerified:false}})
  })
  render(<SurfaceReviewPanel {...props} onRecorded={onRecorded}/>)
  const note=await screen.findByRole('textbox',{name:'Review notes / corrections to request'})
  fireEvent.change(note,{target:{value:'Re-observe DM-01; preserve the original capture.'}})
  fireEvent.click(screen.getByRole('button',{name:'Record internal review'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
  expect(note).toHaveValue('Re-observe DM-01; preserve the original capture.')
  fireEvent.click(screen.getByRole('button',{name:'Retry same review request'}))
  expect(await screen.findByText(/existing record recovered/)).toBeInTheDocument()
  expect(posted).toHaveLength(2);expect(posted[0]).toBe(posted[1])
  expect(onRecorded).toHaveBeenCalledTimes(1)
})
test('switching accounts removes unsent review text from the previous account',async()=>{
  fetchMock.mockImplementation(async()=>response({data:history}))
  const {rerender}=render(<SurfaceReviewPanel {...props}/>)
  fireEvent.change(await screen.findByRole('textbox',{name:'Review notes / corrections to request'}),{target:{value:'Private unsent note'}})
  rerender(<SurfaceReviewPanel {...props} userId="66666666-6666-4666-8666-666666666666"/>)
  expect(screen.queryByDisplayValue('Private unsent note')).not.toBeInTheDocument()
  await waitFor(()=>expect(screen.getByRole('textbox',{name:'Review notes / corrections to request'})).toHaveValue(''))
})
test('a superseded source keeps its history visible but disables new review writes',async()=>{
  fetchMock.mockResolvedValue(response({data:{...history,source:{...history.source,current:false}}}))
  render(<SurfaceReviewPanel {...props}/>)
  expect(await screen.findByText(/retained earlier revision/)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Record internal review'})).toBeDisabled()
})

test('reload retains the review request and recovers it even after the source is superseded',async()=>{
  const posted:string[]=[]
  let current=true
  fetchMock.mockImplementation(async(_url,options)=>{
    if(options?.method!=='POST')return response({data:{...history,source:{...history.source,current}}})
    const command=surfaceReviewCommandSchema.parse(JSON.parse(String(options.body)) as unknown)
    posted.push(command.requestId)
    if(posted.length===1)throw new Error('Lost acknowledgement')
    return response({data:{id:'55555555-5555-4555-8555-555555555555',projectId,sourceRevisionId,sourceHash:props.expectedSourceHash,
      sourceReferenceHash:history.source.referenceHash,sourceOutputHash:history.source.outputHash,actorId:userId,requestId:command.requestId,
      outcome:command.outcome,note:command.note,createdAt:'2026-11-06T09:00:00.000Z',replayed:true,professionalApproval:false,fieldVerified:false}})
  })
  const first=render(<SurfaceReviewPanel {...props}/>)
  fireEvent.change(await screen.findByRole('textbox',{name:'Review notes / corrections to request'}),{target:{value:'Check benchmark closure before drafting.'}})
  fireEvent.click(screen.getByRole('button',{name:'Record internal review'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Lost acknowledgement')
  first.unmount();current=false
  render(<SurfaceReviewPanel {...props}/>)
  const retry=await screen.findByRole('button',{name:'Retry same review request'})
  await waitFor(()=>expect(retry).toBeEnabled())
  expect(screen.getByRole('textbox',{name:'Review notes / corrections to request'})).toHaveValue('Check benchmark closure before drafting.')
  fireEvent.click(retry)
  expect(await screen.findByText(/existing record recovered/)).toBeInTheDocument()
  expect(posted).toHaveLength(2);expect(posted[1]).toBe(posted[0])
  expect(localStorage.length).toBe(0)
})

test('storage failure preserves visible notes and prevents an unrecoverable POST',async()=>{
  fetchMock.mockResolvedValue(response({data:history}))
  render(<SurfaceReviewPanel {...props}/>)
  const note=await screen.findByRole('textbox',{name:'Review notes / corrections to request'})
  fireEvent.change(note,{target:{value:'Retain this review if the device is full.'}})
  const write=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Device storage quota exceeded')})
  try{
    fireEvent.click(screen.getByRole('button',{name:'Record internal review'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('quota')
    expect(fetchMock.mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(0)
    expect(note).toHaveValue('Retain this review if the device is full.')
  }finally{write.mockRestore()}
})

test('a mismatched output receipt cannot clear the retained request or report success',async()=>{
  const onRecorded=jest.fn()
  fetchMock.mockImplementation(async(_url,options)=>{
    if(options?.method!=='POST')return response({data:history})
    const command=surfaceReviewCommandSchema.parse(JSON.parse(String(options.body)) as unknown)
    return response({data:{id:'55555555-5555-4555-8555-555555555555',projectId,sourceRevisionId,sourceHash:props.expectedSourceHash,
      sourceReferenceHash:history.source.referenceHash,sourceOutputHash:'d'.repeat(64),actorId:userId,requestId:command.requestId,
      outcome:command.outcome,note:command.note,createdAt:'2026-11-06T09:00:00.000Z',replayed:false,professionalApproval:false,fieldVerified:false}})
  })
  render(<SurfaceReviewPanel {...props} onRecorded={onRecorded}/>)
  fireEvent.change(await screen.findByRole('textbox',{name:'Review notes / corrections to request'}),{target:{value:'Check the exact output evidence.'}})
  fireEvent.click(screen.getByRole('button',{name:'Record internal review'}))
  expect(await screen.findByRole('alert')).toHaveTextContent(/does not match/)
  expect(onRecorded).not.toHaveBeenCalled()
  expect(localStorage.length).toBe(1)
})

test('refresh rechecks device recovery after browser storage access is restored',async()=>{
  fetchMock.mockImplementation(async()=>response({data:history}))
  const read=jest.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('Browser storage blocked')})
  try{
    render(<SurfaceReviewPanel {...props}/>)
    expect(await screen.findByRole('alert')).toHaveTextContent('storage blocked')
    expect(await screen.findByRole('textbox',{name:'Review notes / corrections to request'})).toBeDisabled()
  }finally{read.mockRestore()}
  fireEvent.click(screen.getByRole('button',{name:'Refresh reviews'}))
  await waitFor(()=>expect(screen.getByRole('textbox',{name:'Review notes / corrections to request'})).toBeEnabled())
})
