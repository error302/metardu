import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SurveySchedulePage } from './SurveySchedulePage'
import { apiGet,apiPost,apiPatch } from '@/lib/api/client'
const mockPush=jest.fn(),mockReplace=jest.fn()
jest.mock('next/navigation',()=>({useRouter:()=>({push:mockPush,replace:mockReplace})}))
jest.mock('next-auth/react',()=>({useSession:()=>({data:{user:{id:'owner'}},status:'authenticated'})}))
jest.mock('@/lib/api/client',()=>({apiGet:jest.fn(),apiPost:jest.fn(),apiPatch:jest.fn()}))
jest.mock('@/components/notifications/SurveyPushSettings',()=>({SurveyPushSettings:()=> <section aria-label="Phone reminder settings"/>}))
const projectId='22222222-2222-4222-8222-222222222222',id='11111111-1111-4111-8111-111111111111'
const project={id:projectId,name:'Mwavumbo subdivision',location:'Kwale',survey_type:'cadastral',can_collect:true}
const job={id,project_id:projectId,project_name:project.name,title:'Boundary pickup',notes:'Bring control brief',location:'Kwale',starts_at:'2027-01-03T06:00:00.000Z',time_zone:'Africa/Nairobi',duration_minutes:120,reminder_minutes:[60],status:'upcoming',version:1,created_at:'2026-10-29T10:00:00.000Z',updated_at:'2026-10-29T10:00:00.000Z',can_collect:true}
beforeEach(()=>{
 jest.clearAllMocks()
 jest.mocked(apiGet).mockImplementation(async url=>url.startsWith('/api/schedules/projects')?{projects:[project],hasMore:false}:url==='/api/schedules/'+id?{schedule:job}:{schedules:[job],hasMore:false})
 jest.mocked(apiPost).mockResolvedValue({schedule:job})
 jest.mocked(apiPatch).mockResolvedValue({schedule:{...job,status:'in_progress',version:2}})
 Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=>id})
})
it('opens the exact notified job and starts collection only after the server confirms the change',async()=>{
 render(<SurveySchedulePage focusedJob={id} selectedProject={null} newJob={false}/>)
 const collect=await screen.findByRole('button',{name:'Start field collection'})
 expect(screen.getByRole('link',{name:'Open project'})).toHaveAttribute('href','/project/'+projectId)
 expect(screen.getByText(/09:00/)).toBeInTheDocument()
 fireEvent.click(collect)
 await waitFor(()=>expect(mockPush).toHaveBeenCalledWith('/field/collect?projectId='+projectId))
 expect(apiPatch).toHaveBeenCalledWith('/api/schedules/'+id,expect.anything(),{version:1,status:'in_progress'})
})
it('keeps an unsuccessful collection start on the job and shows the error',async()=>{
 jest.mocked(apiPatch).mockRejectedValue(new Error('Project role changed'))
 render(<SurveySchedulePage focusedJob={id} selectedProject={null} newJob={false}/>)
 fireEvent.click(await screen.findByRole('button',{name:'Start field collection'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Project role changed')
 expect(mockPush).not.toHaveBeenCalled()
})
it('uses an in-page labelled form and retains the linked project in the saved request',async()=>{
 render(<SurveySchedulePage focusedJob={null} selectedProject={projectId} newJob/>)
 const select=await screen.findByLabelText('Survey project')
 await waitFor(()=>expect(select).toHaveValue(projectId))
 fireEvent.change(screen.getByLabelText('Job title'),{target:{value:'Boundary pickup'}})
 fireEvent.change(screen.getByLabelText('Start date and time'),{target:{value:'2027-01-03T09:00'}})
 await waitFor(()=>expect(screen.getByRole('button',{name:'Schedule survey'})).toBeEnabled())
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 fireEvent.submit(screen.getByRole('form',{name:'Schedule survey job'}))
 await waitFor(()=>expect(apiPost).toHaveBeenCalledWith('/api/schedules',expect.anything(),expect.objectContaining({request_id:id,project_id:projectId,title:'Boundary pickup'})))
 expect(await screen.findByRole('status')).toHaveTextContent('Survey saved')
 expect(mockReplace).toHaveBeenCalledWith('/schedule?job='+id,{scroll:false})
})
it('does not expose field collection for a viewer or a deleted project',async()=>{
 jest.mocked(apiGet).mockResolvedValue({schedules:[{...job,project_name:null,project_id:null,can_collect:false}],hasMore:false})
 render(<SurveySchedulePage focusedJob={null} selectedProject={null} newJob={false}/>)
 expect(await screen.findByText('Project access is unavailable')).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Start field collection'})).not.toBeInTheDocument()
 expect(screen.queryByRole('link',{name:'Open project'})).not.toBeInTheDocument()
})
