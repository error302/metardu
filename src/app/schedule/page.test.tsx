import {render,screen} from '@testing-library/react'
import SchedulePage from './page'
let mockParams=new URLSearchParams()
jest.mock('next/navigation',()=>({useSearchParams:()=>mockParams}))
jest.mock('@/components/schedule/SurveySchedulePage',()=>({
 SurveySchedulePage:({focusedJob,selectedProject,newJob}:{focusedJob:string|null;selectedProject:string|null;newJob:boolean})=><section aria-label="Resolved survey schedule" data-job={focusedJob??''} data-project={selectedProject??''} data-new={String(newJob)}/>,
}))
beforeEach(()=>{mockParams=new URLSearchParams()})
it('retains the notified job and project preselection in the mobile-compatible route',()=>{
 mockParams=new URLSearchParams('job=notified-job&projectId=linked-project&new=1')
 render(<SchedulePage/>)
 const schedule=screen.getByRole('region',{name:'Resolved survey schedule'})
 expect(schedule).toHaveAttribute('data-job','notified-job')
 expect(schedule).toHaveAttribute('data-project','linked-project')
 expect(schedule).toHaveAttribute('data-new','true')
})
it('rejects ambiguous duplicate parameters rather than selecting a different project or job',()=>{
 mockParams=new URLSearchParams('job=first&job=other&projectId=first&projectId=other&new=1&new=0')
 render(<SchedulePage/>)
 const schedule=screen.getByRole('region',{name:'Resolved survey schedule'})
 expect(schedule).toHaveAttribute('data-job','')
 expect(schedule).toHaveAttribute('data-project','')
 expect(schedule).toHaveAttribute('data-new','false')
})
it('opens the normal schedule when no deep-link parameters are supplied',()=>{
 render(<SchedulePage/>)
 const schedule=screen.getByRole('region',{name:'Resolved survey schedule'})
 expect(schedule).toHaveAttribute('data-job','')
 expect(schedule).toHaveAttribute('data-project','')
 expect(schedule).toHaveAttribute('data-new','false')
})
