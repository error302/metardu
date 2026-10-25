import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Page from '@/app/project/[id]/scheme/page'

const PROJECT='11111111-1111-4111-8111-111111111111'
let activeProject=PROJECT
jest.mock('next/navigation',()=>({useParams:()=>({id:activeProject})}))
jest.mock('@/components/MobileDesktopNotice',()=>({__esModule:true,default:()=>null}))
const originalFetch=global.fetch
type Reply={ok:boolean;json:()=>Promise<unknown>}
const fetchMock=jest.fn<Promise<Reply>,[string,RequestInit?]>()
const overview=()=>({project:{id:PROJECT,name:'SYNTHETIC Mwavumbo campaign',location:null,projectType:'scheme'},
  parcels:{total:10000,statusCounts:{pending:9999,field_complete:0,computed:1,plan_generated:0,submitted:0,approved:0},unrecognized:0,unassignedBlock:1,invalidBlock:0},
  blocks:{total:1,page:1,pageSize:24,rows:[{id:'22222222-2222-4222-8222-222222222222',blockNumber:'SYN-A',name:null,parcelCount:9999,submittedOrApproved:0}]},
  traverses:{total:1,computed:1,page:1,pageSize:24,rows:[{id:'33333333-3333-4333-8333-333333333333',name:'SYNTHETIC traverse',method:'bowditch',status:'computed',updatedAt:'2026-10-25T00:00:00.000Z',precisionRatio:10000,areaHa:null,recordedOrder:'1st order',assessment:'unassessed'}]}})
const reply=(data:unknown,ok=true):Reply=>({ok,json:async()=>data})
beforeEach(()=>{activeProject=PROJECT;fetchMock.mockReset().mockImplementation(async url=>url.includes('/scheme-overview')?reply({data:overview()}):reply({error:'Unexpected unbounded read'},false));global.fetch=fetchMock as unknown as typeof fetch})
afterEach(()=>{global.fetch=originalFetch})

it('uses one bounded overview read and preserves the UUID and actual project name',async()=>{
  render(<Page/>);await screen.findByRole('heading',{name:'SYNTHETIC Mwavumbo campaign'});expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0][0]).toContain(`/api/project/${PROJECT}/scheme-overview?`);expect(screen.getByLabelText('Total parcels')).toHaveTextContent('10,000');expect(screen.getByText('Accuracy assessment: unassessed')).toBeInTheDocument();expect(screen.queryByText('Passed')).not.toBeInTheDocument()
})
it('shows a retryable failure instead of inventing a project or zero counts',async()=>{
  fetchMock.mockResolvedValue(reply({error:'Synthetic unavailable'},false));render(<Page/>);await screen.findByRole('alert');expect(screen.queryByText('Scheme Project')).not.toBeInTheDocument();expect(screen.queryByLabelText('Total parcels')).not.toBeInTheDocument();fetchMock.mockResolvedValue(reply({data:overview()}));fireEvent.click(screen.getByRole('button',{name:'Retry overview'}));await screen.findByRole('heading',{name:'SYNTHETIC Mwavumbo campaign'})
})
it('retains the last confirmed project data after a failed refresh',async()=>{
  render(<Page/>);await screen.findByRole('heading',{name:'SYNTHETIC Mwavumbo campaign'});fetchMock.mockResolvedValue(reply({error:'Synthetic refresh failed'},false));fireEvent.click(screen.getByRole('button',{name:'Refresh overview'}));await screen.findByRole('alert');expect(screen.getByLabelText('Total parcels')).toHaveTextContent('10,000');expect(screen.getByText(/Showing the last confirmed overview/)).toBeInTheDocument()
})
it.each(['wrong-project','broken-counts'])('rejects inconsistent overview data: %s',async mode=>{
  const data=overview();if(mode==='wrong-project')data.project.id='44444444-4444-4444-8444-444444444444';else data.parcels.total=9999
  fetchMock.mockResolvedValue(reply({data}));render(<Page/>);await screen.findByRole('alert');expect(screen.queryByLabelText('Total parcels')).not.toBeInTheDocument()
})
it('loads the next block page without fetching the parcel register',async()=>{
  const data=overview();data.blocks.total=25;data.blocks.rows=Array.from({length:24},(_,i)=>({...data.blocks.rows[0],id:`22222222-2222-4222-8222-${String(i).padStart(12,'0')}`,blockNumber:`SYN-${i}`,parcelCount:i===0?9999:0}));fetchMock.mockResolvedValue(reply({data}));render(<Page/>);await screen.findByRole('heading',{name:'SYNTHETIC Mwavumbo campaign'});const next=screen.getByRole('button',{name:'Next blocks page'});const second=overview();second.blocks.total=25;second.blocks.page=2;fetchMock.mockResolvedValue(reply({data:second}));fireEvent.click(next);await waitFor(()=>expect(fetchMock.mock.calls[fetchMock.mock.calls.length-1]?.[0]).toContain('block_page=2'));expect(fetchMock.mock.calls.some(([url])=>url.includes('/scheme/parcels'))).toBe(false)
})
it('ignores an old project response after navigation',async()=>{
  let resolveFirst:((value:Reply)=>void)|undefined
  fetchMock.mockImplementationOnce(()=>new Promise<Reply>(resolve=>{resolveFirst=resolve}));const view=render(<Page/>);await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(1));activeProject='44444444-4444-4444-8444-444444444444';const newer=overview();newer.project.id=activeProject;newer.project.name='SYNTHETIC second project';fetchMock.mockResolvedValue(reply({data:newer}));view.rerender(<Page/>);await screen.findByRole('heading',{name:'SYNTHETIC second project'});await act(async()=>{resolveFirst?.(reply({data:overview()}))});expect(screen.queryByRole('heading',{name:'SYNTHETIC Mwavumbo campaign'})).not.toBeInTheDocument()
})
