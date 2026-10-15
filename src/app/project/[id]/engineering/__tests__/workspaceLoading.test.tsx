import {render,screen,waitFor,fireEvent} from '@testing-library/react'
import type {ReactNode} from 'react'
import EngineeringWorkspacePage from '../page'
const projectId='22222222-2222-4222-8222-222222222222'
const fixtureProjectCrs='EPSG:32737'
let projectReads=0,projectFailure=false
let mockReferenceRecord:Record<string,unknown>|null=null
interface Builder {select:()=>Builder;eq:()=>Builder;single:()=>Promise<{data:Record<string,unknown>|null;error:{message:string}|null}>;limit:()=>Promise<{data:Record<string,unknown>[];error:null}>}
const mockCreateClient=jest.fn(()=>({from:(table:string)=>{
  const query:Builder={select:()=>query,eq:()=>query,
    single:async()=>{
      if(table==='projects'){
        projectReads++
        if(projectFailure)return{data:null,error:{message:'Temporary network failure'}}
        if(projectReads>3)return new Promise(()=>{})
        return{data:{id:projectId,user_id:'owner',name:'Synthetic project',survey_type:'engineering'},error:null}
      }
      return{data:null,error:null}
    },limit:async()=>({data:[],error:null})}
  return query
}}))
jest.mock('@/lib/api-client/client',()=>({createClient:()=>mockCreateClient()}))
jest.mock('next/navigation',()=>({useParams:()=>({id:projectId}),useRouter:()=>({push:jest.fn()}),useSearchParams:()=>new URLSearchParams()}))
jest.mock('@/lib/api/client',()=>({apiGet:jest.fn(async(url:string)=>url.includes('/reference-system')?{referenceSystem:mockReferenceRecord}:{data:null}),apiPost:jest.fn()}))
jest.mock('@/components/MobileDesktopNotice',()=>({__esModule:true,default:({children}:{children:ReactNode})=><>{children}</>}))
jest.mock('../steps/renderStepContent',()=>({renderStepContent:(_step:unknown,project:{projectReferenceSystem?:{code:string;verticalDatum:string}})=><><p>Workspace ready</p><p>Reference: {project.projectReferenceSystem?.code} / {project.projectReferenceSystem?.verticalDatum}</p></>}))
jest.mock('../QuickComputeTab',()=>({QuickComputeTab:()=>null}))
beforeEach(()=>{projectReads=0;projectFailure=false;mockReferenceRecord=null;mockCreateClient.mockClear()})
it('finishes loading without creating a new client and refetching on each state update',async()=>{
  render(<EngineeringWorkspacePage />)
  await waitFor(()=>expect(screen.getByText('Workspace ready')).toBeInTheDocument(),{timeout:2000})
  expect(projectReads).toBe(1)
  expect(mockCreateClient).toHaveBeenCalledTimes(1)
})
it('offers retry on a transient project load failure instead of claiming the project is missing',async()=>{
  projectFailure=true;render(<EngineeringWorkspacePage />)
  expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i)
  expect(screen.queryByText('Project not found')).not.toBeInTheDocument()
  projectFailure=false;fireEvent.click(screen.getByRole('button',{name:'Retry project load'}))
  expect(await screen.findByText('Workspace ready')).toBeInTheDocument()
})
it('loads the declared reference through its dedicated API rather than the forbidden table proxy',async()=>{
  const code=fixtureProjectCrs
  mockReferenceRecord={prs:{horizontalCrs:code,horizontalName:'WGS84 UTM 37S',datum:'WGS84',units:'metres',zone:37,hemisphere:'S',verticalDatum:'Synthetic BM',verticalReference:'local',distanceMode:'grid',coordinatePrecision:3}}
  render(<EngineeringWorkspacePage />)
  expect(await screen.findByText(`Reference: ${code} / Synthetic BM`)).toBeInTheDocument()
})
