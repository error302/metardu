/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/lib/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }, auditLog: jest.fn() }))
jest.mock('@/lib/monitoring/sentry', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/monitoring/metrics', () => ({ routeHitsTotal: { inc: jest.fn() } }))
jest.mock('@/lib/audit/auditLog', () => ({ appendAuditEntry: jest.fn() }))

beforeAll(() => { delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN })
const success = async () => NextResponse.json({ saved: true })
const points = apiHandler({ auth: false, rateLimit: { max: 60, windowMs: 60000 } }, success)
const surfaces = apiHandler({ auth: false, rateLimit: { max: 2, windowMs: 60000 } }, success)
const projectA = '00000000-0000-4000-8000-000000000001'
const projectB = '00000000-0000-4000-8000-000000000002'
function request(operation: string, project = projectA, ip = '192.0.2.89', method = 'POST', query = '') {
  return new NextRequest(`http://localhost/api/project/${project}/${operation}${query}`, {
    method, headers: { 'Content-Type': 'application/json', 'x-real-ip': ip }, ...(method === 'POST' ? { body: '{}' } : {}),
  })
}

test('point entry cannot consume the heavy surface operation quota, which still blocks further recomputes', async () => {
  for (let i = 0; i < 4; i++) expect((await points(request('points'))).status).toBe(200)
  expect((await surfaces(request('surfaces'))).status).toBe(200)
  expect((await surfaces(request('surfaces', projectB))).status).toBe(200)
  expect((await surfaces(request('surfaces', projectA, '192.0.2.89', 'POST', '?different=1'))).status).toBe(429)
  expect((await surfaces(request('surfaces', projectA.replace(/^0/, '%30')))).status).toBe(429)
  expect((await surfaces(request('surfaces', projectA, '192.0.2.90'))).status).toBe(200)
  expect((await surfaces(request('surfaces', projectA, '192.0.2.89', 'GET'))).status).toBe(200)
})
