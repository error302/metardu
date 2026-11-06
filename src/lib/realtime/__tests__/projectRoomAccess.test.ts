jest.mock('@/lib/auth/ownership',()=>({requireProjectReadAccess:jest.fn()}))
jest.mock('@/lib/auth/rbac',()=>({canAccessProject:jest.fn()}))
import {requireProjectReadAccess} from '@/lib/auth/ownership'
import {canAccessProject} from '@/lib/auth/rbac'
import {resolveProjectRoomAccess} from '../projectRoomAccess'

const read=jest.mocked(requireProjectReadAccess)
const role=jest.mocked(canAccessProject)
beforeEach(()=>{jest.resetAllMocks()})

describe('project room access uses authoritative access and known roles',()=>{
  test('owner access comes from the recorded project owner',async()=>{
    read.mockResolvedValue({ok:true,projectUserId:'owner'})
    role.mockResolvedValue('owner')
    expect(await resolveProjectRoomAccess('owner','project')).toBe('owner')
    expect(role).toHaveBeenCalledWith('owner','project')
  })
  test('a member is resolved through canonical RBAC',async()=>{
    read.mockResolvedValue({ok:true,projectUserId:'owner'})
    role.mockResolvedValue('surveyor')
    expect(await resolveProjectRoomAccess('crew','project')).toBe('surveyor')
    expect(role).toHaveBeenCalledWith('crew','project')
  })
  test('viewer can join read-only',async()=>{
    read.mockResolvedValue({ok:true,projectUserId:'owner'})
    role.mockResolvedValue('viewer')
    expect(await resolveProjectRoomAccess('viewer','project')).toBe('viewer')
  })
  test('denied read access cannot be bypassed by a legacy membership',async()=>{
    read.mockResolvedValue({ok:false,projectUserId:'owner'})
    expect(await resolveProjectRoomAccess('unrelated','project')).toBeNull()
    expect(role).not.toHaveBeenCalled()
  })
  test('unassigned legacy parent fails closed even with inconsistent read result',async()=>{
    read.mockResolvedValue({ok:true,projectUserId:null})
    expect(await resolveProjectRoomAccess('crew','legacy')).toBeNull()
    expect(role).not.toHaveBeenCalled()
  })
  test.each([null,'unknown-admin','owner'])('unrecognized or inconsistent membership %p cannot join',async value=>{
    read.mockResolvedValue({ok:true,projectUserId:'real-owner'})
    role.mockResolvedValue(value as Awaited<ReturnType<typeof canAccessProject>>)
    expect(await resolveProjectRoomAccess('crew','project')).toBeNull()
  })
  test('missing identity does not trigger project lookup',async()=>{
    expect(await resolveProjectRoomAccess('','project')).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })
})


test.each(['viewer',null] as const)('recorded firm creator follows current canonical role %p',async currentRole=>{
  read.mockResolvedValue({ok:true,projectUserId:'creator'})
  role.mockResolvedValue(currentRole)
  expect(await resolveProjectRoomAccess('creator','firm-project')).toBe(currentRole)
})
