/** @jest-environment node */
import {createClient} from './server'
import {getServerSession} from 'next-auth'
import {canAccessProject} from '@/lib/auth/rbac'
import {setAuthenticatedDatabaseContext,resolveAuthenticatedOrganization} from '@/lib/auth/requestContext'
import {setCurrentRlsServiceRole,setCurrentTillClaimCode} from '@/lib/db'
jest.mock('next-auth',()=>({getServerSession:jest.fn()}))
jest.mock('@/lib/auth',()=>({authOptions:{}}))
jest.mock('@/lib/db',()=>({db:{query:jest.fn()},setCurrentRlsServiceRole:jest.fn(),setCurrentTillClaimCode:jest.fn()}))
jest.mock('@/lib/auth/rbac',()=>({canAccessProject:jest.fn()}))
jest.mock('@/lib/auth/requestContext',()=>({setAuthenticatedDatabaseContext:jest.fn(),resolveAuthenticatedOrganization:jest.fn()}))
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',project='33333333-3333-4333-8333-333333333333'
beforeEach(()=>{
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({user:{id:actor,email:'synthetic@example.invalid'},expires:'2099'})
  jest.mocked(resolveAuthenticatedOrganization).mockResolvedValue(org)
})
test('project role uses the captured server identity and organization without inheriting a service capability',async()=>{
  const client=await createClient()
  jest.mocked(getServerSession).mockResolvedValue({user:{id:'44444444-4444-4444-8444-444444444444'},expires:'2099'})
  jest.mocked(canAccessProject).mockResolvedValue('project_manager')
  expect(await client.projectRole(project)).toBe('project_manager')
  expect(canAccessProject).toHaveBeenCalledWith(actor,project)
  expect(setAuthenticatedDatabaseContext).toHaveBeenLastCalledWith(actor,org)
  expect(setCurrentRlsServiceRole).toHaveBeenLastCalledWith(null)
  expect(setCurrentTillClaimCode).toHaveBeenLastCalledWith(null)
})
test('an anonymous server client never calls the project role resolver',async()=>{
  jest.mocked(getServerSession).mockResolvedValue(null)
  const client=await createClient()
  expect(await client.projectRole(project)).toBeNull()
  expect(canAccessProject).not.toHaveBeenCalled()
})
test('a revoked membership result is returned without ownership or administrator fallback',async()=>{
  const client=await createClient()
  jest.mocked(canAccessProject).mockResolvedValue(null)
  expect(await client.projectRole(project)).toBeNull()
  expect(canAccessProject).toHaveBeenCalledTimes(1)
})
