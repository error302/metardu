/** @jest-environment node */
import { NextRequest, type NextResponse } from 'next/server'
const mockQuery = jest.fn<Promise<{rows:{id:string}[];rowCount:number}>,unknown[]>().mockResolvedValue({ rows: [{ id: 'synthetic' }], rowCount: 1 })
jest.mock('@/lib/db', () => ({ db: { query: (...args: unknown[]) => mockQuery(...args) }, setCurrentRlsServiceRole: jest.fn(), setCurrentTillClaimCode: jest.fn() }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn(async () => ({ user: { id: '11111111-1111-4111-8111-111111111111', email: 'synthetic@example.invalid' } })) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/auth/requestContext', () => ({ setAuthenticatedDatabaseContext: jest.fn(), resolveAuthenticatedOrganization: jest.fn(async () => null) }))
jest.mock('@/lib/security/projectAccess', () => ({ checkProjectAccess: jest.fn(async () => ({ allowed: true })) }))
jest.mock('@/lib/env', () => ({ env: { ADMIN_EMAILS: '' } }))
jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: (req: NextRequest, ctx: { body: unknown }) => Promise<NextResponse>) => async (req: NextRequest) => handler(req, { body: await req.json() as unknown }) }))
import { POST } from '@/app/api/db/route'
const request = (table: string, operation: string, payload: unknown) => new NextRequest('http://127.0.0.1/api/db', { method: 'POST', body: JSON.stringify({ table, operation, payload, onConflict: 'id', filters: [{ op: 'eq', column: 'id', value: '22222222-2222-4222-8222-222222222222' }] }) })
beforeEach(() => mockQuery.mockClear())
test.each(['update', 'upsert'])('project %s cannot bypass reference declaration with protected columns', async operation => {
  expect((await POST(request('projects', operation, { name: 'Synthetic', datum: 'ARC1960', utm_zone: 37, hemisphere: 'S' }))).status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})
test('batch upsert checks every row for protected reference columns', async () => {
  expect((await POST(request('projects', 'upsert', [{ name: 'A' }, { name: 'B', datum: null }]))).status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})
test.each(['insert', 'update', 'upsert', 'delete'])('subscription %s cannot grant or remove entitlement through the generic proxy', async operation => {
  expect((await POST(request('user_subscriptions', operation, { plan_id: 'pro', status: 'active' }))).status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})
test.each(['projects', 'user_subscriptions'])('%s reads remain available to the owner', async table => {
  expect((await POST(request(table, 'select', null))).status).toBe(200)
  expect(mockQuery).toHaveBeenCalled()
})
test('workflow progress writes remain available without reference changes', async () => {
  expect((await POST(request('projects', 'update', { workflow_step: 2, workflow_max_unlocked: 2 }))).status).toBe(200)
  expect(mockQuery).toHaveBeenCalled()
})

test('generic boundary replacement cannot bypass versioned map saves', async () => {
  const response=await POST(request('projects','update',{boundary_data:{drawnFeatures:{type:'FeatureCollection',features:[]}}}))
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({error:{code:'MAP_DRAWING_VERSION_REQUIRED'}})
  expect(mockQuery).not.toHaveBeenCalled()
})

test.each(['insert', 'upsert'])('generic project %s cannot bypass quota-checked creation', async operation => {
  expect((await POST(request('projects', operation, { name: 'Synthetic bypass' }))).status).toBe(403)
  expect(mockQuery).not.toHaveBeenCalled()
})

const engineering = { mode: 'drainage', standard: 'KRDM2017' }
const engineeringRequest = (filters: unknown[], extra: Record<string, unknown> = {}) => new NextRequest('http://127.0.0.1/api/db', { method: 'POST', body: JSON.stringify({ table:'projects',operation:'update',payload:{engineering_data:engineering},filters,...extra }) })
const projectFilter = { op:'eq',column:'id',value:'22222222-2222-4222-8222-222222222222' }
test.each([
  [projectFilter],
  [projectFilter,{op:'contains',column:'engineering_data',value:{}}],
  [projectFilter,{op:'is',column:'engineering_data',value:false}],
  [{op:'eq',column:'engineering_data',value:engineering}],
].map(filters=>({filters})))('refuses an engineering replacement without an exact project and prior snapshot (%j)', async ({filters}) => {
  expect((await POST(engineeringRequest(filters))).status).toBe(409)
  expect(mockQuery).not.toHaveBeenCalled()
})
test.each([null, engineering])('uses the original engineering snapshot in the same conditional UPDATE (%j)', async prior => {
  const snapshot={op:prior===null?'is':'eq',column:'engineering_data',value:prior}
  expect((await POST(engineeringRequest([projectFilter,snapshot]))).status).toBe(200)
  expect(mockQuery).toHaveBeenCalledTimes(1)
  const [sql,params]=mockQuery.mock.calls[0] as [string,unknown[]]
  expect(sql).toMatch(prior===null?/"engineering_data" IS NULL/:/"engineering_data" = \$/)
  expect(params).toContain(projectFilter.value)
  expect(params).toContain('11111111-1111-4111-8111-111111111111')
  if(prior!==null)expect(params).toContainEqual(prior)
})
test('returns a conflict when the conditional engineering update affects no row',async()=>{
  mockQuery.mockResolvedValueOnce({rows:[],rowCount:0})
  const response=await POST(engineeringRequest([projectFilter,{op:'eq',column:'engineering_data',value:engineering}]))
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({error:{code:'ENGINEERING_CONFLICT'}})
})
test('refuses bulk, non-finite and OR-filtered engineering replacements',async()=>{
  const filters=[projectFilter,{op:'is',column:'engineering_data',value:null}]
  expect((await POST(engineeringRequest(filters,{orFilters:['id.neq.invalid']}))).status).toBe(409)
  expect((await POST(engineeringRequest(filters,{payload:[{engineering_data:engineering}]}))).status).toBe(409)
  const raw=JSON.stringify({table:'projects',operation:'update',payload:{engineering_data:{bad:'NONFINITE'}},filters}).replace('"NONFINITE"','1e400')
  expect((await POST(new NextRequest('http://127.0.0.1/api/db',{method:'POST',body:raw}))).status).toBe(409)
  expect(mockQuery).not.toHaveBeenCalled()
})
