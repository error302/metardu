/** @jest-environment node */
import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient, QueryResult } from 'pg'
import { AppError } from '@/lib/api/errors'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth/session'
import { mr } from '@/test-utils/mock-rows'
import { GET, POST, PATCH, DELETE } from '../route'
import { GET as history, POST as record } from '../[id]/calibration/route'

jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/auth/session', () => ({ getAuthUser: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }))
// Actual route bodies, input validation and success serialization; authentication
// inside the shared wrapper is covered separately. Exercise its user gate here.
jest.mock('@/lib/apiHandler', () => ({ ...jest.requireActual<typeof import('@/lib/apiHandler')>('@/lib/apiHandler'),
  apiHandler: (_options: unknown, handler: (req: NextRequest, ctx: { body: unknown; userId: string; params: Record<string, string> }) => Promise<Response>) =>
    async (req: NextRequest) => {
      try { return await handler(req, { body: ['POST', 'PATCH'].includes(req.method) ? await req.json() : undefined, userId: 'owner', params: { id: 'instrument' } }) }
      catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Save failed' }, { status: error instanceof AppError ? error.statusCode : 500 }) }
    },
}))
const query = jest.mocked(db.query)
const txQuery = jest.fn<Promise<QueryResult<Record<string, unknown>>>, [string, unknown[]?]>()
const request = (method = 'GET', body?: unknown) => new NextRequest('http://127.0.0.1/api/equipment?id=instrument&include_calibration=true', { method, ...(body ? { body: JSON.stringify(body) } : {}) })
const metadata = { id: 'instrument', user_id: 'owner', name: 'SYNTHETIC station', type: 'total_station', interval_days: 180, created_at: '2026-10-01T00:00:00Z', status: 'active' }
beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-27T12:00:00Z'))
  jest.mocked(getAuthUser).mockResolvedValue({ id: 'owner' } as NonNullable<Awaited<ReturnType<typeof getAuthUser>>>)
  query.mockResolvedValue(mr([])); txQuery.mockReset()
  jest.mocked(db.transaction).mockImplementation(async callback => callback({ query: txQuery } as unknown as PoolClient))
})
afterEach(() => jest.useRealTimers())

test('an unauthenticated request cannot read or write instrument records', async () => {
  jest.mocked(getAuthUser).mockResolvedValue(null)
  expect((await GET(request(), {})).status).toBe(401)
  expect((await POST(request('POST', {}), {})).status).toBe(401)
  expect(query).not.toHaveBeenCalled()
})
test('the real top-level success response carries unrecorded and failed states', async () => {
  query.mockResolvedValueOnce(mr([{ ...metadata, last_calibrated: null, next_calibration: null, calibration_result: null }, { ...metadata, id: 'failed', last_calibrated: '2026-10-01', next_calibration: '2027-04-01', calibration_result: 'fail' }]))
  const response = await GET(request(), {})
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toMatchObject({ equipment: [{ calibration_status: 'never', days_until_expiry: null }, { calibration_status: 'failed', days_until_expiry: null }] })
  expect(query.mock.calls[0][1]).toEqual(['owner', 'active'])
  expect(query.mock.calls[0][0]).toContain('created_at DESC, id DESC')
})
test('registration rejects an unretained calibration date rather than pretending to save it', async () => {
  expect((await POST(request('POST', { name: 'Station', type: 'total_station', lastCalibrationDate: '2026-10-01' }), {})).status).toBe(400)
  expect(query).not.toHaveBeenCalled()
})
test('editing a name leaves the adopted interval untouched', async () => {
  query.mockResolvedValueOnce(mr([metadata]))
  expect((await PATCH(request('PATCH', { name: 'Renamed' }), {})).status).toBe(200)
  expect(query.mock.calls[0][0]).not.toContain('interval_days =')
})
test('archiving uses an owner-bound metadata update without deleting calibration history', async () => {
  query.mockResolvedValueOnce(mr([{ ...metadata, status: 'inactive' }]))
  expect((await PATCH(request('PATCH', { status: 'inactive' }), {})).status).toBe(200)
  expect(query.mock.calls[0][0]).toMatch(/^UPDATE equipment SET status = \$1/)
  expect(query.mock.calls[0][1]).toEqual(['inactive', 'instrument', 'owner'])
})
test('the legacy deletion endpoint archives the owned instrument and retains history', async () => {
  query.mockResolvedValueOnce(mr([{ id: 'instrument' }]))
  const response = await DELETE(request('DELETE'), {})
  expect(await response.json()).toMatchObject({ id: 'instrument', archived: true })
  expect(query.mock.calls[0][0]).toMatch(/^UPDATE equipment SET status = 'inactive'/)
  expect(query.mock.calls[0][1]).toEqual(['instrument', 'owner'])
})
test.each([{ calibrationDate: '2026-02-30', results: 'pass' }, { calibrationDate: '2026-10-01' }, { calibrationDate: '2026-10-01', results: 'pass', nextCalibrationDate: '2026-09-30' }])('invalid evidence %p is rejected before any calibration write', async body => {
  expect((await record(request('POST', body), {})).status).toBe(400)
  expect(db.transaction).not.toHaveBeenCalled()
})
test('a failed calibration uses the adopted interval from its observed date and retains a review notification atomically', async () => {
  txQuery.mockResolvedValueOnce(mr([metadata])).mockResolvedValueOnce(mr([{ id: 'record', equipment_id: 'instrument' }])).mockResolvedValueOnce(mr([]))
  const response = await record(request('POST', { calibrationDate: '2026-10-01', results: 'failed' }), {})
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ calibration: { id: 'record' } })
  expect(txQuery.mock.calls[1][1]?.slice(0, 4)).toEqual(['instrument', 'owner', '2026-10-01', '2027-03-30'])
  expect(txQuery.mock.calls[1][1]?.[7]).toBe('failed')
  expect(txQuery.mock.calls[2][0]).toContain('Review instrument calibration')
  expect(txQuery.mock.calls[2][0]).not.toContain(' + ')
  expect(db.transaction).toHaveBeenCalledTimes(1)
})
test('a retained due date supplied by the record takes precedence over the instrument interval', async () => {
  txQuery.mockResolvedValueOnce(mr([metadata])).mockResolvedValueOnce(mr([{ id: 'record', equipment_id: 'instrument' }]))
  expect((await record(request('POST', { calibrationDate: '2026-10-01', nextCalibrationDate: '2027-04-07', results: 'pass' }), {})).status).toBe(200)
  expect(txQuery.mock.calls[1][1]?.[3]).toBe('2027-04-07')
})
test('an unowned instrument cannot acquire a calibration record', async () => {
  txQuery.mockResolvedValueOnce(mr([]))
  expect((await record(request('POST', { calibrationDate: '2026-10-01', results: 'pass' }), {})).status).toBe(404)
  expect(txQuery).toHaveBeenCalledTimes(1)
})
test('a notification failure cannot return a successful calibration acknowledgement', async () => {
  txQuery.mockResolvedValueOnce(mr([metadata])).mockResolvedValueOnce(mr([{ id: 'record' }])).mockRejectedValueOnce(new Error('synthetic write failure'))
  expect((await record(request('POST', { calibrationDate: '2026-10-01', results: 'failed' }), {})).status).toBe(500)
})
test('historical unknown outcomes are shown as needing review', async () => {
  query.mockResolvedValueOnce(mr([{ id: 'instrument' }])).mockResolvedValueOnce(mr([{ id: 'record', calibration_date: '2026-10-01', next_calibration_date: '2027-04-01', results: null }]))
  const response = await history(request(), {})
  expect(await response.json()).toMatchObject({ currentStatus: 'review_required', daysUntilExpiry: null })
})
