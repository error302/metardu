/** @jest-environment jsdom */
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import ProjectSettings from '@/app/project/[id]/settings/page'

const mockUpdate=jest.fn()
const mockLoad=jest.fn()
const mockRouter={push:jest.fn()}
jest.mock('next/navigation',()=>({useParams:()=>({id:'fictional'}),useRouter:()=>mockRouter}))
jest.mock('@/components/ui/UTMZonePicker',()=>({__esModule:true,default:()=>null}))
jest.mock('@/lib/api-client/client',()=>({createClient:()=>({from:()=>({
 select:()=>({eq:()=>({single:mockLoad})}),
 update:(value:unknown)=>{mockUpdate(value);return {eq:async()=>({error:null})}}
})})}))

test('settings preserve absent measurements and existing traverse evidence without repeated reloads',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
 mockLoad.mockResolvedValue({data:{name:'Fictional',survey_type:'cadastral',traverse:{linearError:null,source:'independent-observations'},start_chainage:null},error:null})
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host)
 await act(async()=>root.render(<ProjectSettings/>))
 expect(mockLoad).toHaveBeenCalledTimes(1)
 expect((host.querySelector('#surveyType') as HTMLSelectElement).value).toBe('cadastral')
 expect((host.querySelector('#linearError') as HTMLInputElement).value).toBe('')
 expect(host.textContent).not.toContain('FIRST ORDER')
 const save=Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Save Changes')!
 await act(async()=>save.click())
 expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({traverse:{linearError:null,source:'independent-observations'},start_chainage:null}))
 expect(mockLoad).toHaveBeenCalledTimes(1)
 await act(async()=>root.unmount());host.remove()
})
