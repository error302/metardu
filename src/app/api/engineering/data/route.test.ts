/** @jest-environment node */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { GET, POST } from './route'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/security/rateLimit', () => ({ getOperationRateLimitIdentifier: () => 'synthetic', rateLimit: jest.fn(async () => ({ allowed: true, remaining: 59 })) }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() }, auditLog: jest.fn() }))
jest.mock('@/lib/monitoring/sentry', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/monitoring/metrics', () => ({ routeHitsTotal: { inc: jest.fn() } }))
jest.mock('@/lib/monitoring/middleware-tracker', () => ({ normalizePath: (value: string) => value }))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() }, setCurrentUserId: jest.fn(), setCurrentOrgId: jest.fn() }))

const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const project = 'a3b3c3d3-3333-4333-8333-333333333333'
const recordId = '44444444-4444-4444-8444-444444444444'
let projectOwner: string | null | undefined
let member: string | null
let stored: Record<string, unknown> | null
let suppressWrite: boolean
let ownerAfterPrecheck: string | undefined
const query = jest.fn(async (sql: string, params: unknown[] = []) => {
  if (/AS project_owner/.test(sql)) {
    if (ownerAfterPrecheck) projectOwner = ownerAfterPrecheck
    return { rows: projectOwner === undefined ? [] : [{ project_owner: projectOwner, payload: projectOwner === params[1] ? stored : null }] }
  }
  if (/FROM projects/.test(sql)) return { rows: projectOwner === undefined ? [] : [{ user_id: projectOwner, organization_id: null }] }
  if (/FROM project_members/.test(sql)) return { rows: params[0] === member ? [{ role: 'viewer' }] : [] }
  if (/SELECT[\s\S]*FROM engineering_survey_data/.test(sql)) return { rows: stored ? [stored] : [] }
  if (/INSERT INTO engineering_survey_data/.test(sql)) {
    if (suppressWrite) return { rows: [] }
    stored = { id: recordId, project_id: params[0], subtype: params[1], data: JSON.parse(String(params[2])) as unknown, updated_at: 'after' }
    return { rows: [stored] }
  }
  return { rows: [] }
})
const client = { query }
const request = (method = 'GET', body?: unknown, queryProject = project) => new NextRequest(`http://127.0.0.1/api/engineering/data?projectId=${queryProject}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const payload = () => ({ projectId: project, subtype: 'road', data: { rl: 0, unknownHeight: null, source: ['original'] } })

beforeEach(() => {
  jest.clearAllMocks(); projectOwner = owner; member = null; suppressWrite = false; ownerAfterPrecheck = undefined
  stored = { id: recordId, project_id: project, subtype: 'retained', data: { rl: 123 }, updated_at: 'before' }
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: owner }, expires: '2099-01-01' })
  jest.mocked(db.query).mockImplementation(query as unknown as typeof db.query)
  jest.mocked(db.transaction).mockImplementation(async callback => {
    if (ownerAfterPrecheck) projectOwner = ownerAfterPrecheck
    const before = stored
    try { return await callback(client as unknown as import('pg').PoolClient) }
    catch (error) { stored = before; throw error }
  })
})

test('anonymous reads and writes remain unauthenticated before engineering SQL', async () => {
  jest.mocked(getServerSession).mockResolvedValue(null)
  expect((await GET(request())).status).toBe(401)
  expect((await POST(request('POST', payload()))).status).toBe(401)
  expect(query).not.toHaveBeenCalled()
})

test('another authenticated user cannot read the selected project data', async () => {
  projectOwner = other
  expect((await GET(request())).status).toBe(403)
  expect(query.mock.calls.some(([sql]) => /FROM engineering_survey_data/.test(sql))).toBe(false)
})

test('another authenticated user cannot overwrite the selected project payload', async () => {
  projectOwner = other
  const before = stored
  expect((await POST(request('POST', payload()))).status).toBe(403)
  expect(stored).toEqual(before)
  expect(query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toBe(false)
})

test.each([null, undefined])('unassigned or missing project owner %s cannot expose payloads', async value => {
  projectOwner = value
  const status = value === null ? 403 : 404
  expect((await GET(request())).status).toBe(status)
  expect((await POST(request('POST', payload()))).status).toBe(status)
  expect(query.mock.calls.some(([sql]) => /engineering_survey_data/.test(sql))).toBe(false)
})

test('authorized project viewers can read but cannot write', async () => {
  projectOwner = other; member = owner
  expect((await GET(request())).status).toBe(200)
  expect((await POST(request('POST', payload()))).status).toBe(403)
})

test('owner reads remain private and uncached', async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toMatchObject({ data: stored })
})

test('accepted owner save retains zero/null/arrays and confirms exactly one saved row', async () => {
  const response = await POST(request('POST', payload()))
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toMatchObject({ data: { project_id: project, subtype: 'road', data: payload().data } })
})

test('silently suppressed inserts cannot return false success', async () => {
  suppressWrite = true
  const before = stored
  expect((await POST(request('POST', payload()))).status).toBe(500)
  expect(stored).toEqual(before)
})

test.each(['GET', 'POST'])('ownership changed after the initial %s admission blocks data access', async method => {
  ownerAfterPrecheck = other
  const before = stored
  const response = method === 'GET' ? await GET(request()) : await POST(request('POST', payload()))
  expect(response.status).toBe(403)
  expect(stored).toEqual(before)
  if (method === 'POST') expect(query.mock.calls.some(([sql]) => /engineering_survey_data/.test(sql))).toBe(false)
})

test.each(['', 'not-a-uuid'])('invalid project identifier %s is rejected before project SQL', async id => {
  expect((await GET(request('GET', undefined, id))).status).toBe(400)
  expect((await POST(request('POST', { ...payload(), projectId: id }))).status).toBe(400)
  // The real wrapper may resolve the caller's organization before route validation.
  expect(query.mock.calls.some(([sql]) => /FROM projects|engineering_survey_data/.test(sql))).toBe(false)
})

test('JSON numeric overflow cannot silently become a stored null', async () => {
  const response = await POST(new NextRequest('http://127.0.0.1/api/engineering/data', { method: 'POST', body: `{"projectId":"${project}","subtype":"road","data":{"rl":1e400}}` }))
  expect(response.status).toBe(400)
  expect(query.mock.calls.some(([sql]) => /INSERT/.test(sql))).toBe(false)
})

test('an authorized project with no payload returns explicit uncached null', async () => {
  stored = null
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ data: null })
})

test('uppercase UUID input refers to the same canonical project', async () => {
  const response = await POST(request('POST', { ...payload(), projectId: project.toUpperCase() }))
  expect(response.status).toBe(200)
})
