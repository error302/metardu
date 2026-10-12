/** @jest-environment node */
import { db } from '@/lib/db'
import { requireProjectOwnership, requireProjectReadAccess, requireSurveyPointOwnership, requireVersionOwnership } from '@/lib/auth/ownership'
jest.mock('@/lib/db',()=>({db:{query:jest.fn()}}))
const query=jest.mocked(db.query)
const checks=[requireProjectOwnership,requireSurveyPointOwnership,requireVersionOwnership]
beforeEach(()=>{query.mockReset().mockResolvedValue({rows:[{user_id:'alice'}]} as never)})
test.each(checks)('ownership lookup refuses a missing authenticated actor (%p)',async check=>{
  const result=await check('synthetic-id',undefined)
  expect(result.ok).toBe(false)
  expect(result.error?.status).toBe(403)
})
test.each(checks)('ownership lookup refuses an unassigned legacy record (%p)',async check=>{
  query.mockResolvedValue({rows:[{user_id:null}]} as never)
  const result=await check('synthetic-id','alice')
  expect(result.ok).toBe(false)
  expect(result.error?.status).toBe(403)
})
test('a project read cannot bypass missing ownership',async()=>{
  query.mockResolvedValue({rows:[{user_id:null}]} as never)
  const result=await requireProjectReadAccess('synthetic-id','alice')
  expect(result.ok).toBe(false)
  expect(query).toHaveBeenCalledTimes(1)
})
