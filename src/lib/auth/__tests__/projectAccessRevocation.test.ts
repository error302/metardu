/** @jest-environment node */
import {db} from '@/lib/db'
import {canAccessProject} from '../rbac'
jest.mock('@/lib/db',()=>({db:{query:jest.fn()}}))
const query=jest.mocked(db.query)
const response=(rows:Array<Record<string,unknown>>)=>({rows,rowCount:rows.length,command:'SELECT',oid:0,fields:[]})
beforeEach(()=>query.mockReset())
test('a firm creator demoted to viewer gets the current role, never owner authority',async()=>{
  query.mockResolvedValueOnce(response([{user_id:'creator',organization_id:'firm'}]))
    .mockResolvedValueOnce(response([{role:'viewer'}]))
  expect(await canAccessProject('creator','project')).toBe('viewer')
})
test('removed firm membership cannot fall back to creator or legacy project membership',async()=>{
  query.mockResolvedValueOnce(response([{user_id:'creator',organization_id:'firm'}]))
    .mockResolvedValueOnce(response([]))
  expect(await canAccessProject('creator','project')).toBeNull()
  expect(query).toHaveBeenCalledTimes(2)
})
test('unknown firm role fails closed without legacy fallback',async()=>{
  query.mockResolvedValueOnce(response([{user_id:'creator',organization_id:'firm'}]))
    .mockResolvedValueOnce(response([{role:'invented-admin'}]))
  expect(await canAccessProject('member','project')).toBeNull()
  expect(query).toHaveBeenCalledTimes(2)
})
test('personal ownership is retained and a recognized personal member retains its exact role',async()=>{
  query.mockResolvedValueOnce(response([{user_id:'owner',organization_id:null}]))
  expect(await canAccessProject('owner','project')).toBe('owner')
  query.mockResolvedValueOnce(response([{user_id:'owner',organization_id:null}]))
    .mockResolvedValueOnce(response([{role:'surveyor'}]))
  expect(await canAccessProject('crew','project')).toBe('surveyor')
})
test('unassigned legacy projects and missing actors cannot acquire access from membership',async()=>{
  query.mockResolvedValueOnce(response([{user_id:null,organization_id:null}]))
  expect(await canAccessProject('crew','legacy')).toBeNull()
  expect(query).toHaveBeenCalledTimes(1)
  expect(await canAccessProject('','project')).toBeNull()
  expect(query).toHaveBeenCalledTimes(1)
})
test.each(['owner','invented-admin',''])('unknown personal membership %s grants nothing',async role=>{
  query.mockResolvedValueOnce(response([{user_id:'owner',organization_id:null}]))
    .mockResolvedValueOnce(response([{role}]))
  expect(await canAccessProject('crew','project')).toBeNull()
})
