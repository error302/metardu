/** @jest-environment node */
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { GET, POST } from '../route'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn().mockResolvedValue(null) }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(db.query).mockRejectedValue(new Error('Synthetic database unavailable'))
})

test.each(['', '?county=Kajiado&jobType=BOUNDARY_SURVEY&q=beacons'])('the retired board never fabricates listings or reads stored jobs (%s)', async search => {
  const response = await GET(new NextRequest('http://127.0.0.1/api/community/jobs' + search))
  expect(response.status).toBe(410)
  expect(await response.json()).toEqual({
    error: 'The survey job board is no longer available. The marketplace lists surveying instruments.',
    code: 'COMMUNITY_JOBS_RETIRED',
    instrumentMarketplace: '/marketplace',
  })
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(db.query).not.toHaveBeenCalled()
})

test.each([
  JSON.stringify({ title: 'SYNTHETIC subdivision', county: 'Kajiado', postedBy: 'another-user' }),
  '{invalid-json',
  '',
])('retired posting returns no save acknowledgment and cannot write records (%s)', async body => {
  const response = await POST(new NextRequest('http://127.0.0.1/api/community/jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  }))
  expect(response.status).toBe(410)
  const payload: unknown = await response.json()
  expect(payload).toMatchObject({ code: 'COMMUNITY_JOBS_RETIRED' })
  expect(payload).not.toHaveProperty('success')
  expect(payload).not.toHaveProperty('data')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(db.query).not.toHaveBeenCalled()
})
