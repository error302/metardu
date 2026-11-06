import {render,screen} from '@testing-library/react'
import Page from '@/app/project/[id]/workspace/page'
import type {RoomRole} from '@/lib/realtime/collaborationProtocol'
const actor='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222'
let mockRole:RoomRole|null='surveyor',mockUser:{id:string}|null={id:actor},mockOwner:string|null='33333333-3333-4333-8333-333333333333'
const mockFilters:unknown[][]=[],mockAccess=jest.fn(),mockFrom=jest.fn()
jest.mock('next/navigation',()=>({redirect:(target:string)=>{throw new Error(`redirect:${target}`)}}))
jest.mock('@/lib/auth/session',()=>({getAuthUser:async()=>mockUser,isPlatformAdmin:async()=>false}))
jest.mock('@/lib/api-client/server',()=>({createClient:async()=>({
  projectRole:async(id:string)=>{mockAccess(id);return mockRole},
  from:(table:string)=>{
    mockFrom(table)
    let ownerFilter=false
    const query={select:()=>query,eq:(column:string,value:unknown)=>{mockFilters.push([column,value]);if(column==='user_id')ownerFilter=true;return query},
      single:async()=>({data:ownerFilter?null:{id:project,user_id:mockOwner,name:'Shared synthetic terrain',survey_type:'topographic',project_type:'standard',workflow_step:1,workflow_max_unlocked:1},error:null}),
      limit:async()=>({data:[],error:null})}
    return query
  }} )}))
jest.mock('@/app/project/[id]/ProjectWorkspaceClient',()=>({__esModule:true,default:({project:record}:{project:{name:string}})=><h1>{record.name}</h1>}))
const open=()=>Page({params:Promise.resolve({id:project}),searchParams:Promise.resolve({})})
beforeEach(()=>{jest.clearAllMocks();mockFilters.length=0;mockRole='surveyor';mockUser={id:actor};mockOwner='33333333-3333-4333-8333-333333333333'})
test.each(['surveyor','project_manager','viewer'] as const)('%s can open an authorized shared workspace without creator filtering',async(role)=>{
  mockRole=role
  render(await open())
  expect(screen.getByRole('heading',{name:'Shared synthetic terrain'})).toBeInTheDocument()
  expect(mockAccess).toHaveBeenCalledWith(project)
  expect(mockFilters.some(([column])=>column==='user_id')).toBe(false)
})
test('an unrelated or removed member is rejected before project contents are queried',async()=>{
  mockRole=null
  await expect(open()).rejects.toThrow('redirect:/dashboard')
  expect(mockFrom).not.toHaveBeenCalled()
})
test('an unassigned legacy project stays unavailable even after a misleading role result',async()=>{
  mockOwner=null
  await expect(open()).rejects.toThrow('redirect:/dashboard')
})
test('sign-in is required before role or content reads',async()=>{
  mockUser=null
  await expect(open()).rejects.toThrow('redirect:/login')
  expect(mockAccess).not.toHaveBeenCalled();expect(mockFrom).not.toHaveBeenCalled()
})
